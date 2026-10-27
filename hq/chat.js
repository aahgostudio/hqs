/* 대화 — 대표 화면 (모든 방 · 원문/수정 이력 · 방 개설·인원·닫기 · 내보내기) */
(function(H){
const {esc} = H;
const ICON = {dm:'👤', all:'📣', team:'👥', site:'📍', custom:'💬'};
const KIND = {all:'전체', team:'팀', site:'현장', dm:'1:1', custom:'대표가 만든 방'};
const URL_ = (window.EP_CONFIG||{}).SUPABASE_URL;
const pub = p => `${URL_}/storage/v1/object/public/chat/${p}`;
const C = {home:null, cur:null, room:null, msgs:[], unread:{}, t:null, q:'', showClosed:false};
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
  const row = r => `<button class="ch-row ${C.cur===r.id?'on':''}" data-a="chOpen" data-id="${r.id}"><span class="ch-ic">${ICON[r.kind]}</span>
    <span class="t"><b>${esc(r.title)}${r.keep?' 📌':''}${OWN()&&r.mgr&&!H.S.needV6?' <small class="ch-tag" title="관리자도 참여">관리자</small>':''}${r.left_at?' <small class="ch-tag">퇴사</small>':''}${r.kind==='site'&&!r.live&&!r.closed?' <small class="ch-tag">직원 목록에서 빠짐</small>':''}</b><small>${r.last?esc(r.last.name+': '+r.last.body):'아직 대화 없음'}</small></span>
    <span class="r">${r.last?short(r.last.at):''}${r.unread?`<i class="ch-bd">${r.unread}</i>`:''}</span></button>`;
  const nClosed = rs.filter(r => r.closed).length;
  const due = !OWN() ? [] : rs.filter(r => r.kind === 'dm' && r.left_at && !r.keep && (Date.now() - new Date(r.left_at)) > 365*864e5);
  const dueHtml = due.map(r => `<div class="ch-due">⏳ <b>${esc(r.title)}</b> 퇴사 1년 지남 · 1:1 대화 ${r.count}건<span><button class="btn sm" data-a="chKeepId" data-id="${r.id}">장기 보관</button><button class="btn sm ghost" data-a="chPurge" data-id="${r.id}">정리</button></span></div>`).join('');
  return `${dueHtml}<div class="ch-lh"><input class="inp" placeholder="방 이름 찾기" value="${esc(C.q)}" data-chq="1">${OWN()?'<button class="btn sm" data-a="chNew">＋ 새 방</button>':''}</div>${OWN()?'':'<p class="note" style="margin:2px 4px 6px">관리자 참여 방만 보여요 · 방 만들기·닫기는 대표님만</p>'}
    ${C.showClosed ? `<div class="ch-sec">보관함 (닫은 방) <button class="link" data-a="chClosed">← 돌아가기</button></div>${vis.map(row).join('') || '<p class="note" style="padding:10px">닫은 방이 없어요</p>'}`
      : grp.map(([l, f]) => { const a = vis.filter(f); return a.length ? `<div class="ch-sec">${l} <span>${a.length}</span></div>${a.map(row).join('')}` : ''; }).join('')
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
      <div class="ch-line"><div class="ch-b ${m.deleted?'del':''}">${m.photo?`<a href="${esc(pub(m.photo))}" target="_blank" rel="noopener"><img src="${esc(pub(m.photo))}" alt="사진" loading="lazy"></a>`:''}${m.body?`<div>${esc(m.body)}</div>`:''}</div>
      <span class="ch-meta">${u?`<i>${u}</i>`:''}${tm(m.at)}</span></div>${hist}</div></div>`;
  });
  const mem = (R.members||[]).map(x => x.name).join(' · ');
  return `<div class="ch-rh"><div style="min-width:0"><b>${ICON[R.kind]} ${esc(R.title)}</b> <span class="note">${KIND[R.kind]} · ${(R.members||[]).length}명</span><div class="note ch-mem">${esc(mem || '인원 없음')}</div></div>
      <div class="ch-ra">${OWN() ? `${R.kind==='custom'?'<button class="btn sm ghost" data-a="chEdit">이름·인원</button>':'<button class="btn sm ghost" data-a="chRename">✏️ 이름</button>'}
        ${H.S.needV6?'':`<button class="btn sm ghost" data-a="chMgr" title="관리자(HQS)도 이 방을 보고 대화">${r.mgr?'👥 관리자 참여 중':'👥 관리자 빼고'}</button>`}
        <button class="btn sm ghost" data-a="chKeep" title="기간이 지나도 정리하지 않아요">${r.keep?'📌 고정 해제':'📌 보관 고정'}</button>
        <button class="btn sm ghost" data-a="chExport">내보내기(PDF)</button>
        <button class="btn sm ghost" data-a="chClose">${r.closed?'다시 열기':'방 닫기'}</button>` : '<span class="note">관리자로 참여 중</span>'}</div></div>
    <div class="ch-msgs" id="chMsgs">${out || '<p class="note" style="text-align:center;margin-top:40px">아직 대화가 없어요</p>'}</div>
    ${r.closed ? '<div class="ch-in note" style="justify-content:center">닫은 방이에요 · 직원 화면엔 안 보여요</div>' :
    `<div class="ch-in">${OWN() && R.kind==='dm' && !H.S.needV9 ? '<button class="btn ghost sm" data-a="chPay" title="입금 알림 보내고 기록">💸</button>' : ''}<label class="btn ghost sm" style="cursor:pointer">📷<input type="file" accept="image/*" hidden data-chfile="1"></label><textarea id="chT" rows="1" placeholder="${OWN()?'대표':'관리자'}로 보내기 · Enter 전송, Shift+Enter 줄바꿈"></textarea><button class="btn" data-a="chSend">보내기</button></div>`}`;
}

function paint(keep){
  const L = document.getElementById('chList'), R = document.getElementById('chRoom'); if (!L || !R) return;
  L.innerHTML = listHtml();
  const box0 = document.getElementById('chMsgs'), atB = !box0 || box0.scrollHeight - box0.scrollTop - box0.clientHeight < 80, top = box0 ? box0.scrollTop : 0;
  const t0 = document.getElementById('chT'), v = t0 ? t0.value : '';
  R.innerHTML = roomHtml();
  const box = document.getElementById('chMsgs'); if (box) box.scrollTop = keep && !atB ? top : box.scrollHeight;
  const t = document.getElementById('chT');
  if (t) { t.value = v; t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); H.ACT.chSend(); } }; }
  const q = L.querySelector('[data-chq]'); if (q) q.oninput = () => { C.q = q.value; const pos = q.selectionStart; L.innerHTML = listHtml(); const q2 = L.querySelector('[data-chq]'); q2.focus(); q2.setSelectionRange(pos,pos); q2.oninput = q.oninput; };
  const f = R.querySelector('[data-chfile]'); if (f) f.onchange = e => { const x = e.target.files[0]; if (x) sendPhoto(x); };
  const tg = document.getElementById('chOnTg'); if (tg) tg.checked = !!(C.home && C.home.on);
}

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

async function sendPhoto(f){
  if (f.size > 15*1024*1024) return H.toast('15MB 이하 사진만 올릴 수 있어요');
  try { const ext = (f.type.split('/')[1]||'jpg').replace('jpeg','jpg'), path = `boss/${C.cur}/${Date.now()}.${ext}`;
    const {error} = await H.sb.storage.from('chat').upload(path, f, {contentType: f.type || 'image/jpeg'}); if (error) throw error;
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
    if (C.goStaff && C.home) { const r = C.home.rooms.find(x => x.kind === 'dm' && x.staff_id === C.goStaff); C.goStaff = null; if (r) { C.showClosed = false; C.cur = r.id; } }
    paint(); if (C.cur) openRoom(C.cur).catch(H.fail); else poll(); }
});

H.chatGo = staffId => { C.goStaff = staffId; H._loaded = null; H.close(); H.go('chat'); };
H.ACT.chOpen = el => openRoom(+el.dataset.id);
H.ACT.chKeepId = async el => { await rpc('chat_admin_room_flag', {p_id: +el.dataset.id, p_closed: null, p_keep: true}); await loadHome(); paint(true); H.toast('장기 보관으로 고정했어요'); };
H.ACT.chPurge = async el => { const r = C.home.rooms.find(x => x.id === +el.dataset.id);
  if (!confirm(`${r.title}님과의 1:1 대화 ${r.count}건을 완전히 지울까요?\n되돌릴 수 없어요. 필요하면 먼저 [내보내기]로 PDF를 받아두세요.`)) return;
  await rpc('chat_admin_purge', {p_id: r.id}); if (C.cur === r.id) { C.cur = null; C.room = null; } await loadHome(); paint(); H.toast('정리했어요'); };
H.ACT.chClosed = () => { C.showClosed = !C.showClosed; paint(true); };
H.ACT.chSend = async () => {
  const t = document.getElementById('chT'); const v = (t && t.value || '').trim(); if (!v || !C.cur) return;
  t.value = ''; try { await rpc('chat_admin_send', {p_room: C.cur, p_body: v, p_photo: null}); await tick(); } catch(e){ t.value = v; H.fail(e); }
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
  const rows = m.map(x => `<tr><td>${dt(x.at)}</td><td>${esc(x.name)}</td><td>${x.photo?`<a href="${esc(pub(x.photo))}">[사진] ${esc(x.photo.split('/').pop())}</a><br>`:''}${esc(x.body||'')}
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
