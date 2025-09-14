/* app-shared-full.js
   Combined application script with settings, announcements, visitors, replies, and resume enforcement.
*/

(function(){
  // helpers
  function $(s){ return document.querySelector(s); }
  function $all(s){ return Array.from(document.querySelectorAll(s)); }
  function uid(){ return Math.random().toString(36).slice(2,9); }
  function read(k,def){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; } catch(e){ return def; } }
  function write(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  function download(filename, content, type='text/plain'){ const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function escapeHTML(s){ if(s==null) return ''; return (''+s).replace(/[&<>"'`=\/]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[ch])); }

  // Attempt Firestore init (dynamic mod import if available)
  var firebaseMode = 'none';
  var db = null;
  (function initFirebase(){
    try {
      if(window.firebase && window.firebase.initializeApp){
        firebaseMode = 'compat';
        try{ db = window.firebase.firestore(); } catch(e){ db = null; }
      } else {
        // dynamic import attempt; may fail on file://
        (async ()=>{
          try {
            const appMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
            const fsMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
            const cfg = {
              apiKey: "AIzaSyC7X0B65qfWiSkSaC_-dXElw687ZmVM9gU",
              authDomain: "exam-system-2ed90.firebaseapp.com",
              projectId: "exam-system-2ed90",
              storageBucket: "exam-system-2ed90.appspot.com",
              messagingSenderId: "576581410555",
              appId: "1:576581410555:web:e38cea3f14d10e5daa5a5e",
              measurementId: "G-BCFKVMVTBE"
            };
            const app = appMod.initializeApp(cfg);
            db = fsMod.getFirestore(app);
            firebaseMode = 'modular';
            console.log('Firebase modular initialized.');
          } catch(e){ firebaseMode = 'none'; console.warn('Firebase not available:', e); }
        })();
      }
    } catch(e){ firebaseMode = 'none'; console.warn('Firebase init error', e); }
  })();

  // keys & defaults
  const K_USERS = 'offline_mcq_users_v1';
  const K_QS = 'offline_mcq_qs_v1';
  const K_RESULTS = 'offline_mcq_results_v1';
  const K_ADMIN = 'offline_mcq_admin_v1';
  const K_SETTINGS = 'offline_mcq_settings_v1';
  const K_VISITORS = 'offline_mcq_visitors_before_login_v1';
  const MASTER_ADMIN = { username:'admin', password:'exam123' };

  var users = read(K_USERS, []);
  var questions = read(K_QS, []);
  var results = read(K_RESULTS, []);
  var adminCred = read(K_ADMIN, null);
  var settings = read(K_SETTINGS, {
    enableResume:false, maxResume:2, durationMin:30, totalQuestions:16, shuffle:false, allowAfterTime:false,
    author:'Ranjan Kumar', college:'Regional College of Pharmaceutical Sciences', subject:'Computer Applications in Pharmacy',
    subjectCode:'BP210P', fullMarks:20,
    counts:{ Synopsis:5, "Minor Practical":5, "Major Practical":1, Viva:5 }
  });

  if(!adminCred) write(K_ADMIN, MASTER_ADMIN);
  if(!questions || !questions.length){
    questions = [
      { id: uid(), question: 'HTML stands for?', options: ['Hyperlinks Text Markup','Home Tool Markup','Hyper Text Markup Language','Hyperlinking Text Markdown'], answer:2, marks:1, category:'Synopsis' },
      { id: uid(), question: 'Which tag defines paragraph?', options: ['<p>','<para>','<pg>','<par>'], answer:0, marks:1, category:'Minor Practical' }
    ];
    write(K_QS, questions);
  }

  // UI section switcher (defensive)
  function showSection(id){
    const wrapEl = document.querySelector('.wrap');
    if(wrapEl) wrapEl.style.display = (id==='home' ? 'none' : 'block');

    const sections = ['home','user','import','adminLogin','adminPanel'];
    sections.forEach(s=>{
      const el = document.getElementById(s);
      if(!el) return;
      if(s === id){ el.classList.remove('hidden'); el.style.display = 'block'; }
      else { el.classList.add('hidden'); el.style.display = 'none'; }
    });

    if(id === 'adminPanel'){
      renderQuestionsList(); renderUsersAdmin(); renderResults(); renderAdminOverview(); renderSettingsAdmin(); renderAdminAnnouncementsLive(); renderLiveSessions();
    }
  }
  window.showSection = showSection;

  // Announcements / Home update
  async function sendAnnouncement(){
    const textEl = document.getElementById('adminAnnText');
    const text = textEl ? (textEl.value||'').trim() : '';
    if(!text) return alert('Enter a message to send.');
    const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2,8);
    const payload = { text, author: settings.author || 'admin', createdAt: Date.now(), deleted:false };
    try {
      if(firebaseMode==='modular' && db){
        const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        await mod.setDoc(mod.doc(db, "announcements", id), payload);
      } else if(window.firebase && window.firebase.firestore){
        window.firebase.firestore().collection('announcements').doc(id).set(payload);
      } else {
        // fallback: store latest announcement locally
        write('offline_mcq_latest_announcement', payload);
      }
      if(textEl) textEl.value = '';
      alert('✅ Announcement sent.');
    } catch(e){ console.error(e); alert('Failed to send announcement'); }
  }
  function clearAnnouncementBox(){ const el = document.getElementById('adminAnnText'); if(el) el.value=''; }
  async function deleteAnnouncement(id){
    if(!confirm('Delete this announcement?')) return;
    try{
      if(firebaseMode==='modular' && db){
        const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        await mod.setDoc(mod.doc(db, "announcements", id), { deleted:true, deletedAt: Date.now() }, { merge:true });
      } else if(window.firebase && window.firebase.firestore){
        window.firebase.firestore().collection('announcements').doc(id).set({ deleted:true, deletedAt: Date.now() }, { merge:true });
      } else {
        // local fallback: remove if matching saved id
        const la = read('offline_mcq_latest_announcement', null);
        if(la && la.id === id) write('offline_mcq_latest_announcement', null);
      }
      alert('Deleted.');
    } catch(e){ console.warn(e); alert('Failed to delete'); }
  }

  async function renderAdminAnnouncementsLive(){
    const listEl = document.getElementById('adminAnnList');
    if(!listEl) return;
    listEl.innerHTML = '<div class="small">Loading announcements...</div>';
    if(firebaseMode==='modular' && db){
      const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const q = mod.query(mod.collection(db, "announcements"), mod.orderBy("createdAt", "desc"));
      mod.onSnapshot(q, snap=>{
        listEl.innerHTML = '';
        if(snap.empty){ listEl.innerHTML = '<div class="small">No announcements yet.</div>'; return; }
        snap.forEach(d=>{
          const data = d.data();
          if(!data || data.deleted) return;
          const row = document.createElement('div'); row.className='list-item';
          row.innerHTML = `<div style="flex:1"><b>${escapeHTML(data.author||'admin')}</b><div class="small">${escapeHTML(data.text)}</div></div>
                           <div style="width:90px;text-align:right"><button class="btn" onclick="updateHomeAnnouncement('${escapeHTML(data.text).replace(/'/g,"\\'")}')">Show</button>
                           <button class="btn" onclick="deleteAnnouncement('${d.id}')">Delete</button></div>`;
          listEl.appendChild(row);
        });
      });
    } else {
      // local fallback: show latest by reading local key
      const la = read('offline_mcq_latest_announcement', null);
      listEl.innerHTML = '';
      if(!la) listEl.innerHTML = '<div class="small">No announcements (local).</div>';
      else {
        const row = document.createElement('div'); row.className='list-item';
        row.innerHTML = `<div style="flex:1"><b>${escapeHTML(la.author||'admin')}</b><div class="small">${escapeHTML(la.text)}</div></div>
                         <div style="width:90px;text-align:right"><button class="btn" onclick="updateHomeAnnouncement('${escapeHTML(la.text).replace(/'/g,"\\'")}')">Show</button></div>`;
        listEl.appendChild(row);
      }
    }
  }

  function updateHomeAnnouncement(text){
    const el = document.getElementById('homeAnnouncement');
    if(!el) return;
    if(text && text.trim()){
      el.textContent = '📢 ' + text;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }
  window.updateHomeAnnouncement = updateHomeAnnouncement;

  function startAnnouncementsListenerForStudents(){
    try {
      if(firebaseMode==='modular' && db){
        (async ()=>{
          const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
          const q = mod.query(mod.collection(db, "announcements"), mod.orderBy("createdAt","desc"));
          mod.onSnapshot(q, snap=>{
            let latest = null;
            snap.forEach(d=>{ const data=d.data(); if(!latest && data && !data.deleted && data.text) latest = data; });
            if(latest && latest.text) updateHomeAnnouncement(latest.text);
            else {
              const la = read('offline_mcq_latest_announcement', null);
              if(la && la.text) updateHomeAnnouncement(la.text);
              else updateHomeAnnouncement('');
            }
          });
        })();
      } else if(window.firebase && window.firebase.firestore){
        window.firebase.firestore().collection('announcements').orderBy('createdAt','desc').onSnapshot(snap=>{
          let latest = null;
          snap.forEach(d=>{ const data=d.data(); if(!latest && data && !data.deleted && data.text) latest = data; });
          if(latest && latest.text) updateHomeAnnouncement(latest.text);
          else {
            const la = read('offline_mcq_latest_announcement', null);
            if(la && la.text) updateHomeAnnouncement(la.text);
            else updateHomeAnnouncement('');
          }
        });
      } else {
        // local fallback read
        const la = read('offline_mcq_latest_announcement', null);
        if(la && la.text) updateHomeAnnouncement(la.text);
      }
    } catch(e){ console.warn('ann listener error', e); }
  }
  window.startAnnouncementsListenerForStudents = startAnnouncementsListenerForStudents;

  // Admin login
  function handleAdminLogin(){
    const pass = (document.getElementById('adminPass') && document.getElementById('adminPass').value) || '';
    const stored = read(K_ADMIN, null);
    if(stored && stored.password === pass){ enterAdmin(); return; }
    if(pass === MASTER_ADMIN.password){ enterAdmin(); return; }
    alert('Invalid admin password');
  }
  function enterAdmin(){ showSection('adminPanel'); window.IS_ADMIN = true; renderAdminAnnouncementsLive(); renderLiveSessions(); renderSettingsAdmin(); }
  function logoutAdmin(){ window.IS_ADMIN = false; showSection('user'); }
  window.handleAdminLogin = handleAdminLogin; window.enterAdmin = enterAdmin; window.logoutAdmin = logoutAdmin;

  // user login / register
  function fileToDataURL(file){ return new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(file); }); }

  async function handleUserLogin(){
    const username = (document.getElementById('userName') && document.getElementById('userName').value || '').trim();
    const pass = (document.getElementById('userPass') && document.getElementById('userPass').value) || '';
    const file = (document.getElementById('userPhoto') && document.getElementById('userPhoto').files && document.getElementById('userPhoto').files[0]) || null;
    if(!username || !pass) return alert('Enter username and password');
    let user = users.find(u=>u.username===username && u.password===pass);
    if(!user){
      if(!file) return alert('New user: upload photo to register');
      const photo = await fileToDataURL(file);
      const fullname = username;
      user = { username, password: pass, photo, fullName: fullname };
      users.push(user);
      write(K_USERS, users);
      try {
        if(firebaseMode==='modular' && db){
          const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
          await mod.setDoc(mod.doc(db,"users",username), user);
        } else if(window.firebase && window.firebase.firestore){
          window.firebase.firestore().collection('users').doc(username).set(user);
        }
      } catch(e){ console.warn('users save failed', e); }
    }

    const attempted = (results||[]).some(r=>r.username===username);
    if(attempted) { alert(`⚠️ "${username}" has already attempted the exam.`); return; }

    if(document.getElementById('fsUserPhoto')) document.getElementById('fsUserPhoto').src = user.photo || '';
    if(document.getElementById('fsUserName')) document.getElementById('fsUserName').textContent = user.fullName || user.username;
    showSection('user');
    const ef = document.getElementById('examFullscreen'); if(ef) ef.style.display = 'flex';
    $all('.fsFooter').forEach(el=>el.style.display='flex');

    // attempt to restore session if resume enabled
    if(settings.enableResume){
      const restored = await tryRestoreSession(user);
      if(!restored){
        // start fresh and increment resume count
        await incrementSessionResumeCount(user.username);
        if(typeof startExam === 'function') startExam(user);
      }
    } else {
      if(typeof startExam === 'function') startExam(user);
    }
  }
  window.handleUserLogin = handleUserLogin;

  // visitors tracking
  function incrementVisitorCount(){ const n = parseInt(localStorage.getItem(K_VISITORS)||'0',10)+1; localStorage.setItem(K_VISITORS, String(n)); }
  function getVisitorCount(){ return parseInt(localStorage.getItem(K_VISITORS)||'0',10); }
  // increment when this script runs on user page
  try { if(location.pathname && location.pathname.endsWith('user.html')) incrementVisitorCount(); } catch(e){}

  function updateVisitorDisplay(){ const el = document.getElementById('visitorCount'); if(el) el.textContent = getVisitorCount(); }
  window.updateVisitorDisplay = updateVisitorDisplay;

  // Replies (student -> admin)
  async function sendReply(){
    const inp = document.getElementById('replyInput');
    if(!inp) return;
    const msg = (inp.value||'').trim();
    if(!msg) return alert('Enter a reply first!');
    try {
      if(firebaseMode==='modular' && db){
        const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        await mod.addDoc(mod.collection(db,"replies"), { text: msg, createdAt: Date.now() });
      } else if(window.firebase && window.firebase.firestore){
        window.firebase.firestore().collection('replies').add({ text: msg, createdAt: Date.now() });
      } else {
        const arr = read('offline_mcq_replies', []); arr.push({ text: msg, createdAt: Date.now() }); write('offline_mcq_replies', arr);
      }
      inp.value = '';
      alert('Reply sent!');
    } catch(e){ console.warn(e); alert('Failed to send reply'); }
  }
  window.sendReply = sendReply;

  async function fetchReplies(){
    if(firebaseMode==='modular' && db){
      try {
        const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const snap = await mod.getDocs(mod.query(mod.collection(db,"replies"), mod.orderBy('createdAt','desc')));
        const items = [];
        snap.forEach(d=>items.push({ id:d.id, ...d.data() }));
        return items;
      } catch(e){ console.warn(e); return []; }
    } else if(window.firebase && window.firebase.firestore){
      try {
        const snap = await window.firebase.firestore().collection('replies').orderBy('createdAt','desc').get();
        const items = [];
        snap.forEach(d=>items.push({ id:d.id, ...d.data() }));
        return items;
      } catch(e){ console.warn(e); return []; }
    } else {
      return read('offline_mcq_replies', []);
    }
  }
  window.fetchReplies = fetchReplies;

  async function renderAdminReplies(){
    const container = document.getElementById('adminRepliesList');
    if(!container) return;
    container.innerHTML = '<div class="small">Loading replies...</div>';
    const items = await fetchReplies();
    container.innerHTML = '';
    if(!items || !items.length) { container.innerHTML = '<div class="small">No replies yet.</div>'; return; }
    items.forEach(it=>{
      const el = document.createElement('div'); el.className='list-item';
      el.innerHTML = `<div style="flex:1"><div class="small">${new Date(it.createdAt||0).toLocaleString()}</div><div>${escapeHTML(it.text)}</div></div>`;
      container.appendChild(el);
    });
  }
  window.renderAdminReplies = renderAdminReplies;

  // Questions CRUD
  var editingId = null;
  function renderQuestionsList(){
    const list = document.getElementById('adminQuestionsList'); if(!list) return;
    list.innerHTML = '';
    if(!questions || !questions.length){ list.innerHTML = '<div class="small">No questions.</div>'; return; }
    questions.forEach(q=>{
      const el = document.createElement('div'); el.className='list-item';
      el.innerHTML = `<div style="flex:1"><b class="admin-question-text">${escapeHTML(q.question)}</b><div class="small">Category: ${escapeHTML(q.category)} • Marks: ${q.marks}</div></div>
                      <div style="width:120px;text-align:right">
                        <button class="btn" onclick="editQuestion('${q.id}')">Edit</button>
                        <button class="btn danger" onclick="deleteQuestion('${q.id}')">Delete</button>
                      </div>`;
      list.appendChild(el);
    });
    const sq = document.getElementById('statQuestions'); if(sq) sq.textContent = questions.length;
  }
  window.renderQuestionsList = renderQuestionsList;

  function editQuestion(id){
    const q = questions.find(x=>x.id===id); if(!q) return alert('Question not found');
    document.getElementById('qText').value = q.question;
    document.getElementById('qA').value = q.options[0]||'';
    document.getElementById('qB').value = q.options[1]||'';
    document.getElementById('qC').value = q.options[2]||'';
    document.getElementById('qD').value = q.options[3]||'';
    document.getElementById('qAnswer').value = q.answer || 0;
    document.getElementById('qMarks').value = q.marks || 1;
    document.getElementById('qCategory').value = q.category || 'Synopsis';
    editingId = q.id;
  }
  window.editQuestion = editQuestion;

  async function deleteQuestion(id){
    if(!confirm('Delete question?')) return;
    questions = questions.filter(q=>q.id !== id);
    write(K_QS, questions);
    try { if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); await mod.deleteDoc(mod.doc(db,"questions",id)); } else if(window.firebase && window.firebase.firestore){ window.firebase.firestore().collection('questions').doc(id).delete(); } } catch(e){ console.warn(e); }
    renderQuestionsList();
  }
  window.deleteQuestion = deleteQuestion;

  async function saveQuestion(){
    const text = (document.getElementById('qText')&&document.getElementById('qText').value||'').trim();
    const opts = [document.getElementById('qA').value||'', document.getElementById('qB').value||'', document.getElementById('qC').value||'', document.getElementById('qD').value||''];
    const ans = parseInt(document.getElementById('qAnswer').value||'0',10);
    const marks = parseInt(document.getElementById('qMarks').value||'1',10);
    const category = document.getElementById('qCategory').value || 'Synopsis';
    if(!text || opts.some(o=>!o)) return alert('⚠️ Fill question and all 4 options');
    const q = { id: editingId || uid(), question: text, options: opts, answer: ans, marks, category };
    if(editingId){ questions = questions.map(x=>x.id===q.id? q : x); editingId = null; } else questions.push(q);
    write(K_QS, questions);
    try {
      if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); await mod.setDoc(mod.doc(db,"questions",q.id), q); alert('✅ Question saved to Firebase + localStorage!'); }
      else if(window.firebase && window.firebase.firestore){ window.firebase.firestore().collection('questions').doc(q.id).set(q); alert('✅ Question saved to Firebase + localStorage!'); }
      else alert('⚠️ Question saved offline only.');
    } catch(e){ console.warn(e); alert('⚠️ Question saved offline only.'); }
    document.getElementById('qText').value=''; document.getElementById('qA').value=''; document.getElementById('qB').value=''; document.getElementById('qC').value=''; document.getElementById('qD').value='';
    renderQuestionsList();
  }
  window.saveQuestion = saveQuestion;

  // Users rendering & delete
  function renderUsersAdmin(){
    const list = document.getElementById('adminUsersList'); if(!list) return;
    const filter = (document.getElementById('filterUser') && document.getElementById('filterUser').value || '').toLowerCase();
    list.innerHTML = '';
    if(!users || !users.length){ list.innerHTML = '<div class="small">No users.</div>'; return; }
    users.filter(u=>u.username.toLowerCase().includes(filter)).forEach(u=>{
      const el = document.createElement('div'); el.className='list-item';
      el.innerHTML = `<div style="flex:1"><b>${escapeHTML(u.fullName||u.username)}</b><div class="small">${escapeHTML(u.username)}</div></div>
                      <div style="width:120px;text-align:right"><button class="btn" onclick="deleteUser('${u.username}')">Delete</button></div>`;
      list.appendChild(el);
    });
    const su = document.getElementById('statUsers'); if(su) su.textContent = users.length;
    const sv = document.getElementById('statVisitors'); if(sv) sv.textContent = getVisitorCount();
    const sq = document.getElementById('statQuestions'); if(sq) sq.textContent = questions.length;
    const sr = document.getElementById('statResults'); if(sr) sr.textContent = results.length;
  }
  window.renderUsersAdmin = renderUsersAdmin;

  function deleteUser(username){ if(!confirm('Delete user '+username+'?')) return; users = users.filter(u=>u.username !== username); write(K_USERS, users); renderUsersAdmin(); }
  window.deleteUser = deleteUser;

  // Results rendering
  function renderResults(){
    const area = document.getElementById('resultsArea'); if(!area) return;
    area.innerHTML = '';
    if(!results || !results.length){ area.innerHTML = '<div class="small">No results yet.</div>'; return; }
    results.slice().reverse().forEach(r=>{
      const el = document.createElement('div'); el.className='list-item';
      el.innerHTML = `<div style="flex:1"><b>${escapeHTML(r.username)}</b><div class="small">Score: ${r.score||0} • ${r.percent||0}% • ${new Date(r.timestamp).toLocaleString()}</div></div>
                      <div style="width:120px;text-align:right"><button class="btn" onclick="deleteResult('${r.id}')">Delete</button></div>`;
      area.appendChild(el);
    });
    const sr = document.getElementById('statResults'); if(sr) sr.textContent = results.length;
  }
  window.renderResults = renderResults;

  function deleteResult(id){ if(!confirm('Delete this result?')) return; results = results.filter(r=>r.id !== id); write(K_RESULTS, results); renderResults(); }
  window.deleteResult = deleteResult;

  function clearResults(){ if(!confirm('Clear all results?')) return; results = []; write(K_RESULTS, results); renderResults(); try{ if(firebaseMode==='modular' && db){ (async ()=>{ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); await mod.setDoc(mod.doc(db,"results","all"), { data: JSON.stringify(results) }, { merge:true }); })(); } else if(window.firebase && window.firebase.firestore){ window.firebase.firestore().collection('results').doc('all').set({ data: JSON.stringify(results) }, { merge:true }); } } catch(e){ console.warn(e); } }
  window.clearResults = clearResults;

  // Import/Export/Backup
  function importUsersFile(e){ const f = e.target.files[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>{ try{ const arr=JSON.parse(fr.result); if(!Array.isArray(arr)) throw 'bad'; users = arr.map(u=>({ username:u.username,password:u.password,photo:u.photo||'', fullName:u.fullName||u.username })); write(K_USERS, users); alert('Users imported'); renderUsersAdmin(); } catch(err){ console.error(err); alert('Invalid users JSON'); } }; fr.readAsText(f); e.target.value=''; }
  function importQuestionsFile(e){ const f = e.target.files[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>{ try{ const arr=JSON.parse(fr.result); if(!Array.isArray(arr)) throw 'bad'; questions = arr.map(q=>({ id:q.id||uid(), question:q.question||'', options:q.options||['','','',''], answer:parseInt(q.answer)||0, marks:parseInt(q.marks)||1, category:q.category||'Synopsis' })); write(K_QS, questions); alert('Questions imported'); renderQuestionsList(); } catch(err){ console.error(err); alert('Invalid questions JSON'); } }; fr.readAsText(f); e.target.value=''; }
  function exportUsers(){ download('users.json', JSON.stringify(users, null, 2), 'application/json'); }
  function exportQuestions(){ download('questions.json', JSON.stringify(questions, null, 2), 'application/json'); }
  function downloadBackup(){ const backup = { users, questions, results, admin: read(K_ADMIN, null), settings: read(K_SETTINGS, null) }; download('backup_offline_mcq.json', JSON.stringify(backup, null, 2), 'application/json'); }
  function updateBackup(){ const b = { users, questions, results, settings: read(K_SETTINGS, null), admin: read(K_ADMIN, null) }; download('exam_full_backup.json', JSON.stringify(b,null,2),'application/json'); alert('✅ Backup updated'); }
  function importFullBackup(file){ if(!file) return; const fr=new FileReader(); fr.onload=()=>{ try{ const b=JSON.parse(fr.result); users=b.users||users; questions=b.questions||questions; results=b.results||results; settings=b.settings||settings; if(b.admin) write(K_ADMIN,b.admin); write(K_USERS,users); write(K_QS,questions); write(K_RESULTS,results); write(K_SETTINGS,settings); alert('✅ Full backup restored!'); renderUsersAdmin(); renderQuestionsList(); renderResults(); renderSettingsAdmin(); } catch(e){ alert('Invalid backup file'); console.error(e); } }; fr.readAsText(file); }
  window.importUsersFile = importUsersFile; window.importQuestionsFile = importQuestionsFile; window.exportUsers = exportUsers; window.exportQuestions = exportQuestions; window.downloadBackup = downloadBackup; window.updateBackup = updateBackup; window.importFullBackup = importFullBackup;

  // Exam runtime & resume
  var EXAM = { paper:[], state:null, timerId:null, cur:0, cfg:{ durationMin:30, total:null, shuffle:false } };

  function buildPaper(qbank, shuffle){ let pool = Array.from(qbank||[]); if(!pool.length) return []; if(settings && settings.counts){ const byCat={}; pool.forEach(q=>{ (byCat[q.category]=byCat[q.category]||[]).push(q); }); const selected=[]; ['Synopsis','Minor Practical','Major Practical','Viva'].forEach(cat=>{ const want = settings.counts && settings.counts[cat] ? settings.counts[cat] : 0; const arr = byCat[cat] || []; for(let i=0;i<Math.min(want,arr.length);i++) selected.push(arr[i]); }); if(selected.length) pool = selected; } if(shuffle){ for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; } } return pool; }

  async function startExam(user){
    if(settings.enableResume){
      const resumes = await incrementSessionResumeCount(user.username);
      if(resumes > settings.maxResume){ alert('User has exceeded maximum allowed resumes/refreshes. Start/resume blocked.'); return; }
    }
    EXAM.cur = 0;
    EXAM.cfg.durationMin = settings.durationMin || 30;
    EXAM.paper = buildPaper(questions, settings.shuffle);
    EXAM.state = { username:user.username, answers:{}, flags:{}, startedAt: Date.now(), remainingMs: EXAM.cfg.durationMin*60*1000, submitted:false };
    const ef = document.getElementById('examFullscreen'); if(ef) ef.style.display='flex';
    if(document.getElementById('fsUserPhoto')) document.getElementById('fsUserPhoto').src = user.photo || '';
    if(document.getElementById('fsUserName')) document.getElementById('fsUserName').textContent = user.fullName || user.username;
    paintQuestion(); startPeriodicSessionSave(); startTimer(); await saveSessionToStore(user.username, EXAM.state, EXAM.paper);
  }
  window.startExam = startExam;

  function paintQuestion(){ const q = EXAM.paper[EXAM.cur]; if(!q) return; const fsq = document.getElementById('fsQuestion'); if(fsq) fsq.innerHTML = `${EXAM.cur+1}. (${q.category}) ${escapeHTML(q.question)}`; const opts = document.getElementById('fsOptions'); if(opts) opts.innerHTML = ''; q.options.forEach((opt,i)=>{ const d = document.createElement('div'); d.className = 'fsOpt' + (EXAM.state.answers[q.id]===i? ' selected':''); d.innerHTML = `<div style="width:28px;font-weight:800">${String.fromCharCode(65+i)}.</div><div style="flex:1">${escapeHTML(opt)}</div>`; d.onclick = ()=>{ EXAM.state.answers[q.id]=i; paintQuestion(); updateProgress(); }; opts.appendChild(d); }); const meta = document.getElementById('fsMeta'); if(meta) meta.textContent = `Question ${EXAM.cur+1} of ${EXAM.paper.length} • Answered: ${Object.keys(EXAM.state.answers).length}` + (EXAM.state.flags[q.id] ? ' • ⚑ Flagged' : ''); updateProgress(); renderQuestionNav(); }
  window.paintQuestion = paintQuestion;

  function prevQuestion(){ if(EXAM.cur>0){ EXAM.cur--; paintQuestion(); } }
  function nextQuestion(){ if(EXAM.cur < EXAM.paper.length-1){ EXAM.cur++; paintQuestion(); } }
  function toggleFlag(){ const q = EXAM.paper[EXAM.cur]; if(!q) return; EXAM.state.flags[q.id] = !EXAM.state.flags[q.id]; paintQuestion(); }
  function updateProgress(){ const answered = Object.keys(EXAM.state.answers).length; const total = EXAM.paper.length||1; const pct = Math.round((answered/total)*100); const fill = document.getElementById('fsProgressFill'); if(fill) fill.style.width = pct + '%'; }
  function renderQuestionNav(){ let nav = document.getElementById('questionNav'); if(!nav){ nav = document.createElement('div'); nav.id='questionNav'; nav.style.marginTop='12px'; const fsMain=document.getElementById('fsMain'); if(fsMain) fsMain.prepend(nav); } nav.innerHTML=''; EXAM.paper.forEach((q,i)=>{ const btn=document.createElement('button'); btn.className='btn'; btn.textContent = i+1; if(EXAM.state.answers[q.id] !== undefined) btn.style.background = '#34d399'; if(EXAM.state.flags[q.id]) btn.style.border = '2px solid orange'; if(i===EXAM.cur) btn.style.outline = '2px solid #60a5fa'; btn.onclick = ()=>{ EXAM.cur=i; paintQuestion(); }; nav.appendChild(btn); }); }

  function updateTimerText(){ const ms = EXAM.state && EXAM.state.remainingMs ? EXAM.state.remainingMs : 0; const hh=Math.floor(ms/3600000), mm=Math.floor((ms%3600000)/60000), ss=Math.floor((ms%60000)/1000); const pad = n=>String(n).padStart(2,'0'); const el = document.getElementById('fsTimer'); if(el) el.textContent = `${pad(hh)}:${pad(mm)}:${pad(ss)}`; }
  function stopTimer(){ if(EXAM.timerId){ clearInterval(EXAM.timerId); EXAM.timerId = null; } }

  async function startTimer(){ stopTimer(); const end = Date.now() + (EXAM.state.remainingMs || (EXAM.cfg.durationMin*60*1000)); updateTimerText(); EXAM.timerId = setInterval(async ()=>{ EXAM.state.remainingMs = end - Date.now(); if(EXAM.state.remainingMs <= 0){ EXAM.state.remainingMs = 0; stopTimer(); if(settings.allowAfterTime){} else submitExam(true); } updateTimerText(); try{ await saveSessionToStore(EXAM.state.username, EXAM.state, EXAM.paper); } catch(e){ console.warn('timer save failed', e); } }, 500); }

  var periodicSaveId = null;
  function startPeriodicSessionSave(){ stopPeriodicSessionSave(); periodicSaveId = setInterval(()=>{ if(EXAM && EXAM.state && EXAM.state.username) saveSessionToStore(EXAM.state.username, EXAM.state, EXAM.paper).catch(e=>console.warn('periodic save failed', e)); }, 7000); }
  function stopPeriodicSessionSave(){ if(periodicSaveId){ clearInterval(periodicSaveId); periodicSaveId = null; } }

  async function saveSessionToStore(username, state, paper){
    try {
      if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); await mod.setDoc(mod.doc(db,"sessions",username), { state, paperIds:(paper||[]).map(q=>q.id), updatedAt: Date.now(), username }, { merge:true }); }
      else if(window.firebase && window.firebase.firestore){ window.firebase.firestore().collection('sessions').doc(username).set({ state, paperIds:(paper||[]).map(q=>q.id), updatedAt: Date.now(), username }, { merge:true }); }
      else localStorage.setItem('session_'+username, JSON.stringify({ state, paperIds:(paper||[]).map(q=>q.id), updatedAt: Date.now() }));
    } catch(e){ console.warn('saveSessionToStore error', e); }
  }
  window.saveSessionToStore = saveSessionToStore;

  async function loadSessionDoc(username){
    try {
      if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); const snap = await mod.getDoc(mod.doc(db,"sessions",username)); if(snap && snap.exists()) return snap.data(); return null; }
      else if(window.firebase && window.firebase.firestore){ const snap = await window.firebase.firestore().collection('sessions').doc(username).get(); if(snap && snap.exists) return snap.data(); return null; }
      else { const raw = localStorage.getItem('session_'+username); return raw?JSON.parse(raw):null; }
    } catch(e){ console.warn('loadSessionDoc failed', e); return null; }
  }
  window.loadSessionDoc = loadSessionDoc;

  async function tryRestoreSession(user){
    if(!settings.enableResume) return false;
    const sess = await loadSessionDoc(user.username);
    if(!sess || !sess.state) return false;
    EXAM.state = sess.state;
    EXAM.paper = (sess.paperIds||[]).map(id=>questions.find(q=>q.id===id)).filter(Boolean);
    if(!EXAM.paper || !EXAM.paper.length) return false;
    EXAM.cur = 0;
    document.getElementById('examFullscreen').style.display = 'flex';
    paintQuestion(); startTimer();
    return true;
  }
  window.tryRestoreSession = tryRestoreSession;

  async function incrementSessionResumeCount(username){
    try {
      if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); const sRef = mod.doc(db,"sessions",username); const snap = await mod.getDoc(sRef); const old = snap && snap.exists && snap.data && snap.data().resumes ? snap.data().resumes : 0; const next = (old||0)+1; await mod.setDoc(sRef,{ resumes: next },{ merge:true }); return next; }
      else if(window.firebase && window.firebase.firestore){ const sRef = window.firebase.firestore().collection('sessions').doc(username); const snap = await sRef.get(); const old = snap && snap.data && snap.data().resumes ? snap.data().resumes : 0; const next=(old||0)+1; await sRef.set({ resumes: next }, { merge:true }); return next; }
      else { const key='session_resumes_'+username; const v = parseInt(localStorage.getItem(key)||'0',10)+1; localStorage.setItem(key,String(v)); return v; }
    } catch(e){ console.warn('incrementSessionResumeCount failed', e); return parseInt(localStorage.getItem('session_resumes_'+username)||'0',10); }
  }
  window.incrementSessionResumeCount = incrementSessionResumeCount;

  async function submitExam(auto=false){
    if(!auto && !confirm('Submit exam now?')) return;
    const MAX_ATTEMPTS = 1; const arr = results || []; const userAttempts = arr.filter(r=>r.username === EXAM.state.username);
    if(userAttempts.length >= MAX_ATTEMPTS){ alert(`⚠️ User "${EXAM.state.username}" has already attempted the exam ${MAX_ATTEMPTS} time(s).`); document.getElementById('examFullscreen').style.display='none'; showSection('user'); return; }
    stopTimer();
    const paper = EXAM.paper; let totalMarks=0, earned=0; const sectionScores = { 'Synopsis':0, 'Minor Practical':0, 'Major Practical':0, 'Viva':0 };
    paper.forEach(q=>{ totalMarks += (q.marks||1); const chosen = EXAM.state.answers[q.id]; if(q.category === 'Major Practical'){ if(chosen===0){ earned+=q.marks; sectionScores[q.category]+=q.marks; } else if(chosen===1){ const val=Math.round(q.marks*0.75); earned+=val; sectionScores[q.category]+=val; } else if(chosen===2){ const val2=Math.round(q.marks*0.5); earned+=val2; sectionScores[q.category]+=val2; } } else { if(chosen === q.answer){ earned += (q.marks||1); sectionScores[q.category] = (sectionScores[q.category]||0) + (q.marks||1); } } });
    earned = Math.round(earned); Object.keys(sectionScores).forEach(k=>sectionScores[k]=Math.round(sectionScores[k])); const percent = Math.round((earned/Math.max(1,totalMarks))*100);
    const result = { id: uid(), username: EXAM.state.username, score: earned, total: totalMarks, percent, sectionScores, timestamp: Date.now() };
    results = results || []; results.push(result); write(K_RESULTS, results);
    try { if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); await mod.setDoc(mod.doc(db,"results","all"), { data: JSON.stringify(results) }, { merge:true }); } else if(window.firebase && window.firebase.firestore){ window.firebase.firestore().collection('results').doc('all').set({ data: JSON.stringify(results) }, { merge:true }); } } catch(e){ console.warn('Failed saving results to Firestore:', e); }
    try { if(firebaseMode==='modular' && db){ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); await mod.setDoc(mod.doc(db,"sessions",EXAM.state.username), { remainingMs:0, updatedAt: Date.now(), paperIds:[], answers:{}, flags:{}, resumes:0 }, { merge:true }); } else if(window.firebase && window.firebase.firestore){ window.firebase.firestore().collection('sessions').doc(EXAM.state.username).set({ remainingMs:0, updatedAt: Date.now(), paperIds:[], answers:{}, flags:{}, resumes:0 }, { merge:true }); } } catch(e){ console.warn(e); }
    const fsq = document.getElementById('fsQuestion'); if(fsq) fsq.innerHTML = `<div style="text-align:center;font-size:22px;font-weight:900">Your Score: ${percent}%</div><div id="redirectMsg" style="text-align:center;margin-top:10px;font-size:14px;color:var(--muted)">Redirecting in 5s.</div>`;
    const fso = document.getElementById('fsOptions'); if(fso) fso.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width:${percent}%"></div></div>`;
    $all('.fsFooter').forEach(el=>el.style.display='flex'); EXAM.state.submitted = true;
    let secs=5; const msgEl=document.getElementById('redirectMsg'); const cd = setInterval(()=>{ secs--; if(secs>0){ if(msgEl) msgEl.textContent = `Redirecting in ${secs}s.`; } else { clearInterval(cd); document.getElementById('examFullscreen').style.display='none'; showSection('user'); } },1000);
    renderResults();
  }
  window.submitExam = submitExam;

  // lock/pause/unlock
  const ADMIN_UNLOCK_PASS = 'exam123';
  let examPaused=false;
  async function pauseExam(){ try{ examPaused=true; if(EXAM && EXAM.timerId){ clearInterval(EXAM.timerId); EXAM.timerId=null; } const lockNode = document.getElementById('lockScreen'); if(lockNode) lockNode.style.display='flex'; if(!EXAM) EXAM={}; if(!EXAM.state) EXAM.state={}; EXAM.state.locked=true; if(EXAM.state.username) await saveSessionToStore(EXAM.state.username, EXAM.state, EXAM.paper); } catch(e){ console.warn(e); } }
  function unlockExam(){ const pass = (document.getElementById('unlockPassword')&&document.getElementById('unlockPassword').value)||''; if(pass === ADMIN_UNLOCK_PASS){ const lockNode=document.getElementById('lockScreen'); if(lockNode) lockNode.style.display='none'; examPaused=false; if(EXAM && EXAM.state && !EXAM.state.submitted) startTimer(); } else alert('Incorrect password'); }
  window.unlockExam = unlockExam;
  document.addEventListener('fullscreenchange', ()=>{ if(!document.fullscreenElement && !EXAM.state?.submitted) { try{ pauseExam(); } catch(e){} } });

  // Live sessions
  async function renderLiveSessions(){
    const list = document.getElementById('liveSessionsList'); if(!list) return;
    list.innerHTML = '<div class="small">Loading sessions...</div>';
    if(firebaseMode==='modular' && db){
      try{
        const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
        const q = mod.query(mod.collection(db,"sessions"), mod.orderBy('updatedAt','desc'));
        const snap = await mod.getDocs(q);
        list.innerHTML = '';
        if(snap.empty) list.innerHTML = '<div class="small">No live sessions.</div>';
        snap.forEach(d=>{ const data=d.data(); const el=document.createElement('div'); el.className='list-item'; el.innerHTML = `<div style="flex:1"><b>${escapeHTML(d.id)}</b><div class="small">Updated: ${new Date(data.updatedAt||0).toLocaleString()}</div></div><div style="width:120px;text-align:right"><button class="btn" onclick="inspectSession('${d.id}')">Inspect</button></div>`; list.appendChild(el); });
      } catch(e){ list.innerHTML = '<div class="small">Failed to fetch Firestore sessions.</div>'; console.warn(e); }
    } else {
      list.innerHTML = '';
      let found=false;
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith('session_')){ found=true; const val = JSON.parse(localStorage.getItem(k)||'{}'); const username = k.replace('session_',''); const el=document.createElement('div'); el.className='list-item'; el.innerHTML = `<div style="flex:1"><b>${escapeHTML(username)}</b><div class="small">Updated: ${new Date(val.updatedAt||0).toLocaleString()}</div></div><div style="width:120px;text-align:right"><button class="btn" onclick="inspectSession('${escapeHTML(username)}')">Inspect</button></div>`; list.appendChild(el); }
      }
      if(!found) list.innerHTML = '<div class="small">No live sessions.</div>';
    }
  }
  window.renderLiveSessions = renderLiveSessions;

  function inspectSession(id){
    if(firebaseMode==='modular' && db){
      (async ()=>{ try{ const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'); const snap = await mod.getDoc(mod.doc(db,"sessions",id)); if(snap && snap.exists()) alert(JSON.stringify(snap.data(), null, 2)); else alert('No session doc found.'); } catch(e){ alert('Inspect failed: '+e); } })();
    } else {
      const raw = localStorage.getItem('session_'+id);
      if(!raw) return alert('No local session.'); alert(raw);
    }
  }
  window.inspectSession = inspectSession;

  function clearSessionDocs(){ if(!confirm('Clear saved session docs (local only)?')) return; const keys=[]; for(let i=0;i<localStorage.length;i++) keys.push(localStorage.key(i)); keys.forEach(k=>{ if(k && k.startsWith('session_')) localStorage.removeItem(k); }); alert('Local session docs cleared.'); renderLiveSessions(); }
  window.clearSessionDocs = clearSessionDocs;

  // Settings UI
  function renderSettingsAdmin(){
    const s = read(K_SETTINGS, settings) || settings;
    document.getElementById('set_enableResume').checked = !!s.enableResume;
    document.getElementById('set_maxResume').value = s.maxResume || 2;
    document.getElementById('set_duration').value = s.durationMin || 30;
    document.getElementById('set_totalQuestions').value = s.totalQuestions || 16;
    document.getElementById('set_shuffle').checked = !!s.shuffle;
    document.getElementById('set_allowAfterTime').checked = !!s.allowAfterTime;
    document.getElementById('set_author').value = s.author || '';
    document.getElementById('set_college').value = s.college || '';
    document.getElementById('set_subject').value = s.subject || '';
    document.getElementById('set_subjectCode').value = s.subjectCode || '';
    document.getElementById('set_fullMarks').value = s.fullMarks || 20;
    document.getElementById('cnt_synopsis').value = (s.counts && s.counts['Synopsis']) || 0;
    document.getElementById('cnt_minor').value = (s.counts && s.counts['Minor Practical']) || 0;
    document.getElementById('cnt_major').value = (s.counts && s.counts['Major Practical']) || 0;
    document.getElementById('cnt_viva').value = (s.counts && s.counts['Viva']) || 0;
    computeTotalQuestions();
  }
  window.renderSettingsAdmin = renderSettingsAdmin;

  function computeTotalQuestions(){ const s = parseInt(document.getElementById('cnt_synopsis').value||'0',10); const mi = parseInt(document.getElementById('cnt_minor').value||'0',10); const ma = parseInt(document.getElementById('cnt_major').value||'0',10); const v = parseInt(document.getElementById('cnt_viva').value||'0',10); const total = s+mi+ma+v; const el = document.getElementById('computedTotal'); if(el) el.textContent = total; const totIn = document.getElementById('set_totalQuestions'); if(totIn) totIn.value = total; }
  ['cnt_synopsis','cnt_minor','cnt_major','cnt_viva'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', computeTotalQuestions); });

  function saveSettingsAdmin(){ const obj = { enableResume: !!document.getElementById('set_enableResume').checked, maxResume: parseInt(document.getElementById('set_maxResume').value||'2',10), durationMin: parseInt(document.getElementById('set_duration').value||'30',10), totalQuestions: parseInt(document.getElementById('set_totalQuestions').value||'16',10), shuffle: !!document.getElementById('set_shuffle').checked, allowAfterTime: !!document.getElementById('set_allowAfterTime').checked, author: document.getElementById('set_author').value||'', college: document.getElementById('set_college').value||'', subject: document.getElementById('set_subject').value||'', subjectCode: document.getElementById('set_subjectCode').value||'', fullMarks: parseInt(document.getElementById('set_fullMarks').value||'20',10), counts: { Synopsis: parseInt(document.getElementById('cnt_synopsis').value||'0',10), "Minor Practical": parseInt(document.getElementById('cnt_minor').value||'0',10), "Major Practical": parseInt(document.getElementById('cnt_major').value||'0',10), Viva: parseInt(document.getElementById('cnt_viva').value||'0',10) } }; settings = obj; write(K_SETTINGS, settings); alert('Settings saved.'); renderSettingsAdmin(); }
  window.saveSettingsAdmin = saveSettingsAdmin;

  function importSettingsFile(ev){ const f = ev.target.files && ev.target.files[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>{ try{ const obj=JSON.parse(fr.result); settings = obj; write(K_SETTINGS, settings); alert('Settings imported.'); renderSettingsAdmin(); } catch(e){ alert('Invalid settings JSON'); } }; fr.readAsText(f); ev.target.value=''; }
  window.importSettingsFile = importSettingsFile;

  function exportSettings(){ const s = read(K_SETTINGS, settings) || settings; download('exam_settings.json', JSON.stringify(s,null,2),'application/json'); }
  window.exportSettings = exportSettings;

  // Admin overview
  function renderAdminOverview(){ const su=document.getElementById('statUsers'); if(su) su.textContent = users.length; const sv=document.getElementById('statVisitors'); if(sv) sv.textContent = getVisitorCount(); const sq=document.getElementById('statQuestions'); if(sq) sq.textContent = questions.length; const sr=document.getElementById('statResults'); if(sr) sr.textContent = results.length; }
  window.renderAdminOverview = renderAdminOverview;

  // Replies admin UI call
  document.addEventListener('DOMContentLoaded', ()=>{ setTimeout(()=>{ updateVisitorDisplay(); startAnnouncementsListenerForStudents(); renderAdminReplies(); }, 200); });

  // expose minimal API for debugging
  window._app = { users, questions, results, settings, read, write };

  // initial show
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', ()=> showSection('home')); } else showSection('home');

})();
