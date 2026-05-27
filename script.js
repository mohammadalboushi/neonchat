/* ═════════════════════════════════════════════════════════
   FIREBASE INIT
═════════════════════════════════════════════════════════ */
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

/* ═════════════════════════════════════════════════════════
   APP STATE
═════════════════════════════════════════════════════════ */
let currentUser = null;
let myProfile = null;
let currentChat = null;
let chatsData = {};
let messagesRef = null;
let messagesListener = null;
let chatsListener = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

/* ═════════════════════════════════════════════════════════
   BACKGROUND CANVAS
═════════════════════════════════════════════════════════ */
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

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + .3,
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      a: Math.random() * .6 + .2
    };
  }
  for (let i = 0; i < 60; i++) particles.push(mkParticle());

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,240,255,0.03)';
    ctx.lineWidth = 1;
    const gs = 60;
    for (let x = 0; x < W; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += gs) {
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

/* ═════════════════════════════════════════════════════════
   NAVIGATION
═════════════════════════════════════════════════════════ */
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.screen) {
    renderScreenUI(e.state.screen);
  } else {
    renderScreenUI('home');
    history.pushState({
      screen: 'home'
    }, '', '');
  }
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

/* ═════════════════════════════════════════════════════════
   TOAST & MODAL
═════════════════════════════════════════════════════════ */
let toastTimer;

function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

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

/* ═════════════════════════════════════════════════════════
   AUTH
═════════════════════════════════════════════════════════ */
document.getElementById('btn-google-login').addEventListener('click', () => {
  auth.signInWithPopup(provider).catch(e => showToast('فشل تسجيل الدخول: ' + e.message, 'error'));
});

auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    await ensureUserProfile(user);
    document.getElementById('loader-screen').classList.add('hidden');
    showScreen('home');

    initCallListener(user.uid);
    initFriendRequestsListener(user.uid);

    const myStatusRef = db.ref('users/' + user.uid + '/status');
    db.ref('.info/connected').on('value', snap => {
      if (snap.val() === true) {
        myStatusRef.onDisconnect().set(Date.now()).then(() => {
          myStatusRef.set('online');
        });
      }
    });
  } else {
    currentUser = null;
    myProfile = null;
    db.ref('.info/connected').off();
    if (myCallListener) {
      db.ref('calls/' + currentUser?.uid).off('value', myCallListener);
      myCallListener = null;
    }
    document.getElementById('loader-screen').classList.add('hidden');
    showScreen('login');
  }
});

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

function confirmLogout() {
  openModal('تسجيل الخروج', 'هل أنت متأكد أنك تريد تسجيل الخروج؟').then(ok => {
    if (ok) auth.signOut().then(() => {
      localStorage.removeItem('myProfile');
      showScreen('login');
    });
  });
}

/* ═════════════════════════════════════════════════════════
   PROFILE
═════════════════════════════════════════════════════════ */
function updateHomeHeader() {
  if (!myProfile) return;
  document.getElementById('home-subtitle').textContent = 'مرحباً، ' + (myProfile.name.split(' ')[0]);
  document.getElementById('my-id-badge').textContent = myProfile.uniqueId;
  const av = document.getElementById('home-avatar');
  if (myProfile.photo) {
    av.outerHTML =
      `<img class="home-avatar" src="${myProfile.photo}" onclick="showScreen('profile')" id="home-avatar"/>`;
  } else {
    av.className = 'home-avatar-placeholder';
    av.textContent = myProfile.name.charAt(0);
  }
}

function copyMyId() {
  if (!myProfile) return;
  navigator.clipboard.writeText(myProfile.uniqueId).then(() => showToast('تم نسخ الـ ID: ' + myProfile.uniqueId,
      'success'))
    .catch(() => showToast('رقمك: ' + myProfile.uniqueId));
}

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
      showToast('تم تحديث صورتك الشخصية', 'success');
    } else {
      throw new Error('تعذر الرفع من الخادم');
    }
  } catch (e) {
    showToast('فشل رفع الصورة: ' + e.message, 'error');
  }
});

/* ═════════════════════════════════════════════════════════
   CHATS LIST
═════════════════════════════════════════════════════════ */
let lastUnreads = {};
let isFirstChatsLoad = true;

function loadChats() {
  if (!currentUser) return;
  if (chatsListener) db.ref('userChats/' + currentUser.uid).off('value', chatsListener);
  chatsListener = db.ref('userChats/' + currentUser.uid).orderByChild('updatedAt').on('value', snap => {
    chatsData = {};
    let hasNewMessage = false;
    if (snap.exists()) {
      snap.forEach(c => {
        const d = c.val();
        chatsData[c.key] = d;
        if (!isFirstChatsLoad && d.unread > (lastUnreads[c.key] || 0)) hasNewMessage = true;
        lastUnreads[c.key] = d.unread;
      });
    }
    renderChatsList();

    if (hasNewMessage && !document.getElementById('screen-chat').classList.contains('active')) {
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
      `<img src="${data.friendPhoto}" class="chat-avatar" />` :
      `<div class="chat-avatar">${initials}</div>`;
    const timeStr = data.updatedAt ? formatTime(data.updatedAt) : '';
    const lastMsg = data.lastMsg || 'اضغط لبدء المحادثة';
    div.innerHTML = `
      ${avatarHtml}
      <div class="chat-info">
        <div class="chat-name">${escHtml(data.friendName||'مستخدم')}</div>
        <div class="chat-last-msg">${escHtml(lastMsg)}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">${timeStr}</div>
        ${data.unread>0?`<div class="chat-badge">${data.unread}</div>`:''}
      </div>`;
    div.addEventListener('click', () => openChat(chatId, data.friendUid));
    list.appendChild(div);
  });
}

function filterChats(val) {
  renderChatsList(val);
}

/* ═════════════════════════════════════════════════════════
   ADD FRIEND / SEARCH
═════════════════════════════════════════════════════════ */
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
      showToast('لم يُعثر على مستخدم بهذا الرقم', 'error');
      return;
    }
    const uid = snap.val();
    if (uid === currentUser.uid) {
      showToast('هذا رقمك أنت 😄', 'error');
      return;
    }
    const userSnap = await db.ref('users/' + uid).once('value');
    const friend = userSnap.val();
    renderSearchResult(friend, uid);
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
    showToast('فشل إرسال الطلب: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'إرسال طلب';
  }
}

let friendRequestsListener = null;

function initFriendRequestsListener(uid) {
  if (friendRequestsListener) db.ref('friendRequests/' + uid).off('value', friendRequestsListener);

  friendRequestsListener = db.ref('friendRequests/' + uid).on('value', snap => {
    const list = document.getElementById('friend-requests-list');
    const badge = document.getElementById('home-req-badge');

    if (!snap.exists()) {
      if (badge) badge.style.display = 'none';
      if (list) list.innerHTML =
        '<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:10px;">لا توجد طلبات واردة</div>';
      return;
    }

    let count = 0;
    let htmlStr = '';

    snap.forEach(reqSnap => {
      count++;
      const req = reqSnap.val();
      const initials = (req.name || '?').charAt(0);
      htmlStr += `
        <div class="search-result-card" style="padding: 12px 16px;">
          <div class="search-result-avatar" style="width:40px; height:40px; font-size:15px;">${initials}</div>
          <div class="search-result-info">
            <div class="search-result-name" style="font-size:14px; margin-bottom:0;">${escHtml(req.name)}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-primary" style="width:auto; padding:6px 12px; font-size:12px; background:var(--neon-green); box-shadow:none;" onclick="acceptFriendRequest('${req.uid}')">موافقة</button>
            <button class="btn-danger" style="width:auto; padding:6px 12px; font-size:12px;" onclick="rejectFriendRequest('${req.uid}')">رفض</button>
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
    showToast('تم قبول الطلب وبدء المحادثة بنجاح!', 'success');
  } catch (e) {
    showToast('حدث خطأ: ' + e.message, 'error');
  }
}

async function rejectFriendRequest(friendUid) {
  try {
    await db.ref('friendRequests/' + currentUser.uid + '/' + friendUid).remove();
    showToast('تم رفض طلب الصداقة');
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
    lastMsg: 'تم قبول طلب الصداقة، ابدأ المحادثة الآن!',
    unread: 0
  });
  await db.ref('userChats/' + friendUid + '/' + chatId).update({
    friendUid: currentUser.uid,
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || '',
    updatedAt: Date.now(),
    lastMsg: 'تم قبول طلب الصداقة، ابدأ المحادثة الآن!',
    unread: 0
  });
}

/* ═════════════════════════════════════════════════════════
   OPEN CHAT
═════════════════════════════════════════════════════════ */
let friendStatusListener = null;
let friendStatusRef = null;
let typingRef = null;
let typingListener = null;
let baseStatusText = 'غير متصل';
let baseStatusColor = 'var(--text-secondary)';

async function openChat(chatId, friendUid, friendProfile = null) {
  cancelReply();

  if (!friendProfile) {
    const snap = await db.ref('users/' + friendUid).once('value');
    friendProfile = snap.val();
  }

  // حماية الكود من التوقف إذا لم يتم العثور على بيانات الصديق
  if (!friendProfile) {
    friendProfile = {
      name: 'مستخدم غير معروف',
      photo: ''
    };
  }

  currentChat = {
    chatId,
    friendUid,
    friendProfile
  };
  document.getElementById('chat-header-name').textContent = friendProfile.name || 'مستخدم';

  const avatarEl = document.getElementById('chat-header-avatar');
  if (friendProfile.photo) {
    avatarEl.outerHTML =
      `<img src="${friendProfile.photo}" class="chat-header-avatar" id="chat-header-avatar" />`;
  } else {
    avatarEl.outerHTML =
      `<div class="chat-header-avatar" id="chat-header-avatar">${(friendProfile.name||'?').charAt(0)}</div>`;
  }

  db.ref('userChats/' + currentUser.uid + '/' + chatId + '/unread').set(0);

  const statusEl = document.getElementById('chat-header-status');
  statusEl.textContent = 'جاري التحقق...';
  statusEl.style.color = 'var(--text-muted)';

  if (friendStatusRef && friendStatusListener) friendStatusRef.off('value', friendStatusListener);
  friendStatusRef = db.ref('users/' + friendUid + '/status');
  friendStatusListener = friendStatusRef.on('value', snap => {
    const status = snap.val();
    if (status === 'online') {
      baseStatusText = '🟢 متصل الآن';
      baseStatusColor = 'var(--neon-green)';
    } else if (status) {
      const d = new Date(status);
      const today = new Date();
      let prefix = '';
      if (d.toDateString() === today.toDateString()) prefix = 'اليوم';
      else {
        const yes = new Date(today);
        yes.setDate(today.getDate() - 1);
        if (d.toDateString() === yes.toDateString()) prefix = 'أمس';
        else prefix = d.toLocaleDateString('ar-EG', {
          day: '2-digit',
          month: 'short'
        });
      }
      baseStatusText = '🔴 آخر ظهور: ' + prefix + ' ' + formatTime(status);
      baseStatusColor = 'var(--text-secondary)';
    } else {
      baseStatusText = '🔴 غير متصل';
      baseStatusColor = 'var(--text-secondary)';
    }

    // التحقق من حالة الكتابة لعدم الكتابة فوقها
    if (typingRef) {
      typingRef.once('value').then(tSnap => {
        if (!tSnap.exists()) {
          const el = document.getElementById('chat-header-status');
          if (el) {
            el.textContent = baseStatusText;
            el.style.color = baseStatusColor;
          }
        }
      });
    } else {
      const el = document.getElementById('chat-header-status');
      if (el) {
        el.textContent = baseStatusText;
        el.style.color = baseStatusColor;
      }
    }
  });

  if (typingRef && typingListener) typingRef.off('value', typingListener);
  typingRef = db.ref('chats/' + chatId + '/typing/' + friendUid);
  typingListener = typingRef.on('value', snap => {
    const state = snap.val();
    const el = document.getElementById('chat-header-status');
    if (!el) return;
    if (state === 'typing') {
      el.textContent = '✍️ يكتب الآن...';
      el.style.color = 'var(--neon-cyan)';
    } else if (state === 'recording') {
      el.textContent = '🎙️ يسجل مقطع صوتي...';
      el.style.color = 'var(--neon-pink)';
    } else {
      el.textContent = baseStatusText;
      el.style.color = baseStatusColor;
    }
  });

  showScreen('chat');
  attachMessages(chatId);
}

function detachMessages() {
  if (messagesRef && messagesListener) {
    messagesRef.off('child_added', messagesListener);
    messagesRef.off('child_changed');
    messagesListener = null;
  }
  if (friendStatusRef && friendStatusListener) {
    friendStatusRef.off('value', friendStatusListener);
    friendStatusListener = null;
  }
  if (typingRef && typingListener) {
    typingRef.off('value', typingListener);
    typingListener = null;
  }
}

function createBubbleEffect() {
  for (let i = 0; i < 8; i++) {
    const bubble = document.createElement('div');
    bubble.style.cssText =
      `position:fixed; bottom:80px; left:${Math.random()*100}%; width:15px; height:15px; background:var(--neon-cyan); border-radius:50%; box-shadow:0 0 10px var(--neon-cyan); opacity:0.8; z-index:999; pointer-events:none; transition: all 2s ease-out; transform: translateY(0) scale(1);`;
    document.body.appendChild(bubble);
    setTimeout(() => {
      bubble.style.transform = `translateY(-${Math.random()*200+100}px) scale(0)`;
      bubble.style.opacity = '0';
    }, 50);
    setTimeout(() => bubble.remove(), 2000);
  }
}

function attachMessages(chatId) {
  detachMessages();
  const area = document.getElementById('messages-area');
  area.innerHTML = '';
  lastMsgDate = '';

  db.ref('userChats/' + currentChat.friendUid + '/' + chatId).update({
    friendName: myProfile.name,
    friendPhoto: myProfile.photo || ''
  });

  messagesRef = db.ref('chats/' + chatId + '/messages');

  messagesListener = messagesRef.orderByChild('timestamp').on('child_added', snap => {
    const msg = snap.val();
    msg.key = snap.key;

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

    if (msg.senderUid !== currentUser.uid && !msg.read) snap.ref.update({
      read: true
    });
  });

  // تم التعديل هنا: عند حدوث أي تغيير (تعديل، حذف، تفاعل، قراءة) سيتم استبدال سطر الرسالة بالكامل في الواجهة مباشرة
  messagesRef.on('child_changed', snap => {
    const msg = snap.val();
    msg.key = snap.key;

    const oldRow = document.getElementById('row-' + msg.key);
    if (oldRow) {
      const newRow = buildMsgEl(msg);
      oldRow.replaceWith(newRow);
    }
  });
}

function buildMsgEl(msg) {
  if (msg.isDeleted) {
    const delRow = document.createElement('div');
    delRow.id = 'row-' + msg.key; // إضافة ID لسطر الرسالة المحذوفة
    const delIsOut = msg.senderUid === currentUser.uid;
    delRow.className = 'msg-row ' + (delIsOut ? 'out' : 'in');
    delRow.innerHTML =
      `<div class="msg-bubble" style="background:transparent; border:1px solid var(--border-subtle); color:var(--text-muted); font-style:italic; font-size:12px;">🚫 تم حذف هذه الرسالة</div>`;
    return delRow;
  }

  const row = document.createElement('div');
  row.id = 'row-' + msg.key; // إضافة ID لسطر الرسالة العادية ليتم استبداله عند التعديل
  const isOut = msg.senderUid === currentUser.uid;
  row.className = 'msg-row ' + (isOut ? 'out' : 'in');

  let avatarNode = null;
  if (!isOut) {
    const fProfile = currentChat.friendProfile || {};
    const fPhoto = fProfile.photo;
    const fChar = (fProfile.name || '?').charAt(0);
    if (fPhoto) {
      avatarNode = document.createElement('img');
      avatarNode.src = fPhoto;
      avatarNode.className = 'msg-friend-avatar';
    } else {
      avatarNode = document.createElement('div');
      avatarNode.className = 'msg-friend-avatar';
      avatarNode.textContent = fChar;
    }
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.id = 'msg-' + msg.key;

  let lastTap = 0;
  let pressTimer;
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let isVerticalScroll = false;

  const handleTouchStart = (e) => {
    touchStartX = e.touches ? e.touches[0].clientX : e.clientX;
    touchStartY = e.touches ? e.touches[0].clientY : e.clientY;
    isSwiping = false;
    isVerticalScroll = false;

    bubble.style.transform = 'scale(0.98)';
    bubble.style.transition = 'transform 0.2s';

    pressTimer = setTimeout(() => {
      if (!isSwiping && !isVerticalScroll) {
        bubble.style.transform = 'scale(1)';
        openMsgMenu(msg, isOut);
      }
    }, 500);
  };

  const handleTouchMove = (e) => {
    if (!touchStartX || !touchStartY) return;

    const currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;

    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    // منع السحب إذا كان المستخدم يمرر المحادثة للأعلى أو الأسفل
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      isVerticalScroll = true;
      clearTimeout(pressTimer);
      bubble.style.transform = 'scale(1)';
      return;
    }

    // تفعيل السحب الأفقي للرد
    if (Math.abs(diffX) > 15 && !isVerticalScroll) {
      isSwiping = true;
      clearTimeout(pressTimer);

      let limitDist = Math.min(Math.abs(diffX), 70);
      let sign = diffX > 0 ? 1 : -1;

      if ((isOut && diffX < 0) || (!isOut && diffX > 0)) {
        bubble.style.transform = `translateX(${limitDist * sign}px)`;
      }
    }
  };

  const handleTouchEnd = (e) => {
    clearTimeout(pressTimer);
    bubble.style.transform = 'scale(1)';

    if (!isSwiping && !isVerticalScroll) {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 300 && tapLength > 0) {
        toggleReaction(msg.key);
        if (e.cancelable) e.preventDefault();
      }
      lastTap = currentTime;
    }

    if (isSwiping) {
      const touchEndX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const diffX = touchStartX - touchEndX;

      if (isOut && diffX > 40) {
        prepareReply(msg);
        if (navigator.vibrate) navigator.vibrate(50);
      }
      if (!isOut && diffX < -40) {
        prepareReply(msg);
        if (navigator.vibrate) navigator.vibrate(50);
      }
    }

    touchStartX = 0;
    touchStartY = 0;
  };

  bubble.addEventListener('touchstart', handleTouchStart, {
    passive: true
  });
  bubble.addEventListener('touchmove', handleTouchMove, {
    passive: true
  });
  bubble.addEventListener('touchend', handleTouchEnd);

  bubble.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    openMsgMenu(msg, isOut);
  });
  bubble.addEventListener('dblclick', function() {
    toggleReaction(msg.key);
  });

  const reactionHtml =
    `<div id="react-${msg.key}" class="msg-reaction" style="display:${msg.reaction ? 'flex' : 'none'}">${msg.reaction || ''}</div>`;

  let ticks = '';
  if (isOut) {
    const color = msg.read ? 'var(--neon-cyan)' : 'var(--text-muted)';
    const svgContent = msg.read ?
      '<polyline points="24 6 13 17 8 12"></polyline><polyline points="20 6 9 17 4 12"></polyline>' :
      '<polyline points="20 6 9 17 4 12"></polyline>';
    ticks =
      `<svg id="ticks-${msg.key}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" style="margin-left:4px; margin-bottom:-2px;">${svgContent}</svg>`;
  }

  const timeEl =
    `<div class="msg-time" style="display:flex; align-items:center; gap:4px;">${msg.isEdited ? '<span style="font-size:10px; opacity:0.7;">(معدلة)</span>' : ''} ${ticks}${formatTime(msg.timestamp)}</div>`;

  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml =
      `<div class="reply-badge" style="font-size:11px; color:var(--neon-cyan); margin-bottom:2px;">رد على رسالة</div><div style="background:rgba(0,0,0,0.2); padding:6px; border-radius:6px; margin-bottom:6px; border-right:2px solid var(--neon-cyan); font-size:12px; opacity:0.8; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${escHtml(msg.replyTo.text)}</div>`;
  }

  if (msg.type === 'text') {
    bubble.innerHTML = `${replyHtml}<div>${escHtml(msg.text)}</div>${timeEl}`;
  } else if (msg.type === 'image') {
    bubble.innerHTML =
      `${replyHtml}<img class="msg-img" src="${msg.url}" onload="document.getElementById('messages-area').scrollTop = document.getElementById('messages-area').scrollHeight" onclick="previewImg('${msg.url}')"/>${timeEl}`;
  } else if (msg.type === 'voice') {
    const bars = Array.from({
      length: 20
    }, () => `<div class="voice-bar" style="height:${Math.floor(Math.random() * 70) + 20}%"></div>`).join('');
    bubble.innerHTML =
      `${replyHtml}<div class="voice-msg"><button class="voice-play-btn" onclick="playVoice(this,'${msg.url}', '${msg.key}')"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button><div class="voice-waveform" style="position:relative; cursor:pointer;" onclick="seekVoice(event, '${msg.url}', '${msg.key}')">${bars}<div id="progress-${msg.key}" class="voice-progress-fill" style="position:absolute; right:0; top:0; bottom:0; width:0%; background:rgba(0,240,255,0.4); pointer-events:none; z-index:1; border-radius:2px; transition: width 0.1s linear;"></div></div><span class="voice-duration">${msg.duration || '0:00'}</span></div>${timeEl}`;
  }

  bubble.innerHTML += reactionHtml;

  if (!isOut && avatarNode) row.appendChild(avatarNode);
  row.appendChild(bubble);

  return row;
}

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

/* ═════════════════════════════════════════════════════════
   MSG CONTEXT MENU & ACTIONS
═════════════════════════════════════════════════════════ */
let replyingToMsg = null;
let editingMsgKey = null;

function openMsgMenu(msg, isOut) {
  const menu = document.getElementById('msg-menu');
  menu.innerHTML = '';

  menu.innerHTML +=
    `<button class="msg-menu-btn" onclick="prepareReply(${JSON.stringify(msg).replace(/"/g, '&quot;')}); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg> رد</button>`;

  if (msg.type === 'text') {
    menu.innerHTML +=
      `<button class="msg-menu-btn" onclick="copyMsgText('${msg.text.replace(/'/g, "\\'")}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> نسخ النص</button>`;
  }

  if (isOut) {
    if (msg.type === 'text') {
      menu.innerHTML +=
        `<button class="msg-menu-btn" onclick="prepareEdit('${msg.key}', '${msg.text.replace(/'/g, "\\'")}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> تعديل</button>`;
    }
    menu.innerHTML +=
      `<button class="msg-menu-btn danger" onclick="confirmDeleteMsg('${msg.key}'); closeMsgMenu();"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg> حذف الرسالة</button>`;
  }

  document.getElementById('msg-menu-overlay').classList.add('open');
  if (navigator.vibrate) navigator.vibrate(50);
}

function closeMsgMenu() {
  document.getElementById('msg-menu-overlay').classList.remove('open');
}

function copyMsgText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('تم نسخ النص', 'success'));
}

function prepareReply(msg) {
  replyingToMsg = msg;
  editingMsgKey = null;
  const pre = document.getElementById('msg-reply-preview');
  pre.style.display = 'flex';
  pre.classList.add('active');
  let txt = msg.type === 'text' ? msg.text : msg.type === 'image' ? '📷 صورة' : '🎙️ مقطع صوتي';
  document.getElementById('msg-reply-text').textContent = "رد على: " + txt;
  document.getElementById('msg-input').focus();
}

function cancelReply() {
  replyingToMsg = null;
  const pre = document.getElementById('msg-reply-preview');
  if (pre) {
    pre.classList.remove('active');
    pre.style.display = 'none';
  }
}

function prepareEdit(msgKey, oldText) {
  editingMsgKey = msgKey;
  cancelReply();
  const inp = document.getElementById('msg-input');
  inp.value = oldText;
  inp.focus();
  showToast('وضع التعديل مفعل', 'info');
}

function confirmDeleteMsg(msgKey) {
  openModal('حذف الرسالة', 'هل تريد حذف هذه الرسالة من الجميع؟').then(ok => {
    if (ok) {
      if (!currentChat) return;
      db.ref('chats/' + currentChat.chatId + '/messages/' + msgKey).update({
          isDeleted: true,
          text: null,
          url: null,
          type: 'deleted'
        })
        .then(() => {
          // جلب آخر رسالة لتحديث القائمة الخارجية
          db.ref('chats/' + currentChat.chatId + '/messages').orderByChild('timestamp').limitToLast(1).once(
            'value', snap => {
              if (snap.exists()) {
                snap.forEach(child => {
                  const m = child.val();
                  let text = m.isDeleted ? '🚫 رسالة محذوفة' : (m.type === 'text' ? m.text : m
                    .type === 'image' ? '📷 صورة' : '🎙️ مقطع صوتي');
                  const updates = {};
                  updates[`userChats/${currentUser.uid}/${currentChat.chatId}/lastMsg`] = text;
                  updates[`userChats/${currentChat.friendUid}/${currentChat.chatId}/lastMsg`] = text;
                  db.ref().update(updates);
                });
              }
            });
          showToast('تم حذف الرسالة', 'success');
        });
    }
  });
}

/* ═════════════════════════════════════════════════════════
   SEND MESSAGES
═════════════════════════════════════════════════════════ */
let typingTimeout = null;

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMsg();
  }

  if (currentChat && !isRecording) {
    db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).set('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
    }, 1500);
  }
}

async function sendTextMsg() {
  if (currentChat) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).remove();
  const inp = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text || !currentChat) return;

  inp.value = '';
  autoResize(inp);
  inp.focus();

  if (editingMsgKey) {
    await db.ref('chats/' + currentChat.chatId + '/messages/' + editingMsgKey).update({
      text: text,
      isEdited: true
    });

    // تحديث القائمة الخارجية إذا كانت الرسالة المعدلة هي الأخيرة
    db.ref('chats/' + currentChat.chatId + '/messages').orderByChild('timestamp').limitToLast(1).once('value',
      snap => {
        if (snap.exists()) {
          snap.forEach(child => {
            if (child.key === editingMsgKey) {
              const updates = {};
              updates[`userChats/${currentUser.uid}/${currentChat.chatId}/lastMsg`] = text;
              updates[`userChats/${currentChat.friendUid}/${currentChat.chatId}/lastMsg`] = text;
              db.ref().update(updates);
            }
          });
        }
      });

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
    text: text,
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
  const updates = {
    [`userChats/${currentUser.uid}/${chatId}/lastMsg`]: lastMsg,
    [`userChats/${currentUser.uid}/${chatId}/updatedAt`]: msg.timestamp,
    [`userChats/${friendUid}/${chatId}/lastMsg`]: lastMsg,
    [`userChats/${friendUid}/${chatId}/updatedAt`]: msg.timestamp,
  };
  await db.ref().update(updates);
  db.ref(`userChats/${friendUid}/${chatId}/unread`).transaction(v => (v || 0) + 1);
}

/* ═════════════════════════════════════════════════════════
   IMAGE UPLOAD
═════════════════════════════════════════════════════════ */
document.getElementById('file-img-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentChat) return;
  e.target.value = '';
  showToast('جاري رفع الصورة…');
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
      await sendImageMsg(data.secure_url);
      showToast('تم إرسال الصورة', 'success');
    } else {
      throw new Error('تعذر الرفع من الخادم');
    }
  } catch (e) {
    showToast('فشل رفع الصورة: ' + e.message, 'error');
  }
});

/* ═════════════════════════════════════════════════════════
   VOICE RECORDING
═════════════════════════════════════════════════════════ */
let isRecordingCanceled = false;

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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
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
        showToast('تم رمي التسجيل بالسلة 🗑️');
        return;
      }

      const blob = new Blob(audioChunks, {
        type: 'audio/webm'
      });
      showToast('جاري الرفع بلمح البصر…');
      try {
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', 'malaboushi_preset');

        const res = await fetch('https://api.cloudinary.com/v1_1/dwqdzwgms/auto/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (data.secure_url) {
          await sendVoiceMsg(data.secure_url, recordDurationStr);
          showToast('طارت الرسالة! 🚀', 'success');
        } else {
          throw new Error('تعذر الرفع من الخادم');
        }
      } catch (e) {
        showToast('فشل الإرسال: ' + e.message, 'error');
      }
    };
    mediaRecorder.start(200);
    isRecording = true;
    recordStart = Date.now();

    document.getElementById('btn-voice').classList.add('recording');
    document.getElementById('msg-input-wrap').style.display = 'none';
    document.getElementById('btn-attach').style.display = 'none';
    document.getElementById('btn-cancel-voice').style.display = 'flex';
    document.getElementById('recording-indicator').style.display = 'block';
    if (currentChat) db.ref('chats/' + currentChat.chatId + '/typing/' + currentUser.uid).set('recording');

    startRecordTimer();
  } catch (e) {
    showToast('تعذر الوصول للمايكروفون', 'error');
  }
}

let recordStart = 0,
  recordTimerInt = null,
  recordDurationStr = '0:00';

function startRecordTimer() {
  const indSpan = document.querySelector('#recording-indicator span');
  recordTimerInt = setInterval(() => {
    const sec = Math.floor((Date.now() - recordStart) / 1000);
    const m = Math.floor(sec / 60),
      s = sec % 60;
    recordDurationStr = m + ':' + (s < 10 ? '0' : '') + s;
    if (indSpan) indSpan.textContent = recordDurationStr;
  }, 1000);
}

function stopRecording() {
  if (mediaRecorder) mediaRecorder.stop();
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

/* ═════════════════════════════════════════════════════════
   VOICE PLAYBACK
═════════════════════════════════════════════════════════ */
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
      btn.innerHTML =
        `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      startAudioProgress(msgKey);
      return;
    }
  }

  if (currentAudio) {
    currentAudio.pause();
    document.querySelectorAll('.voice-play-btn').forEach(b => b.innerHTML =
      `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`);
    document.querySelectorAll('.voice-progress-fill').forEach(f => f.style.width = '0%');
    clearInterval(audioUpdateInterval);
  }

  currentAudioUrl = url;
  currentAudio = new Audio(url);
  btn.innerHTML =
    `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  currentAudio.play();
  startAudioProgress(msgKey);

  currentAudio.onended = () => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    const fill = document.getElementById('progress-' + msgKey);
    if (fill) fill.style.width = '0%';
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
    }
  }, 100);
}

function seekVoice(event, url, msgKey) {
  if (!currentAudio || currentAudioUrl !== url || !currentAudio.duration) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const clickX = rect.right - event.clientX; // حسبة متوافقة مع اتجاه الـ RTL
  let perc = clickX / rect.width;
  if (perc < 0) perc = 0;
  if (perc > 1) perc = 1;
  currentAudio.currentTime = currentAudio.duration * perc;
  const fill = document.getElementById('progress-' + msgKey);
  if (fill) fill.style.width = (perc * 100) + '%';
}

/* ═════════════════════════════════════════════════════════
   IMAGE PREVIEW
═════════════════════════════════════════════════════════ */
function previewImg(url) {
  document.getElementById('img-preview-el').src = url;
  document.getElementById('img-preview-overlay').classList.add('open');
}

/* ═════════════════════════════════════════════════════════
   AUTO-RESIZE TEXTAREA
═════════════════════════════════════════════════════════ */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

/* ═════════════════════════════════════════════════════════
   UTILS
═════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'اليوم';
  const yes = new Date(now);
  yes.setDate(now.getDate() - 1);
  if (d.toDateString() === yes.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', {
    day: '2-digit',
    month: 'short'
  });
}

/* ═════════════════════════════════════════════════════════
   OFFLINE FIRST
═════════════════════════════════════════════════════════ */
(function loadCachedProfile() {
  const cached = localStorage.getItem('myProfile');
  if (cached) {
    try {
      myProfile = JSON.parse(cached);
    } catch (e) {}
  }
})();

/* ═════════════════════════════════════════════════════════
   CALL SYSTEM & WebRTC
═════════════════════════════════════════════════════════ */
let myCallListener = null;
let currentCallPeer = null;
let callDurationInt = null;
let callStartTime = 0;

let localStream = null;
let peerConnection = null;
let audioRemote = null;

const rtcConfig = {
  iceServers: [{
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    }
  ]
};

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
      document.getElementById('call-status-view').textContent = 'يتصل بك...';
      document.getElementById('btn-accept-call').style.display = 'flex';
      if (navigator.vibrate) navigator.vibrate([500, 500, 500, 500]);
      renderScreenUI('call');
    } else if (data.status === 'answered') {
      document.getElementById('btn-accept-call').style.display = 'none';
      startCallTimer();
      if (data.role === 'caller' && !peerConnection) {
        setupWebRTCPeer(true);
      }
    }
  });
}

async function startCall() {
  if (!currentChat) return;
  currentCallPeer = currentChat.friendUid;
  document.getElementById('call-name-view').textContent = currentChat.friendProfile.name;
  document.getElementById('call-avatar-view').textContent = currentChat.friendProfile.name.charAt(0);
  document.getElementById('call-status-view').textContent = 'جاري الاتصال وفتح المايكروفون...';
  document.getElementById('btn-accept-call').style.display = 'none';

  renderScreenUI('call');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    document.getElementById('call-status-view').textContent = 'جاري الاتصال...';

    db.ref('calls/' + currentUser.uid).set({
      status: 'calling',
      role: 'caller',
      peerUid: currentCallPeer,
      peerName: currentChat.friendProfile.name
    });
    db.ref('calls/' + currentCallPeer).set({
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
  document.getElementById('call-status-view').textContent = 'جاري فتح المايكروفون للرد...';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    await db.ref('calls/' + currentUser.uid).update({
      status: 'answered'
    });
    await db.ref('calls/' + currentCallPeer).update({
      status: 'answered'
    });

    setupWebRTCPeer(false);
  } catch (e) {
    showToast('لا يمكن الرد بدون صلاحية المايكروفون', 'error');
    endCall();
  }
}

function endCall() {
  if (currentCallPeer) {
    db.ref('chats/' + [currentUser.uid, currentCallPeer].sort().join('_') + '/webrtc').remove();
    db.ref('calls/' + currentCallPeer).remove();
    db.ref('calls/' + currentUser.uid).remove();
  }
  closeCallUI();
}

function closeCallUI() {
  clearInterval(callDurationInt);

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
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
  const chatId = [currentUser.uid, currentCallPeer].sort().join('_');
  const signalRef = db.ref('chats/' + chatId + '/webrtc');

  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (event) => {
    const remoteAudio = document.getElementById('remote-audio-el');
    if (remoteAudio && event.streams && event.streams[0]) {
      remoteAudio.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      signalRef.child(isCaller ? 'callerCandidates' : 'calleeCandidates').push(event.candidate.toJSON());
    }
  };

  if (isCaller) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await signalRef.child('offer').set({
      sdp: offer.sdp,
      type: offer.type
    });

    signalRef.child('answer').on('value', async snap => {
      const answer = snap.val();
      if (answer && peerConnection.signalingState !== 'stable') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    signalRef.child('calleeCandidates').on('child_added', async snap => {
      const cand = snap.val();
      if (cand) await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
    });

  } else {
    signalRef.child('offer').once('value', async snap => {
      const offer = snap.val();
      if (offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await signalRef.child('answer').set({
          sdp: answer.sdp,
          type: answer.type
        });
      }
    });

    signalRef.child('callerCandidates').on('child_added', async snap => {
      const cand = snap.val();
      if (cand) await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
    });
  }
}

function startCallTimer() {
  clearInterval(callDurationInt);
  callStartTime = Date.now();
  document.getElementById('call-status-view').style.color = 'var(--neon-green)';
  callDurationInt = setInterval(() => {
    const sec = Math.floor((Date.now() - callStartTime) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    document.getElementById('call-status-view').textContent = `في مكالمة: ${m}:${s<10?'0':''}${s}`;
  }, 1000);
}