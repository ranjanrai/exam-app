/* app.js - restored admin session-management UI & controls (lock/unlock/force-submit/view)
   WITHOUT any video / getUserMedia / RTCPeerConnection / screen-share code.
*/

/* Helpers & storage keys */
const K_USERS = 'offline_mcq_users_v1';
const K_QS = 'offline_mcq_qs_v1';
const K_RESULTS = 'offline_mcq_results_v1';
const K_ADMIN = 'offline_mcq_admin_v1';
const MASTER_ADMIN = { username: 'admin', password: 'exam123' };
const K_SETTINGS = 'offline_mcq_settings_v1';

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
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    })[s];
  });
}
window.escapeHTML = escapeHTML;

// Text encoder/decoder & simple AES helpers (keeps exam data encrypted local)
const enc = new TextEncoder();
const dec = new TextDecoder();
const SECRET_KEY = "exam-secret-key-123";

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
  counts: { Synopsis: 0, "Minor Practical": 0, "Major Practical": 0, Viva: 0 }
});

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
  const backup = { users, questions, results, settings, adminCred };
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
      renderUsersAdmin?.();
      renderQuestionsList?.();
      renderResults?.();
      renderSettingsAdmin?.();
    } catch (err) {
      alert("❌ Invalid backup file");
      console.error(err);
    }
  };
  reader.readAsText(file);
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

  ['user','import','adminLogin','adminPanel','adminSessions'].forEach(s => { const el = document.getElementById(s); if(!el) return; el.classList.add('hidden'); });
  const target = document.getElementById(id);
  if(target) target.classList.remove('hidden');

  if(id === 'adminPanel') {
    renderQuestionsList?.();
    renderUsersAdmin?.();
    renderResults?.();
  }
  if(id === 'adminSessions') {
    renderSessionsAdmin();
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

    // copy to existing user form
    const nameField = document.getElementById('userName');
    const passField = document.getElementById('userPass');
    if (nameField) nameField.value = u;
    if (passField) passField.value = p;

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
});

/* ---------- USER FLOW ---------- */
function fileToDataURL(file){ return new Promise(res => { const fr = new FileReader(); fr.onload = ()=> res(fr.result); fr.readAsDataURL(file); }); }

async function getResultsArray() {
  if (Array.isArray(results)) return results;
  const stored = read(K_RESULTS, null);
  if (stored) {
    try {
      const arr = await decryptData(stored);
      if (Array.isArray(arr)) { results = arr; return results; }
    } catch (e) { console.warn("Could not decrypt local results", e); }
  }
  try {
    const snap = await getDoc(doc(db, "results", "all"));
    if (snap.exists()) {
      const enc = snap.data().data;
      const arr = await decryptData(enc);
      if (Array.isArray(arr)) { results = arr; return results; }
    }
  } catch (e) { console.warn("Could not load results from Firestore", e); }
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
    id: q.id, question: q.question, options: q.options, answer: q.answer, marks: q.marks, category: q.category
  }));
}

function enterFullscreen(el) {
  try {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  } catch(e) { /* ignore */ }
}

async function startExam(user) {
  enterFullscreen(document.documentElement);

  EXAM.cfg.total   = settings.totalQs || questions.length;
  EXAM.cfg.shuffle = !!settings.shuffle;
  const durationMin = Number(settings.durationMin ?? 30);
  EXAM.cfg.durationMin = durationMin;

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

/* Session save / heartbeat / watchers */
let cachedIP = null;
async function getUserIP() {
  if (cachedIP) return cachedIP;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    cachedIP = data.ip;
    return cachedIP;
  } catch (e) {
    console.warn("⚠️ Failed to fetch IP", e);
    cachedIP = "unknown";
    return cachedIP;
  }
}

async function saveSessionToFirestore(username, state = null, paper = null) {
  if (!username) return false;
  try {
    if (!EXAM.state.ip) {
      EXAM.state.ip = await getUserIP();
    }

    const payload = {
      remainingMs: state?.remainingMs ?? EXAM.state?.remainingMs ?? 0,
      updatedAt: Date.now(),
      startedAt: state?.startedAt ?? EXAM.state?.startedAt ?? Date.now(),
      cur: state?.cur ?? EXAM.cur ?? 0,
      paperIds: paper ? paper.map(p => p.id) : (EXAM.paper ? EXAM.paper.map(p => p.id) : []),
      answers: state?.answers ?? EXAM.state?.answers ?? {},
      flags: state?.flags ?? EXAM.state?.flags ?? {},
      locked: (state && state.hasOwnProperty('locked')) 
                ? !!state.locked 
                : !!(typeof examPaused !== 'undefined' && examPaused),
      ip: EXAM.state.ip || "unknown"
    };

    if (state?.unlockedBy) payload.unlockedBy = state.unlockedBy;
    if (state?.unlockedAt) payload.unlockedAt = state.unlockedAt;

    await setDoc(doc(db, "sessions", username), payload, { merge: true });
    return true;
  } catch (err) {
    console.warn("⚠️ Could not save session:", err);
    return false;
  }
}

/* ---------- NEW: admin session management helpers ---------- */

/**
 * lockExamForUser(username, reason)
 * - Sets sessions/{username}.locked = true and records a reason/metadata.
 */
async function lockExamForUser(username, reason = '') {
  if (!username) return false;
  try {
    const payload = {
      locked: true,
      lockReason: reason || 'admin-lock',
      lockedAt: Date.now(),
      lockedBy: (window.ADMIN_NAME || window.currentAdmin || 'admin'),
      updatedAt: Date.now()
    };
    await setDoc(doc(db, "sessions", username), payload, { merge: true });

    // If this client is the locked user, pause local UI
    try {
      if (EXAM && EXAM.state && EXAM.state.username === username) {
        EXAM.state.locked = true;
        EXAM.state.lockReason = payload.lockReason;
        // stop timer locally
        if (EXAM.timerId) { clearInterval(EXAM.timerId); EXAM.timerId = null; }
        // show a lock screen UI if present
        const lockEl = document.getElementById('lockScreen');
        if (lockEl) lockEl.style.display = 'flex';
      }
    } catch (e) { /* ignore */ }

    // Refresh admin sessions list if open
    try { if (typeof renderSessionsAdmin === 'function') renderSessionsAdmin(); } catch(e){}

    return true;
  } catch (err) {
    console.warn('lockExamForUser failed', err);
    return false;
  }
}

/**
 * unlockExamForUser(username, by)
 * - Existing helper retained: sets locked=false and persists metadata.
 * - If student is online, watcher will resume their UI.
 */
async function unlockExamForUser(username, by = 'admin') {
  const userToUnlock = username || (EXAM && EXAM.state && EXAM.state.username) || null;
  if (!userToUnlock) return false;
  try {
    const payload = {
      locked: false,
      lockReason: '',
      unlockedBy: by || (window.ADMIN_NAME || window.currentAdmin || 'admin'),
      unlockedAt: Date.now(),
      updatedAt: Date.now()
    };

    if (typeof saveSessionToFirestore === 'function') {
      const merged = EXAM && EXAM.state && EXAM.state.username === userToUnlock
        ? { ...EXAM.state, ...payload }
        : { ...payload };
      await saveSessionToFirestore(userToUnlock, merged, EXAM.paper);
    } else {
      await setDoc(doc(db, "sessions", userToUnlock), payload, { merge: true });
    }

    if (EXAM && EXAM.state && EXAM.state.username === userToUnlock) {
      EXAM.state.locked = false;
      EXAM.state.lockReason = '';
      // hide lock UI locally
      const el = document.getElementById('lockScreen');
      if (el) el.style.display = 'none';
      // resume timer & autosave
      try { startTimer(); } catch(e){}
      try { startPeriodicSessionSave(); } catch(e){}
    }

    if (window.IS_ADMIN && typeof renderSessionsAdmin === 'function') {
      try { renderSessionsAdmin(); } catch (e) { console.warn('renderSessionsAdmin error', e); }
    }

    return true;
  } catch (err) {
    console.warn('unlockExamForUser: failed to unlock/persist session', err);
    return false;
  }
}

/* ---------- NEW: renderSessionsAdmin + realtime listener ---------- */

let SESSIONS_ONSNAP_UNSUB = null;

/**
 * renderSessionsAdmin()
 * - Renders a sessions list into #adminSessionsList (must exist in admin UI)
 * - If Firestore onSnapshot is available we use realtime updates.
 */
async function renderSessionsAdmin() {
  const container = document.getElementById('adminSessionsList');
  if (!container) return;

  container.innerHTML = '<div class="small">Loading sessions…</div>';

  try {
    // If onSnapshot & collection available, attach realtime listener (idempotent)
    if (typeof onSnapshot === 'function' && typeof collection === 'function' && typeof db !== 'undefined') {
      // detach old listener if any
      if (SESSIONS_ONSNAP_UNSUB) {
        try { SESSIONS_ONSNAP_UNSUB(); } catch(e) {}
        SESSIONS_ONSNAP_UNSUB = null;
      }

      const colRef = collection(db, "sessions");
      SESSIONS_ONSNAP_UNSUB = onSnapshot(colRef, snapshot => {
        const rows = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data ? docSnap.data() : (docSnap.data || {});
          rows.push({ id: docSnap.id, ...data });
        });
        // sort by updatedAt desc
        rows.sort((a,b)=> (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
        _renderSessionsRows(container, rows);
      }, err => {
        console.warn('sessions onSnapshot error:', err);
        // fallback to one-time query on error
        _fetchAndRenderSessionsOnce(container);
      });

      return; // realtime attached
    }

    // Fallback: fetch once
    await _fetchAndRenderSessionsOnce(container);

  } catch (err) {
    console.warn('renderSessionsAdmin error', err);
    container.innerHTML = '<div class="small">Failed to load sessions (see console)</div>';
  }
}

async function _fetchAndRenderSessionsOnce(container) {
  try {
    const col = collection(db, "sessions");
    const qSnap = await getDocs(col);
    const rows = [];
    qSnap.forEach(docSnap => {
      const data = docSnap.data ? docSnap.data() : (docSnap.data || {});
      rows.push({ id: docSnap.id, ...data });
    });
    rows.sort((a,b)=> (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
    _renderSessionsRows(container, rows);
  } catch (err) {
    console.warn('fetch sessions once failed', err);
    container.innerHTML = '<div class="small">Failed to load sessions (see console)</div>';
  }
}

function _renderSessionsRows(container, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = '<div class="small">No sessions found.</div>';
    return;
  }

  container.innerHTML = ''; // clear
  rows.forEach(r => {
    const wrapper = document.createElement('div');
    wrapper.className = 'list-item';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'space-between';

    const left = document.createElement('div');
    left.style.flex = '1';
    const when = r.updatedAt ? new Date(Number(r.updatedAt)).toLocaleString() : '';
    left.innerHTML = `
      <div style="font-weight:700">${escapeHTML(r.id)} <span style="font-weight:400;font-size:12px;color:var(--muted)">• ${when}</span></div>
      <div style="margin-top:6px;font-size:13px;color:var(--muted)">Remaining: ${Math.max(0, Math.floor((r.remainingMs || 0) / 60000))} min • Answers: ${r.answers ? Object.keys(r.answers).length : 0} • IP: ${escapeHTML(r.ip || 'unknown')}</div>
      ${r.locked ? `<div style="color:var(--danger);font-size:12px;margin-top:6px">Locked • Reason: ${escapeHTML(r.lockReason || '')}</div>` : ''}
    `;

    const actions = document.createElement('div');
    actions.style.whiteSpace = 'nowrap';

    // View button
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'View';
    viewBtn.onclick = () => _showSessionDetails(r);
    actions.appendChild(viewBtn);

    // Lock button
    const lockBtn = document.createElement('button');
    lockBtn.className = 'btn';
    lockBtn.style.marginLeft = '8px';
    lockBtn.textContent = 'Lock';
    lockBtn.onclick = async () => {
      const reason = prompt('Lock reason (optional):', 'admin-lock') || 'admin-lock';
      await lockExamForUser(r.id, reason);
    };
    actions.appendChild(lockBtn);

    // Unlock button (only enabled when locked)
    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'btn warn';
    unlockBtn.style.marginLeft = '8px';
    unlockBtn.textContent = 'Unlock';
    unlockBtn.disabled = !r.locked;
    unlockBtn.onclick = async () => {
      await unlockExamForUser(r.id);
    };
    actions.appendChild(unlockBtn);

    // Force submit / clear session
    const forceBtn = document.createElement('button');
    forceBtn.className = 'btn danger';
    forceBtn.style.marginLeft = '8px';
    forceBtn.textContent = 'Force Submit';
    forceBtn.onclick = async () => {
      if (!confirm(`Force submit and clear session for ${r.id}?`)) return;
      await _clearSessionAfterSubmit(r.id);
      alert('Session cleared/submitted.');
      // re-render list
      renderSessionsAdmin();
    };
    actions.appendChild(forceBtn);

    wrapper.appendChild(left);
    wrapper.appendChild(actions);
    container.appendChild(wrapper);
  });
}

/* helper: modal to show session details */
function _showSessionDetails(sessionObj) {
  const modalId = 'adminSessionDetailsModal';
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '99999';
    modal.innerHTML = `<div style="width:90%;max-width:720px;background:#041022;padding:18px;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.6);color:#e6eef8">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:800">Session: <span id="asd_username"></span></div>
        <div><button id="asd_close" class="btn">Close</button></div>
      </div>
      <div id="asd_body" style="margin-top:12px;white-space:pre-wrap;font-size:13px;color:var(--muted)"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#asd_close').onclick = ()=> { modal.remove(); };
  }

  document.getElementById('asd_username').textContent = sessionObj.id || '';
  const body = document.getElementById('asd_body');
  const formatted = {
    username: sessionObj.id,
    remainingMs: sessionObj.remainingMs,
    remainingMin: Math.floor((sessionObj.remainingMs || 0) / 60000),
    startedAt: sessionObj.startedAt ? new Date(Number(sessionObj.startedAt)).toLocaleString() : '',
    updatedAt: sessionObj.updatedAt ? new Date(Number(sessionObj.updatedAt)).toLocaleString() : '',
    ip: sessionObj.ip || 'unknown',
    locked: !!sessionObj.locked,
    lockReason: sessionObj.lockReason || '',
    answersCount: sessionObj.answers ? Object.keys(sessionObj.answers).length : 0,
    flagsCount: sessionObj.flags ? Object.keys(sessionObj.flags).filter(k=>sessionObj.flags[k]).length : 0,
    paperIds: Array.isArray(sessionObj.paperIds) ? sessionObj.paperIds.join(', ') : ''
  };
  body.textContent = JSON.stringify(formatted, null, 2);
  modal.style.display = 'flex';
}

/* ---------- existing session helpers (clear, heartbeat, resume) ---------- */

function startSessionHeartbeat(sessionId, intervalMs = 20000) {
  if (!sessionId) {
    console.warn('startSessionHeartbeat: no sessionId provided');
    return () => {};
  }
  const key = `hb_${sessionId}`;
  if (window[key]) return window[key].stop;
  const writeNow = () => {
    try {
      setDoc(doc(db, "sessions", sessionId), { updatedAt: Date.now() }, { merge: true }).catch(()=>{});
    } catch (err) {}
  };
  writeNow();
  const id = setInterval(writeNow, intervalMs);
  const stopper = () => {
    clearInterval(id);
    try { delete window[key]; } catch(e){}
  };
  window[key] = { id, stop: stopper };
  return stopper;
}
function stopSessionHeartbeat(sessionId) {
  const key = `hb_${sessionId}`;
  if (window[key] && typeof window[key].stop === 'function') {
    window[key].stop();
  }
}

window.addEventListener("beforeunload", async (ev) => {
  if (EXAM.state && !EXAM.state.submitted) {
    try {
      await saveSessionToFirestore(EXAM.state.username);
      incrementSessionResumeCount(EXAM.state.username);
    } catch (err) {
      console.warn("⚠️ beforeunload save error", err);
    }
  }
});

let RESUME_SAVE_INTERVAL = null;
function startPeriodicSessionSave() {
  if (RESUME_SAVE_INTERVAL) clearInterval(RESUME_SAVE_INTERVAL);
  RESUME_SAVE_INTERVAL = setInterval(() => {
    if (EXAM.state && !EXAM.state.submitted) {
      saveSessionToFirestore(EXAM.state.username);
    }
  }, 10_000);
}
function stopPeriodicSessionSave() {
  if (RESUME_SAVE_INTERVAL) { clearInterval(RESUME_SAVE_INTERVAL); RESUME_SAVE_INTERVAL = null; }
}

async function incrementSessionResumeCount(username) {
  if (!username) return;
  try {
    const ref = doc(db, "sessions", username);
    const snap = await getDoc(ref);
    let current = 0;
    if (snap.exists()) {
      const d = snap.data();
      current = Number(d.resumes || 0);
    }
    const updated = current + 1;
    await setDoc(ref, { resumes: updated, updatedAt: Date.now() }, { merge: true });
    return updated;
  } catch (err) {
    console.warn("⚠️ Failed to increment resume count:", err);
    return null;
  }
}

async function loadSessionDoc(username) {
  if (!username) return null;
  try {
    const snap = await getDoc(doc(db, "sessions", username));
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.warn("⚠️ Failed to load session doc:", err);
    return null;
  }
}

async function tryRestoreSession(user) {
  if (!user || !user.username) return false;
  const sess = await loadSessionDoc(user.username);
  if (!sess) return false;
  if (!Array.isArray(sess.paperIds) || sess.paperIds.length === 0) return false;

  const paper = sess.paperIds.map(id => {
    const q = questions.find(x => x.id === id);
    return q ? { id: q.id, question: q.question, options: q.options, answer: q.answer, marks: q.marks, category: q.category } : null;
  }).filter(Boolean);

  if (paper.length === 0) return false;

  EXAM.paper = paper;
  EXAM.cur = typeof sess.cur === "number" ? sess.cur : 0;
  EXAM.state = {
    username: user.username,
    answers: sess.answers || {},
    flags: sess.flags || {},
    startedAt: sess.startedAt || Date.now(),
    durationMs: (Number(settings.durationMin || EXAM.cfg.durationMin) * 60_000) || (sess.remainingMs || 0),
    remainingMs: Number(sess.remainingMs || 0),
    submitted: false
  };

  const durationMs = Math.max(1, Number(settings.durationMin || EXAM.cfg.durationMin)) * 60_000;
  EXAM.state.remainingMs = Math.min(Math.max(0, EXAM.state.remainingMs), durationMs);

  $('#examFullscreen').style.display = 'flex';
  $('#fsPhoto').src = user.photo || '';
  $('#fsName').textContent = user.fullName || user.username;
  paintQuestion();

  startPeriodicSessionSave();
  startTimer();

  try {
    if (typeof stopSessionWatcher === 'function') {
      try { stopSessionWatcher(); } catch (e) { }
    }
    if (typeof startSessionWatcher === 'function') {
      startSessionWatcher(EXAM.state.username);
      console.log('✅ startSessionWatcher attached for', EXAM.state.username);
    }
  } catch (err) {
    console.warn('Error while attaching session watcher:', err);
  }

  return true;
}

/* UI helpers (question render, nav, stats) */
function paintQuestion() {
  const q = EXAM.paper[EXAM.cur];
  if (!q) return;

  $('#fsQuestion').innerHTML =
    `${EXAM.cur+1}. (${q.category}) ${escapeHTML(q.question)}`;

  const opts = $('#fsOptions'); 
  opts.innerHTML = '';

  q.options.forEach((opt, i) => {
    const d = document.createElement('div');
    d.className = 'fsOpt' + (EXAM.state.answers[q.id] === i ? ' selected' : '');

    d.innerHTML = `
      <div style="width:28px;font-weight:800">${String.fromCharCode(65+i)}.</div>
      <div style="flex:1">${escapeHTML(opt)}</div>
    `;

    d.onclick = () => { 
      EXAM.state.answers[q.id] = i; 
      paintQuestion(); 
      updateProgress(); 
    };

    opts.appendChild(d);
  });

  $('#fsMeta').textContent = 
    `Question ${EXAM.cur+1} of ${EXAM.paper.length} • Answered: ${Object.keys(EXAM.state.answers).length}`;

  if (EXAM.state.flags[q.id]) {
    $('#fsMeta').textContent += " • ⚑ Flagged";
  }

  updateProgress();
  renderQuestionNav();
  updateStats();
}

function prevQuestion(){ if(EXAM.cur>0){ EXAM.cur--; paintQuestion(); } }
function nextQuestion(){ if(EXAM.cur < EXAM.paper.length - 1){ EXAM.cur++; paintQuestion(); } }
function toggleFlag(){ const q = EXAM.paper[EXAM.cur]; if(!q) return; EXAM.state.flags[q.id] = !EXAM.state.flags[q.id]; paintQuestion(); }

function updateProgress(){ const answered = Object.keys(EXAM.state.answers).length; const total = EXAM.paper.length; const pct = Math.round((answered/total) * 100); $('#fsProgressFill').style.width = pct + '%'; }

function renderQuestionNav(){
  const nav = document.getElementById('questionNav');
  nav.innerHTML = '';
  EXAM.paper.forEach((q,i)=>{
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = i+1;
    if(EXAM.state.answers[q.id] !== undefined) btn.style.background = '#34d399';
    if(i === EXAM.cur) btn.style.outline = '2px solid #60a5fa';
    btn.onclick = ()=>{ EXAM.cur = i; paintQuestion(); };
    nav.appendChild(btn);
  });
}

function updateStats(){
  const total = EXAM.paper.length;
  const answered = Object.keys(EXAM.state.answers || {}).length;
  const flagged = Object.keys(EXAM.state.flags || {}).filter(k=>EXAM.state.flags[k]).length;
  const stats = document.getElementById('fsAnswerStats');
  if (stats) stats.innerHTML = `<span>Answered: ${answered}/${total}</span><span> Flagged: ${flagged}</span>`;
}

/* Timer */
function startTimer() {
  stopTimer();
  const end = Date.now() + EXAM.state.remainingMs;
  updateTimerText();

  EXAM.timerId = setInterval(async () => {
    EXAM.state.remainingMs = end - Date.now();

    if (EXAM.state.remainingMs <= 0) {
      EXAM.state.remainingMs = 0;
      stopTimer();
      if (settings.allowAfterTime) {
      } else {
        submitExam(true);
      }
    }

    updateTimerText();

    if (Math.floor(EXAM.state.remainingMs / 10000) !== Math.floor((EXAM.state.remainingMs + 500) / 10000)) {
      try {
        await setDoc(
          doc(db, "timers", EXAM.state.username),
          { remainingMs: EXAM.state.remainingMs, updatedAt: Date.now() },
          { merge: true }
        );
        console.log("⏳ Timer saved for", EXAM.state.username);
      } catch (err) {
        console.warn("⚠️ Could not save timer:", err);
      }
    }

  }, 500);
}
function stopTimer() { if (EXAM.timerId) { clearInterval(EXAM.timerId); EXAM.timerId = null; } }
function updateTimerText() {
  const el = document.getElementById('fsTimer');
  if (!el || !EXAM.state) return;
  const ms = Math.max(0, EXAM.state.remainingMs || 0);
  const mm = Math.floor(ms / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  el.textContent = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

/* Submit & results */
async function submitExam(auto=false) {
  if (!EXAM.state || EXAM.state.submitted) return;
  if (!auto) {
    if (!confirm('Submit exam now?')) return;
  }
  EXAM.state.submitted = true;
  stopTimer();
  stopPeriodicSessionSave();
  // calculate score
  const score = EXAM.paper.reduce((acc,q) => {
    const got = EXAM.state.answers[q.id];
    if (got === undefined) return acc;
    return acc + (got === q.answer ? (q.marks || 1) : 0);
  }, 0);

  const payload = { username: EXAM.state.username, score, submittedAt: Date.now() };
  try {
    // Save encrypted results locally (and optionally Firestore)
    results = results || [];
    results.push({ username: EXAM.state.username, score, submittedAt: Date.now() });
    const enc = await encryptData(results);
    write(K_RESULTS, enc);
    try { await setDoc(doc(db, "results", EXAM.state.username), payload); } catch(e){ console.warn("Could not save to Firestore", e); }
    await _clearSessionAfterSubmit(EXAM.state.username);
    alert('✅ Exam submitted. Score: ' + score);
    $('#examFullscreen').style.display = 'none';
  } catch (err) {
    console.error('submitExam failed', err);
    alert('Failed to submit (see console).');
  }
}

async function _clearSessionAfterSubmit(username) {
  try {
    await setDoc(doc(db, "sessions", username), { remainingMs: 0, updatedAt: Date.now(), paperIds: [], answers: {}, flags: {}, resumes: 0 }, { merge: true });
  } catch (err) {
    console.warn("⚠️ failed to clear session after submit", err);
  }
}

/* Lock/unlock helpers (admin controls) - unlockExamForUser also defined above earlier */

/* Visibility change: optional lock on switching tabs */
document.addEventListener('visibilitychange', async () => {
  try {
    if (document.visibilityState === 'hidden' && EXAM.state && !EXAM.state.submitted) {
      if (typeof lockExamForUser === 'function') {
        await lockExamForUser('visibility-hidden');
      }
    }
  } catch (e) {
    console.warn('visibilitychange handler error', e);
  }
});

/* Realtime watcher (sessions) */
let SESSION_UNSUBSCRIBE = null;
function startSessionWatcher(username) {
  try {
    if (SESSION_UNSUBSCRIBE) {
      try { SESSION_UNSUBSCRIBE(); } catch(e) {}
      SESSION_UNSUBSCRIBE = null;
    }
    if (!username) return;
    const ref = doc(db, "sessions", username);
    SESSION_UNSUBSCRIBE = onSnapshot(ref, snap => {
      try {
        if (!snap.exists()) return;
        const s = snap.data();
        // Handle lock/unlock state
        if (s.locked) {
          examPaused = true;
          if (document.getElementById("lockScreen")) {
            document.getElementById("lockScreen").style.display = "flex";
          }
          if (EXAM && EXAM.timerId) {
            clearInterval(EXAM.timerId);
            EXAM.timerId = null;
          }
          return;
        }
        if (document.getElementById("lockScreen")) {
          document.getElementById("lockScreen").style.display = "none";
        }
        if (examPaused) {
          examPaused = false;
          if (EXAM && EXAM.state) EXAM.state.locked = false;
          try { startTimer(); } catch(e){}
          try { startPeriodicSessionSave(); } catch(e){}
        }
      } catch (err) {
        console.warn('session watcher callback error', err);
      }
    });
  } catch (err) {
    console.warn('startSessionWatcher error:', err);
  }
}
function stopSessionWatcher() {
  try {
    if (SESSION_UNSUBSCRIBE) {
      SESSION_UNSUBSCRIBE();
      SESSION_UNSUBSCRIBE = null;
    }
  } catch (e) { /* ignore */ }
}

/* Small admin & utility exports for UI wiring */
window.handleUserLogin_withResume = window.handleUserLogin_withResume || function(){ alert('handleUserLogin_withResume missing'); };
window.sendAnnouncement = window.sendAnnouncement || function(){};
window.startAnnouncementsListenerForStudents = window.startAnnouncementsListenerForStudents || function(){};
window.renderAdminAnnouncementsLive = window.renderAdminAnnouncementsLive || function(){};
window.saveSessionToFirestore = saveSessionToFirestore;
window.startSessionWatcher = startSessionWatcher;
window.stopSessionWatcher = stopSessionWatcher;
window.lockExamForUser = lockExamForUser;
window.unlockExamForUser = unlockExamForUser;
window.renderSessionsAdmin = renderSessionsAdmin;

/* End of updated app.js */
