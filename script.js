/* ═══════════════════════════════════
   FIREBASE INIT
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
const storage = firebase.storage();
const provider = new firebase.auth.GoogleAuthProvider();

// تفعيل الإشعارات وتحديد الروابط
const messaging = firebase.messaging();
const VERCEL_URL = 'https://neonchat-five.vercel.app';
const VAPID_KEY = 'BLyGo78MotBcNontRvYa14hdbwWLxjJBJ4AWFIj35Ek125D-SO2445PpX1tNuSgBv5MPQSZhgPyzNynvVitg68I'; 

/* ═══════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════ */
let internalMicId = null; // إضافة هذا السطر لحفظ معرف المايك الداخلي
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

// call
let localStream = null;
let peerConnection = null;
let currentCallPeer = null;
let callDurationInt = null;
let callIsCaller = false;

// recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRecordingCanceled = false;
let recordStart = 0;
let recordTimerInt = null;
let recordDurationStr = '0:00';

// typing
let typingTimeout = null;
let baseStatusText = '';
let baseStatusColor = 'var(--text-secondary)';

// messages state
let lastMsgDate = '';
let replyingToMsg = null;
let editingMsgKey = null;
let lastUnreads = {};
let isFirstChatsLoad = true;

const rtcConfig = {
  iceServers: [{
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    },
    {
      urls: 'stun:stun2.l.google.com:19302'
    }
  ]
};

/* ═══════════════════════════════════
   BACKGROUND CANVAS
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
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + .3,
      vx: (Math.random() - .5) * .15,
      vy: (Math.random() - .5) * .15,
      a: Math.random() * .6 + .2
    };
  }
  // خففنا العدد لـ 40 لتوفير البطارية ومنع التهنيج
  for (let i = 0; i < 40; i++) particles.push(mkP()); 

  function draw() {
    requestAnimationFrame(draw);
    // وقف الرسم تماماً إذا الشاشة مخفية أو فاتحين محادثة مشان يضل الجوال سريع وبارد
    if (document.hidden || (document.getElementById('screen-chat') && document.getElementById('screen-chat').classList.contains('active'))) return;
    
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,240,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,240,255,${p.a})`;
      ctx.fill();
    });
  }
  draw();
})();

/* ═══════════════════════════════════
   NAVIGATION & BACK BUTTON (STRICT)
═══════════════════════════════════ */
history.pushState({ screen: 'home' }, '', '');

window.addEventListener('popstate', e => {
  const imgOverlay = document.getElementById('img-preview-overlay');
  const msgMenuOverlay = document.getElementById('msg-menu-overlay');
  const modalOverlay = document.getElementById('modal-overlay');

  let isPopupOpen = false;

  if (imgOverlay && imgOverlay.classList.contains('open')) {
    const img = document.getElementById('img-preview-el');
    if (currentScale > 1) {
      currentScale = 1;
      imgTx = 0;
      imgTy = 0;
      img.style.transition = 'transform 0.2s ease';
      img.style.transform = `translate(0px, 0px) scale(1)`;
    } else {
      closeImgPreview();
    }
    isPopupOpen = true;
  }

  if (msgMenuOverlay && msgMenuOverlay.classList.contains('open')) {
    closeMsgMenu();
    isPopupOpen = true;
  }

  if (modalOverlay && modalOverlay.classList.contains('open')) {
    modalOverlay.classList.remove('open');
    isPopupOpen = true;
  }

  let currentActiveScreen = 'home';
  document.querySelectorAll('.screen').forEach(s => {
    if (s.classList.contains('active')) {
      currentActiveScreen = s.id.replace('screen-', '');
    }
  });

  if (isPopupOpen) {
    history.pushState({ screen: currentActiveScreen }, '', '');
    return;
  }

  const targetScreen = e.state && e.state.screen ? e.state.screen : 'home';

  if (currentActiveScreen === 'home') {
    history.pushState({ screen: 'home' }, '', '');
    return;
  }

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
  if (name === 'add-friend') {
    document.getElementById('friend-id-input').value = '';
    document.getElementById('search-result-area').innerHTML = '';
  }
  if (name !== 'chat') detachMessages();
}

/* ═══════════════════════════════════
   TOAST
═══════════════════════════════════ */
let toastTimer;

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ═══════════════════════════════════
   MODAL
═══════════════════════════════════ */
function openModal(title, text) {
  return new Promise(resolve => {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    document.getElementById('modal-overlay').classList.add('open');
    const ok = document.getElementById('modal-ok');
    const can = document.getElementById('modal-cancel');

    function cleanup(v) {
      document.getElementById('modal-overlay').classList.remove('open');
      ok.onclick = null;
      can.onclick = null;
      resolve(v);
    }
    ok.onclick = () => cleanup(true);
    can.onclick = () => cleanup(false);
  });
}

/* ═══════════════════════════════════
   AUTH (HYBRID SYSTEM)
═══════════════════════════════════ */
function formatEmail(input) {
  input = input.trim().toLowerCase();
  if (!input) return '';
  if (!input.includes('@')) {
    return input + '@neonchat.app';
  }
  return input;
}

const emailInput = document.getElementById('login-email');
const passInput = document.getElementById('login-pass');
const passConfirmInput = document.getElementById('login-pass-confirm');
const btnLogin = document.getElementById('btn-custom-login');
const btnSignup = document.getElementById('btn-custom-signup');
const btnForgot = document.getElementById('btn-forgot-pass');

if(btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const rawEmail = emailInput.value;
    const pass = passInput.value;
    
    if (!rawEmail || !pass) {
      showToast('الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
      return;
    }
    
    const email = formatEmail(rawEmail);
    btnLogin.disabled = true;
    btnLogin.textContent = 'جاري الدخول...';
    
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        showToast('الحساب غير موجود، من فضلك اضغط على إنشاء حساب أولاً', 'error');
      } else if (e.code === 'auth/wrong-password') {
        showToast('كلمة المرور غير صحيحة!', 'error');
      } else {
        showToast('خطأ: ' + e.message, 'error');
      }
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'دخول';
    }
  });
}

if(btnSignup) {
  btnSignup.addEventListener('click', async () => {
    const rawEmail = emailInput.value;
    const pass = passInput.value;
    const passConf = passConfirmInput.value;
    
    if (!rawEmail || !pass || !passConf) {
      showToast('الرجاء تعبئة جميع الحقول لإنشاء الحساب', 'error');
      return;
    }
    if (pass !== passConf) {
      showToast('كلمتي المرور غير متطابقتين! تأكد منهما', 'error');
      return;
    }
    if (pass.length < 6) {
      showToast('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل', 'error');
      return;
    }
    
    const email = formatEmail(rawEmail);
    btnSignup.disabled = true;
    btnSignup.textContent = 'جاري الإنشاء...';
    
    try {
      const userCred = await auth.createUserWithEmailAndPassword(email, pass);
      if (!rawEmail.includes('@')) {
        await userCred.user.updateProfile({ displayName: rawEmail });
      }
      showToast('تم إنشاء الحساب بنجاح!', 'success');
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        try {
          await auth.signInWithEmailAndPassword(email, pass);
          showToast('هذا الحساب موجود مسبقاً، تم تسجيل دخولك بنجاح!', 'success');
        } catch (signInErr) {
          showToast('الحساب موجود مسبقاً، ولإنشاء حساب جديد يجب اختيار اسم آخر', 'error');
        }
      } else {
        showToast('فشل الإنشاء: ' + e.message, 'error');
      }
    } finally {
      btnSignup.disabled = false;
      btnSignup.textContent = 'إنشاء حساب';
    }
  });
}

if(btnForgot) {
  btnForgot.addEventListener('click', async (e) => {
    e.preventDefault();
    const rawEmail = emailInput.value.trim();
    
    if (!rawEmail) {
      showToast('الرجاء كتابة إيميلك في المربع أولاً لإرسال رابط الاستعادة', 'error');
      return;
    }
    if (!rawEmail.includes('@')) {
      showToast('الاستعادة تعمل فقط إذا كنت مسجلاً بإيميل حقيقي وليس يوزرنيم', 'error');
      return;
    }
    
    try {
      await auth.sendPasswordResetEmail(rawEmail);
      showToast('تم إرسال رابط الاستعادة لبريدك الوارد، تفقده الآن ✔️', 'success');
    } catch (err) {
       if (err.code === 'auth/user-not-found') {
          showToast('لا يوجد حساب مسجل بهذا الإيميل', 'error');
       } else {
          showToast('فشل الإرسال: ' + err.message, 'error');
       }
    }
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
          internalMicId = dev.deviceId;
          break;
        }
      }
    }
  } catch (e) { console.log('تعذر تجهيز المايك مسبقاً'); }
}

auth.onAuthStateChanged(async user => {
  // إخفاء شاشة التحميل فوراً بالبداية لتجنب التعليق إذا تأخر الفايربيز
  document.getElementById('loader-screen').classList.add('hidden');
  
  if (user) {
    currentUser = user;
    
    // حطيناها بـ try/catch عشان لو علق جلب البيانات ما يوقف باقي التطبيق
    try {
      await ensureUserProfile(user);
    } catch(e) {
      console.log("Error loading profile", e);
    }

    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    setupPresence(user.uid);

    try {
      const swReg = await navigator.serviceWorker.register('./sw.js');
      const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      if (token) {
        await db.ref('users/' + user.uid + '/fcmToken').set(token);
      }
    } catch (err) { console.log('تعذر جلب توكن الإشعارات:', err); }

    initCallListener(user.uid);
    initFriendRequestsListener(user.uid);
    initFriendsListListener(user.uid); 
    initMicrophone(); // تجهيز المايك الداخلي فوراً عند الدخول
    showScreen('home');
  } else {
    currentUser = null;
    myProfile = null;
    renderScreenUI('login');
  }
});


/* ═══════════════════════════════════
   PRESENCE
═══════════════════════════════════ */
function setupPresence(uid) {
  const myStatusRef = db.ref('users/' + uid + '/status');
  const connectedRef = db.ref('.info/connected');

  let isConnected = false;

  // مراقبة اتصال الإنترنت/السيرفر
  connectedRef.on('value', snap => {
    isConnected = snap.val() === true;
    
    if (isConnected) {
      // السيرفر بيسجل آخر ظهور تلقائياً لو انقطع النت فجأة أو تسكر المتصفح بالقوة
      myStatusRef.onDisconnect().set(Date.now());
      
      // بمجرد ما يشبك، إذا الشاشة قدامه بيصير متصل، وإذا بالخلفية بياخد وقت
      if (document.visibilityState === 'visible') {
        myStatusRef.set('online');
      } else {
        myStatusRef.set(Date.now());
      }
    }
  });

  // مراقبة الشاشة (نظامية بدون ترقيع اللمس)
  document.addEventListener('visibilitychange', () => {
    if (isConnected) {
      if (document.visibilityState === 'visible') {
        // فاتح الموقع وشايفه
        myStatusRef.set('online');
      } else {
        // نزل الموقع للخلفية أو طفى شاشة الجوال
        myStatusRef.set(Date.now());
        
        // تنظيف جاري الكتابة أو التسجيل فوراً إذا طلع
        if (currentChat && currentUser) {
          db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
        }
      }
    }
  });
}


async function ensureUserProfile(user) {
  const ref = db.ref('users/' + user.uid);
  const snap = await ref.once('value');
  if (snap.exists()) {
    myProfile = snap.val();
    // 🚀 تأكيد تثبيت الـ ID: إعادة ربط الـ ID بحساب المستخدم بقوة حتى لو مسح بيانات المتصفح
    if (!myProfile.uniqueId) {
      myProfile.uniqueId = await generateUniqueId();
      await ref.update({ uniqueId: myProfile.uniqueId });
    } else {
      await db.ref('userIds/' + myProfile.uniqueId).set(user.uid);
    }
  } else {
    const uniqueId = await generateUniqueId();
    myProfile = {
      uid: user.uid,
      name: user.displayName || 'مستخدم',
      photo: user.photoURL || '',
      uniqueId,
      createdAt: Date.now()
    };
    await ref.set(myProfile);
  }
  updateHomeHeader();
  localStorage.setItem('myProfile', JSON.stringify(myProfile));
}

async function generateUniqueId() {
  while (true) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    const snap = await db.ref('userIds/' + id).once('value');
    if (!snap.exists()) {
      await db.ref('userIds/' + id).set(currentUser.uid);
      return id;
    }
  }
}

function cleanupListeners() {
  if (currentUser) {
    if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
    if (friendRequestsListener) db.ref('friendRequests/' + currentUser.uid).off('value', friendRequestsListener);
    if (friendsListListener) db.ref('friendsList/' + currentUser.uid).off();
    if (myCallListener) db.ref('calls/' + currentUser.uid).off('value', myCallListener);
    
    Object.keys(presenceListeners).forEach(fUid => {
      db.ref('users/' + fUid + '/status').off('value', presenceListeners[fUid]);
    });
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

/* ═══════════════════════════════════
   HOME HEADER
═══════════════════════════════════ */
function updateHomeHeader() {
  if (!myProfile) return;
  document.getElementById('home-subtitle').textContent = 'مرحباً، ' + myProfile.name.split(' ')[0];
  document.getElementById('my-id-badge').textContent = myProfile.uniqueId;
  const av = document.getElementById('home-avatar');
  if (myProfile.photo) {
    av.outerHTML = `<img class="home-avatar" src="${myProfile.photo}" onclick="showScreen('profile')" id="home-avatar"/>`;
  } else {
    av.className = 'home-avatar-placeholder';
    av.textContent = myProfile.name.charAt(0);
  }
}

function copyMyId() {
  if (!myProfile) return;
  navigator.clipboard.writeText(myProfile.uniqueId)
    .then(() => showToast('تم نسخ الـ ID: ' + myProfile.uniqueId, 'success'))
    .catch(() => showToast('رقمك: ' + myProfile.uniqueId));
}

/* ═══════════════════════════════════
   PROFILE
═══════════════════════════════════ */
function populateProfile() {
  if (!myProfile) return;
  document.getElementById('profile-name-input').value = myProfile.name;
  document.getElementById('profile-id-value').textContent = myProfile.uniqueId;
  const av = document.getElementById('profile-avatar');
  if (myProfile.photo) {
    av.outerHTML = `<img class="profile-avatar" src="${myProfile.photo}" id="profile-avatar"/>`;
  } else {
    av.textContent = myProfile.name.charAt(0);
  }
}

async function updateMyInfoInFriendsChats() {
  const snap = await db.ref('userChats/' + currentUser.uid).once('value');
  if (!snap.exists()) return;
  const updates = {};
  snap.forEach(child => {
    const chatId = child.key;
    const friendUid = child.val().friendUid;
    updates[`userChats/${friendUid}/${chatId}/friendName`] = myProfile.name;
    updates[`userChats/${friendUid}/${chatId}/friendPhoto`] = myProfile.photo || '';
  });
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
}

async function saveProfileName() {
  const newName = document.getElementById('profile-name-input').value.trim();
  if (!newName || !myProfile) return;
  showToast('جاري الحفظ...');
  try {
    await db.ref('users/' + myProfile.uid).update({ name: newName });
    myProfile.name = newName;
    localStorage.setItem('myProfile', JSON.stringify(myProfile));
    updateHomeHeader();
    await updateMyInfoInFriendsChats();
    showToast('تم تغيير الاسم بنجاح', 'success');
  } catch (e) {
    showToast('فشل الحفظ: ' + e.message, 'error');
  }
}

document.getElementById('file-avatar-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !myProfile) return;
  e.target.value = '';
  showToast('جاري رفع الصورة...');
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'malaboushi_preset');
    const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.secure_url) {
      await db.ref('users/' + myProfile.uid).update({ photo: data.secure_url });
      myProfile.photo = data.secure_url;
      localStorage.setItem('myProfile', JSON.stringify(myProfile));
      updateHomeHeader();
      populateProfile();
      await updateMyInfoInFriendsChats();
      showToast('تم تحديث الصورة', 'success');
    } else {
      throw new Error('تعذر الرفع');
    }
  } catch (e) {
    showToast('فشل رفع الصورة: ' + e.message, 'error');
  }
});

/* ═══════════════════════════════════
   CHATS LIST
═══════════════════════════════════ */
let friendsStatus = {};
let presenceListeners = {};

function loadChats() {
  if (!currentUser) return;
  if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
  chatsListener = db.ref('userChats/' + currentUser.uid).orderByChild('updatedAt').on('value', snap => {
    chatsData = {};
    let hasNew = false;
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val();
        chatsData[c.key] = d;
        if (!isFirstChatsLoad && d.unread > (lastUnreads[c.key] || 0)) hasNew = true;
        lastUnreads[c.key] = d.unread;

        db.ref('friendsList/' + currentUser.uid + '/' + d.friendUid).once('value', fSnap => {
          if (!fSnap.exists()) {
            db.ref('friendsList/' + currentUser.uid + '/' + d.friendUid).set({
              name: d.friendName,
              photo: d.friendPhoto || '',
              timestamp: d.updatedAt || Date.now()
            });
          }
        });

        if (!presenceListeners[d.friendUid]) {
          presenceListeners[d.friendUid] = db.ref('users/' + d.friendUid + '/status').on('value', sSnap => {
            friendsStatus[d.friendUid] = sSnap.val();
            renderChatsList();
          });
        }
      });
    }
    renderChatsList();
    if (hasNew && !document.getElementById('screen-chat').classList.contains('active')) {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      createBubbleEffect();
    }
    setTimeout(() => isFirstChatsLoad = false, 1000);
  });
}

function renderChatsList(filter = '') {
  const list = document.getElementById('chats-list');
  const empty = document.getElementById('chats-empty');
  const items = Object.entries(chatsData).sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  const filtered = filter ? items.filter(([, v]) => v.friendName && v.friendName.includes(filter)) : items;
  if (!filtered.length) {
    empty.style.display = 'flex';
    list.querySelectorAll('.chat-item').forEach(e => e.remove());
    return;
  }
  empty.style.display = 'none';
  list.querySelectorAll('.chat-item').forEach(e => e.remove());
  filtered.forEach(([chatId, data]) => {
    const div = document.createElement('div');
    div.className = 'chat-item';
    div.dataset.chatid = chatId;
    const initials = (data.friendName || '?').charAt(0);
    const avatarHtml = data.friendPhoto ?
      `<img src="${data.friendPhoto}" class="chat-avatar" style="object-fit:cover;"/>` :
      `<div class="chat-avatar">${initials}</div>`;

    const isOnline = friendsStatus[data.friendUid] === 'online';
    const onlineBadge = isOnline ? `<div style="position:absolute; bottom:2px; right:2px; width:13px; height:13px; background:var(--neon-green); border-radius:50%; border:2px solid var(--bg-surface); z-index:2;"></div>` : '';

    const timeStr = data.updatedAt ? formatTime(data.updatedAt) : '';
    const lastMsg = data.lastMsg || 'اضغط لبدء المحادثة';
    div.innerHTML = `
      <div style="position:relative; display:inline-block; flex-shrink:0;">
        ${avatarHtml}
        ${onlineBadge}
      </div>
      <div class="chat-info">
        <div class="chat-name">${escHtml(data.friendName||'مستخدم')}</div>
        <div class="chat-last-msg">${escHtml(lastMsg)}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${timeStr}</div>
        ${data.unread > 0 ? `<div class="chat-badge">${data.unread}</div>` : ''}
      </div>`;

    div.addEventListener('click', () => openChat(chatId, data.friendUid));

    let pressTimer;
    div.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => {
        openHomeChatMenu(chatId, data.friendUid, data.friendName);
      }, 600);
    }, { passive: true });
    div.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    div.addEventListener('touchend', () => clearTimeout(pressTimer));
    div.addEventListener('contextmenu', e => {
      e.preventDefault();
      openHomeChatMenu(chatId, data.friendUid, data.friendName);
    });

    list.appendChild(div);
  });
}

function filterChats(val) {
  renderChatsList(val);
}

function createBubbleEffect() {
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('div');
    b.style.cssText = `position:fixed;bottom:80px;left:${Math.random()*100}%;width:15px;height:15px;background:var(--neon-cyan);border-radius:50%;box-shadow:0 0 10px var(--neon-cyan);opacity:0.8;z-index:999;pointer-events:none;transition:all 2s ease-out;`;
    document.body.appendChild(b);
    setTimeout(() => {
      b.style.transform = `translateY(-${Math.random()*200+100}px) scale(0)`;
      b.style.opacity = '0';
    }, 50);
    setTimeout(() => b.remove(), 2000);
  }
}

/* ═══════════════════════════════════
   ADD FRIEND
═══════════════════════════════════ */
async function searchFriend() {
  const idVal = document.getElementById('friend-id-input').value.trim();
  if (idVal.length !== 6) {
    showToast('أدخل 6 أرقام صحيحة', 'error');
    return;
  }
  const btn = document.getElementById('btn-search-friend');
  btn.disabled = true;
  btn.textContent = 'جاري البحث…';
  try {
    const snap = await db.ref('userIds/' + idVal).once('value');
    if (!snap.exists()) {
      showToast('لم يُعثر على مستخدم', 'error');
      return;
    }
    const uid = snap.val();
    if (uid === currentUser.uid) {
      showToast('هذا رقمك أنت 😄', 'error');
      return;
    }
    const userSnap = await db.ref('users/' + uid).once('value');
    renderSearchResult(userSnap.val(), uid);
  } catch (e) {
    showToast('خطأ: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'بحث';
  }
}

function renderSearchResult(friend, uid) {
  const area = document.getElementById('search-result-area');
  const initials = (friend.name || '?').charAt(0);
  area.innerHTML = `
    <div class="search-result-card">
      <div class="search-result-avatar">${initials}</div>
      <div class="search-result-info">
        <div class="search-result-name">${escHtml(friend.name)}</div>
        <div class="search-result-id">${friend.uniqueId}</div>
      </div>
      <button class="btn-primary" id="btn-send-req-${uid}" style="width:auto;padding:11px 20px;font-size:13px" onclick="sendFriendRequest('${uid}')">إرسال طلب</button>
    </div>`;
}

async function sendFriendRequest(friendUid) {
  if (!currentUser || !myProfile) return;
  const btn = document.getElementById(`btn-send-req-${friendUid}`);
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';
  try {
    await db.ref('friendRequests/' + friendUid + '/' + currentUser.uid).set({
      uid: currentUser.uid,
      name: myProfile.name,
      timestamp: Date.now()
    });
    showToast('تم إرسال طلب الصداقة بنجاح', 'success');
    btn.textContent = 'تم الإرسال ✔';
  } catch (e) {
    showToast('فشل الإرسال: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'إرسال طلب';
  }
}

function initFriendRequestsListener(uid) {
  if (friendRequestsListener) db.ref('friendRequests/' + uid).off('value', friendRequestsListener);
  friendRequestsListener = db.ref('friendRequests/' + uid).on('value', snap => {
    const list = document.getElementById('friend-requests-list');
    const badge = document.getElementById('home-req-badge');
    if (!snap.exists()) {
      if (badge) badge.style.display = 'none';
      if (list) list.innerHTML = '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:10px;">لا توجد طلبات واردة</div>';
      return;
    }
    let count = 0, htmlStr = '';
    snap.forEach(reqSnap => {
      count++;
      const req = reqSnap.val();
      const initials = (req.name || '?').charAt(0);
      htmlStr += `
        <div class="search-result-card" style="padding:12px 16px;">
          <div class="search-result-avatar" style="width:40px;height:40px;font-size:15px;">${initials}</div>
          <div class="search-result-info">
            <div class="search-result-name" style="font-size:14px;margin-bottom:0;">${escHtml(req.name)}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn-primary" style="width:auto;padding:6px 12px;font-size:12px;background:var(--neon-green);box-shadow:none;" onclick="acceptFriendRequest('${req.uid}')">موافقة</button>
            <button class="btn-danger" style="width:auto;padding:6px 12px;font-size:12px;" onclick="rejectFriendRequest('${req.uid}')">رفض</button>
          </div>
        </div>`;
    });
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    if (list) list.innerHTML = htmlStr;
  });
}

async function acceptFriendRequest(friendUid) {
  showToast('جاري القبول...');
  try {
    await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove();
    await startChat(friendUid);
    showToast('تم القبول وبدء المحادثة!', 'success');
  } catch (e) {
    showToast('حدث خطأ: ' + e.message, 'error');
  }
}

async function rejectFriendRequest(friendUid) {
  try {
    await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove();
    showToast('تم رفض الطلب');
  } catch (e) {
    showToast('حدث خطأ: ' + e.message, 'error');
  }
}

async function startChat(friendUid) {
  if (!currentUser || !myProfile) return;
  const friendSnap = await db.ref('users/' + friendUid).once('value');
  const friend = friendSnap.val();
  const chatId = [currentUser.uid, friendUid].sort().join('_');
  await db.ref('chats/' + chatId + '/meta').update({
    participants: [currentUser.uid, friendUid],
    createdAt: Date.now()
  });

  await db.ref('userChats/' + currentUser.uid + '/' + chatId).update({
    friendUid,
    friendName: friend.name,
    friendPhoto: friend.photo || '',
    updatedAt: Date.now(),
    lastMsg: 'ابدأ المحادثة الآن!',
    unread: 0
  });
  await db.ref('userChats/' + friendUid + '/' + chatId).update({
    friendUid: currentUser.uid,
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || '',
    updatedAt: Date.now(),
    lastMsg: 'ابدأ المحادثة الآن!',
    unread: 0
  });

  await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({
    name: friend.name,
    photo: friend.photo || '',
    timestamp: Date.now()
  });
  await db.ref('friendsList/' + friendUid + '/' + currentUser.uid).update({
    name: myProfile.name,
    photo: myProfile.photo || '',
    timestamp: Date.now()
  });

  openChat(chatId, friendUid, friend);
}

/* ═══════════════════════════════════
   OPEN CHAT
═══════════════════════════════════ */
function detachStatusAndTyping() {
  if (friendStatusRef && friendStatusListener) {
    friendStatusRef.off('value', friendStatusListener);
    friendStatusRef = null;
    friendStatusListener = null;
  }
  if (typingRef && typingListener) {
    typingRef.off('value', typingListener);
    typingRef = null;
    typingListener = null;
  }
}

function detachMessages() {
  if (messagesRef) {
    if (messagesListener) messagesRef.off('child_added', messagesListener);
    if (msgChangedListener) messagesRef.off('child_changed', msgChangedListener);
    messagesListener = null;
    msgChangedListener = null;
  }
  detachStatusAndTyping();
}

async function openChat(chatId, friendUid, friendProfile = null) {
  if (!friendProfile) {
    const snap = await db.ref('users/' + friendUid).once('value');
    friendProfile = snap.val();
  }
  currentChat = { chatId, friendUid, friendProfile };

  const avatarEl = document.getElementById('chat-header-avatar');
  if (friendProfile.photo) {
    avatarEl.outerHTML = `<img src="${friendProfile.photo}" class="chat-header-avatar" id="chat-header-avatar" style="object-fit:cover;"/>`;
  } else {
    avatarEl.outerHTML = `<div class="chat-header-avatar" id="chat-header-avatar">${(friendProfile.name||'?').charAt(0)}</div>`;
  }
  document.getElementById('chat-header-name').textContent = friendProfile.name;

  db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);

  detachMessages();
  renderScreenUI('chat');
  attachMessages(chatId);

  const statusEl = document.getElementById('chat-header-status');
  statusEl.textContent = 'جاري التحقق...';
  statusEl.style.color = 'var(--text-muted)';

  friendStatusRef = db.ref('users/' + friendUid + '/status');
  friendStatusListener = friendStatusRef.on('value', snap => {
    const val = snap.val();
    if (val === 'online') {
      baseStatusText = '🟢 متصل الآن';
      baseStatusColor = 'var(--neon-green)';
    } else if (val && typeof val === 'number') {
      const d = new Date(val);
      const now = new Date();
      let prefix = '';
      if (d.toDateString() === now.toDateString()) {
        prefix = 'اليوم';
      } else {
        const yes = new Date(now);
        yes.setDate(now.getDate() - 1);
        prefix = d.toDateString() === yes.toDateString() ? 'أمس' : d.toLocaleDateString('ar-EG', {
          day: '2-digit', month: 'short'
        });
      }
      baseStatusText = '🔴 آخر ظهور: ' + prefix + ' ' + formatTime(val);
      baseStatusColor = 'var(--text-secondary)';
    } else {
      baseStatusText = '🔴 غير متصل';
      baseStatusColor = 'var(--text-secondary)';
    }
    const cur = statusEl.textContent;
    if (!cur.includes('يكتب') && !cur.includes('يسجل')) {
      statusEl.textContent = baseStatusText;
      statusEl.style.color = baseStatusColor;
    }
  });

  typingRef = db.ref('chats/' + chatId + '/typing/' + friendUid);
  typingListener = typingRef.on('value', snap => {
    const state = snap.val();
    if (state === 'typing') {
      statusEl.textContent = '✍️ يكتب الآن...';
      statusEl.style.color = 'var(--neon-cyan)';
    } else if (state === 'recording') {
      statusEl.textContent = '🎙️ يسجل مقطع صوتي...';
      statusEl.style.color = 'var(--neon-pink)';
    } else {
      statusEl.textContent = baseStatusText;
      statusEl.style.color = baseStatusColor;
    }
  });
}

/* ═══════════════════════════════════
   ATTACH MESSAGES (PERFECT PAGINATION)
═══════════════════════════════════ */
let oldestMsgTimestamp = null;
let isLoadingHistory = false;
let hasMoreHistory = true;

function attachMessages(chatId) {
  const area = document.getElementById('messages-area');
  area.innerHTML = '';
  lastMsgDate = '';
  oldestMsgTimestamp = null;
  isLoadingHistory = false;
  hasMoreHistory = true;
  
  // منع تدخل المتصفح العشوائي
  area.style.overflowAnchor = 'none';

  db.ref('userChats/' + currentChat.friendUid + '/' + chatId).update({
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || ''
  });

  messagesRef = db.ref('chats/' + chatId + '/messages');
  
  let query = messagesRef.orderByChild('timestamp').limitToLast(20);
  let scrollTimeout;

  messagesListener = query.on('child_added', snap => {
    const msg = { ...snap.val(), key: snap.key };
    
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
    if (area.scrollTop === 0 && !isLoadingHistory && hasMoreHistory && oldestMsgTimestamp) {
      isLoadingHistory = true;
      
      // 🚀 1. الخدعة الذهبية: إيقاف قوة التمرير (Momentum) الناتجة عن سحبة إصبعك فوراً
      area.style.overflowY = 'hidden';
      
      const loader = document.createElement('div');
      loader.id = 'history-loader';
      loader.innerHTML = '<div style="text-align:center; padding:10px; font-size:12px; color:var(--neon-cyan);">جاري التحميل...</div>';
      area.insertBefore(loader, area.firstChild);

      // هنا يسحب 20 رسالة (يمكنك تعديل الرقم 20 إلى ما تشاء)
      const snap = await messagesRef.orderByChild('timestamp').endAt(oldestMsgTimestamp - 1).limitToLast(2000).once('value');
      
      loader.remove(); 

      if (snap.exists()) {
        const msgs = [];
        snap.forEach(child => { msgs.push({ ...child.val(), key: child.key }); });
        
        if (msgs.length > 0) {
          oldestMsgTimestamp = msgs[0].timestamp;
          
          // 🚀 2. حفظ الطول قبل إضافة أي رسالة جديدة
          const oldScrollHeight = area.scrollHeight;
          
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

          // 🚀 3. وضعك تماماً في مكانك عن طريق تعويض الارتفاع الجديد
          area.scrollTop = area.scrollHeight - oldScrollHeight;
        } else {
          hasMoreHistory = false;
        }
      } else {
        hasMoreHistory = false;
      }
      
      // 🚀 4. إعادة التمرير للعمل بعد أن تم تثبيتك بنجاح
      area.style.overflowY = 'auto';
      isLoadingHistory = false;
    }
  });

  msgChangedListener = messagesRef.on('child_changed', snap => {
    const msg = { ...snap.val(), key: snap.key };
    
    // تحديث النص الفوري بداخل فقاعة الرسالة في حال تم التعديل
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
    
    // 🚀 إخفاء النقطة الخضراء فوراً من شاشتك بمجرد استماع الطرف الآخر للمقطع
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




/* ═══════════════════════════════════
   BUILD MESSAGE ELEMENT
═══════════════════════════════════ */
function buildMsgEl(msg, isBackground = false) {
  if (msg.isDeleted) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.senderUid === currentUser.uid ? 'out' : 'in');
    if (isBackground) row.style.animation = 'none'; // تعطيل الأنيميشن للرسائل القديمة
    row.innerHTML = `<div class="msg-bubble" id="msg-${msg.key}" style="background:transparent;border:1px solid var(--border-subtle);color:var(--text-muted);font-style:italic;font-size:12px;">🚫 تم حذف هذه الرسالة</div>`;
    return row;
  }

  const row = document.createElement('div');
  const isOut = msg.senderUid === currentUser.uid;
  row.className = 'msg-row ' + (isOut ? 'out' : 'in');
  if (isBackground) row.style.animation = 'none'; // 🚀 تعطيل الأنيميشن لمنع اختفاء الشاشة والرفة

  if (!isOut) {
    const fProfile = currentChat.friendProfile || {};
    let avatarNode;
    if (fProfile.photo) {
      avatarNode = document.createElement('img');
      avatarNode.src = fProfile.photo;
      avatarNode.className = 'msg-friend-avatar';
    } else {
      avatarNode = document.createElement('div');
      avatarNode.className = 'msg-friend-avatar';
      avatarNode.textContent = (fProfile.name || '?').charAt(0);
    }
    row.appendChild(avatarNode);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.id = 'msg-' + msg.key;

  let lastTap = 0, pressTimer, touchStartX = 0, touchStartY = 0, isSwiping = false, isVertical = false;

  bubble.addEventListener('touchstart', e => {
    // تركنا مساحة للمستخدم يضغط على الروابط بدون ما يتدخل اللمس السريع
    if (e.target.tagName === 'A') return;
    
    const now = Date.now();
    if (now - lastTap < 300 && now - lastTap > 0) {
      toggleReaction(msg.key);
      lastTap = 0;
      if (e.cancelable) e.preventDefault();
      return;
    }
    lastTap = now;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
    isVertical = false;
    bubble.style.transition = 'none';
    pressTimer = setTimeout(() => {
      if (!isSwiping && !isVertical) openMsgMenu(msg, isOut);
    }, 500);
  }, { passive: false });

  bubble.addEventListener('touchmove', e => {
    if (e.target.tagName === 'A') return;
    
    if (!touchStartX || !touchStartY) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isVertical = true;
      clearTimeout(pressTimer);
      bubble.style.transition = 'transform 0.2s ease-out';
      bubble.style.transform = 'translateX(0)';
      return;
    }
    if (Math.abs(dx) > 15 && !isVertical) {
      isSwiping = true;
      clearTimeout(pressTimer);
      let limit = Math.min(Math.abs(dx), 65) * Math.sign(dx);
      bubble.style.transform = `translateX(${limit}px)`;
    }
  }, { passive: true });

  bubble.addEventListener('touchend', e => {
    if (e.target.tagName === 'A') return;
    
    clearTimeout(pressTimer);
    bubble.style.transition = 'transform 0.2s ease-out';
    bubble.style.transform = 'translateX(0)';

    if (isSwiping) {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 45) {
        prepareReply(msg);
        if (navigator.vibrate) navigator.vibrate(40);
      }
    }
    touchStartX = 0;
    touchStartY = 0;
  });

  bubble.addEventListener('contextmenu', e => {
    if (e.target.tagName === 'A') return; // لا تفتح القائمة إذا ضغط عالرابط مطولاً
    e.preventDefault();
    openMsgMenu(msg, isOut);
  });

  let ticks = '';
  if (isOut) {
    let color = msg.read ? '#00f0ff' : 'var(--text-muted)';
    if (msg.type === 'voice' && msg.listened) color = '#00ff88'; 
    
    const content = (msg.read || msg.listened) ?
      '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>' :
      '<polyline points="20 6 9 17 4 12"></polyline>';
    ticks = `<svg id="ticks-${msg.key}" width="14" height="14" viewBox="0 0 28 18" fill="none" stroke="${color}" stroke-width="2" style="margin-left:4px;margin-bottom:-2px;">${content}</svg>`;
  }

  const timeEl = `<div class="msg-time">${msg.isEdited ? '<span style="font-size:10px;opacity:0.7;">(معدلة)</span>' : ''}${ticks}${formatTime(msg.timestamp)}</div>`;
  const reactHtml = `<div id="react-${msg.key}" class="msg-reaction" style="display:${msg.reaction?'flex':'none'}">${msg.reaction||''}</div>`;

  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml = `<div onclick="scrollToMessage('${msg.replyTo.key}')" style="cursor:pointer;"><div class="reply-badge">↩ رد على رسالة</div><div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;margin-bottom:6px;border-right:2px solid var(--neon-cyan);font-size:12px;opacity:0.8;overflow:hidden;white-space:nowrap;text-overflow:ellipsis; transition: background 0.2s;" onactive="this.style.background='rgba(0,240,255,0.1)'">${escHtml(msg.replyTo.text)}</div></div>`;
  }

  if (msg.type === 'text') {
    // 🚀 السحر هون: حماية النص وبعدين تحويل الروابط لعناصر قابلة للضغط
    let safeText = escHtml(msg.text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    safeText = safeText.replace(urlRegex, function(url) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--neon-cyan); text-decoration: underline; word-break: break-all;">${url}</a>`;
    });
    
    bubble.innerHTML = `${replyHtml}<div>${safeText}</div>${timeEl}${reactHtml}`;
  } else if (msg.type === 'image') {
    const onloadAttr = isBackground ? '' : `onload="if(!window.preventAutoScroll) document.getElementById('messages-area').scrollTop = document.getElementById('messages-area').scrollHeight"`;
    bubble.innerHTML = `${replyHtml}<img class="msg-img" src="${msg.url}" ${onloadAttr} onclick="previewImg('${msg.url}')"/>${timeEl}${reactHtml}`;
  } else if (msg.type === 'voice') {
    if ('caches' in window) {
      caches.open('media-cache').then(cache => {
        cache.match(msg.url).then(cached => {
          if (!cached) fetch(msg.url).then(res => cache.put(msg.url, res)).catch(()=>{});
        });
      });
    }

    const bars = Array.from({ length: 20 }, () => `<div class="voice-bar" style="height:${Math.floor(Math.random()*70)+20}%"></div>`).join('');
    
    let unplayedDot = '';
    if (!isOut) {
      unplayedDot = (!msg.listened) ? `<div id="unplayed-${msg.key}" style="width:10px;height:10px;background:var(--neon-green);border-radius:50%;margin-left:8px;box-shadow:0 0 6px var(--neon-green);flex-shrink:0;transition:all 0.3s ease;"></div>` : `<div id="unplayed-${msg.key}" style="width:10px;height:10px;margin-left:8px;flex-shrink:0;background:transparent;transition:all 0.3s ease;"></div>`;
    }

    bubble.innerHTML = `${replyHtml}
      <div class="voice-msg">
        ${unplayedDot}
        <button class="voice-play-btn" onclick="playVoice(this,'${msg.url}', '${msg.key}', ${isOut})">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="voice-waveform" style="position:relative; cursor:pointer;" onclick="seekVoice(event, '${msg.url}', '${msg.key}')">
          ${bars}
          <div id="progress-${msg.key}" class="voice-progress-fill" style="position:absolute; right:0; top:0; bottom:0; width:0%; background:rgba(0,240,255,0.4); pointer-events:none; z-index:1; border-radius:2px; transition: width 0.1s linear;"></div>
        </div>
        <span id="dur-${msg.key}" class="voice-duration" data-orig="${msg.duration||'0:00'}">${msg.duration||'0:00'}</span>
      </div>${timeEl}${reactHtml}`;
  }

  row.appendChild(bubble);
  return row;
}



/* ═══════════════════════════════════
   REACTION
═══════════════════════════════════ */
function toggleReaction(msgKey) {
  if (!currentChat) return;
  const ref = db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey);
  ref.once('value', snap => {
    const m = snap.val();
    if (m) ref.update({ reaction: m.reaction === '❤️' ? null : '❤️' });
  });
}

/* ═══════════════════════════════════
   MSG CONTEXT MENU & UPDATES
═══════════════════════════════════ */
function updateLastMsgAfterChange() {
  if (!currentChat) return;
  db.ref('chats/' + currentChat.chatId + '/messages').orderByChild('timestamp').limitToLast(1).once('value', snap => {
    if (snap.exists()) {
      snap.forEach(child => {
        const m = child.val();
        let text = m.isDeleted ? '🚫 رسالة محذوفة' : (m.type === 'text' ? m.text : m.type === 'image' ? '📷 صورة' : '🎙️ مقطع صوتي');
        db.ref().update({
          [`userChats/${currentUser.uid}/${currentChat.chatId}/lastMsg`]: text,
          [`userChats/${currentChat.friendUid}/${currentChat.chatId}/lastMsg`]: text
        });
      });
    }
  });
}

function openMsgMenu(msg, isOut) {
  const menu = document.getElementById('msg-menu');
  menu.innerHTML = '';

  const emojis = ['😂', '😅', '🤣', '😍', '🥰', '🙂', '🙄', '😱', '🥺', '😴', '🔥', '💯', '🙏🏻', '👍🏻', '👏🏻', '👊🏻', '🎧', '🎶', '💙'];
  let emojiHtml = `<div style="display:flex; flex-wrap:wrap; gap:8px; padding:10px; background:rgba(0,240,255,0.05); border-radius:12px; margin-bottom:8px; justify-content:center;">`;
  emojis.forEach(em => {
    emojiHtml += `<div style="font-size:24px; cursor:pointer; padding:2px;" onclick="addReaction('${msg.key}', '${em}'); closeMsgMenu();">${em}</div>`;
  });
  emojiHtml += `</div>`;
  menu.innerHTML += emojiHtml;

  const btnReply = document.createElement('button');
  btnReply.className = 'msg-menu-btn';
  btnReply.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> رد`;
  btnReply.onclick = () => {
    prepareReply(msg);
    closeMsgMenu();
  };
  menu.appendChild(btnReply);

  if (msg.type === 'text') {
    const btnCopy = document.createElement('button');
    btnCopy.className = 'msg-menu-btn';
    btnCopy.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> نسخ النص`;
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(msg.text).then(() => showToast('تم النسخ', 'success'));
      closeMsgMenu();
    };
    menu.appendChild(btnCopy);
  }

  if (isOut) {
    if (msg.type === 'text') {
      const btnEdit = document.createElement('button');
      btnEdit.className = 'msg-menu-btn';
      btnEdit.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل`;
      btnEdit.onclick = () => {
        prepareEdit(msg.key, msg.text);
        closeMsgMenu();
      };
      menu.appendChild(btnEdit);
    }
    const btnDel = document.createElement('button');
    btnDel.className = 'msg-menu-btn danger';
    btnDel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> حذف الرسالة`;
    btnDel.onclick = () => {
      confirmDeleteMsg(msg.key);
      closeMsgMenu();
    };
    menu.appendChild(btnDel);
  }

  document.getElementById('msg-menu-overlay').classList.add('open');
}

function addReaction(msgKey, emoji) {
  if (!currentChat) return;
  db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ reaction: emoji });
}

function closeMsgMenu() {
  document.getElementById('msg-menu-overlay').classList.remove('open');
}

function prepareReply(msg) {
  replyingToMsg = msg;
  editingMsgKey = null;
  const pre = document.getElementById('msg-reply-preview');
  pre.classList.add('active');
  const txt = msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : '🎙️ صوتية';
  document.getElementById('msg-reply-text').textContent = 'رد على: ' + txt;
  document.getElementById('msg-input').focus();
}

function cancelReply() {
  replyingToMsg = null;
  document.getElementById('msg-reply-preview').classList.remove('active');
}

function prepareEdit(msgKey, oldText) {
  editingMsgKey = msgKey;
  cancelReply();
  const inp = document.getElementById('msg-input');
  inp.value = oldText;
  autoResize(inp);
  inp.focus();
  showToast('وضع التعديل مفعل ✏️');
}

function confirmDeleteMsg(msgKey) {
  openModal('حذف الرسالة', 'هل تريد حذف هذه الرسالة للجميع؟').then(ok => {
    if (ok && currentChat) {
      db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey)
        .update({
          isDeleted: true,
          text: null,
          url: null,
          type: 'deleted'
        })
        .then(() => {
          updateLastMsgAfterChange();
          showToast('تم حذف الرسالة', 'success');
        });
    }
  });
}

/* ═══════════════════════════════════
   SEND MESSAGES
═══════════════════════════════════ */
let lastTypingTime = 0; // لضبط الإرسال لفايربيز

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMsg();
    return;
  }
}

document.getElementById('msg-input').addEventListener('input', () => {
  if (!currentChat || isRecording) return;
  
  const now = Date.now();
  const typingRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid);
  
  if (now - lastTypingTime > 1500) {
    typingRef.set('typing');
    // هون السحر: لو فصل النت أو تسكر التطبيق فجأة، السيرفر بيمسح جاري الكتابة لحاله
    typingRef.onDisconnect().remove(); 
    lastTypingTime = now;
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (currentChat) {
      typingRef.remove();
      typingRef.onDisconnect().cancel(); // نلغي أمر الحذف التلقائي لأننا حذفناه نظامي
    }
    lastTypingTime = 0;
  }, 2000);
});

async function sendTextMsg() {
  // 🚀 إضافة: إذا ضغطت زر الإرسال أثناء التسجيل، يتم إيقاف وإرسال الصوت فوراً
  if (isRecording) {
    stopRecording();
    return;
  }

  if (currentChat) {
    db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
    clearTimeout(typingTimeout);
  }
  const inp = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text || !currentChat) return;
  inp.value = '';
  autoResize(inp);
  inp.focus(); 

  if (editingMsgKey) {
    await db.ref('chats/' + currentChat.chatId + '/messages/' + editingMsgKey).update({
      text,
      isEdited: true
    });
    updateLastMsgAfterChange();
    editingMsgKey = null;
    showToast('تم تعديل الرسالة', 'success');
    return;
  }

  let replyData = null;
  if (replyingToMsg) {
    replyData = {
      key: replyingToMsg.key,
      text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت'
    };
    cancelReply();
  }

  await pushMessage({
    type: 'text',
    text,
    senderUid: currentUser.uid,
    timestamp: Date.now(),
    replyTo: replyData
  });
}


async function sendImageMsg(url) {
  let replyData = null;
  if (replyingToMsg) {
    replyData = {
      key: replyingToMsg.key,
      text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت'
    };
    cancelReply(); // إغلاق مربع الرد بعد الإرسال
  }

  await pushMessage({
    type: 'image',
    url,
    senderUid: currentUser.uid,
    timestamp: Date.now(),
    replyTo: replyData // 🚀 إرفاق بيانات الرد مع الصورة
  });
}

async function sendVoiceMsg(url, duration) {
  let replyData = null;
  if (replyingToMsg) {
    replyData = {
      key: replyingToMsg.key,
      text: replyingToMsg.type === 'text' ? replyingToMsg.text : replyingToMsg.type === 'image' ? '📷 صورة' : '🎙️ صوت'
    };
    cancelReply(); // إغلاق مربع الرد بعد الإرسال
  }

  await pushMessage({
    type: 'voice',
    url,
    duration,
    senderUid: currentUser.uid,
    timestamp: Date.now(),
    replyTo: replyData // 🚀 إرفاق بيانات الرد مع المقطع الصوتي
  });
}

async function pushMessage(msg) {
  const { chatId, friendUid } = currentChat;
  const ref = db.ref('chats/' + chatId + '/messages').push();
  await ref.set(msg);
  const lastMsg = msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : '🎙️ رسالة صوتية';
  await db.ref().update({
    [`userChats/${currentUser.uid}/${chatId}/lastMsg`]: lastMsg,
    [`userChats/${currentUser.uid}/${chatId}/updatedAt`]: msg.timestamp,
    [`userChats/${friendUid}/${chatId}/lastMsg`]: lastMsg,
    [`userChats/${friendUid}/${chatId}/updatedAt`]: msg.timestamp
  });
  db.ref(`userChats/${friendUid}/${chatId}/unread`).transaction(v => (v || 0) + 1);

  try {
    const friendSnap = await db.ref('users/' + friendUid).once('value');
    if (friendSnap.exists()) {
      const fData = friendSnap.val();
      if (fData.fcmToken) {
        fetch(`${VERCEL_URL}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: fData.fcmToken,
            title: myProfile.name || 'نيون شات',
            body: lastMsg,
            icon: 'https://mohammadalboushi.github.io/neonchat/icon-192.png',
            url: 'https://mohammadalboushi.github.io/neonchat/'
          })
        });
      }
    }
  } catch (err) { console.error('فشل إرسال الإشعار:', err); }
}

/* ═══════════════════════════════════
   IMAGE UPLOAD
═══════════════════════════════════ */
document.getElementById('file-img-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentChat) return;
  e.target.value = '';
  showToast('جاري رفع الصورة…');
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', 'malaboushi_preset');
    const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
      method: 'POST',
      body: fd
    });
    const data = await res.json();
    if (data.secure_url) {
      await sendImageMsg(data.secure_url);
      showToast('تم إرسال الصورة', 'success');
    } else throw new Error('فشل الرفع');
  } catch (e) {
    showToast('فشل: ' + e.message, 'error');
  }
});

/* ═══════════════════════════════════
   VOICE RECORDING
═══════════════════════════════════ */
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
    return;
  }
  if (!navigator.mediaDevices) {
    showToast('المتصفح لا يدعم التسجيل', 'error');
    return;
  }
  try {
    let audioConstraints = {
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false
    };

    if (internalMicId) {
      audioConstraints.deviceId = { exact: internalMicId };
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    audioChunks = [];
    isRecordingCanceled = false;
    mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
    
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (isRecordingCanceled) {
        showToast('تم رمي التسجيل 🗑️');
        return;
      }
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      
      // 🚀 رمي فقاعة وهمية فوراً بالشاشة لتعطي إحساس بالسرعة
      const tempId = 'temp-audio-' + Date.now();
      const area = document.getElementById('messages-area');
      if (area) {
        const tempDiv = document.createElement('div');
        tempDiv.className = 'msg-row out';
        tempDiv.id = tempId;
        tempDiv.innerHTML = `<div class="msg-bubble" style="background:rgba(0, 240, 255, 0.05); border:1px dashed var(--neon-cyan); color:var(--text-secondary); display:flex; align-items:center; gap:8px;">
          <div style="width:16px; height:16px; border:2px solid var(--border-subtle); border-top-color:var(--neon-cyan); border-radius:50%; animation:spin .8s linear infinite;"></div>
          <span style="font-size:13px;">جاري إرسال المقطع...</span>
        </div>`;
        area.appendChild(tempDiv);
        area.scrollTop = area.scrollHeight;
      }

      try {
        const fd = new FormData();
        fd.append('file', blob);
        fd.append('upload_preset', 'malaboushi_preset');
        const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
          method: 'POST',
          body: fd
        });
        const data = await res.json();
        
        // إزالة الفقاعة الوهمية بمجرد انتهاء الرفع وظهور الحقيقية
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();

        if (data.secure_url) {
          await sendVoiceMsg(data.secure_url, recordDurationStr);
        } else throw new Error('فشل الرفع');
      } catch (e) {
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.remove();
        showToast('فشل: ' + e.message, 'error');
      }
    };
    
    mediaRecorder.start(200);
    isRecording = true;
    recordStart = Date.now();
    document.getElementById('btn-voice').classList.add('recording');
    document.getElementById('msg-input-wrap').style.display = 'none';
    document.getElementById('btn-attach').style.display = 'none';
    document.getElementById('btn-cancel-voice').style.display = 'flex';
    document.getElementById('recording-indicator').style.display = 'flex';
    if (currentChat) {
      const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid);
      recRef.set('recording');
      recRef.onDisconnect().remove();
    }
    startRecordTimer();
  } catch (e) {
    showToast('تعذر الوصول للمايكروفون', 'error');
  }
}


function startRecordTimer() {
  const span = document.getElementById('rec-timer-text');
  recordTimerInt = setInterval(() => {
    const sec = Math.floor((Date.now() - recordStart) / 1000);
    const m = Math.floor(sec / 60), s = sec % 60;
    recordDurationStr = m + ':' + (s < 10 ? '0' : '') + s;
    if (span) span.textContent = recordDurationStr;
  }, 1000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  if (currentChat) {
    const recRef = db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid);
    recRef.remove();
    recRef.onDisconnect().cancel();
  }
  document.getElementById('btn-voice').classList.remove('recording');
  document.getElementById('msg-input-wrap').style.display = 'block';
  document.getElementById('btn-attach').style.display = 'flex';
  document.getElementById('btn-cancel-voice').style.display = 'none';
  document.getElementById('recording-indicator').style.display = 'none';
  clearInterval(recordTimerInt);
}

function cancelVoiceRecord() {
  isRecordingCanceled = true;
  stopRecording();
}

/* ═══════════════════════════════════
   VOICE PLAYBACK (OPTIMIZED)
═══════════════════════════════════ */
let currentAudio = null;
let currentAudioUrl = null;
let audioUpdateInterval = null;

function playVoice(btn, url, msgKey, isOut) {
  // 🚀 تحديث حالة الاستماع في قاعدة البيانات لو الرسالة واصلتني (مش أنا اللي باعتها)
  if (isOut === false && currentChat) {
    db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({ listened: true });
    const dot = document.getElementById('unplayed-' + msgKey);
    if (dot) {
      dot.style.background = 'transparent';
      dot.style.boxShadow = 'none';
    }
  }

  if (currentAudio && currentAudioUrl === url) {
    if (!currentAudio.paused) {
      currentAudio.pause();
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      clearInterval(audioUpdateInterval);
      return;
    } else {
      currentAudio.play();
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      startAudioProgress(msgKey);
      return;
    }
  }

  if (currentAudio) {
    currentAudio.pause();
    document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`);
    document.querySelectorAll('.voice-progress-fill').forEach(f => f.style.width = '0%');
    clearInterval(audioUpdateInterval);
  }

  currentAudioUrl = url;
  currentAudio = new Audio(url);
  currentAudio.preload = 'auto'; // إجبار المتصفح على التحميل الفوري
  
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  
  // تشغيل آمن لتفادي أخطاء المتصفح
  let playPromise = currentAudio.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => console.log("Audio playback waiting..."));
  }
  
  startAudioProgress(msgKey);

  currentAudio.onended = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const fill = document.getElementById('progress-' + msgKey);
    if (fill) fill.style.width = '0%';
    const durEl = document.getElementById('dur-' + msgKey);
    if (durEl) durEl.textContent = durEl.getAttribute('data-orig');
    
    // 🚀 الخدعة الجديدة: فحص الرسالة التالية مباشرة وعدم القفز إذا وجد رسالة نصية أو صورة
    let currentRow = btn.closest('.msg-row');
    let nextRow = currentRow ? currentRow.nextElementSibling : null;
    
    // تجاوز فواصل التاريخ فقط (إن وجدت بين المقطعين)
    while (nextRow && nextRow.classList.contains('date-sep')) {
      nextRow = nextRow.nextElementSibling;
    }

    let nextBtn = null;
    if (nextRow && nextRow.classList.contains('msg-row')) {
      // سيبحث عن زر التشغيل بالرسالة التالية، وإذا لم يجده (لأنها رسالة نصية مثلاً) ستكون النتيجة null ولن يشغل شيئاً
      nextBtn = nextRow.querySelector('.voice-play-btn');
    }

    currentAudio = null;
    currentAudioUrl = null;
    clearInterval(audioUpdateInterval);

    // تشغيل المقطع التالي فوراً إذا كان موجوداً وكان هو الرسالة التالية مباشرة
    if (nextBtn) {
      nextBtn.click();
    }
  };
}

function startAudioProgress(msgKey) {
  clearInterval(audioUpdateInterval);
  
  // الخدعة الذكية: قراءة المدة من النص المخزن في الشاشة فوراً
  const durEl = document.getElementById('dur-' + msgKey);
  const origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0;
  if (origStr) {
    const parts = origStr.split(':');
    if (parts.length === 2) {
      fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
  }

  // تسريع حركة الشريط ليصبح سلس جداً (تحديث كل 30 ملي ثانية)
  audioUpdateInterval = setInterval(() => {
    if (currentAudio && !currentAudio.paused) {
      // إذا كان المتصفح يتغابى ويعطينا Infinity نستخدم الرقم الذي حسبناه
      let totalDuration = currentAudio.duration;
      if (!totalDuration || totalDuration === Infinity) {
        totalDuration = fallbackDuration;
      }

      if (totalDuration > 0) {
        let perc = (currentAudio.currentTime / totalDuration) * 100;
        if (perc > 100) perc = 100;
        let fill = document.getElementById('progress-' + msgKey);
        if (fill) fill.style.width = perc + '%';
        
        if (durEl) {
          const curSec = Math.floor(currentAudio.currentTime);
          const m = Math.floor(curSec / 60);
          const s = curSec % 60;
          durEl.textContent = `${m}:${s < 10 ? '0' : ''}${s} / ${origStr}`;
        }
      }
    }
  }, 30); 
}

function seekVoice(event, url, msgKey) {
  if (!currentAudio || currentAudioUrl !== url) return;
  
  const durEl = document.getElementById('dur-' + msgKey);
  const origStr = durEl ? durEl.getAttribute('data-orig') : '0:00';
  let fallbackDuration = 0;
  if (origStr) {
    const parts = origStr.split(':');
    if (parts.length === 2) fallbackDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  
  let totalDuration = currentAudio.duration;
  if (!totalDuration || totalDuration === Infinity) totalDuration = fallbackDuration;
  if (!totalDuration) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = rect.right - event.clientX; 
  let perc = clickX / rect.width;
  if (perc < 0) perc = 0;
  if (perc > 1) perc = 1;
  
  currentAudio.currentTime = totalDuration * perc;
  const fill = document.getElementById('progress-' + msgKey);
  if (fill) fill.style.width = (perc * 100) + '%';
}


/* ═══════════════════════════════════
   IMAGE PREVIEW, ZOOM & PAN
═══════════════════════════════════ */
let currentScale = 1;
let imgTx = 0, imgTy = 0;
let imgStartX = 0, imgStartY = 0;

function previewImg(url) {
  const img = document.getElementById('img-preview-el');
  img.src = url;
  currentScale = 1;
  imgTx = 0;
  imgTy = 0;
  img.style.transform = `translate(0px, 0px) scale(1)`;
  document.getElementById('img-preview-overlay').classList.add('open');
  history.pushState({ overlay: 'image' }, '', '');
}

function closeImgPreview() {
  document.getElementById('img-preview-overlay').classList.remove('open');
}

const imgEl = document.getElementById('img-preview-el');
const overlayEl = document.getElementById('img-preview-overlay');

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl) history.back();
});

let imgLastTap = 0;
imgEl.addEventListener('touchstart', (e) => {
  const now = Date.now();
  if (now - imgLastTap < 300 && now - imgLastTap > 0) {
    currentScale = currentScale === 1 ? 4 : 1;
    imgTx = 0;
    imgTy = 0;
    imgEl.style.transition = 'transform 0.2s ease';
    imgEl.style.transform = `translate(0px, 0px) scale(${currentScale})`;
    e.preventDefault();
  } else {
    imgStartX = e.touches[0].clientX - imgTx;
    imgStartY = e.touches[0].clientY - imgTy;
    imgEl.style.transition = 'none';
  }
  imgLastTap = now;
});

imgEl.addEventListener('touchmove', (e) => {
  if (currentScale > 1) {
    e.preventDefault();
    imgTx = e.touches[0].clientX - imgStartX;
    imgTy = e.touches[0].clientY - imgStartY;
    imgEl.style.transform = `translate(${imgTx}px, ${imgTy}px) scale(${currentScale})`;
  }
});

/* ═══════════════════════════════════
   CALL SYSTEM — WebRTC
═══════════════════════════════════ */
function initCallListener(uid) {
  if (myCallListener) db.ref('calls/' + uid).off('value', myCallListener);
  myCallListener = db.ref('calls/' + uid).on('value', async snap => {
    const data = snap.val();
    if (!data) {
      closeCallUI();
      return;
    }

    currentCallPeer = data.peerUid;
    document.getElementById('call-name-view').textContent = data.peerName || 'مستخدم';
    document.getElementById('call-avatar-view').textContent = (data.peerName || '?').charAt(0);

    if (data.status === 'incoming') {
      document.getElementById('call-status-view').textContent = 'يتصل بك... 📞';
      document.getElementById('call-status-view').style.color = 'var(--neon-cyan)';
      document.getElementById('btn-accept-call').style.display = 'flex';
      if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500]);
      renderScreenUI('call');

    } else if (data.status === 'answered') {
      document.getElementById('btn-accept-call').style.display = 'none';
      startCallTimer();
      if (data.role === 'caller' && !peerConnection) {
        callIsCaller = true;
        await setupWebRTCPeer(true);
      }
    } else if (data.status === 'ended') {
      endCall();
    }
  });
}

async function startCall() {
  if (!currentChat) return;
  currentCallPeer = currentChat.friendUid;
  document.getElementById('call-name-view').textContent = currentChat.friendProfile.name;
  document.getElementById('call-avatar-view').textContent = (currentChat.friendProfile.name || '?').charAt(0);
  document.getElementById('call-status-view').textContent = 'جاري الاتصال...';
  document.getElementById('call-status-view').style.color = 'var(--neon-cyan)';
  document.getElementById('btn-accept-call').style.display = 'none';
  renderScreenUI('call');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    callIsCaller = true;

    await db.ref('calls/' + currentUser.uid).set({
      status: 'calling',
      role: 'caller',
      peerUid: currentCallPeer,
      peerName: currentChat.friendProfile.name
    });
    await db.ref('calls/' + currentCallPeer).set({
      status: 'incoming',
      role: 'callee',
      peerUid: currentUser.uid,
      peerName: myProfile.name
    });
  } catch (e) {
    showToast('فشل فتح المايكروفون: تأكد من الصلاحيات', 'error');
    endCall();
  }
}

async function acceptCall() {
  if (!currentCallPeer) return;
  document.getElementById('call-status-view').textContent = 'جاري الاتصال...';
  document.getElementById('btn-accept-call').style.display = 'none';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    callIsCaller = false;

    await db.ref('calls/' + currentUser.uid).update({ status: 'answered' });
    await db.ref('calls/' + currentCallPeer).update({ status: 'answered' });

    await setupWebRTCPeer(false);
  } catch (e) {
    showToast('لا يمكن الرد بدون صلاحية المايكروفون', 'error');
    endCall();
  }
}

function endCall() {
  if (currentCallPeer) {
    const chatId = [currentUser.uid, currentCallPeer].sort().join('_');
    db.ref('chats/' + chatId + '/webrtc').remove();
    db.ref('calls/' + currentCallPeer).remove();
    db.ref('calls/' + currentUser.uid).remove();
  }
  closeCallUI();
}

function closeCallUI() {
  clearInterval(callDurationInt);
  callDurationInt = null;

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  const remoteAudio = document.getElementById('remote-audio-el');
  if (remoteAudio) remoteAudio.srcObject = null;

  if (document.getElementById('screen-call').classList.contains('active')) {
    renderScreenUI('chat');
  }
}

async function setupWebRTCPeer(isCaller) {
  if (!currentCallPeer) return;
  const chatId = [currentUser.uid, currentCallPeer].sort().join('_');
  const signalRef = db.ref('chats/' + chatId + '/webrtc');

  if (isCaller) {
    await signalRef.remove();
  }

  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = event => {
    const remoteAudio = document.getElementById('remote-audio-el');
    if (remoteAudio) {
      if (event.streams && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      } else {
        remoteAudio.srcObject = new MediaStream([event.track]);
      }
      remoteAudio.muted = false;
      remoteAudio.volume = 1;
      remoteAudio.play().catch(e => console.error("Audio play error:", e));
    }
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      const candPath = isCaller ? 'callerCandidates' : 'calleeCandidates';
      signalRef.child(candPath).push(event.candidate.toJSON());
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === 'connected') {
      document.getElementById('call-status-view').style.color = 'var(--neon-green)';
    } else if (state === 'disconnected' || state === 'failed') {
      endCall();
    }
  };

  if (isCaller) {
    const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
    await peerConnection.setLocalDescription(offer);
    await signalRef.child('offer').set({ sdp: offer.sdp, type: offer.type });

    signalRef.child('answer').on('value', async snap => {
      const answer = snap.val();
      if (answer && peerConnection && peerConnection.signalingState === 'have-local-offer') {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.warn('setRemoteDescription (answer):', e);
        }
      }
    });

    signalRef.child('calleeCandidates').on('child_added', async snap => {
      const cand = snap.val();
      if (cand && peerConnection) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
      }
    });
  } else {
    signalRef.child('offer').once('value', async snap => {
      const offer = snap.val();
      if (!offer || !peerConnection) return;
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await signalRef.child('answer').set({ sdp: answer.sdp, type: answer.type });
      } catch (e) {
        console.warn('callee setup:', e);
      }
    });

    signalRef.child('callerCandidates').on('child_added', async snap => {
      const cand = snap.val();
      if (cand && peerConnection) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
      }
    });
  }
}

function startCallTimer() {
  clearInterval(callDurationInt);
  const startTime = Date.now();
  document.getElementById('call-status-view').style.color = 'var(--neon-green)';
  callDurationInt = setInterval(() => {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(sec / 60), s = sec % 60;
    document.getElementById('call-status-view').textContent = `في مكالمة: ${m}:${s<10?'0':''}${s}`;
  }, 1000);
}

/* ═══════════════════════════════════
   UTILS
═══════════════════════════════════ */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  const yes = new Date(now);
  yes.setDate(now.getDate() - 1);
  if (d.toDateString() === yes.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' });
}

/* ═══════════════════════════════════
   OFFLINE FIRST
═══════════════════════════════════ */
(function() {
  const cached = localStorage.getItem('myProfile');
  if (cached) {
    try { myProfile = JSON.parse(cached); } catch (e) {}
  }
})();

/* ═══════════════════════════════════
   CHAT SEARCH LOGIC
═══════════════════════════════════ */
let chatSearchResults = [];
let currentSearchIndex = -1;

function toggleChatSearch() {
  const bar = document.getElementById('chat-search-bar');
  const input = document.getElementById('chat-search-input');
  if (bar.style.display === 'none') {
    bar.style.display = 'flex';
    input.value = '';
    input.focus();
    clearChatHighlights();
  } else {
    bar.style.display = 'none';
    clearChatHighlights();
  }
}

function clearChatHighlights() {
  document.querySelectorAll('.msg-bubble').forEach(b => {
    b.style.boxShadow = 'none';
    b.style.transform = 'scale(1)';
  });
  chatSearchResults = [];
  currentSearchIndex = -1;
}

function searchInChat(query) {
  clearChatHighlights();
  if (!query.trim()) return;
  const bubbles = document.getElementById('messages-area').querySelectorAll('.msg-bubble');

  bubbles.forEach(bubble => {
    if (bubble.innerText.includes(query)) {
      chatSearchResults.push(bubble);
    }
  });

  if (chatSearchResults.length > 0) {
    currentSearchIndex = chatSearchResults.length - 1;
    highlightCurrentSearchResult();
  }
}

function nextSearchResult() {
  if (chatSearchResults.length === 0) return;
  currentSearchIndex--;
  if (currentSearchIndex < 0) currentSearchIndex = chatSearchResults.length - 1;
  highlightCurrentSearchResult();
}

function prevSearchResult() {
  if (chatSearchResults.length === 0) return;
  currentSearchIndex++;
  if (currentSearchIndex >= chatSearchResults.length) currentSearchIndex = 0;
  highlightCurrentSearchResult();
}

function highlightCurrentSearchResult() {
  chatSearchResults.forEach((b, idx) => {
    if (idx === currentSearchIndex) {
      b.style.boxShadow = '0 0 20px var(--neon-cyan)';
      b.style.transform = 'scale(1.03)';
      b.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      b.style.boxShadow = 'none';
      b.style.transform = 'scale(1)';
    }
  });
}

/* ═══════════════════════════════════
   HOME CHAT MENU & FRIENDS LIST
═══════════════════════════════════ */
function openHomeChatMenu(chatId, friendUid, friendName) {
  const menu = document.getElementById('msg-menu');
  menu.innerHTML = `<div style="font-size:14px; font-weight:bold; color:var(--text-secondary); text-align:center; margin-bottom:10px; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">إعدادات المحادثة: ${escHtml(friendName)}</div>`;

  menu.innerHTML += `<button class="msg-menu-btn" onclick="clearChatHistory('${chatId}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg> مسح المحادثة الداخلية</button>`;

  // تمرير الـ chatId فقط لزر الحذف للاستنتاج الذكي ومنع الأخطاء
  menu.innerHTML += `<button class="msg-menu-btn danger" onclick="removeChatFromList('${chatId}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5c-1.1 0-2 .9-2 2v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg> حذف من الشاشة الرئيسية</button>`;

  menu.innerHTML += `<button class="msg-menu-btn danger" onclick="blockUser('${friendUid}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg> حظر الشخص</button>`;

  document.getElementById('msg-menu-overlay').classList.add('open');
  if (navigator.vibrate) navigator.vibrate(50);
}

function clearChatHistory(chatId) {
  openModal('مسح المحادثة', 'هل أنت متأكد من مسح رسائل هذه المحادثة من جهازك؟').then(ok => {
    if (ok) {
      db.ref('chats/' + chatId + '/messages').remove().then(() => showToast('تم مسح المحادثة', 'success'));
      db.ref('userChats/' + currentUser.uid + '/' + chatId + '/lastMsg').set('');
    }
  });
}

async function removeChatFromList(chatId) {
  const ok = await openModal('إخفاء المحادثة', 'سيتم إخفاء المحادثة، ولكن سيبقى الشخص في قائمة الأصدقاء.');
  if (ok) {
    showToast('جاري الإخفاء...');
    try {
      // الاستنتاج الذكي من اسم المحادثة لتفادي إرسال بيانات خاطئة من الأزرار
      const uids = chatId.split('_');
      const friendUid = uids[0] === currentUser.uid ? uids[1] : uids[0];

      if (friendUid) {
        const fSnap = await db.ref('users/' + friendUid).once('value');
        if (fSnap.exists()) {
          const fData = fSnap.val();
          await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({
            name: fData.name || 'مستخدم',
            photo: fData.photo || '',
            timestamp: Date.now()
          });
        }
      }
      
      await db.ref('userChats/' + currentUser.uid + '/' + chatId).remove();
      showToast('تم إخفاء المحادثة بنجاح ✔️', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء الإخفاء', 'error');
    }
  }
}

function blockUser(friendUid) {
  openModal('حظر', 'هل تريد حظر هذا الشخص؟').then(ok => {
    if (ok) {
      db.ref('blockedUsers/' + currentUser.uid + '/' + friendUid).set(true);
      showToast('تم الحظر بنجاح', 'success');
    }
  });
}

function initFriendsListListener(uid) {
  const container = document.getElementById('my-friends-container');
  if (!container) return;

  // تنظيف المستمعات القديمة لمنع التكرار
  db.ref('friendsList/' + uid).off();
  container.innerHTML = '';

  // فحص القائمة الفارغة ونقل المحادثات القديمة
  db.ref('friendsList/' + uid).once('value', async snap => {
    if (!snap.exists()) {
      const chatsSnap = await db.ref('userChats/' + uid).once('value');
      let hasOldFriends = false;
      if (chatsSnap.exists()) {
        chatsSnap.forEach(c => {
          const d = c.val();
          if (d.friendUid) {
            db.ref('friendsList/' + uid + '/' + d.friendUid).set({
              name: d.friendName || 'مستخدم',
              photo: d.friendPhoto || '',
              timestamp: d.updatedAt || Date.now()
            });
            hasOldFriends = true;
          }
        });
      }
      if (!hasOldFriends) {
        container.innerHTML = `<div id="friends-empty-msg" style="text-align:center; padding:40px 20px; color:var(--text-muted);">لا يوجد أصدقاء في القائمة بعد.</div>`;
      }
    }
  });

  // 🚀 الحل الذكي لمشكلة الرفة: الاستماع للإضافة والتغيير بشكل فردي 🚀
  db.ref('friendsList/' + uid).on('child_added', snap => {
    const friendUid = snap.key;
    const fData = snap.val();
    
    const emptyMsg = document.getElementById('friends-empty-msg');
    if (emptyMsg) emptyMsg.remove();

    if (document.getElementById('friend-card-' + friendUid)) return;

    const initials = (fData.name || '?').charAt(0);
    const avatarHtml = fData.photo ?
      `<img src="${fData.photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"/>` :
      initials;

    const card = document.createElement('div');
    card.className = 'search-result-card';
    card.id = 'friend-card-' + friendUid;
    card.style.cssText = 'padding:12px 16px; margin-bottom:8px; display:flex; align-items:center;';
    card.innerHTML = `
      <div class="search-result-avatar" style="width:40px;height:40px;font-size:15px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; border:1px solid var(--border-subtle);">${avatarHtml}</div>
      <div class="search-result-info" style="flex:1; margin-right:12px; text-align:right;">
        <div class="search-result-name" id="friend-name-text-${friendUid}" style="font-size:16px;margin-bottom:0;">${escHtml(fData.name)}</div>
      </div>
      <button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px;flex-shrink:0;" onclick="startChat('${friendUid}')">مراسلة</button>
    `;
    container.appendChild(card);
  });

  db.ref('friendsList/' + uid).on('child_changed', snap => {
    const friendUid = snap.key;
    const fData = snap.val();
    const nameEl = document.getElementById('friend-name-text-' + friendUid);
    if (nameEl) nameEl.textContent = fData.name;
  });

  db.ref('friendsList/' + uid).on('child_removed', snap => {
    const card = document.getElementById('friend-card-' + snap.key);
    if (card) card.remove();
  });
}

// الحل الجذري والنهائي لمنع الشاشة من التمرير الوهمي (Scroll) عند ظهور الكيبورد
document.body.style.overscrollBehavior = 'none';
document.documentElement.style.overscrollBehavior = 'none';

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const appEl = document.getElementById('app');
    appEl.style.height = window.visualViewport.height + 'px';
    appEl.style.position = 'fixed';
    appEl.style.top = '0';
    appEl.style.width = '100%';
    window.scrollTo(0, 0);
    const area = document.getElementById('messages-area');
    if (area) area.scrollTop = area.scrollHeight;
  });
}

// قفل صارم يمنع المتصفح من سحب الصفحة للأسفل (Pull-to-refresh أو Overscroll)
document.body.addEventListener('touchmove', (e) => {
  const isScrollable = e.target.closest('#messages-area') || e.target.closest('.chats-list') || e.target.closest('.add-friend-body') || e.target.closest('.profile-body');
  if (!isScrollable) {
    e.preventDefault();
  }
}, { passive: false });

const msgInputEl = document.getElementById('msg-input');
if(msgInputEl) {
  msgInputEl.addEventListener('focus', () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 50);
  });
}

/* ═══════════════════════════════════
   SCROLL TO REPLY
═══════════════════════════════════ */
function scrollToMessage(msgKey) {
  const targetEl = document.getElementById('msg-' + msgKey);
  if (targetEl) {
    // التمرير السلس للرسالة وتوسيطها في الشاشة
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // عمل وميض لوني وحركة تكبير خفيفة للفت الانتباه
    targetEl.style.transition = 'all 0.3s ease';
    targetEl.style.boxShadow = '0 0 20px var(--neon-cyan)';
    targetEl.style.transform = 'scale(1.05)';
    
    // إزالة الوميض بعد ثانية ونصف لتعود الرسالة لشكلها الطبيعي
    setTimeout(() => {
      targetEl.style.boxShadow = 'none';
      targetEl.style.transform = 'scale(1)';
    }, 1500);
  }
}
