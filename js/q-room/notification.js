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
