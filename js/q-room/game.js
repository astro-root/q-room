const GAME_RULES = {
  survival: { fields: [['m', '勝ち抜け'], ['n', '失格']] },
  free: { fields: [] },
  newyork: { fields: [['m', '正解加点'], ['n', '誤答減点'], ['win', '勝ち抜け'], ['lose', '失格']] },
  rentou: { fields: [['m', '勝ち抜け'], ['n', '失格']], selects: [{ id: 'mode', label: '連答モード', options: [{ v: 'fast', l: '加速' }, { v: 'const', l: '等速' }] }] },
  updown: { fields: [['m', '勝ち抜け'], ['n', '失格']] },
  by: { fields: [['m', '初期誤答pt/定数'], ['n', '失格回数']] },
  freeze: { fields: [['m', '勝ち抜け'], ['n', '失格']] },
  m_n_rest: { fields: [['m', '勝ち抜け'], ['n', '休み数']] },
  swedish: { fields: [['m', '勝ち抜け'], ['n', '失格×数']] },
  ren_wrong: { fields: [['m', '勝ち抜け'], ['n', '失格']] },
  divide: { fields: [['init', '初期値'], ['add', '正解加点'], ['win', '勝ち抜け']] },
  combo: { fields: [['win', '勝ち抜け'], ['lose', '失格']] },
  attack_surv: { fields: [['life', '初期ライフ'], ['dmg_to_oth', '自正解時他減'], ['heal', '自正解時自加'], ['dmg_to_me', '自誤時自減'], ['surv', '終了人数']] },
  lucky: { fields: [['win', '勝ち抜け'], ['lose', '失格'], ['max', '乱数最大']] },
  spiral: { fields: [['up', '正解上昇'], ['down', '誤答下降'], ['top_req', '最上位要正解'], ['btm_req', '最下位要誤答']] },
  time_race: { fields: [['correct_pt', '正解 +pt'], ['wrong_pt', '誤答 -pt']], timeLimit: true },
  board_quiz: {
    fields: [['m', '正解 +pt'], ['n', '誤答 -pt'], ['x', '少数正解閾値(人以下)'], ['y', '少数ボーナス +pt'], ['a', 'ボタン押し正解 +pt'], ['z', 'ボタン押し誤答 -pt']],
    help: '① 司会者は「🎙 HOST」ボタンで担当を設定<br>② プレイヤーは回答を入力 → 「📝 提出」<br>③ 司会者が「解答オープン」→ 各プレイヤーを◯/✕判定<br>④「次の問題」で回答をリセット・少数正解ボーナスを適用'
  }
};

let _configDirty = false;

function markConfigDirty() {
  _configDirty = true;
}

function ruleDefinition(rule) {
  return GAME_RULES[rule] || GAME_RULES.free;
}

function renderRuleConfig(rule, config) {
  const definition = ruleDefinition(rule);
  const numberField = ([id, label]) => `<div class="field"><label>${label}</label><input type="number" id="c_${id}" value="${config[id] !== undefined ? config[id] : ''}"></div>`;
  const fields = definition.fields || [];
  let html = '';
  if(definition.timeLimit) {
    const limit = config.limit || 300;
    html += `<div class="s-grid">
      <div class="field"><label>制限時間 (分)</label><input type="number" id="c_limit_m" value="${Math.floor(limit / 60)}" min="0" max="99"></div>
      <div class="field"><label>制限時間 (秒)</label><input type="number" id="c_limit_s" value="${limit % 60}" min="0" max="59"></div>
    </div>`;
  }
  for(let i = 0; i < fields.length; i += 2) {
    html += `<div class="s-grid">${fields.slice(i, i + 2).map(numberField).join('')}</div>`;
  }
  if(definition.selects) {
    html += definition.selects.map(select => `<div class="field"><label>${select.label}</label><select id="c_${select.id}">${select.options.map(option => `<option value="${option.v}" ${config[select.id] === option.v ? 'selected' : ''}>${option.l}</option>`).join('')}</select></div>`).join('');
  }
  if(definition.help) {
    html += `<div style="margin-top:4px;padding:12px 16px;background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.25);border-radius:12px;font-size:0.82rem;color:var(--text-muted);line-height:1.6;">${definition.help}</div>`;
  }
  return html;
}

function resetPlayerForRule(player, rule, config) {
  const score = rule === 'divide' ? (config.init || 10) : rule === 'attack_surv' ? (config.life || 20) : 0;
  const reset = { ...player, c: 0, w: 0, sc: score, rst: 0, str: 0, adv: 0, hist: [], winAt: 0, statsAt: Date.now() };
  if(reset.st !== 'spec') reset.st = 'active';
  if(rule === 'board_quiz') {
    reset.board_ans = '';
    reset.board_btn = false;
    reset.board_judged = null;
  }
  return reset;
}

function resetPlayersForRule(players, rule, config) {
  return Object.fromEntries(Object.entries(players).map(([id, player]) => [id, resetPlayerForRule(player, rule, config)]));
}

function changeRuleUI(skipRender=false) {
  const r = document.getElementById('sel-rule').value;
  const modal = document.getElementById('modal');
  if(skipRender && _configDirty && modal && modal.classList.contains('active')) return;
  const c = (roomData && roomData.rule === r && roomData.conf) ? roomData.conf : DEF_CONF[r];
  const h = renderRuleConfig(r, c);

  document.getElementById('config-area').innerHTML = h;

  if(!skipRender && roomData && r !== roomData.rule) {
    const ruleName = document.getElementById('sel-rule').options[document.getElementById('sel-rule').selectedIndex].text;
    const newConf = DEF_CONF[r];
    db.ref('rooms/'+rId).update({rule: r, conf: newConf});
    pushSysMsg(`ルールが「${ruleName}」に変更されました`);

    if(roomData.players) {
      const pData = resetPlayersForRule(roomData.players, r, newConf);
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

function collectRuleConfig() {
  const config = {};
  document.querySelectorAll('#config-area input').forEach(el => {
    const key = el.id.replace('c_', '');
    if(key === 'limit_m' || key === 'limit_s') return;
    const value = Number(el.value);
    if(Number.isFinite(value)) config[key] = value;
  });
  document.querySelectorAll('#config-area select').forEach(el => {
    config[el.id.replace('c_', '')] = el.value;
  });
  return config;
}

async function updateConf() {
  if(!roomData || !rId || !db) return;
  const rule = roomData.rule;
  const nc = collectRuleConfig();

  // time_race: 分・秒フィールドを合算して limit（秒）に変換
  if(rule === 'time_race') {
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
    roomData = { ...roomData, conf: { ...(roomData.conf || {}), ...nc } };
    await db.ref(`rooms/${rId}/conf`).update(nc);
    if(rule === 'time_race' && nc.limit !== undefined) {
      const limitMs = nc.limit * 1000;
      await db.ref(`rooms/${rId}/timer`).transaction(cur => {
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
  _configDirty = false;
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

function applyGameAction(players, playerId, type, rule, config, previousState) {
  const player = players[playerId];
  if(type === 'rest') {
    player.rst--;
  } else if(type === 'correct') {
    player.c++;
    if(rule === 'survival') { if(player.c >= config.m) player.st = 'win'; }
    else if(rule === 'newyork') { player.sc = (player.sc||0) + config.m; if(player.sc >= config.win) player.st = 'win'; }
    else if(rule === 'rentou') {
      player.sc = (player.sc||0) + (player.str > 0 ? 2 : 1);
      if(config.mode === 'const') {
        player.str = player.str > 0 ? 0 : 1;
        Object.keys(players).forEach(id => { if(id !== playerId) players[id].str = 0; });
      } else {
        player.str++;
      }
      if(player.sc >= config.m) player.st = 'win';
    }
    else if(rule === 'updown') { player.sc = (player.sc||0) + 1; if(player.sc >= config.m) player.st = 'win'; }
    else if(rule === 'by') { player.sc = player.c * (config.m - player.w); if(player.sc >= config.m * config.m) player.st = 'win'; }
    else if(rule === 'freeze' || rule === 'm_n_rest' || rule === 'swedish') { if(player.c >= config.m) player.st = 'win'; }
    else if(rule === 'ren_wrong') { player.adv = 0; if(player.c >= config.m) player.st = 'win'; }
    else if(rule === 'divide') { player.sc = (player.sc||config.init) + config.add; if(player.sc >= config.win) player.st = 'win'; }
    else if(rule === 'combo') { player.str++; player.sc = (player.sc||0) + player.str; if(player.sc >= config.win) player.st = 'win'; }
    else if(rule === 'attack_surv') {
      player.sc = (player.sc||config.life) + config.heal;
      Object.keys(players).forEach(id => {
        if(id !== playerId && players[id].st === 'active') {
          players[id].sc = (players[id].sc||config.life) - config.dmg_to_oth;
          if(players[id].sc <= 0) players[id].st = 'lose';
        }
      });
    }
    else if(rule === 'lucky') { player.sc = (player.sc||0) + Math.floor(Math.random() * config.max) + 1; if(player.sc >= config.win) player.st = 'win'; }
    else if(rule === 'spiral') {
      const maxStep = Math.max(...Object.values(players).filter(item => item.st === 'active').map(item => item.sc||0));
      player.str = (player.sc||0) >= maxStep ? player.str + 1 : 0;
      player.sc = (player.sc||0) + config.up;
      if(player.str >= config.top_req) player.st = 'win';
    }
    else if(rule === 'time_race') { player.sc = (player.sc||0) + (config.correct_pt||1); }
  } else if(type === 'wrong') {
    player.w++;
    if(rule === 'survival') { if(config.n > 0 && player.w >= config.n) player.st = 'lose'; }
    else if(rule === 'newyork') { player.sc = (player.sc||0) - config.n; if(player.sc <= config.lose) player.st = 'lose'; }
    else if(rule === 'rentou') { player.str = 0; if(config.n > 0 && player.w >= config.n) player.st = 'lose'; }
    else if(rule === 'updown') { player.sc = 0; if(config.n > 0 && player.w >= config.n) player.st = 'lose'; }
    else if(rule === 'by') { player.sc = player.c * (config.m - player.w); if(config.n > 0 && player.w >= config.n) player.st = 'lose'; }
    else if(rule === 'freeze') { player.rst += player.w; if(config.n > 0 && player.w >= config.n) player.st = 'lose'; }
    else if(rule === 'm_n_rest') { player.rst += config.n; }
    else if(rule === 'swedish') {
      const batsu = Math.floor((Math.sqrt(8 * player.c + 1) - 1) / 2) + 1;
      player.w = (player.w - 1) + batsu;
      if(config.n > 0 && player.w >= config.n) player.st = 'lose';
    }
    else if(rule === 'ren_wrong') {
      player.w = (player.w - 1) + (player.adv > 0 ? 2 : 1); player.adv = 1;
      if(config.n > 0 && player.w >= config.n) player.st = 'lose';
    }
    else if(rule === 'divide') { player.sc = Math.floor((player.sc||config.init) / player.w); if(player.sc < 1) player.st = 'lose'; }
    else if(rule === 'combo') { player.str = 0; if(config.lose > 0 && player.w >= config.lose) player.st = 'lose'; }
    else if(rule === 'attack_surv') { player.sc = (player.sc||config.life) - config.dmg_to_me; if(player.sc <= 0) player.st = 'lose'; }
    else if(rule === 'lucky') { player.sc = (player.sc||0) - Math.floor(Math.random() * config.max) - 1; if(player.sc <= config.lose) player.st = 'lose'; }
    else if(rule === 'spiral') {
      const minStep = Math.min(...Object.values(players).filter(item => item.st === 'active').map(item => item.sc||0));
      player.adv = (player.sc||0) <= minStep ? player.adv + 1 : 0;
      player.sc = (player.sc||0) - config.down;
      if(player.adv >= config.btm_req) player.st = 'lose';
    }
    else if(rule === 'time_race') { player.sc = (player.sc||0) - (config.wrong_pt||1); }
  }

  player.hist = player.hist || [];
  player.hist.unshift(previousState);
  if(player.hist.length > 5) player.hist.length = 5;
  const previous = JSON.parse(previousState);
  if(player.c !== previous.c || player.w !== previous.w) player.statsAt = Date.now();
  if(player.st === 'win' && previous.st !== 'win') player.winAt = Date.now();
  return {
    affectsOthers: rule === 'attack_surv' || (rule === 'rentou' && type === 'correct' && config.mode === 'const'),
    finished: rule === 'attack_surv' && Object.values(players).filter(item => item.st === 'active').length <= config.surv,
    isWin: player.st === 'win' && previous.st !== 'win'
  };
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
  const actionResult = applyGameAction(pData, myId, type, r, c, mePrev);

  // 自分のデータだけ書く（全員分書くより大幅に速い）
  await db.ref(`rooms/${rId}/players/${myId}`).update(me);

  // 他プレイヤーのデータも変わるルールは追加書き込み
  if(actionResult.affectsOthers) {
    const otherUpdates = {};
    Object.entries(pData).forEach(([id, p]) => { if(id !== myId) otherUpdates[id] = p; });
    if(Object.keys(otherUpdates).length > 0) {
      await db.ref(`rooms/${rId}/players`).update(otherUpdates);
    }
  }
  
  if(currentUser && (type === 'correct' || type === 'wrong')) {
    updateAccountStats(type, actionResult.isWin);
  }
  
  if(actionResult.finished) await db.ref(`rooms/${rId}/status`).set('finished');
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
  const c = roomData.conf || {};
  const pData = resetPlayersForRule(roomData.players, roomData.rule, c);
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
