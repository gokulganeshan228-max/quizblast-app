/**
 * db.js — QuizBlast Database Layer (SQLite via better-sqlite3)
 *
 * Tables:
 *   quizzes        — quiz metadata + state
 *   questions      — questions belonging to a quiz
 *   participants   — players in a quiz session
 *   answers        — individual answer records per player per question
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'quizblast.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ─────────────────────────────────────────
   SCHEMA
───────────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS quizzes (
    id            TEXT PRIMARY KEY,
    pin           TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'waiting',  -- waiting | question | leaderboard | finished
    current_question INTEGER NOT NULL DEFAULT -1,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id       TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    text          TEXT NOT NULL,
    option_a      TEXT NOT NULL,
    option_b      TEXT NOT NULL,
    option_c      TEXT NOT NULL,
    option_d      TEXT NOT NULL,
    correct       INTEGER NOT NULL DEFAULT 0,  -- 0-3 index
    time_limit    INTEGER NOT NULL DEFAULT 15
  );

  CREATE TABLE IF NOT EXISTS participants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id       TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    score         INTEGER NOT NULL DEFAULT 0,
    joined_at     TEXT NOT NULL,
    UNIQUE(quiz_id, name)
  );

  CREATE TABLE IF NOT EXISTS answers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id       TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL,
    question_index   INTEGER NOT NULL,
    selected      INTEGER NOT NULL,
    is_correct    INTEGER NOT NULL DEFAULT 0,
    points        INTEGER NOT NULL DEFAULT 0,
    speed_bonus   INTEGER NOT NULL DEFAULT 0,
    answered_at   TEXT NOT NULL,
    UNIQUE(quiz_id, participant_name, question_index)
  );
`);

/* ─────────────────────────────────────────
   PREPARED STATEMENTS
───────────────────────────────────────── */

// ── Quizzes ──
const stmts = {
  insertQuiz: db.prepare(`
    INSERT INTO quizzes (id, pin, title, description, status, current_question, created_at)
    VALUES (@id, @pin, @title, @description, @status, @current_question, @created_at)
  `),

  getQuizByPin: db.prepare(`SELECT * FROM quizzes WHERE pin = ?`),
  getQuizById:  db.prepare(`SELECT * FROM quizzes WHERE id = ?`),

  updateQuizStatus: db.prepare(`
    UPDATE quizzes SET status = @status, current_question = @current_question WHERE pin = @pin
  `),

  // ── Questions ──
  insertQuestion: db.prepare(`
    INSERT INTO questions (quiz_id, position, text, option_a, option_b, option_c, option_d, correct, time_limit)
    VALUES (@quiz_id, @position, @text, @option_a, @option_b, @option_c, @option_d, @correct, @time_limit)
  `),

  getQuestions: db.prepare(`
    SELECT * FROM questions WHERE quiz_id = ? ORDER BY position ASC
  `),

  // ── Participants ──
  insertParticipant: db.prepare(`
    INSERT INTO participants (quiz_id, name, score, joined_at)
    VALUES (@quiz_id, @name, 0, @joined_at)
  `),

  getParticipants: db.prepare(`
    SELECT * FROM participants WHERE quiz_id = ? ORDER BY score DESC
  `),

  getParticipantByName: db.prepare(`
    SELECT * FROM participants WHERE quiz_id = ? AND name = ?
  `),

  updateParticipantScore: db.prepare(`
    UPDATE participants SET score = score + @points WHERE quiz_id = @quiz_id AND name = @name
  `),

  // ── Answers ──
  insertAnswer: db.prepare(`
    INSERT INTO answers (quiz_id, participant_name, question_index, selected, is_correct, points, speed_bonus, answered_at)
    VALUES (@quiz_id, @participant_name, @question_index, @selected, @is_correct, @points, @speed_bonus, @answered_at)
  `),

  getAnswerForQuestion: db.prepare(`
    SELECT * FROM answers WHERE quiz_id = ? AND participant_name = ? AND question_index = ?
  `),

  countAnswersForQuestion: db.prepare(`
    SELECT COUNT(*) as count FROM answers WHERE quiz_id = ? AND question_index = ?
  `),

  getAnswersByParticipant: db.prepare(`
    SELECT * FROM answers WHERE quiz_id = ? AND participant_name = ? ORDER BY question_index ASC
  `),
};

/* ─────────────────────────────────────────
   DATABASE HELPER FUNCTIONS
───────────────────────────────────────── */

/**
 * Format a quiz row + its questions + participants into the shape
 * the frontend expects (mirrors the original localStorage QuizDB object).
 */
function formatQuiz(quizRow) {
  if (!quizRow) return null;

  const questions = stmts.getQuestions.all(quizRow.id).map(q => ({
    text: q.text,
    options: [q.option_a, q.option_b, q.option_c, q.option_d],
    correct: q.correct,
    time: q.time_limit,
  }));

  const participantRows = stmts.getParticipants.all(quizRow.id);
  const participants = {};
  for (const p of participantRows) {
    const answerRows = stmts.getAnswersByParticipant.all(quizRow.id, p.name);
    const answers = [];
    for (const a of answerRows) {
      answers[a.question_index] = {
        selected:  a.selected,
        correct:   !!a.is_correct,
        points:    a.points,
      };
    }
    participants[p.name] = {
      name:    p.name,
      score:   p.score,
      answers: answers,
    };
  }

  return {
    id:              quizRow.id,
    pin:             quizRow.pin,
    title:           quizRow.title,
    description:     quizRow.description,
    status:          quizRow.status,
    currentQuestion: quizRow.current_question,
    questions,
    participants,
    createdAt:       quizRow.created_at,
  };
}

/* ─────────────────────────────────────────
   EXPORTED API
───────────────────────────────────────── */

module.exports = {

  /** Create a new quiz with its questions in one transaction */
  createQuiz(quizData) {
    const { id, pin, title, description, questions } = quizData;
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      stmts.insertQuiz.run({
        id,
        pin,
        title,
        description: description || '',
        status: 'waiting',
        current_question: -1,
        created_at: now,
      });

      questions.forEach((q, i) => {
        stmts.insertQuestion.run({
          quiz_id:    id,
          position:   i,
          text:       q.text,
          option_a:   q.options[0],
          option_b:   q.options[1],
          option_c:   q.options[2],
          option_d:   q.options[3],
          correct:    q.correct,
          time_limit: q.time || 15,
        });
      });
    });

    transaction();
    return formatQuiz(stmts.getQuizByPin.get(pin));
  },

  /** Retrieve a quiz by its 6-digit PIN */
  getByPin(pin) {
    const row = stmts.getQuizByPin.get(pin);
    return formatQuiz(row);
  },

  /** Add a participant to a quiz (throws if name taken or quiz missing) */
  addParticipant(pin, name) {
    const row = stmts.getQuizByPin.get(pin);
    if (!row) throw new Error('Quiz not found.');

    const existing = stmts.getParticipantByName.get(row.id, name);
    if (existing) throw new Error(`Name "${name}" is already taken.`);

    stmts.insertParticipant.run({
      quiz_id:   row.id,
      name,
      joined_at: new Date().toISOString(),
    });

    return formatQuiz(stmts.getQuizByPin.get(pin));
  },

  /** Advance the quiz to the next question (or mark finished) */
  advanceQuestion(pin) {
    const row = stmts.getQuizByPin.get(pin);
    if (!row) return null;

    const questions = stmts.getQuestions.all(row.id);
    const next = row.current_question + 1;

    if (next >= questions.length) {
      stmts.updateQuizStatus.run({ status: 'finished', current_question: row.current_question, pin });
    } else {
      stmts.updateQuizStatus.run({ status: 'question', current_question: next, pin });
    }

    return formatQuiz(stmts.getQuizByPin.get(pin));
  },

  /** Record an answer from a player */
  submitAnswer(pin, name, qIdx, selected, timeLeft, totalTime) {
    const row = stmts.getQuizByPin.get(pin);
    if (!row) return { correct: false, points: 0, speedBonus: 0 };

    // Prevent double-submission
    const existing = stmts.getAnswerForQuestion.get(row.id, name, qIdx);
    if (existing) return { correct: false, points: 0, speedBonus: 0 };

    const questions = stmts.getQuestions.all(row.id);
    const q = questions[qIdx];
    if (!q) return { correct: false, points: 0, speedBonus: 0 };

    const isCorrect = selected === q.correct;
    let points = 0, speedBonus = 0;

    if (isCorrect) {
      speedBonus = Math.round((timeLeft / totalTime) * 500);
      points = 1000 + speedBonus;

      stmts.updateParticipantScore.run({ points, quiz_id: row.id, name });
    }

    stmts.insertAnswer.run({
      quiz_id:          row.id,
      participant_name: name,
      question_index:   qIdx,
      selected,
      is_correct:       isCorrect ? 1 : 0,
      points,
      speed_bonus:      speedBonus,
      answered_at:      new Date().toISOString(),
    });

    return { correct: isCorrect, points, speedBonus };
  },

  /** Get sorted leaderboard for a quiz */
  getLeaderboard(pin) {
    const row = stmts.getQuizByPin.get(pin);
    if (!row) return [];

    return stmts.getParticipants.all(row.id).map(p => {
      const answerRows = stmts.getAnswersByParticipant.all(row.id, p.name);
      return {
        name:    p.name,
        score:   p.score,
        answers: answerRows.map(a => ({
          selected: a.selected,
          correct:  !!a.is_correct,
          points:   a.points,
        })),
      };
    });
  },

  /** Count how many players have answered a specific question */
  countAnswersForQuestion(pin, qIdx) {
    const row = stmts.getQuizByPin.get(pin);
    if (!row) return 0;
    return stmts.countAnswersForQuestion.get(row.id, qIdx)?.count || 0;
  },
};