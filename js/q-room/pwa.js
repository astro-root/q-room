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
