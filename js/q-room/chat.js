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
