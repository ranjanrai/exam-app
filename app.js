/* ============================================================
   app.js — No-Proctoring Build
   All camera, screen sharing, and live proctoring features disabled
   ============================================================ */

// Firestore save helper
async function saveToFirestore(collectionName, id, data, localKey=null) {
  try {
    if (localKey) write(localKey, data); // keep offline copy
    await setDoc(doc(db, collectionName, id), data);
    console.log(`✅ Firestore saved: ${collectionName}/${id}`);
    return true;
  } catch (err) {
    console.warn("⚠️ Firestore save failed, local only", err);
    return false;
  }
}

/* -------------------------
   Storage keys & defaults
   ------------------------- */
const K_USERS = 'offline_mcq_users_v1';
const K_QS = 'offline_mcq_qs_v1';
const K_RESULTS = 'offline_mcq_results_v1';
const K_ADMIN = 'offline_mcq_admin_v1';

const MASTER_ADMIN = { username: 'admin', password: 'exam123' };
const K_SETTINGS = 'offline_mcq_settings_v1';

/* Helpers */
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

// Escape HTML to show tags as plain text
// Safe escapeHTML: always coerce input to string before replacing
function escapeHTML(input) {
  if (input === null || input === undefined) return '';
  const str = (typeof input === 'string') ? input : (typeof input === 'object' ? JSON.stringify(input) : String(input));
  return str.replace(/[&<>"'`=\/]/g, function (s) {
    return ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',   // fixed
  "'": '&#39;',   // fixed
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
})[s];

window.escapeHTML = escapeHTML;

// Text encoder/decoder
const enc = new TextEncoder();
const dec = new TextDecoder();

// Fixed secret key
const SECRET_KEY = "exam-secret-key-123";

// Derive AES key from secret string
async function getKey() {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(SECRET_KEY), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("exam-salt"), iterations: 1000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(obj) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(obj));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: Array.from(iv), data: btoa(String.fromCharCode(...new Uint8Array(encrypted))) };
}

async function decryptData(encObj) {
  const key = await getKey();
  const iv = new Uint8Array(encObj.iv);
  const data = Uint8Array.from(atob(encObj.data), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(dec.decode(decrypted));
}

/* Load or seed data */
let users = read(K_USERS, []);
let questions = read(K_QS, []);
let results = read(K_RESULTS, []);
let adminCred = read(K_ADMIN, null);
let settings = read(K_SETTINGS, {
  durationMin: 20,
  customMsg: "📢 Welcome to your exam! Stay calm, focus, and do your best!",
  shuffle: false,
  allowAfterTime: false,
  logo: "",
  author: "",
  college: "",
  subject: "",
  subjectCode: "",
  fullMarks: 0,
  counts: {
    Synopsis: 0,
    "Minor Practical": 0,
    "Major Practical": 0,
    Viva: 0
  }
});
let screenShareEnabled = false;

if(!adminCred) write(K_ADMIN, MASTER_ADMIN);

if(questions.length === 0){
  questions = [
    { id: uid(), question: 'HTML stands for?', options: ['Hyperlinks Text Markup','Home Tool Markup','Hyper Text Markup Language','Hyperlinking Text Markdown'], answer: 2, marks: 1, category: 'Synopsis' },
    { id: uid(), question: 'Which tag defines paragraph?', options: ['<p>','<para>','<pg>','<par>'], answer: 0, marks: 1, category: 'Minor Practical' },
    { id: uid(), question: 'Which method adds to array end?', options: ['push','pop','shift','unshift'], answer: 0, marks: 2, category: 'Major Practical' },
    { id: uid(), question: 'Does localStorage persist after browser restart?', options: ['Yes','No','Sometimes','Depends'], answer: 0, marks: 1, category: 'Viva' }
  ];
  write(K_QS, questions);
}
function downloadBackup() {
  const backup = {
    users,
    questions,
    results,
    settings,
    adminCred
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "exam_full_backup.json";
  a.click();
}

function importFullBackup(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const backup = JSON.parse(e.target.result);

      users = backup.users || [];
      questions = backup.questions || [];
      results = backup.results || [];

      settings = {
        ...settings,
        durationMin: backup.settings?.durationMin ?? settings.durationMin ?? 30,
        customMsg: backup.settings?.customMsg ?? settings.customMsg ?? "📢 Welcome to your exam! Stay calm, focus, and do your best!",
        shuffle: backup.settings?.shuffle ?? settings.shuffle ?? false,
        allowAfterTime: backup.settings?.allowAfterTime ?? settings.allowAfterTime ?? false,
        logo: backup.settings?.logo ?? settings.logo ?? "",
        author: backup.settings?.author ?? settings.author ?? "",
        college: backup.settings?.college ?? settings.college ?? "",
        subject: backup.settings?.subject ?? settings.subject ?? "",
        subjectCode: backup.settings?.subjectCode ?? settings.subjectCode ?? "",
        fullMarks: backup.settings?.fullMarks ?? settings.fullMarks ?? 0,
        counts: {
          Synopsis: backup.settings?.counts?.Synopsis ?? settings.counts?.Synopsis ?? 0,
          "Minor Practical": backup.settings?.counts?.["Minor Practical"] ?? settings.counts?.["Minor Practical"] ?? 0,
          "Major Practical": backup.settings?.counts?.["Major Practical"] ?? settings.counts?.["Major Practical"] ?? 0,
          Viva: backup.settings?.counts?.Viva ?? settings.counts?.Viva ?? 0
        }
      };

      adminCred = backup.adminCred || MASTER_ADMIN;

      write(K_USERS, users);
      write(K_QS, questions);
      write(K_RESULTS, results);
      write(K_SETTINGS, settings);
      write(K_ADMIN, adminCred);

      alert("✅ Full backup restored!");
      renderUsersAdmin();
      renderQuestionsList();
      renderResults();
      renderSettingsAdmin();
    } catch (err) {
      alert("❌ Invalid backup file");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function updateBackup() {
  const backup = {
    users,
    questions,
    results,
    settings,
    adminCred
  };
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

/* UI: show sections */
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

  ['user','import','adminLogin','adminPanel'].forEach(s => { 
    const el = document.getElementById(s); 
    if(!el) return; 
    el.classList.add('hidden'); 
  });
  const target = document.getElementById(id);
  if(target) target.classList.remove('hidden');

  if(id === 'adminPanel') {
    renderQuestionsList();
    renderUsersAdmin();
    renderResults();
  }
}

if (typeof initVisitorSession === "function") {
  try { initVisitorSession(); } catch(e) { console.warn("initVisitorSession failed", e); }
}

document.addEventListener('DOMContentLoaded', ()=> {
  if(typeof showSection === 'function') showSection('home');

  const adminBtn = document.getElementById('homeAdminBtn');
  if(adminBtn) adminBtn.addEventListener('click', ()=> showSection('adminLogin'));

  const loginBtn = document.getElementById('homeLoginBtn');
  if(loginBtn) loginBtn.addEventListener('click', async ()=> {
    const u = document.getElementById('homeUsername').value.trim();
    const p = document.getElementById('homePassword').value;
    if(!u || !p) return alert('Enter username and password');

    document.getElementById('userName').value = u;
    document.getElementById('userPass').value = p;

    showSection('user');

    if(typeof handleUserLogin === 'function') {
      setTimeout(()=> handleUserLogin(), 120);
    } else if(typeof handleUserLogin_withResume === 'function') {
      setTimeout(()=> handleUserLogin_withResume(), 120);
    } else {
      alert('Login handler not found – ensure handleUserLogin exists.');
    }
  });

  const importFileInput = document.getElementById('importFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.json')) {
        alert('Please select a .json backup file');
        importFileInput.value = '';
        return;
      }
      if (!confirm('Importing will overwrite local users, questions, results and settings. Proceed?')) {
        importFileInput.value = '';
        return;
      }
      importFullBackup(file);
      importFileInput.value = '';
    });
  }

  // Note: camera and screen share functions removed in no-proctoring build
  document.getElementById('homePassword').addEventListener('keydown', (e)=>{ 
    if(e.key === 'Enter') document.getElementById('homeLoginBtn').click(); 
  });
});
/* ---------- USER FLOW ---------- */

/* convert File -> base64 data URL */
function fileToDataURL(file){ 
  return new Promise(res => { 
    const fr = new FileReader(); 
    fr.onload = ()=> res(fr.result); 
    fr.readAsDataURL(file); 
  }); 
}

async function getResultsArray() {
  if (Array.isArray(results)) return results;

  const stored = read(K_RESULTS, null);
  if (stored) {
    try {
      const arr = await decryptData(stored);
      if (Array.isArray(arr)) {
        results = arr;
        return results;
      }
    } catch (e) {
      console.warn("Could not decrypt local results", e);
    }
  }

  try {
    const snap = await getDoc(doc(db, "results", "all"));
    if (snap.exists()) {
      const enc = snap.data().data;
      const arr = await decryptData(enc);
      if (Array.isArray(arr)) {
        results = arr;
        return results;
      }
    }
  } catch (e) {
    console.warn("Could not load results from Firestore", e);
  }

  results = [];
  return results;
}

/* ---------------- EXAM RUNTIME ---------------- */

let EXAM = {
  paper: [],
  state: null,
  timerId: null,
  cur: 0,
  cfg: { durationMin: 30, total: null, shuffle: false }
};

function buildPaper(qbank, shuffle){
  let selected = [];

  const byCategory = {
    Synopsis: qbank.filter(q => q.category === "Synopsis"),
    "Minor Practical": qbank.filter(q => q.category === "Minor Practical"),
    "Major Practical": qbank.filter(q => q.category === "Major Practical"),
    Viva: qbank.filter(q => q.category === "Viva")
  };

  function pickRandom(arr, count){
    const copy = arr.slice();
    const chosen = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      chosen.push(copy.splice(idx,1)[0]);
    }
    return chosen;
  }

  for (let cat in settings.counts){
    if (byCategory[cat]) {
      selected = selected.concat(pickRandom(byCategory[cat], settings.counts[cat]));
    }
  }

  if (shuffle) {
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
  }

  return selected.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options,
    answer: q.answer,
    marks: q.marks,
    category: q.category
  }));
}

async function startExam(user){
  enterFullscreen(document.documentElement);

  EXAM.cfg.total   = settings.totalQs || questions.length;
  EXAM.cfg.shuffle = !!settings.shuffle;
  const durationMin = Number(settings.durationMin ?? 30);
  EXAM.cfg.durationMin = durationMin;

  console.log(`⏳ Starting exam with duration: ${EXAM.cfg.durationMin} minutes`);

  document.getElementById("examMsg").textContent = settings.customMsg || "";
  document.getElementById("examCharacterName").textContent = user.fullName || user.username;

  EXAM.paper = buildPaper(questions, EXAM.cfg.shuffle);

  const durationMs = Math.max(1, durationMin) * 60_000;

  EXAM.state = {
    username: user.username,
    answers: {},
    flags: {},
    startedAt: Date.now(),
    durationMs: durationMs,
    remainingMs: durationMs,
    submitted: false
  };
  EXAM.cur = 0;

  $('#examFullscreen').style.display = 'flex';
  $('#fsPhoto').src = user.photo || '';
  $('#fsName').textContent = user.fullName || user.username;

  paintQuestion();

  // ✅ streaming removed in no-proctoring build

  startTimer();
  await saveSessionToFirestore(user.username, EXAM.state, EXAM.paper);
  startPeriodicSessionSave();
}

async function loadTimer(username) {
  try {
    const snap = await getDoc(doc(db, "timers", username));
    if (snap.exists()) {
      const saved = snap.data();
      if (EXAM.state) {
        EXAM.state.remainingMs = saved.remainingMs;
      }
      console.log("⏳ Restored timer for", username, saved.remainingMs);
    }
  } catch (err) {
    console.error("⚠️ Failed to load timer:", err);
  }
}
function paintQuestion(){
  if (!EXAM.paper || !EXAM.paper.length) return;
  const q = EXAM.paper[EXAM.cur];
  if(!q) return;

  $('#fsQuestion').textContent = `${EXAM.cur+1}. ${q.question}`;

  const optsWrap = $('#fsOptions');
  optsWrap.innerHTML = '';

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'fsOpt';
    btn.textContent = opt;

    if(EXAM.state.answers[q.id] === i){
      btn.classList.add('selected');
    }

    btn.onclick = () => {
      EXAM.state.answers[q.id] = i;
      paintQuestion();
    };

    optsWrap.appendChild(btn);
  });

  renderAnswerStats();
  renderNav();
}

function renderAnswerStats() {
  if(!EXAM.state) return;
  const answered = Object.keys(EXAM.state.answers || {}).length;
  const total = EXAM.paper.length;
  const stats = document.querySelector('.answer-stats');
  if (stats) {
    stats.innerHTML = `<span>Answered: ${answered}/${total}</span>`;
  }
}

function renderNav(){
  const nav = $('#questionNav');
  if(!nav) return;
  nav.innerHTML = '';
  EXAM.paper.forEach((q, idx) => {
    const b = document.createElement('button');
    b.textContent = idx+1;
    if(EXAM.state.answers[q.id] !== undefined) {
      b.className = 'btn warn';
    } else {
      b.className = 'btn';
    }
    b.onclick = ()=>{ EXAM.cur = idx; paintQuestion(); };
    nav.appendChild(b);
  });
}

function startTimer(){
  const timerEl = $('#timer');
  function update(){
    if(!EXAM.state) return;
    const elapsed = Date.now() - EXAM.state.startedAt;
    EXAM.state.remainingMs = Math.max(0, EXAM.state.durationMs - elapsed);
    const mins = Math.floor(EXAM.state.remainingMs/60000);
    const secs = Math.floor((EXAM.state.remainingMs%60000)/1000);
    if(timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;

    if(EXAM.state.remainingMs <= 0){
      submitExam();
      clearInterval(EXAM.timerId);
    }
  }
  update();
  EXAM.timerId = setInterval(update, 1000);
}

async function submitExam(){
  if(!EXAM.state || EXAM.state.submitted) return;
  if(!confirm('Submit your exam?')) return;

  EXAM.state.submitted = true;
  clearInterval(EXAM.timerId);

  let score = 0;
  EXAM.paper.forEach(q => {
    if(EXAM.state.answers[q.id] === q.answer) score += q.marks;
  });

  const record = {
    username: EXAM.state.username,
    answers: EXAM.state.answers,
    score,
    total: settings.fullMarks || EXAM.paper.reduce((a,b)=>a+b.marks,0),
    startedAt: EXAM.state.startedAt,
    submittedAt: Date.now()
  };

  results.push(record);
  write(K_RESULTS, results);

  try {
    const encrypted = await encryptData(results);
    await setDoc(doc(db,"results","all"), { data: encrypted });
  } catch (err) {
    console.warn("⚠️ Firestore save failed, results stored locally", err);
  }

  alert(`✅ Submitted! Score: ${score}`);
  exitFullscreen();
  location.reload();
}

/* ------------- SAVE SESSION --------------- */

async function saveSessionToFirestore(username, state, paper){
  try {
    const encrypted = await encryptData({ state, paper });
    await setDoc(doc(db, "sessions", username), { data: encrypted });
    console.log("✅ Session saved for", username);
  } catch (err) {
    console.warn("⚠️ Failed to save session", err);
  }
}

async function loadSessionFromFirestore(username){
  try {
    const snap = await getDoc(doc(db,"sessions",username));
    if(snap.exists()){
      const decrypted = await decryptData(snap.data().data);
      return decrypted;
    }
  } catch (err) {
    console.warn("⚠️ Failed to load session", err);
  }
  return null;
}

function startPeriodicSessionSave(){
  if(EXAM.state){
    setInterval(()=> {
      saveSessionToFirestore(EXAM.state.username, EXAM.state, EXAM.paper);
    }, 30000);
  }
}
/* ------------- FULLSCREEN HELPERS --------------- */

function enterFullscreen(el){
  if(el.requestFullscreen) el.requestFullscreen();
  else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if(el.msRequestFullscreen) el.msRequestFullscreen();
}

function exitFullscreen(){
  if(document.exitFullscreen) document.exitFullscreen();
  else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
  else if(document.msExitFullscreen) document.msExitFullscreen();
}

/* ------------- ADMIN PANEL --------------- */

function renderQuestionsList(){
  const list = document.getElementById('adminQuestionList');
  if(!list) return;
  list.innerHTML = '';
  questions.forEach((q, idx) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class=\"admin-question-text\">
        <b>${idx+1}. ${escapeHTML(q.question)}</b>
        <div class=\"small\">Category: ${escapeHTML(q.category)} | Marks: ${q.marks}</div>
        <div class=\"small\">Options: ${q.options.map(o=>escapeHTML(o)).join(', ')} | Ans: ${q.answer+1}</div>
      </div>
      <div>
        <button class='btn' onclick='editQuestion(\"${q.id}\")'>Edit</button>
        <button class='btn danger' onclick='deleteQuestion(\"${q.id}\")'>Delete</button>
      </div>`;
    list.appendChild(div);
  });
}

function renderUsersAdmin(){
  const list = document.getElementById('adminUserList');
  if(!list) return;
  list.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div>
        <b>${escapeHTML(u.username)}</b>
        <div class=\"small\">${escapeHTML(u.fullName || '')}</div>
      </div>
      <div>
        <button class='btn danger' onclick='deleteUser(\"${u.username}\")'>Delete</button>
      </div>`;
    list.appendChild(div);
  });
}

function renderResults(){
  const list = document.getElementById('adminResultsList');
  if(!list) return;
  list.innerHTML = '';
  results.forEach(r => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div>
        <b>${escapeHTML(r.username)}</b>
        <div class=\"small\">Score: ${r.score}/${r.total}</div>
        <div class=\"small\">Started: ${new Date(r.startedAt).toLocaleString()}</div>
        <div class=\"small\">Submitted: ${new Date(r.submittedAt).toLocaleString()}</div>
      </div>`;
    list.appendChild(div);
  });
}

function renderSettingsAdmin(){
  const durEl = document.getElementById('setDuration');
  if(durEl) durEl.value = settings.durationMin;

  const msgEl = document.getElementById('setCustomMsg');
  if(msgEl) msgEl.value = settings.customMsg;

  const shuffleEl = document.getElementById('setShuffle');
  if(shuffleEl) shuffleEl.checked = settings.shuffle;

  const allowEl = document.getElementById('setAllowAfter');
  if(allowEl) allowEl.checked = settings.allowAfterTime;

  const logoEl = document.getElementById('setLogo');
  if(logoEl) logoEl.value = settings.logo;

  const authorEl = document.getElementById('setAuthor');
  if(authorEl) authorEl.value = settings.author;

  const collegeEl = document.getElementById('setCollege');
  if(collegeEl) collegeEl.value = settings.college;

  const subjEl = document.getElementById('setSubject');
  if(subjEl) subjEl.value = settings.subject;

  const codeEl = document.getElementById('setSubjectCode');
  if(codeEl) codeEl.value = settings.subjectCode;

  const fmEl = document.getElementById('setFullMarks');
  if(fmEl) fmEl.value = settings.fullMarks;

  const synopsisEl = document.getElementById('setCountSynopsis');
  if(synopsisEl) synopsisEl.value = settings.counts.Synopsis;

  const minorEl = document.getElementById('setCountMinor');
  if(minorEl) minorEl.value = settings.counts[\"Minor Practical\"];

  const majorEl = document.getElementById('setCountMajor');
  if(majorEl) majorEl.value = settings.counts[\"Major Practical\"];

  const vivaEl = document.getElementById('setCountViva');
  if(vivaEl) vivaEl.value = settings.counts.Viva;
}
function saveSettingsAdmin(){
  settings.durationMin = Number(document.getElementById('setDuration').value) || 30;
  settings.customMsg = document.getElementById('setCustomMsg').value || "";
  settings.shuffle = document.getElementById('setShuffle').checked;
  settings.allowAfterTime = document.getElementById('setAllowAfter').checked;
  settings.logo = document.getElementById('setLogo').value || "";
  settings.author = document.getElementById('setAuthor').value || "";
  settings.college = document.getElementById('setCollege').value || "";
  settings.subject = document.getElementById('setSubject').value || "";
  settings.subjectCode = document.getElementById('setSubjectCode').value || "";
  settings.fullMarks = Number(document.getElementById('setFullMarks').value) || 0;

  settings.counts.Synopsis = Number(document.getElementById('setCountSynopsis').value) || 0;
  settings.counts["Minor Practical"] = Number(document.getElementById('setCountMinor').value) || 0;
  settings.counts["Major Practical"] = Number(document.getElementById('setCountMajor').value) || 0;
  settings.counts.Viva = Number(document.getElementById('setCountViva').value) || 0;

  write(K_SETTINGS, settings);
  alert("✅ Settings saved");
}

function addUser(){
  const u = document.getElementById('newUser').value.trim();
  const p = document.getElementById('newPass').value;
  if(!u || !p) return alert('Enter username and password');

  if(users.some(x=>x.username===u)) return alert('User already exists');

  users.push({username:u,password:p,fullName:u});
  write(K_USERS, users);
  renderUsersAdmin();
  document.getElementById('newUser').value = '';
  document.getElementById('newPass').value = '';
}

function deleteUser(username){
  if(!confirm('Delete user '+username+'?')) return;
  users = users.filter(u=>u.username!==username);
  write(K_USERS, users);
  renderUsersAdmin();
}

function addQuestion(){
  const q = document.getElementById('newQ').value.trim();
  const o1 = document.getElementById('newO1').value;
  const o2 = document.getElementById('newO2').value;
  const o3 = document.getElementById('newO3').value;
  const o4 = document.getElementById('newO4').value;
  const ans = Number(document.getElementById('newAns').value)-1;
  const marks = Number(document.getElementById('newMarks').value);
  const cat = document.getElementById('newCategory').value;

  if(!q||!o1||!o2||!o3||!o4||ans<0) return alert('Fill all fields');

  questions.push({id:uid(),question:q,options:[o1,o2,o3,o4],answer:ans,marks,category:cat});
  write(K_QS, questions);
  renderQuestionsList();
}

function deleteQuestion(id){
  if(!confirm('Delete question?')) return;
  questions = questions.filter(q=>q.id!==id);
  write(K_QS, questions);
  renderQuestionsList();
}

function editQuestion(id){
  const q = questions.find(x=>x.id===id);
  if(!q) return;
  document.getElementById('editQ').value = q.question;
  document.getElementById('editO1').value = q.options[0];
  document.getElementById('editO2').value = q.options[1];
  document.getElementById('editO3').value = q.options[2];
  document.getElementById('editO4').value = q.options[3];
  document.getElementById('editAns').value = q.answer+1;
  document.getElementById('editMarks').value = q.marks;
  document.getElementById('editCategory').value = q.category;
  document.getElementById('editId').value = q.id;
  document.getElementById('editModal').style.display='block';
}

function saveEditedQuestion(){
  const id = document.getElementById('editId').value;
  const q = questions.find(x=>x.id===id);
  if(!q) return;
  q.question = document.getElementById('editQ').value;
  q.options[0] = document.getElementById('editO1').value;
  q.options[1] = document.getElementById('editO2').value;
  q.options[2] = document.getElementById('editO3').value;
  q.options[3] = document.getElementById('editO4').value;
  q.answer = Number(document.getElementById('editAns').value)-1;
  q.marks = Number(document.getElementById('editMarks').value);
  q.category = document.getElementById('editCategory').value;
  write(K_QS, questions);
  renderQuestionsList();
  document.getElementById('editModal').style.display='none';
}
/* ------------------ ADMIN AUTH ------------------ */

function handleAdminLogin(){
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value;
  if(!u||!p) return alert('Enter credentials');
  if(u===adminCred.username && p===adminCred.password){
    showSection('adminPanel');
    renderSettingsAdmin();
  } else {
    alert('❌ Invalid admin credentials');
  }
}

/* ------------------ MISC HELPERS ------------------ */

function clearResults(){
  if(!confirm('Clear all results?')) return;
  results = [];
  write(K_RESULTS, results);
  renderResults();
}

function clearUsers(){
  if(!confirm('Clear all users?')) return;
  users = [];
  write(K_USERS, users);
  renderUsersAdmin();
}

function clearQuestions(){
  if(!confirm('Clear all questions?')) return;
  questions = [];
  write(K_QS, questions);
  renderQuestionsList();
}

function changeAdminPassword(){
  const p = prompt('Enter new admin password:');
  if(!p) return;
  adminCred.password = p;
  write(K_ADMIN, adminCred);
  alert('✅ Admin password updated');
}

/* ----------- KEYBOARD SHORTCUTS ----------- */

document.addEventListener('keydown', e=>{
  if(document.getElementById('examFullscreen').style.display==='flex'){
    if(e.key==='ArrowRight'){ EXAM.cur=Math.min(EXAM.cur+1,EXAM.paper.length-1); paintQuestion(); }
    if(e.key==='ArrowLeft'){ EXAM.cur=Math.max(EXAM.cur-1,0); paintQuestion(); }
  }
});

/* ----------- WINDOW EVENTS ----------- */

// Prevent leaving during exam
window.addEventListener('beforeunload', (e)=>{
  if(EXAM.state && !EXAM.state.submitted){
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ----------- INIT ----------- */

function init(){
  renderQuestionsList();
  renderUsersAdmin();
  renderResults();
  renderSettingsAdmin();
}

document.addEventListener('DOMContentLoaded', init);

// ======================================================
//  NO-PROCTORING STUBS (disabled functions below)
// ======================================================

function startHomeCamera(){ /* proctoring disabled */ }
function stopHomeCamera(){ /* proctoring disabled */ }
function startHomeScreenShare(){ /* proctoring disabled */ }
function stopHomeScreenShare(){ /* proctoring disabled */ }
function startExamStream(){ /* proctoring disabled */ }
function stopExamStream(){ /* proctoring disabled */ }
function adminStartWatch(){ /* proctoring disabled */ }
function adminStopWatch(){ /* proctoring disabled */ }
function watchLiveSession(){ /* proctoring disabled */ }
function startSessionWatcher(){ /* proctoring disabled */ }
function stopSessionWatcher(){ /* proctoring disabled */ }
function viewUserScreen(){ /* proctoring disabled */ }
function addIceCandidate(){ /* proctoring disabled */ }
// ======================================================
// Expose globals if needed
// ======================================================

window.saveToFirestore = saveToFirestore;
window.downloadBackup = downloadBackup;
window.importFullBackup = importFullBackup;
window.updateBackup = updateBackup;

window.showSection = showSection;
window.handleAdminLogin = handleAdminLogin;

window.addUser = addUser;
window.deleteUser = deleteUser;
window.addQuestion = addQuestion;
window.deleteQuestion = deleteQuestion;
window.editQuestion = editQuestion;
window.saveEditedQuestion = saveEditedQuestion;

window.saveSettingsAdmin = saveSettingsAdmin;
window.clearResults = clearResults;
window.clearUsers = clearUsers;
window.clearQuestions = clearQuestions;
window.changeAdminPassword = changeAdminPassword;

window.startExam = startExam;
window.submitExam = submitExam;

console.log("✅ No-proctoring build of app.js loaded successfully");

