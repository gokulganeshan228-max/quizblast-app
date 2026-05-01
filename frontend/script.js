/* ── PARTICLE BACKGROUND ── */
(function initBg(){
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
  resize(); window.addEventListener('resize', resize);

  const COLORS = ['#b44dff','#00d4ff','#ffe94d','#39ff85','#ff4d6e'];

  class Particle {
    constructor(){
      this.x = Math.random()*W; this.y = Math.random()*H;
      this.vx = (Math.random()-.5)*.3; this.vy = (Math.random()-.5)*.3;
      this.r = Math.random()*1.5+.5;
      this.color = COLORS[Math.floor(Math.random()*COLORS.length)];
      this.alpha = Math.random()*.5+.15;
      this.life = Math.random()*300+100;
      this.age = 0;
    }
    update(){ this.x+=this.vx; this.y+=this.vy; this.age++; if(this.x<0||this.x>W) this.vx*=-1; if(this.y<0||this.y>H) this.vy*=-1; }
    draw(){
      const a = Math.min(1, Math.min(this.age, this.life-this.age) / 30) * this.alpha;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = a;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    dead(){ return this.age >= this.life; }
  }

  /* Grid lines */
  function drawGrid(){
    ctx.strokeStyle = 'rgba(180,77,255,0.04)';
    ctx.lineWidth = 1;
    const sz = 80;
    for(let x=0;x<W;x+=sz){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for(let y=0;y<H;y+=sz){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  }

  /* Orbs */
  let t = 0;
  function drawOrbs(){
    const orbs = [
      { x:.15, y:.2, r:300, c:'rgba(180,77,255,', ox:60 },
      { x:.85, y:.75, r:220, c:'rgba(0,212,255,', ox:40 },
      { x:.5,  y:.5,  r:180, c:'rgba(57,255,133,', ox:30 },
    ];
    orbs.forEach((o,i)=>{
      const off = Math.sin(t*.0005+i*2)*o.ox;
      const gx = o.x*W, gy = o.y*H + off;
      const g = ctx.createRadialGradient(gx,gy,0, gx,gy,o.r);
      g.addColorStop(0, o.c+'0.08)');
      g.addColorStop(1, o.c+'0)');
      ctx.beginPath(); ctx.arc(gx,gy,o.r,0,Math.PI*2);
      ctx.fillStyle=g; ctx.fill();
    });
  }

  function frame(){
    t++;
    ctx.clearRect(0,0,W,H);
    drawGrid();
    drawOrbs();
    if(particles.length < 80) particles.push(new Particle());
    particles = particles.filter(p=>!p.dead());
    particles.forEach(p=>{ p.update(); p.draw(); });
    /* Connect nearby particles */
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<90){
          ctx.beginPath();
          ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.strokeStyle='rgba(180,77,255,'+(0.1*(1-d/90))+')';
          ctx.lineWidth=.5; ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
})();

/* ── ROUTER ── */
const PAGES = ['home','admin','join','host','play'];
function showPage(id){
  PAGES.forEach(p=>document.getElementById('page-'+p).classList.add('hidden'));
  document.getElementById('page-'+id).classList.remove('hidden');
  const nav = document.getElementById('nav-links');
  if(id==='home'){
    nav.innerHTML=`<button class="btn-nav" onclick="showPage('admin')">Admin Panel</button><button class="btn-prime pulse" onclick="showPage('join')">Join Quiz →</button>`;
  } else if(id==='admin'){
    nav.innerHTML=`<span class="chip">Admin</span><button class="btn-nav" onclick="showPage('home')">← Home</button>`;
  } else if(id==='host'){
    nav.innerHTML=`<span class="chip">Host Mode</span><span class="chip chip-electric" id="nav-pin"></span>`;
  } else if(id==='join'){
    nav.innerHTML=`<button class="btn-nav" onclick="showPage('admin')">Admin →</button>`;
  } else if(id==='play'){
    nav.innerHTML=`<span class="chip" id="player-name-chip">Player</span><span class="text-dim" style="font-size:.85rem;font-weight:600;font-family:'Syne Mono',monospace;">Score: <span id="my-score" style="color:var(--electric);">0</span></span>`;
  }
  window.scrollTo(0,0);
}

function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── API CONFIG ── */
const API_BASE = 'https://quizblast-app.onrender.com/api';

/* ── QuizDB — now calls the backend REST API ── */
const QuizDB = {
  async get(pin){
    try{
      const r=await fetch(`${API_BASE}/quiz/${pin}`);
      const d=await r.json();
      return d.success?d.quiz:null;
    }catch{ return null; }
  },
  async create(quizData){
    const r=await fetch(`${API_BASE}/quiz/create`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(quizData)});
    const d=await r.json();
    if(!d.success) throw new Error(d.error||'Failed to create quiz');
    return d.quiz;
  },
  async addParticipant(pin,name){
    const r=await fetch(`${API_BASE}/quiz/${pin}/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    const d=await r.json();
    if(!d.success) throw new Error(d.error||'Failed to join');
    return d.quiz;
  },
  async advanceQuestion(pin){
    const r=await fetch(`${API_BASE}/quiz/${pin}/next`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
    const d=await r.json();
    return d.success?d.quiz:null;
  },
  async submitAnswer(pin,name,qIdx,selected,timeLeft,totalTime){
    const r=await fetch(`${API_BASE}/quiz/${pin}/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,questionIndex:qIdx,selected,timeLeft,totalTime})});
    const d=await r.json();
    return d.success?{correct:d.correct,points:d.points,speedBonus:d.speedBonus}:{correct:false,points:0,speedBonus:0};
  },
  async getLeaderboard(pin){
    const r=await fetch(`${API_BASE}/quiz/${pin}/leaderboard`);
    const d=await r.json();
    return d.success?d.leaderboard:[];
  }
};

function pollQuizState(pin,cb,interval=1500){
  return setInterval(async()=>{const q=await QuizDB.get(pin);if(q)cb(q);},interval);
}

/* ── AI GENERATOR — proxied through backend ── */
async function callClaudeForQuestions(topic,count,defaultTime){
  const r=await fetch(`${API_BASE}/ai/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic,count,defaultTime})});
  const d=await r.json();
  if(!d.success) throw new Error(d.error||'AI generation failed');
  return d.questions;
}

/* ── ADMIN ── */
let adminQuestions=[],publishedPin=null;
function updateQCount(){ document.getElementById('q-count').textContent=adminQuestions.length; }

function addBlankQuestion(q=null){
  const idx=adminQuestions.length;
  const qData=q||{text:'',options:['','','',''],correct:0,time:parseInt(document.getElementById('default-time').value)};
  adminQuestions.push(qData);
  renderAdminQuestion(idx,qData);
  updateQCount();
}

function renderAdminQuestion(idx,q){
  const list=document.getElementById('questions-list');
  const div=document.createElement('div');
  div.className='question-item'; div.id=`q-item-${idx}`;
  div.innerHTML=`
    <div class="flex justify-between items-center mb-16">
      <span class="q-num">QUESTION ${idx+1}</span>
      <div class="flex gap-8 items-center">
        <select style="padding:6px 10px;border-radius:8px;font-size:.75rem;" onchange="updateQ(${idx},'time',this.value)">
          ${[10,15,20,30,45,60].map(t=>`<option value="${t}" ${q.time==t?'selected':''}>${t}s</option>`).join('')}
        </select>
        <button onclick="removeQuestion(${idx})" class="btn-danger">✕ Remove</button>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:14px;">
      <input type="text" placeholder="Question text..." value="${escHtml(q.text)}" oninput="updateQ(${idx},'text',this.value)" style="font-weight:600;"/>
    </div>
    <p class="text-sm text-dim mb-8">Options — select correct answer:</p>
    <div class="options-list">
      ${q.options.map((opt,oi)=>`
        <div class="option-input-row">
          <input type="radio" name="correct-${idx}" ${q.correct===oi?'checked':''} onchange="updateQ(${idx},'correct',${oi})"/>
          <input type="text" placeholder="Option ${oi+1}" value="${escHtml(opt)}" oninput="updateQOpt(${idx},${oi},this.value)"/>
        </div>`).join('')}
    </div>
    <p class="correct-hint mt-16">● Radio = correct answer</p>`;
  list.appendChild(div);
}

function updateQ(idx,field,val){
  if(field==='time') adminQuestions[idx].time=parseInt(val);
  else if(field==='correct') adminQuestions[idx].correct=parseInt(val);
  else adminQuestions[idx][field]=val;
}
function updateQOpt(idx,oi,val){ adminQuestions[idx].options[oi]=val; }
function removeQuestion(idx){
  adminQuestions.splice(idx,1);
  document.getElementById('questions-list').innerHTML='';
  adminQuestions.forEach((q,i)=>renderAdminQuestion(i,q));
  updateQCount();
}

async function adminGenerateWithAI(){
  const topic=document.getElementById('ai-topic').value.trim();
  const count=parseInt(document.getElementById('ai-count').value);
  if(!topic){ alert('Please enter a topic for AI generation.'); return; }
  if(!count||count<1||count>50){ alert('Please enter a number of questions between 1 and 50.'); return; }
  document.getElementById('ai-loader-box').classList.remove('hidden');
  document.getElementById('ai-generate-btn').disabled=true;
  document.getElementById('ai-status-text').textContent=`Generating ${count} questions about "${topic}"...`;
  try{
    const generated=await callClaudeForQuestions(topic,count,parseInt(document.getElementById('default-time').value));
    generated.forEach(q=>addBlankQuestion(q));
    document.getElementById('ai-topic').value='';
  } catch(err){ alert('AI generation failed: '+err.message); }
  document.getElementById('ai-loader-box').classList.add('hidden');
  document.getElementById('ai-generate-btn').disabled=false;
}

async function publishQuiz(){
  const title=document.getElementById('quiz-title').value.trim();
  if(!title){ alert('Please enter a quiz title.'); return; }
  if(adminQuestions.length===0){ alert('Please add at least one question.'); return; }
  for(let i=0;i<adminQuestions.length;i++){
    const q=adminQuestions[i];
    if(!q.text.trim()){ alert(`Question ${i+1} has no text.`); return; }
    if(q.options.some(o=>!o.trim())){ alert(`Question ${i+1} has empty options.`); return; }
  }
  const pin=Math.floor(100000+Math.random()*900000).toString();
  const quizData={
    id:'quiz_'+Date.now(),pin,title,
    description:document.getElementById('quiz-desc').value,
    questions:adminQuestions,status:'waiting',
    participants:{},currentQuestion:-1,
    createdAt:new Date().toISOString()
  };
  try{
    await QuizDB.create(quizData);
    publishedPin=pin;
    adminShowPublished(pin,title,adminQuestions.length);
  } catch(e){ alert('Failed to publish quiz: '+e.message); }
}

function adminShowPublished(pin,title,qCount){
  document.getElementById('adm-section-meta').classList.add('hidden');
  document.getElementById('adm-section-published').classList.remove('hidden');
  document.getElementById('adm-step1').className='step-dot done';
  document.getElementById('adm-step2').className='step-dot done';
  document.getElementById('adm-step3').className='step-dot active';
  document.getElementById('quiz-pin-display').textContent=pin;
  const joinUrl=`${location.origin}${location.pathname}?join=${pin}`;
  document.getElementById('share-link').value=joinUrl;
  document.getElementById('pub-quiz-title').textContent=title;
  document.getElementById('pub-quiz-questions').textContent=`${qCount} questions`;
  document.getElementById('qr-container').innerHTML='';
  new QRCode(document.getElementById('qr-container'),{text:joinUrl,width:180,height:180,colorDark:'#03030a',colorLight:'#ffffff'});
}

function copyLink(){
  const link=document.getElementById('share-link');
  link.select(); document.execCommand('copy');
  showScoreToast('Link copied! 🔗');
}
function openHostPage(){
  if(!publishedPin){ alert('Publish a quiz first!'); return; }
  initHostPage(publishedPin); showPage('host');
}

function resetAdmin(){
  adminQuestions=[]; publishedPin=null;
  document.getElementById('questions-list').innerHTML='';
  document.getElementById('quiz-title').value='';
  document.getElementById('quiz-desc').value='';
  document.getElementById('ai-topic').value='';
  document.getElementById('q-count').textContent='0';
  document.getElementById('adm-section-meta').classList.remove('hidden');
  document.getElementById('adm-section-published').classList.add('hidden');
  document.getElementById('adm-step1').className='step-dot active';
  document.getElementById('adm-step2').className='step-dot';
  document.getElementById('adm-step3').className='step-dot';
}

/* ── JOIN ── */
let joinCurrentPin=null,joinCurrentName=null,joinPollId=null;
function resetJoin(){
  joinCurrentPin=null;joinCurrentName=null;
  if(joinPollId){clearInterval(joinPollId);joinPollId=null;}
  document.getElementById('pin-input').value='';
  document.getElementById('name-input').value='';
  document.getElementById('pin-error').textContent='';
  document.getElementById('join-step-pin').classList.remove('hidden');
  document.getElementById('join-step-name').classList.add('hidden');
  document.getElementById('join-step-wait').classList.add('hidden');
}
async function checkPin(){
  const pin=document.getElementById('pin-input').value.trim();
  if(pin.length!==6){ document.getElementById('pin-error').textContent='PIN must be 6 digits.'; return; }
  const quiz=await QuizDB.get(pin);
  if(!quiz){ document.getElementById('pin-error').textContent='❌ No quiz found with that PIN.'; return; }
  if(quiz.status==='finished'){ document.getElementById('pin-error').textContent='🏁 This quiz has already ended.'; return; }
  joinCurrentPin=pin;
  document.getElementById('quiz-found-title').textContent=`📌 ${quiz.title}`;
  document.getElementById('join-step-pin').classList.add('hidden');
  document.getElementById('join-step-name').classList.remove('hidden');
}
async function joinGame(){
  const name=document.getElementById('name-input').value.trim();
  if(!name){ alert('Please enter your nickname!'); return; }
  joinCurrentName=name;
  try{ await QuizDB.addParticipant(joinCurrentPin,name); } catch(e){ alert(e.message); return; }
  sessionStorage.setItem('qb_name',name); sessionStorage.setItem('qb_pin',joinCurrentPin);
  document.getElementById('join-step-name').classList.add('hidden');
  document.getElementById('join-step-wait').classList.remove('hidden');
  document.getElementById('join-wait-name').textContent=`You're in as "${name}"`;
  joinPollId=pollQuizState(joinCurrentPin,(quiz)=>{
    const count=Object.keys(quiz.participants).length;
    document.getElementById('join-lobby-players').textContent=count+' joined';
    if(quiz.status==='question'&&quiz.currentQuestion>=0){
      clearInterval(joinPollId);
      initPlayPage(joinCurrentPin,joinCurrentName);
      showPage('play');
    }
  },1500);
}

/* ── HOST ── */
let hostPin=null,hostQuiz=null,hostTimerInterval=null,hostLobbyPollId=null,hostCurrentTimeLeft=0;
async function initHostPage(pin){
  hostPin=pin; hostQuiz=await QuizDB.get(pin);
  if(!hostQuiz){ alert('Quiz not found!'); showPage('home'); return; }
  document.getElementById('host-pin-display').textContent=pin;
  document.getElementById('host-lobby-quiz-title').textContent=hostQuiz.title;
  ['host-view-question','host-view-leaderboard','host-view-final'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('host-view-lobby').classList.remove('hidden');
  if(hostLobbyPollId) clearInterval(hostLobbyPollId);
  hostLobbyPollId=pollQuizState(pin,(q)=>{
    hostQuiz=q;
    const players=Object.values(q.participants);
    document.getElementById('host-player-count').textContent=players.length;
    const grid=document.getElementById('host-players-grid');
    if(players.length===0){ grid.innerHTML='<p class="text-dim text-sm">Waiting for players...</p>'; return; }
    grid.innerHTML=players.map(p=>`<div class="player-chip">🎮 ${escHtml(p.name)}</div>`).join('');
  },2000);
  setTimeout(()=>{const el=document.getElementById('nav-pin');if(el)el.textContent='PIN: '+pin;},50);
}
async function hostStartQuiz(){
  if(Object.keys(hostQuiz.participants).length===0){ alert('Wait for at least 1 player to join!'); return; }
  clearInterval(hostLobbyPollId);
  const r=await fetch(`${API_BASE}/quiz/${hostPin}/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
  const d=await r.json();
  if(!d.success){ alert(d.error||'Could not start quiz'); return; }
  hostQuiz=d.quiz;
  hostShowQuestion();
}

const hostOptionColors=['#b44dff','#00d4ff','#ffe94d','#39ff85'];
async function hostShowQuestion(){
  hostQuiz=await QuizDB.get(hostPin);
  const qIdx=hostQuiz.currentQuestion, q=hostQuiz.questions[qIdx], totalQ=hostQuiz.questions.length;
  ['host-view-lobby','host-view-leaderboard'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('host-view-question').classList.remove('hidden');
  document.getElementById('host-q-progress-label').textContent=`Question ${qIdx+1} of ${totalQ}`;
  document.getElementById('host-q-text').textContent=q.text;
  document.getElementById('host-progress').style.width=((qIdx+1)/totalQ*100)+'%';
  document.getElementById('host-next-btn').style.display='none';
  document.getElementById('host-options').innerHTML=q.options.map((opt,oi)=>`
    <div class="host-opt-display" id="host-opt-${oi}"
      style="border-color:${hostOptionColors[oi]}30;background:${hostOptionColors[oi]}10;color:${hostOptionColors[oi]}">
      <span style="margin-right:10px;font-weight:800;font-family:'Syne Mono',monospace;">${['A','B','C','D'][oi]}</span>${escHtml(opt)}
    </div>`).join('');
  hostStartTimer(q.time,q);
}
function hostStartTimer(seconds,q){
  clearInterval(hostTimerInterval);
  hostCurrentTimeLeft=seconds;
  const totalTime=seconds;
  const circle=document.getElementById('host-timer-circle');
  async function tick(){
    document.getElementById('host-timer-num').textContent=hostCurrentTimeLeft;
    circle.style.strokeDashoffset=264*(1-hostCurrentTimeLeft/totalTime);
    if(hostCurrentTimeLeft<=3) circle.style.stroke='var(--heat)';
    else circle.style.stroke='var(--electric)';
    hostQuiz=await QuizDB.get(hostPin);
    const answered=Object.values(hostQuiz.participants).filter(p=>p.answers.length>hostQuiz.currentQuestion).length;
    document.getElementById('host-answered-count').textContent=answered;
    document.getElementById('host-total-players-count').textContent=Object.keys(hostQuiz.participants).length;
    if(hostCurrentTimeLeft<=0){clearInterval(hostTimerInterval);hostRevealAnswer(q);return;}
    hostCurrentTimeLeft--;
  }
  tick(); hostTimerInterval=setInterval(tick,1000);
}
function hostRevealAnswer(q){
  const el=document.getElementById(`host-opt-${q.correct}`);
  if(el){ el.style.border='2px solid var(--lime)'; el.style.background='rgba(57,255,133,0.15)'; el.style.color='var(--lime)'; }
  document.getElementById('host-next-btn').style.display='flex';
  setTimeout(hostShowLeaderboard,2000);
}
async function hostSkipTimer(){
  clearInterval(hostTimerInterval);
  hostCurrentTimeLeft=0;
  hostQuiz=await QuizDB.get(hostPin);
  hostRevealAnswer(hostQuiz.questions[hostQuiz.currentQuestion]);
}
async function hostShowLeaderboard(){
  document.getElementById('host-view-question').classList.add('hidden');
  document.getElementById('host-view-leaderboard').classList.remove('hidden');
  renderLeaderboard(await QuizDB.getLeaderboard(hostPin),'host-leaderboard');
  hostQuiz=await QuizDB.get(hostPin);
  const isLast=hostQuiz.currentQuestion>=hostQuiz.questions.length-1;
  document.getElementById('host-lb-next-btn').textContent=isLast?'🏁 Show Final Results':'Next Question →';
}
async function hostContinueFromLeaderboard(){
  const quiz=await QuizDB.advanceQuestion(hostPin);
  if(!quiz||quiz.status==='finished') hostShowFinal();
  else hostShowQuestion();
}
function hostNextQuestion(){ hostContinueFromLeaderboard(); }
async function hostShowFinal(){
  document.getElementById('host-view-leaderboard').classList.add('hidden');
  document.getElementById('host-view-final').classList.remove('hidden');
  renderLeaderboard(await QuizDB.getLeaderboard(hostPin),'host-final-leaderboard');
}
function renderLeaderboard(lb,containerId){
  const medals=['🥇','🥈','🥉'],rankClass=['rank-1','rank-2','rank-3'];
  document.getElementById(containerId).innerHTML=lb.map((p,i)=>`
    <div class="lb-row ${rankClass[i]||''}" style="animation-delay:${i*.1}s">
      <div class="lb-rank">${medals[i]||(i+1)}</div>
      <div class="lb-name">${escHtml(p.name)}</div>
      <div>
        <div class="lb-score">${p.score}</div>
        <div class="lb-bonus">${p.answers.length} answered</div>
      </div>
    </div>`).join('')||'<p class="text-dim text-center">No participants yet.</p>';
}

/* ── PLAY ── */
let playPin=null,playName=null,playMyScore=0,playLastQIdx=-2,playTimerInterval=null;
let playHasAnswered=false,playMainPoll=null;
const playColors=['#b44dff','#00d4ff','#ffe94d','#39ff85'];
const playColorBgs=['rgba(180,77,255,0.15)','rgba(0,212,255,0.15)','rgba(255,233,77,0.15)','rgba(57,255,133,0.15)'];
const optLetters=['A','B','C','D'];

function initPlayPage(pin,name){
  playPin=pin;playName=name;playMyScore=0;playLastQIdx=-2;playHasAnswered=false;
  if(playMainPoll) clearInterval(playMainPoll);
  ['play-view-question','play-view-leaderboard','play-view-final'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('play-view-waiting').classList.remove('hidden');
  setTimeout(()=>{const nc=document.getElementById('player-name-chip');if(nc)nc.textContent=name;},50);
  playMainPoll=setInterval(async()=>{
    const quiz=await QuizDB.get(playPin);
    if(!quiz) return;
    playMyScore=quiz.participants[playName]?.score||0;
    const sc=document.getElementById('my-score');if(sc)sc.textContent=playMyScore;
    if(quiz.status==='finished'){clearInterval(playMainPoll);playShowFinal(quiz);return;}
    if(quiz.status==='question'&&quiz.currentQuestion!==playLastQIdx){
      playLastQIdx=quiz.currentQuestion;
      playHasAnswered=false;
      playShowQuestion(quiz);
    }
  },1000);
}
function playShowQuestion(quiz){
  clearInterval(playTimerInterval);
  const q=quiz.questions[quiz.currentQuestion];
  const totalQ=quiz.questions.length,qIdx=quiz.currentQuestion;
  ['play-view-waiting','play-view-leaderboard','play-view-final'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('play-view-question').classList.remove('hidden');
  document.getElementById('play-answer-feedback').classList.add('hidden');
  document.getElementById('play-q-progress').textContent=`Question ${qIdx+1} of ${totalQ}`;
  document.getElementById('play-q-label').textContent=`QUESTION ${qIdx+1}`;
  document.getElementById('play-q-text').textContent=q.text;
  document.getElementById('play-my-progress').style.width=((qIdx+1)/totalQ*100)+'%';
  document.getElementById('play-answer-options').innerHTML=q.options.map((opt,oi)=>`
    <button class="answer-btn" id="play-ans-${oi}"
      style="border-color:${playColors[oi]}50;background:${playColorBgs[oi]};position:relative;overflow:hidden;"
      onclick="playSubmitAnswer(${oi},${q.correct},${q.time})">
      <span style="font-size:1rem;margin-right:10px;font-weight:800;color:${playColors[oi]};font-family:'Syne Mono',monospace;">${optLetters[oi]}</span>
      ${escHtml(opt)}
    </button>`).join('');
  playStartTimer(q.time);
}
function playStartTimer(seconds){
  let left=seconds;const total=seconds;
  const circle=document.getElementById('play-timer-circle');
  function tick(){
    document.getElementById('play-timer-num').textContent=left;
    circle.style.strokeDashoffset=264*(1-left/total);
    if(left<=3)circle.style.stroke='var(--heat)';else circle.style.stroke='var(--electric)';
    if(left<=0){clearInterval(playTimerInterval);if(!playHasAnswered)playTimeUp();return;}
    left--;
  }
  tick(); playTimerInterval=setInterval(tick,1000);
}
async function playSubmitAnswer(selected,correct,totalTime){
  if(playHasAnswered) return;
  playHasAnswered=true;
  clearInterval(playTimerInterval);
  const timeLeft=parseInt(document.getElementById('play-timer-num').textContent);
  const result=await QuizDB.submitAnswer(playPin,playName,playLastQIdx,selected,timeLeft,totalTime);
  document.querySelectorAll('.answer-btn').forEach((btn,i)=>{btn.disabled=true;if(i===correct)btn.classList.add('show-correct');});
  const btn=document.getElementById(`play-ans-${selected}`);
  if(result.correct){btn.classList.add('selected-correct');playShowFeedback(true,result.points,result.speedBonus);}
  else{btn.classList.add('selected-wrong');playShowFeedback(false,0,0);}
}
function playTimeUp(){
  playHasAnswered=true;
  document.querySelectorAll('.answer-btn').forEach(btn=>btn.disabled=true);
  playShowFeedback(null,0,0);
}
async function playShowFeedback(correct,points,speedBonus){
  const fb=document.getElementById('play-answer-feedback');
  fb.classList.remove('hidden');
  if(correct===null){
    document.getElementById('play-feedback-icon').textContent='⏰';
    document.getElementById('play-feedback-text').textContent="Time's up!";
    document.getElementById('play-feedback-points').textContent='+0 pts';
    fb.style.borderColor='var(--text-dim)';
  } else if(correct){
    document.getElementById('play-feedback-icon').textContent='🎉';
    document.getElementById('play-feedback-text').innerHTML=`<span style="color:var(--lime)">Correct!</span>`;
    document.getElementById('play-feedback-points').textContent=`+${points} pts  (speed bonus: +${speedBonus})`;
    fb.style.borderColor='var(--lime)';
    showScoreToast('+'+points+' pts!');
  } else {
    document.getElementById('play-feedback-icon').textContent='❌';
    document.getElementById('play-feedback-text').innerHTML=`<span style="color:var(--heat)">Wrong!</span>`;
    document.getElementById('play-feedback-points').textContent='+0 pts';
    fb.style.borderColor='var(--heat)';
  }
  playMyScore=(await QuizDB.get(playPin))?.participants[playName]?.score||0;
  const sc=document.getElementById('my-score');if(sc)sc.textContent=playMyScore;
  setTimeout(async()=>{
    const quiz=await QuizDB.get(playPin);
    if(quiz){
      document.getElementById('play-view-question').classList.add('hidden');
      document.getElementById('play-view-leaderboard').classList.remove('hidden');
      document.getElementById('play-my-score-big').textContent=playMyScore+' pts';
      renderLeaderboard(await QuizDB.getLeaderboard(playPin),'play-leaderboard');
    }
  },2500);
}
async function playShowFinal(quiz){
  clearInterval(playTimerInterval);
  ['play-view-question','play-view-leaderboard','play-view-waiting'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('play-view-final').classList.remove('hidden');
  const score=quiz?.participants[playName]?.score||0;
  document.getElementById('play-final-score').textContent=score+' pts';
  renderLeaderboard(await QuizDB.getLeaderboard(playPin),'play-final-leaderboard');
}
function showScoreToast(msg){
  const t=document.createElement('div');
  t.className='score-toast';t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

/* ── INIT ── */
(function init(){
  const params=new URLSearchParams(location.search);
  const joinPin=params.get('join');
  if(joinPin){ document.getElementById('pin-input').value=joinPin; showPage('join'); return; }
  showPage('home');
})();