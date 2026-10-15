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


function openFeedback(){ document.getElementById('modal-feedback').classList.add('active'); }
function closeFeedback(){ document.getElementById('modal-feedback').classList.remove('active'); }


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
