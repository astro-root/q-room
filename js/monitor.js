const firebaseConfig = {
  apiKey: "AIzaSyA3xtGLVJwij2BTiiOk7DsNeF9hIOuZCyI",
  authDomain: "q-room-fe8a6.firebaseapp.com",
  databaseURL: "https://q-room-fe8a6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q-room-fe8a6",
  storageBucket: "q-room-fe8a6.firebasestorage.app",
  messagingSenderId: "151049149394",
  appId: "1:151049149394:web:7a3ea6406454f6a87d460b"
};

const STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024;
const CONN_LIMIT = 100;

let db = null;
let sessionReads = 0;
let refreshTimer = null;
let countdownTimer = null;
let countdownSec = 60;
let isConnected = false;

function initFB() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.database();
    // /rooms読み取りにはauth必須 → 匿名ログインで対応
    firebase.auth().signInAnonymously().catch(e => addLog('warn', '匿名auth失敗: ' + e.message));
    db.ref('.info/connected').on('value', snap => {
      isConnected = snap.val() === true;
      document.getElementById('dot').className = 'dot' + (isConnected ? '' : ' offline');
      document.getElementById('status-text').textContent = isConnected ? 'CONNECTED' : 'DISCONNECTED';
    });
  } catch(e) {
    addLog('err', 'Firebase初期化失敗: ' + e.message);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(3) + ' GB';
}

function getBarClass(pct) {
  if (pct >= 90) return 'danger';
  if (pct >= 70) return 'warn';
  return 'safe';
}

function setGauge(barId, pctId, valsId, limitId, value, limit, valueStr, limitStr) {
  const pct = Math.min(100, (value / limit) * 100);
  const bar = document.getElementById(barId);
  bar.style.width = Math.max(pct, 0.3) + '%';
  bar.className = 'gauge-bar ' + getBarClass(pct);
  document.getElementById(pctId).textContent = pct.toFixed(2) + '%';
  document.getElementById(valsId).textContent = valueStr + ' / ' + limitStr;
  document.getElementById(limitId).textContent = valueStr + ' / ' + limitStr;
}

function addLog(type, msg) {
  const el = document.getElementById('log');
  const now = new Date();
  const ts = String(now.getHours()).padStart(2,'0') + ':' +
              String(now.getMinutes()).padStart(2,'0') + ':' +
              String(now.getSeconds()).padStart(2,'0');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="ts">[${ts}]</span><span class="${type}">${msg}</span>`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function setLoading(on) {
  ['val-rooms','val-players','val-storage','val-conns'].forEach(id => {
    const el = document.getElementById(id);
    if (on) { el.classList.add('loading-val'); el.textContent = '—'; }
    else { el.classList.remove('loading-val'); }
  });
}

const RULE_LABELS = {
  survival:'サバイバル', free:'フリー', newyork:'NY', rentou:'連答',
  updown:'UD', by:'BY', freeze:'フリーズ', m_n_rest:'MNR',
  swedish:'スウェ', ren_wrong:'連誤', divide:'分配', combo:'コンボ',
  attack_surv:'攻撃', lucky:'ラッキー', spiral:'スパイラル', time_race:'タイムレース'
};

async function fetchData() {
  if (!db) return;
  setLoading(true);
  addLog('ok', 'データ取得開始...');

  try {
    const snap = await db.ref('rooms').once('value');
    sessionReads++;

    const roomsData = snap.val() || {};
    const roomKeys = Object.keys(roomsData);

    const jsonStr = JSON.stringify(roomsData);
    const storageBytes = new TextEncoder().encode(jsonStr).length;

    let totalPlayers = 0;
    let activeRooms = 0;
    const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000;
    const now_ms = Date.now();

    roomKeys.forEach(rid => {
      const room = roomsData[rid];
      const lastActive = room.lastActiveAt || room.createdAt || 0;
      if ((now_ms - lastActive) >= ACTIVE_THRESHOLD_MS) return;

      const players = room.players || {};
      const activePlayers = Object.values(players).filter(p => {
        const playerTs = p.statsAt || p.joined || 0;
        return (now_ms - playerTs) < ACTIVE_THRESHOLD_MS;
      });
      const pCount = activePlayers.length;

      if (pCount > 0 && room.status !== 'finished') {
        activeRooms++;
        totalPlayers += pCount;
      }
    });

    document.getElementById('val-rooms').textContent = activeRooms;
    document.getElementById('sub-rooms').textContent = `合計 ${roomKeys.length} 部屋中 / 30分以内にアクティブ`;

    document.getElementById('val-players').textContent = totalPlayers;
    document.getElementById('sub-players').textContent = `${activeRooms} 部屋に参加中（30分以内）`;

    document.getElementById('val-storage').textContent = formatBytes(storageBytes);
    document.getElementById('sub-storage').textContent = '/ 1 GB 無料枠（/rooms/ のみ）';

    const estimatedConns = totalPlayers + (activeRooms > 0 ? 1 : 0);
    document.getElementById('val-conns').textContent = estimatedConns;
    document.getElementById('sub-conns').textContent = `/ 100 同時接続 無料枠`;

    document.getElementById('val-reads').textContent = sessionReads;

    const now = new Date();
    document.getElementById('val-time').textContent =
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0') + ':' +
      String(now.getSeconds()).padStart(2,'0');
    document.getElementById('sub-time').textContent = '60秒ごとに自動更新';

    setGauge('bar-storage','gauge-storage-pct','gauge-storage-vals','gauge-storage-limit',
      storageBytes, STORAGE_LIMIT_BYTES, formatBytes(storageBytes), '1 GB');

    setGauge('bar-conn','gauge-conn-pct','gauge-conn-vals','gauge-conn-limit',
      estimatedConns, CONN_LIMIT, estimatedConns + '接続', '100');

    const readsPct = Math.min(sessionReads, 100);
    document.getElementById('bar-reads').style.width = readsPct + '%';
    document.getElementById('bar-reads').className = 'gauge-bar ' + getBarClass(readsPct);
    document.getElementById('gauge-reads-pct').textContent = sessionReads + ' reads';
    document.getElementById('gauge-reads-vals').textContent = sessionReads + ' reads (このセッション)';
    document.getElementById('gauge-reads-limit').textContent = sessionReads + ' reads';

    addLog('ok', `取得完了 — ${activeRooms}室アクティブ / ${totalPlayers}プレイヤー / ${formatBytes(storageBytes)} / ${sessionReads}reads`);

    if (storageBytes / STORAGE_LIMIT_BYTES > 0.7) {
      addLog('warn', 'ストレージ使用率 70% 超。Firebase Consoleで確認を推奨します。');
    }
    if (estimatedConns > 70) {
      addLog('warn', `接続数が ${estimatedConns} / 100 に達しています。`);
    }

  } catch(e) {
    const errBox = document.getElementById('error-box');
    const errMsg = document.getElementById('error-msg');
    errBox.style.display = 'block';
    const msg = e.message || String(e);
    errMsg.innerHTML = `<strong>${msg}</strong>`;

    if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
      errMsg.innerHTML += '<br><br>→ Firebase セキュリティルールが読み取りを拒否しています。<br>' +
        '<a href="https://console.firebase.google.com/project/q-room-fe8a6/database/q-room-fe8a6-default-rtdb/rules" target="_blank" style="color:var(--cyan)">ルール設定を確認する</a>';
    }

    addLog('err', '取得失敗: ' + msg);
    document.getElementById('status-text').textContent = 'ERROR';
    setLoading(false);
    ['val-rooms','val-players','val-storage','val-conns'].forEach(id => {
      document.getElementById(id).textContent = 'ERR';
      document.getElementById(id).style.color = 'var(--red)';
    });
  }
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownSec = 60;
  countdownTimer = setInterval(() => {
    countdownSec--;
    document.getElementById('next-refresh').textContent = `NEXT: ${countdownSec}s`;
    if (countdownSec <= 0) {
      clearInterval(countdownTimer);
      fetchData();
      setTimeout(startCountdown, 500);
    }
  }, 1000);
}

window.addEventListener('load', () => {
  initFB();
  addLog('ok', 'Q-Room Monitor 起動');
  addLog('warn', '注意: セッションreadカウントはこのページの取得のみ。Firebase全体の数値ではありません。');
  fetchData().then(() => startCountdown());
});
