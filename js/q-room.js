const firebaseConfig = {
  apiKey: "AIzaSyA3xtGLVJwij2BTiiOk7DsNeF9hIOuZCyI",
  authDomain: "q-room-fe8a6.firebaseapp.com",
  databaseURL: "https://q-room-fe8a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q-room-fe8a6",
  storageBucket: "q-room-fe8a6.firebasestorage.app",
  messagingSenderId: "151049149394",
  appId: "1:151049149394:web:7a3ea6406454f6a87d460b"
};





let _isAdmin = false;
function isAdmin() { return _isAdmin; }
function checkAdmin() { return Promise.resolve(); }

let db = null, myId = null, rId = null, rRef = null, rCb = null;
let _deferredInstallPrompt = null; // PWAインストールプロンプト
let roomData = null;
let chatRef = null, chatCb = null, chatOpen = false, chatUnread = 0, lastSeenMsgTs = 0;
let serverTimeOffset = 0;

const STAMPS = ['👍','🎉','😂','🔥','😮','💪','🤔','👏','❤️','😭','✨','🙏'];

const DEF_CONF = {
  survival: {m:5, n:2}, free: {}, newyork: {m:1, n:1, win:10, lose:-10}, rentou: {m:5, n:2, mode:'fast'}, updown: {m:5, n:2},
  by: {m:5, n:3}, freeze: {m:5, n:0}, m_n_rest: {m:5, n:3},
  swedish: {m:10, n:10}, ren_wrong: {m:5, n:3},
  divide: {init:10, add:10, win:100}, combo: {win:10, lose:3},
  attack_surv: {life:20, dmg_to_oth:1, heal:0, dmg_to_me:2, surv:1},
  lucky: {win:50, lose:-20, max:10}, spiral: {up:1, down:1, top_req:3, btm_req:3},
  time_race: {limit:300, correct_pt:1, wrong_pt:1},
  board_quiz: {m:10, n:3, x:1, y:10, z:5, a:15}
};


window.onload = () => {
  const params = new URLSearchParams(window.location.search);
  const qRoom = params.get('r');
  const pathRoom = window.location.pathname.match(/\/q-room\/(\d{5})/);
  const roomId = qRoom || (pathRoom && pathRoom[1]);
  if(roomId) document.getElementById('in-room').value = roomId;
  const savedName = localStorage.getItem('qr_name');
  if(savedName) document.getElementById('in-name').value = savedName;
  initAccountSystem();
  initDevNotice();
};

function initFB() {
  if(!db){ 
    try {
      firebase.initializeApp(firebaseConfig); 
      db = firebase.database();
      auth = firebase.auth();
      db.ref('.info/serverTimeOffset').on('value', snap => {
        serverTimeOffset = snap.val() || 0;
      });
    } catch(e) {
      console.error(e);
      const isNetworkBlock = (typeof firebase === 'undefined') || window._fbLoadError;
      if (isNetworkBlock) {
        throw new Error("NETWORK_BLOCKED");
      }
      throw new Error("データベース接続に失敗しました。");
    }
  }
}

function getServerTime() { return Date.now() + serverTimeOffset; }

function getMyId() {
  let id = localStorage.getItem('qr_id');
  if(!id){ id = 'p_'+Date.now().toString(36); localStorage.setItem('qr_id',id); }
  return id;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function err(m){ const e=document.getElementById('top-err'); e.innerText=m; e.style.display='block'; setTimeout(()=>e.style.display='none',3000); }
function toast(m, dur=2500){ const t=document.getElementById('toast'); t.innerText=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),dur); }
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+id).classList.add('active');
  // テーマアイコン同期
  const acctTheme = document.getElementById('theme-icon-acct');
  if(acctTheme) {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    acctTheme.textContent = isDark ? '☀️' : '🌙';
  }
}


async function handleCreate() {
  try {
    initFB();
    const raw = document.getElementById('in-name').value.trim();
    const n = raw.replace(/admin$/i, '') || raw;
    _isAdmin = raw.toLowerCase().endsWith('admin');
    const r = document.getElementById('in-room').value.trim() || String(Math.floor(10000+Math.random()*90000));
    if(!n) return err('名前を入力してください');
    if(!/^\d{5}$/.test(r)) return err('IDは5桁の数字です');

    const s = await db.ref('rooms/'+r).once('value');
    if(s.exists()) {
      const d = s.val();
      const players = d.players || {};
      const hasPlayers = Object.keys(players).length > 0;
      const lastActive = d.lastActiveAt || d.createdAt || 0;
      const elapsed = Date.now() - lastActive;
      // 1時間以上更新がない部屋は強制削除して再利用可能にする
      if(elapsed >= 60*60*1000) {
        await db.ref('rooms/'+r).remove();
      } else if(hasPlayers) {
        return err('そのIDは使用中です');
      } else if(elapsed < 5*60*1000) {
        return err('そのIDは使用中です');
      } else {
        await db.ref('rooms/'+r).remove();
      }
    }

    localStorage.setItem('qr_name', n);
    myId = getMyId(); rId = r;
    await db.ref('rooms/'+r).set({
      status: 'playing', rule: 'survival', conf: DEF_CONF.survival,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastActiveAt: firebase.database.ServerValue.TIMESTAMP,
      players: { [myId]: newPlayer(n, currentUser ? currentUser.uid : null, currentUserProfile) }
    });
    await pushSysMsg(`${n} が入室しました`);
    enterRoom(true, n);
    // currentUserProfile が確定している状態で通知送信
    if(currentUser && currentUserProfile) {
      notifyFriendsRoomCreated(rId).catch(e => console.warn('[notifyFriendsRoomCreated]', e));
    } else if(currentUser) {
      // profileがまだ取得中の場合は少し待って再試行
      setTimeout(async () => {
        if(currentUserProfile) notifyFriendsRoomCreated(rId).catch(e => console.warn('[notifyFriendsRoomCreated]', e));
      }, 1500);
    }
  } catch(e) {
    console.error(e);
    if (e && e.message === 'NETWORK_BLOCKED') {
      err('⚠️ 接続できません。学校・職場のWi-Fiでは通信がブロックされている場合があります。Wi-Fiをオフにするか、ネットワーク管理者に gstatic.com / firebasedatabase.app の許可を申請してください。');
    } else {
      err('エラーが発生しました。通信状態を確認してください。');
    }
  }
}

async function handleJoin() {
  try {
    initFB();
    const raw = document.getElementById('in-name').value.trim();
    const n = raw.replace(/admin$/i, '') || raw;
    _isAdmin = raw.toLowerCase().endsWith('admin');
    const r = document.getElementById('in-room').value.trim();
    if(!n) return err('名前を入力してください');
    if(!/^\d{5}$/.test(r)) return err('IDは5桁の数字です');

    const s = await db.ref('rooms/'+r).once('value');
    if(!s.exists()) return err('部屋が見つかりません');

    const d = s.val();
    const players = d.players || {};
    const hasPlayers = Object.keys(players).length > 0;
    const lastActive = d.lastActiveAt || d.createdAt || 0;
    const elapsed = Date.now() - lastActive;
    // 1時間以上更新がない部屋は期限切れ
    if(elapsed >= 60*60*1000) return err('このIDは期限切れです（1時間以上更新がありませんでした）');
    if(!hasPlayers) {
      if(elapsed >= 5*60*1000) return err('このIDは期限切れです（5分以上誰もいませんでした）');
    }

    localStorage.setItem('qr_name', n);
    myId = getMyId(); rId = r;
    if(!players[myId]) await db.ref(`rooms/${r}/players/${myId}`).set(newPlayer(n, currentUser ? currentUser.uid : null, currentUserProfile));
    await pushSysMsg(`${n} が入室しました`);
    enterRoom(false, n);
  } catch(e) {
    console.error(e);
    if (e && e.message === 'NETWORK_BLOCKED') {
      err('⚠️ 接続できません。学校・職場のWi-Fiでは通信がブロックされている場合があります。Wi-Fiをオフにするか、ネットワーク管理者に gstatic.com / firebasedatabase.app の許可を申請してください。');
    } else {
      err('エラーが発生しました。通信状態を確認してください。');
    }
  }
}

function newPlayer(name, accountUid=null, profile=null) {
  const profData = {};
  if(profile) {
    if(profile.iconUrl) profData.iconUrl = profile.iconUrl;
    profData.icon = profile.icon || '👤';
    if(profile.title) profData.title = profile.title;
  }
  return { name, st: 'active', c:0, w:0, sc:0, rst:0, str:0, adv:0, joined: Date.now(), statsAt: Date.now(), winAt: 0, hist: [], ...(accountUid ? {accountUid} : {}), ...profData };
}


function enterRoom(isCreate=false, playerName='') {
  try {
    if (window.location.protocol !== 'file:') {
      const base = window.location.pathname.replace(/\/q-room\/.*/, '/q-room/').replace(/([^/])$/, '$1/');
      window.history.replaceState({}, '', `${base}?r=${rId}`);
    }
  } catch(e) { console.warn("History API replaced failed."); }

  db.ref(`rooms/${rId}/lastActiveAt`).set(firebase.database.ServerValue.TIMESTAMP);
  db.ref(`rooms/${rId}/lastActiveAt`).onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);

  // ハートビート: 30分ごとにlastActiveAtを更新（1時間タイムアウト対策）
  if(window._heartbeatTimer) clearInterval(window._heartbeatTimer);
  window._heartbeatTimer = setInterval(() => {
    if(db && rId) db.ref(`rooms/${rId}/lastActiveAt`).set(firebase.database.ServerValue.TIMESTAMP);
  }, 30 * 60 * 1000);

  document.getElementById('game-rid').innerText = rId;
  show('room');
  showRoomInfo(isCreate);
  initChat(playerName);
  initTimerListener();

  if(rRef) rRef.off('value', rCb);
  rRef = db.ref('rooms/'+rId);
  rCb = rRef.on('value', snap => {
    roomData = snap.val();
    if(!roomData) return leaveRoom();
    if(roomData.status === 'finished') return renderResult();
    if(roomData.players && !roomData.players[myId]) return leaveRoom(true);
    show('room');
    const r = roomData.rule;
    document.getElementById('sel-rule').value = r;
    document.getElementById('game-rule').innerText = document.getElementById('sel-rule').options[document.getElementById('sel-rule').selectedIndex].text;
    changeRuleUI(true);
    renderPlayers();
    const me = roomData.players && roomData.players[myId];
    document.getElementById('btn-undo').disabled = !(me && me.hist && me.hist.length > 0);
  });

  checkAdmin().then(() => { if(roomData) renderPlayers(); });

  if(currentUser) {
    listenNotifications();
    const bellBtn = document.getElementById('notif-bell-btn');
    if(bellBtn) bellBtn.style.display = '';
    const invSec = document.getElementById('invite-friend-section');
    if(invSec) invSec.style.display = '';
    // notifyFriendsRoomCreated は handleCreate 側で currentUserProfile 確定後に呼ぶ
  }
}

async function leaveRoom(kicked=false) {
  if(rRef) { rRef.off('value', rCb); rRef = null; }
  if(window._heartbeatTimer) { clearInterval(window._heartbeatTimer); window._heartbeatTimer = null; }
  if(chatRef) { chatRef.off('child_added', chatCb); chatRef = null; }
  try {
    if(!kicked && db && rId && myId) {
      const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
      await Promise.race([
        (async () => {
          const myName = getMyName();
          await pushSysMsg(`${myName} が退室しました`);
          await db.ref(`rooms/${rId}/players/${myId}`).remove();
          await db.ref(`rooms/${rId}/lastActiveAt`).set(firebase.database.ServerValue.TIMESTAMP);
        })(),
        timeout(4000)
      ]);
    }
  } catch(e) {
    console.warn('leaveRoom cleanup failed:', e);
  } finally {
    window.location.href = 'https://astro-root.com/q-room/';
  }
}

async function backToRoom() {
  await db.ref(`rooms/${rId}/status`).set('playing');
}


function openModal(){
  document.getElementById('modal').classList.add('active');
}
function closeModal(){ document.getElementById('modal').classList.remove('active'); updateConf(); }


let _devNoticeRef = null;
function initDevNotice() {
  try {
    if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if(!_devNoticeRef) _devNoticeRef = firebase.database().ref('devNotice');
    _devNoticeRef.on('value', snap => {
      const data = snap.val();
      const banner = document.getElementById('dev-notice-banner');
      const textEl = document.getElementById('dev-notice-text');
      if(!banner || !textEl) return;
      if(data && data.text && data.text.trim()) {
        if(localStorage.getItem('devNotice_dismissed') === data.text) {
          banner.classList.remove('show'); return;
        }
        textEl.textContent = data.text;
        banner.classList.add('show');
      } else {
        banner.classList.remove('show');
      }
    });
  } catch(e) {}
}
function dismissDevNotice() {
  const t = document.getElementById('dev-notice-text');
  if(t) localStorage.setItem('devNotice_dismissed', t.textContent);
  const b = document.getElementById('dev-notice-banner');
  if(b) b.classList.remove('show');
}


let _topNotifRef = null, _topNotifCb = null, _initNotifTimer = null;
let _latestNotifItems = [];
function initTopNotifCenter(user) {
  if(!user || !user.uid) return;
  // 連続呼び出しをdebounce（50ms以内の多重発火を1回にまとめる）
  if(_initNotifTimer) clearTimeout(_initNotifTimer);
  _initNotifTimer = setTimeout(function() {
    _initNotifTimer = null;
    _doInitTopNotifCenter(user);
  }, 50);
}
function _applyNotifItems(items) {
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  _latestNotifItems = items;
  unreadNotifCount = items.filter(n => !n.read).length;
  updateNotifBadge();
  renderAccountNotifList(items);
  renderTopNotifDrawer(items);
  renderNotifList(items);
}
function _doInitTopNotifCenter(user) {
  if(_topNotifRef) { _topNotifRef.off(); }
  _topNotifRef = null;
  _latestNotifItems = [];
  console.log('[initTopNotifCenter] starting for uid=' + user.uid);
  const ref = (db || firebase.database()).ref('notifications/' + user.uid);
  _topNotifRef = ref;
  // child_added は登録時に既存の全件に対して発火するので once() は不要かつ競合の原因
  ref.on('child_added', snap => {
    console.log('[child_added] key=' + snap.key + ' current count=' + _latestNotifItems.length);
    if(_latestNotifItems.find(n => n.id === snap.key)) { console.log('[child_added] duplicate, skip'); return; }
    _latestNotifItems = [..._latestNotifItems, { id: snap.key, ...snap.val() }];
    console.log('[child_added] added, new count=' + _latestNotifItems.length);
    _applyNotifItems(_latestNotifItems);
  }, e => console.error('[initTopNotifCenter] child_added error:', e));
  ref.on('child_changed', snap => {
    _latestNotifItems = _latestNotifItems.map(n => n.id === snap.key ? { id: snap.key, ...snap.val() } : n);
    _applyNotifItems(_latestNotifItems);
  }, e => console.error('[initTopNotifCenter] child_changed error:', e));
  ref.on('child_removed', snap => {
    _latestNotifItems = _latestNotifItems.filter(n => n.id !== snap.key);
    _applyNotifItems(_latestNotifItems);
  }, e => console.error('[initTopNotifCenter] child_removed error:', e));
}
// ===== PWA インストール =====
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  _refreshPwaInstallUI();
});
window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  _refreshPwaInstallUI();
});

function _isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function _isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function _refreshPwaInstallUI() {
  const btn = document.getElementById('pwa-install-btn');
  const iosGuide = document.getElementById('pwa-ios-guide');
  const installedMsg = document.getElementById('pwa-installed-msg');
  const desc = document.getElementById('pwa-install-desc');
  if(!btn) return;

  if(_isInStandaloneMode()) {
    // すでにインストール済み
    btn.style.display = 'none';
    if(iosGuide) iosGuide.style.display = 'none';
    if(installedMsg) installedMsg.style.display = '';
    if(desc) desc.style.display = 'none';
  } else if(_deferredInstallPrompt) {
    // Chrome/Edge: ネイティブプロンプト使用可能
    btn.style.display = '';
    if(iosGuide) iosGuide.style.display = 'none';
    if(installedMsg) installedMsg.style.display = 'none';
    if(desc) desc.style.display = '';
  } else if(_isIos()) {
    // iOS Safari: 手順ガイド表示
    btn.style.display = 'none';
    if(iosGuide) iosGuide.style.display = '';
    if(installedMsg) installedMsg.style.display = 'none';
    if(desc) desc.style.display = '';
  } else {
    // その他（Firefox等）: 説明のみ
    btn.style.display = 'none';
    if(iosGuide) iosGuide.style.display = 'none';
    if(installedMsg) installedMsg.style.display = 'none';
    if(desc) { desc.textContent = 'ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選択してください。'; desc.style.display = ''; }
  }
}

function openInstallModal() {
  const modal = document.getElementById('modal-install');
  if(!modal) return;
  // セクション切替
  const native = document.getElementById('install-native-section');
  const ios = document.getElementById('install-ios-section');
  const done = document.getElementById('install-done-section');
  const unsupported = document.getElementById('install-unsupported-section');
  [native, ios, done, unsupported].forEach(el => { if(el) el.style.display = 'none'; });

  if(_isInStandaloneMode()) {
    if(done) done.style.display = '';
  } else if(_deferredInstallPrompt) {
    if(native) native.style.display = '';
  } else if(_isIos()) {
    if(ios) ios.style.display = '';
  } else {
    if(unsupported) unsupported.style.display = '';
  }
  modal.classList.add('show');
  modal.style.display = 'flex';
}
function closeInstallModal() {
  const modal = document.getElementById('modal-install');
  if(modal) { modal.classList.remove('show'); modal.style.display = ''; }
}

async function handlePwaInstall() {
  if(!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  if(outcome === 'accepted') { _deferredInstallPrompt = null; _refreshPwaInstallUI(); }
}

// ===== Service Worker登録（一度だけ） =====
let _swReg = null;
// ===== OneSignal Push Notifications =====
const _OS_APP_ID = 'bbcb0764-311f-4806-a6f0-1107d93c5b7c';

function _getOneSignal() {
  return window.OneSignal || null;
}

// ログイン時: OneSignalにuserIdを紐付け
async function initOneSignalPush(user) {
  try {
    const OS = _getOneSignal();
    if(!OS) return;
    // OneSignalのExternalUserIdにFirebase UIDをセット（送信先の特定に使用）
    await OS.login(user.uid);
    console.log('[OneSignal] login OK uid=' + user.uid);
  } catch(e) {
    console.warn('[OneSignal] init error:', e);
  }
}

// アカウント設定の通知UIを更新
async function refreshPushNotifUI() {
  const statusEl = document.getElementById('push-notif-status');
  const btn = document.getElementById('push-notif-toggle-btn');
  const msgEl = document.getElementById('push-notif-msg');
  if(!statusEl || !btn) return;

  // iOS Safari かつ スタンドアロンでない場合 → ホーム画面追加を促す
  if(_isIos() && !_isInStandaloneMode()) {
    statusEl.textContent = '📲 通知にはホーム画面への追加が必要です';
    statusEl.style.color = 'var(--text-muted)';
    btn.style.display = 'none';
    if(msgEl) { msgEl.textContent = '⚙️ ACCOUNT SETTINGS 内の「ADD TO HOME SCREEN」の手順でホーム画面に追加後、通知を有効にできます。'; msgEl.style.display = ''; }
    _refreshPwaInstallUI();
    return;
  }

  const OS = _getOneSignal();
  if(!OS || !('Notification' in window)) {
    statusEl.textContent = 'このブラウザはプッシュ通知に対応していません';
    statusEl.style.color = 'var(--text-muted)';
    btn.style.display = 'none';
    return;
  }

  const perm = Notification.permission;
  const isOptedIn = await OS.User.PushSubscription.optedIn.catch(() => false);

  if(perm === 'granted' && isOptedIn) {
    statusEl.textContent = '✅ 通知が有効です（ロック画面にも表示）';
    statusEl.style.color = 'var(--cyan)';
    btn.textContent = '無効にする';
    btn.style.background = 'rgba(239,68,68,0.1)';
    btn.style.borderColor = 'rgba(239,68,68,0.4)';
    btn.style.color = '#f87171';
    if(msgEl) msgEl.style.display = 'none';
  } else if(perm === 'denied') {
    statusEl.textContent = '🚫 ブラウザで通知がブロックされています';
    statusEl.style.color = '#f87171';
    btn.textContent = 'ブラウザ設定を開く';
    btn.style.background = 'rgba(255,255,255,0.06)';
    btn.style.borderColor = 'var(--border-color)';
    btn.style.color = 'var(--text-muted)';
    if(msgEl) { msgEl.textContent = 'ブラウザのサイト設定から通知を手動で許可してください。'; msgEl.style.display = ''; }
  } else {
    statusEl.textContent = '🔕 通知が無効です';
    statusEl.style.color = 'var(--text-muted)';
    btn.textContent = '有効にする';
    btn.style.background = 'rgba(6,182,212,0.1)';
    btn.style.borderColor = 'rgba(6,182,212,0.4)';
    btn.style.color = 'var(--cyan)';
    if(msgEl) msgEl.style.display = 'none';
  }
}

async function handlePushNotifToggle() {
  const OS = _getOneSignal();
  const perm = Notification.permission;

  if(perm === 'denied') {
    toast('ブラウザのサイト設定から通知を許可してください', 4000);
    return;
  }

  if(!OS) { toast('通知の準備ができていません'); return; }

  const isOptedIn = await OS.User.PushSubscription.optedIn.catch(() => false);

  if(perm === 'granted' && isOptedIn) {
    // 無効化
    await OS.User.PushSubscription.optOut().catch(e => console.warn(e));
    toast('プッシュ通知を無効にしました');
  } else {
    // 有効化（許可ダイアログ表示）
    await OS.Notifications.requestPermission().catch(e => console.warn(e));
    const nowOptedIn = await OS.User.PushSubscription.optedIn.catch(() => false);
    if(nowOptedIn) {
      toast('✅ プッシュ通知を有効にしました');
    } else {
      toast('通知の許可がありませんでした');
    }
  }
  refreshPushNotifUI();
}

function hideTopNotifCenter() {
  if(_topNotifRef) { _topNotifRef.off(); }
  _topNotifRef = null; _topNotifCb = null;
  _latestNotifItems = [];
}
function toggleTopNotif() {}

function renderTopNotifCenter(items) { renderAccountNotifList(items); }

function renderAccountNotifList(items = []) {
  const list = document.getElementById('top-notif-list');
  if(!list) return;
  console.log('[renderAccountNotifList] items=' + items.length);
  if(!items || !items.length) { list.innerHTML = '<div class="top-notif-empty">通知はありません</div>'; return; }
  list.innerHTML = items.map(n => {
    const icon = {invite:'🎮', roomInvite:'🎮', friendReq:'👥', friendRequest:'👥', friendAccepted:'✅', friendRoom:'🚀', devAnnounce:'📢'}[n.type] || '🔔';
    const ts = n.ts ? new Date(n.ts).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    let acts = '';
    if((n.type==='roomInvite'||n.type==='invite'||n.type==='friendRoom') && n.roomId && !n.read) acts=`<div class="top-notif-actions" onclick="event.stopPropagation()"><button class="top-notif-action-btn" onclick="topNotifJoin('${n.id}','${n.roomId}')">▶ 入室</button></div>`;
    if((n.type==='friendRequest'||n.type==='friendReq') && n.fromUid && !n.read) acts=`<div class="top-notif-actions" onclick="event.stopPropagation()"><button class="top-notif-action-btn" onclick="acceptFriendFromNotif('${n.id}','${n.fromUid}')">✓ 承認</button><button class="top-notif-action-btn top-notif-action-decline" onclick="declineFriendFromNotif('${n.id}','${n.fromUid}')">✕ 拒否</button></div>`;
    return `<div class="top-notif-item ${n.read?'':'unread'}" onclick="topNotifMarkRead('${n.id}')">
      <div class="top-notif-icon">${icon}</div>
      <div class="top-notif-body">
        <div class="top-notif-item-title">${esc(n.title||'')}</div>
        <div class="top-notif-item-text">${esc(n.body||'')}</div>
        ${acts}
      </div>
      <div class="top-notif-item-ts">${ts}</div>
      <button class="notif-delete-btn" onclick="deleteNotif('${n.id}',event)" title="削除">✕</button>
    </div>`;
  }).join('');
}
async function topNotifMarkRead(id) {
  if(!currentUser) return;
  await firebase.database().ref(`notifications/${currentUser.uid}/${id}/read`).set(true);
}
async function topNotifReadAll() {
  if(!currentUser) return;
  const snap = await firebase.database().ref(`notifications/${currentUser.uid}`).once('value');
  const updates = {};
  snap.forEach(c => { if(!c.val().read) updates[`${c.key}/read`] = true; });
  if(Object.keys(updates).length) await firebase.database().ref(`notifications/${currentUser.uid}`).update(updates);
  unreadNotifCount = 0;
  updateHeroAccountBtn();
  updateNotifBadge();
  // 両パネル（アカウントページ・ドロワー）を最新化
  if(_topNotifDrawerOpen) loadTopNotifDrawer();
  // _latestNotifItemsを既読状態に同期
  _latestNotifItems = _latestNotifItems.map(n => ({ ...n, read: true }));
  renderAccountNotifList(_latestNotifItems);
}
async function topNotifJoin(notifId, roomId) {
  await topNotifMarkRead(notifId);
  document.getElementById('in-room').value = roomId;
  show('top');
  toast(`ルームID ${roomId} をセットしました`);
}



function openFeedback(){ document.getElementById('modal-feedback').classList.add('active'); }
function closeFeedback(){ document.getElementById('modal-feedback').classList.remove('active'); }


function getRoomUrl() {
  if(window.location.protocol === 'file:') return `https://astro-root.com/q-room/?r=${rId}`;
  const base = window.location.origin + window.location.pathname.replace(/\/q-room\/.*/, '/q-room/').replace(/([^/])$/, '$1/');
  return `${base}?r=${rId}`;
}

function showRoomInfo(isCreate) {
  document.getElementById('room-info-title').innerText = isCreate ? 'ROOM CREATED' : 'ROOM JOINED';
  document.getElementById('share-room-id').innerText = rId;
  const url = getRoomUrl();
  document.getElementById('share-room-url').innerText = url;
  document.getElementById('btn-native-share').style.display = (navigator.share ? 'flex' : 'none');
  document.getElementById('modal-room-info').classList.add('active');
}

function closeRoomInfo() { document.getElementById('modal-room-info').classList.remove('active'); }

function copyShareId() {
  navigator.clipboard.writeText(rId);
  const btn = document.getElementById('btn-copy-id');
  btn.innerText = 'COPIED!'; btn.classList.add('copied');
  setTimeout(() => { btn.innerText = 'COPY'; btn.classList.remove('copied'); }, 2000);
}

function copyShareUrl() {
  navigator.clipboard.writeText(getRoomUrl());
  const btn = document.getElementById('btn-copy-url');
  btn.innerText = 'COPIED!'; btn.classList.add('copied');
  setTimeout(() => { btn.innerText = 'COPY'; btn.classList.remove('copied'); }, 2000);
}

function nativeShare() {
  if(!navigator.share) return;
  navigator.share({
    title: 'Q-Room クイズ対戦しよう！',
    text: `🎮 Q-Roomでクイズ対戦しよう！\nRoom ID: ${rId}\n名前を入力して参加してね👇`,
    url: getRoomUrl()
  }).catch(() => {});
}

function copyUrl(){ navigator.clipboard.writeText(getRoomUrl()); toast('URL copied'); }
function copyId(){ navigator.clipboard.writeText(rId); toast('ID copied'); }


function tweetApp() {
  const text = `🎮オンラインクイズルーム「Q-Room」を今すぐチェック！\nタイムレース、アタック風サバイバル、螺旋階段など豊富なルール対応✨\n#クイズQRoom #クイズ`;
  const url = 'https://astro-root.com/q-room/';
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
}

function tweetInvite() {
  if(!rId) return;
  const url = getRoomUrl();
  const text = `🎮 Q-Roomでクイズ対戦しよう！\nRoom ID: ${rId}\n下のURLから参加してね👇\n#クイズQRoom`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
}

function tweetResult() {
  if(!roomData || !roomData.players) return;
  const r = roomData.rule;
  const sorted = sortPlayers(roomData.players, r).filter(x => x[1].st !== 'spec');
  const top3 = sorted.slice(0, 3).map(([, p], i) => {
    const medal = ['🥇','🥈','🥉'][i];
    const sc = ['survival','free','freeze','m_n_rest','swedish','ren_wrong'].includes(r) ? p.c : (p.sc || 0);
    return `${medal} ${p.name}（${sc}pt）`;
  }).join('\n');
  const text = `Q-Roomクイズ結果🏆\n【${document.getElementById('sel-rule').options[document.getElementById('sel-rule').selectedIndex].text}】\n\n${top3}\n\n#クイズQRoom`;
  const url = 'https://astro-root.com/q-room/';
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
}


function changeRuleUI(skipRender=false) {
  const r = document.getElementById('sel-rule').value;
  const c = (roomData && roomData.rule === r && roomData.conf) ? roomData.conf : DEF_CONF[r];
  let h = '';
  const mkn = (id,lbl,v) => `<div class="field"><label>${lbl}</label><input type="number" id="c_${id}" value="${v !== undefined ? v : ''}"></div>`;
  const mks = (id,lbl,v,opts) => `<div class="field"><label>${lbl}</label><select id="c_${id}">${opts.map(o=>`<option value="${o.v}" ${v===o.v?'selected':''}>${o.l}</option>`).join('')}</select></div>`;
  
  if(r==='survival'||r==='updown'||r==='ren_wrong') h = `<div class="s-grid">${mkn('m','勝ち抜け',c.m)}${mkn('n','失格',c.n)}</div>`;
  else if(r==='rentou') h = `<div class="s-grid">${mkn('m','勝ち抜け',c.m)}${mkn('n','失格',c.n)}</div>${mks('mode','連答モード',c.mode||'fast',[{v:'fast',l:'加速'},{v:'const',l:'等速'}])}`;
  else if(r==='free') h = '';
  else if(r==='newyork') h = `<div class="s-grid">${mkn('m','正解加点',c.m)}${mkn('n','誤答減点',c.n)}</div><div class="s-grid">${mkn('win','勝ち抜け',c.win)}${mkn('lose','失格',c.lose)}</div>`;
  else if(r==='by') h = `<div class="s-grid">${mkn('m','初期誤答pt/定数',c.m)}${mkn('n','失格回数',c.n)}</div>`;
  else if(r==='freeze'||r==='m_n_rest') h = `<div class="s-grid">${mkn('m','勝ち抜け',c.m)}${mkn('n',r==='freeze'?'失格':'休み数',c.n)}</div>`;
  else if(r==='swedish') h = `<div class="s-grid">${mkn('m','勝ち抜け',c.m)}${mkn('n','失格×数',c.n)}</div>`;
  else if(r==='divide') h = `<div class="s-grid">${mkn('init','初期値',c.init)}${mkn('add','正解加点',c.add)}</div><div class="field">${mkn('win','勝ち抜け',c.win)}</div>`;
  else if(r==='combo') h = `<div class="s-grid">${mkn('win','勝ち抜け',c.win)}${mkn('lose','失格',c.lose)}</div>`;
  else if(r==='attack_surv') h = `<div class="s-grid">${mkn('life','初期ライフ',c.life)}${mkn('dmg_to_oth','自正解時他減',c.dmg_to_oth)}${mkn('heal','自正解時自加',c.heal)}${mkn('dmg_to_me','自誤時自減',c.dmg_to_me)}</div><div class="field">${mkn('surv','終了人数',c.surv)}</div>`;
  else if(r==='lucky') h = `<div class="s-grid">${mkn('win','勝ち抜け',c.win)}${mkn('lose','失格',c.lose)}</div><div class="field">${mkn('max','乱数最大',c.max)}</div>`;
  else if(r==='spiral') h = `<div class="s-grid">${mkn('up','正解上昇',c.up)}${mkn('down','誤答下降',c.down)}${mkn('top_req','最上位要正解',c.top_req)}${mkn('btm_req','最下位要誤答',c.btm_req)}</div>`;
  else if(r==='time_race') {
    const limitM = Math.floor((c.limit||300) / 60);
    const limitS = (c.limit||300) % 60;
    h = `<div class="s-grid">
      <div class="field"><label>制限時間 (分)</label><input type="number" id="c_limit_m" value="${limitM}" min="0" max="99"></div>
      <div class="field"><label>制限時間 (秒)</label><input type="number" id="c_limit_s" value="${limitS}" min="0" max="59"></div>
    </div>
    <div class="s-grid">${mkn('correct_pt','正解 +pt',c.correct_pt)}${mkn('wrong_pt','誤答 -pt',c.wrong_pt)}</div>`;
  }
  else if(r==='board_quiz') h = `
    <div class="s-grid">${mkn('m','正解 +pt',c.m)}${mkn('n','誤答 -pt',c.n)}</div>
    <div class="s-grid">${mkn('x','少数正解閾値(人以下)',c.x)}${mkn('y','少数ボーナス +pt',c.y)}</div>
    <div class="s-grid">${mkn('a','ボタン押し正解 +pt',c.a)}${mkn('z','ボタン押し誤答 -pt',c.z)}</div>
    <div style="margin-top:4px;padding:12px 16px;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.25);border-radius:12px;font-size:0.82rem;color:var(--text-muted);line-height:1.6;">
      ① 司会者は「🎙 HOST」ボタンで担当を設定<br>
      ② プレイヤーは回答を入力 → 「📝 提出」<br>
      ③ 司会者が「解答オープン」→ 各プレイヤーを◯/✕判定<br>
      ④「次の問題」で回答をリセット・少数正解ボーナスを適用
    </div>`;

  document.getElementById('config-area').innerHTML = h;

  if(!skipRender && roomData && r !== roomData.rule) {
    const ruleName = document.getElementById('sel-rule').options[document.getElementById('sel-rule').selectedIndex].text;
    const newConf = DEF_CONF[r];
    db.ref('rooms/'+rId).update({rule: r, conf: newConf});
    pushSysMsg(`ルールが「${ruleName}」に変更されました`);

    if(roomData.players) {
      const pData = JSON.parse(JSON.stringify(roomData.players));
      const sc = r === 'divide' ? (newConf.init || 10) : r === 'attack_surv' ? (newConf.life || 20) : 0;
      Object.keys(pData).forEach(k => {
        pData[k] = { ...pData[k], c:0, w:0, sc:sc, rst:0, str:0, adv:0, hist:[], winAt:0, statsAt:Date.now() };
        if(pData[k].st !== 'spec') pData[k].st = 'active';
        pData[k].board_ans = '';
        pData[k].board_btn = false;
        pData[k].board_judged = null;
      });
      db.ref(`rooms/${rId}/players`).set(pData);
      pushSysMsg('ルール変更のためスコアをリセットしました');
    }

    if(r === 'time_race') {
      const lm = (DEF_CONF.time_race.limit) * 1000;
      db.ref(`rooms/${rId}/timer`).set({state:'idle', limitMs:lm, remaining:lm, startAt:null, cdStartAt:null});
    }
    if(r === 'board_quiz') {
      db.ref(`rooms/${rId}/board_phase`).set('input');
      db.ref(`rooms/${rId}/board_host`).remove();
    }
  }
}

function updateConf() {
  if(!roomData) return;
  let nc = {};
  document.querySelectorAll('#config-area input').forEach(el => {
    const key = el.id.replace('c_', '');
    if(key !== 'limit_m' && key !== 'limit_s') nc[key] = parseInt(el.value) || 0;
  });
  document.querySelectorAll('#config-area select').forEach(el => nc[el.id.replace('c_','')] = el.value);

  // time_race: 分・秒フィールドを合算して limit（秒）に変換
  if(roomData.rule === 'time_race') {
    const mEl = document.getElementById('c_limit_m');
    const sEl = document.getElementById('c_limit_s');
    if(mEl && sEl) {
      const m = Math.max(0, parseInt(mEl.value) || 0);
      const s = Math.max(0, Math.min(59, parseInt(sEl.value) || 0));
      nc.limit = m * 60 + s;
      if(nc.limit < 1) nc.limit = 1;
    }
  }

  if(Object.keys(nc).length > 0) {
    db.ref(`rooms/${rId}/conf`).update(nc);
    if(roomData.rule === 'time_race' && nc.limit !== undefined) {
      const limitMs = nc.limit * 1000;
      db.ref(`rooms/${rId}/timer`).transaction(cur => {
        if(!cur) return cur;
        if(cur.limitMs !== limitMs) {
          const oldLimit = cur.limitMs || limitMs;
          cur.limitMs = limitMs;
          if(cur.state === 'idle') {
            cur.remaining = limitMs;
          } else if(cur.state === 'paused') {
            const elapsed = oldLimit - (cur.remaining || oldLimit);
            cur.remaining = Math.max(0, limitMs - Math.max(0, elapsed));
          }
        }
        return cur;
      });
    }
  }
}


function sortPlayers(pl, rule) {
  return Object.entries(pl).sort((a,b) => {
    const p1=a[1], p2=b[1];
    const rs = v=>v==='win'?0:v==='active'?1:v==='lose'?2:3;
    if(rs(p1.st) !== rs(p2.st)) return rs(p1.st) - rs(p2.st);
    if(p1.st === 'win' && p2.st === 'win') return (p1.winAt||0) - (p2.winAt||0);
    let m1=p1.sc||0, m2=p2.sc||0;
    if(['survival','free','freeze','m_n_rest','swedish','ren_wrong'].includes(rule)){ m1=p1.c; m2=p2.c; }
    else if(rule==='by') { m1=p1.sc; m2=p2.sc; }
    else if(rule==='board_quiz') { m1=p1.sc||0; m2=p2.sc||0; }
    if(m1 !== m2) return m2 - m1;
    if(p1.w !== p2.w) return p1.w - p2.w;
    return (p1.statsAt||p1.joined||0) - (p2.statsAt||p2.joined||0);
  });
}

function calcRanks(sorted) {
  const ranks = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      ranks.push(1);
    } else {
      const prev = sorted[i-1][1];
      const cur  = sorted[i][1];
      if (prev.st === cur.st && prev.c === cur.c && prev.w === cur.w) {
        ranks.push(ranks[i-1]);
      } else {
        ranks.push(i + 1);
      }
    }
  }
  return ranks;
}


function renderPlayers() {
  const pl = roomData.players || {};
  const r = roomData.rule;
  const sorted = sortPlayers(pl, r);
  
  document.getElementById('timer-panel').classList.toggle('visible', r === 'time_race');
  // time_race時はタイマーパネルが表示されるが◯×パネルも必ず表示する
  const myPanel = document.getElementById('mypanel');
  if(myPanel) myPanel.style.display = '';
  
  const isHostMe = r === 'board_quiz' && roomData.board_host === myId;
  const boardPhase = roomData.board_phase || 'input';
  
  let h = '';
  const ranks = calcRanks(sorted);
  sorted.forEach(([id, p], idx) => {
    const isMe = id===myId;
    let cls = p.st==='win'?'win':p.st==='lose'?'lose':p.st==='spec'?'spec':'';
    if(isMe && !cls) cls = 'me';
    let sv = p.sc||0;
    if(['survival','free','freeze','m_n_rest','swedish','ren_wrong'].includes(r)) sv = p.c;
    else if(r==='by') sv = p.sc||0;
    else if(r==='time_race') sv = p.sc||0;
    else if(r==='board_quiz') sv = p.sc||0;
    
    let wtxt = p.w;
    if(r==='swedish'||r==='ren_wrong') wtxt = p.w + '×';
    
    let sub = '';
    if(p.rst > 0) sub += `<span style="color:var(--yellow)">休:${p.rst}</span> `;
    if(p.str > 0) sub += `<span style="color:var(--cyan)">連:${p.str}</span> `;
    if(p.adv > 0) sub += `<span style="color:var(--red)">DAdv!</span> `;
    if(r==='board_quiz' && roomData.board_host===id) sub += `<span style="color:var(--magenta)">🎙HOST</span> `;

    const pIcon = p.iconUrl
      ? `<img src="${p.iconUrl}" style="width:1.1rem;height:1.1rem;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:3px;">`
      : (p.icon ? `<span class="pcard-account-icon">${p.icon}</span>` : '');
    const pTitle = p.title ? `<span style="font-size:0.68rem;color:var(--text-muted);margin-left:6px;">${esc(p.title)}</span>` : '';
    
    let boardSection = '';
    if(r === 'board_quiz') {
      if(isHostMe && id !== myId && p.st === 'active') {
        if(boardPhase === 'open') {
          const ans = p.board_ans || '';
          const buzzMark = p.board_btn ? ' <span class="board-buzz-mark">🔔BUZZ</span>' : '';
          const judged = p.board_judged;
          if(!judged) {
            boardSection = `
              <div class="board-row">
                <div class="board-ans-host">${esc(ans) || '<em style="opacity:.4">（未回答）</em>'}${buzzMark}</div>
                <div class="board-judge-btns">
                  <button class="board-judge-o" onclick="boardJudge('${id}',true)">◯</button>
                  <button class="board-judge-x" onclick="boardJudge('${id}',false)">✕</button>
                </div>
              </div>`;
          } else {
            boardSection = `
              <div class="board-row">
                <div class="board-ans-host ${judged==='correct'?'board-judged-correct':'board-judged-wrong'}">${esc(ans) || '（未回答）'}${buzzMark} → ${judged==='correct'?'◯':'✕'}</div>
              </div>`;
          }
        } else {
          const submitted = !!(p.board_ans);
          boardSection = `<div class="board-row"><div class="board-phase-hint">${submitted ? '✅ 回答済み' : '⏳ 未回答'}</div></div>`;
        }
      } else if(!isHostMe && isMe && p.st === 'active') {
        const myAns = p.board_ans || '';
        const buzOn = !!p.board_btn;
        boardSection = `<div class="board-row board-my-row">
          <span class="board-my-ans">${myAns ? esc(myAns) : '<em style="opacity:.4">未提出</em>'}</span>
          ${buzOn ? '<span class="board-buzz-on">🔔 BUZZ中</span>' : ''}
          ${p.board_judged==='correct'?'<span class="board-result-o">◯</span>':p.board_judged==='wrong'?'<span class="board-result-x">✕</span>':''}
        </div>`;
      } else if(!isHostMe && !isMe && boardPhase === 'open') {
        const ans = p.board_ans || '';
        const judged = p.board_judged;
        boardSection = `<div class="board-row">
          <div class="board-ans-open">${esc(ans) || '<em style="opacity:.4">（未回答）</em>'}</div>
          ${judged==='correct'?'<span class="board-result-o">◯</span>':judged==='wrong'?'<span class="board-result-x">✕</span>':''}
        </div>`;
      }
    }
    
    h += `
    <div class="pcard ${cls}">
      <div class="rank-num">${ranks[idx]}</div>
      <div class="p-main">
        <div class="p-name">${pIcon}${esc(p.name)}${pTitle} ${isMe?'<span class="badge b-you">YOU</span>':''}${isAdmin()&&!isMe?`<button class="kick-btn" onclick="kickPlayer('${id}')">✕</button>`:''}</div>
        <div class="p-stats">
          <span class="c">◯ ${p.c}</span>
          <span class="w">✕ ${wtxt}</span>
        </div>
        ${boardSection}
      </div>
      <div class="score-box">
        <div class="score-val">${sv}</div>
        <div class="score-sub">${p.st==='win'?'<span class="st-win">WIN</span>':p.st==='lose'?'<span class="st-lose">LOSE</span>':sub}</div>
      </div>
    </div>`;
  });
  document.getElementById('plist').innerHTML = h;
  
  const me = pl[myId];
  if(me) {
    document.getElementById('btn-role').innerText = me.st==='spec'?'🎮 JOIN':'👀 WATCH';
    const hostBtn = document.getElementById('btn-board-host');
    if(r === 'board_quiz') {
      hostBtn.style.display = '';
      const isCurrentHost = roomData.board_host === myId;
      hostBtn.innerText = isCurrentHost ? '🎙 HOST解除' : '🎙 HOST';
    } else {
      hostBtn.style.display = 'none';
    }
    const ox = document.getElementById('ox-grid');
    if(r === 'board_quiz') {
      renderBoardQuizPanel(me, boardPhase, isHostMe);
    } else {
      ox.style.gridTemplateColumns = '';
      if(me.st==='spec' || me.st==='win' || me.st==='lose') ox.style.display = 'none';
      else {
        ox.style.display = 'grid';
        if(me.rst > 0) ox.innerHTML = `<button class="ox-btn btn-rest" onclick="sendAction('rest')">休み消化 (${me.rst})</button>`;
        else ox.innerHTML = `<button class="ox-btn btn-o" onclick="sendAction('correct')">◯</button><button class="ox-btn btn-x" onclick="sendAction('wrong')">✕</button>`;
      }
    }
  }
}


let boardAnsDebounce = null;

function renderBoardQuizPanel(me, boardPhase, isHostMe) {
  const ox = document.getElementById('ox-grid');
  if(isHostMe) {
    ox.style.display = 'grid';
    ox.style.gridTemplateColumns = '1fr';
    if(boardPhase === 'input') {
      ox.innerHTML = `<button class="ox-btn btn-board-open" onclick="boardOpenPhase()">📋 解答オープン</button>`;
    } else {
      const allJudged = Object.values(roomData.players || {}).filter(p => p.st === 'active').every(p => p.board_judged);
      ox.innerHTML = allJudged
        ? `<button class="ox-btn btn-board-next" onclick="boardNextQuestion()">▶ 次の問題</button>`
        : `<div class="board-judged-msg" style="color:var(--text-muted);font-size:0.9rem;">全員を判定してください</div>
           <button class="ox-btn btn-board-next" onclick="boardNextQuestion()">▶ 次の問題（強制）</button>`;
    }
  } else {
    const currentAns = me.board_ans || '';
    const buzOn = !!me.board_btn;
    const judged = me.board_judged;
    if(me.st === 'spec' || me.st === 'win' || me.st === 'lose') {
      ox.style.display = 'none';
      ox.style.gridTemplateColumns = '';
    } else if(boardPhase === 'input') {
      ox.style.display = 'grid';
      ox.style.gridTemplateColumns = '1fr 1fr';
      ox.innerHTML = `
        <div class="board-input-wrap" style="grid-column:1/-1;">
          <input type="text" id="board-ans-input" class="board-ans-field" placeholder="回答を入力…" value="${esc(currentAns)}" maxlength="80" autocomplete="off"
            oninput="boardDebouncedUpdate(this.value)"
            onkeydown="if(event.key==='Enter'){boardSubmitAns();event.preventDefault();}">
        </div>
        <button class="ox-btn btn-board-submit" onclick="boardSubmitAns()">📝 提出</button>
        <button class="ox-btn ${buzOn?'btn-board-buzz-on':'btn-board-buzz'}" onclick="boardToggleBuzz()" id="board-buzz-btn">
          ${buzOn?'🔔 BUZZ中':'🔔 BUZZ'}
        </button>`;
    } else {
      ox.style.display = 'grid';
      ox.style.gridTemplateColumns = '1fr';
      const resultIcon = judged==='correct'?'<span class="board-result-o" style="font-size:2rem;">◯</span>':judged==='wrong'?'<span class="board-result-x" style="font-size:2rem;">✕</span>':'<span style="color:var(--text-muted);font-size:0.9rem;">判定待ち…</span>';
      ox.innerHTML = `<div class="board-judged-msg">${resultIcon}</div>`;
    }
  }
}

function boardDebouncedUpdate(val) {
  clearTimeout(boardAnsDebounce);
  boardAnsDebounce = setTimeout(() => {
    if(db && rId && myId) db.ref(`rooms/${rId}/players/${myId}/board_ans`).set(val);
  }, 400);
}

async function boardSubmitAns() {
  const input = document.getElementById('board-ans-input');
  if(!input) return;
  const val = input.value.trim();
  await db.ref(`rooms/${rId}/players/${myId}/board_ans`).set(val);
  toast('✅ 提出しました');
}

async function boardToggleBuzz() {
  const me = roomData.players && roomData.players[myId];
  const cur = !!(me && me.board_btn);
  await db.ref(`rooms/${rId}/players/${myId}/board_btn`).set(!cur);
}

async function boardSetHost() {
  const isCurrentHost = roomData.board_host === myId;
  if(isCurrentHost) {
    await db.ref(`rooms/${rId}/board_host`).remove();
    await db.ref(`rooms/${rId}/players/${myId}/st`).set('active');
    toast('ホストを解除しました');
  } else {
    await db.ref(`rooms/${rId}/board_host`).set(myId);
    await db.ref(`rooms/${rId}/players/${myId}/st`).set('spec');
    await db.ref(`rooms/${rId}/board_phase`).set('input');
    toast('🎙 HOSTになりました');
  }
}

async function boardOpenPhase() {
  await db.ref(`rooms/${rId}/board_phase`).set('open');
}

async function boardJudge(pid, isCorrect) {
  if(!roomData || !roomData.players || !roomData.players[pid]) return;
  const pData = JSON.parse(JSON.stringify(roomData.players));
  const p = pData[pid];
  const c = roomData.conf || DEF_CONF.board_quiz;
  if(isCorrect) {
    p.c++;
    p.sc = (p.sc||0) + (p.board_btn ? (c.a||15) : (c.m||10));
  } else {
    p.w++;
    p.sc = (p.sc||0) - (p.board_btn ? (c.z||5) : (c.n||3));
  }
  p.board_judged = isCorrect ? 'correct' : 'wrong';
  p.statsAt = Date.now();
  await db.ref(`rooms/${rId}/players/${pid}`).update({
    c: p.c, w: p.w, sc: p.sc, board_judged: p.board_judged, statsAt: p.statsAt
  });
}

async function boardNextQuestion() {
  if(!roomData || !roomData.players) return;
  const pData = JSON.parse(JSON.stringify(roomData.players));
  const c = roomData.conf || DEF_CONF.board_quiz;
  const correctPlayers = Object.keys(pData).filter(pid => pData[pid].board_judged === 'correct');
  if(correctPlayers.length > 0 && correctPlayers.length <= (c.x||1)) {
    correctPlayers.forEach(pid => { pData[pid].sc = (pData[pid].sc||0) + (c.y||10); });
    toast(`🎯 少数正解ボーナス +${c.y||10}pt`);
  }
  Object.keys(pData).forEach(k => {
    pData[k].board_ans = '';
    pData[k].board_btn = false;
    pData[k].board_judged = null;
  });
  await db.ref(`rooms/${rId}/players`).set(pData);
  await db.ref(`rooms/${rId}/board_phase`).set('input');
}


async function kickPlayer(pid) {
  const p = roomData.players[pid];
  if(!p) return;
  if(!confirm(`${p.name} を退室させますか？`)) return;
  await db.ref(`rooms/${rId}/players/${pid}`).remove();
  toast(`${p.name} を退室させました`);
}


let _sendActionLock = false;
async function sendAction(type) {
  if(_sendActionLock) return;
  _sendActionLock = true;
  try {
  if(!roomData || !roomData.players || !roomData.players[myId]) { _sendActionLock = false; return; }
  const pData = JSON.parse(JSON.stringify(roomData.players));
  const me = pData[myId];
  if(me.st !== 'active') { _sendActionLock = false; return; }

  const r = roomData.rule;
  
  if(r === 'time_race') {
    if(!timerData || timerData.state !== 'running') {
      toast('タイマーが動いている間のみ回答できます');
      _sendActionLock = false;
      return;
    }
  }
  
  const mePrev = JSON.stringify({c:me.c, w:me.w, sc:me.sc, rst:me.rst, str:me.str, adv:me.adv, st:me.st});
  const c = roomData.conf || DEF_CONF[r];
  
  if(type === 'rest') {
    me.rst--;
  } else if(type === 'correct') {
    me.c++;
    if(r==='survival') { if(me.c >= c.m) me.st='win'; }
    else if(r==='newyork') { me.sc = (me.sc||0) + c.m; if(me.sc >= c.win) me.st='win'; }
    else if(r==='rentou') {
      if (c.mode === 'const') {
        me.sc = (me.sc||0) + (me.str>0?2:1);
        const pStr = me.str;
        me.str = pStr > 0 ? 0 : 1;
        Object.keys(pData).forEach(id => { if(id !== myId) pData[id].str = 0; });
      } else {
        me.sc = (me.sc||0) + (me.str>0?2:1);
        me.str++;
      }
      if(me.sc>=c.m) me.st='win';
    }
    else if(r==='updown') { me.sc = (me.sc||0) + 1; if(me.sc>=c.m) me.st='win'; }
    else if(r==='by') { me.sc = me.c * (c.m - me.w); if(me.sc >= c.m*c.m) me.st='win'; }
    else if(r==='freeze') { if(me.c >= c.m) me.st='win'; }
    else if(r==='m_n_rest') { if(me.c >= c.m) me.st='win'; }
    else if(r==='swedish') { if(me.c >= c.m) me.st='win'; }
    else if(r==='ren_wrong') { me.adv = 0; if(me.c >= c.m) me.st='win'; }
    else if(r==='divide') { me.sc = (me.sc||c.init)+c.add; if(me.sc>=c.win) me.st='win'; }
    else if(r==='combo') { me.str++; me.sc = (me.sc||0) + me.str; if(me.sc>=c.win) me.st='win'; }
    else if(r==='attack_surv') {
      me.sc = (me.sc||c.life)+c.heal;
      Object.keys(pData).forEach(id => {
        if(id!==myId && pData[id].st==='active') {
          pData[id].sc = (pData[id].sc||c.life)-c.dmg_to_oth;
          if(pData[id].sc<=0) pData[id].st='lose';
        }
      });
    }
    else if(r==='lucky') { me.sc = (me.sc||0) + Math.floor(Math.random()*c.max)+1; if(me.sc>=c.win) me.st='win'; }
    else if(r==='spiral') {
      let maxStep = Math.max(...Object.values(pData).filter(p=>p.st==='active').map(p=>p.sc||0));
      if((me.sc||0) >= maxStep) me.str++; else me.str=0;
      me.sc = (me.sc||0)+c.up;
      if(me.str >= c.top_req) me.st='win';
    }
    else if(r==='time_race') { me.sc = (me.sc||0) + (c.correct_pt||1); }
  } else if(type === 'wrong') {
    me.w++;
    if(r==='survival') { if(c.n > 0 && me.w >= c.n) me.st='lose'; }
    else if(r==='newyork') { me.sc = (me.sc||0) - c.n; if(me.sc <= c.lose) me.st='lose'; }
    else if(r==='rentou') { me.str=0; if(c.n > 0 && me.w >= c.n) me.st='lose'; }
    else if(r==='updown') { me.sc=0; if(c.n > 0 && me.w >= c.n) me.st='lose'; }
    else if(r==='by') { me.sc = me.c * (c.m - me.w); if(c.n > 0 && me.w >= c.n) me.st='lose'; }
    else if(r==='freeze') { me.rst += me.w; if(c.n > 0 && me.w >= c.n) me.st='lose'; }
    else if(r==='m_n_rest') { me.rst += c.n; }
    else if(r==='swedish') {
      const batsu = Math.floor((Math.sqrt(8*me.c+1)-1)/2)+1;
      me.w = (me.w-1)+batsu; 
      if(c.n > 0 && me.w >= c.n) me.st='lose';
    }
    else if(r==='ren_wrong') {
      me.w = (me.w-1) + (me.adv>0?2:1); me.adv=1;
      if(c.n > 0 && me.w >= c.n) me.st='lose';
    }
    else if(r==='divide') {
      me.sc = Math.floor((me.sc||c.init)/me.w);
      if(me.sc < 1) me.st='lose';
    }
    else if(r==='combo') { me.str=0; if(c.lose > 0 && me.w >= c.lose) me.st='lose'; }
    else if(r==='attack_surv') {
      me.sc = (me.sc||c.life)-c.dmg_to_me;
      if(me.sc<=0) me.st='lose';
    }
    else if(r==='lucky') { me.sc = (me.sc||0) - Math.floor(Math.random()*c.max)-1; if(me.sc<=c.lose) me.st='lose'; }
    else if(r==='spiral') {
      let minStep = Math.min(...Object.values(pData).filter(p=>p.st==='active').map(p=>p.sc||0));
      if((me.sc||0) <= minStep) me.adv++; else me.adv=0;
      me.sc = (me.sc||0)-c.down;
      if(me.adv >= c.btm_req) me.st='lose';
    }
    else if(r==='time_race') { me.sc = (me.sc||0) - (c.wrong_pt||1); }
  }

  me.hist = me.hist || [];
  me.hist.unshift(mePrev);
  if(me.hist.length > 5) me.hist.length = 5;

  const prevParsed = JSON.parse(mePrev);
  if (me.c !== prevParsed.c || me.w !== prevParsed.w) me.statsAt = Date.now();
  if (me.st === 'win' && prevParsed.st !== 'win') me.winAt = Date.now();

  // 自分のデータだけ書く（全員分書くより大幅に速い）
  await db.ref(`rooms/${rId}/players/${myId}`).update(me);

  // 他プレイヤーのデータも変わるルールは追加書き込み
  if(r === 'attack_surv' || (r === 'rentou' && type === 'correct' && (c.mode === 'const'))) {
    const otherUpdates = {};
    Object.entries(pData).forEach(([id, p]) => { if(id !== myId) otherUpdates[id] = p; });
    if(Object.keys(otherUpdates).length > 0) {
      await db.ref(`rooms/${rId}/players`).update(otherUpdates);
    }
  }
  
  if(currentUser && (type === 'correct' || type === 'wrong')) {
    updateAccountStats(type, me.st === 'win' && JSON.parse(mePrev).st !== 'win');
  }
  
  if(r==='attack_surv') {
    const act = Object.values(pData).filter(p=>p.st==='active').length;
    if(act <= c.surv) await db.ref(`rooms/${rId}/status`).set('finished');
  }
  } finally {
    _sendActionLock = false;
  }
}

async function reqUndo() {
  if(!roomData || !roomData.players || !roomData.players[myId]) return;
  const me = roomData.players[myId];
  if(!me.hist || me.hist.length === 0) return;
  const hist = [...me.hist];
  const prevState = JSON.parse(hist.shift());
  prevState.hist = hist;
  await db.ref(`rooms/${rId}/players/${myId}`).update(prevState);
  toast('↩ UNDO done!');
}

async function toggleRole() {
  const me = roomData.players[myId];
  await db.ref(`rooms/${rId}/players/${myId}/st`).set(me.st==='spec'?'active':'spec');
}

async function resetPoints() {
  if(!confirm('全員のスコアをリセットしますか？')) return;
  const pData = JSON.parse(JSON.stringify(roomData.players));
  const c = roomData.conf || {};
  const sc = roomData.rule==='divide' ? (c.init || 10) : roomData.rule==='attack_surv' ? (c.life || 20) : 0;
  Object.keys(pData).forEach(k => {
    pData[k] = { ...pData[k], c:0, w:0, sc:sc, rst:0, str:0, adv:0, hist:[], winAt:0, statsAt:Date.now() };
    if(pData[k].st !== 'spec') pData[k].st = 'active';
    if(roomData.rule === 'board_quiz') {
      pData[k].board_ans = '';
      pData[k].board_btn = false;
      pData[k].board_judged = null;
    }
  });
  await db.ref(`rooms/${rId}/players`).set(pData);
  if(roomData.rule === 'time_race') {
    const lm = (c.limit||300) * 1000;
    await db.ref(`rooms/${rId}/timer`).set({state:'idle', limitMs:lm, remaining:lm, startAt:null, cdStartAt:null});
  }
  closeModal(); toast('リセットしました');
}

async function endGame() {
  if(confirm('ゲームを終了しますか？')) {
    await db.ref(`rooms/${rId}/status`).set('finished');
    closeModal();
  }
}


function renderResult() {
  show('result');
  const pl = roomData.players || {};
  const r = roomData.rule;
  const sorted = sortPlayers(pl, r).filter(x => x[1].st !== 'spec');
  const ranks = calcRanks(sorted);
  let h = '';
  sorted.forEach(([id, p], idx) => {
    let sv = p.sc||0;
    if(['survival','free','freeze','m_n_rest','swedish','ren_wrong'].includes(r)) sv = p.c;
    else if(r==='by') sv = p.sc||0;
    else if(r==='time_race') sv = p.sc||0;
    let mst = p.st==='win'?'WIN':p.st==='lose'?'LOSE':'-';
    h += `
    <div class="pcard ${p.st==='win'?'win':p.st==='lose'?'lose':''}">
      <div class="rank-num">${ranks[idx]}</div>
      <div class="p-main">
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-stats"><span class="c">◯ ${p.c}</span><span class="w">✕ ${p.w}</span></div>
      </div>
      <div class="score-box">
        <div class="score-val">${sv}</div>
        <div class="score-sub" style="color:${p.st==='win'?'var(--green)':p.st==='lose'?'var(--red)':''}">${mst}</div>
      </div>
    </div>`;
  });
  document.getElementById('rlist').innerHTML = h;
}


function getMyName(fallback='') {
  if(roomData && roomData.players && roomData.players[myId] && roomData.players[myId].name)
    return roomData.players[myId].name;
  return fallback || localStorage.getItem('qr_name') || 'Player';
}

function initChat(playerName='') {
  const stampsEl = document.getElementById('chat-stamps');
  stampsEl.innerHTML = STAMPS.map(s =>
    `<button class="stamp-btn" onclick="sendStamp('${s}')">${s}</button>`
  ).join('');

  if(chatRef) chatRef.off('child_added', chatCb);
  lastSeenMsgTs = Date.now();
  chatRef = db.ref(`rooms/${rId}/chat`).limitToLast(100);
  chatCb = chatRef.on('child_added', snap => {
    const msg = snap.val();
    renderChatMsg(msg);
    if(!chatOpen && msg.ts > lastSeenMsgTs && msg.playerId !== myId) {
      chatUnread++;
      updateChatBadge();
    }
  });
}

function renderChatMsg(msg) {
  const isMe = msg.playerId === myId;
  const isSys = msg.type === 'system';
  const isStamp = msg.type === 'stamp';
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  if(isSys) {
    div.className = 'chat-sys';
    div.innerText = msg.text;
  } else {
    div.className = `chat-msg ${isMe?'me':'other'}`;
    div.innerHTML = `
      <div class="chat-msg-name">${esc(msg.playerName)}</div>
      <div class="${isStamp ? 'chat-msg-stamp' : 'chat-msg-bubble'}">${esc(msg.text)}</div>`;
  }
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function updateChatBadge() {
  const badge = document.getElementById('chat-badge');
  if(chatUnread > 0) { badge.textContent = chatUnread > 9 ? '9+' : chatUnread; badge.style.display = 'flex'; }
  else badge.style.display = 'none';
}

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-drawer').classList.toggle('open', chatOpen);
  document.getElementById('chat-overlay').classList.toggle('show', chatOpen);
  if(chatOpen) {
    chatUnread = 0;
    updateChatBadge();
    lastSeenMsgTs = Date.now();
    const el = document.getElementById('chat-messages');
    el.scrollTop = el.scrollHeight;
  }
}

async function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if(!text || !db || !rId) return;
  input.value = '';
  await db.ref(`rooms/${rId}/chat`).push({
    type: 'text', text,
    playerId: myId, playerName: getMyName(),
    ts: firebase.database.ServerValue.TIMESTAMP
  });
}

async function sendStamp(stamp) {
  if(!db || !rId) return;
  await db.ref(`rooms/${rId}/chat`).push({
    type: 'stamp', text: stamp,
    playerId: myId, playerName: getMyName(),
    ts: firebase.database.ServerValue.TIMESTAMP
  });
}

async function pushSysMsg(text) {
  if(!db || !rId) return;
  await db.ref(`rooms/${rId}/chat`).push({
    type: 'system', text, ts: firebase.database.ServerValue.TIMESTAMP
  });
}


let timerInterval = null;
let timerData = null;
let timerRef = null;
let timerCb = null;
let cdInterval = null;
let cdStartTimeout = null;
let _timerFinishPlayed = false;
let _lastCdStartAt = null;
let _lastStartAt = null;

// ===== 時間切れ演出：点滅 + 音 =====
function _playTimerFinishEffect() {
  if(_timerFinishPlayed) return;
  _timerFinishPlayed = true;

  // --- 点滅アニメーション（画面全体）---
  document.body.classList.add('timer-finish-flash');
  setTimeout(() => document.body.classList.remove('timer-finish-flash'), 6000);

  // --- Web Audio API でビープ音 ---
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // ドン・ドン・ドン・ドーン の4音パターン
    const beeps = [
      { t: 0,    freq: 880, dur: 0.12, vol: 0.6 },
      { t: 0.18, freq: 880, dur: 0.12, vol: 0.6 },
      { t: 0.36, freq: 880, dur: 0.12, vol: 0.6 },
      { t: 0.60, freq: 660, dur: 0.55, vol: 0.9 },
    ];
    beeps.forEach(({ t, freq, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t);
      gain.gain.setValueAtTime(vol, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    });
    // 1.5秒後にコンテキストを閉じる
    setTimeout(() => ctx.close().catch(() => {}), 1800);
  } catch(e) {
    console.warn('[TimerFinish] 音声再生失敗:', e);
  }
}

function initTimerListener() {
  if(timerRef) { timerRef.off('value', timerCb); timerRef = null; }
  timerRef = db.ref(`rooms/${rId}/timer`);
  timerCb = timerRef.on('value', snap => {
    timerData = snap.val();
    updateTimerDisplay();
  });
}

function formatMs(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

let _prevTimerState = null;

function setTimerBtn(state) {
  const btn = document.getElementById('timer-btn-startstop');
  if(!btn) return;
  if(state === 'running' || state === 'countdown') {
    btn.textContent = '⏸ STOP';
    btn.disabled = false;
    btn.className = 'timer-btn timer-btn-stop';
  } else if(state === 'finished') {
    btn.textContent = '▶ START';
    btn.disabled = true;
    btn.className = 'timer-btn timer-btn-start';
  } else {
    btn.textContent = '▶ START';
    btn.disabled = false;
    btn.className = 'timer-btn timer-btn-start';
  }
}

function showGoAndHide(co) {
  const numEl = document.getElementById('countdown-num');
  numEl.textContent = 'GO!';
  numEl.style.animation = 'none';
  void numEl.offsetWidth;
  numEl.style.animation = 'cdPop 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
  co.classList.add('show');
  setTimeout(() => { co.classList.remove('show'); }, 1500);
}

function updateTimerDisplay() {
  if(!timerData) return;
  const disp = document.getElementById('timer-display');
  const co = document.getElementById('countdown-overlay');
  if(!disp) return;

  const { state, startAt, remaining, limitMs, cdStartAt } = timerData;

  // ── ガード（ここより前は _prevTimerState も interval も触らない）──
  if(state === 'countdown') {
    if(!cdStartAt) return;
    if(cdStartAt === _lastCdStartAt) return;
  }
  if(state === 'running') {
    if(!startAt) return;
    if(startAt === _lastStartAt) return;
  }

  // ── ここから実処理 ──
  const prevState = _prevTimerState;
  _prevTimerState = state;

  if(prevState === 'finished' && state !== 'finished') {
    _timerFinishPlayed = false;
  }

  clearInterval(timerInterval); timerInterval = null;
  clearInterval(cdInterval); cdInterval = null;

  setTimerBtn(state);

  if(state === 'countdown') {
    _lastCdStartAt = cdStartAt;

    co.classList.add('show');
    disp.textContent = formatMs(remaining !== undefined ? remaining : limitMs);
    disp.className = 'timer-display';

    const serverNow = getServerTime();
    const serverElapsed = Math.max(0, serverNow - cdStartAt);
    const cdBaseRemaining = Math.max(0, 5000 - serverElapsed);
    const cdLocalStart = Date.now();

    const showNum = (n) => {
      const numEl = document.getElementById('countdown-num');
      if(!numEl) return;
      numEl.textContent = n;
      numEl.style.animation = 'none';
      void numEl.offsetWidth;
      numEl.style.animation = 'cdPop 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
    };

    // 開始時点の数字を即表示
    const initLeft = Math.min(5, Math.floor(cdBaseRemaining / 1000) + 1);
    showNum(initLeft);
    let lastShown = initLeft;

    cdInterval = setInterval(() => {
      const msLeft = Math.max(0, cdBaseRemaining - (Date.now() - cdLocalStart));
      if(msLeft <= 0) { clearInterval(cdInterval); cdInterval = null; return; }
      const left = Math.min(5, Math.floor(msLeft / 1000) + 1);
      if(left !== lastShown) { lastShown = left; showNum(left); }
    }, 50);

  } else if(state === 'running') {
    _lastStartAt = startAt;

    const startTick = () => {
      const tick = () => {
        const elapsed = Math.max(0, getServerTime() - startAt);
        const left = Math.max(0, remaining - elapsed);
        disp.textContent = formatMs(left);
        if(left <= 30000) disp.className = 'timer-display danger';
        else if(left <= 60000) disp.className = 'timer-display warning';
        else disp.className = 'timer-display';
        if(left <= 0) {
          clearInterval(timerInterval); timerInterval = null;
          db.ref(`rooms/${rId}/timer/state`).transaction(cur => {
            if(cur === 'running') return 'finished';
            return undefined;
          }).then(res => { if(res && res.committed) onTimerFinished(); });
        }
      };
      tick();
      timerInterval = setInterval(tick, 50);
    };

    if(prevState === 'countdown') {
      showGoAndHide(co);
      disp.textContent = formatMs(remaining);
      disp.className = 'timer-display';
      setTimeout(() => {
        // GO!が消えた瞬間を基準にremainingからカウントダウン
        const tickStart = Date.now();
        const startTick = () => {
          const elapsed = Math.max(0, Date.now() - tickStart);
          const left = Math.max(0, remaining - elapsed);
          disp.textContent = formatMs(left);
          if(left <= 30000) disp.className = 'timer-display danger';
          else if(left <= 60000) disp.className = 'timer-display warning';
          else disp.className = 'timer-display';
          if(left <= 0) {
            clearInterval(timerInterval); timerInterval = null;
            db.ref(`rooms/${rId}/timer/state`).transaction(cur => {
              if(cur === 'running') return 'finished';
              return undefined;
            }).then(res => { if(res && res.committed) onTimerFinished(); });
          }
        };
        startTick();
        timerInterval = setInterval(startTick, 50);
      }, 1500);
    } else {
      co.classList.remove('show');
      startTick();
    }

  } else if(state === 'paused' || state === 'idle') {
    co.classList.remove('show');
    const rem = (state === 'paused') ? (remaining !== undefined ? remaining : 0) : (limitMs || 300000);
    disp.textContent = formatMs(rem);
    if(rem <= 30000) disp.className = 'timer-display danger';
    else if(rem <= 60000) disp.className = 'timer-display warning';
    else disp.className = 'timer-display';

  } else if(state === 'finished') {
    co.classList.remove('show');
    disp.textContent = '00:00';
    disp.className = 'timer-display danger';
    _playTimerFinishEffect();
  }
}

async function timerAction(action) {
  if(!rId || !db) return;

  const conf = (roomData && roomData.conf) ? roomData.conf : DEF_CONF.time_race;
  const limitMs = (conf.limit || 300) * 1000;
  const td = timerData || {};

  if(action === 'toggle') {
    if(td.state === 'running' || td.state === 'countdown') action = 'stop';
    else action = 'start';
  }

  let confirmMsg = '';
  if(action === 'start') confirmMsg = 'タイマーをスタート（再開）しますか？';
  else if(action === 'stop') confirmMsg = 'タイマーをストップ（一時停止）しますか？';
  else if(action === 'reset') confirmMsg = 'タイマーをリセットしますか？';
  if(!confirm(confirmMsg)) return;

  if(action === 'start') {
    if(td.state === 'running' || td.state === 'countdown') return;
    const currentRemaining = (td.state === 'paused') ? (td.remaining !== undefined ? td.remaining : limitMs) : limitMs;
    const cdStartAt = getServerTime();
    await db.ref(`rooms/${rId}/timer`).set({
      state: 'countdown', cdStartAt,
      remaining: currentRemaining, limitMs: td.limitMs || limitMs, startAt: null
    });
    clearTimeout(cdStartTimeout);
    cdStartTimeout = setTimeout(async () => {
      const snap = await db.ref(`rooms/${rId}/timer/state`).once('value');
      if(snap.val() === 'countdown') {
        const remSnap = await db.ref(`rooms/${rId}/timer/remaining`).once('value');
        const rem = remSnap.val() !== null ? remSnap.val() : currentRemaining;
        const startAt = getServerTime();
        await db.ref(`rooms/${rId}/timer`).update({
          state: 'running',
          startAt,
          remaining: rem
        });
      }
    }, 5000);

  } else if(action === 'stop') {
    clearTimeout(cdStartTimeout);
    if(td.state === 'countdown') {
      await db.ref(`rooms/${rId}/timer`).update({ state: 'paused' });
      return;
    }
    if(td.state !== 'running') return;
    const elapsed = td.startAt ? getServerTime() - td.startAt : 0;
    const currentRemaining = Math.max(0, (td.remaining !== undefined ? td.remaining : limitMs) - elapsed);
    await db.ref(`rooms/${rId}/timer`).update({ state: 'paused', remaining: currentRemaining });

  } else if(action === 'reset') {
    clearTimeout(cdStartTimeout);
    clearInterval(timerInterval); timerInterval = null;
    clearInterval(cdInterval); cdInterval = null;
    _lastCdStartAt = null;
    _lastStartAt = null;
    const conf2 = (roomData && roomData.conf) ? roomData.conf : DEF_CONF.time_race;
    const lm = (conf2.limit || 300) * 1000;
    await db.ref(`rooms/${rId}/timer`).set({ state: 'idle', limitMs: lm, remaining: lm, startAt: null, cdStartAt: null });
  }
}

// タイマー時間切れ時の処理（リザルト画面には遷移しない）
function onTimerFinished() {
  // 演出は updateTimerDisplay の finished ブランチが担当
  // スコアによる勝敗フラグだけ立てる（画面遷移なし）
  _applyTimeRaceResults();
}

async function _applyTimeRaceResults() {
  if(!roomData || !roomData.players) return;
  const pData = JSON.parse(JSON.stringify(roomData.players));
  const actives = Object.values(pData).filter(p => p.st === 'active');
  if(actives.length === 0) return;
  const maxSc = Math.max(...actives.map(p => p.sc || 0));
  Object.keys(pData).forEach(k => {
    if(pData[k].st === 'active') pData[k].st = (pData[k].sc || 0) >= maxSc ? 'win' : 'lose';
  });
  await db.ref(`rooms/${rId}/players`).update(pData);
  // status は 'finished' にしない → リザルト画面に自動遷移しない
}

async function finishTimeRace() {
  if(!roomData || !roomData.players) return;
  const pData = JSON.parse(JSON.stringify(roomData.players));
  const actives = Object.values(pData).filter(p => p.st === 'active');
  if(actives.length === 0) return;
  const maxSc = Math.max(...actives.map(p => p.sc || 0));
  Object.keys(pData).forEach(k => {
    if(pData[k].st === 'active') pData[k].st = (pData[k].sc || 0) >= maxSc ? 'win' : 'lose';
  });
  await db.ref(`rooms/${rId}/players`).update(pData);
  await db.ref(`rooms/${rId}/status`).set('finished');
}


function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') !== 'light';
  const newTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  const icon = newTheme === 'light' ? '🌙' : '☀️';
  ['theme-icon','theme-icon-room'].forEach(id => { const el = document.getElementById(id); if(el) el.textContent = icon; });
  try { localStorage.setItem('q-room-theme', newTheme); } catch(e) {}
}
(function() {
  try {
    const saved = localStorage.getItem('q-room-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.addEventListener('DOMContentLoaded', () => {
        ['theme-icon','theme-icon-room'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '🌙';
        });
      });
    }
  } catch(e) {}
})();

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


function listenNotifications() {
  // initTopNotifCenter がすでにリスナーを張っているので、
  // ルーム入室時はベルボタンのバッジ更新だけ追加で行う
  if(!currentUser) return;
  updateNotifBadge();
  // initTopNotifCenter のコールバックが _notifOpen を確認してルーム内パネルも更新するので追加リスナー不要
}

function stopNotifListener() {
  // notifRef は initTopNotifCenter に統合したため、ここでは何もしない
  if(notifRef && notifCb) { notifRef.off('value', notifCb); notifRef = null; notifCb = null; }
}

function updateNotifBadge() {
  updateHeroAccountBtn();
  // トップページのベルバッジ
  const topBellBadge = document.getElementById('top-bell-badge');
  if(topBellBadge) {
    if(unreadNotifCount > 0) {
      topBellBadge.textContent = unreadNotifCount > 9 ? '9+' : unreadNotifCount;
      topBellBadge.style.display = '';
    } else {
      topBellBadge.style.display = 'none';
    }
  }
  // roomヘッダーのbell badge
  const badge = document.getElementById('notif-badge');
  if(!badge) return;
  if(unreadNotifCount > 0) {
    badge.textContent = unreadNotifCount > 9 ? '9+' : unreadNotifCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifPanel() {
  if(!currentUser) { showAccountPage(); return; }
  const drawer = document.getElementById('notif-drawer');
  const overlay = document.getElementById('notif-overlay');
  _notifOpen = !_notifOpen;
  drawer.classList.toggle('open', _notifOpen);
  overlay.classList.toggle('show', _notifOpen);
  if(_notifOpen) loadAndRenderNotifs();
}

async function loadAndRenderNotifs() {
  if(!currentUser) return;
  const snap = await db.ref('notifications/' + currentUser.uid).once('value');
  const items = [];
  snap.forEach(child => items.push({ id: child.key, ...child.val() }));
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  renderNotifList(items);
}

function renderNotifList(items) {
  const el = document.getElementById('notif-list');
  if(!el) return;
  if(items.length === 0) {
    el.innerHTML = '<div class="notif-empty">通知はありません</div>';
    return;
  }
  const typeIcon = { invite:'🎮', roomInvite:'🎮', friendReq:'👥', friendRequest:'👥', friendAccepted:'✅', friendRoom:'🚀', devAnnounce:'📢' };
  el.innerHTML = items.map(n => {
    const ts = n.ts ? formatNotifTs(n.ts) : '';
    const icon = typeIcon[n.type] || '🔔';
    let actionBtn = '';
    if((n.type === 'invite' || n.type === 'roomInvite') && n.roomId && !n.read) {
      actionBtn = `<div class="notif-actions"><button class="notif-action-btn" onclick="event.stopPropagation();joinFromNotif('${n.id}','${n.roomId}')">▶ 部屋に入る</button></div>`;
    }
    if((n.type === 'friendReq' || n.type === 'friendRequest') && n.fromUid && !n.read) {
      actionBtn = `<div class="notif-actions">
        <button class="notif-action-btn" onclick="event.stopPropagation();acceptFriendFromNotif('${n.id}','${n.fromUid}')">✓ 承認</button>
        <button class="notif-action-btn notif-action-btn-decline" onclick="event.stopPropagation();declineFriendFromNotif('${n.id}','${n.fromUid}')">✕ 拒否</button>
      </div>`;
    }
    if(n.type === 'friendRoom' && n.roomId && !n.read) {
      actionBtn = `<div class="notif-actions"><button class="notif-action-btn" onclick="event.stopPropagation();joinFromNotif('${n.id}','${n.roomId}')">▶ 部屋に入る</button></div>`;
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

function formatNotifTs(ts) {
  const diff = Date.now() - ts;
  if(diff < 60000) return '今';
  if(diff < 3600000) return Math.floor(diff/60000) + '分前';
  if(diff < 86400000) return Math.floor(diff/3600000) + '時間前';
  return Math.floor(diff/86400000) + '日前';
}

async function pushNotification(toUid, type, title, body, extra={}) {
  if(!db) { console.warn('[pushNotification] db is null, skipping'); return; }
  if(!toUid) { console.warn('[pushNotification] toUid is null/empty, skipping'); return; }
  try {
    // アプリ内通知をDBに書き込み
    await db.ref(`notifications/${toUid}`).push({
      type, title, body, read: false, ts: firebase.database.ServerValue.TIMESTAMP, ...extra
    });
    // OneSignal REST API経由でOS通知送信（External User Id = Firebase UID）
    fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: _OS_APP_ID,
        filters: [{ field: 'external_user_id', value: toUid }],
        headings: { en: title },
        contents: { en: body },
        web_url: 'https://astro-root.com/q-room/'
      })
    }).catch(e => console.warn('[OneSignal send]', e));
  } catch(e) {
    console.error('[pushNotification] ❌ error uid=' + toUid, e);
    throw e;
  }
}



async function deleteNotif(id, e) {
  e.stopPropagation();
  if(!currentUser) return;
  await db.ref(`notifications/${currentUser.uid}/${id}`).remove();
}

async function markAllNotifRead() {
  if(!currentUser) return;
  const snap = await db.ref(`notifications/${currentUser.uid}`).once('value');
  const updates = {};
  snap.forEach(child => { if(!child.val().read) updates[`${child.key}/read`] = true; });
  if(Object.keys(updates).length > 0) await db.ref(`notifications/${currentUser.uid}`).update(updates);
  loadAndRenderNotifs();
}

async function joinFromNotif(notifId, roomId) {
  await db.ref(`notifications/${currentUser.uid}/${notifId}/read`).set(true);
  toggleNotifPanel();
  document.getElementById('in-room').value = roomId;
  toast(`ルームID ${roomId} をセットしました`);
}

async function acceptFriendFromNotif(notifId, fromUid) {
  await db.ref(`notifications/${currentUser.uid}/${notifId}/read`).set(true);
  const fromSnap = await db.ref(`users/${fromUid}`).once('value');
  const fromProf = fromSnap.val() || {};
  const now = Date.now();
  await db.ref(`friends/${currentUser.uid}/${fromUid}`).set({ since: now });
  await db.ref(`friends/${fromUid}/${currentUser.uid}`).set({ since: now });
  await db.ref(`friendRequests/${currentUser.uid}/${fromUid}`).remove();
  await pushNotification(fromUid, 'friendAccepted', 'フレンド承認', `${currentUserProfile.displayId} さんがフレンド申請を承認しました`);
  toast(`✅ ${fromProf.displayId || '?'} さんとフレンドになりました`);
  // ルーム内パネルと全通知UIを両方更新
  loadAndRenderNotifs();
  if(_topNotifDrawerOpen) loadTopNotifDrawer();
}

async function declineFriendFromNotif(notifId, fromUid) {
  await db.ref(`notifications/${currentUser.uid}/${notifId}/read`).set(true);
  await db.ref(`friendRequests/${currentUser.uid}/${fromUid}`).remove();
  // ルーム内パネルと全通知UIを両方更新
  loadAndRenderNotifs();
  if(_topNotifDrawerOpen) loadTopNotifDrawer();
}


function openFriendModal() {
  if(!currentUser) { showAccountPage(); return; }
  document.getElementById('modal-friend').classList.add('active');
  loadFriendData();
}
function closeFriendModal() { document.getElementById('modal-friend').classList.remove('active'); }

async function loadFriendData() {
  const friendList = document.getElementById('friend-list');
  const reqSec = document.getElementById('friend-req-section');
  const reqList = document.getElementById('friend-req-list');
  friendList.innerHTML = '<div class="friend-empty">読み込み中…</div>';

  let friendsSnap, reqSnap;
  try {
    [friendsSnap, reqSnap] = await Promise.all([
      db.ref(`friends/${currentUser.uid}`).once('value'),
      db.ref(`friendRequests/${currentUser.uid}`).once('value')
    ]);
  } catch(e) {
    console.error('[loadFriendData] ❌ read failed:', e);
    friendList.innerHTML = '<div class="friend-empty">読み込みに失敗しました</div>';
    if(reqSec) reqSec.style.display = 'none';
    return;
  }

  const reqs = [];
  reqSnap.forEach(child => reqs.push({ uid: child.key, ...child.val() }));
  if(reqs.length > 0) {
    reqSec.style.display = '';
    reqList.innerHTML = reqs.map(r => {
      const ic = r.iconUrl ? `<img src="${r.iconUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (r.icon||'👤');
      return `
      <div class="friend-req-item">
        <div class="friend-icon">${ic}</div>
        <div class="friend-info">
          <div class="friend-displayid">${esc(r.displayId||'?')}</div>
          <div class="friend-title">${r.title ? esc(r.title) : ''}</div>
        </div>
        <div class="friend-actions">
          <button class="friend-btn friend-btn-accept" onclick="acceptFriendDirect('${r.uid}','${r.displayId||''}')">承認</button>
          <button class="friend-btn friend-btn-decline" onclick="declineFriendDirect('${r.uid}')">拒否</button>
        </div>
      </div>`;
    }).join('');
  } else {
    reqSec.style.display = 'none';
  }

  const friendUids = [];
  friendsSnap.forEach(child => friendUids.push(child.key));
  if(friendUids.length === 0) {
    friendList.innerHTML = '<div class="friend-empty">フレンドがいません</div>';
    return;
  }

  const profiles = await Promise.all(
    friendUids.map(uid =>
      db.ref(`users/${uid}`).once('value')
        .then(s => ({ uid, data: s.val() || {} }))
        .catch(e => { console.warn('[loadFriendData] users/' + uid + ' failed:', e); return { uid, data: {} }; })
    )
  );

  friendList.innerHTML = profiles.map(({ uid, data: p }) => {
    accountProfileCache[uid] = p;
    const ic = p.iconUrl ? `<img src="${p.iconUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (p.icon||'👤');
    return `<div class="friend-item">
      <div class="friend-icon">${ic}</div>
      <div class="friend-info">
        <div class="friend-displayid">${esc(p.displayId||'?')}</div>
        <div class="friend-title">${p.title ? esc(p.title) : '称号なし'}</div>
      </div>
      <div class="friend-actions">
        <button class="friend-btn friend-btn-remove" onclick="removeFriend('${uid}','${p.displayId||''}')">削除</button>
      </div>
    </div>`;
  }).join('');
}

async function sendFriendRequest() {
  const input = document.getElementById('friend-search-input');
  const targetId = input.value.trim();
  if(!targetId) return toast('ユーザーIDを入力してください');
  if(targetId === currentUserProfile.displayId) return toast('自分自身には送れません');
  const uidSnap = await db.ref(`userIndex/${targetId}`).once('value');
  if(!uidSnap.exists()) return toast('ユーザーが見つかりません');
  const _indexVal = uidSnap.val();
  const toUid = (typeof _indexVal === 'object' && _indexVal !== null) ? _indexVal.uid : _indexVal;
  if(!toUid) return toast('ユーザーIDの取得に失敗しました');
  const alreadySnap = await db.ref(`friends/${currentUser.uid}/${toUid}`).once('value');
  if(alreadySnap.exists()) return toast('すでにフレンドです');
  const targetProf = (await db.ref(`users/${toUid}`).once('value')).val() || {};
  await db.ref(`friendRequests/${toUid}/${currentUser.uid}`).set({
    displayId: currentUserProfile.displayId,
    icon: currentUserProfile.icon || '👤',
    title: currentUserProfile.title || '',
    ts: Date.now()
  });
  await pushNotification(toUid, 'friendReq', 'フレンド申請', `${currentUserProfile.displayId} さんからフレンド申請が届きました`, { fromUid: currentUser.uid });
  input.value = '';
  toast(`✅ ${targetId} さんにフレンド申請を送りました`);
}

async function acceptFriendDirect(fromUid, fromDisplayId) {
  const now = Date.now();
  await db.ref(`friends/${currentUser.uid}/${fromUid}`).set({ since: now });
  await db.ref(`friends/${fromUid}/${currentUser.uid}`).set({ since: now });
  await db.ref(`friendRequests/${currentUser.uid}/${fromUid}`).remove();
  await pushNotification(fromUid, 'friendAccepted', 'フレンド承認', `${currentUserProfile.displayId} さんがフレンド申請を承認しました`);
  toast(`✅ ${fromDisplayId} さんとフレンドになりました`);
  loadFriendData();
}

async function declineFriendDirect(fromUid) {
  await db.ref(`friendRequests/${currentUser.uid}/${fromUid}`).remove();
  loadFriendData();
}

async function removeFriend(uid, displayId) {
  if(!confirm(`${displayId} さんをフレンドから削除しますか？`)) return;
  await db.ref(`friends/${currentUser.uid}/${uid}`).remove();
  await db.ref(`friends/${uid}/${currentUser.uid}`).remove();
  toast(`${displayId} さんをフレンドから削除しました`);
  loadFriendData();
}


function openInviteFriendModal() {
  if(!currentUser) return;
  document.getElementById('modal-invite-friend').classList.add('active');
  loadInviteFriendList();
}
function closeInviteFriendModal() { document.getElementById('modal-invite-friend').classList.remove('active'); }

async function loadInviteFriendList() {
  const el = document.getElementById('invite-friend-list');
  el.innerHTML = '<div class="friend-empty">読み込み中…</div>';
  const friendsSnap = await db.ref(`friends/${currentUser.uid}`).once('value');
  const friendUids = [];
  friendsSnap.forEach(child => friendUids.push(child.key));
  if(friendUids.length === 0) {
    el.innerHTML = '<div class="friend-empty">フレンドがいません</div>';
    return;
  }
  const profiles = await Promise.all(
    friendUids.map(uid =>
      db.ref(`users/${uid}`).once('value')
        .then(s => ({ uid, data: s.val() || {} }))
        .catch(e => { console.warn('[loadInviteFriendList] users/' + uid, e); return { uid, data: {} }; })
    )
  );
  el.innerHTML = profiles.map(({ uid, data: p }) => {
    const ic = p.iconUrl ? `<img src="${p.iconUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (p.icon||'👤');
    return `<div class="friend-item">
      <div class="friend-icon">${ic}</div>
      <div class="friend-info">
        <div class="friend-displayid">${esc(p.displayId||'?')}</div>
        <div class="friend-title">${p.title ? esc(p.title) : ''}</div>
      </div>
      <div class="friend-actions">
        <button class="friend-btn friend-btn-invite" onclick="inviteFriendToRoom('${uid}','${p.displayId||''}',this)">招待</button>
      </div>
    </div>`;
  }).join('');
}

async function inviteFriendToRoom(toUid, toDisplayId, btn) {
  if(!rId) return toast('部屋に入ってから招待してください');
  btn.textContent = '送信中…';
  btn.disabled = true;
  try {
    await pushNotification(toUid, 'invite',
      `${currentUserProfile.displayId} さんから招待が届きました`,
      `Room ID: ${rId} に招待されました`, { roomId: rId, fromUid: currentUser.uid });
    btn.textContent = '✅ 送信済み';
    toast(`✅ ${toDisplayId} さんに招待しました`);
  } catch(e) {
    btn.textContent = '❌ 失敗';
    btn.disabled = false;
    toast('❌ 招待の送信に失敗しました');
    console.error('[inviteFriendToRoom]', e);
  }
}

async function notifyFriendsRoomCreated(roomId) {
  if(!currentUser || !currentUserProfile) {
    console.warn('[notifyFriendsRoomCreated] currentUser or currentUserProfile is null, skipping');
    return;
  }
  try {
    const friendsSnap = await db.ref(`friends/${currentUser.uid}`).once('value');
    const promises = [];
    let count = 0;
    friendsSnap.forEach(child => {
      count++;
      promises.push(
        pushNotification(child.key, 'friendRoom',
          `${currentUserProfile.displayId} さんが部屋を作りました`,
          `Room ID: ${roomId} に招待されました`,
          { roomId, fromUid: currentUser.uid }
        ).catch(e => console.error('[notifyFriendsRoomCreated] uid=' + child.key + ' failed:', e))
      );
    });
    console.log('[notifyFriendsRoomCreated] sending to', count, 'friends');
    await Promise.allSettled(promises);
    console.log('[notifyFriendsRoomCreated] done');
  } catch(e) { console.error('[notifyFriendsRoomCreated]', e); }
}

async function prefetchAccountProfiles(players) {
  const uids = Object.values(players).map(p => p.accountUid).filter(uid => uid && !accountProfileCache[uid]);
  await Promise.all(uids.map(async uid => {
    try {
      const snap = await db.ref(`users/${uid}`).once('value');
      if(snap.exists()) accountProfileCache[uid] = snap.val();
    } catch(e) {
      // PERMISSION_DENIED for other users' profiles - expected by rules
    }
  }));
}
