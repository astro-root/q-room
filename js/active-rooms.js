const firebaseConfig = {
  apiKey: "AIzaSyA3xtGLVJwij2BTiiOk7DsNeF9hIOuZCyI",
  authDomain: "q-room-fe8a6.firebaseapp.com",
  databaseURL: "https://q-room-fe8a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q-room-fe8a6",
  storageBucket: "q-room-fe8a6.firebasestorage.app",
  messagingSenderId: "151049149394",
  appId: "1:151049149394:web:7a3ea6406454f6a87d460b"
};

const ADMIN_HASH = '1f05d74edef006760f3b1f964820887e991f266be0015dcef0dd41b85eb7e8e9';

// q-room.jsのsettings画面に表示される実際のテキストと一致させる
const RULE_LABELS = {
  survival:    'm◯n×',
  free:        'Free',
  newyork:     'NewYork',
  rentou:      '連答付き',
  updown:      'up-down',
  by:          'by',
  freeze:      'Freeze',
  m_n_rest:    'm◯n休',
  swedish:     'Swedish',
  ren_wrong:   '連誤答付き',
  divide:      'divide',
  combo:       'm hits Combo',
  attack_surv: 'アタック風サバイバル',
  lucky:       'LuckyShot',
  spiral:      '螺旋階段',
  time_race:   'Time Race',
  board_quiz:  'Board Quiz'
};

const QROOM_BASE = 'https://astro-root.com/q-room/';

let db = null;
let countdownSec = 60;
let countdownTimer = null;
let finishedVisible = false;
let isAdmin = false;
let peekListener = null;
let peekChatListener = null;
let peekRid = null;
let peekChatOpen = false;

function initFB() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  // /rooms読み取りにはauth必須 → 匿名ログインで対応
  const auth = firebase.auth();
  auth.signInAnonymously().catch(() => {});
  db.ref('.info/connected').on('value', snap => {
    const ok = snap.val() === true;
    document.getElementById('dot').className = 'dot' + (ok ? '' : ' offline');
    document.getElementById('status-text').textContent = ok ? 'LIVE' : 'OFFLINE';
  });
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2,'0') + ':' +
         String(d.getMinutes()).padStart(2,'0') + ':' +
         String(d.getSeconds()).padStart(2,'0');
}

function timeAgo(ts) {
  if (!ts) return '—';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return sec + '秒前';
  if (sec < 3600) return Math.floor(sec / 60) + '分前';
  return Math.floor(sec / 3600) + '時間前';
}

function copyRoomId(rid, btn) {
  navigator.clipboard.writeText(rid).then(() => {}).catch(() => {});
  btn.textContent = '✓ COPIED';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'COPY ID'; btn.classList.remove('copied'); }, 2000);
}

function getPlayerStatusClass(st) {
  if (st === 'win') return 'st-win';
  if (st === 'lose') return 'st-lose';
  if (st === 'spec') return 'st-spec';
  return 'st-active';
}

// ルームの実態を判定する
// status:'finished' → 終了
// status:'playing' かつ players が全員退室(空) → ゾンビ終了扱い
// lastActiveAt が ZOMBIE_THRESHOLD 以上前かつ playerが0人 → ゾンビ
function classifyRoom(room) {
  const ZOMBIE_MS = 10 * 60 * 1000; // 10分
  const players = room.players || {};
  const playerList = Object.values(players);
  const lastActive = room.lastActiveAt || room.createdAt || 0;
  const isExplicitlyFinished = room.status === 'finished';
  const hasPlayers = playerList.length > 0;
  const isStale = (Date.now() - lastActive) > ZOMBIE_MS;

  if (isExplicitlyFinished) return 'finished';
  if (!hasPlayers && isStale) return 'zombie'; // プレイヤーなし+放置
  if (!hasPlayers) return 'zombie';
  return 'playing';
}

function getRoomStatusLabel(kind) {
  if (kind === 'finished') return { label: '終了', color: 'var(--muted)' };
  if (kind === 'zombie') return { label: '放置中（全員退室？）', color: 'var(--yellow)' };
  return { label: 'プレイ中', color: 'var(--green)' };
}

function buildRoomCard(rid, room, idx, isFinishedSection) {
  const players = room.players || {};
  // 終了済みセクションでは全プレイヤー（退室済み含む）を allPlayers として扱う
  // activeセクションでは room.players がそのまま有効プレイヤー
  const playerEntries = Object.entries(players);
  const playerList = Object.values(players);
  const activePlayers = playerList.filter(p => p.st === 'active');
  const kind = classifyRoom(room);
  const st = getRoomStatusLabel(kind);
  const ruleName = RULE_LABELS[room.rule] || room.rule || '?';
  const createdAt = room.createdAt || null;
  const lastActive = room.lastActiveAt || room.createdAt || null;
  const isFinished = kind !== 'playing';

  const avatarChar = (name) => name ? name.charAt(0).toUpperCase() : '?';

  // 終了済みセクションは全プレイヤー名を表示（退室済みでも）
  const playersHtml = playerEntries.length === 0
    ? '<div style="font-family:var(--mono);font-size:0.78rem;color:var(--muted);">プレイヤーなし</div>'
    : playerEntries.map(([, p]) => {
        const sc = p.sc !== undefined ? p.sc : 0;
        const stClass = isFinishedSection ? '' : getPlayerStatusClass(p.st);
        const isWin = p.st === 'win';
        return `
        <div class="player-chip ${stClass}">
          <div class="player-avatar ${isWin ? 'win' : ''}">${avatarChar(p.name)}</div>
          <span class="player-name">${escHtml(p.name || '?')}</span>
          <span class="player-score"><span class="player-sc-val ${isWin ? 'win' : ''}">${sc}</span>pt</span>
        </div>`;
      }).join('');

  return `
  <div class="room-card ${isFinished ? 'finished' : ''}" style="animation-delay:${idx * 0.06}s">
    <div class="room-card-header">
      <div class="room-id-wrap">
        <div class="live-dot ${isFinished ? 'fin' : ''}"></div>
        <div>
          <div class="room-id-label">ROOM ID</div>
          <div class="room-id-val">${rid}</div>
        </div>
      </div>
      <div class="rule-badge">${ruleName}</div>
      <button class="copy-btn" onclick="copyRoomId('${rid}', this)">COPY ID</button>
      <button class="peek-btn" onclick="openPeek('${rid}')">👁 PEEK</button>
      ${!isFinished ? `<button class="join-btn" onclick="window.open('${QROOM_BASE}?r=${rid}','_blank')">→ 参加</button>` : ''}
    </div>
    <div class="room-meta">
      <div class="meta-item">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        作成: <span>${formatTime(createdAt)}</span>
      </div>
      <div class="meta-item">
        <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        最終更新: <span>${timeAgo(lastActive)}</span>
      </div>
      <div class="meta-item">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>${playerList.length}</span> プレイヤー（アクティブ: <span>${activePlayers.length}</span>）
      </div>
      <div class="meta-item">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        状態: <span style="color:${st.color}">${st.label}</span>
      </div>
    </div>
    <div class="players-wrap">
      <div class="players-title">PLAYERS${isFinishedSection ? '（全員）' : ''}</div>
      <div class="players-grid">${playersHtml}</div>
    </div>
  </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchRooms() {
  if (!db) return;
  try {
    const snap = await db.ref('rooms').once('value');
    const roomsData = snap.val() || {};
    const roomKeys = Object.keys(roomsData);

    const FINISHED_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7日
    const now_ms = Date.now();

    const active = [], finished = [];
    roomKeys.forEach(rid => {
      const room = roomsData[rid];
      const lastActive = room.lastActiveAt || room.createdAt || 0;
      const isRecent = (now_ms - lastActive) < FINISHED_THRESHOLD_MS;
      if (!isRecent) return; // 7日以上前は無視

      const kind = classifyRoom(room);
      if (kind === 'playing') {
        active.push({ rid, room });
      } else {
        finished.push({ rid, room });
      }
    });

    active.sort((a, b) => (b.room.lastActiveAt || 0) - (a.room.lastActiveAt || 0));
    finished.sort((a, b) => (b.room.lastActiveAt || 0) - (a.room.lastActiveAt || 0));

    // アクティブ人数はactiveルームのアクティブプレイヤー数
    const totalPlayers = active.reduce((s, { room }) => {
      return s + Object.values(room.players || {}).filter(p => p.st === 'active').length;
    }, 0);

    document.getElementById('chip-rooms').textContent = active.length;
    document.getElementById('chip-rooms').classList.remove('loading-shimmer');
    document.getElementById('chip-players').textContent = totalPlayers;
    document.getElementById('chip-players').classList.remove('loading-shimmer');
    const now = new Date();
    document.getElementById('chip-time').textContent =
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0') + ':' +
      String(now.getSeconds()).padStart(2,'0');

    document.getElementById('playing-count').textContent = active.length;

    const activeEl = document.getElementById('rooms-active');
    if (active.length === 0) {
      activeEl.innerHTML = `<div class="empty"><div class="empty-icon">🎮</div><div class="empty-text">現在プレイ中のルームはありません</div></div>`;
    } else {
      activeEl.innerHTML = active.map(({ rid, room }, i) => buildRoomCard(rid, room, i, false)).join('');
    }

    const finEl = document.getElementById('rooms-finished');
    if (finished.length === 0) {
      finEl.innerHTML = `<div class="empty"><div class="empty-text">終了済みルームはありません</div></div>`;
    } else {
      const grouped = {};
      finished.forEach(({ rid, room }) => {
        const ts = room.lastActiveAt || room.createdAt || 0;
        const dateKey = getDateLabel(ts);
        if (!grouped[dateKey]) grouped[dateKey] = { label: dateKey, items: [], ts };
        grouped[dateKey].items.push({ rid, room });
        if (ts > grouped[dateKey].ts) grouped[dateKey].ts = ts;
      });
      const sortedGroups = Object.values(grouped).sort((a, b) => b.ts - a.ts);
      finEl.innerHTML = sortedGroups.map((group, gi) => {
        const cardsHtml = group.items.map(({ rid, room }, i) => buildRoomCard(rid, room, i, true)).join('');
        const isOpen = gi === 0;
        return `
        <div class="date-group" id="dg-${gi}">
          <button class="date-group-toggle ${isOpen ? 'open' : ''}" onclick="toggleDateGroup(${gi})">
            <span class="date-group-arrow">${isOpen ? '▼' : '▶'}</span>
            <span class="date-group-label">${group.label}</span>
            <span class="date-group-count">${group.items.length} ルーム</span>
          </button>
          <div class="date-group-body rooms-list" style="display:${isOpen ? 'flex' : 'none'};flex-direction:column;gap:16px;margin-bottom:12px;">
            ${cardsHtml}
          </div>
        </div>`;
      }).join('');
    }
    document.getElementById('fin-toggle').textContent =
      (finishedVisible ? '▼ ' : '▶ ') + `終了済みルームを表示 (${finished.length})`;

    document.getElementById('error-box').style.display = 'none';

  } catch(e) {
    const errBox = document.getElementById('error-box');
    errBox.style.display = 'block';
    let msg = e.message || String(e);
    if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
      msg += '<br><br>→ Firebase セキュリティルールで <code>/rooms</code> の読み取りが拒否されています。<br>'
           + '<a href="https://console.firebase.google.com/project/q-room-fe8a6/database/q-room-fe8a6-default-rtdb/rules" target="_blank" style="color:var(--cyan)">ルール設定を確認する</a>';
    }
    document.getElementById('error-msg').innerHTML = msg;
  }
}

function toggleFinished() {
  finishedVisible = !finishedVisible;
  const el = document.getElementById('rooms-finished');
  el.style.display = finishedVisible ? 'block' : 'none';
}

function getDateLabel(ts) {
  if (!ts) return '不明';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (isSameDay(d, today)) return '今日';
  if (isSameDay(d, yesterday)) return '昨日';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function toggleDateGroup(gi) {
  const btn = document.querySelector(`#dg-${gi} .date-group-toggle`);
  const body = document.querySelector(`#dg-${gi} .date-group-body`);
  const arrow = btn.querySelector('.date-group-arrow');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) body.style.flexDirection = 'column';
  btn.classList.toggle('open', !isOpen);
  arrow.textContent = isOpen ? '▶' : '▼';
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownSec = 60;
  countdownTimer = setInterval(() => {
    countdownSec--;
    document.getElementById('countdown-text').textContent = `NEXT: ${countdownSec}s`;
    if (countdownSec <= 0) {
      clearInterval(countdownTimer);
      fetchRooms().then(() => startCountdown());
    }
  }, 1000);
}

function openPeek(rid) {
  if (!db) { alert('Firebase未接続です。しばらく待ってから再試行してください。'); return; }
  closePeek();
  peekRid = rid;
  peekChatOpen = false;
  document.getElementById('peek-rid').textContent = 'ROOM ' + rid;
  document.getElementById('peek-overlay').classList.add('show');
  document.getElementById('peek-drawer').classList.add('open');
  document.body.style.overflow = 'hidden';

  peekListener = db.ref('rooms/' + rid).on('value', snap => {
    const room = snap.val();
    if (!room) {
      document.getElementById('peek-body').innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--red);font-family:var(--mono);">ルームが見つかりません</div>';
      return;
    }
    renderPeek(rid, room);
  });
}

function closePeek() {
  if (peekListener && peekRid && db) {
    db.ref('rooms/' + peekRid).off('value', peekListener);
    peekListener = null;
  }
  if (peekChatListener && peekRid && db) {
    db.ref('rooms/' + peekRid + '/chat').off('child_added', peekChatListener);
    peekChatListener = null;
  }
  peekRid = null;
  peekChatOpen = false;
  document.getElementById('peek-overlay').classList.remove('show');
  document.getElementById('peek-drawer').classList.remove('open');
  document.body.style.overflow = '';
}

function renderPeek(rid, room) {
  const players = room.players || {};
  const playerList = Object.entries(players).sort((a, b) => {
    const sa = a[1].sc !== undefined ? a[1].sc : 0;
    const sb = b[1].sc !== undefined ? b[1].sc : 0;
    return sb - sa;
  });
  const timer = room.timer || null;
  const ruleName = RULE_LABELS[room.rule] || room.rule || '?';
  const now_d = new Date();
  const ts = String(now_d.getHours()).padStart(2,'0') + ':' +
              String(now_d.getMinutes()).padStart(2,'0') + ':' +
              String(now_d.getSeconds()).padStart(2,'0');

  const kind = classifyRoom(room);
  const stInfo = getRoomStatusLabel(kind);

  let timerHtml = '';
  if (timer) {
    const tState = timer.state || '—';
    const tRem = timer.remaining !== undefined ? Math.max(0, Math.ceil(timer.remaining / 1000)) : null;
    const mm = tRem !== null ? String(Math.floor(tRem/60)).padStart(2,'0') : '—';
    const ss = tRem !== null ? String(tRem%60).padStart(2,'0') : '—';
    timerHtml = `
    <div class="peek-section">
      <div class="peek-section-title">TIMER</div>
      <div class="peek-kv"><span class="peek-key">STATE</span><span class="peek-val" style="color:${tState==='running'?'var(--green)':tState==='finished'?'var(--red)':'var(--muted)'}">${tState.toUpperCase()}</span></div>
      <div class="peek-kv"><span class="peek-key">REMAINING</span><span class="peek-val">${mm}:${ss}</span></div>
    </div>`;
  }

  const playersHtml = playerList.length === 0
    ? '<div style="color:var(--muted);font-family:var(--mono);font-size:0.8rem;padding:8px;">プレイヤーなし</div>'
    : playerList.map(([pid, p], i) => {
        const isWin = p.st === 'win';
        const isLose = p.st === 'lose';
        const stStr = (p.st || '?').toUpperCase();
        const stColor = p.st==='active'?'var(--green)':p.st==='win'?'var(--green)':p.st==='lose'?'var(--red)':p.st==='spec'?'var(--muted)':'var(--muted)';
        return `
        <div class="peek-player-row ${isWin?'win':isLose?'lose':''}">
          <div style="color:var(--muted);font-family:var(--mono);font-size:0.75rem;min-width:18px;">${i+1}</div>
          <div class="peek-avatar ${isWin?'win':''}">${(p.name||'?').charAt(0).toUpperCase()}</div>
          <div class="peek-pname">${escHtml(p.name||'?')}</div>
          <div class="peek-stats">
            <span>◯${p.c||0}</span>
            <span>✕${p.w||0}</span>
            <span class="sc ${isWin?'win':''}">${p.sc!==undefined?p.sc:0}pt</span>
          </div>
          <div style="font-family:var(--mono);font-size:0.68rem;color:${stColor};min-width:40px;text-align:right;">${stStr}</div>
        </div>`;
      }).join('');

  // chat tab toggling: preserve open state
  const chatTabActive = peekChatOpen ? 'peek-tab-active' : '';
  const infoTabActive = peekChatOpen ? '' : 'peek-tab-active';

  document.getElementById('peek-body').innerHTML = `
    <div class="peek-tabs">
      <button class="peek-tab ${infoTabActive}" onclick="peekShowInfo()">📊 INFO</button>
      <button class="peek-tab ${chatTabActive}" onclick="peekShowChat('${rid}')">💬 CHAT</button>
    </div>
    <div id="peek-info-panel">
    <div class="peek-section">
      <div class="peek-section-title">ROOM INFO <div class="peek-live-dot" style="border-radius:50%"></div></div>
      <div class="peek-kv"><span class="peek-key">RULE</span><span class="peek-val">${ruleName}</span></div>
      <div class="peek-kv"><span class="peek-key">STATUS</span><span class="peek-val" style="color:${stInfo.color}">${stInfo.label}</span></div>
      <div class="peek-kv"><span class="peek-key">PLAYERS</span><span class="peek-val">${playerList.length} 人</span></div>
      <div class="peek-kv"><span class="peek-key">CREATED</span><span class="peek-val">${room.createdAt ? new Date(room.createdAt).toLocaleTimeString('ja-JP') : '—'}</span></div>
      <div class="peek-kv"><span class="peek-key">LAST ACTIVE</span><span class="peek-val">${room.lastActiveAt ? new Date(room.lastActiveAt).toLocaleTimeString('ja-JP') : '—'}</span></div>
    </div>
    ${timerHtml}
    <div class="peek-section">
      <div class="peek-section-title">PLAYERS (スコア順)</div>
      ${playersHtml}
    </div>
    <div style="text-align:right;font-family:var(--mono);font-size:0.65rem;color:rgba(255,255,255,0.2);margin-top:8px;">更新: ${ts}</div>
    </div>
    <div id="peek-chat-panel" style="display:${peekChatOpen ? 'block' : 'none'};">
      <div class="peek-chat-log" id="peek-chat-log"><div style="text-align:center;padding:40px;color:var(--muted);font-family:var(--mono);font-size:0.8rem;">読み込み中...</div></div>
    </div>
  `;

  if (peekChatOpen) {
    peekLoadChat(rid);
  }
}

function peekShowInfo() {
  peekChatOpen = false;
  document.getElementById('peek-info-panel').style.display = 'block';
  document.getElementById('peek-chat-panel').style.display = 'none';
  document.querySelectorAll('.peek-tab').forEach((t,i) => t.classList.toggle('peek-tab-active', i===0));
}

function peekShowChat(rid) {
  peekChatOpen = true;
  document.getElementById('peek-info-panel').style.display = 'none';
  document.getElementById('peek-chat-panel').style.display = 'block';
  document.querySelectorAll('.peek-tab').forEach((t,i) => t.classList.toggle('peek-tab-active', i===1));
  peekLoadChat(rid);
}

function peekLoadChat(rid) {
  if (!db) return;
  // 既存リスナー解除
  if (peekChatListener && peekRid && db) {
    db.ref('rooms/' + peekRid + '/chat').off('child_added', peekChatListener);
    peekChatListener = null;
  }

  const logEl = document.getElementById('peek-chat-log');
  if (!logEl) return;
  logEl.innerHTML = '';

  peekChatListener = db.ref('rooms/' + rid + '/chat').limitToLast(100).on('child_added', snap => {
    const msg = snap.val();
    if (!msg) return;
    const logEl2 = document.getElementById('peek-chat-log');
    if (!logEl2) return;

    const div = document.createElement('div');
    if (msg.type === 'system') {
      div.className = 'peek-chat-sys';
      div.textContent = msg.text || '';
    } else if (msg.type === 'stamp') {
      div.className = 'peek-chat-msg';
      div.innerHTML = `<span class="peek-chat-name">${escHtml(msg.playerName||'?')}</span><span class="peek-chat-stamp">${escHtml(msg.text||'')}</span>`;
    } else {
      div.className = 'peek-chat-msg';
      div.innerHTML = `<span class="peek-chat-name">${escHtml(msg.playerName||'?')}</span><span class="peek-chat-bubble">${escHtml(msg.text||'')}</span>`;
    }

    const timeStr = msg.ts ? new Date(msg.ts).toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit'}) : '';
    if (timeStr) {
      const timeEl = document.createElement('span');
      timeEl.className = 'peek-chat-time';
      timeEl.textContent = timeStr;
      div.appendChild(timeEl);
    }
    logEl2.appendChild(div);
    logEl2.scrollTop = logEl2.scrollHeight;
  });
}

function activateAdmin() {
  isAdmin = true;
  sessionStorage.setItem('qr_admin', '1');
  document.body.classList.add('admin-mode');
  const hdr = document.querySelector('.status-row');
  if (!document.querySelector('.admin-badge')) {
    const badge = document.createElement('div');
    badge.className = 'admin-badge';
    badge.textContent = '⚡ ADMIN';
    hdr.prepend(badge);
  }
}

async function checkHash(k) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function submitGate() {
  const key = document.getElementById('gate-input').value;
  if (!key) { document.getElementById('gate-error').textContent = 'パスワードを入力してください'; return; }
  const hash = await checkHash(key);
  if (hash !== ADMIN_HASH) {
    document.getElementById('gate-error').textContent = 'パスワードが違います';
    document.getElementById('gate-input').value = '';
    document.getElementById('gate-input').focus();
    return;
  }
  sessionStorage.setItem('qr_admin', '1');
  document.getElementById('gate-overlay').classList.remove('show');
  document.body.style.overflow = '';
  initFB();
  fetchRooms().then(() => startCountdown());
}

window.addEventListener('load', async () => {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('admin');

  if (key) {
    const hash = await checkHash(key);
    if (hash === ADMIN_HASH) {
      sessionStorage.setItem('qr_admin', '1');
      history.replaceState({}, '', window.location.pathname);
    } else {
      document.getElementById('gate-error').textContent = 'パスワードが違います';
      document.getElementById('gate-overlay').classList.add('show');
      document.body.style.overflow = 'hidden';
      return;
    }
  } else if (sessionStorage.getItem('qr_admin') !== '1') {
    document.getElementById('gate-overlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('gate-input').focus(), 80);
    return;
  }

  initFB();
  fetchRooms().then(() => startCountdown());
});
