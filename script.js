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
const VAPID_KEY = 'BLyGo78MotBcNontRvYa14hdbwWLxjJBJ4AWFIj35Ek125D-SO2445PpX1tNuSgBv5MPQSZhgPyzNynvVitg68I'; // ضع المفتاح الذي ستجلبه من إعدادات فايربيز هنا

/* ═══════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════ */
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
let friendsListListener = null; // أضفنا هذا السطر لمنع الرفة

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
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      a: Math.random() * .6 + .2
    };
  }
  for (let i = 0; i < 60; i++) particles.push(mkP());

  function draw() {
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
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ═══════════════════════════════════
   NAVIGATION & BACK BUTTON (STRICT)
═══════════════════════════════════ */
// تفعيل الحماية من البداية
history.pushState({
  screen: 'home'
}, '', '');

window.addEventListener('popstate', e => {
  const imgOverlay = document.getElementById('img-preview-overlay');
  const msgMenuOverlay = document.getElementById('msg-menu-overlay');
  const modalOverlay = document.getElementById('modal-overlay');

  let isPopupOpen = false;

  // 1. إغلاق زوم الصورة
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

  // 2. إغلاق القوائم المنبثقة (مثل الضغطة المطولة)
  if (msgMenuOverlay && msgMenuOverlay.classList.contains('open')) {
    closeMsgMenu();
    isPopupOpen = true;
  }

  // 3. إغلاق نوافذ التأكيد
  if (modalOverlay && modalOverlay.classList.contains('open')) {
    modalOverlay.classList.remove('open');
    isPopupOpen = true;
  }

  // التحديد الدقيق للشاشة الفعالة حالياً لمنع التعليق
  let currentActiveScreen = 'home';
  document.querySelectorAll('.screen').forEach(s => {
    if (s.classList.contains('active')) {
      currentActiveScreen = s.id.replace('screen-', '');
    }
  });

  if (isPopupOpen) {
    // إذا سكرنا نافذة منبثقة، بنبقى بنفس الشاشة الفعالة بدون إعادة تحميلها
    history.pushState({
      screen: currentActiveScreen
    }, '', '');
    return;
  }

  const targetScreen = e.state && e.state.screen ? e.state.screen : 'home';

  // 🔥 الحماية القصوى: إذا كنا في الرئيسية وضغطنا رجوع، نمنعه من الخروج نهائياً ونثبته بالرئيسية 🔥
  if (currentActiveScreen === 'home') {
    history.pushState({
      screen: 'home'
    }, '', '');
    return;
  }

  // التنقل الطبيعي بين الشاشات
  renderScreenUI(targetScreen);
  history.pushState({
    screen: targetScreen
  }, '', '');
});

function showScreen(name) {
  history.pushState({
    screen: name
  }, '', '');
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
// دالة ذكية لتنسيق الإيميل (إذا كان يوزرنيم نحوله لإيميل وهمي خاص بالتطبيق)
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

// 1️⃣ زر الدخول
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
      // بمجرد النجاح، دالة onAuthStateChanged ستتولى الباقي وتنقلنا للرئيسية
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

// 2️⃣ زر إنشاء حساب
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
      // إذا أدخل يوزرنيم، نحفظه كاسمه الافتراضي
      if (!rawEmail.includes('@')) {
        await userCred.user.updateProfile({ displayName: rawEmail });
      }
      showToast('تم إنشاء الحساب بنجاح!', 'success');
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        // الخدعة الذكية: إذا كان ذكي وضغط إنشاء حساب وهو يملك حساب مسبقاً، ندخله فوراً
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

// 3️⃣ زر استعادة كلمة المرور
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

auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    await ensureUserProfile(user);

    // طلب صلاحية الإشعارات
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    document.getElementById('loader-screen').classList.add('hidden');
    // Setup presence FIRST then navigate
    setupPresence(user.uid);

    // 🔥 توليد توكن الإشعارات وحفظه تلقائياً 🔥
    try {
      // إخبار فايربيز بمكان ملف السيرفر ووركر الصحيح
      const swReg = await navigator.serviceWorker.register('./sw.js');
      const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      
      if (token) {
        await db.ref('users/' + user.uid + '/fcmToken').set(token);
      }
    } catch (err) { console.log('تعذر جلب توكن الإشعارات:', err); }

    initCallListener(user.uid);
    initFriendRequestsListener(user.uid);
    initFriendsListListener(user.uid); // مراقبة قائمة الأصدقاء المخفيين
    showScreen('home');
  } else {
    currentUser = null;
    myProfile = null;
    document.getElementById('loader-screen').classList.add('hidden');
    renderScreenUI('login');
  }
});

/* ═══════════════════════════════════
   PRESENCE — متصل الآن / آخر ظهور
═══════════════════════════════════ */
function setupPresence(uid) {
  const myStatusRef = db.ref('users/' + uid + '/status');
  const connectedRef = db.ref('.info/connected');

  connectedRef.on('value', snap => {
    if (snap.val() === false) return;
    myStatusRef.onDisconnect().set(Date.now()).then(() => {
      myStatusRef.set('online');
    });
  });
}

async function ensureUserProfile(user) {
  const ref = db.ref('users/' + user.uid);
  const snap = await ref.once('value');
  if (snap.exists()) {
    myProfile = snap.val();
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

// دالة جديدة لتنظيف كل الأشباح والذاكرة عند الخروج
function cleanupListeners() {
  if (currentUser) {
    if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
    if (friendRequestsListener) db.ref('friendRequests/' + currentUser.uid).off('value', friendRequestsListener);
    if (friendsListListener) db.ref('friendsList/' + currentUser.uid).off('value', friendsListListener);
    if (myCallListener) db.ref('calls/' + currentUser.uid).off('value', myCallListener);
    
    // إيقاف مراقبة حالة الأصدقاء
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
      cleanupListeners(); // تشغيل مكنسة التنظيف هنا!
      auth.signOut().then(() => {
        localStorage.removeItem('myProfile');
        
        // تصفير الصورة الشخصية لتجنب ظهور صورة الحساب القديم
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
    await db.ref('users/' + myProfile.uid).update({
      name: newName
    });
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
      await db.ref('users/' + myProfile.uid).update({
        photo: data.secure_url
      });
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

        // 🔥 مزامنة تلقائية: إذا كان الشخص في المحادثات، تأكد أنه موجود في قائمة الأصدقاء (لإصلاح المشكلة القديمة)
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

    // ضغطة مطولة لفتح قائمة المحادثة
    let pressTimer;
    div.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => {
        openHomeChatMenu(chatId, data.friendUid, data.friendName);
      }, 600);
    }, {
      passive: true
    });
    div.addEventListener('touchmove', () => clearTimeout(pressTimer), {
      passive: true
    });
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
    let count = 0,
      htmlStr = '';
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

  // 1. إضافة للشاشة الرئيسية (المحادثات)
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

  // 2. 🔥 إضافة لقائمة الأصدقاء فوراً للطرفين 🔥
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
  currentChat = {
    chatId,
    friendUid,
    friendProfile
  };

  const avatarEl = document.getElementById('chat-header-avatar');
  if (friendProfile.photo) {
    avatarEl.outerHTML = `<img src="${friendProfile.photo}" class="chat-header-avatar" id="chat-header-avatar" style="object-fit:cover;"/>`;
  } else {
    avatarEl.outerHTML = `<div class="chat-header-avatar" id="chat-header-avatar">${(friendProfile.name||'?').charAt(0)}</div>`;
  }
  document.getElementById('chat-header-name').textContent = friendProfile.name;

  db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);

  // 1. نفصل الرسايل القديمة أول شي
  detachMessages();

  // 2. نرسم الواجهة ونربط الرسايل بدون ما نفصل المراقبة
  renderScreenUI('chat');
  attachMessages(chatId);

  // 3. نركب مراقبة حالة الاتصال ومؤشر الكتابة
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
          day: '2-digit',
          month: 'short'
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
   ATTACH MESSAGES
═══════════════════════════════════ */
function attachMessages(chatId) {
  const area = document.getElementById('messages-area');
  area.innerHTML = '';
  lastMsgDate = '';

  db.ref('userChats/' + currentChat.friendUid + '/' + chatId).update({
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || ''
  });

  messagesRef = db.ref('chats/' + chatId + '/messages');

  messagesListener = messagesRef.orderByChild('timestamp').on('child_added', snap => {
    const msg = {
      ...snap.val(),
      key: snap.key
    };
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastMsgDate) {
      const sep = document.createElement('div');
      sep.className = 'date-sep';
      sep.innerHTML = `<span>${dateStr}</span>`;
      area.appendChild(sep);
      lastMsgDate = dateStr;
    }
    area.appendChild(buildMsgEl(msg));
    area.scrollTop = area.scrollHeight;
    if (msg.senderUid !== currentUser.uid) {
      if (!msg.read) snap.ref.update({
        read: true
      });
      db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);
    }
  });

  msgChangedListener = messagesRef.on('child_changed', snap => {
    const msg = {
      ...snap.val(),
      key: snap.key
    };
    const ticksEl = document.getElementById('ticks-' + msg.key);
    if (ticksEl && msg.read) {
      ticksEl.setAttribute('stroke', 'var(--neon-cyan)');
      ticksEl.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline><polyline points="24 6 13 17 8 12"></polyline>';
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
function buildMsgEl(msg) {
  if (msg.isDeleted) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.senderUid === currentUser.uid ? 'out' : 'in');
    row.innerHTML = `<div class="msg-bubble" id="msg-${msg.key}" style="background:transparent;border:1px solid var(--border-subtle);color:var(--text-muted);font-style:italic;font-size:12px;">🚫 تم حذف هذه الرسالة</div>`;
    return row;
  }

  const row = document.createElement('div');
  const isOut = msg.senderUid === currentUser.uid;
  row.className = 'msg-row ' + (isOut ? 'out' : 'in');

  // Friend avatar (for received messages)
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

  // Gesture handling (Swipe & Double Tap Fix)
  let lastTap = 0,
    pressTimer, touchStartX = 0,
    touchStartY = 0,
    isSwiping = false,
    isVertical = false;

  bubble.addEventListener('touchstart', e => {
    const now = Date.now();
    if (now - lastTap < 300 && now - lastTap > 0) {
      toggleReaction(msg.key);
      lastTap = 0; // تصفير العداد لمنع تكرار العملية فوراً
      if (e.cancelable) e.preventDefault();
      return;
    }
    lastTap = now;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
    isVertical = false;
    bubble.style.transition = 'none'; // بنشيل الانتقال لحتى تلحق الرسالة الإصبع فوراً
    pressTimer = setTimeout(() => {
      if (!isSwiping && !isVertical) openMsgMenu(msg, isOut);
    }, 500);
  }, {
    passive: false
  });

  bubble.addEventListener('touchmove', e => {
    if (!touchStartX || !touchStartY) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    // منع السحب يمين/يسار إذا كان المستخدم عم ينزل بالمحادثة لتحت أو لفوق
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      isVertical = true;
      clearTimeout(pressTimer);
      bubble.style.transition = 'transform 0.2s ease-out';
      bubble.style.transform = 'translateX(0)';
      return;
    }
    // تفعيل سحب الرسالة للرد
    if (Math.abs(dx) > 15 && !isVertical) {
      isSwiping = true;
      clearTimeout(pressTimer);
      let limit = Math.min(Math.abs(dx), 65) * Math.sign(dx);
      bubble.style.transform = `translateX(${limit}px)`;
    }
  }, {
    passive: true
  });

  bubble.addEventListener('touchend', e => {
    clearTimeout(pressTimer);
    bubble.style.transition = 'transform 0.2s ease-out'; // ترجيع سلس للرسالة لمكانها
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

  // شلنا الـ dblclick لأنه بيعمل تعارض مع اللمس عالموبايل
  bubble.addEventListener('contextmenu', e => {
    e.preventDefault();
    openMsgMenu(msg, isOut);
  });


  // Ticks for outgoing
  let ticks = '';
  if (isOut) {
    const color = msg.read ? 'var(--neon-cyan)' : 'var(--text-muted)';
    const content = msg.read ?
      '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>' :
      '<polyline points="20 6 9 17 4 12"></polyline>';
    ticks = `<svg id="ticks-${msg.key}" width="14" height="14" viewBox="0 0 28 18" fill="none" stroke="${color}" stroke-width="2" style="margin-left:4px;margin-bottom:-2px;">${content}</svg>`;
  }

  const timeEl = `<div class="msg-time">${msg.isEdited ? '<span style="font-size:10px;opacity:0.7;">(معدلة)</span>' : ''}${ticks}${formatTime(msg.timestamp)}</div>`;
  const reactHtml = `<div id="react-${msg.key}" class="msg-reaction" style="display:${msg.reaction?'flex':'none'}">${msg.reaction||''}</div>`;

  // Reply quote
  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml = `<div class="reply-badge">↩ رد على رسالة</div><div style="background:rgba(0,0,0,0.2);padding:6px;border-radius:6px;margin-bottom:6px;border-right:2px solid var(--neon-cyan);font-size:12px;opacity:0.8;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(msg.replyTo.text)}</div>`;
  }

  if (msg.type === 'text') {
    bubble.innerHTML = `${replyHtml}<div>${escHtml(msg.text)}</div>${timeEl}${reactHtml}`;
  } else if (msg.type === 'image') {
    bubble.innerHTML = `${replyHtml}<img class="msg-img" src="${msg.url}" onload="document.getElementById('messages-area').scrollTop = document.getElementById('messages-area').scrollHeight" onclick="previewImg('${msg.url}')"/>${timeEl}${reactHtml}`;
  } else if (msg.type === 'voice') {
    const bars = Array.from({
      length: 20
    }, () => `<div class="voice-bar" style="height:${Math.floor(Math.random()*70)+20}%"></div>`).join('');
    bubble.innerHTML = `${replyHtml}
      <div class="voice-msg">
        <button class="voice-play-btn" onclick="playVoice(this,'${msg.url}', '${msg.key}')">
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
    if (m) ref.update({
      reaction: m.reaction === '❤️' ? null : '❤️'
    });
  });
}

/* ═══════════════════════════════════
   MSG CONTEXT MENU & UPDATES
═══════════════════════════════════ */
// تحديث الشاشة الرئيسية عند الحذف والتعديل
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

  // شريط الإيموجي المصغر
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
  // تم إزالة الاهتزاز
}

function addReaction(msgKey, emoji) {
  if (!currentChat) return;
  db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({
    reaction: emoji
  });
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
function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMsg();
    return;
  }
  // FIX: Typing indicator - set and clear properly
  if (currentChat && !isRecording) {
    db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).set('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (currentChat) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
    }, 2000);
  }
}

// Also trigger on regular input (not just keydown)
document.getElementById('msg-input').addEventListener('input', () => {
  if (!currentChat || isRecording) return;
  db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).set('typing');
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (currentChat) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
  }, 2000);
});

async function sendTextMsg() {
  if (currentChat) {
    db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
    clearTimeout(typingTimeout);
  }
  const inp = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text || !currentChat) return;
  inp.value = '';
  autoResize(inp);
  inp.focus(); // إبقاء الكيبورد مفتوح

  if (editingMsgKey) {
    await db.ref('chats/' + currentChat.chatId + '/messages/' + editingMsgKey).update({
      text,
      isEdited: true
    });
    updateLastMsgAfterChange(); // تحديث الشاشة الرئيسية فوراً
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
  await pushMessage({
    type: 'image',
    url,
    senderUid: currentUser.uid,
    timestamp: Date.now()
  });
}

async function sendVoiceMsg(url, duration) {
  await pushMessage({
    type: 'voice',
    url,
    duration,
    senderUid: currentUser.uid,
    timestamp: Date.now()
  });
}

async function pushMessage(msg) {
  const {
    chatId,
    friendUid
  } = currentChat;
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

  // 🔥 أمر إرسال الإشعار الخفي لسيرفر فيرسيل 🔥
  try {
    const friendSnap = await db.ref('users/' + friendUid).once('value');
    if (friendSnap.exists()) {
      const fData = friendSnap.val();
      // تم إزالة شرط الأونلاين من هنا لضمان وصول الإشعار دائماً
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
    // إجبار المتصفح على سحب الصوت الخام لمنع مشاكل جودة البلوتوث
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    audioChunks = [];
    isRecordingCanceled = false;
    mediaRecorder = new MediaRecorder(stream, {
      audioBitsPerSecond: 128000
    });
    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (isRecordingCanceled) {
        showToast('تم رمي التسجيل 🗑️');
        return;
      }
      const blob = new Blob(audioChunks, {
        type: 'audio/webm'
      });
      showToast('جاري الرفع…');
      try {
        const fd = new FormData();
        fd.append('file', blob);
        fd.append('upload_preset', 'malaboushi_preset');
        const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
          method: 'POST',
          body: fd
        });
        const data = await res.json();
        if (data.secure_url) {
          await sendVoiceMsg(data.secure_url, recordDurationStr);
          showToast('طارت الرسالة! 🚀', 'success');
        } else throw new Error('فشل الرفع');
      } catch (e) {
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
    if (currentChat) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).set('recording');
    startRecordTimer();
  } catch (e) {
    showToast('تعذر الوصول للمايكروفون', 'error');
  }
}

function startRecordTimer() {
  const span = document.getElementById('rec-timer-text');
  recordTimerInt = setInterval(() => {
    const sec = Math.floor((Date.now() - recordStart) / 1000);
    const m = Math.floor(sec / 60),
      s = sec % 60;
    recordDurationStr = m + ':' + (s < 10 ? '0' : '') + s;
    if (span) span.textContent = recordDurationStr;
  }, 1000);
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  if (currentChat) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
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
   VOICE PLAYBACK
═══════════════════════════════════ */
let currentAudio = null;
let currentAudioUrl = null;
let audioUpdateInterval = null;

function playVoice(btn, url, msgKey) {
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
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  currentAudio.play();
  startAudioProgress(msgKey);

  currentAudio.onended = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const fill = document.getElementById('progress-' + msgKey);
    if (fill) fill.style.width = '0%';

    // إرجاع الوقت لشكله الطبيعي بعد الانتهاء
    const durEl = document.getElementById('dur-' + msgKey);
    if (durEl) durEl.textContent = durEl.getAttribute('data-orig');

    currentAudio = null;
    currentAudioUrl = null;
    clearInterval(audioUpdateInterval);
  };
}

function startAudioProgress(msgKey) {
  clearInterval(audioUpdateInterval);
  audioUpdateInterval = setInterval(() => {
    if (currentAudio && !currentAudio.paused && currentAudio.duration) {
      let perc = (currentAudio.currentTime / currentAudio.duration) * 100;
      let fill = document.getElementById('progress-' + msgKey);
      if (fill) fill.style.width = perc + '%';

      // تحديث عداد الثواني
      const durEl = document.getElementById('dur-' + msgKey);
      if (durEl) {
        const curSec = Math.floor(currentAudio.currentTime);
        const m = Math.floor(curSec / 60);
        const s = curSec % 60;
        const orig = durEl.getAttribute('data-orig');
        durEl.textContent = `${m}:${s < 10 ? '0' : ''}${s} / ${orig}`;
      }
    }
  }, 100);
}

function seekVoice(event, url, msgKey) {
  if (!currentAudio || currentAudioUrl !== url || !currentAudio.duration) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = rect.right - event.clientX;
  let perc = clickX / rect.width;
  if (perc < 0) perc = 0;
  if (perc > 1) perc = 1;
  currentAudio.currentTime = currentAudio.duration * perc;
  const fill = document.getElementById('progress-' + msgKey);
  if (fill) fill.style.width = (perc * 100) + '%';
}

/* ═══════════════════════════════════
   IMAGE PREVIEW, ZOOM & PAN
═══════════════════════════════════ */
let currentScale = 1;
let imgTx = 0,
  imgTy = 0;
let imgStartX = 0,
  imgStartY = 0;

function previewImg(url) {
  const img = document.getElementById('img-preview-el');
  img.src = url;
  currentScale = 1;
  imgTx = 0;
  imgTy = 0;
  img.style.transform = `translate(0px, 0px) scale(1)`;
  document.getElementById('img-preview-overlay').classList.add('open');
  history.pushState({
    overlay: 'image'
  }, '', '');
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
    currentScale = currentScale === 1 ? 4 : 1; // زوم كبير جداً
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
   FIX: Complete signaling flow + audio
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
      // Only the caller sets up the peer (callee sets up on acceptCall)
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
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
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
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    callIsCaller = false;

    // Update status for both
    await db.ref('calls/' + currentUser.uid).update({
      status: 'answered'
    });
    await db.ref('calls/' + currentCallPeer).update({
      status: 'answered'
    });

    // Callee sets up WebRTC
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

/* ═══════════════════════════════════
   WebRTC Setup
═══════════════════════════════════ */
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
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true
    });
    await peerConnection.setLocalDescription(offer);
    await signalRef.child('offer').set({
      sdp: offer.sdp,
      type: offer.type
    });

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
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {}
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
        await signalRef.child('answer').set({
          sdp: answer.sdp,
          type: answer.type
        });
      } catch (e) {
        console.warn('callee setup:', e);
      }
    });

    signalRef.child('callerCandidates').on('child_added', async snap => {
      const cand = snap.val();
      if (cand && peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {}
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
    const m = Math.floor(sec / 60),
      s = sec % 60;
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
  return new Date(ts).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts),
    now = new Date();
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  const yes = new Date(now);
  yes.setDate(now.getDate() - 1);
  if (d.toDateString() === yes.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', {
    day: '2-digit',
    month: 'short'
  });
}

/* ═══════════════════════════════════
   OFFLINE FIRST
═══════════════════════════════════ */
(function() {
  const cached = localStorage.getItem('myProfile');
  if (cached) {
    try {
      myProfile = JSON.parse(cached);
    } catch (e) {}
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
    currentSearchIndex = chatSearchResults.length - 1; // يبدأ من أحدث رسالة
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
      b.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
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

  // سحب الصورة الخاصة بالصديق من البيانات الموجودة حتى نحفظها بقائمة الأصدقاء
  const friendPhoto = (chatsData && chatsData[chatId] && chatsData[chatId].friendPhoto) ? chatsData[chatId].friendPhoto : '';

  menu.innerHTML += `<button class="msg-menu-btn danger" onclick="removeChatFromList('${chatId}', '${friendUid}', '${escHtml(friendName)}', '${friendPhoto}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5c-1.1 0-2 .9-2 2v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg> حذف من الشاشة الرئيسية</button>`;

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

async function removeChatFromList(chatId, friendUid, friendName, friendPhoto) {
  const ok = await openModal('إخفاء المحادثة', 'سيتم إخفاء المحادثة، ولكن سيبقى الشخص في قائمة الأصدقاء.');
  if (ok) {
    showToast('جاري الإخفاء...');
    try {
      const fName = (friendName && friendName !== 'undefined') ? friendName : 'مستخدم';
      const fPhoto = (friendPhoto && friendPhoto !== 'undefined') ? friendPhoto : '';
      
      // نستخدم update بدلاً من set لتفادي أخطاء الصلاحيات
      await db.ref('friendsList/' + currentUser.uid + '/' + friendUid).update({
        name: fName,
        photo: fPhoto,
        timestamp: Date.now()
      });
      
      // حذف المحادثة من الشاشة الرئيسية
      await db.ref('userChats/' + currentUser.uid + '/' + chatId).remove();
      
      showToast('تم إخفاء المحادثة بنجاح ✔️', 'success');
    } catch (err) {
      console.error(err);
      showToast('حدث خطأ أثناء الإخفاء، حاول مجدداً', 'error');
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
  // إيقاف الاستماع القديم قبل تشغيل الجديد لمنع الرفة نهائياً
  if (friendsListListener) db.ref('friendsList/' + uid).off('value', friendsListListener);
  
  friendsListListener = db.ref('friendsList/' + uid).on('value', async snap => {
    const container = document.getElementById('my-friends-container');
    if (!container) return;

    // 🔥 الحل الجذري: المزامنة الفورية في حال كانت قائمة الأصدقاء فارغة
    if (!snap.exists()) {
      const chatsSnap = await db.ref('userChats/' + uid).once('value');
      let hasOldFriends = false;

      if (chatsSnap.exists()) {
        chatsSnap.forEach(c => {
          const d = c.val();
          if (d.friendUid) {
            // سحب الصديق من المحادثات القديمة وإضافته للقائمة
            db.ref('friendsList/' + uid + '/' + d.friendUid).set({
              name: d.friendName || 'مستخدم',
              photo: d.friendPhoto || '',
              timestamp: d.updatedAt || Date.now()
            });
            hasOldFriends = true;
          }
        });
      }

      // إذا وجدنا أصدقاء قدامى وقمنا بنسخهم، نوقف الدالة هنا 
      // لأن الإضافة لقاعدة البيانات ستجعل الدالة تعمل من جديد تلقائياً وترسم الأصدقاء
      if (hasOldFriends) return;

      container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted);">لا يوجد أصدقاء في القائمة بعد.</div>`;
      return;
    }

    // رسم الأصدقاء في حال كانوا موجودين
    let htmlStr = '';
    snap.forEach(friendSnap => {
      const friendUid = friendSnap.key;
      const fData = friendSnap.val();
      const initials = (fData.name || '?').charAt(0);

      const avatarHtml = fData.photo ?
        `<img src="${fData.photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"/>` :
        initials;

      htmlStr += `
      <div class="search-result-card" style="padding:12px 16px; margin-bottom:8px;">
        <div class="search-result-avatar" style="width:40px;height:40px;font-size:15px; overflow:hidden;">${avatarHtml}</div>
        <div class="search-result-info">
          <div class="search-result-name" style="font-size:16px;margin-bottom:0;">${escHtml(fData.name)}</div>
        </div>
        <button class="btn-primary" style="width:auto;padding:8px 16px;font-size:13px;" onclick="startChat('${friendUid}')">مراسلة</button>
      </div>`;
    });
    
    // خدعة برمجية: لا تقم بتحديث الشاشة إلا إذا كان هناك تغيير حقيقي (يمنع الرفة نهائياً)
    if (container.innerHTML !== htmlStr) {
      container.innerHTML = htmlStr;
    }
  });
}
window.addEventListener('resize', () => {
  if (document.activeElement && document.activeElement.id === 'msg-input') {
    setTimeout(() => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      const area = document.getElementById('messages-area');
      if (area) area.scrollTop = area.scrollHeight;
    }, 100);
  }
});
