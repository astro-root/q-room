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


