// app-shared.js
// Core shared JS: Firebase init, helpers, exam runtime, admin flows, import/export, announcements.
// Source: extracted and adapted from your uploaded backup file.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, onSnapshot, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7X0B65qfWiSkSaC_-dXElw687ZmVM9gU",
  authDomain: "exam-system-2ed90.firebaseapp.com",
  projectId: "exam-system-2ed90",
  storageBucket: "exam-system-2ed90.appspot.com",
  messagingSenderId: "576581410555",
  appId: "1:576581410555:web:e38cea3f14d10e5daa5a5e",
  measurementId: "G-BCFKVMVTBE"
};

const app = initializeApp(firebaseConfig);
window.db = getFirestore(app);
window.storage = getStorage(app);

// Expose firestore helpers
window.setDoc = setDoc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.doc = doc;
window.collection = collection;
window.onSnapshot = onSnapshot;
window.deleteDoc = deleteDoc;
window.query = query;
window.where = where;
window.orderBy = orderBy;

// Storage keys & defaults
const K_USERS = 'offline_mcq_users_v1';
const K_QS = 'offline_mcq_qs_v1';
const K_RESULTS = 'offline_mcq_results_v1';
const K_ADMIN = 'offline_mcq_admin_v1';
const K_SETTINGS = 'offline_mcq_settings_v1';
const MASTER_ADMIN = { username: 'admin', password: 'exam123' };

// Minimal helper functions
const $ = s => document.querySelector(s);
const $all = s => Array.from(document.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2,9);
const read = (k,def) => { try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
const write = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const download = (filename, content, type='text/plain') => {
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
};
function escapeHTML(input) {
  if (input === null || input === undefined) return '';
  const str = (typeof input === 'string') ? input : (typeof input === 'object' ? JSON.stringify(input) : String(input));
  return str.replace(/[&<>"'`=\/]/g, function (s) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'})[s];
  });
}

// in-memory state (persisted to localStorage)
let users = read(K_USERS, []);
let questions = read(K_QS, []);
let results = read(K_RESULTS, []);
let adminCred = read(K_ADMIN, null);
let settings = read(K_SETTINGS, { durationMin: 30, customMsg: "📢 Welcome to your exam! Stay calm, focus, and do your best!", shuffle: false, allowAfterTime: false, logo: "", author: "", college: "", subject: "", subjectCode: "", fullMarks: 0, counts: { Synopsis: 0, "Minor Practical": 0, "Major Practical": 0, Viva: 0 } });

if(!adminCred) write(K_ADMIN, MASTER_ADMIN);
if(questions.length === 0){
  questions = [
    { id: uid(), question: 'HTML stands for?', options: ['Hyperlinks Text Markup','Home Tool Markup','Hyper Text Markup Language','Hyperlinking Text Markdown'], answer: 2, marks: 1, category: 'Synopsis' },
    { id: uid(), question: 'Which tag defines paragraph?', options: ['<p>','<para>','<pg>','<par>'], answer: 0, marks: 1, category: 'Minor Practical' }
  ];
  write(K_QS, questions);
}

window.read = read;
window.write = write;

// ---------------- showSection (UI) ----------------
function showSection(id){
  const homeEl = document.getElementById('home');
  const wrapEl = document.querySelector('.wrap');

  if(id === 'home') {
    if(homeEl) homeEl.classList.remove('hidden');
    if(wrapEl) wrapEl.classList.add('hidden');
    return;
  }

  if(homeEl) homeEl.classList.add('hidden');
  if(wrapEl) wrapEl.classList.remove('hidden');

  ['user','import','adminLogin','adminPanel'].forEach(s => { const el = document.getElementById(s); if(!el) return; el.classList.add('hidden'); });
  const target = document.getElementById(id);
  if(target) target.classList.remove('hidden');

  if(id === 'adminPanel') {
    renderQuestionsList();
    renderUsersAdmin();
    renderResults();
  }
}
window.showSection = showSection;

// ---------------- Announcements (admin->students) ----------------
async function sendAnnouncement(){
  const text = (document.getElementById('adminAnnText')?.value || '').trim();
  if(!text) return alert('Enter a message to send.');
  try {
    const author = (window.currentAdmin || window.ADMIN_NAME || 'admin');
    const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,8);
    const payload = { text, author, createdAt: Date.now(), deleted: false };
    await setDoc(doc(db, "announcements", id), payload);
    if(document.getElementById('adminAnnText')) document.getElementById('adminAnnText').value = '';
    alert('✅ Announcement sent.');
  } catch (err) {
    console.error('Failed to send announcement:', err);
    alert('❌ Failed to send (see console).');
  }
}
function clearAnnouncementBox(){ if(document.getElementById('adminAnnText')) document.getElementById('adminAnnText').value = ''; }
async function deleteAnnouncement(id){
  if(!confirm('Delete this announcement?')) return;
  try {
    await setDoc(doc(db, "announcements", id), { deleted: true, deletedAt: Date.now() }, { merge: true });
    alert('Deleted.');
  } catch (err) {
    console.error('deleteAnnouncement error', err);
    alert('Failed to delete (see console).');
  }
}

async function renderAdminAnnouncementsLive(){
  const listEl = document.getElementById('adminAnnList');
  if(!listEl) return;
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    listEl.innerHTML = '';
    if(snap.empty) {
      listEl.innerHTML = '<div class="small">No announcements yet.</div>';
      return;
    }
    snap.forEach(d => {
      const data = d.data();
      if(data.deleted) return;
      const row = document.createElement('div'); row.className='list-item';
      row.innerHTML = `<div style="flex:1"><b>${escapeHTML(data.author||'admin')}</b><div class="small">${escapeHTML(data.text)}</div></div>
                       <div style="width:80px;text-align:right"><button class="btn" onclick="deleteAnnouncement('${d.id}')">Delete</button></div>`;
      listEl.appendChild(row);
    });
  });
}

function updateHomeAnnouncement(text){
  const el = document.getElementById('homeAnnouncement');
  if(!el) return;
  if(text) { el.textContent = text; el.style.display = 'block'; }
  else { el.textContent = ''; el.style.display = 'none'; }
}
function showAnnouncement(msg){
  let banner = document.getElementById('examMsg');
  if(!banner) {
    banner = document.createElement('div');
    banner.id = 'examMsg';
    banner.style.cssText = 'width:100%;padding:8px;text-align:center;font-weight:bold;background:#222;color:#fff;position:fixed;top:0;left:0;z-index:99999';
    document.body.prepend(banner);
  }
  banner.textContent = msg;
}

function startAnnouncementsListenerForStudents(){
  try {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    onSnapshot(q, snap => {
      let latest = null;
      snap.forEach(d => {
        const data = d.data();
        if(data && !data.deleted && data.text) {
          if(!latest) latest = { id: d.id, ...data };
        }
      });
      if(latest && latest.text) {
        const banner = document.getElementById('examMsg');
        if(banner) {
          banner.textContent = latest.text;
          banner.style.transition = 'background 300ms ease';
          banner.style.background = '#1f2937';
          setTimeout(()=> banner.style.background = '', 800);
        } else {
          showAnnouncement(latest.text);
        }
        updateHomeAnnouncement(latest.text);
      } else {
        updateHomeAnnouncement('');
      }
    });
  } catch (err) {
    console.warn('startAnnouncementsListenerForStudents error:', err);
  }
}

window.sendAnnouncement = sendAnnouncement;
window.clearAnnouncementBox = clearAnnouncementBox;
window.deleteAnnouncement = deleteAnnouncement;
window.renderAdminAnnouncementsLive = renderAdminAnnouncementsLive;
window.startAnnouncementsListenerForStudents = startAnnouncementsListenerForStudents;

// ---------------- Admin login & helpers ----------------
function handleAdminLogin(){
  const pass = document.getElementById('adminPass')?.value;
  const stored = read(K_ADMIN, null);

  if(stored && stored.password === pass){ 
    enterAdmin(); 
    renderAdminAnnouncementsLive();
    return; 
  }
  if(pass === MASTER_ADMIN.password){ 
    enterAdmin(); 
    renderAdminAnnouncementsLive();
    return; 
  }
  alert('Invalid admin password');
}
function enterAdmin(){
  showSection('adminPanel');
  window.IS_ADMIN = true;
  if (typeof enableAdminSessionsUI === 'function') enableAdminSessionsUI(true);
  renderQuestionsList();
  renderUsersAdmin();
  renderResults();
}
function logoutAdmin(){
  window.IS_ADMIN = false;
  if (typeof enableAdminSessionsUI === 'function') enableAdminSessionsUI(false);
  showSection('user');
}
window.handleAdminLogin = handleAdminLogin;
window.enterAdmin = enterAdmin;
window.logoutAdmin = logoutAdmin;

// ---------------- User login & helpers ----------------
function fileToDataURL(file){ return new Promise(res => { const fr = new FileReader(); fr.onload = ()=> res(fr.result); fr.readAsDataURL(file); }); }

async function handleUserLogin(){
  // simplified wrapper that calls resume-aware version if present
  if (typeof handleUserLogin_withResume === 'function') return handleUserLogin_withResume();
  // fallback: minimal
  const username = (document.getElementById('userName')?.value || '').trim();
  const pass = (document.getElementById('userPass')?.value || '');
  const file = document.getElementById('userPhoto')?.files?.[0];
  if(!username || !pass) return alert('Enter username and password');

  let user = users.find(u => u.username === username && u.password === pass);
  if(!user){
    if(!file) return alert('New user: upload photo to register');
    const photo = await fileToDataURL(file);
    const fullName = username;
    user = { username, password: pass, photo, fullName };
    users.push(user);
    write(K_USERS, users);
    try { await setDoc(doc(db, "users", user.username), user); } catch(e){ console.warn('Firestore users save failed', e); }
  }

  const attempted = (results || []).some(r => r.username === username);
  if(attempted) {
    alert(`⚠️ "${username}" has already attempted the exam.`);
    return;
  }

  if(document.getElementById('fsUserPhoto')) document.getElementById('fsUserPhoto').src = user.photo || '';
  if(document.getElementById('fsUserName')) document.getElementById('fsUserName').textContent = user.fullName || user.username;
  showSection('user');
  document.getElementById('examFullscreen').style.display = 'flex';
  document.querySelectorAll('.fsFooter').forEach(el => el.style.display = 'flex');
}
window.handleUserLogin = handleUserLogin;

// ----------------- Import / Export / Backup -----------------
function triggerImportUsers(){ $('#impUsersFile')?.click(); }
function triggerImportQuestions(){ $('#impQFile')?.click(); }

function importUsersFile(e){
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = ()=> {
    try {
      const arr = JSON.parse(fr.result);
      if(!Array.isArray(arr)) throw 'bad';
      users = arr.map(u => ({ username: u.username, password: u.password, photo: u.photo || '' }));
      write(K_USERS, users); alert('Users imported'); renderUsersAdmin();
    } catch (err) { console.error(err); alert('Invalid users JSON'); }
  };
  fr.readAsText(f);
  e.target.value = '';
}
function importQuestionsFile(e){
  const f = e.target.files[0]; if(!f) return;
  const fr = new FileReader();
  fr.onload = ()=> {
    try {
      const arr = JSON.parse(fr.result);
      if(!Array.isArray(arr)) throw 'bad';
      questions = arr.map(q => ({ id: q.id || uid(), question: q.question || '', options: q.options || ['','','',''], answer: parseInt(q.answer)||0, marks: parseInt(q.marks)||1, category: q.category || 'Synopsis' }));
      write(K_QS, questions); alert('Questions imported'); renderQuestionsList();
    } catch(err){ console.error(err); alert('Invalid questions JSON'); }
  };
  fr.readAsText(f);
  e.target.value = '';
}

function exportUsers(){ download('users.json', JSON.stringify(users, null, 2), 'application/json'); }
function exportQuestions(){ download('questions.json', JSON.stringify(questions, null, 2), 'application/json'); }
function downloadBackup(){
  const backup = { users, questions, results, admin: read(K_ADMIN, null) };
  download('backup_offline_mcq.json', JSON.stringify(backup, null, 2), 'application/json');
}
function exportResultsJSON(){
  if(results.length === 0) return alert('No results to export');
  download('results.json', JSON.stringify(results, null, 2), 'application/json');
}
function exportResultsCSV(){
  if(results.length === 0) return alert('No results to export');
  const rows = [['username','totalPercent','synopsis','minor_practical','major_practical','viva','timestamp']];
  results.forEach(r => rows.push([r.username, r.totalScorePercent, r.sectionScores['Synopsis']||0, r.sectionScores['Minor Practical']||0, r.sectionScores['Major Practical']||0, r.sectionScores['Viva']||0, new Date(r.timestamp).toISOString()]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  download('results.csv', csv, 'text/csv');
}

// full backup import (restores users, questions, results, settings, adminCred)
function importFullBackup(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=> {
    try {
      const backup = JSON.parse(reader.result);
      users = backup.users || users;
      questions = backup.questions || questions;
      results = backup.results || results;
      settings = backup.settings || settings;
      adminCred = backup.adminCred || adminCred;

      write(K_USERS, users);
      write(K_QS, questions);
      write(K_RESULTS, results);
      write(K_SETTINGS, settings);
      write(K_ADMIN, adminCred);

      alert("✅ Full backup restored!");
      renderUsersAdmin();
      renderQuestionsList();
      renderResults();
      renderSettingsAdmin && renderSettingsAdmin();
    } catch (err) {
      alert("❌ Invalid backup file");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function updateBackup() {
  const backup = { users, questions, results, settings, adminCred };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "exam_full_backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  alert("✅ Backup updated! Please replace the old file when saving.");
}

// ---------------- Questions CRUD UI for admin ----------------
let editingId = null;
function renderQuestionsList(){
  const list = document.getElementById('adminQuestionsList');
  if(!list) return;
  list.innerHTML = '';
  if(!questions.length) { list.innerHTML = '<div class="small">No questions.</div>'; return; }
  questions.forEach(q => {
    const el = document.createElement('div'); el.className = 'list-item';
    el.innerHTML = `<div style="flex:1"><b class="admin-question-text">${escapeHTML(q.question)}</b><div class="small">Category: ${escapeHTML(q.category)} • Marks: ${q.marks}</div></div>
                    <div style="width:120px;text-align:right">
                      <button class="btn" onclick="editQuestion('${q.id}')">Edit</button>
                      <button class="btn danger" onclick="deleteQuestion('${q.id}')">Delete</button>
                    </div>`;
    list.appendChild(el);
  });
}
window.renderQuestionsList = renderQuestionsList;

function editQuestion(id){
  const q = questions.find(x=>x.id===id);
  if(!q) return alert('Question not found');
  document.getElementById('qText').value = q.question;
  document.getElementById('qA').value = q.options[0]||'';
  document.getElementById('qB').value = q.options[1]||'';
  document.getElementById('qC').value = q.options[2]||'';
  document.getElementById('qD').value = q.options[3]||'';
  document.getElementById('qAnswer').value = q.answer || 0;
  document.getElementById('qMarks').value = q.marks || 1;
  document.getElementById('qCategory').value = q.category || 'Synopsis';
  window.editingId = q.id;
}
window.editQuestion = editQuestion;

async function deleteQuestion(id){
  if(!confirm('Delete question?')) return;
  questions = questions.filter(q=>q.id !== id);
  write(K_QS, questions);
  try { await deleteDoc(doc(db, "questions", id)); } catch(e){ console.warn('Firestore delete failed', e); }
  renderQuestionsList();
}
window.deleteQuestion = deleteQuestion;

async function saveQuestion(){
  const text = (document.getElementById('qText')?.value || '').trim();
  const opts = [document.getElementById('qA')?.value||'', document.getElementById('qB')?.value||'', document.getElementById('qC')?.value||'', document.getElementById('qD')?.value||''];
  const ans = parseInt(document.getElementById('qAnswer')?.value || 0);
  const marks = parseInt(document.getElementById('qMarks')?.value || 1);
  const category = document.getElementById('qCategory')?.value || 'Synopsis';
  if(!text || opts.some(o => !o)) return alert('⚠️ Fill question and all 4 options');
  const q = { id: window.editingId || uid(), question: text, options: opts, answer: ans, marks, category };
  if(window.editingId) { questions = questions.map(x => x.id === q.id ? q : x); window.editingId = null; } else questions.push(q);
  write(K_QS, questions);
  try {
    await setDoc(doc(db, "questions", q.id), q);
    console.log(`✅ Firestore saved: questions/${q.id}`);
    alert("✅ Question saved to Firebase + localStorage!");
  } catch (err) {
    console.warn("Firestore save failed, question saved locally.", err);
    alert("⚠️ Question saved offline only.");
  }
  document.getElementById('qText').value = '';
  document.getElementById('qA').value = '';
  document.getElementById('qB').value = '';
  document.getElementById('qC').value = '';
  document.getElementById('qD').value = '';
  renderQuestionsList();
}
window.saveQuestion = saveQuestion;

// ---------------- Results rendering ----------------
function renderResults(){
  const area = document.getElementById('resultsArea');
  if(!area) return;
  area.innerHTML = '';
  if(!results.length) { area.innerHTML = '<div class="small">No results yet.</div>'; return; }
  results.forEach(r=>{
    const el = document.createElement('div'); el.className='list-item';
    el.innerHTML = `<div style="flex:1"><b>${escapeHTML(r.username)}</b><div class="small">Score: ${r.score || 0}</div></div>`;
    area.appendChild(el);
  });
}
window.renderResults = renderResults;

// --------------- EXAM RUNTIME (fullscreen) ---------------
let EXAM = {
  paper: [],
  state: null,
  timerId: null,
  cur: 0,
  cfg: { durationMin: 30, total: null, shuffle: false }
};

function buildPaper(qbank, shuffle){
  let pool = Array.from(qbank);
  if(!pool.length) return [];

  if(settings && settings.counts) {
    const byCat = {};
    pool.forEach(q => { (byCat[q.category] = byCat[q.category] || []).push(q); });
    const selected = [];
    for (const cat of ['Synopsis','Minor Practical','Major Practical','Viva']) {
      const want = settings.counts?.[cat] || 0;
      const arr = byCat[cat] || [];
      for (let i=0; i<Math.min(want, arr.length); i++) selected.push(arr[i]);
    }
    if(selected.length) pool = selected;
  }

  if(shuffle) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  return pool;
}

function startExam(user){
  EXAM.cur = 0;
  EXAM.cfg.durationMin = settings.durationMin || 30;
  EXAM.paper = buildPaper(questions, settings.shuffle);
  EXAM.state = { username: user.username, answers: {}, flags: {}, startedAt: Date.now(), remainingMs: (EXAM.cfg.durationMin * 60 * 1000), submitted: false };
  document.getElementById('examFullscreen').style.display = 'flex';
  if(document.getElementById('fsUserPhoto')) document.getElementById('fsUserPhoto').src = user.photo || '';
  if(document.getElementById('fsUserName')) document.getElementById('fsUserName').textContent = user.fullName || user.username;
  paintQuestion();
  startPeriodicSessionSave();
  startTimer();
}

function paintQuestion() {
  const q = EXAM.paper[EXAM.cur];
  if (!q) return;
  $('#fsQuestion').innerHTML = `${EXAM.cur+1}. (${q.category}) ${escapeHTML(q.question)}`;
  const opts = $('#fsOptions'); opts.innerHTML = '';
  q.options.forEach((opt, i) => {
    const d = document.createElement('div');
    d.className = 'fsOpt' + (EXAM.state.answers[q.id] === i ? ' selected' : '');
    d.innerHTML = `<div style="width:28px;font-weight:800">${String.fromCharCode(65+i)}.</div><div style="flex:1">${escapeHTML(opt)}</div>`;
    d.onclick = () => { EXAM.state.answers[q.id] = i; paintQuestion(); updateProgress(); };
    opts.appendChild(d);
  });
  $('#fsMeta').textContent = `Question ${EXAM.cur+1} of ${EXAM.paper.length} • Answered: ${Object.keys(EXAM.state.answers).length}`;
  if (EXAM.state.flags[q.id]) $('#fsMeta').textContent += " • ⚑ Flagged";
  updateProgress();
  renderQuestionNav();
  updateStats && updateStats();
}
window.paintQuestion = paintQuestion;

function prevQuestion(){ if(EXAM.cur>0){ EXAM.cur--; paintQuestion(); } }
function nextQuestion(){ if(EXAM.cur < EXAM.paper.length - 1){ EXAM.cur++; paintQuestion(); } }

function toggleFlag(){ const q = EXAM.paper[EXAM.cur]; if(!q) return; EXAM.state.flags[q.id] = !EXAM.state.flags[q.id]; paintQuestion(); }

function updateProgress(){ const answered = Object.keys(EXAM.state.answers).length; const total = EXAM.paper.length; const pct = Math.round((answered/total) * 100); $('#fsProgressFill').style.width = pct + '%'; }

function renderQuestionNav(){
  let nav = document.getElementById('questionNav');
  if(!nav) {
    nav = document.createElement('div');
    nav.id = 'questionNav';
    nav.style.marginTop = '12px';
    document.getElementById('fsMain')?.prepend(nav);
  }
  nav.innerHTML = '';
  EXAM.paper.forEach((q,i)=>{
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = i+1;
    if(EXAM.state.answers[q.id] !== undefined) btn.style.background = '#34d399';
    if(EXAM.state.flags[q.id]) btn.style.border = '2px solid orange';
    if(i === EXAM.cur) btn.style.outline = '2px solid #60a5fa';
    btn.onclick = ()=>{ EXAM.cur = i; paintQuestion(); };
    nav.appendChild(btn);
  });
}

// ----------------- Timer / session save -----------------
function updateTimerText(){
  const ms = EXAM.state.remainingMs || 0;
  const hh = Math.floor(ms/3600000);
  const mm = Math.floor((ms%3600000)/60000);
  const ss = Math.floor((ms%60000)/1000);
  const pad = n => String(n).padStart(2,'0');
  $('#fsTimer').textContent = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function stopTimer(){
  if(EXAM.timerId) { clearInterval(EXAM.timerId); EXAM.timerId = null; }
}

async function startTimer() {
  stopTimer();
  const end = Date.now() + EXAM.state.remainingMs;
  updateTimerText();
  EXAM.timerId = setInterval(async () => {
    EXAM.state.remainingMs = end - Date.now();
    if (EXAM.state.remainingMs <= 0) {
      EXAM.state.remainingMs = 0;
      stopTimer();
      if (settings.allowAfterTime) {
        // allow after time if configured
      } else {
        submitExam(true);
      }
    }
    updateTimerText();
    // save to Firestore occasionally
    if (Math.floor(EXAM.state.remainingMs / 10000) !== Math.floor((EXAM.state.remainingMs + 500) / 10000)) {
      try {
        await setDoc(doc(db, "timers", EXAM.state.username), { remainingMs: EXAM.state.remainingMs, updatedAt: Date.now() }, { merge: true });
      } catch (err) {
        console.warn("Could not save timer:", err);
      }
    }
  }, 500);
}

// periodic session save (saves session doc to Firestore)
let periodicSaveId = null;
function startPeriodicSessionSave(){
  stopPeriodicSessionSave();
  periodicSaveId = setInterval(()=> {
    if(EXAM && EXAM.state && EXAM.state.username) {
      saveSessionToFirestore(EXAM.state.username, EXAM.state, EXAM.paper).catch(e => console.warn('periodic save failed', e));
    }
  }, 7000);
}
function stopPeriodicSessionSave(){ if(periodicSaveId) { clearInterval(periodicSaveId); periodicSaveId = null; } }

// Save session doc into Firestore
async function saveSessionToFirestore(username, state, paper){
  if(!username) return;
  try {
    await setDoc(doc(db, "sessions", username), { state, paperIds: (paper||[]).map(q=>q.id), updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn("saveSessionToFirestore failed", err);
  }
}
window.saveSessionToFirestore = saveSessionToFirestore;

// loadSessionDoc for resume logic
async function loadSessionDoc(username){
  try {
    const snap = await getDoc(doc(db, "sessions", username));
    if(snap.exists()) return snap.data();
    return null;
  } catch (err) {
    console.warn("loadSessionDoc failed", err);
    return null;
  }
}

// restore attempt (used by resume flow)
async function tryRestoreSession(user){
  const sess = await loadSessionDoc(user.username);
  if(!sess || !sess.state) return false;
  // try to rehydrate EXAM state and paper
  EXAM.state = sess.state;
  EXAM.paper = (sess.paperIds || []).map(id => questions.find(q=>q.id===id)).filter(Boolean);
  if(!EXAM.paper || !EXAM.paper.length) return false;
  // find current index
  EXAM.cur = 0;
  startExam(user);
  // set remainingMs and resume timer
  startTimer();
  return true;
}

// increment resume counter (firestore helper)
async function incrementSessionResumeCount(username){
  try {
    const sRef = doc(db, "sessions", username);
    await setDoc(sRef, { resumes: ( (await getDoc(sRef)).data()?.resumes || 0) + 1 }, { merge: true });
    const snap = await getDoc(sRef);
    return snap.data()?.resumes || 0;
  } catch (err) {
    console.warn("incrementSessionResumeCount failed", err);
    return 0;
  }
}
window.incrementSessionResumeCount = incrementSessionResumeCount;

// ---------------- Submit exam ----------------
async function submitExam(auto = false) {
  if (!auto && !confirm('Submit exam now?')) return;
  const MAX_ATTEMPTS = 1;
  const arr = results || [];
  const userAttempts = arr.filter(r => r.username === EXAM.state.username);
  if (userAttempts.length >= MAX_ATTEMPTS) {
    alert(`⚠️ User "${EXAM.state.username}" has already attempted the exam ${MAX_ATTEMPTS} time(s).`);
    $('#examFullscreen').style.display = 'none';
    showSection('user');
    return;
  }

  stopTimer();
  const paper = EXAM.paper;
  let totalMarks = 0, earned = 0;
  const sectionScores = { 'Synopsis': 0, 'Minor Practical': 0, 'Major Practical': 0, 'Viva': 0 };

  paper.forEach(q => {
    totalMarks += (q.marks || 1);
    const chosen = EXAM.state.answers[q.id];
    if (q.category === "Major Practical") {
      if (chosen === 0) { earned += q.marks; sectionScores[q.category] += q.marks; }
      else if (chosen === 1) { const val = Math.round(q.marks * 0.75); earned += val; sectionScores[q.category] += val; }
      else if (chosen === 2) { const val = Math.round(q.marks * 0.5); earned += val; sectionScores[q.category] += val; }
    } else {
      if (chosen === q.answer) { earned += (q.marks || 1); sectionScores[q.category] = (sectionScores[q.category] || 0) + (q.marks || 1); }
    }
  });

  earned = Math.round(earned);
  Object.keys(sectionScores).forEach(k => { sectionScores[k] = Math.round(sectionScores[k]); });
  const percent = Math.round((earned / Math.max(1, totalMarks)) * 100);

  // build result object
  const result = {
    id: uid(),
    username: EXAM.state.username,
    score: earned,
    total: totalMarks,
    percent,
    sectionScores,
    timestamp: Date.now()
  };

  // persist locally and (optionally) to Firestore
  results = results || [];
  results.push(result);
  write(K_RESULTS, results);

  try {
    // save to firestore results/all (optionally encrypted in your original code)
    await setDoc(doc(db, "results", "all"), { data: JSON.stringify(results) }, { merge: true });
  } catch (err) {
    console.warn("Failed saving results to Firestore:", err);
  }

  // clear session doc
  try { await setDoc(doc(db, "sessions", EXAM.state.username), { remainingMs: 0, updatedAt: Date.now(), paperIds: [], answers: {}, flags: {}, resumes: 0 }, { merge: true }); } catch(e){ console.warn(e); }

  // show score and redirect in a few seconds
  $('#fsQuestion').innerHTML = `<div style="text-align:center;font-size:22px;font-weight:900">Your Score: ${percent}%</div><div id="redirectMsg" style="text-align:center;margin-top:10px;font-size:14px;color:var(--muted)">Redirecting in 5s.</div>`;
  $('#fsOptions').innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>`;
  document.querySelectorAll('.fsFooter').forEach(el => el.style.display = 'flex');
  EXAM.state.submitted = true;

  let secs = 5;
  const msgEl = document.getElementById('redirectMsg');
  const countdown = setInterval(() => {
    secs--;
    if (secs > 0) {
      msgEl.textContent = `Redirecting in ${secs}s.`;
    } else {
      clearInterval(countdown);
      $('#examFullscreen').style.display = 'none';
      showSection('user');
    }
  }, 1000);

  renderResults();
}
window.submitExam = submitExam;

// ---------------- Lock / pause / unlock exam ----------------
const ADMIN_UNLOCK_PASS = "exam123";
let examPaused = false;

function enterFullscreen(el) {
  if (el.requestFullscreen) el.requestFullscreen();
  else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if (el.msRequestFullscreen) el.msRequestFullscreen();
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && !EXAM.state?.submitted) {
    pauseExam();
  }
});

async function pauseExam() {
  try {
    examPaused = true;
    if (EXAM && EXAM.timerId) { clearInterval(EXAM.timerId); EXAM.timerId = null; }
    const lockNode = document.getElementById("lockScreen");
    if (lockNode) lockNode.style.display = "flex";
    if (!EXAM) EXAM = {};
    if (!EXAM.state) EXAM.state = {};
    EXAM.state.locked = true;
    if (EXAM.state.username) {
      try {
        await saveSessionToFirestore(EXAM.state.username, EXAM.state, EXAM.paper);
      } catch (err) { console.warn("Failed saving locked state", err); }
    }
  } catch (err) {
    console.warn("pauseExam error", err);
  }
}

function unlockExam() {
  const pass = document.getElementById('unlockPassword')?.value;
  if(pass === ADMIN_UNLOCK_PASS) {
    const lockNode = document.getElementById("lockScreen");
    if (lockNode) lockNode.style.display = "none";
    examPaused = false;
    if (EXAM && EXAM.state && !EXAM.state.submitted) startTimer();
  } else {
    alert('Incorrect password');
  }
}
window.unlockExam = unlockExam;

// ---------------- Misc admin/user UI helpers ----------------
function clearQuestionForm(){ editingId = null; $('#qText') && ($('#qText').value=''); $('#qA') && ($('#qA').value=''); $('#qB') && ($('#qB').value=''); $('#qC') && ($('#qC').value=''); $('#qD') && ($('#qD').value=''); }
window.clearQuestionForm = clearQuestionForm;

// initial UI setup
showSection('home');
renderQuestionsList();
renderResults();
renderUsersAdmin && renderUsersAdmin();

// expose debugging
window._data = { users, questions, results };
