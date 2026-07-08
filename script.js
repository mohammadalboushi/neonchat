/* ═══════════════════════════════════
   FIREBASE INIT & GLOBAL STATE
═══════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
  authDomain: "malaboushi.firebaseapp.com",
  databaseURL: "https://malaboushi-default-rtdb.firebaseio.com/",
  projectId: "malaboushi",
  storageBucket: "malaboushi.firebasestorage.app",
  messagingSenderId: "110336819350",
  appId: "1:110336819350:web:2b1b0488e72b811f0602b7"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const messaging = firebase.messaging();
const VERCEL_URL = 'https://neonchat-five.vercel.app';
const VAPID_KEY = 'BLyGo78MotBcNontRvYa14hdbwWLxjJBJ4AWFIj35Ek125D-SO2445PpX1tNuSgBv5MPQSZhgPyzNynvVitg68I'; 

let internalMicId = null; 
let currentUser = null;
let myProfile = null;
let currentChat = null;
let chatsData = {};
let messagesRef = null;
let messagesListener = null;
let msgChangedListener = null;
let chatsListener = null;
let friendStatusRef = null;
let friendStatusListener = null;
let typingRef = null;
let typingListener = null;
let friendRequestsListener = null;
let myCallListener = null;
let friendsListListener = null;

let localStream = null;
let peerConnection = null;
let currentCallPeer = null;
let callDurationInt = null;
let callIsCaller = false;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRecordingCanceled = false;
let recordStart = 0;
let recordTimerInt = null;
let recordDurationStr = '0:00';
let isSingingMode = false;

let typingTimeout = null;
let baseStatusText = '';
let baseStatusColor = 'var(--text-secondary)';

let lastMsgDate = '';
let replyingToMsg = null;
let editingMsgKey = null;
let lastUnreads = {};
let isFirstChatsLoad = true;

/* ═══════════════════════════════════
   BACKGROUND CANVAS (مُحسن للبطارية)
═══════════════════════════════════ */
(function initBg() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function mkP() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + .3,
      vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
      a: Math.random() * .6 + .2
    };
  }
  for (let i = 0; i < 40; i++) particles.push(mkP()); 

  function draw() {
    if (document.hidden || (document.getElementById('screen-chat') && document.getElementById('screen-chat').classList.contains('active'))) {
      setTimeout(() => requestAnimationFrame(draw), 500);
      return;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,240,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,240,255,${p.a})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ═══════════════════════════════════
   NAVIGATION & UTILS
═══════════════════════════════════ */
history.pushState({ screen: 'home' }, '', '');
window.addEventListener('popstate', e => {
  const imgOverlay = document.getElementById('img-preview-overlay');
  const msgMenuOverlay = document.getElementById('msg-menu-overlay');
  const modalOverlay = document.getElementById('modal-overlay');
  let isPopupOpen = false;

  if (imgOverlay && imgOverlay.classList.contains('open')) {
    if (currentScale > 1) { currentScale = 1; imgTx = 0; imgTy = 0; img.style.transform = `translate(0px, 0px) scale(1)`; } 
    else { closeImgPreview(); }
    isPopupOpen = true;
  }
  if (msgMenuOverlay && msgMenuOverlay.classList.contains('open')) { closeMsgMenu(); isPopupOpen = true; }
  if (modalOverlay && modalOverlay.classList.contains('open')) { modalOverlay.classList.remove('open'); isPopupOpen = true; }

  let currentActiveScreen = 'home';
  document.querySelectorAll('.screen').forEach(s => { if (s.classList.contains('active')) currentActiveScreen = s.id.replace('screen-', ''); });
  
  if (isPopupOpen) { history.pushState({ screen: currentActiveScreen }, '', ''); return; }
  const targetScreen = e.state && e.state.screen ? e.state.screen : 'home';
  if (currentActiveScreen === 'home') { history.pushState({ screen: 'home' }, '', ''); return; }
  renderScreenUI(targetScreen);
  history.pushState({ screen: targetScreen }, '', '');
});

function showScreen(name) {
  history.pushState({ screen: name }, '', '');
  renderScreenUI(name);
}

function renderScreenUI(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  if (name === 'home') loadChats();
  if (name === 'profile') populateProfile();
  if (name === 'add-friend') { document.getElementById('friend-id-input').value = ''; document.getElementById('search-result-area').innerHTML = ''; }
  if (name !== 'chat') detachMessages();
}

let toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast ${type} show`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function openModal(title, text) {
  return new Promise(resolve => {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    document.getElementById('modal-overlay').classList.add('open');
    const ok = document.getElementById('modal-ok'), can = document.getElementById('modal-cancel');
    function cleanup(v) { document.getElementById('modal-overlay').classList.remove('open'); ok.onclick = null; can.onclick = null; resolve(v); }
    ok.onclick = () => cleanup(true); can.onclick = () => cleanup(false);
  });
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px'; }
function escHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''; }
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  const yes = new Date(now); yes.setDate(now.getDate() - 1);
  if (d.toDateString() === yes.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' });
}

/* ═══════════════════════════════════
   AUTH & PRESENCE
═══════════════════════════════════ */
function formatEmail(input) {
  input = input.trim().toLowerCase();
  if (!input) return '';
  return !input.includes('@') ? input + '@neonchat.app' : input;
}

const emailInput = document.getElementById('login-email');
const passInput = document.getElementById('login-pass');
const passConfirmInput = document.getElementById('login-pass-confirm');
const btnLogin = document.getElementById('btn-custom-login');
const btnSignup = document.getElementById('btn-custom-signup');

if(btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const rawEmail = emailInput.value, pass = passInput.value;
    if (!rawEmail || !pass) { showToast('الرجاء إدخال اسم المستخدم وكلمة المرور', 'error'); return; }
    const email = formatEmail(rawEmail);
    btnLogin.disabled = true; btnLogin.textContent = 'جاري الدخول...';
    try { await auth.signInWithEmailAndPassword(email, pass); } 
    catch (e) { showToast(e.code === 'auth/wrong-password' ? 'كلمة المرور غير صحيحة!' : 'تأكد من البيانات', 'error'); } 
    finally { btnLogin.disabled = false; btnLogin.textContent = 'دخول'; }
  });
}

if(btnSignup) {
  btnSignup.addEventListener('click', async () => {
    const rawEmail = emailInput.value, pass = passInput.value, passConf = passConfirmInput.value;
    if (!rawEmail || !pass || !passConf) { showToast('الرجاء تعبئة جميع الحقول', 'error'); return; }
    if (pass !== passConf) { showToast('كلمتي المرور غير متطابقتين!', 'error'); return; }
    if (pass.length < 6) { showToast('كلمة المرور 6 أحرف على الأقل', 'error'); return; }
    const email = formatEmail(rawEmail);
    btnSignup.disabled = true; btnSignup.textContent = 'جاري الإنشاء...';
    try {
      const userCred = await auth.createUserWithEmailAndPassword(email, pass);
      if (!rawEmail.includes('@')) await userCred.user.updateProfile({ displayName: rawEmail });
      showToast('تم إنشاء الحساب بنجاح!', 'success');
    } catch (e) { showToast('فشل الإنشاء', 'error'); } 
    finally { btnSignup.disabled = false; btnSignup.textContent = 'إنشاء حساب'; }
  });
}

async function initMicrophone() {
  try {
    let temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    temp.getTracks().forEach(t => t.stop());
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    for (let dev of audioInputs) {
      const label = dev.label.toLowerCase();
      if (!label.includes('bluetooth') && !label.includes('bt') && !label.includes('headset')) {
        if (label.includes('built-in') || label.includes('internal') || label.includes('phone') || label.includes('مدمج')) {
          internalMicId = dev.deviceId; break;
        }
      }
    }
  } catch (e) { console.log('تعذر تجهيز المايك مسبقاً'); }
}

window.localImageCache = {}; // 🚀 السحر هون: ذاكرة تخزين مؤقتة لمنع رجفة الصورة وإعادة تحميلها

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => console.log("Auth Error:", err)).finally(() => {
  auth.onAuthStateChanged(async user => {
    const loader = document.getElementById('loader-screen');
    if (loader) loader.classList.add('hidden');
    if (user) {
      currentUser = user;
      try { await ensureUserProfile(user); } catch(e) {}
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') Notification.requestPermission();
      setupPresence(user.uid);
      try {
        const swReg = await navigator.serviceWorker.register('./sw.js');
        const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
        if (token) await db.ref('users/' + user.uid + '/fcmToken').set(token);
      } catch (err) {}
      initCallListener(user.uid); initFriendRequestsListener(user.uid); initFriendsListListener(user.uid); 
      initMicrophone(); 
      showScreen('home');
    } else {
      if (!navigator.onLine && localStorage.getItem('myProfile')) return; 
      currentUser = null; myProfile = null;
      renderScreenUI('login');
    }
  });
});

function setupPresence(uid) {
  const myStatusRef = db.ref('users/' + uid + '/status');
  const connectedRef = db.ref('.info/connected');
  let isConnected = false;
  connectedRef.on('value', snap => {
    isConnected = snap.val() === true;
    if (isConnected) {
      myStatusRef.onDisconnect().set(Date.now());
      if (document.visibilityState === 'visible') myStatusRef.set('online');
      else myStatusRef.set(Date.now());
    }
  });
  const setOnline = () => { if(isConnected) myStatusRef.set('online'); };
  const setOffline = () => { 
     // 🚀 السحر هون: فحصنا إنو الشاشة فعلاً مخفية (document.hidden) ومو مجرد كيبورد فتح وخربطنا!
     if(isConnected && document.hidden) { 
       myStatusRef.set(Date.now()); 
       if (currentChat && currentUser) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
     } 
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setOnline();
    else setOffline();
  });
  window.addEventListener('focus', setOnline);
  window.addEventListener('blur', setOffline);
}

async function ensureUserProfile(user) {
  const ref = db.ref('users/' + user.uid);
  const snap = await ref.once('value');
  if (snap.exists()) {
    myProfile = snap.val();
    if (!myProfile.uniqueId) {
      myProfile.uniqueId = await generateUniqueId();
      await ref.update({ uniqueId: myProfile.uniqueId });
    } else await db.ref('userIds/' + myProfile.uniqueId).set(user.uid);
  } else {
    const uniqueId = await generateUniqueId();
    myProfile = { uid: user.uid, name: user.displayName || 'مستخدم', photo: user.photoURL || '', uniqueId, createdAt: Date.now() };
    await ref.set(myProfile);
  }
  updateHomeHeader();
  localStorage.setItem('myProfile', JSON.stringify(myProfile));
}

async function generateUniqueId() {
  while (true) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    const snap = await db.ref('userIds/' + id).once('value');
    if (!snap.exists()) { await db.ref('userIds/' + id).set(currentUser.uid); return id; }
  }
}

function cleanupListeners() {
  if (currentUser) {
    if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
    if (friendRequestsListener) db.ref('friendRequests/' + currentUser.uid).off('value', friendRequestsListener);
    if (friendsListListener) db.ref('friendsList/' + currentUser.uid).off();
    if (myCallListener) db.ref('calls/' + currentUser.uid).off('value', myCallListener);
    Object.keys(presenceListeners).forEach(fUid => db.ref('users/' + fUid + '/status').off('value', presenceListeners[fUid]));
    presenceListeners = {};
  }
  detachMessages();
}

function confirmLogout() {
  openModal('تسجيل الخروج', 'هل أنت متأكد أنك تريد تسجيل الخروج؟').then(ok => {
    if (ok) {
      if (currentUser) db.ref('users/' + currentUser.uid + '/status').set(Date.now());
      cleanupListeners();
      auth.signOut().then(() => {
        localStorage.removeItem('myProfile');
        const avatarEl = document.getElementById('profile-avatar');
        if(avatarEl) avatarEl.outerHTML = `<div class="profile-avatar" id="profile-avatar">أ</div>`;
        renderScreenUI('login');
      });
    }
  });
}

function updateHomeHeader() {
  if (!myProfile) return;
  document.getElementById('home-subtitle').textContent = 'مرحباً، ' + myProfile.name.split(' ')[0];
  document.getElementById('my-id-badge').textContent = myProfile.uniqueId;
  const av = document.getElementById('home-avatar');
  if (myProfile.photo) av.outerHTML = `<img class="home-avatar" src="${myProfile.photo}" onclick="showScreen('profile')" id="home-avatar"/>`;
  else { av.className = 'home-avatar-placeholder'; av.textContent = myProfile.name.charAt(0); }
}

function copyMyId() {
  if (!myProfile) return;
  navigator.clipboard.writeText(myProfile.uniqueId).then(() => showToast('تم نسخ الـ ID', 'success')).catch(() => showToast('رقمك: ' + myProfile.uniqueId));
}

function populateProfile() {
  if (!myProfile) return;
  document.getElementById('profile-name-input').value = myProfile.name;
  document.getElementById('profile-id-value').textContent = myProfile.uniqueId;
  const av = document.getElementById('profile-avatar');
  if (myProfile.photo) av.outerHTML = `<img class="profile-avatar" src="${myProfile.photo}" id="profile-avatar"/>`;
  else av.textContent = myProfile.name.charAt(0);
}

async function saveProfileName() {
  const newName = document.getElementById('profile-name-input').value.trim();
  if (!newName || !myProfile) return;
  showToast('جاري الحفظ...');
  try {
    await db.ref('users/' + myProfile.uid).update({ name: newName });
    myProfile.name = newName; localStorage.setItem('myProfile', JSON.stringify(myProfile));
    updateHomeHeader(); showToast('تم تغيير الاسم بنجاح', 'success');
  } catch (e) { showToast('فشل الحفظ', 'error'); }
}

document.getElementById('file-avatar-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !myProfile) return;
  e.target.value = ''; showToast('جاري رفع الصورة...');
  try {
    const formData = new FormData(); formData.append('file', file); formData.append('upload_preset', 'malaboushi_preset');
    const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.secure_url) {
      await db.ref('users/' + myProfile.uid).update({ photo: data.secure_url });
      myProfile.photo = data.secure_url; localStorage.setItem('myProfile', JSON.stringify(myProfile));
      updateHomeHeader(); populateProfile(); showToast('تم تحديث الصورة', 'success');
    } else throw new Error('تعذر الرفع');
  } catch (e) { showToast('فشل رفع الصورة', 'error'); }
});

/* ═══════════════════════════════════
   CHATS & FRIENDS LIST
═══════════════════════════════════ */
let friendsStatus = {};
let presenceListeners = {};

function loadChats() {
  if (!currentUser) return;
  if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
  chatsListener = db.ref('userChats/' + currentUser.uid).orderByChild('updatedAt').on('value', snap => {
    chatsData = {}; let hasNew = false;
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val(); chatsData[c.key] = d;
        if (!isFirstChatsLoad && d.unread > (lastUnreads[c.key] || 0)) hasNew = true;
        lastUnreads[c.key] = d.unread;
        if (!presenceListeners[d.friendUid]) {
          presenceListeners[d.friendUid] = db.ref('users/' + d.friendUid + '/status').on('value', sSnap => {
            friendsStatus[d.friendUid] = sSnap.val(); renderChatsList();
          });
        }
      });
    }
    renderChatsList();
    if (hasNew && !document.getElementById('screen-chat').classList.contains('active') && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    setTimeout(() => isFirstChatsLoad = false, 1000);
  });
}

function renderChatsList(filter = '') {
  const list = document.getElementById('chats-list'), empty = document.getElementById('chats-empty');
  const items = Object.entries(chatsData).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  const filtered = filter ? items.filter(([, v]) => v.friendName && v.friendName.includes(filter)) : items;
  if (!filtered.length) { empty.style.display = 'flex'; list.querySelectorAll('.chat-item').forEach(e => e.remove()); return; }
  empty.style.display = 'none'; list.querySelectorAll('.chat-item').forEach(e => e.remove());
  filtered.forEach(([chatId, data]) => {
    const div = document.createElement('div'); div.className = 'chat-item';
    const initials = (data.friendName || '?').charAt(0);
    const avatarHtml = data.friendPhoto ? `<img src="${data.friendPhoto}" class="chat-avatar" style="object-fit:cover;"/>` : `<div class="chat-avatar">${initials}</div>`;
    const isOnline = friendsStatus[data.friendUid] === 'online';
    const onlineBadge = isOnline ? `<div style="position:absolute; bottom:2px; right:2px; width:13px; height:13px; background:var(--neon-green); border-radius:50%; border:2px solid var(--bg-surface); z-index:2;"></div>` : '';
    const lastMsg = data.lastMsg || 'اضغط لبدء المحادثة';
    div.innerHTML = `<div style="position:relative; display:inline-block; flex-shrink:0;">${avatarHtml}${onlineBadge}</div><div class="chat-info"><div class="chat-name">${escHtml(data.friendName||'مستخدم')}</div><div class="chat-last-msg">${escHtml(lastMsg)}</div></div><div class="chat-meta"><div class="chat-time">${data.updatedAt ? formatTime(data.updatedAt) : ''}</div>${data.unread > 0 ? `<div class="chat-badge">${data.unread}</div>` : ''}</div>`;
    
    // التمرير السريع الفوري
    div.addEventListener('click', () => openChat(chatId, data.friendUid, { name: data.friendName, photo: data.friendPhoto }));
    
    let pressTimer;
    div.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { openHomeChatMenu(chatId, data.friendUid, data.friendName); }, 600); }, { passive: true });
    div.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    div.addEventListener('touchend', () => clearTimeout(pressTimer));
    div.addEventListener('contextmenu', e => { e.preventDefault(); openHomeChatMenu(chatId, data.friendUid, data.friendName); });
    list.appendChild(div);
  });
}

function filterChats(val) { renderChatsList(val); }

async function searchFriend() {
  const idVal = document.getElementById('friend-id-input').value.trim();
  if (idVal.length !== 6) { showToast('أدخل 6 أرقام صحيحة', 'error'); return; }
  document.getElementById('btn-search-friend').textContent = 'جاري البحث…';
  try {
    const snap = await db.ref('userIds/' + idVal).once('value');
    if (!snap.exists()) { showToast('لم يُعثر على مستخدم', 'error'); return; }
    const uid = snap.val();
    if (uid === currentUser.uid) { showToast('هذا رقمك أنت 😄', 'error'); return; }
    const userSnap = await db.ref('users/' + uid).once('value');
    renderSearchResult(userSnap.val(), uid);
  } catch (e) {} finally { document.getElementById('btn-search-friend').textContent = 'بحث'; }
}

function renderSearchResult(friend, uid) {
  document.getElementById('search-result-area').innerHTML = `<div class="search-result-card"><div class="search-result-avatar">${(friend.name || '?').charAt(0)}</div><div class="search-result-info"><div class="search-result-name">${escHtml(friend.name)}</div><div class="search-result-id">${friend.uniqueId}</div></div><button class="btn-primary" id="btn-send-req-${uid}" style="width:auto;padding:11px 20px;font-size:13px" onclick="sendFriendRequest('${uid}')">إرسال طلب</button></div>`;
}

async function sendFriendRequest(friendUid) {
  if (!currentUser || !myProfile) return;
  const btn = document.getElementById(`btn-send-req-${friendUid}`);
  btn.disabled = true; btn.textContent = 'جاري الإرسال...';
  try {
    await db.ref('friendRequests/' + friendUid + '/' + currentUser.uid).set({ uid: currentUser.uid, name: myProfile.name, timestamp: Date.now() });
    showToast('تم إرسال طلب الصداقة بنجاح', 'success'); btn.textContent = 'تم الإرسال ✔';
  } catch (e) { btn.disabled = false; btn.textContent = 'إرسال طلب'; }
}

function initFriendRequestsListener(uid) {
  if (friendRequestsListener) db.ref('friendRequests/' + uid).off('value', friendRequestsListener);
  friendRequestsListener = db.ref('friendRequests/' + uid).on('value', snap => {
    const list = document.getElementById('friend-requests-list'), badge = document.getElementById('home-req-badge');
    if (!snap.exists()) { if (badge) badge.style.display = 'none'; if (list) list.innerHTML = '<div style="text-align:center;">لا توجد طلبات</div>'; return; }
    let count = 0, htmlStr = '';
    snap.forEach(reqSnap => {
      count++; const req = reqSnap.val();
      htmlStr += `<div class="search-result-card" style="padding:12px 16px;"><div class="search-result-avatar" style="width:40px;height:40px;">${(req.name || '?').charAt(0)}</div><div class="search-result-info"><div class="search-result-name" style="font-size:14px;margin-bottom:0;">${escHtml(req.name)}</div></div><div style="display:flex;gap:6px;"><button class="btn-primary" style="width:auto;padding:6px 12px;font-size:12px;background:var(--neon-green);box-shadow:none;" onclick="acceptFriendRequest('${req.uid}')">موافقة</button><button class="btn-danger" style="width:auto;padding:6px 12px;font-size:12px;" onclick="rejectFriendRequest('${req.uid}')">رفض</button></div></div>`;
    });
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    if (list) list.innerHTML = htmlStr;
  });
}

async function acceptFriendRequest(friendUid) {
  try {
    await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove();
    await startChat(friendUid); showToast('تم القبول وبدء المحادثة!', 'success');
  } catch (e) {}
}

async function rejectFriendRequest(friendUid) {
  await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove(); showToast('تم رفض الطلب');
}

async function startChat(friendUid) {
  if (!currentUser || !myProfile) return;
  const friendSnap = await db.ref('users/' + friendUid).once('value'); const friend = friendSnap.val();
  const chatId = [currentUser.uid, friendUid].sort().join('_');
  await db.ref('chats/' + chatId + '/meta').update({ participants: [currentUser.uid, friendUid], createdAt: Date.now() });
  await db.ref('userChats/' + currentUser.uid + '/' + chatId).update({ friendUid, friendName: friend.name, friendPhoto: friend.photo || '', updatedAt: Date.now(), lastMsg: 'ابدأ المحادثة الآن!', unread: 0 });
  await db.ref('userChats/' + friendUid + '/' + chatId).update({ friendUid: currentUser.uid, friendName: myProfile.name, friendPhoto: myProfile.photo || '', updatedAt: Date.now(), lastMsg: 'ابدأ المحادثة الآن!', unread: 0 });
  await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({ name: friend.name, photo: friend.photo || '', timestamp: Date.now() });
  await db.ref('friendsList/' + friendUid + '/' + currentUser.uid).update({ name: myProfile.name, photo: myProfile.photo || '', timestamp: Date.now() });
  openChat(chatId, friendUid, friend);
}

function initFriendsListListener(uid) {
  const container = document.getElementById('my-friends-container'); if (!container) return;
  db.ref('friendsList/' + uid).off(); container.innerHTML = '';
  db.ref('friendsList/' + uid).on('child_added', snap => {
    const friendUid = snap.key, fData = snap.val();
    if (document.getElementById('friend-card-' + friendUid)) return;
    const card = document.createElement('div'); card.className = 'search-result-card'; card.id = 'friend-card-' + friendUid;
    card.style.cssText = 'padding:12px 16px; margin-bottom:8px; display:flex; align-items:center;';
    card.innerHTML = `<div class="search-result-avatar" style="width:40px;height:40px;font-size:15px;">${fData.photo ? `<img src="${fData.photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"/>` : (fData.name || '?').charAt(0)}</div><div class="search-result-info" style="flex:1; margin-right:12px;"><div class="search-result-name" id="friend-name-text-${friendUid}" style="font-size:16px;margin-bottom:0;">${escHtml(fData.name)}</div></div><button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px;" onclick="startChat('${friendUid}')">مراسلة</button>`;
    container.appendChild(card);
  });
}

/* ═══════════════════════════════════
   OPEN CHAT & MESSAGES
═══════════════════════════════════ */
let currentMessagesQuery = null;

function detachMessages() {
  if (messagesRef) { messagesRef.off(); messagesListener = null; msgChangedListener = null; }
  if (friendStatusRef && friendStatusListener) { friendStatusRef.off('value', friendStatusListener); friendStatusRef = null; friendStatusListener = null; }
  if (typingRef && typingListener) { typingRef.off('value', typingListener); typingRef = null; typingListener = null; }
}

async function openChat(chatId, friendUid, friendProfile = null) {
  renderScreenUI('chat'); detachMessages();
  if (!friendProfile) { const snap = await db.ref('users/' + friendUid).once('value'); friendProfile = snap.val(); }
  currentChat = { chatId, friendUid, friendProfile };

  const avatarEl = document.getElementById('chat-header-avatar');
  if (friendProfile.photo) avatarEl.outerHTML = `<img src="${friendProfile.photo}" class="chat-header-avatar" id="chat-header-avatar" style="object-fit:cover;"/>`;
  else avatarEl.outerHTML = `<div class="chat-header-avatar" id="chat-header-avatar">${(friendProfile.name||'?').charAt(0)}</div>`;
  document.getElementById('chat-header-name').textContent = friendProfile.name;
  db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);

  attachMessages(chatId);

  const statusEl = document.getElementById('chat-header-status');
  statusEl.textContent = 'جاري التحقق...'; statusEl.style.color = 'var(--text-muted)';
  friendStatusRef = db.ref('users/' + friendUid + '/status');
  friendStatusListener = friendStatusRef.on('value', snap => {
    const val = snap.val();
    if (val === 'online') { baseStatusText = '🟢 متصل الآن'; baseStatusColor = 'var(--neon-green)'; } 
    else if (val && typeof val === 'number') { baseStatusText = '🔴 آخر ظهور: ' + formatTime(val); baseStatusColor = 'var(--text-secondary)'; } 
    else { baseStatusText = '🔴 غير متصل'; baseStatusColor = 'var(--text-secondary)'; }
    if (!statusEl.textContent.includes('يكتب') && !statusEl.textContent.includes('يسجل')) { statusEl.textContent = baseStatusText; statusEl.style.color = baseStatusColor; }
  });
  typingRef = db.ref('chats/' + chatId + '/typing/' + friendUid);
  typingListener = typingRef.on('value', snap => {
    const state = snap.val();
    if (state === 'typing') { statusEl.textContent = '✍️ يكتب الآن...'; statusEl.style.color = 'var(--neon-cyan)'; } 
    else if (state === 'recording') { statusEl.textContent = '🎙️ يسجل مقطع صوتي...'; statusEl.style.color = 'var(--neon-pink)'; } 
    else { statusEl.textContent = baseStatusText; statusEl.style.color = baseStatusColor; }
  });
}

function attachMessages(chatId) {
  const area = document.getElementById('messages-area');
  area.innerHTML = '';
  lastMsgDate = '';
  oldestMsgTimestamp = null;
  oldestMsgKey = null; 
  isLoadingHistory = false;
  hasMoreHistory = true;
  
  // منع تدخل المتصفح العشوائي
  area.style.overflowAnchor = 'none';

  db.ref('userChats/' + currentChat.friendUid + '/' + chatId).update({
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || ''
  });

  const cacheKey = 'chat_cache_' + chatId;
  const cachedData = localStorage.getItem(cacheKey);
  let liveMsgsCache = [];
  
  if (cachedData) {
    try {
      liveMsgsCache = JSON.parse(cachedData);
      const fragment = document.createDocumentFragment();
      let tempLastDate = '';
      
      liveMsgsCache.forEach(m => {
        const dStr = formatDate(m.timestamp);
        if (dStr !== tempLastDate) {
          const sep = document.createElement('div');
          sep.className = 'date-sep';
          sep.innerHTML = `<span>${dStr}</span>`;
          fragment.appendChild(sep);
          tempLastDate = dStr;
        }
        fragment.appendChild(buildMsgEl(m, true));
      });
      
      area.appendChild(fragment);
      area.scrollTop = area.scrollHeight;
      
      if (liveMsgsCache.length > 0) {
        lastMsgDate = tempLastDate;
        oldestMsgKey = liveMsgsCache[0].key;
        oldestMsgTimestamp = liveMsgsCache[0].timestamp;
      }
    } catch (e) {
      liveMsgsCache = [];
    }
  }

  messagesRef = db.ref('chats/' + chatId + '/messages');
  
  let query;
  if (liveMsgsCache.length > 0) {
    const latestKey = liveMsgsCache[liveMsgsCache.length - 1].key;
    query = messagesRef.orderByKey().startAt(latestKey);
  } else {
    query = messagesRef.orderByKey().limitToLast(100);
  }

  // حفظ الاستعلام لحل مشكلة التعليق عند الدخول والخروج
  currentMessagesQuery = query;

  let scrollTimeout;

  messagesListener = currentMessagesQuery.on('child_added', snap => {
    const msg = { ...snap.val(), key: snap.key };
    
    const existsInCache = liveMsgsCache.some(m => m.key === msg.key);
    if (!existsInCache) {
      liveMsgsCache.push(msg);
      if (liveMsgsCache.length > 100) liveMsgsCache.shift(); 
      localStorage.setItem(cacheKey, JSON.stringify(liveMsgsCache));
    }

    if (document.getElementById('msg-' + msg.key)) {
      return; 
    }

    if (!oldestMsgKey || snap.key < oldestMsgKey) {
      oldestMsgKey = snap.key;
    }
    if (!oldestMsgTimestamp || msg.timestamp < oldestMsgTimestamp) {
      oldestMsgTimestamp = msg.timestamp;
    }

    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastMsgDate) {
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.innerHTML = `<span>${dateStr}</span>`;
      area.appendChild(sep);
      lastMsgDate = dateStr;
    }
    area.appendChild(buildMsgEl(msg, false)); 
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      area.scrollTop = area.scrollHeight;
    }, 50);

    if (msg.senderUid !== currentUser.uid) {
      if (!msg.read) snap.ref.update({ read: true });
      db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);
    }
  });

  area.addEventListener('scroll', async () => {
    if (area.scrollTop <= 5 && !isLoadingHistory && hasMoreHistory && oldestMsgKey) {
      isLoadingHistory = true;
      
      const oldScrollTop = area.scrollTop;

      const loader = document.createElement('div');
      loader.id = 'history-loader';
      loader.innerHTML = '<div style="text-align:center; padding:10px; font-size:12px; color:var(--neon-cyan);">جاري التحميل...</div>';
      area.insertBefore(loader, area.firstChild);

      const snap = await messagesRef.orderByKey().endAt(oldestMsgKey).limitToLast(100).once('value');
      
      loader.remove(); 

      if (snap.exists()) {
        const msgs = [];
        snap.forEach(child => {
          if (child.key !== oldestMsgKey) { 
            msgs.push({ ...child.val(), key: child.key });
          }
        });
        
        if (msgs.length > 0) {
          oldestMsgKey = msgs[0].key;
          oldestMsgTimestamp = msgs[0].timestamp;
          
          const baseScrollHeight = area.scrollHeight;
          
          const fragment = document.createDocumentFragment();
          let tempLastDate = '';
          msgs.forEach(m => {
            const dStr = formatDate(m.timestamp);
            if (dStr !== tempLastDate) {
              const sep = document.createElement('div');
              sep.className = 'date-sep';
              sep.innerHTML = `<span>${dStr}</span>`;
              fragment.appendChild(sep);
              tempLastDate = dStr;
            }
            fragment.appendChild(buildMsgEl(m, true)); 
          });
          
          area.insertBefore(fragment, area.firstChild);
          
          const allSeps = area.querySelectorAll('.date-sep');
          let lastTxt = '';
          allSeps.forEach(sep => {
             if(sep.innerText === lastTxt) sep.remove();
             else lastTxt = sep.innerText;
          });

          // ─── السحر الثاني: إيقاف النعومة مؤقتاً لمنع الطيران ───
          area.style.scrollBehavior = 'auto'; 
          area.scrollTop = area.scrollHeight - baseScrollHeight + oldScrollTop;
          
          // إعادة النعومة بعد جزء من الثانية
          setTimeout(() => {
            area.style.scrollBehavior = 'smooth';
          }, 50);
          // ──────────────────────────────────────────────────────
        } else {
          hasMoreHistory = false;
        }
      } else {
        hasMoreHistory = false;
      }
      
      isLoadingHistory = false;
    }
  });

  msgChangedListener = messagesRef.on('child_changed', snap => {
    const msg = { ...snap.val(), key: snap.key };
    
    const idx = liveMsgsCache.findIndex(m => m.key === msg.key);
    if (idx !== -1) {
      liveMsgsCache[idx] = msg;
      localStorage.setItem(cacheKey, JSON.stringify(liveMsgsCache));
    }

    if (msg.isEdited && !msg.isDeleted && msg.type === 'text') {
      const bubbleEl = document.getElementById('msg-' + msg.key);
      if (bubbleEl) {
        const tempRow = buildMsgEl(msg, true);
        const tempBubble = tempRow.querySelector('.msg-bubble');
        if (tempBubble) {
          bubbleEl.innerHTML = tempBubble.innerHTML;
        }
      }
    }
    
    if (msg.type === 'voice' && msg.listened) {
      const dot = document.getElementById('unplayed-' + msg.key);
      if (dot) {
        dot.style.background = 'transparent';
        dot.style.boxShadow = 'none';
      }
    }

    const ticksEl = document.getElementById('ticks-' + msg.key);
    if (ticksEl) {
      if (msg.type === 'voice' && msg.listened) {
        ticksEl.setAttribute('stroke', '#00ff88');
        ticksEl.style.stroke = '#00ff88';
        ticksEl.innerHTML = '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>';
      } else if (msg.read) {
        ticksEl.setAttribute('stroke', '#00f0ff');
        ticksEl.style.stroke = '#00f0ff';
        ticksEl.innerHTML = '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>';
      }
    }
    const reactEl = document.getElementById('react-' + msg.key);
    if (reactEl) {
      if (msg.reaction) {
        reactEl.style.display = 'flex';
        reactEl.innerHTML = msg.reaction;
      } else {
        reactEl.style.display = 'none';
      }
    }
    if (msg.isDeleted) {
      const bubbleEl = document.getElementById('msg-' + msg.key);
      if (bubbleEl) {
        bubbleEl.style.background = 'transparent';
        bubbleEl.style.border = '1px solid var(--border-subtle)';
        bubbleEl.innerHTML = '<div style="color:var(--text-muted);font-style:italic;font-size:12px;">🚫 تم حذف هذه الرسالة</div>';
      }
    }
  });
}

function buildMsgEl(msg, isBackground = false) {
  if (msg.isDeleted) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.senderUid === currentUser.uid ? 'out' : 'in');
    if (isBackground) row.style.animation = 'none';
    row.innerHTML = `<div class="msg-bubble" id="msg-${msg.key}" style="background:transparent;border:1px solid var(--border-subtle);color:var(--text-muted);font-style:italic;font-size:12px;">🚫 تم حذف هذه الرسالة</div>`;
    return row;
  }
  const row = document.createElement('div');
  const isOut = msg.senderUid === currentUser.uid;
  row.className = 'msg-row ' + (isOut ? 'out' : 'in');
  
  if (isBackground || (msg.url && window.lastUploadedUrl === msg.url)) {
    row.style.animation = 'none';
    if (msg.url === window.lastUploadedUrl) window.lastUploadedUrl = null; 
  }

  // 🚀 تعريف الصورة بناءً على مين اللي باعت (أنت أو صديقك)
  const profile = isOut ? myProfile : (currentChat.friendProfile || {});
  let avatarNode = document.createElement(profile.photo ? 'img' : 'div');
  avatarNode.className = isOut ? 'msg-my-avatar' : 'msg-friend-avatar';
  
  // 🚀 السحر هون: ستايل إجباري مدمج مشان المتصفح المعند ما يكبرها أبداً
  let commonStyle = 'width:32px !important; height:32px !important; min-width:32px !important; min-height:32px !important; max-width:32px !important; max-height:32px !important; border-radius:50%; object-fit:cover; flex-shrink:0; align-self:flex-end; border:1px solid rgba(0, 240, 255, 0.4); margin: 0 6px; z-index:2;';
  let bgStyle = isOut ? 'background:linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));' : 'background:linear-gradient(135deg, var(--neon-blue), var(--neon-purple));';
  
  if (profile.photo) {
    avatarNode.src = profile.photo;
    avatarNode.style.cssText = commonStyle;
  } else {
    avatarNode.textContent = (profile.name || '?').charAt(0);
    avatarNode.style.cssText = commonStyle + bgStyle + 'display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; color:white;';
  }

  // إذا صديقك اللي باعت، الصورة بتنحط قبل فقاعة الدردشة
  if (!isOut) {
    row.appendChild(avatarNode);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble'; bubble.id = 'msg-' + msg.key;
  let replyIcon = document.createElement('div');
  replyIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--neon-cyan)" stroke-width="2.5"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>`;
  replyIcon.style.cssText = `position:absolute; top:50%; margin-top:-11px; transform:scale(0); opacity:0; transition:all 0.2s ease-out; z-index:-1;`;
  row.style.position = 'relative'; row.appendChild(replyIcon);
  
  let lastTap = 0, pressTimer, touchStartX = 0, touchStartY = 0, isSwiping = false, isVertical = false;

  bubble.addEventListener('touchstart', e => {
    if (e.target.tagName === 'A') return;
    
    const now = Date.now();
    if (now - lastTap < 300 && now - lastTap > 0) { toggleReaction(msg.key); lastTap = 0; if (e.cancelable) e.preventDefault(); return; }
    lastTap = now;
    touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY;
    isSwiping = false; isVertical = false;
    bubble.style.transition = 'none';

    if (e.target.tagName === 'IMG') { e.target.style.opacity = '0.85'; return; } 

    pressTimer = setTimeout(() => { if (!isSwiping && !isVertical && !msg.isPending) openMsgMenu(msg, isOut); }, 500);
  }, { passive: false });

  bubble.addEventListener('touchmove', e => {
    if (e.target.tagName === 'A' || !touchStartX) return;
    const dx = e.touches[0].clientX - touchStartX, dy = e.touches[0].clientY - touchStartY;
    
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isVertical = true; clearTimeout(pressTimer);
      bubble.style.transition = 'transform 0.2s ease-out'; bubble.style.transform = 'translateX(0)';
      replyIcon.style.transform = `scale(0)`; replyIcon.style.opacity = '0'; return;
    }

    if (e.target.tagName === 'IMG') return; // منع سحب الصورة
    
    if (Math.abs(dx) > 15 && !isVertical && !msg.isPending) {
      isSwiping = true; clearTimeout(pressTimer);
      let limit = Math.min(Math.abs(dx), 65) * Math.sign(dx); bubble.style.transform = `translateX(${limit}px)`;
      
      let pullPerc = Math.min(Math.abs(dx) / 50, 1);
      replyIcon.style.transition = 'none'; replyIcon.style.opacity = pullPerc; replyIcon.style.transform = `scale(${pullPerc})`;
      
      if (dx > 0) { replyIcon.style.left = '55px'; replyIcon.style.right = 'auto'; } 
      else { replyIcon.style.right = '20px'; replyIcon.style.left = 'auto'; }
      
      if (pullPerc > 0.85) {
        replyIcon.style.filter = `drop-shadow(0 0 8px var(--neon-cyan))`;
        if (navigator.vibrate && !bubble.hasVibrated) { navigator.vibrate(15); bubble.hasVibrated = true; }
      } else { replyIcon.style.filter = 'none'; bubble.hasVibrated = false; }
    }
  }, { passive: true });

  bubble.addEventListener('touchend', e => {
    if (e.target.tagName === 'A') return;

    if (e.target.tagName === 'IMG') { 
      e.target.style.opacity = '1'; 
      if (!isVertical) window.previewImg(e.target.src); 
      return; 
    }
    
    clearTimeout(pressTimer);
    bubble.style.transition = 'transform 0.2s ease-out'; bubble.style.transform = 'translateX(0)';
    replyIcon.style.transition = 'all 0.2s ease-out'; replyIcon.style.transform = `scale(0)`; replyIcon.style.opacity = '0';
    bubble.hasVibrated = false;

    if (isSwiping && Math.abs(e.changedTouches[0].clientX - touchStartX) > 45) { prepareReply(msg); if (navigator.vibrate) navigator.vibrate(40); }
    isSwiping = false; touchStartX = 0; touchStartY = 0;
  });

  bubble.addEventListener('contextmenu', e => { if (e.target.tagName === 'A' || e.target.tagName === 'IMG' || msg.isPending) return; e.preventDefault(); openMsgMenu(msg, isOut); });

  let ticks = '';
  if (isOut && !msg.isPending) {
    let color = msg.read ? '#00f0ff' : 'var(--text-muted)';
    if (msg.type === 'voice' && msg.listened) color = '#00ff88'; 
    const content = (msg.read || msg.listened) ? '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>' : '<polyline points="20 6 9 17 4 12"></polyline>';
    ticks = `<svg id="ticks-${msg.key}" width="14" height="14" viewBox="0 0 28 18" fill="none" stroke="${color}" stroke-width="2" style="margin-left:4px;margin-bottom:-2px;">${content}</svg>`;
  }
  const timeEl = `<div class="msg-time">${msg.isEdited ? '<span style="font-size:10px;opacity:0.7;">(معدلة)</span>' : ''}${ticks}${formatTime(msg.timestamp)}</div>`;
  const reactHtml = `<div id="react-${msg.key}" class="msg-reaction" style="display:${msg.reaction?'flex':'none'}">${msg.reaction||''}</div>`;
  
  let replyHtml = '';
  if (msg.replyTo) { replyHtml = `<div onclick="scrollToMessage('${msg.replyTo.key}')" style="cursor:pointer;"><div class="reply-badge">↩ رد على رسالة</div><div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;margin-bottom:6px;border-right:2px solid var(--neon-cyan);font-size:12px;opacity:0.8;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(msg.replyTo.text)}</div></div>`; }

  if (msg.type === 'text') {
    let safeText = escHtml(msg.text).replace(/(https?:\/\/[^\s]+)/g, `<a href="$1" target="_blank" rel="noopener noreferrer" style="color: var(--neon-cyan); text-decoration: underline; word-break: break-all;">$1</a>`);
    bubble.innerHTML = `${replyHtml}<div>${safeText}</div>${timeEl}${reactHtml}`;
  } else if (msg.type === 'image') {
    // 🚀 جلب الصورة من الذاكرة المؤقتة فوراً لتجنب التحميل البطيء والرفة
    const displayUrl = (window.localImageCache && window.localImageCache[msg.url]) ? window.localImageCache[msg.url] : msg.url;
    bubble.innerHTML = `${replyHtml}<img class="msg-img" src="${displayUrl}" style="pointer-events: auto;"/>${timeEl}${reactHtml}`;
  } else if (msg.type === 'voice') {
    if ('caches' in window && !msg.isPending) caches.open('media-cache').then(c => c.match(msg.url).then(cached => { if (!cached) fetch(msg.url).then(res => c.put(msg.url, res)).catch(()=>{}); }));
    const bars = Array.from({ length: 20 }, () => `<div class="voice-bar" style="height:${Math.floor(Math.random()*70)+20}%"></div>`).join('');
    let unplayedDot = (!isOut && !msg.isPending && !msg.listened) ? `<div id="unplayed-${msg.key}" style="width:10px;height:10px;background:var(--neon-green);border-radius:50%;margin-left:8px;box-shadow:0 0 6px var(--neon-green);flex-shrink:0;"></div>` : '';
    bubble.innerHTML = `${replyHtml}<div class="voice-msg">${unplayedDot}<button class="voice-play-btn" onclick="playVoice(this,'${msg.url}', '${msg.key}', ${isOut})"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><div class="voice-waveform" style="position:relative; cursor:pointer;" onclick="seekVoice(event, '${msg.url}', '${msg.key}')">${bars}<div id="progress-${msg.key}" class="voice-progress-fill" style="position:absolute; right:0; top:0; bottom:0; width:0%; background:rgba(0,240,255,0.4); pointer-events:none; z-index:1; border-radius:2px; transition: width 0.1s linear;"></div></div><span id="dur-${msg.key}" class="voice-duration" data-orig="${msg.duration||'0:00'}">${msg.duration||'0:00'}</span></div>${timeEl}${reactHtml}`;
  }

  if (msg.isPending) {
    const overlay = document.createElement('div'); overlay.className = 'pending-overlay';
    overlay.style.cssText = 'position:absolute; inset:0; background:rgba(0,0,0,0.6); border-radius:18px; display:flex; align-items:center; justify-content:center; z-index:10; flex-direction:column; gap:8px;';
    overlay.innerHTML = `<div style="width:24px; height:24px; border:3px solid rgba(0, 240, 255, 0.3); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div>`;
    bubble.style.overflow = 'hidden'; bubble.appendChild(overlay);
  }
  row.appendChild(bubble);

  // 🚀 إذا أنت اللي باعت، الصورة بتنحط بعد فقاعة الدردشة (عشان تطلع عاليسار ويكون الشكل متوازن)
  if (isOut) {
    row.appendChild(avatarNode);
  }

  return row;
}

/* ═══════════════════════════════════
   UNIVERSAL UPLOAD ENGINE
═══════════════════════════════════ */
window.pendingUploads = {};
async function uploadMediaWithUI(file, type, extraData = null) {
  const tempId = 'temp_' + Date.now();
  const tempUrl = URL.createObjectURL(file);
  const area = document.getElementById('messages-area');

  const tempMsg = {
    key: tempId, type: type, url: tempUrl, duration: extraData?.duration || '0:00',
    senderUid: currentUser.uid, timestamp: Date.now(), isPending: true,
    replyTo: replyingToMsg ? { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت' } : null
  };
  if (replyingToMsg) cancelReply();

  if (area) {
    const el = buildMsgEl(tempMsg, false); el.id = 'row_' + tempId;
    area.appendChild(el); setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
  }

    const tryUpload = async () => {
    const row = document.getElementById('row_' + tempId);
    if (row) { const ov = row.querySelector('.pending-overlay'); if (ov) ov.innerHTML = `<div style="width:24px; height:24px; border:3px solid rgba(0, 240, 255, 0.3); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div>`; }
    try {
      const controller = new AbortController(); 
      const timeoutId = setTimeout(() => controller.abort(), 12000); 
      const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', 'malaboushi_preset');
      const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', { method: 'POST', body: fd, signal: controller.signal });
      clearTimeout(timeoutId); 
      const data = await res.json();
      if (data.secure_url) {
        window.lastUploadedUrl = data.secure_url;
        if (type === 'image' && window.localImageCache) window.localImageCache[data.secure_url] = tempUrl; // 🚀 حفظنا الصورة محلياً لتضل فخمة وبدون رفة
        if (row) row.remove();
        pushMessage({ type: type, url: data.secure_url, duration: extraData?.duration || null, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: tempMsg.replyTo });
      } else throw new Error('فشل');
    } catch (e) {

      if (row) { const ov = row.querySelector('.pending-overlay'); if (ov) ov.innerHTML = `<button onclick="window.pendingUploads['${tempId}']()" style="background:var(--bg-surface); border:1px solid var(--neon-pink); color:var(--neon-pink); padding:8px 16px; border-radius:12px; cursor:pointer; font-family:var(--font-ar); font-size:12px; font-weight:bold; box-shadow:var(--shadow-pink);">فشل، اضغط للإعادة 🔄</button>`; }
    }
  };
  window.pendingUploads[tempId] = tryUpload;
  await tryUpload();
}

/* ═══════════════════════════════════
   IMAGE UPLOAD
═══════════════════════════════════ */
document.getElementById('file-img-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentChat) return;
  e.target.value = '';
  uploadMediaWithUI(file, 'image');
});

/* ═══════════════════════════════════
   VOICE RECORDING
═══════════════════════════════════ */
async function toggleRecording(isSinging = false) {
  if (isRecording) { stopRecording(); return; }
  if (!navigator.mediaDevices) { showToast('المتصفح لا يدعم التسجيل', 'error'); return; }
  try {
    isSingingMode = isSinging; 
    let audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 2 };
    if (internalMicId) audioConstraints.deviceId = { exact: internalMicId };
    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(rawStream);
    const analyser = audioCtx.createAnalyser(); analyser.fftSize = 64; source.connect(analyser);

    const preGain = audioCtx.createGain(); preGain.gain.value = 0.5;
    const lowCutFilter = audioCtx.createBiquadFilter(); lowCutFilter.type = "highpass"; lowCutFilter.frequency.value = 160;
    const highCutFilter = audioCtx.createBiquadFilter(); highCutFilter.type = "lowpass"; highCutFilter.frequency.value = 10000;
    const presenceEQ = audioCtx.createBiquadFilter(); presenceEQ.type = "peaking"; presenceEQ.frequency.value = 3500; presenceEQ.Q.value = 1; presenceEQ.gain.value = 4; 
    const compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -15; compressor.knee.value = 30; compressor.ratio.value = 3; compressor.attack.value = 0.005; compressor.release.value = 0.25;

    function generateReverb(ctx) {
      const length = ctx.sampleRate * 3.5; const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      const left = impulse.getChannelData(0); const right = impulse.getChannelData(1);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 1.5); 
        left[i] = (Math.random() * 2 - 1) * decay; right[i] = (Math.random() * 2 - 1) * decay;
      }
      return impulse;
    }

    const convolver = audioCtx.createConvolver(); convolver.buffer = generateReverb(audioCtx);
    const dryGain = audioCtx.createGain(); dryGain.gain.value = 0.6; 
    const wetGain = audioCtx.createGain(); wetGain.gain.value = isSingingMode ? (10 / 100) * 3 : (3 / 100) * 3; 
    const dest = audioCtx.createMediaStreamDestination();

    source.connect(preGain); preGain.connect(lowCutFilter); lowCutFilter.connect(highCutFilter); highCutFilter.connect(presenceEQ); presenceEQ.connect(compressor);
    compressor.connect(dryGain); dryGain.connect(dest); compressor.connect(convolver); convolver.connect(wetGain); wetGain.connect(dest);

    audioChunks = []; isRecordingCanceled = false;
    mediaRecorder = new MediaRecorder(dest.stream, { audioBitsPerSecond: 256000 });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      rawStream.getTracks().forEach(t => t.stop()); if(audioCtx.state !== 'closed') audioCtx.close();
      if (isRecordingCanceled) { showToast('تم رمي التسجيل 🗑️'); return; }
      
      const localChunks = [...audioChunks];
      const blob = new Blob(localChunks, { type: 'audio/webm' });
      const finalDuration = recordDurationStr;
      
      const tempId = 'temp-audio-' + Date.now();
      const area = document.getElementById('messages-area');
      if (area) {
        const tempDiv = document.createElement('div');
        tempDiv.className = 'msg-row out';
        tempDiv.id = tempId;
        tempDiv.innerHTML = `<div class="msg-bubble" style="background:rgba(0, 240, 255, 0.05); border:1px dashed var(--neon-cyan); color:var(--text-secondary); display:flex; align-items:center; gap:8px;"><div style="width:16px; height:16px; border:2px solid var(--border-subtle); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div><span style="font-size:13px;">${isSingingMode ? 'جاري إرسال مقطع الغناء... 🎤' : 'جاري إرسال المقطع...'}</span></div>`;
        area.appendChild(tempDiv);
        area.scrollTop = area.scrollHeight;
      }

      await new Promise(r => setTimeout(r, 50));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); 

      try {
        const fd = new FormData();
        fd.append('file', blob);
        fd.append('upload_preset', 'malaboushi_preset');
        
        const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
          method: 'POST', body: fd, signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();
        
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();

        if (data.secure_url) {
          let replyData = null;
          if (replyingToMsg) {
            replyData = { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت' };
            cancelReply();
          }
          await pushMessage({ type: 'voice', url: data.secure_url, duration: finalDuration, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: replyData });
        } else throw new Error('فشل الرفع');
      } catch (e) {
        clearTimeout(timeoutId);
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();
        if (e.name === 'AbortError') { showToast('انتهى وقت الرفع، تأكد من جودة اتصالك', 'error'); } 
        else { showToast('فشل: ' + e.message, 'error'); }
      }
    };
    
    mediaRecorder.start(200); isRecording = true; recordStart = Date.now();

    if (isSingingMode) { document.getElementById('btn-music-voice').classList.add('recording'); document.getElementById('btn-voice').style.display = 'none'; } 
    else { document.getElementById('btn-voice').classList.add('recording'); document.getElementById('btn-music-voice').style.display = 'none'; }

    document.getElementById('msg-input-wrap').style.display = 'none'; document.getElementById('btn-attach').style.display = 'none';
    document.getElementById('btn-cancel-voice').style.display = 'flex'; document.getElementById('recording-indicator').style.display = 'flex';
    
    let canvas = document.getElementById('neon-visualizer');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'neon-visualizer'; canvas.width = 100; canvas.height = 25; canvas.style.marginLeft = '12px'; document.getElementById('recording-indicator').appendChild(canvas); }
    canvas.style.display = 'block'; const canvasCtx = canvas.getContext('2d'); const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function drawVisualizer() {
      if (!isRecording) return;
      requestAnimationFrame(drawVisualizer); analyser.getByteFrequencyData(dataArray); canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      let x = 0; const barWidth = (canvas.width / analyser.frequencyBinCount) * 2;
      for (let i = 0; i < analyser.frequencyBinCount; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        canvasCtx.fillStyle = isSingingMode ? 'rgba(255, 0, 144, 0.9)' : 'rgba(0, 240, 255, 0.9)';
        canvasCtx.shadowBlur = 6; canvasCtx.shadowColor = isSingingMode ? '#ff0090' : '#00f0ff';
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight); x += barWidth + 1.5;
      }
    }
    drawVisualizer();

    if (currentChat) { const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid); recRef.set('recording'); recRef.onDisconnect().remove(); }
    if (typeof recordTimerInt !== 'undefined') clearInterval(recordTimerInt);
    recordDurationStr = '0:00'; const timerSpan = document.getElementById('rec-timer-text'); if (timerSpan) timerSpan.textContent = '0:00';
    recordTimerInt = setInterval(() => {
      const sec = Math.floor((Date.now() - recordStart) / 1000), m = Math.floor(sec / 60), s = sec % 60;
      recordDurationStr = m + ':' + (s < 10 ? '0' : '') + s;
      if (timerSpan) timerSpan.textContent = recordDurationStr;
    }, 1000);
  } catch (e) { showToast('تعذر الوصول للمايكروفون', 'error'); }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  if (currentChat) { const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid); recRef.remove(); recRef.onDisconnect().cancel(); }
  document.getElementById('btn-voice').classList.remove('recording'); document.getElementById('btn-voice').style.display = 'flex';
  const btnMusic = document.getElementById('btn-music-voice'); if (btnMusic) { btnMusic.classList.remove('recording'); btnMusic.style.display = 'flex'; }
  document.getElementById('msg-input-wrap').style.display = 'block'; document.getElementById('btn-attach').style.display = 'flex';
  document.getElementById('btn-cancel-voice').style.display = 'none'; document.getElementById('recording-indicator').style.display = 'none';
  const canvas = document.getElementById('neon-visualizer'); if (canvas) canvas.style.display = 'none';
  clearInterval(recordTimerInt);
}

function cancelVoiceRecord() { isRecordingCanceled = true; stopRecording(); }

/* ═══════════════════════════════════
   VOICE PLAYBACK & PROGRESS
═══════════════════════════════════ */
var currentAudio = null, currentAudioUrl = null, audioUpdateInterval = null;

function playVoice(btn, url, msgKey, isOut) {
  if (isOut === false && currentChat) {
    db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ listened: true });
    const dot = document.getElementById('unplayed-' + msgKey); if (dot) { dot.style.background = 'transparent'; dot.style.boxShadow = 'none'; }
  }
  if (currentAudio && currentAudioUrl === url) {
    if (!currentAudio.paused) { currentAudio.pause(); btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`; clearInterval(audioUpdateInterval); return; } 
    else { currentAudio.play(); btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; startAudioProgress(msgKey); return; }
  }
  if (currentAudio) {
    currentAudio.pause(); document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`);
    document.querySelectorAll('.voice-progress-fill').forEach(f => f.style.width = '0%'); clearInterval(audioUpdateInterval);
  }
  currentAudioUrl = url; currentAudio = new Audio(url); currentAudio.preload = 'auto'; 
  btn.innerHTML = `<div style="width:16px;height:16px;border:2px solid rgba(0, 240, 255, 0.3);border-top-color:var(--bg-void);border-radius:50%;animation:spin .8s linear infinite;"></div>`;
  currentAudio.onplaying = () => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; startAudioProgress(msgKey); };
  currentAudio.onwaiting = () => { btn.innerHTML = `<div style="width:16px;height:16px;border:2px solid rgba(0, 240, 255, 0.3);border-top-color:var(--bg-void);border-radius:50%;animation:spin .8s linear infinite;"></div>`; };
  
  let playPromise = currentAudio.play();
  if (playPromise !== undefined) playPromise.catch(e => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`; });

  currentAudio.onended = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = '0%';
    const durEl = document.getElementById('dur-' + msgKey); if (durEl) durEl.textContent = durEl.getAttribute('data-orig');
    let currentRow = btn.closest('.msg-row'), nextRow = currentRow ? currentRow.nextElementSibling : null;
    while (nextRow && nextRow.classList.contains('date-sep')) nextRow = nextRow.nextElementSibling;
    let nextBtn = nextRow && nextRow.classList.contains('msg-row') ? nextRow.querySelector('.voice-play-btn') : null;
    currentAudio = null; currentAudioUrl = null; clearInterval(audioUpdateInterval);
    if (nextBtn) nextBtn.click();
  };
}

function startAudioProgress(msgKey) {
  clearInterval(audioUpdateInterval);
  const durEl = document.getElementById('dur-' + msgKey);
  const origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0; if (origStr) { const parts = origStr.split(':'); if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]); }
  audioUpdateInterval = setInterval(() => {
    if (currentAudio && !currentAudio.paused) {
      let totalDuration = currentAudio.duration; if (!totalDuration || totalDuration === Infinity) totalDuration = fallbackDuration;
      if (totalDuration > 0) {
        let perc = (currentAudio.currentTime / totalDuration) * 100; if (perc > 100) perc = 100;
        let fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = perc + '%';
        if (durEl) { const curSec = Math.floor(currentAudio.currentTime), m = Math.floor(curSec / 60), s = curSec % 60; durEl.textContent = `${m}:${s < 10 ? '0' : ''}${s} / ${origStr}`; }
      }
    }
  }, 30); 
}

function seekVoice(event, url, msgKey) {
  if (!currentAudio || currentAudioUrl !== url) return;
  const durEl = document.getElementById('dur-' + msgKey), origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0; if (origStr) { const parts = origStr.split(':'); if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]); }
  let totalDuration = currentAudio.duration; if (!totalDuration || totalDuration === Infinity) totalDuration = fallbackDuration; if (!totalDuration) return;
  const rect = event.currentTarget.getBoundingClientRect(), clickX = rect.right - event.clientX; 
  let perc = clickX / rect.width; if (perc < 0) perc = 0; if (perc > 1) perc = 1;
  currentAudio.currentTime = totalDuration * perc;
  const fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = (perc * 100) + '%';
}

/* ═══════════════════════════════════
   SEND MESSAGES (TEXT), REACTION & MENU
═══════════════════════════════════ */
let lastTypingTime = 0; // 🚀 السحر هون: تعريف المتغير اللي كان ناقص وعم يوقف إشارة الكتابة

document.getElementById('msg-input').addEventListener('input', () => {
  if (!currentChat || isRecording) return;
  const now = Date.now(), typingRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid);
  if (now - lastTypingTime > 1500) { typingRef.set('typing'); typingRef.onDisconnect().remove(); lastTypingTime = now; }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { if (currentChat) { typingRef.remove(); typingRef.onDisconnect().cancel(); } lastTypingTime = 0; }, 2000);
});

function handleMsgKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMsg(); return; } }

async function sendTextMsg() {
  if (isRecording) { stopRecording(); return; }
  if (currentChat) { db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove(); clearTimeout(typingTimeout); }
  const inp = document.getElementById('msg-input'), text = inp.value.trim();
  if (!text || !currentChat) return;
  inp.value = ''; autoResize(inp); inp.focus(); 
  if (editingMsgKey) { await db.ref('chats/' + currentChat.chatId + '/messages/' + editingMsgKey).update({ text, isEdited: true }); updateLastMsgAfterChange(); editingMsgKey = null; showToast('تم تعديل الرسالة', 'success'); return; }
  let replyData = null;
  if (replyingToMsg) { replyData = { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت' }; cancelReply(); }
  await pushMessage({ type: 'text', text, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: replyData });
}

async function pushMessage(msg) {
  const { chatId, friendUid } = currentChat;
  const ref = db.ref('chats/' + chatId + '/messages').push(); await ref.set(msg);
  const lastMsg = msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : '🎙️ رسالة صوتية';
  await db.ref().update({
    [`userChats/${currentUser.uid}/${chatId}/lastMsg`]: lastMsg, [`userChats/${currentUser.uid}/${chatId}/updatedAt`]: msg.timestamp,
    [`userChats/${friendUid}/${chatId}/lastMsg`]: lastMsg, [`userChats/${friendUid}/${chatId}/updatedAt`]: msg.timestamp
  });
  db.ref(`userChats/${friendUid}/${chatId}/unread`).transaction(v => (v || 0) + 1);
  try {
    const friendSnap = await db.ref('users/' + friendUid).once('value');
    if (friendSnap.exists() && friendSnap.val().fcmToken) {
      fetch(`${VERCEL_URL}/api/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: friendSnap.val().fcmToken, title: myProfile.name, body: lastMsg, icon: 'icon-192.png' }) });
    }
  } catch (err) {}
}

function toggleReaction(msgKey) { if (!currentChat) return; const ref = db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey); ref.once('value', snap => { const m = snap.val(); if (m) ref.update({ reaction: m.reaction === '❤️' ? null : '❤️' }); }); }

function updateLastMsgAfterChange() {
  if (!currentChat) return;
  db.ref('chats/' + currentChat.chatId + '/messages').orderByChild('timestamp').limitToLast(1).once('value', snap => {
    if (snap.exists()) { snap.forEach(child => {
        const m = child.val(), text = m.isDeleted ? '🚫 رسالة محذوفة' : (m.type === 'text' ? m.text : m.type === 'image' ? '📷 صورة' : '🎙️ مقطع صوتي');
        db.ref().update({ [`userChats/${currentUser.uid}/${currentChat.chatId}/lastMsg`]: text, [`userChats/${currentChat.friendUid}/${currentChat.chatId}/lastMsg`]: text });
    }); }
  });
}

function openMsgMenu(msg, isOut) {
  const menu = document.getElementById('msg-menu'); menu.innerHTML = '';
  const emojis = ['😂', '😅', '🤣', '😍', '🥰', '🙂', '🙄', '😱', '🥺', '😴', '🔥', '💯', '🙏🏻', '👍🏻', '👏🏻', '👊🏻', '🎧', '🎶', '💙'];
  let emojiHtml = `<div style="display:flex; flex-wrap:wrap; gap:8px; padding:10px; background:rgba(0,240,255,0.05); border-radius:12px; margin-bottom:8px; justify-content:center;">`;
  emojis.forEach(em => { emojiHtml += `<div style="font-size:24px; cursor:pointer; padding:2px;" onclick="addReaction('${msg.key}', '${em}'); closeMsgMenu();">${em}</div>`; }); emojiHtml += `</div>`; menu.innerHTML += emojiHtml;
  
  const btnReply = document.createElement('button'); btnReply.className = 'msg-menu-btn'; btnReply.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> رد`;
  btnReply.onclick = () => { prepareReply(msg); closeMsgMenu(); }; menu.appendChild(btnReply);
  
  if (msg.type === 'text') {
    const btnCopy = document.createElement('button'); btnCopy.className = 'msg-menu-btn'; btnCopy.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> نسخ النص`;
    btnCopy.onclick = () => { navigator.clipboard.writeText(msg.text).then(() => showToast('تم النسخ', 'success')); closeMsgMenu(); }; menu.appendChild(btnCopy);
  }
  if (isOut) {
    if (msg.type === 'text') {
      const btnEdit = document.createElement('button'); btnEdit.className = 'msg-menu-btn'; btnEdit.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل`;
      btnEdit.onclick = () => { prepareEdit(msg.key, msg.text); closeMsgMenu(); }; menu.appendChild(btnEdit);
    }
    const btnDel = document.createElement('button'); btnDel.className = 'msg-menu-btn danger'; btnDel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> حذف الرسالة`;
    btnDel.onclick = () => { confirmDeleteMsg(msg.key); closeMsgMenu(); }; menu.appendChild(btnDel);
  }
  document.getElementById('msg-menu-overlay').classList.add('open');
}

function addReaction(msgKey, emoji) { if (!currentChat) return; db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ reaction: emoji }); }
function closeMsgMenu() { document.getElementById('msg-menu-overlay').classList.remove('open'); }
function prepareReply(msg) { replyingToMsg = msg; editingMsgKey = null; document.getElementById('msg-reply-preview').classList.add('active'); document.getElementById('msg-reply-text').textContent = 'رد على: ' + (msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : '🎙️ صوتية'); document.getElementById('msg-input').focus(); }
function cancelReply() { replyingToMsg = null; document.getElementById('msg-reply-preview').classList.remove('active'); }
function prepareEdit(msgKey, oldText) { editingMsgKey = msgKey; cancelReply(); const inp = document.getElementById('msg-input'); inp.value = oldText; autoResize(inp); inp.focus(); showToast('وضع التعديل مفعل ✏️'); }
function confirmDeleteMsg(msgKey) { openModal('حذف الرسالة', 'هل تريد حذف هذه الرسالة للجميع؟').then(ok => { if (ok && currentChat) { db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ isDeleted: true, text: null, url: null, type: 'deleted' }).then(() => { updateLastMsgAfterChange(); showToast('تم حذف الرسالة', 'success'); }); } }); }

/* ═══════════════════════════════════
   IMAGE PREVIEW, ZOOM & PAN
═══════════════════════════════════ */
let currentScale = 1; let imgTx = 0, imgTy = 0; let imgStartX = 0, imgStartY = 0;

window.previewImg = function(url) {
  const img = document.getElementById('img-preview-el');
  img.src = url;
  currentScale = 1; imgTx = 0; imgTy = 0;
  img.style.transform = `translate(0px, 0px) scale(1)`;
  document.getElementById('img-preview-overlay').classList.add('open');
  try { history.pushState({ overlay: 'image' }, '', ''); } catch(e){}
};

// الدالة المسؤولة عن إغلاق الصورة والعودة للمحادثة
function closeImgPreview() {
  document.getElementById('img-preview-overlay').classList.remove('open');
  setTimeout(() => { document.getElementById('img-preview-el').src = ''; }, 250);
}

const imgEl = document.getElementById('img-preview-el');
const overlayEl = document.getElementById('img-preview-overlay');

// الخروج عند الضغط خارج الصورة
overlayEl.addEventListener('click', (e) => { 
  if (e.target === overlayEl) history.back(); 
});

let imgLastTap = 0;
imgEl.addEventListener('touchstart', (e) => {
  const now = Date.now();
  if (now - imgLastTap < 300 && now - imgLastTap > 0) {
    currentScale = currentScale === 1 ? 4 : 1; imgTx = 0; imgTy = 0;
    imgEl.style.transition = 'transform 0.2s ease';
    imgEl.style.transform = `translate(0px, 0px) scale(${currentScale})`;
    e.preventDefault();
  } else {
    imgStartX = e.touches[0].clientX - imgTx; imgStartY = e.touches[0].clientY - imgTy;
    imgEl.style.transition = 'none';
  }
  imgLastTap = now;
});
imgEl.addEventListener('touchmove', (e) => {
  if (currentScale > 1) {
    e.preventDefault();
    imgTx = e.touches[0].clientX - imgStartX; imgTy = e.touches[0].clientY - imgStartY;
    imgEl.style.transform = `translate(${imgTx}px, ${imgTy}px) scale(${currentScale})`;
  }
});

/* ═══════════════════════════════════
   UNIVERSAL UPLOAD ENGINE
═══════════════════════════════════ */
window.pendingUploads = {};
window.lastUploadedUrl = null;

async function uploadMediaWithUI(file, type, extraData = null) {
  const tempId = 'temp_' + Date.now();
  const tempUrl = URL.createObjectURL(file);
  const area = document.getElementById('messages-area');

  const tempMsg = {
    key: tempId, type: type, url: tempUrl, duration: extraData?.duration || '0:00',
    senderUid: currentUser.uid, timestamp: Date.now(), isPending: true,
    replyTo: replyingToMsg ? { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت' } : null
  };
  if (replyingToMsg) cancelReply();

  if (area) {
    const el = buildMsgEl(tempMsg, false); el.id = 'row_' + tempId;
    area.appendChild(el); setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
  }

  const tryUpload = async () => {
    const row = document.getElementById('row_' + tempId);
    if (row) { const ov = row.querySelector('.pending-overlay'); if (ov) ov.innerHTML = `<div style="width:24px; height:24px; border:3px solid rgba(0, 240, 255, 0.3); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div>`; }
    try {
      const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 12000);
      const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', 'malaboushi_preset');
      const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', { method: 'POST', body: fd, signal: controller.signal });
      clearTimeout(timeoutId); const data = await res.json();
      if (data.secure_url) {
        window.lastUploadedUrl = data.secure_url;
        if (type === 'image' && window.localImageCache) window.localImageCache[data.secure_url] = tempUrl;
        if (row) row.remove();
        await pushMessage({ type: type, url: data.secure_url, duration: extraData?.duration || null, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: tempMsg.replyTo });
      } else throw new Error('فشل');
    } catch (e) {
      if (row) { const ov = row.querySelector('.pending-overlay'); if (ov) ov.innerHTML = `<button onclick="window.pendingUploads['${tempId}']()" style="background:var(--bg-surface); border:1px solid var(--neon-pink); color:var(--neon-pink); padding:8px 16px; border-radius:12px; cursor:pointer; font-family:var(--font-ar); font-size:12px; font-weight:bold; box-shadow:var(--shadow-pink);">فشل، اضغط للإعادة 🔄</button>`; }
    }
  };
  window.pendingUploads[tempId] = tryUpload;
  await tryUpload();
}

document.getElementById('file-img-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentChat) return;
  e.target.value = '';
  uploadMediaWithUI(file, 'image');
});

/* ═══════════════════════════════════
   VOICE RECORDING
═══════════════════════════════════ */
async function toggleRecording(isSinging = false) {
  if (isRecording) { stopRecording(); return; }
  if (!navigator.mediaDevices) { showToast('المتصفح لا يدعم التسجيل', 'error'); return; }
  try {
    isSingingMode = isSinging; 
    let audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 2 };
    if (internalMicId) audioConstraints.deviceId = { exact: internalMicId };
    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(rawStream);
    const analyser = audioCtx.createAnalyser(); analyser.fftSize = 64; source.connect(analyser);

    const preGain = audioCtx.createGain(); preGain.gain.value = 0.5;
    const lowCutFilter = audioCtx.createBiquadFilter(); lowCutFilter.type = "highpass"; lowCutFilter.frequency.value = 160;
    const highCutFilter = audioCtx.createBiquadFilter(); highCutFilter.type = "lowpass"; highCutFilter.frequency.value = 10000;
    const presenceEQ = audioCtx.createBiquadFilter(); presenceEQ.type = "peaking"; presenceEQ.frequency.value = 3500; presenceEQ.Q.value = 1; presenceEQ.gain.value = 4; 
    const compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -15; compressor.knee.value = 30; compressor.ratio.value = 3; compressor.attack.value = 0.005; compressor.release.value = 0.25;

    function generateReverb(ctx) {
      const length = ctx.sampleRate * 3.5; const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      const left = impulse.getChannelData(0); const right = impulse.getChannelData(1);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 1.5); 
        left[i] = (Math.random() * 2 - 1) * decay; right[i] = (Math.random() * 2 - 1) * decay;
      }
      return impulse;
    }

    const convolver = audioCtx.createConvolver(); convolver.buffer = generateReverb(audioCtx);
    const dryGain = audioCtx.createGain(); dryGain.gain.value = 0.6; 
    const wetGain = audioCtx.createGain(); wetGain.gain.value = isSingingMode ? (10 / 100) * 3 : (3 / 100) * 3; 
    const dest = audioCtx.createMediaStreamDestination();

    source.connect(preGain); preGain.connect(lowCutFilter); lowCutFilter.connect(highCutFilter); highCutFilter.connect(presenceEQ); presenceEQ.connect(compressor);
    compressor.connect(dryGain); dryGain.connect(dest); compressor.connect(convolver); convolver.connect(wetGain); wetGain.connect(dest);

    audioChunks = []; isRecordingCanceled = false;
    mediaRecorder = new MediaRecorder(dest.stream, { audioBitsPerSecond: 256000 });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      rawStream.getTracks().forEach(t => t.stop()); if(audioCtx.state !== 'closed') audioCtx.close();
      if (isRecordingCanceled) { showToast('تم رمي التسجيل 🗑️'); return; }
      
      const localChunks = [...audioChunks];
      const blob = new Blob(localChunks, { type: 'audio/webm' });
      const finalDuration = recordDurationStr;
      
      const tempId = 'temp-audio-' + Date.now();
      const area = document.getElementById('messages-area');
      if (area) {
        const tempDiv = document.createElement('div');
        tempDiv.className = 'msg-row out';
        tempDiv.id = tempId;
        tempDiv.innerHTML = `<div class="msg-bubble" style="background:rgba(0, 240, 255, 0.05); border:1px dashed var(--neon-cyan); color:var(--text-secondary); display:flex; align-items:center; gap:8px;"><div style="width:16px; height:16px; border:2px solid var(--border-subtle); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div><span style="font-size:13px;">${isSingingMode ? 'جاري إرسال مقطع الغناء... 🎤' : 'جاري إرسال المقطع...'}</span></div>`;
        area.appendChild(tempDiv);
        area.scrollTop = area.scrollHeight;
      }

      await new Promise(r => setTimeout(r, 50));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); 

      try {
        const fd = new FormData();
        fd.append('file', blob);
        fd.append('upload_preset', 'malaboushi_preset');
        
        const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
          method: 'POST', body: fd, signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();
        
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();

        if (data.secure_url) {
          let replyData = null;
          if (replyingToMsg) {
            replyData = { key: replyingToMsg.key, text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت' };
            cancelReply();
          }
          await pushMessage({ type: 'voice', url: data.secure_url, duration: finalDuration, senderUid: currentUser.uid, timestamp: Date.now(), replyTo: replyData });
        } else throw new Error('فشل الرفع');
      } catch (e) {
        clearTimeout(timeoutId);
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();
        if (e.name === 'AbortError') { showToast('انتهى وقت الرفع، تأكد من جودة اتصالك', 'error'); } 
        else { showToast('فشل: ' + e.message, 'error'); }
      }
    };
    
    mediaRecorder.start(200); isRecording = true; recordStart = Date.now();

    if (isSingingMode) { document.getElementById('btn-music-voice').classList.add('recording'); document.getElementById('btn-voice').style.display = 'none'; } 
    else { document.getElementById('btn-voice').classList.add('recording'); document.getElementById('btn-music-voice').style.display = 'none'; }

    document.getElementById('msg-input-wrap').style.display = 'none'; document.getElementById('btn-attach').style.display = 'none';
    document.getElementById('btn-cancel-voice').style.display = 'flex'; document.getElementById('recording-indicator').style.display = 'flex';
    
    let canvas = document.getElementById('neon-visualizer');
    if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'neon-visualizer'; canvas.width = 100; canvas.height = 25; canvas.style.marginLeft = '12px'; document.getElementById('recording-indicator').appendChild(canvas); }
    canvas.style.display = 'block'; const canvasCtx = canvas.getContext('2d'); const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function drawVisualizer() {
      if (!isRecording) return;
      requestAnimationFrame(drawVisualizer); analyser.getByteFrequencyData(dataArray); canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      let x = 0; const barWidth = (canvas.width / analyser.frequencyBinCount) * 2;
      for (let i = 0; i < analyser.frequencyBinCount; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        canvasCtx.fillStyle = isSingingMode ? 'rgba(255, 0, 144, 0.9)' : 'rgba(0, 240, 255, 0.9)';
        canvasCtx.shadowBlur = 6; canvasCtx.shadowColor = isSingingMode ? '#ff0090' : '#00f0ff';
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight); x += barWidth + 1.5;
      }
    }
    drawVisualizer();

    if (currentChat) { const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid); recRef.set('recording'); recRef.onDisconnect().remove(); }
    if (typeof recordTimerInt !== 'undefined') clearInterval(recordTimerInt);
    recordDurationStr = '0:00'; const timerSpan = document.getElementById('rec-timer-text'); if (timerSpan) timerSpan.textContent = '0:00';
    recordTimerInt = setInterval(() => {
      const sec = Math.floor((Date.now() - recordStart) / 1000), m = Math.floor(sec / 60), s = sec % 60;
      recordDurationStr = m + ':' + (s < 10 ? '0' : '') + s;
      if (timerSpan) timerSpan.textContent = recordDurationStr;
    }, 1000);
  } catch (e) { showToast('تعذر الوصول للمايكروفون', 'error'); }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  if (currentChat) { const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid); recRef.remove(); recRef.onDisconnect().cancel(); }
  document.getElementById('btn-voice').classList.remove('recording'); document.getElementById('btn-voice').style.display = 'flex';
  const btnMusic = document.getElementById('btn-music-voice'); if (btnMusic) { btnMusic.classList.remove('recording'); btnMusic.style.display = 'flex'; }
  document.getElementById('msg-input-wrap').style.display = 'block'; document.getElementById('btn-attach').style.display = 'flex';
  document.getElementById('btn-cancel-voice').style.display = 'none'; document.getElementById('recording-indicator').style.display = 'none';
  const canvas = document.getElementById('neon-visualizer'); if (canvas) canvas.style.display = 'none';
  clearInterval(recordTimerInt);
}

function cancelVoiceRecord() { isRecordingCanceled = true; stopRecording(); }

/* ═══════════════════════════════════
   VOICE PLAYBACK & PROGRESS
═══════════════════════════════════ */
var currentAudio = null, currentAudioUrl = null, audioUpdateInterval = null;

function playVoice(btn, url, msgKey, isOut) {
  if (isOut === false && currentChat) {
    db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ listened: true });
    const dot = document.getElementById('unplayed-' + msgKey); if (dot) { dot.style.background = 'transparent'; dot.style.boxShadow = 'none'; }
  }
  if (currentAudio && currentAudioUrl === url) {
    if (!currentAudio.paused) { currentAudio.pause(); btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`; clearInterval(audioUpdateInterval); return; } 
    else { currentAudio.play(); btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; startAudioProgress(msgKey); return; }
  }
  if (currentAudio) {
    currentAudio.pause(); document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`);
    document.querySelectorAll('.voice-progress-fill').forEach(f => f.style.width = '0%'); clearInterval(audioUpdateInterval);
  }
  
  currentAudioUrl = url; currentAudio = new Audio(url); currentAudio.preload = 'auto'; 
  
  // 🚀 السحر هون: رجعنا الدالة القديمة اللي بتشغل فوراً وبتعطي أيقونة التشغيل بدون أي انتظار أو تحميل وهمي
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  
  let playPromise = currentAudio.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => console.log("Audio playback waiting..."));
  }
  
  startAudioProgress(msgKey);

  currentAudio.onended = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = '0%';
    const durEl = document.getElementById('dur-' + msgKey); if (durEl) durEl.textContent = durEl.getAttribute('data-orig');
    let currentRow = btn.closest('.msg-row'), nextRow = currentRow ? currentRow.nextElementSibling : null;
    while (nextRow && nextRow.classList.contains('date-sep')) nextRow = nextRow.nextElementSibling;
    let nextBtn = nextRow && nextRow.classList.contains('msg-row') ? nextRow.querySelector('.voice-play-btn') : null;
    currentAudio = null; currentAudioUrl = null; clearInterval(audioUpdateInterval);
    if (nextBtn) nextBtn.click();
  };
}

function startAudioProgress(msgKey) {
  clearInterval(audioUpdateInterval);
  const durEl = document.getElementById('dur-' + msgKey);
  const origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0; if (origStr) { const parts = origStr.split(':'); if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]); }
  audioUpdateInterval = setInterval(() => {
    if (currentAudio && !currentAudio.paused) {
      let totalDuration = currentAudio.duration; if (!totalDuration || totalDuration === Infinity) totalDuration = fallbackDuration;
      if (totalDuration > 0) {
        let perc = (currentAudio.currentTime / totalDuration) * 100; if (perc > 100) perc = 100;
        let fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = perc + '%';
        if (durEl) { const curSec = Math.floor(currentAudio.currentTime), m = Math.floor(curSec / 60), s = curSec % 60; durEl.textContent = `${m}:${s < 10 ? '0' : ''}${s} / ${origStr}`; }
      }
    }
  }, 30); 
}

function seekVoice(event, url, msgKey) {
  if (!currentAudio || currentAudioUrl !== url) return;
  const durEl = document.getElementById('dur-' + msgKey), origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0; if (origStr) { const parts = origStr.split(':'); if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]); }
  let totalDuration = currentAudio.duration; if (!totalDuration || totalDuration === Infinity) totalDuration = fallbackDuration; if (!totalDuration) return;
  const rect = event.currentTarget.getBoundingClientRect(), clickX = rect.right - event.clientX; 
  let perc = clickX / rect.width; if (perc < 0) perc = 0; if (perc > 1) perc = 1;
  currentAudio.currentTime = totalDuration * perc;
  const fill = document.getElementById('progress-' + msgKey); if (fill) fill.style.width = (perc * 100) + '%';
}

/* ═══════════════════════════════════
   SCROLL & CHAT UTILS
═══════════════════════════════════ */
function scrollToMessage(msgKey) {
  const targetEl = document.getElementById('msg-' + msgKey);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.style.transition = 'all 0.3s ease'; targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)'; targetEl.style.transform = 'scale(1.05)';
    setTimeout(() => { targetEl.style.boxShadow = 'none'; targetEl.style.transform = 'scale(1)'; }, 1500);
  } else {
    // السحر هون: إذا الرسالة قديمة ومو محملة بالشاشة، استدعي دالة القفز للأرشيف فوراً
    if (typeof jumpToMessageContext === 'function') jumpToMessageContext(msgKey);
  }
}

document.body.style.overscrollBehavior = 'none';
document.documentElement.style.overscrollBehavior = 'none';
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const appEl = document.getElementById('app'); appEl.style.height = window.visualViewport.height + 'px'; appEl.style.position = 'fixed'; appEl.style.top = '0'; appEl.style.width = '100%';
    window.scrollTo(0, 0); const area = document.getElementById('messages-area'); if (area) area.scrollTop = area.scrollHeight;
  });
}
document.body.addEventListener('touchmove', (e) => {
  const isScrollable = e.target.closest('#messages-area') || e.target.closest('.chats-list') || e.target.closest('.add-friend-body') || e.target.closest('.profile-body') || e.target.closest('#firebase-search-results');
  if (!isScrollable) e.preventDefault();
}, { passive: false });

const msgInputEl = document.getElementById('msg-input');
if(msgInputEl) { msgInputEl.addEventListener('focus', () => { setTimeout(() => window.scrollTo(0, 0), 50); }); }

/* ═══════════════════════════════════
   CALL SYSTEM & AGORA
═══════════════════════════════════ */
const AGORA_APP_ID = "7ca23eb56dfd45f7a89e9fd2a03a40ca";
function initCallListener(uid) {
  if (myCallListener) db.ref('calls/' + uid).off('value', myCallListener);
  myCallListener = db.ref('calls/' + uid).on('value', snap => {
    const data = snap.val();
    if (!data) { forceEndCallUI(); return; }
    currentCallPeer = data.peerUid; currentCallId = data.chatId;
    const avatarView = document.getElementById('call-avatar-view'), nameView = document.getElementById('call-name-view'), statusView = document.getElementById('call-status-view'), acceptBtn = document.getElementById('btn-accept-call'), ringAudio = document.getElementById('ringtone-audio');
    if (nameView) nameView.textContent = data.peerName || 'مستخدم';
    if (avatarView) avatarView.textContent = (data.peerName || '?').charAt(0);
    
    if (data.status === 'incoming') {
      if(statusView) { statusView.textContent = 'يتصل بك... 📞'; statusView.style.color = 'var(--neon-cyan)'; }
      if(acceptBtn) acceptBtn.style.display = 'flex';
      if(ringAudio && ringAudio.paused) ringAudio.play().catch(e=>{});
      if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500]);
      renderScreenUI('call');
    } else if (data.status === 'answered') {
      if(ringAudio && !ringAudio.paused) ringAudio.pause();
      if(acceptBtn) acceptBtn.style.display = 'none';
      if(statusView) statusView.textContent = 'جاري التوصيل...';
      startCallTimer();
      if (data.role === 'caller') joinAgoraVoice(currentCallId);
    } else if (data.status === 'ended') forceEndCallUI();
  });
}

async function startCall() {
  if (!currentChat) return; currentCallPeer = currentChat.friendUid; currentCallId = [currentUser.uid, currentCallPeer].sort().join('_');
  const avatarView = document.getElementById('call-avatar-view'), nameView = document.getElementById('call-name-view'), statusView = document.getElementById('call-status-view'), acceptBtn = document.getElementById('btn-accept-call'), ringAudio = document.getElementById('ringtone-audio');
  if(nameView) nameView.textContent = currentChat.friendProfile.name; if(avatarView) avatarView.textContent = (currentChat.friendProfile.name || '?').charAt(0);
  if(statusView) { statusView.textContent = 'جاري الاتصال...'; statusView.style.color = 'var(--neon-cyan)'; }
  if(acceptBtn) acceptBtn.style.display = 'none';
  if(ringAudio && ringAudio.paused) ringAudio.play().catch(e=>{});
  renderScreenUI('call');
  await db.ref('calls/' + currentUser.uid).set({ status: 'calling', role: 'caller', peerUid: currentCallPeer, peerName: currentChat.friendProfile.name, chatId: currentCallId });
  await db.ref('calls/' + currentCallPeer).set({ status: 'incoming', role: 'callee', peerUid: currentUser.uid, peerName: myProfile.name, chatId: currentCallId });
}

async function acceptCall() {
  if (!currentCallPeer) return;
  const acceptBtn = document.getElementById('btn-accept-call'), statusView = document.getElementById('call-status-view'), ringAudio = document.getElementById('ringtone-audio');
  if(ringAudio && !ringAudio.paused) ringAudio.pause(); if(acceptBtn) acceptBtn.style.display = 'none'; if(statusView) statusView.textContent = 'جاري التوصيل...';
  await db.ref('calls/' + currentUser.uid).update({ status: 'answered' }); await db.ref('calls/' + currentCallPeer).update({ status: 'answered' });
  startCallTimer(); joinAgoraVoice(currentCallId);
}

function endCall() {
  if (currentCallPeer) db.ref('calls/' + currentCallPeer).update({ status: 'ended' });
  db.ref('calls/' + currentUser.uid).remove(); setTimeout(() => forceEndCallUI(), 500);
}

function forceEndCallUI() {
  clearInterval(callTimerInt); callTimerInt = null;
  const ringAudio = document.getElementById('ringtone-audio'); if (ringAudio && !ringAudio.paused) { ringAudio.pause(); ringAudio.currentTime = 0; }
  if (localCallTrack) { localCallTrack.close(); localCallTrack = null; }
  if (rtcCallClient) { rtcCallClient.leave(); rtcCallClient = null; }
  if (callAudioCtx && callAudioCtx.state !== 'closed') { callAudioCtx.close(); callAudioCtx = null; }
  if (callRawStream) { callRawStream.getTracks().forEach(t => t.stop()); callRawStream = null; }
  currentCallId = null;
  if (document.getElementById('screen-call').classList.contains('active')) renderScreenUI('chat');
}

function startCallTimer() {
  clearInterval(callTimerInt); const startTime = Date.now(), statusView = document.getElementById('call-status-view');
  if(statusView) statusView.style.color = 'var(--neon-green)';
  callTimerInt = setInterval(() => { const sec = Math.floor((Date.now() - startTime) / 1000), m = Math.floor(sec / 60), s = sec % 60; if(statusView) statusView.textContent = `متصل: ${m}:${s<10?'0':''}${s}`; }, 1000);
}

async function joinAgoraVoice(channelName) {
  if(!rtcCallClient) rtcCallClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  try {
    await rtcCallClient.join(AGORA_APP_ID, channelName, null, currentUser.uid);
    let audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 2 };
    if (internalMicId) audioConstraints.deviceId = { exact: internalMicId };
    callRawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    callAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = callAudioCtx.createMediaStreamSource(callRawStream);
    const preGain = callAudioCtx.createGain(); preGain.gain.value = 0.4;
    const lowCutFilter = callAudioCtx.createBiquadFilter(); lowCutFilter.type = "highpass"; lowCutFilter.frequency.value = 160;
    const highCutFilter = callAudioCtx.createBiquadFilter(); highCutFilter.type = "lowpass"; highCutFilter.frequency.value = 10000;
    const presenceEQ = callAudioCtx.createBiquadFilter(); presenceEQ.type = "peaking"; presenceEQ.frequency.value = 3500; presenceEQ.Q.value = 1; presenceEQ.gain.value = 4;
    const compressor = callAudioCtx.createDynamicsCompressor(); compressor.threshold.value = -24; compressor.knee.value = 30; compressor.ratio.value = 5; compressor.attack.value = 0.005; compressor.release.value = 0.25;
    function generateReverb(ctx) { const length = ctx.sampleRate * 3.5; const impulse = ctx.createBuffer(2, length, ctx.sampleRate); const left = impulse.getChannelData(0); const right = impulse.getChannelData(1); for (let i = 0; i < length; i++) { const decay = Math.pow(1 - i / length, 1.5); left[i] = (Math.random() * 2 - 1) * decay; right[i] = (Math.random() * 2 - 1) * decay; } return impulse; }
    const convolver = callAudioCtx.createConvolver(); convolver.buffer = generateReverb(callAudioCtx);
    const dryGain = callAudioCtx.createGain(); dryGain.gain.value = 0.85;
    const wetGain = callAudioCtx.createGain(); wetGain.gain.value = (2 / 100) * 3; 
    const dest = callAudioCtx.createMediaStreamDestination();
    source.connect(preGain); preGain.connect(lowCutFilter); lowCutFilter.connect(highCutFilter); highCutFilter.connect(presenceEQ); presenceEQ.connect(compressor);
    compressor.connect(dryGain); dryGain.connect(dest); compressor.connect(convolver); convolver.connect(wetGain); wetGain.connect(dest);
    localCallTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: dest.stream.getAudioTracks()[0], encoderConfig: "high_quality_stereo" });
    await rtcCallClient.publish([localCallTrack]);
    rtcCallClient.on("user-published", async (user, mediaType) => { await rtcCallClient.subscribe(user, mediaType); if (mediaType === "audio") user.audioTrack.play(); });
  } catch (e) { showToast('تعذر الاتصال بالصوت', 'error'); forceEndCallUI(); }
}

/* ═══════════════════════════════════
   SEARCH LOGIC & CHAT MENU
═══════════════════════════════════ */
let chatSearchResults = []; let currentSearchIndex = -1; let searchTimeout = null;
function toggleChatSearch() {
  const bar = document.getElementById('chat-search-bar'), input = document.getElementById('chat-search-input');
  if (bar.style.display === 'none') { bar.style.display = 'flex'; input.value = ''; input.focus(); removeSearchOverlay(); } 
  else { bar.style.display = 'none'; removeSearchOverlay(); }
}
function removeSearchOverlay() {
  const el = document.getElementById('firebase-search-results'); if (el) el.remove();
  const area = document.getElementById('messages-area'); if (area) area.style.display = 'flex';
}
function searchInChat(query) {
  removeSearchOverlay(); if (!query.trim()) { document.getElementById('messages-area').style.display = 'flex'; return; }
  const area = document.getElementById('messages-area'); area.style.display = 'none';
  let overlay = document.createElement('div'); overlay.id = 'firebase-search-results'; overlay.style.cssText = 'flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; background:var(--bg-void); z-index:10;';
  overlay.innerHTML = `<div style="text-align:center; color:var(--neon-cyan); margin-top:40px;"><div style="width:30px; height:30px; border:3px solid var(--border-subtle); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite; margin:0 auto 10px;"></div>جاري البحث في الأرشيف... 🔍</div>`;
  document.getElementById('screen-chat').insertBefore(overlay, document.getElementById('msg-reply-preview'));
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (!currentChat) return;
    try {
      const snap = await db.ref('chats/' + currentChat.chatId + '/messages').once('value'); let found = [];
      if (snap.exists()) snap.forEach(child => { const msg = child.val(); if (msg.type === 'text' && msg.text && msg.text.includes(query)) found.push({ ...msg, key: child.key }); });
      if (found.length === 0) { overlay.innerHTML = `<div style="text-align:center; color:var(--text-muted); margin-top:40px;">لم يتم العثور على نتائج لكلمة "${escHtml(query)}"</div><button class="btn-primary" style="margin-top:20px; width:auto; align-self:center;" onclick="toggleChatSearch()">إغلاق البحث</button>`; return; }
      found.sort((a, b) => b.timestamp - a.timestamp);
      let htmlStr = `<div style="color:var(--neon-green); margin-bottom:10px; font-weight:bold; text-align:center;">تم العثور على ${found.length} نتيجة</div>`;
      found.forEach(msg => {
        const isMe = msg.senderUid === currentUser.uid, senderName = isMe ? 'أنت' : currentChat.friendProfile.name, dateStr = new Date(msg.timestamp).toLocaleString('ar-EG', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
        const regex = new RegExp(`(${query})`, 'gi'), highlightedText = escHtml(msg.text).replace(regex, `<span style="background:var(--neon-cyan); color:var(--bg-void); padding:0 3px; border-radius:3px; font-weight:bold;">$1</span>`);
        htmlStr += `<div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:12px; padding:14px; border-right:4px solid ${isMe ? 'var(--neon-cyan)' : 'var(--neon-pink)'}; box-shadow:var(--shadow-neon); cursor:pointer; margin-bottom:8px;" onclick="jumpToMessageContext('${msg.key}')"><div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:6px;"><span style="font-weight:bold; color:${isMe ? 'var(--neon-cyan)' : 'var(--neon-pink)'}">${senderName}</span><span>${dateStr}</span></div><div style="font-size:15px; line-height:1.6; color:var(--text-primary);">${highlightedText}</div><div style="text-align:left; margin-top:8px; font-size:11px; color:var(--neon-cyan);">اضغط للانتقال ↗️</div></div>`;
      });
      htmlStr += `<button class="btn-primary" style="margin-top:20px; margin-bottom:20px; width:auto; align-self:center;" onclick="toggleChatSearch()">إغلاق البحث</button>`;
      overlay.innerHTML = htmlStr;
    } catch (e) { overlay.innerHTML = `<div style="text-align:center; color:var(--neon-pink); margin-top:40px;">حدث خطأ أثناء البحث ❌</div>`; }
  }, 800);
}
async function jumpToMessageContext(msgKey) {
  removeSearchOverlay(); const area = document.getElementById('messages-area'); area.style.display = 'flex';
  
  if (document.getElementById('msg-' + msgKey)) { 
    const targetEl = document.getElementById('msg-' + msgKey);
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.style.transition = 'all 0.3s ease'; targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)'; targetEl.style.transform = 'scale(1.05)';
    setTimeout(() => { targetEl.style.boxShadow = 'none'; targetEl.style.transform = 'scale(1)'; }, 1500);
    return; 
  }
  
  if (messagesRef && messagesListener) messagesRef.off('child_added', messagesListener);
  area.innerHTML = '<div style="text-align:center; padding:40px; color:var(--neon-cyan);">جاري الاسترجاع... ⏳</div>';
  try {
    const snapBefore = await db.ref('chats/' + currentChat.chatId + '/messages').orderByKey().endAt(msgKey).limitToLast(50).once('value');
    const snapAfter = await db.ref('chats/' + currentChat.chatId + '/messages').orderByKey().startAt(msgKey).limitToFirst(50).once('value');
    let msgsMap = {};
    if (snapBefore.exists()) snapBefore.forEach(c => { msgsMap[c.key] = { ...c.val(), key: c.key }; });
    if (snapAfter.exists()) snapAfter.forEach(c => { msgsMap[c.key] = { ...c.val(), key: c.key }; });
    let msgs = Object.values(msgsMap).sort((a, b) => a.timestamp - b.timestamp); area.innerHTML = '';
    const topBtn = document.createElement('div'); topBtn.innerHTML = `<div style="text-align:center; margin-bottom:15px;"><button class="btn-primary" style="width:auto; padding:8px 16px; font-size:13px; background:var(--neon-purple); border:none; box-shadow:var(--shadow-purple);" onclick="returnToLiveChat()">⬇️ العودة لآخر الرسائل ⬇️</button></div>`; area.appendChild(topBtn);
    let tempLastDate = '';
    msgs.forEach(m => {
      const dStr = formatDate(m.timestamp);
      if (dStr !== tempLastDate) { const sep = document.createElement('div'); sep.className = 'date-sep'; sep.innerHTML = `<span>${dStr}</span>`; area.appendChild(sep); tempLastDate = dStr; }
      area.appendChild(buildMsgEl(m, true));
    });
    const botBtn = document.createElement('div'); botBtn.innerHTML = `<div style="text-align:center; margin-top:15px; padding-bottom:20px;"><button class="btn-primary" style="width:auto; padding:8px 16px; font-size:13px; background:var(--neon-purple); border:none; box-shadow:var(--shadow-purple);" onclick="returnToLiveChat()">⬇️ العودة لآخر الرسائل ⬇️</button></div>`; area.appendChild(botBtn);
    
    setTimeout(() => { 
       const targetEl = document.getElementById('msg-' + msgKey);
       if (targetEl) {
         targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
         targetEl.style.transition = 'all 0.3s ease'; targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)'; targetEl.style.transform = 'scale(1.05)';
         setTimeout(() => { targetEl.style.boxShadow = 'none'; targetEl.style.transform = 'scale(1)'; }, 1500);
       }
    }, 150);
  } catch (e) { area.innerHTML = '<div style="text-align:center; color:var(--neon-pink); padding:20px;">خطأ ❌</div><div style="text-align:center;"><button class="btn-primary" style="width:auto;" onclick="returnToLiveChat()">رجوع</button></div>'; }
}
function returnToLiveChat() { if (currentChat) attachMessages(currentChat.chatId); }
function nextSearchResult() { showToast('النتائج كلها معروضة أمامك بالقائمة', 'info'); }
function prevSearchResult() { showToast('النتائج كلها معروضة أمامك بالقائمة', 'info'); }

function openHomeChatMenu(chatId, friendUid, friendName) {
  const menu = document.getElementById('msg-menu');
  menu.innerHTML = `<div style="font-size:14px; font-weight:bold; color:var(--text-secondary); text-align:center; margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">إعدادات المحادثة: ${escHtml(friendName)}</div>
  <button class="msg-menu-btn" onclick="clearChatHistory('${chatId}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg> مسح المحادثة الداخلية</button>
  <button class="msg-menu-btn danger" onclick="removeChatFromList('${chatId}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5c-1.1 0-2 .9-2 2v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg> حذف من الشاشة الرئيسية</button>
  <button class="msg-menu-btn danger" onclick="blockUser('${friendUid}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> حظر الشخص</button>`;
  document.getElementById('msg-menu-overlay').classList.add('open'); if (navigator.vibrate) navigator.vibrate(50);
}
function clearChatHistory(chatId) { openModal('مسح', 'مسح رسائل هذه المحادثة من جهازك؟').then(ok => { if (ok) { db.ref('chats/' + chatId + '/messages').remove().then(() => showToast('تم مسح المحادثة', 'success')); db.ref('userChats/' + currentUser.uid + '/' + chatId + '/lastMsg').set(''); } }); }
async function removeChatFromList(chatId) {
  const ok = await openModal('إخفاء المحادثة', 'سيتم إخفاء المحادثة، ولكن سيبقى الشخص في قائمة الأصدقاء.');
  if (ok) {
    showToast('جاري الإخفاء...');
    try {
      const uids = chatId.split('_'), friendUid = uids[0] === currentUser.uid ? uids[1] : uids[0];
      if (friendUid) {
        const fSnap = await db.ref('users/' + friendUid).once('value');
        if (fSnap.exists()) { const fData = fSnap.val(); await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({ name: fData.name || 'مستخدم', photo: fData.photo || '', timestamp: Date.now() }); }
      }
      await db.ref('userChats/' + currentUser.uid + '/' + chatId).remove(); showToast('تم الإخفاء ✔️', 'success');
    } catch (err) { showToast('خطأ', 'error'); }
  }
}
function blockUser(friendUid) { openModal('حظر', 'حظر هذا الشخص؟').then(ok => { if (ok) { db.ref('blockedUsers/' + currentUser.uid + '/' + friendUid).set(true); showToast('تم الحظر بنجاح', 'success'); } }); }