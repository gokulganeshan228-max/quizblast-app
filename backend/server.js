/**
 * server.js — QuizBlast Backend (Express + SQLite)
 *
 * REST API that replaces the frontend's localStorage QuizDB.
 * Mirrors every operation the frontend performs so the JS client
 * can call this server instead of touching localStorage.
 *
 * Endpoints:
 *   POST   /api/quiz/create              — publish a new quiz
 *   GET    /api/quiz/:pin                — poll quiz state (used by host + player)
 *   POST   /api/quiz/:pin/join           — player joins lobby
 *   POST   /api/quiz/:pin/start          — host starts quiz (advances to Q0)
 *   POST   /api/quiz/:pin/next           — host moves to next question / finish
 *   POST   /api/quiz/:pin/answer         — player submits an answer
 *   GET    /api/quiz/:pin/leaderboard    — ranked leaderboard
 *   POST   /api/ai/generate              — proxy Gemini API (keeps key server-side)
 */

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');
const db       = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────── */
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json());

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function ok(res, data)   { res.json({ success: true,  ...data }); }
function err(res, msg, status = 400) {
  res.status(status).json({ success: false, error: msg });
}

/* ─────────────────────────────────────────
   ROUTES
───────────────────────────────────────── */

/**
 * POST /api/quiz/create
 * Body: { id, pin, title, description, questions: [{text,options,correct,time}] }
 * Creates a new quiz in the DB and returns the full quiz object.
 */
app.post('/api/quiz/create', (req, res) => {
  try {
    const { id, pin, title, description, questions } = req.body;

    if (!title?.trim())            return err(res, 'title is required');
    if (!pin || pin.length !== 6)  return err(res, 'pin must be 6 digits');
    if (!Array.isArray(questions) || questions.length === 0)
                                   return err(res, 'at least one question required');

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim())                     return err(res, `question ${i + 1} has no text`);
      if (!Array.isArray(q.options) || q.options.length !== 4)
                                               return err(res, `question ${i + 1} must have exactly 4 options`);
      if (q.options.some(o => !o?.trim()))     return err(res, `question ${i + 1} has empty option(s)`);
      if (q.correct < 0 || q.correct > 3)     return err(res, `question ${i + 1} has invalid correct index`);
    }

    const quiz = db.createQuiz({ id, pin, title, description, questions });
    ok(res, { quiz });
  } catch (e) {
    err(res, e.message, 409);
  }
});

/**
 * GET /api/quiz/:pin
 * Returns current state of the quiz (polled every 1-2 s by host and players).
 */
app.get('/api/quiz/:pin', (req, res) => {
  const quiz = db.getByPin(req.params.pin);
  if (!quiz) return err(res, 'Quiz not found', 404);
  ok(res, { quiz });
});

/**
 * POST /api/quiz/:pin/join
 * Body: { name }
 * Registers a player in the lobby.
 */
app.post('/api/quiz/:pin/join', (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return err(res, 'name is required');

    const quiz = db.getByPin(req.params.pin);
    if (!quiz)                      return err(res, 'Quiz not found', 404);
    if (quiz.status === 'finished') return err(res, 'This quiz has already ended');

    db.addParticipant(req.params.pin, name.trim());
    const updated = db.getByPin(req.params.pin);
    ok(res, { quiz: updated });
  } catch (e) {
    err(res, e.message);
  }
});

/**
 * POST /api/quiz/:pin/start
 * Host triggers quiz start — advances currentQuestion from -1 to 0.
 */
app.post('/api/quiz/:pin/start', (req, res) => {
  try {
    const quiz = db.getByPin(req.params.pin);
    if (!quiz) return err(res, 'Quiz not found', 404);
    if (quiz.status !== 'waiting') return err(res, 'Quiz already started');
    if (Object.keys(quiz.participants).length === 0)
      return err(res, 'Need at least 1 player');

    const updated = db.advanceQuestion(req.params.pin);
    ok(res, { quiz: updated });
  } catch (e) {
    err(res, e.message);
  }
});

/**
 * POST /api/quiz/:pin/next
 * Host moves to the next question or ends the quiz.
 */
app.post('/api/quiz/:pin/next', (req, res) => {
  try {
    const quiz = db.getByPin(req.params.pin);
    if (!quiz) return err(res, 'Quiz not found', 404);

    const updated = db.advanceQuestion(req.params.pin);
    ok(res, { quiz: updated });
  } catch (e) {
    err(res, e.message);
  }
});

/**
 * POST /api/quiz/:pin/answer
 * Body: { name, questionIndex, selected, timeLeft, totalTime }
 * Records a player's answer and returns { correct, points, speedBonus }.
 */
app.post('/api/quiz/:pin/answer', (req, res) => {
  try {
    const { name, questionIndex, selected, timeLeft, totalTime } = req.body;
    if (!name)                       return err(res, 'name is required');
    if (questionIndex === undefined) return err(res, 'questionIndex is required');
    if (selected === undefined)      return err(res, 'selected is required');

    const result = db.submitAnswer(
      req.params.pin,
      name,
      Number(questionIndex),
      Number(selected),
      Number(timeLeft),
      Number(totalTime),
    );

    ok(res, result);
  } catch (e) {
    err(res, e.message);
  }
});

/**
 * GET /api/quiz/:pin/leaderboard
 * Returns participants sorted by score descending.
 */
app.get('/api/quiz/:pin/leaderboard', (req, res) => {
  const leaderboard = db.getLeaderboard(req.params.pin);
  ok(res, { leaderboard });
});

/**
 * POST /api/ai/generate
 * Body: { topic, count, defaultTime }
 * Proxies request to Google Gemini so the API key never touches the browser.
 */
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { topic, count, defaultTime } = req.body;
    if (!topic?.trim()) return err(res, 'topic is required');
    if (!count || count < 1 || count > 50) return err(res, 'count must be 1–50');

    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) return err(res, 'OPENROUTER_API_KEY not set on server', 500);

    const prompt =
      `Generate exactly ${count} multiple-choice quiz questions about: "${topic}".\n` +
      `Return ONLY a valid JSON array — no markdown, no code fences, no explanation.\n` +
      `Each element: { "text":"...", "options":["A","B","C","D"], "correct":0, "time":${defaultTime || 15} }`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'QuizBlast',
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const e = await aiRes.json().catch(() => ({}));
      return err(res, e.error?.message || `OpenRouter API error ${aiRes.status}`, 502);
    }

    const data = await aiRes.json();
    const raw  = data.choices?.[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/gi, '').trim();

    let questions;
    try { questions = JSON.parse(cleaned); }
    catch { return err(res, 'AI returned invalid JSON', 502); }

    if (!Array.isArray(questions)) return err(res, 'AI response is not an array', 502);

    const validated = questions.map((q, i) => {
      if (!q.text || !Array.isArray(q.options) || q.options.length !== 4)
        throw new Error(`Question ${i + 1} invalid structure`);
      return {
        text:    String(q.text),
        options: q.options.map(String),
        correct: Number(q.correct) || 0,
        time:    Number(q.time) || defaultTime || 15,
      };
    });

    ok(res, { questions: validated });
  } catch (e) {
    err(res, e.message, 500);
  }
});

/* ─────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────── */
app.get('/api/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

/* ─────────────────────────────────────────
   START
───────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀 QuizBlast backend running at http://localhost:${PORT}`);
  console.log(`   Database : ${require('path').join(__dirname, 'quizblast.db')}`);
  console.log(`   AI proxy : POST /api/ai/generate\n`);
});