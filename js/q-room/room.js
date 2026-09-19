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
  _configDirty = false;
  document.getElementById('modal').classList.add('active');
  const configArea = document.getElementById('config-area');
  if(configArea && !configArea.dataset.dirtyListener) {
    configArea.addEventListener('input', markConfigDirty);
    configArea.addEventListener('change', markConfigDirty);
    configArea.dataset.dirtyListener = 'true';
  }
}
let _configSaveInProgress = false;
async function closeModal(){
  if(_configSaveInProgress) return;
  _configSaveInProgress = true;
  document.getElementById('modal').classList.remove('active');
  try {
    await updateConf();
  } catch(e) {
    console.error('[closeModal] config save failed:', e);
    toast('設定の保存に失敗しました。通信状態を確認してください。');
  } finally {
    _configSaveInProgress = false;
  }
}

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
