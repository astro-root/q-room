let auth = null;
let currentUser = null;
let currentUserProfile = null;
let notifRef = null, notifCb = null;
let friendReqListenerRef = null;
let accountProfileCache = {};
let _notifOpen = false;
let unreadNotifCount = 0;

const ICON_LIST = ['🎮','🏆','⭐','🔥','🎯','💎','🌟','👑','🚀','🎲','🧠','⚡','🌈','🦁','🐯','🦊','🐺','🦋','🌸','🍀','🎪','🎨','🎭','🎬','🎤','🏅','🥇','🎁','🌙','☀️','🍝'];

function initAccountSystem() {
  try {
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if(!db) db = firebase.database();
    if(!auth) auth = firebase.auth();
  } catch(e) {}

  auth.onAuthStateChanged(async user => {
    currentUser = user;
    if(user) {
      const snap = await db.ref(`users/${user.uid}`).once('value');
      currentUserProfile = snap.val();
      updateAccountBar(true);
      const nameInput = document.getElementById('in-name');
      if(nameInput && currentUserProfile && currentUserProfile.name) {
        nameInput.value = currentUserProfile.name;
      }
      if(rId) {
        listenNotifications();
        const bellBtn = document.getElementById('notif-bell-btn');
        if(bellBtn) bellBtn.style.display = '';
        const invSec = document.getElementById('invite-friend-section');
        if(invSec) invSec.style.display = '';
      }
      if(roomData && roomData.players) prefetchAccountProfiles(roomData.players);
      initTopNotifCenter(user);
      initOneSignalPush(user);
      // account画面が開いていれば更新
      const acctScreen = document.getElementById('screen-account');
      if(acctScreen && acctScreen.classList.contains('active')) renderAccountPage();
    } else {
      currentUserProfile = null;
      updateAccountBar(false);
      stopNotifListener();
      hideTopNotifCenter();
    }
  });
}

function updateAccountBar(loggedIn) {
  updateHeroAccountBtn();
}

function updateHeroAccountBtn() {
  const btn = document.getElementById('hero-account-btn');
  const iconEl = document.getElementById('hero-account-icon');
  const bellBtn = document.getElementById('top-bell-btn');
  if(!btn || !iconEl) return;
  if(currentUser && currentUserProfile) {
    btn.classList.add('logged-in');
    if(currentUserProfile.iconUrl) {
      iconEl.innerHTML = `<img src="${currentUserProfile.iconUrl}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">`;
    } else {
      iconEl.innerHTML = '';
      iconEl.textContent = currentUserProfile.icon || '👤';
    }
    if(bellBtn) bellBtn.style.display = '';
  } else {
    btn.classList.remove('logged-in');
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    if(bellBtn) bellBtn.style.display = 'none';
  }
}

function handleHeroAccountBtn() {
  if(currentUser) { toggleTopNotifDrawer(); } else { showAccountPage(); }
}

let _topNotifDrawerOpen = false;
function toggleTopNotifDrawer() {
  const drawer = document.getElementById('top-notif-drawer');
  const overlay = document.getElementById('top-notif-overlay');
  if(!drawer || !overlay) return;
  _topNotifDrawerOpen = !_topNotifDrawerOpen;
  drawer.classList.toggle('open', _topNotifDrawerOpen);
  overlay.classList.toggle('show', _topNotifDrawerOpen);
  if(_topNotifDrawerOpen) loadTopNotifDrawer();
}

function loadTopNotifDrawer() {
  console.log('[loadTopNotifDrawer] _latestNotifItems.length=' + _latestNotifItems.length);
  renderTopNotifDrawer(_latestNotifItems);
  renderAccountNotifList(_latestNotifItems);
}

function renderTopNotifDrawer(items) {
  const listEl = document.getElementById('top-notif-drawer-list');
  if(!listEl) return;
  if(!items || !items.length) {
    listEl.innerHTML = '<div class="notif-empty">通知はありません</div>';
    return;
  }
  const typeIcon = { invite:'🎮', roomInvite:'🎮', friendReq:'👥', friendRequest:'👥', friendAccepted:'✅', friendRoom:'🚀', devAnnounce:'📢' };
  listEl.innerHTML = items.map(n => {
    const ts = n.ts ? formatNotifTs(n.ts) : '';
    const icon = typeIcon[n.type] || '🔔';
    let actionBtn = '';
    if((n.type==='roomInvite'||n.type==='invite'||n.type==='friendRoom') && n.roomId && !n.read) {
      actionBtn = `<div class="notif-actions"><button class="notif-action-btn" onclick="joinFromTopDrawer('${n.id}','${n.roomId}')">▶ 部屋に入る</button></div>`;
    }
    if((n.type==='friendRequest'||n.type==='friendReq') && n.fromUid && !n.read) {
      actionBtn = `<div class="notif-actions">
        <button class="notif-action-btn" onclick="acceptFriendFromNotif('${n.id}','${n.fromUid}')">✓ 承認</button>
        <button class="notif-action-btn notif-action-btn-decline" onclick="declineFriendFromNotif('${n.id}','${n.fromUid}')">✕ 拒否</button>
      </div>`;
    }
    return `<div class="notif-item ${n.read?'':'unread'}" onclick="topNotifMarkRead('${n.id}');this.classList.remove('unread')">
      <div class="notif-item-icon">${icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${esc(n.title||'')}</div>
        <div class="notif-item-text">${esc(n.body||'')}</div>
        ${actionBtn}
      </div>
      <div class="notif-item-ts">${ts}</div>
      <button class="notif-delete-btn" onclick="deleteNotif('${n.id}',event)" title="削除">✕</button>
    </div>`;
  }).join('');
}

async function joinFromTopDrawer(notifId, roomId) {
  await topNotifMarkRead(notifId);
  toggleTopNotifDrawer();
  document.getElementById('in-room').value = roomId;
  toast(`ルームID ${roomId} をセットしました`);
}

function showAccountPage() {
  show('account');
  renderAccountPage();
}

async function renderAccountPage() {
  const guestSec = document.getElementById('acct-guest-section');
  const userSec = document.getElementById('acct-user-section');
  if(!guestSec || !userSec) return;
  if(currentUser && currentUserProfile) {
    guestSec.style.display = 'none';
    userSec.style.display = '';
    // アイコン表示
    _selectedIcon = currentUserProfile.icon || '🎮';
    const disp = document.getElementById('profile-icon-display');
    if(disp) {
      if(currentUserProfile.iconUrl) {
        disp.innerHTML = `<img src="${currentUserProfile.iconUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        disp.innerHTML = '';
        disp.textContent = _selectedIcon;
      }
    }
    const resetBtn = document.getElementById('btn-reset-icon');
    if(resetBtn) resetBtn.style.display = currentUserProfile.iconUrl ? '' : 'none';
    document.getElementById('profile-uid-display').textContent = currentUserProfile.displayId || '—';
    document.getElementById('profile-email-display').textContent = currentUser.email || '—';
    document.getElementById('profile-name-input').value = currentUserProfile.name || '';
    document.getElementById('profile-title-input').value = currentUserProfile.title || '';
    document.getElementById('icon-picker').style.display = 'none';
    document.getElementById('icon-crop-wrap').style.display = 'none';
    ['uid-change-err','email-change-err','pw-change-err'].forEach(id => {
      const el = document.getElementById(id); if(el) el.style.display = 'none';
    });
    document.getElementById('new-uid-input').value = '';
    document.getElementById('new-email-input').value = '';
    document.getElementById('reauth-pw-email').value = '';
    document.getElementById('reauth-pw-current').value = '';
    document.getElementById('new-pw-input').value = '';
    document.getElementById('new-pw-confirm').value = '';
    await renderStatsGrid();
    // プッシュ通知UI・PWAインストールUI更新
    refreshPushNotifUI();
    _refreshPwaInstallUI();
    // 通知リストは initTopNotifCenter の on('value') リスナーが管理しているため
    // ここで once() による二重fetchは行わない。
    // リスナーが未発火の場合（ページ初回表示直後など）のみ手動fetchする。
    if(currentUser && !_topNotifRef) {
      try {
        const snap = await db.ref('notifications/' + currentUser.uid).once('value');
        const items = [];
        snap.forEach(c => items.push({ id: c.key, ...c.val() }));
        items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        renderAccountNotifList(items);
      } catch(e) {
        renderAccountNotifList([]);
      }
    }
  } else {
    guestSec.style.display = '';
    userSec.style.display = 'none';
  }
  updateHeroAccountBtn();
}

function switchAcctTab(tab) {
  const loginForm = document.getElementById('acct-login-form');
  const regForm = document.getElementById('acct-register-form');
  if(loginForm) loginForm.style.display = tab === 'login' ? '' : 'none';
  if(regForm) regForm.style.display = tab === 'register' ? '' : 'none';
  document.getElementById('acct-tab-login')?.classList.toggle('active', tab === 'login');
  document.getElementById('acct-tab-register')?.classList.toggle('active', tab === 'register');
  clearAuthErr();
}

function clearAuthErr() {
  ['auth-err-login','auth-err-reg'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = 'none';
  });
}

function showAuthErr(formType, msg) {
  const id = formType === 'login' ? 'auth-err-login' : 'auth-err-reg';
  const el = document.getElementById(id);
  if(!el) return;
  el.innerText = msg;
  el.style.display = 'block';
}

function validatePassword(pw) {
  if(pw.length < 8) return 'パスワードは8文字以上にしてください';
  if(!/[a-zA-Z]/.test(pw)) return 'パスワードに英字を含めてください';
  if(!/[0-9]/.test(pw)) return 'パスワードに数字を含めてください';
  if(!/[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>\/?`~]/.test(pw)) return 'パスワードに記号を含めてください';
  return null;
}

async function registerAccount() {
  try {
    if(!auth) { if(!firebase.apps.length) firebase.initializeApp(firebaseConfig); auth = firebase.auth(); if(!db) db = firebase.database(); }
    const email = document.getElementById('auth-email-reg').value.trim();
    const displayId = document.getElementById('auth-uid-reg').value.trim();
    const pw = document.getElementById('auth-pw-reg').value;

    if(!email) return showAuthErr('reg', 'メールアドレスを入力してください');
    if(!displayId || displayId.length < 3) return showAuthErr('reg', 'ユーザーIDは3文字以上にしてください');
    if(!/^[a-zA-Z0-9_]+$/.test(displayId)) return showAuthErr('reg', 'ユーザーIDは半角英数字・_のみ使用できます');
    const pwErr = validatePassword(pw);
    if(pwErr) return showAuthErr('reg', pwErr);

    const idSnap = await db.ref(`userIndex/${displayId}`).once('value');
    if(idSnap.exists()) return showAuthErr('reg', 'そのユーザーIDはすでに使われています');

    const cred = await auth.createUserWithEmailAndPassword(email, pw);
    const uid = cred.user.uid;

    await cred.user.getIdToken(true);

    const profile = { displayId, email, icon: '🎮', title: '', name: '', createdAt: Date.now() };
    await db.ref(`users/${uid}`).set(profile);
    await db.ref(`userIndex/${displayId}`).set({ uid, email });
    await db.ref(`stats/${uid}`).set({ totalGames:0, totalCorrect:0, totalWrong:0, wins:0 });

    await cred.user.sendEmailVerification();

    currentUserProfile = profile;
    show('top');
    toast('✅ アカウントを作成しました！');
    // メール確認案内を表示
    setTimeout(() => {
      const email = currentUserProfile.email || '';
      toast(`📧 ${email} に確認メールを送信しました。メール内のリンクをクリックして認証を完了してください。`, 6000);
    }, 2000);
  } catch(e) {
    const msg = e.code === 'auth/email-already-in-use' ? 'そのメールアドレスはすでに登録されています'
      : e.code === 'auth/invalid-email' ? 'メールアドレスの形式が正しくありません'
      : e.code === 'auth/weak-password' ? 'パスワードが弱すぎます'
      : 'エラーが発生しました: ' + e.message;
    showAuthErr('reg', msg);
  }
}

async function loginAccount() {
  try {
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if(!auth) auth = firebase.auth();
    if(!db) db = firebase.database();
    const emailOrId = document.getElementById('auth-email-login').value.trim();
    const pw = document.getElementById('auth-pw-login').value;
    if(!emailOrId) return showAuthErr('login', 'メールアドレスまたはユーザーIDを入力してください');
    if(!pw) return showAuthErr('login', 'パスワードを入力してください');

    let email = emailOrId;
    if(!emailOrId.includes('@')) {
      const uidSnap = await db.ref(`userIndex/${emailOrId}`).once('value');
      if(!uidSnap.exists()) return showAuthErr('login', 'ユーザーIDが見つかりません');
      const indexVal = uidSnap.val();
      // 旧形式（uid文字列）と新形式（{uid, email}オブジェクト）の両方に対応
      if(typeof indexVal === 'object' && indexVal.email) {
        email = indexVal.email;
      } else {
        // 旧形式: uidのみ保存されている場合はusers/{uid}/emailを試みる
        const uid = typeof indexVal === 'string' ? indexVal : indexVal.uid;
        try {
          const userSnap = await db.ref(`users/${uid}/email`).once('value');
          if(!userSnap.exists()) return showAuthErr('login', 'メールアドレスの取得に失敗しました。メールアドレスでログインしてください。');
          email = userSnap.val();
        } catch(permErr) {
          return showAuthErr('login', 'このユーザーIDはメールアドレスでのログインが必要です（旧形式アカウント）');
        }
      }
    }

    await auth.signInWithEmailAndPassword(email, pw);
    // 旧形式userIndex（uid文字列のみ）を新形式（{uid,email}）に自動マイグレーション
    if(!emailOrId.includes('@') && db) {
      const uidSnap = await db.ref(`userIndex/${emailOrId}`).once('value');
      if(uidSnap.exists()) {
        const val = uidSnap.val();
        if(typeof val === 'string') {
          // 旧形式: uidのみ → 新形式に更新
          await db.ref(`userIndex/${emailOrId}`).set({ uid: val, email });
        }
      }
    }
    show('top');
    toast('✅ ログインしました');
  } catch(e) {
    const msg = e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
      ? 'メールアドレス/ユーザーIDまたはパスワードが正しくありません'
      : 'ログインに失敗しました: ' + e.message;
    showAuthErr('login', msg);
  }
}

async function forgotPassword() {
  const emailOrId = document.getElementById('auth-email-login').value.trim();
  if(!emailOrId) return showAuthErr('login', 'まずメールアドレスまたはユーザーIDを入力してください');
  try {
    let email = emailOrId;
    if(!emailOrId.includes('@')) {
      if(!db) { if(!firebase.apps.length) firebase.initializeApp(firebaseConfig); db = firebase.database(); }
      const uidSnap = await db.ref(`userIndex/${emailOrId}`).once('value');
      if(!uidSnap.exists()) return showAuthErr('login', 'ユーザーIDが見つかりません');
      const indexVal = uidSnap.val();
      if(typeof indexVal === 'object' && indexVal.email) {
        email = indexVal.email;
      } else {
        const uid = typeof indexVal === 'string' ? indexVal : indexVal.uid;
        try {
          const userSnap = await db.ref(`users/${uid}/email`).once('value');
          if(!userSnap.exists()) return showAuthErr('login', 'メールアドレスの取得に失敗しました');
          email = userSnap.val();
        } catch(permErr) {
          return showAuthErr('login', 'このユーザーIDはメールアドレスでのパスワードリセットが必要です');
        }
      }
    }
    await auth.sendPasswordResetEmail(email);
    toast('📧 パスワードリセットメールを送信しました');
  } catch(e) {
    showAuthErr('login', 'メール送信に失敗しました: ' + e.message);
  }
}

async function logoutAccount() {
  if(!confirm('ログアウトしますか？')) return;
  await auth.signOut();
  show('top');
  toast('ログアウトしました');
}

function deleteAccount() {
  if(!currentUser) { toast('ログインが必要です'); return; }
  // 退会確認モーダルを表示
  document.getElementById('modal-delete-account').classList.add('active');
  document.getElementById('delete-account-pw').value = '';
  document.getElementById('delete-account-err').style.display = 'none';
}
function closeDeleteAccountModal() {
  document.getElementById('modal-delete-account').classList.remove('active');
}
async function confirmDeleteAccount() {
  const pw = document.getElementById('delete-account-pw').value;
  const errEl = document.getElementById('delete-account-err');
  errEl.style.display = 'none';
  if(!pw) { errEl.textContent = 'パスワードを入力してください'; errEl.style.display = 'block'; return; }
  const btn = document.getElementById('delete-account-btn');
  btn.disabled = true;
  btn.textContent = '処理中…';
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
    await currentUser.reauthenticateWithCredential(cred);
    const uid = currentUser.uid;
    const displayId = currentUserProfile ? currentUserProfile.displayId : null;
    await Promise.all([
      db.ref(`users/${uid}`).remove(),
      db.ref(`stats/${uid}`).remove(),
      db.ref(`friends/${uid}`).remove(),
      db.ref(`notifications/${uid}`).remove(),
      db.ref(`friendRequests/${uid}`).remove(),
      displayId ? db.ref(`userIndex/${displayId}`).remove() : Promise.resolve(),
    ]);
    await currentUser.delete();
    closeDeleteAccountModal();
    show('top');
    toast('退会処理が完了しました。ご利用ありがとうございました。', 4000);
  } catch(e) {
    const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
      ? 'パスワードが正しくありません'
      : e.code === 'auth/too-many-requests' ? 'しばらく時間をおいてからお試しください'
      : '退会に失敗しました: ' + e.message;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '退会を実行する';
  }
}


let _selectedIcon = null;
let _cropState = { img: null, x: 0, y: 0, scale: 1, dragging: false, startX: 0, startY: 0, startImgX: 0, startImgY: 0, lastDist: 0 };

// [Removed duplicate showAccountPage - merged into first definition above]

function toggleAccountSettings() {
  const body = document.getElementById('account-settings-body');
  const arrow = document.getElementById('account-settings-arrow');
  const open = body.style.display === 'none';
  body.style.display = open ? '' : 'none';
  arrow.textContent = open ? '▲' : '▼';
}

function toggleIconPicker() {
  const picker = document.getElementById('icon-picker');
  const cropWrap = document.getElementById('icon-crop-wrap');
  if(picker.style.display === 'none') {
    cropWrap.style.display = 'none';
    picker.innerHTML = ICON_LIST.map(ic => `<button class="icon-option ${ic===_selectedIcon?'selected':''}" onclick="selectIcon('${ic}')">${ic}</button>`).join('');
    picker.style.display = 'grid';
  } else {
    picker.style.display = 'none';
  }
}

function selectIcon(ic) {
  _selectedIcon = ic;
  // iconUrl を一時的にクリア（SAVEを押すまで確定しない）
  // ただしUIは即時切り替え
  const disp = document.getElementById('profile-icon-display');
  if(disp) { disp.innerHTML = ''; disp.textContent = ic; }
  // 削除ボタンを非表示（絵文字に切り替え中）
  const resetBtn = document.getElementById('btn-reset-icon');
  if(resetBtn) resetBtn.style.display = 'none';
  document.querySelectorAll('.icon-option').forEach(el => el.classList.toggle('selected', el.textContent === ic));
  // ピッカーを閉じる
  document.getElementById('icon-picker').style.display = 'none';
}

function triggerImageUpload() {
  document.getElementById('icon-image-file').value = '';
  document.getElementById('icon-image-file').click();
}

function onIconImageSelected(event) {
  const file = event.target.files[0];
  if(!file) return;
  document.getElementById('icon-picker').style.display = 'none';
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const img = document.getElementById('icon-crop-img');
    img.onload = () => {
      const stage = document.getElementById('icon-crop-stage');
      const sw = stage.offsetWidth || 200;
      const sh = stage.offsetHeight || 200;
      const scale = Math.max(sw / img.naturalWidth, sh / img.naturalHeight);
      _cropState = {
        img, dataUrl,
        x: (sw - img.naturalWidth * scale) / 2,
        y: (sh - img.naturalHeight * scale) / 2,
        scale, dragging: false, startX: 0, startY: 0, startImgX: 0, startImgY: 0, lastDist: 0
      };
      applyCropTransform();
      document.getElementById('icon-crop-wrap').style.display = '';
      initCropEvents(stage);
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function applyCropTransform() {
  const { img, x, y, scale } = _cropState;
  if(!img) return;
  img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function initCropEvents(stage) {
  stage.onmousedown = e => {
    _cropState.dragging = true; _cropState.startX = e.clientX; _cropState.startY = e.clientY;
    _cropState.startImgX = _cropState.x; _cropState.startImgY = _cropState.y;
    stage.style.cursor = 'grabbing';
  };
  window.onmousemove = e => {
    if(!_cropState.dragging) return;
    _cropState.x = _cropState.startImgX + (e.clientX - _cropState.startX);
    _cropState.y = _cropState.startImgY + (e.clientY - _cropState.startY);
    applyCropTransform();
  };
  window.onmouseup = () => { _cropState.dragging = false; stage.style.cursor = 'grab'; };

  stage.ontouchstart = e => {
    if(e.touches.length === 1) {
      _cropState.dragging = true;
      _cropState.startX = e.touches[0].clientX; _cropState.startY = e.touches[0].clientY;
      _cropState.startImgX = _cropState.x; _cropState.startImgY = _cropState.y;
    } else if(e.touches.length === 2) {
      _cropState.lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
    e.preventDefault();
  };
  stage.ontouchmove = e => {
    if(e.touches.length === 1 && _cropState.dragging) {
      _cropState.x = _cropState.startImgX + (e.touches[0].clientX - _cropState.startX);
      _cropState.y = _cropState.startImgY + (e.touches[0].clientY - _cropState.startY);
      applyCropTransform();
    } else if(e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if(_cropState.lastDist) {
        const ratio = dist / _cropState.lastDist;
        const stage = document.getElementById('icon-crop-stage');
        const cx = stage.offsetWidth / 2, cy = stage.offsetHeight / 2;
        _cropState.x = cx + (_cropState.x - cx) * ratio;
        _cropState.y = cy + (_cropState.y - cy) * ratio;
        _cropState.scale *= ratio;
        applyCropTransform();
      }
      _cropState.lastDist = dist;
    }
    e.preventDefault();
  };
  stage.ontouchend = () => { _cropState.dragging = false; _cropState.lastDist = 0; };

  stage.onwheel = e => {
    e.preventDefault();
    const ratio = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = stage.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    _cropState.x = cx + (_cropState.x - cx) * ratio;
    _cropState.y = cy + (_cropState.y - cy) * ratio;
    _cropState.scale *= ratio;
    applyCropTransform();
  };
}

async function cropIconAndSave() {
  if(!currentUser) return;
  // _cropState.dataUrl から新しいImageを作りcanvasに描画（DOM要素のtransform等に依存しない）
  const { dataUrl, x, y, scale } = _cropState;
  if(!dataUrl) { toast('❌ 画像が読み込まれていません'); return; }

  const prevBtn = document.querySelector('#icon-crop-wrap button');
  const origText = prevBtn ? prevBtn.textContent : '';
  if(prevBtn) { prevBtn.textContent = '保存中…'; prevBtn.disabled = true; }

  try {
    await new Promise((resolve, reject) => {
      const freshImg = new Image();
      freshImg.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 200; canvas.height = 200;
          const ctx = canvas.getContext('2d');

          // ステージは常に200x200なのでratioは1.0
          // x/y/scale は transform-origin:0 0 基準の左上座標
          ctx.save();
          ctx.beginPath();
          ctx.arc(100, 100, 100, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(freshImg, x, y, freshImg.naturalWidth * scale, freshImg.naturalHeight * scale);
          ctx.restore();

          const result = canvas.toDataURL('image/jpeg', 0.85);
          await db.ref(`users/${currentUser.uid}`).update({ iconUrl: result, icon: '' });
          currentUserProfile = { ...currentUserProfile, iconUrl: result, icon: '' };
          accountProfileCache[currentUser.uid] = { ...currentUserProfile };
          if(rId && myId) db.ref(`rooms/${rId}/players/${myId}`).update({ iconUrl: result, icon: '' }).catch(() => {});

          const disp = document.getElementById('profile-icon-display');
          if(disp) disp.innerHTML = `<img src="${result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
          updateHeroAccountBtn();
          document.getElementById('icon-crop-wrap').style.display = 'none';
          const resetBtn = document.getElementById('btn-reset-icon');
          if(resetBtn) resetBtn.style.display = '';
          toast('✅ アイコンを保存しました');
          resolve();
        } catch(e) { reject(e); }
      };
      freshImg.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      freshImg.src = dataUrl;
    });
  } catch(e) {
    toast('❌ 保存に失敗しました: ' + e.message);
  } finally {
    if(prevBtn) { prevBtn.textContent = origText; prevBtn.disabled = false; }
  }
}
function cancelCrop() {
  document.getElementById('icon-crop-wrap').style.display = 'none';
}

async function resetIconToDefault() {
  if(!currentUser || !currentUserProfile) return;
  if(!confirm('アップロードした画像を削除して絵文字アイコンに戻しますか？')) return;
  try {
    const icon = _selectedIcon || currentUserProfile.icon || '🎮';
    await db.ref(`users/${currentUser.uid}`).update({ iconUrl: null, icon });
    currentUserProfile = { ...currentUserProfile, iconUrl: null, icon };
    accountProfileCache[currentUser.uid] = { ...currentUserProfile };
    if(rId && myId) db.ref(`rooms/${rId}/players/${myId}`).update({ iconUrl: null, icon }).catch(() => {});
    // UI更新
    const disp = document.getElementById('profile-icon-display');
    if(disp) { disp.innerHTML = ''; disp.textContent = icon; }
    const resetBtn = document.getElementById('btn-reset-icon');
    if(resetBtn) resetBtn.style.display = 'none';
    updateHeroAccountBtn();
    toast('✅ 絵文字アイコンに戻しました');
  } catch(e) {
    toast('❌ 失敗しました: ' + e.message);
  }
}

async function saveProfile() {
  if(!currentUser || !currentUserProfile) return;
  const title = document.getElementById('profile-title-input').value.trim();
  const name = document.getElementById('profile-name-input').value.trim();
  const updates = { title, name };

  // 絵文字アイコンを選択中（削除ボタンが非表示 = 絵文字モード）
  const resetBtn = document.getElementById('btn-reset-icon');
  const isEmojiMode = !resetBtn || resetBtn.style.display === 'none';

  if(_selectedIcon && isEmojiMode) {
    // 絵文字に切り替える（iconUrlをクリア）
    updates.icon = _selectedIcon;
    updates.iconUrl = null;
    currentUserProfile = { ...currentUserProfile, ...updates, iconUrl: null };
  } else {
    updates.icon = _selectedIcon || currentUserProfile.icon || '🎮';
    currentUserProfile = { ...currentUserProfile, ...updates };
  }

  await db.ref(`users/${currentUser.uid}`).update(updates);
  updateHeroAccountBtn();
  accountProfileCache[currentUser.uid] = { ...currentUserProfile };
  // ルーム参加中の場合、プロフィールカードに反映する
  if(rId && myId) {
    const roomUpdates = { icon: updates.icon || currentUserProfile.icon || '👤' };
    if(updates.iconUrl === null) roomUpdates.iconUrl = null;
    else if(currentUserProfile.iconUrl) roomUpdates.iconUrl = currentUserProfile.iconUrl;
    if(updates.title !== undefined) roomUpdates.title = updates.title;
    db.ref(`rooms/${rId}/players/${myId}`).update(roomUpdates).catch(() => {});
  }
  renderAccountPage();
  toast('✅ プロフィールを保存しました');
}

async function renderStatsGrid() {
  const snap = await db.ref(`stats/${currentUser.uid}`).once('value');
  const s = snap.val() || {};
  const winRate = s.totalGames > 0 ? Math.round(s.wins / s.totalGames * 100) : 0;
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-card-val">${s.totalGames||0}</div><div class="stat-card-label">GAMES</div></div>
    <div class="stat-card"><div class="stat-card-val">${winRate}%</div><div class="stat-card-label">WIN RATE</div></div>
    <div class="stat-card"><div class="stat-card-val">${s.totalCorrect||0}</div><div class="stat-card-label">CORRECT</div></div>
    <div class="stat-card"><div class="stat-card-val">${s.totalWrong||0}</div><div class="stat-card-label">WRONG</div></div>
    <div style="grid-column:1/-1;margin-top:4px;">
      <button onclick="confirmResetStats()" style="background:none;border:1px solid rgba(239,68,68,0.35);border-radius:10px;color:rgba(239,68,68,0.7);font-size:0.75rem;padding:7px 16px;cursor:pointer;font-family:var(--font-en);letter-spacing:0.08em;transition:0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='none'">🔄 統計をリセット</button>
    </div>
  `;
}

async function confirmResetStats() {
  if(!currentUser) return;
  if(!confirm('統計データをリセットしますか？\nGAMES・WIN RATE・CORRECT・WRONG がすべて 0 になります。\nこの操作は取り消せません。')) return;
  await db.ref(`stats/${currentUser.uid}`).set({ totalGames:0, totalCorrect:0, totalWrong:0, wins:0 });
  toast('✅ 統計をリセットしました');
  renderStatsGrid();
}

function showFieldErr(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if(!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

async function updateUserId() {
  if(!currentUser || !currentUserProfile) return;
  const newId = document.getElementById('new-uid-input').value.trim();
  if(!newId || newId.length < 3) return showFieldErr('uid-change-err', 'ユーザーIDは3文字以上にしてください');
  if(!/^[a-zA-Z0-9_]+$/.test(newId)) return showFieldErr('uid-change-err', '半角英数字・_のみ使用できます');
  if(newId === currentUserProfile.displayId) return showFieldErr('uid-change-err', '現在と同じIDです');
  const snap = await db.ref(`userIndex/${newId}`).once('value');
  if(snap.exists()) return showFieldErr('uid-change-err', 'そのユーザーIDはすでに使われています');
  const oldId = currentUserProfile.displayId;
  await db.ref(`userIndex/${oldId}`).remove();
  await db.ref(`userIndex/${newId}`).set({ uid: currentUser.uid, email: currentUser.email });
  await db.ref(`users/${currentUser.uid}`).update({ displayId: newId });
  currentUserProfile = { ...currentUserProfile, displayId: newId };
  document.getElementById('profile-uid-display').textContent = newId;
  document.getElementById('new-uid-input').value = '';
  updateAccountBar(true);
  toast('✅ ユーザーIDを変更しました');
}

async function updateEmail() {
  if(!currentUser) return;
  const newEmail = document.getElementById('new-email-input').value.trim();
  const pw = document.getElementById('reauth-pw-email').value;
  if(!newEmail) return showFieldErr('email-change-err', '新しいメールアドレスを入力してください');
  if(!pw) return showFieldErr('email-change-err', '現在のパスワードを入力してください');
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updateEmail(newEmail);
    await db.ref(`users/${currentUser.uid}`).update({ email: newEmail });
    // userIndex のメールアドレスも更新
    if(currentUserProfile.displayId) {
      await db.ref(`userIndex/${currentUserProfile.displayId}`).set({ uid: currentUser.uid, email: newEmail });
    }
    currentUserProfile = { ...currentUserProfile, email: newEmail };
    document.getElementById('profile-email-display').textContent = newEmail;
    document.getElementById('new-email-input').value = '';
    document.getElementById('reauth-pw-email').value = '';
    toast('✅ メールアドレスを変更しました');
  } catch(e) {
    const msg = e.code === 'auth/wrong-password' ? 'パスワードが正しくありません'
      : e.code === 'auth/email-already-in-use' ? 'そのメールアドレスはすでに使われています'
      : e.code === 'auth/invalid-email' ? 'メールアドレスの形式が正しくありません'
      : 'エラー: ' + e.message;
    showFieldErr('email-change-err', msg);
  }
}

async function updatePassword() {
  if(!currentUser) return;
  const currentPw = document.getElementById('reauth-pw-current').value;
  const newPw = document.getElementById('new-pw-input').value;
  const confirmPw = document.getElementById('new-pw-confirm').value;
  if(!currentPw) return showFieldErr('pw-change-err', '現在のパスワードを入力してください');
  if(newPw !== confirmPw) return showFieldErr('pw-change-err', '新しいパスワードが一致しません');
  const pwErr = validatePassword(newPw);
  if(pwErr) return showFieldErr('pw-change-err', pwErr);
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPw);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPw);
    document.getElementById('reauth-pw-current').value = '';
    document.getElementById('new-pw-input').value = '';
    document.getElementById('new-pw-confirm').value = '';
    toast('✅ パスワードを変更しました');
  } catch(e) {
    const msg = e.code === 'auth/wrong-password' ? '現在のパスワードが正しくありません'
      : e.code === 'auth/weak-password' ? 'パスワードが弱すぎます'
      : 'エラー: ' + e.message;
    showFieldErr('pw-change-err', msg);
  }
}

async function updateAccountStats(type, isWin) {
  if(!currentUser) return;
  const ref = db.ref(`stats/${currentUser.uid}`);
  const updates = {};
  if(type === 'correct') updates.totalCorrect = firebase.database.ServerValue.increment(1);
  if(type === 'wrong') updates.totalWrong = firebase.database.ServerValue.increment(1);
  if(isWin) {
    updates.wins = firebase.database.ServerValue.increment(1);
    updates.totalGames = firebase.database.ServerValue.increment(1);
  }
  await ref.update(updates);
}
