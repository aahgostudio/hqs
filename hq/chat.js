/* 대화 — 대표 화면 (모든 방 · 원문/수정 이력 · 방 개설·인원·닫기 · 내보내기) */
(function(H){
const {esc} = H;
const ICON = {dm:'👤', all:'📣', team:'👥', site:'📍', custom:'💬'};
const ordOf = () => ((((H.S.settings||{}).chat_icons)||{})._order) || [];
const byOrd = arr => { const o = ordOf(); const ix = id => { const i = o.indexOf(id); return i < 0 ? 1e6 : i; }; return arr.map((r, i) => [r, i]).sort((a, b) => ix(a[0].id) - ix(b[0].id) || a[1] - b[1]).map(x => x[0]); };   // 대표가 끌어서 정한 방 순서
const parOf = () => ((((H.S.settings||{}).chat_icons)||{})._parent) || {};
// 하위 방: 윗방 바로 밑으로 모으기 (한 단계만)
const tree = arr => { const P = parOf(), ids = new Set(arr.map(r => r.id)), out = [];
  arr.forEach(r => { const p = P[r.id]; if (p && ids.has(+p) && !P[p]) return; out.push(r);
    arr.filter(k => +P[k.id] === r.id).forEach(k => { k._kid = true; if (!C.fold[r.id]) out.push(k); }); r._kids = arr.filter(k => +P[k.id] === r.id).length; });
  return out; };
const icOf = r => (((H.S.settings||{}).chat_icons||{})[r.id]) || ICON[r.kind];   // 대표가 고른 방 아이콘
const ICON_SETS = [
  ['공지·전체', ['📣','📢','🔔','📌','⭐','🌟','✨','🎉','🙌','👏','💪','🔥']],
  ['클린·현장', ['🧹','🧽','🧼','🧴','🪣','🫧','✨','🚿','🛁','🪟','🧺','🗑️','♻️','🧯','🪜','🔧','🛠️','🔨','🪛','🧰','🏗️','🚧','🚚','🚐']],
  ['부동산·건물', ['🏠','🏡','🏢','🏬','🏪','🏫','🏨','🏘️','🏙️','🔑','🗝️','🚪','📐','📏','🧾','📝','✍️','🤝']],
  ['팀·사람', ['👥','👔','👷','🧑‍💼','🧑‍🔧','🧑‍🏫','👨‍👩‍👧','💁','🙋','🤗','😊','😎']],
  ['일정·업무', ['📅','🗓️','⏰','📋','📎','💼','📷','📸','📦','💬','💡','📊','💰','💳','🧮','🎯']],
  ['자연·기분', ['🌱','🌿','🍀','🌸','🌼','🌻','☀️','🌙','🌈','☕','🍙','🎈']]
];
const KIND = {all:'전체', team:'팀', site:'현장', dm:'1:1', custom:'대표가 만든 방'};
const URL_ = (window.EP_CONFIG||{}).SUPABASE_URL;
const pub = p => `${URL_}/storage/v1/object/public/chat/${p}`;
const C = {fold: {}, home:null, cur:null, room:null, msgs:[], unread:{}, t:null, q:'', showClosed:false};
const tm = iso => { const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const dt = iso => { const d = new Date(iso); return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${tm(iso)}`; };
const day = iso => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`; };
const short = iso => { const d = new Date(iso), t = new Date(); return d.toDateString() === t.toDateString() ? tm(iso) : `${d.getMonth()+1}/${d.getDate()}`; };
const OWN = () => !!H.S.owner;
const rpc = async (fn, args) => { const {data, error} = await H.sb.rpc(fn, args || {}); if (error) throw error; return data; };

async function loadHome(){ C.home = await rpc('chat_admin_home'); H.S.chatUnread = C.home.rooms.reduce((a,r) => a + (r.closed ? 0 : r.unread||0), 0); }

function listHtml(){
  const rs = (C.home && C.home.rooms) || [], q = C.q.trim();
  const vis = rs.filter(r => (OWN() || (r.mgr && !r.closed && r.live)) && (C.showClosed ? r.closed : !r.closed) && (r.kind !== 'site' || r.live || r.count || C.showClosed) && (!q || r.title.includes(q)));
  const grp = [['함께하는 방', r => ['all','team','custom'].includes(r.kind)], ['현장', r => r.kind === 'site'], ['1:1', r => r.kind === 'dm']];
  const dnd = OWN() && !C.showClosed;
  const row = r => `<button class="ch-row ${C.cur===r.id?'on':''}${r._kid?' ch-kid':''}" data-kid="${r._kid?1:0}" data-kids="${r._kids||0}" data-a="chOpen" data-id="${r.id}" ${dnd?`draggable="true" data-sec="${['all','team','custom'].includes(r.kind)?'g':r.kind}"`:''}><span class="ch-ic${OWN()&&r.mgr&&!H.S.needV6?' mgr':''}" ${OWN()&&r.mgr&&!H.S.needV6?'title="관리자(HQS)도 참여하는 방"':''}>${icOf(r)}</span>
    <span class="t"><b>${esc(r.title)}${r.keep?' 📌':''}${r.left_at?' <small class="ch-tag">퇴사</small>':''}${r.kind==='site'&&!r.live&&!r.closed?' <small class="ch-tag">직원 목록에서 빠짐</small>':''}</b><small>${r.last?esc(r.last.name+': '+r.last.body):'아직 대화 없음'}</small></span>
    <span class="r">${r.last?short(r.last.at):''}${r.unread?`<i class="ch-bd">${r.unread}</i>`:''}${r._kids?`<i class="ch-fold" data-fold="${r.id}" title="하위 방 접기/펴기">${C.fold[r.id]?'▸':'▾'} ${r._kids}</i>`:''}</span></button>`;
  const nClosed = rs.filter(r => r.closed).length;
  const due = !OWN() ? [] : rs.filter(r => r.kind === 'dm' && r.left_at && !r.keep && (Date.now() - new Date(r.left_at)) > 365*864e5);
  const dueHtml = due.map(r => `<div class="ch-due">⏳ <b>${esc(r.title)}</b> 퇴사 1년 지남 · 1:1 대화 ${r.count}건<span><button class="btn sm" data-a="chKeepId" data-id="${r.id}">장기 보관</button><button class="btn sm ghost" data-a="chPurge" data-id="${r.id}">정리</button></span></div>`).join('');
  return `${dueHtml}<div class="ch-lh"><input class="inp" placeholder="방 이름 찾기" value="${esc(C.q)}" data-chq="1">${OWN()?'<button class="btn sm" data-a="chNew">＋ 새 방</button>':''}</div>${OWN()?'':'<p class="note" style="margin:2px 4px 6px">관리자 참여 방만 보여요 · 방 만들기·닫기는 대표님만</p>'}
    ${C.showClosed ? `<div class="ch-sec">보관함 (닫은 방) <button class="link" data-a="chClosed">← 돌아가기</button></div>${vis.map(row).join('') || '<p class="note" style="padding:10px">닫은 방이 없어요</p>'}`
      : grp.map(([l, f]) => { const a = tree(byOrd(vis.filter(f)).map(r => (delete r._kid, delete r._kids, r))); return a.length ? `<div class="ch-sec">${l} <span>${a.length}</span></div>${a.map(row).join('')}` : ''; }).join('')
        + (OWN() ? `<button class="ch-closed" data-a="chClosed">🗄 보관함 · 닫은 방 ${nClosed}개</button>` : '')}`;
}

function roomHtml(){
  if (!C.room) return `<div class="ch-empty"><div style="font-size:40px">💬</div><b>왼쪽에서 방을 고르세요</b><p class="note">대화·사진은 3년 보관 · 직원이 수정·삭제해도 원문이 여기 남아요</p></div>`;
  const r = C.home.rooms.find(x => x.id === C.cur) || {}, R = C.room.room;
  let last = '', out = '';
  C.msgs.forEach(m => {
    if (new Date(m.at).toDateString() !== last) { last = new Date(m.at).toDateString(); out += `<div class="ch-day">${day(m.at)}</div>`; }
    const u = C.unread[m.id] || 0;
    const hist = (m.history||[]).length ? `<details class="ch-hist"><summary>${m.deleted?'삭제됨':'수정됨'} · 이력 ${(m.history||[]).length}</summary>${m.history.map(h => `<div>${dt(h.at)} ${h.act==='delete'?'삭제 전':'수정 전'}: ${esc(h.body||'')}${h.photo?' [사진]':''}</div>`).join('')}</details>` : '';
    out += `<div class="ch-m ${m.mine?'mine':''}">${m.mine?'':`<span class="ch-av">${m.avatar?`<img src="${esc(URL_+'/storage/v1/object/public/avatars/'+m.avatar)}" alt="">`:esc(H.two ? H.two(m.name) : m.name.slice(-2))}</span>`}
      <div class="ch-col">${m.mine?'':`<span class="ch-nm">${esc(m.name)}</span>`}
      <div class="ch-line"><div class="ch-b ${m.deleted?'del':''}">${m.photo?(isVid(m.photo)?`<video src="${esc(pub(m.photo))}#t=0.1" controls playsinline preload="metadata"></video>`:`<a href="${esc(pub(m.photo))}" target="_blank" rel="noopener"><img src="${esc(pub(m.photo))}" alt="사진" loading="lazy"></a>`):''}${m.body?`<div>${esc(m.body)}</div>`:''}</div>
      <span class="ch-meta">${u?`<i>${u}</i>`:''}${tm(m.at)}</span></div>${hist}</div></div>`;
  });
  const mem = (R.members||[]).map(x => x.name).join(' · ');
  return `<div class="ch-rh"><button class="ch-back" data-a="chBack" aria-label="목록으로">←</button><div style="min-width:0;flex:1"><b>${icOf(R)} ${esc(R.title)}</b> <span class="note">${KIND[R.kind]} · ${(R.members||[]).length}명</span><div class="note ch-mem">${esc(mem || '인원 없음')}</div></div>
      <button class="ch-more" data-a="chMore" aria-label="방 설정">⋯</button><div class="ch-ra">${OWN() ? `${R.kind==='custom'?'<button class="btn sm ghost" data-a="chEdit">이름·인원</button>':'<button class="btn sm ghost" data-a="chRename">✏️ 이름</button>'}<button class="btn sm ghost" data-a="chIcon">🙂 아이콘</button>
        ${H.S.needV6?'':`<button class="btn sm ghost" data-a="chMgr" title="관리자(HQS)도 이 방을 보고 대화">${r.mgr?'👥 관리자 참여 중':'👥 관리자 빼고'}</button>`}
        <button class="btn sm ghost" data-a="chKeep" title="기간이 지나도 정리하지 않아요">${r.keep?'📌 고정 해제':'📌 보관 고정'}</button>
        <button class="btn sm ghost" data-a="chExport">내보내기(PDF)</button>
        <button class="btn sm ghost" data-a="chClose">${r.closed?'다시 열기':'방 닫기'}</button>` : '<span class="note">관리자로 참여 중</span>'}</div></div>
    <div class="ch-msgs" id="chMsgs">${out || '<p class="note" style="text-align:center;margin-top:40px">아직 대화가 없어요</p>'}</div>
    ${r.closed ? '<div class="ch-in note" style="justify-content:center">닫은 방이에요 · 직원 화면엔 안 보여요</div>' :
    `<div class="ch-in">${OWN() && R.kind==='dm' && !H.S.needV9 ? '<button class="btn ghost sm" data-a="chPay" title="입금 알림 보내고 기록">💸</button>' : ''}<button class="btn ghost sm ch-plus" data-a="chMedia" title="사진·동영상">＋</button><textarea id="chT" rows="1" placeholder="${OWN()?'대표':'관리자'}로 보내기 · Enter 전송, Shift+Enter 줄바꿈"></textarea><button class="btn" data-a="chSend">보내기</button></div>`}`;
}

// 방 순서: PC에서 끌어다 놓기 (같은 묶음 안에서만)
function bindDnd(L){
  if (L._dnd) return; L._dnd = true; let src = null;
  L.addEventListener('dragstart', e => { const b = e.target.closest('.ch-row[draggable]'); if (!b) return; src = b; b.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', b.dataset.id); } catch(_){} });
  L.addEventListener('dragend', () => { if (src) src.classList.remove('drag'); src = null; L.querySelectorAll('.ch-row.over').forEach(x => x.classList.remove('over')); });
  const zone = (t, e) => { const r = t.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
    const nest = y > .28 && y < .72 && t.dataset.sec === 'g' && t.dataset.kid !== '1' && src.dataset.kids === '0';
    return nest ? 'in' : (y < .5 ? 'up' : 'down'); };
  const clear = () => L.querySelectorAll('.ch-row.over,.ch-row.over-dn,.ch-row.into').forEach(x => x.classList.remove('over','over-dn','into'));
  L.addEventListener('dragover', e => { const t = e.target.closest('.ch-row[draggable]'); if (!src || !t || t === src || t.dataset.sec !== src.dataset.sec) return; e.preventDefault();
    clear(); const z = zone(t, e); t.classList.add(z === 'in' ? 'into' : z === 'up' ? 'over' : 'over-dn'); });
  L.addEventListener('click', e => { const f = e.target.closest('[data-fold]'); if (!f) return; e.stopPropagation(); e.preventDefault(); const id = +f.dataset.fold; C.fold[id] = !C.fold[id]; paint(true); }, true);
  L.addEventListener('drop', async e => { const t = e.target.closest('.ch-row[draggable]'); if (!src || !t || t === src || t.dataset.sec !== src.dataset.sec) return; e.preventDefault();
    const z = zone(t, e); clear();
    const m = Object.assign({}, (H.S.settings||{}).chat_icons || {}), P = Object.assign({}, m._parent || {}), sid = +src.dataset.id, tid = +t.dataset.id;
    if (z === 'in') { P[sid] = tid; t.parentNode.insertBefore(src, t.nextSibling); }
    else { t.parentNode.insertBefore(src, z === 'down' ? t.nextSibling : t);
      if (t.dataset.kid === '1' && src.dataset.kids === '0') P[sid] = P[tid]; else delete P[sid]; }
    m._order = [...L.querySelectorAll('.ch-row[draggable]')].map(x => +x.dataset.id); m._parent = P;
    try { await H.q(H.sb.from('settings').upsert({key:'chat_icons', value:m})); H.S.settings.chat_icons = m;
      H.toast(z === 'in' ? '하위 방으로 넣었어요' : P[sid] ? '순서를 바꿨어요' : '방 순서를 바꿨어요 · 직원 화면도 이 순서예요'); } catch(err){ H.fail(err); }
    paint(true); });
}

function paint(keep){
  const L = document.getElementById('chList'), R = document.getElementById('chRoom'); if (!L || !R) return;
  L.innerHTML = listHtml(); bindDnd(L);
  const W = L.parentElement; if (W) W.classList.toggle('inroom', !!C.cur); document.body.classList.toggle('chroom', !!C.cur);   // 폰: 방 열면 목록 숨기고 방만 꽉 차게
  const box0 = document.getElementById('chMsgs'), atB = !box0 || box0.scrollHeight - box0.scrollTop - box0.clientHeight < 80, top = box0 ? box0.scrollTop : 0;
  // 입력칸은 그대로 두고 나머지만 다시 그림 (폰에서 글 쓰는 중에 키보드가 닫히지 않게)
  const oldIn = R.querySelector('.ch-in'), same = oldIn && R.dataset.room === String(C.cur);
  const tmp = document.createElement('div'); tmp.innerHTML = roomHtml();
  const newIn = tmp.querySelector('.ch-in');
  const oRh = R.querySelector('.ch-rh'), nRh = tmp.querySelector('.ch-rh'), oM = R.querySelector('#chMsgs'), nM = tmp.querySelector('#chMsgs');
  if (same && newIn && oldIn.querySelector('#chT') && newIn.querySelector('#chT') && oRh && nRh && oM && nM) {
    // 입력칸은 건드리지 않고(움직이기만 해도 키보드가 닫힘) 위쪽 줄과 메시지만 바꿈
    if (oRh.classList.contains('open')) nRh.classList.add('open'); oRh.replaceWith(nRh); oM.innerHTML = nM.innerHTML;
  } else { R.replaceChildren(...tmp.childNodes); }
  R.dataset.room = String(C.cur);
  const box = document.getElementById('chMsgs'); if (box) box.scrollTop = keep && !atB ? top : box.scrollHeight;
  const t = document.getElementById('chT');
  if (t && !t._bound) { t._bound = true;
    // PC: Enter 전송 · Shift+Enter 줄바꿈 / 폰: Enter는 줄바꿈, [보내기] 버튼으로만 전송
    t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); H.ACT.chSend(); } };
    t.oninput = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; };
    if (!matchMedia('(pointer:fine)').matches) t.placeholder = (OWN() ? '대표' : '관리자') + '로 보내기'; }
  const q = L.querySelector('[data-chq]'); if (q) q.oninput = () => { C.q = q.value; const pos = q.selectionStart; L.innerHTML = listHtml(); const q2 = L.querySelector('[data-chq]'); q2.focus(); q2.setSelectionRange(pos,pos); q2.oninput = q.oninput; };
  const tg = document.getElementById('chOnTg'); if (tg) tg.checked = !!(C.home && C.home.on);
}

document.addEventListener('touchstart', e => { const b = e.target.closest('[data-a="chSend"]'); if (b && document.activeElement && document.activeElement.id === 'chT') { e.preventDefault(); H.ACT.chSend(); } }, {passive:false});   // 폰: [보내기] 눌러도 키보드 유지

async function openRoom(id){
  const rr = C.home && C.home.rooms.find(x => x.id === id); if (!OWN() && rr && !(rr.mgr && !rr.closed && rr.live)) { C.cur = null; C.room = null; return paint(); }
  C.cur = id; C.room = await rpc('chat_admin_load', {p_room: id, p_after: 0, p_before: null, p_limit: 300});
  C.msgs = C.room.msgs; C.unread = C.room.unread || {};
  const r = C.home.rooms.find(x => x.id === id); if (r) r.unread = 0;
  paint(); poll();
}
async function tick(){
  if (H.cur() !== 'chat' || document.hidden) return;
  try {
    if (C.cur) { const last = C.msgs.length ? C.msgs[C.msgs.length-1].id : 0;
      const d = await rpc('chat_admin_load', {p_room: C.cur, p_after: last, p_before: null, p_limit: 300});
      Object.assign(C.unread, d.unread || {}); if (d.msgs.length) C.msgs = C.msgs.concat(d.msgs); }
    await loadHome(); paint(true);
  } catch(_){}
}
function poll(){ clearInterval(C.t); C.t = setInterval(tick, 4000); }

const isVid = p => /\.(mov|mp4|m4v|webm|3gp)$/i.test(p || '');
const extOf = f => { const n = ((f.name || '').split('.').pop() || '').toLowerCase(); if (/^(jpe?g|png|webp|heic|heif|mov|mp4|m4v|webm|3gp)$/.test(n)) return n.replace('jpeg','jpg'); const t = (f.type || '').split('/')[1] || 'jpg'; return t === 'quicktime' ? 'mov' : t.replace('jpeg','jpg'); };

// 📷 누르면: 사진 찍기 / 동영상 찍기 / 앨범 — 폰 기본 선택창(카메라 2개+파일)보다 단순하게
function pickMedia(onFiles){
  const old = document.getElementById('mpick'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'mpick';
  d.innerHTML = `<style>#mpick{position:fixed;inset:0;z-index:300;background:rgba(15,23,42,.45);display:flex;align-items:flex-end;justify-content:center}
#mpick .sh{width:100%;max-width:480px;background:#fff;color:#141A2A;border-radius:22px 22px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-family:inherit}
#mpick .sh button{border:0;background:#F4F6FA;border-radius:18px;padding:18px 6px;font:inherit;font-size:14px;font-weight:700;color:inherit;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer}
#mpick .sh button i{font-style:normal;display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:#fff;color:#334155}
#mpick .sh .x{grid-column:1/-1;background:none;padding:12px;color:#6B7385;font-weight:600}</style>
<div class="sh"><button data-pk="cam"><i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg></i>사진 찍기</button><button data-pk="vid"><i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg></i>동영상 찍기</button><button data-pk="alb"><i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/></svg></i>앨범</button><button class="x" data-pk="x">취소</button></div>`;
  d.addEventListener('click', e => {
    const b = e.target.closest('[data-pk]'); if (!b && e.target !== d) return;
    const k = b ? b.dataset.pk : 'x'; d.remove(); if (k === 'x') return;
    const i = document.createElement('input'); i.type = 'file'; i.style.display = 'none';
    if (k === 'cam') { i.accept = 'image/*'; i.setAttribute('capture', 'environment'); }
    else if (k === 'vid') { i.accept = 'video/*'; i.setAttribute('capture', 'environment'); }
    else if (/Android/i.test(navigator.userAgent)) { i.accept = '.jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.3gp,.webm'; }   // 갤럭시: 카메라 선택창 건너뛰고 바로 사진·파일 고르기로
    else { i.accept = 'image/*,video/*'; i.multiple = true; }   // 갤럭시(카톡 안)는 여러 장 선택이면 창이 안 열려서 한 장씩
    i.onchange = () => { const fs = [...(i.files || [])]; i.remove(); if (fs.length) onFiles(fs); };
    document.body.appendChild(i); i.click();
  });
  document.body.appendChild(d);
}
H.ACT.chMedia = () => pickMedia(async fs => { for (const f of fs) await sendPhoto(f); });
async function sendPhoto(f){
  const vid = /^video\//.test(f.type || '') || isVid(f.name);
  if (vid && f.size > 50*1024*1024) return H.toast('동영상은 50MB(약 30초~1분)까지 올릴 수 있어요');
  if (!vid && f.size > 15*1024*1024) return H.toast('15MB 이하 사진만 올릴 수 있어요');
  try { const path = `boss/${C.cur}/${Date.now()}.${extOf(f)}`; if (vid) H.toast('동영상 올리는 중…');
    const {error} = await H.sb.storage.from('chat').upload(path, f, {contentType: f.type || (vid ? 'video/mp4' : 'image/jpeg')}); if (error) throw error;
    await rpc('chat_admin_send', {p_room: C.cur, p_body: null, p_photo: path}); await tick();
  } catch(e){ H.fail(e); }
}

H.view('chat', {label:'대화',
  async load(){ if (H.S.needV5 || (!H.S.owner && H.S.needV6)) return; await loadHome(); },
  render(){
    if (H.S.needV5 || (!H.S.owner && H.S.needV6)) return `<section class="box"><div class="banner warn"><b>대화 기능을 쓰려면 업데이트가 필요해요</b> — ${H.S.isOwner?"홈 화면 위 'SQL 복사' → SQL Editor에 붙여넣고 Run → 새로고침":'대표님께 업데이트를 요청해 주세요'}</div></section>`;
    const on = C.home && C.home.on;
    if (!H.S.owner) return `<section class="box ch-top"><div><h2 style="margin:0">대화</h2><small class="note">관리자 참여 방 · 대화와 사진은 업무 기록으로 보관돼요</small></div></section>
      <div class="ch-wrap"><aside class="box ch-list" id="chList"></aside><section class="box ch-room" id="chRoom"></section></div>`;
    return `<section class="box ch-top"><div><h2 style="margin:0">대화</h2><small class="note">직원은 자기 방만 봐요 · 방 개설·인원·닫기는 대표만 · 대화와 사진은 3년 보관</small></div>
      <label class="ch-sw"><input type="checkbox" id="chOnTg" ${on?'checked':''} data-a="chOn"><span></span><b>${on?'직원에게 열림':'직원에게 닫힘 (준비 중)'}</b></label></section>
      <div class="ch-wrap"><aside class="box ch-list" id="chList"></aside><section class="box ch-room" id="chRoom"></section></div>`;
  },
  after(){
    { const m = (location.hash||'').match(/^#chat\/(\d+)/); if (m && C.home) { const id = +m[1]; if (C.home.rooms.some(x => x.id === id)) { C.showClosed = false; C.cur = id; } history.replaceState(null, '', location.pathname + location.search + '#chat'); } }   // 알림톡 [대화 보기] → 그 방 바로 열기
    if (C.goStaff && C.home) { const r = C.home.rooms.find(x => x.kind === 'dm' && x.staff_id === C.goStaff); C.goStaff = null; if (r) { C.showClosed = false; C.cur = r.id; } }
    paint(); if (C.cur) openRoom(C.cur).catch(H.fail); else poll(); }
});

H.chatGo = staffId => { C.goStaff = staffId; H._loaded = null; H.close(); H.go('chat'); };
H.ACT.chOpen = el => { if (matchMedia('(max-width:860px)').matches && !(history.state && history.state.chRoom)) history.pushState({chRoom: +el.dataset.id}, ''); return openRoom(+el.dataset.id); };   // 폰: 뒤로가기 = 목록
H.ACT.chKeepId = async el => { await rpc('chat_admin_room_flag', {p_id: +el.dataset.id, p_closed: null, p_keep: true}); await loadHome(); paint(true); H.toast('장기 보관으로 고정했어요'); };
H.ACT.chPurge = async el => { const r = C.home.rooms.find(x => x.id === +el.dataset.id);
  if (!confirm(`${r.title}님과의 1:1 대화 ${r.count}건을 완전히 지울까요?\n되돌릴 수 없어요. 필요하면 먼저 [내보내기]로 PDF를 받아두세요.`)) return;
  await rpc('chat_admin_purge', {p_id: r.id}); if (C.cur === r.id) { C.cur = null; C.room = null; } await loadHome(); paint(); H.toast('정리했어요'); };
H.ACT.chClosed = () => { C.showClosed = !C.showClosed; paint(true); };
H.ACT.chSend = async () => {
  const t = document.getElementById('chT'); const v = (t && t.value || '').trim(); if (!v || !C.cur) return;
  t.value = ''; t.style.height = ''; t.focus(); try { await rpc('chat_admin_send', {p_room: C.cur, p_body: v, p_photo: null}); await tick(); } catch(e){ t.value = v; H.fail(e); }
};
H.ACT.chOn = async el => {
  const on = el.checked;
  if (on && !confirm('직원 전원 화면에 [대화] 탭이 열려요. 열까요?')) { el.checked = false; return; }
  await rpc('chat_admin_set', {p_on: on, p_beta: null}); await loadHome(); H.toast(on ? '직원에게 대화를 열었어요' : '직원 화면에서 대화를 닫았어요'); H.render();
};
H.ACT.chMgr = async () => { const r = C.home.rooms.find(x => x.id === C.cur); await rpc('chat_admin_room_flag', {p_id: C.cur, p_closed: null, p_keep: null, p_mgr: !r.mgr}); await loadHome(); paint(true); H.toast(r.mgr ? '관리자 화면에서 이 방을 뺐어요' : '관리자도 이 방에 참여해요'); };
H.ACT.chPay = async () => { const R = C.room.room, nm = (R.members||[])[0] ? (R.members[0].name.length >= 3 ? R.members[0].name.slice(1) : R.members[0].name) : '';
  const v = prompt(`${nm}님께 입금 알림 (만원 단위 숫자, 예: 7)`); if (!v) return; const n = String(v).trim();
  await rpc('chat_admin_send', {p_room: C.cur, p_body: `${nm}님 ${n} 넣었어요\n고맙습니다`, p_photo: null}); await tick(); H.toast('입금 알림을 보내고 기록했어요'); };
H.ACT.chKeep = async () => { const r = C.home.rooms.find(x => x.id === C.cur); await rpc('chat_admin_room_flag', {p_id: C.cur, p_closed: null, p_keep: !r.keep}); await loadHome(); paint(true); H.toast(r.keep ? '보관 고정을 풀었어요' : '보관 고정 · 기간이 지나도 정리하지 않아요'); };
H.ACT.chClose = async () => { const r = C.home.rooms.find(x => x.id === C.cur);
  if (!r.closed && !confirm(`'${r.title}' 방을 닫을까요?\n직원 목록에서 사라지고, 대화 기록은 보관함에 남아요.`)) return;
  await rpc('chat_admin_room_flag', {p_id: C.cur, p_closed: !r.closed, p_keep: null}); await loadHome(); paint(true); H.toast(r.closed ? '다시 열었어요' : '방을 닫았어요 · 보관함에 있어요'); };

function roomForm(r){
  const sel = new Set((r && r.members) || []);
  const staff = (H.S.staff||[]).filter(s => s.status !== 'left');
  const byTeam = {}; staff.forEach(s => (byTeam[s.team] = byTeam[s.team] || []).push(s));
  H.open(`<form data-f="chRoom"><h3>${r ? '방 이름·인원' : '새 방 만들기'}</h3><input type="hidden" name="id" value="${r ? r.id : ''}">
    <label class="fl">방 이름<input class="inp" name="title" required maxlength="40" placeholder="예: 11월 대청소 TF" value="${esc(r ? r.custom_title || r.title : '')}"></label>
    <div class="fl">인원 <span class="note">대표님은 모든 방에 자동으로 있어요</span></div>
    ${Object.entries(byTeam).map(([t, a]) => `<div class="ptitle">${esc(H.T(t).name)}</div><div class="ch-pick">${a.map(s => `<label><input type="checkbox" name="m" value="${s.id}" ${sel.has(s.id)?'checked':''}> ${esc(s.name)} <small>${esc(s.role||'')}</small></label>`).join('')}</div>`).join('')}
    ${H.sacts(r ? '저장' : '만들기')}</form>`);
}
H.ACT.chRename = async () => { const r = C.home.rooms.find(x => x.id === C.cur);
  const v = prompt('방 이름 (비우면 원래 이름으로 돌아가요)', r.custom_title || r.title); if (v === null) return;
  await rpc('chat_admin_room_save', {p_id: r.id, p_title: v, p_members: null}); await loadHome(); await openRoom(r.id); H.toast('이름을 바꿨어요 · 직원 화면에도 이 이름으로 보여요'); };
H.ACT.chIcon = () => { const r = C.home.rooms.find(x => x.id === C.cur); if (!r) return;
  H.open(`<h3>방 아이콘</h3><p class="note" style="margin:-4px 0 12px">${esc(r.title)} · 직원 화면에도 이 아이콘으로 보여요</p>
    <div style="max-height:56vh;overflow:auto;padding-right:4px">${ICON_SETS.map(([t, a]) => `<div class="note" style="margin:10px 0 6px;font-weight:700">${t}</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${a.map(e => `<button class="btn ghost" style="font-size:24px;padding:8px 0${icOf(r)===e?';outline:2px solid var(--navy)':''}" data-a="chIconSet" data-e="${e}">${e}</button>`).join('')}</div>`).join('')}</div>
    <div class="sacts"><button type="button" class="btn ghost" data-a="chIconSet" data-e="">기본으로</button><button type="button" class="btn ghost" data-a="close">닫기</button></div>`); };
H.ACT.chIconSet = async el => { const id = C.cur, m = Object.assign({}, (H.S.settings||{}).chat_icons || {});
  if (el.dataset.e) m[id] = el.dataset.e; else delete m[id];
  await H.q(H.sb.from('settings').upsert({key:'chat_icons', value:m})); H.S.settings.chat_icons = m; H.close(); paint(); if (C.cur) openRoom(C.cur); H.toast('아이콘을 바꿨어요'); };
H.ACT.chBack = () => { if (history.state && history.state.chRoom) history.back(); else { C.cur = null; C.room = null; paint(); } };
H.ACT.chMore = el => el.closest('.ch-rh').classList.toggle('open');
window.addEventListener('popstate', () => { if (C.cur && H.cur() === 'chat' && !(history.state && history.state.chRoom)) { C.cur = null; C.room = null; paint(); } });
H.ACT.chNew = () => roomForm(null);
H.ACT.chEdit = () => roomForm(C.home.rooms.find(x => x.id === C.cur));
H.FORM.chRoom = async (fd0, f) => {
  const fd = new FormData(f), id = fd.get('id') ? +fd.get('id') : null;
  const rid = await rpc('chat_admin_room_save', {p_id: id, p_title: fd.get('title'), p_members: fd.getAll('m')});
  H.close(); await loadHome(); H.toast(id ? '저장했어요' : '방을 만들었어요'); await openRoom(rid);
};

// 내보내기: 방 전체 기록 (원문·수정/삭제 이력 포함) → 인쇄 창에서 PDF로 저장
H.ACT.chExport = async () => {
  const d = await rpc('chat_admin_load', {p_room: C.cur, p_after: 0, p_before: null, p_limit: 5000});
  const R = d.room, m = d.msgs, from = m[0] ? dt(m[0].at) : '-', to = m.length ? dt(m[m.length-1].at) : '-';
  const rows = m.map(x => `<tr><td>${dt(x.at)}</td><td>${esc(x.name)}</td><td>${x.photo?`<a href="${esc(pub(x.photo))}">[${isVid(x.photo)?'동영상':'사진'}] ${esc(x.photo.split('/').pop())}</a><br>`:''}${esc(x.body||'')}
    ${x.deleted?'<div class="f">※ 작성자가 삭제한 메시지 (원문 보관)</div>':''}${(x.history||[]).map(h => `<div class="f">※ ${dt(h.at)} ${h.act==='delete'?'삭제':'수정'} 전 내용: ${esc(h.body||'')}</div>`).join('')}</td></tr>`).join('');
  const w = window.open('', '_blank'); if (!w) return H.toast('팝업이 막혀 있어요 · 허용해 주세요');
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>대화 기록 · ${esc(R.title)}</title>
    <style>body{font-family:-apple-system,'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111;margin:28px;font-size:12px}h1{font-size:18px;margin:0 0 6px}
    .meta{color:#555;margin-bottom:14px;line-height:1.6}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #ddd;padding:6px 8px;vertical-align:top}
    td:first-child{white-space:nowrap;width:120px;color:#555}td:nth-child(2){white-space:nowrap;width:70px;font-weight:700}.f{color:#B45309;font-size:11px;margin-top:3px}
    @media print{a{color:#111;text-decoration:none}}</style></head><body>
    <h1>어닝플레이스 대화 기록 — ${esc(R.title)}</h1>
    <div class="meta">구분: ${KIND[R.kind]} · 현재 인원: ${esc((R.members||[]).map(x=>x.name).join(', '))} + 대표<br>기간: ${from} ~ ${to} · 메시지 ${m.length}건<br>
    출력: ${dt(new Date().toISOString())} · 시간은 서버 기록 기준 · 수정·삭제된 메시지는 원문과 이력을 함께 표시</div>
    <table>${rows}</table><script>setTimeout(()=>print(),400)<\/script></body></html>`);
  w.document.close();
};
})(window.HQ);
