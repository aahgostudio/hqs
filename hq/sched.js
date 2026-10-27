/* 일정 (통합 일정판) */
(function(H){
const {esc, md, won, ymd, parse, addDays, DOW, I, sb} = H;
const V = H.V = H.V || {};
V.sched = {anchor: new Date(H.today().getFullYear(), H.today().getMonth(), 1), sel: ymd(H.today()), f: {clean:true, res:true, ntc:true, me:true, avail:false}, side:'day', mode:'month'};
const st = () => V.sched;
const gridRange = () => { const a = st().anchor; const s = addDays(a, -a.getDay()); const last = new Date(a.getFullYear(), a.getMonth()+1, 0); const e = addDays(last, 6 - last.getDay()); return [s, e]; };

H.view('sched', {label:'일정',
  async load(){ const [s, e] = gridRange(); await Promise.all([H.loadRange(s, e), H.loadFeed()]); },
  render(){
    const S = H.S, v = st(), [gs, ge] = gridRange(), today = ymd(H.today());
    const newRep = (S.reports||[]).filter(r=>!r.checked_at).length;
    const head = `<div class="bh"><h3>${v.anchor.getFullYear()}년 ${v.anchor.getMonth()+1}월</h3>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <div class="chips">${[['clean','클린','var(--clean)'],['res','부동산','var(--res)'],['ntc','공지','var(--notice)'],['me','내 일정','#9CA3AF'],['avail','가능·불가일','#86EFAC']].map(([k,l,c])=>`<label><input type="checkbox" data-c="schedF" value="${k}" ${v.f[k]?'checked':''}><span><i style="background:${c}"></i>${l}</span></label>`).join('')}</div>
        <div class="seg"><button data-a="schedMode" data-m="month" aria-pressed="${v.mode==='month'}">달력</button><button data-a="schedMode" data-m="list" aria-pressed="${v.mode==='list'}">목록</button></div>
        <button class="btn ghost sm" data-a="schedNav" data-n="-1" aria-label="이전 달">${I('left')}</button><button class="btn ghost sm" data-a="schedNav" data-n="0">오늘</button><button class="btn ghost sm" data-a="schedNav" data-n="1" aria-label="다음 달">${I('right')}</button>
        <button class="btn sm" data-a="addMenu">${I('plus')}올리기</button></div></div>`;
    let body = '';
    if (v.mode === 'month') {
      let h = `<div class="cal"><table><thead><tr>${DOW.map((d,i)=>`<th style="${i===0?'color:var(--warn)':''}">${d}</th>`).join('')}</tr></thead><tbody>`;
      for (let d = new Date(gs); d <= ge; d = addDays(d, 1)) {
        if (d.getDay() === 0) h += '<tr>';
        const s = ymd(d); const items = dayItems(s);
        const av = v.f.avail ? (S.avail||[]).filter(a=>a.day===s) : [];
        const ok = av.filter(a=>a.kind==='ok').length, no = av.filter(a=>a.kind==='no').length;
        h += `<td data-a="schedPick" data-d="${s}" class="${d.getMonth()!==v.anchor.getMonth()?'out':''} ${s===today?'t':''} ${s===v.sel?'sel':''}"><span class="n">${d.getDate()}</span>${v.f.avail&&(ok||no)?`<span class="av">${ok?'가능'+ok:''}${no?' <span style="color:var(--warn)">불가'+no+'</span>':''}</span>`:''}
          ${items.slice(0,4).map(x=>x.ev).join('')}${items.length>4?`<div class="ev more">+${items.length-4}</div>`:''}</td>`;
        if (d.getDay() === 6) h += '</tr>';
      }
      body = h + `</tbody></table></div><div class="legend"><span><i style="background:var(--clean)"></i>인원 완료</span><span><i style="background:var(--cleanl)"></i>모집 중</span><span><i style="background:var(--prt)"></i>도급</span><span><i style="background:var(--res)"></i>부동산 직원</span><span><i style="background:var(--notice)"></i>공지</span><span><i style="background:#E5E7EB"></i>내 일정</span><span>끝난 현장: 홍보✓ / 2/5 / 사진 없음</span></div>`;
    } else {
      const days = {}; for (let d = new Date(v.anchor); d.getMonth() === v.anchor.getMonth(); d = addDays(d,1)) { const s = ymd(d); const its = dayItems(s); if (its.length) days[s] = its; }
      body = Object.keys(days).map(s => `<div class="ptitle" style="${s===today?'color:var(--info)':''}">${md(s)}${s===today?' · 오늘':''}</div>` + dayCards(s)).join('') || '<p class="empty">이 달 일정이 없어요</p>';
    }
    const side = `<div class="tabsr" role="tablist">
        <button role="tab" data-a="schedSide" data-s="day" aria-selected="${v.side==='day'}">${md(v.sel)}</button>
        <button role="tab" data-a="schedSide" data-s="rep" aria-selected="${v.side==='rep'}">보고함${newRep?`<span class="cnt">${newRep}</span>`:''}</button>
        <button role="tab" data-a="schedSide" data-s="ntc" aria-selected="${v.side==='ntc'}">공지</button></div>
      ${v.side==='day' ? daySide(v.sel) : v.side==='rep' ? repView() : ntcView()}`;
    return `<div class="gside"><section class="box">${head}${body}</section><section class="box dayside" id="dayside">${side}</section></div>`;
  },
  after(){ if (st().side === 'rep') loadRepPhotos(); }
});

function jobEv(j){
  const ap = (j.assignments||[]).filter(a=>a.status==='approved').length;
  const today = ymd(H.today());
  let cls = j.status==='quote' ? 'quote' : H.isPartner(j) ? 'prt' : (j.status==='open' && ap < j.headcount) ? 'open' : '';
  if (j.status === 'cancelled') cls += ' cancelled'; if (j.status === 'done') cls += ' done';
  let em = '';
  if (j.job_date <= today && j.status !== 'cancelled' && j.status !== 'quote') {
    const p = H.promoState(j);
    em = p.photo <= 0 && !H.photosOf(j.id).length ? '<em>사진 없음</em>' : p.done ? '<em>홍보✓</em>' : `<em>${p.cnt}/${p.total}</em>`;
  } else if (j.status === 'open' && ap < j.headcount) em = `<em>${ap}/${j.headcount}</em>`;
  const pre = j.status==='quote' ? '견적 ' : (ap >= j.headcount && j.status !== 'done' ? '완 ' : '');
  return `<div class="ev ${cls}" title="${esc(j.title)}">${em}${pre}${j.start_time?j.start_time.slice(0,5)+' ':''}${j.series_id?'🔁':''}${esc(j.title)}</div>`;
}
function dayItems(s){
  const S = H.S, f = st().f, out = [];
  if (f.clean) (S.jobs||[]).filter(j=>j.job_date===s).forEach(j=>out.push({t:j.start_time||'', ev:jobEv(j)}));
  (S.events||[]).filter(e=>e.ev_date===s).forEach(e=>{
    if (e.staff_id && f.res && e.show_boss) out.push({t:e.ev_time||'', ev:`<div class="ev res">${e.ev_time?e.ev_time.slice(0,5)+' ':''}${esc(H.P(e.staff_id).name)} ${esc(e.kind)}${e.maemul_id?' '+esc(e.maemul_id):''}</div>`});
    if (!e.staff_id && f.me) out.push({t:e.ev_time||'', ev:`<div class="ev me">${e.ev_time?e.ev_time.slice(0,5)+' ':''}${esc(e.title)}</div>`});
  });
  if (f.ntc) (S.notices||[]).filter(n=>ymd(new Date(n.created_at))===s).forEach(n=>out.push({t:'00', ev:`<div class="ev ntc">📢 ${esc(n.title||n.body.slice(0,14))}</div>`}));
  return out.sort((a,b)=>a.t.localeCompare(b.t));
}

/* ---------- 하루 패널 ---------- */
function daySide(s){
  const S = H.S;
  const jobs = (S.jobs||[]).filter(j=>j.job_date===s);
  const evs = (S.events||[]).filter(e=>e.ev_date===s && (!e.staff_id || e.show_boss));
  const av = (S.avail||[]).filter(a=>a.day===s);
  const ok = av.filter(a=>a.kind==='ok').map(a=>H.P(a.staff_id).name), no = av.filter(a=>a.kind==='no').map(a=>H.P(a.staff_id).name);
  return `<div class="acts" style="margin:0 0 10px"><button class="btn sm" data-a="jobNew" data-d="${s}">+ 클린 현장</button><button class="btn sm ghost" data-a="evNew" data-d="${s}">+ 내 일정</button><button class="btn sm ghost" data-a="schedSide" data-s="ntc">+ 공지</button></div>
    ${ok.length?`<div class="avl">이날 가능: ${ok.map(esc).join(' · ')}</div>`:''}${no.length?`<div class="avl no">이날 불가: ${no.map(esc).join(' · ')}</div>`:''}
    ${jobs.map(jobCard).join('')}
    ${evs.map(evCard).join('')}
    ${!jobs.length && !evs.length ? '<p class="empty">이날 일정이 없어요</p>' : ''}`;
}
function dayCards(s){ const S = H.S, f = st().f;
  return (f.clean ? (S.jobs||[]).filter(j=>j.job_date===s).map(jobCard).join('') : '') + (S.events||[]).filter(e=>e.ev_date===s && ((e.staff_id && f.res && e.show_boss) || (!e.staff_id && f.me))).map(evCard).join(''); }

H.jobCard = jobCard;
function jobCard(j){
  const S = H.S;
  const ap = (j.assignments||[]).filter(a => a.status === 'approved');
  const wait = (j.assignments||[]).filter(a => a.status === 'applied');
  const left = Math.max(0, j.headcount - ap.length);
  const pill = j.status==='cancelled' ? '<span class="pill p-mute">취소</span>' : j.status==='quote' ? '<span class="pill p-info">견적 중</span>'
    : j.status==='done' ? '<span class="pill p-mute">마감 완료</span>'
    : left===0 ? '<span class="pill p-ok">인원 완료</span>' : `<span class="pill p-warn">${left}자리 남음</span>`;
  const seen = a => a.seen_at && new Date(a.seen_at) >= new Date(j.changed_at);
  const active = j.status!=='done' && j.status!=='cancelled';
  const people = ap.map(a => `<span class="who ok ${seen(a)?'':'unseen'}" title="${seen(a)?'확인함 '+H.ago(a.seen_at):'아직 안 봤어요'}">${seen(a)?'✓':'!'} ${esc(H.P(a.staff_id).name)}${active?`<button class="x" data-a="unassign" data-j="${j.id}" data-s="${a.staff_id}" aria-label="배정 빼기">✕</button>`:''}</span>`).join('')
    + wait.map(a => `<span class="who wait">${esc(H.P(a.staff_id).name)} 신청<button data-a="approve" data-j="${j.id}" data-s="${a.staff_id}">승인</button><button class="no" data-a="reject" data-j="${j.id}" data-s="${a.staff_id}">거절</button></span>`).join('')
    + (active && j.status!=='quote' ? `<button class="btn ghost sm" data-a="assign" data-j="${j.id}">+ 직접 배정</button>` : '');
  const tc = H.isPartner(j) ? 'var(--prt)' : j.status==='open' && left ? 'var(--cleanl)' : 'var(--clean)';
  const phs = H.photosOf(j.id).length;
  const live = j.live_code ? `<span class="who" style="background:#EEF2FF;color:var(--navy);border-color:transparent" data-a="liveSheet" data-j="${j.id}" role="button">🔗 손님 링크${j.live_views?' · '+j.live_views+'번 봄':''}</span>` : '';
  const money = (j.total_amount||j.balance_amount) ? `<span>계약 ${won(j.total_amount)} · 잔금 ${won(j.balance_amount)}${H.extrasSum(j)?' · 추가 '+won(H.extrasSum(j)):''}${j.collector_id?` (${esc(H.P(j.collector_id).name)} ${j.collected_at?'✓ 수금':'수금 대기'})`:''}</span>` : '';
  const showPromo = j.job_date <= ymd(H.today()) && j.status !== 'cancelled' && j.status !== 'quote';
  return `<div class="card" style="--tc:${tc}">
    <div class="t"><span style="font-variant-numeric:tabular-nums">${j.start_time?j.start_time.slice(0,5):'시간 미정'}</span>${j.series_id?'<span title="정기 반복">🔁 </span>':''}${esc(j.title)} ${(j.teams||[]).map(c=>`<span class="tag" style="background:${H.T(c).color}">${c}</span>`).join('')}${j.contract_mode?`<span class="tag" style="background:var(--prt)">도급 ${j.contract_mode}</span>`:''}${pill}</div>
    <div class="m"><span>${j.headcount}명</span>${j.kind?`<span>${esc(j.kind)}</span>`:''}${j.order_channel?`<span>오더: ${esc(j.order_channel)}</span>`:''}${j.address?`<span>🔒 ${esc(j.address)}</span>`:''}${money}</div>
    ${j.admin_memo?`<div class="m">메모: ${esc(j.admin_memo)}</div>`:''}
    <div class="people">${people}${live}${phs?`<span class="who" data-a="photosSheet" data-j="${j.id}" role="button">📷 사진 ${phs}장</span>`:''}</div>
    <div class="acts"><button class="btn ghost sm" data-a="jobEdit" data-j="${j.id}">수정</button>
      ${j.status==='quote'?`<button class="btn sm" data-a="quoteConfirm" data-j="${j.id}">확정</button>`:''}
      ${active && j.status!=='quote'?`<button class="btn ghost sm" data-a="payClose" data-j="${j.id}">당일 마감 · 지급액</button>`:''}${j.status==='done'?`<button class="btn ghost sm" data-a="payClose" data-j="${j.id}">지급액 수정</button>`:''}
      <button class="btn ghost sm" data-a="moneySheet" data-j="${j.id}">금액 · 증빙</button>
      ${j.status!=='quote'?`<button class="btn ghost sm" data-a="liveSheet" data-j="${j.id}">${j.live_code?'손님 링크':'손님 링크 발급'}</button>`:''}
      <button class="btn ghost sm" data-a="jobCopy" data-j="${j.id}">카톡 문구</button></div>
    ${showPromo ? H.promoRow(j) : ''}
  </div>`;
}
function evCard(e){
  const who = e.staff_id ? H.P(e.staff_id) : null;
  const biz = {res:'부동산', clean:'클린', ago:'아고', common:'공통', me:'개인'}[e.biz] || e.biz;
  return `<div class="card" style="--tc:${who?'var(--res)':'#9CA3AF'}">
    <div class="t"><span>${e.ev_time?e.ev_time.slice(0,5):'종일'}</span>${who?`<b>${esc(who.name)}</b>`:'<span class="tag" style="background:#6B7280">내 일정</span>'} ${esc(e.kind)} ${e.maemul_id?`<span class="tag" style="background:var(--res)">${esc(e.maemul_id)}</span>`:''}${!who?`<span class="tag" style="background:#9CA3AF">${esc(biz)}</span>`:''}</div>
    <div class="m">${esc(e.title)}${!who&&e.memo?' · '+esc(e.memo):''}</div>
    ${!who?`<div class="acts"><button class="btn ghost sm" data-a="evEdit" data-id="${e.id}">수정</button></div>`:''}</div>`;
}

/* ---------- 보고함 · 공지 ---------- */
function repView(){
  const S = H.S;
  return (S.reports||[]).map(r => { const s = H.P(r.staff_id);
    return `<div class="rep ${r.checked_at?'':'new'}"><div class="t"><b>${esc(s.name)}</b><span class="tag" style="background:${H.T(s.team).color}">${s.team||''}</span><small>${H.ago(r.created_at)}</small></div>
      <p>${esc(r.body)}</p>${r.photos.length?`<div class="pics" data-pics="${r.id}">${r.photos.map(()=>'<a><img alt=""></a>').join('')}</div>`:''}
      ${r.checked_at?'':`<div class="acts"><button class="btn ghost sm" data-a="repChk" data-id="${r.id}">확인</button></div>`}</div>`; }).join('') || '<p class="empty">들어온 보고가 없어요</p>';
}
async function loadRepPhotos(){
  const all = (H.S.reports||[]).flatMap(r => r.photos); if (!all.length) return;
  const {data, error} = await sb.storage.from('reports').createSignedUrls(all, 3600); if (error) return;
  const map = Object.fromEntries(data.map(d => [d.path, d.signedUrl]));
  (H.S.reports||[]).forEach(r => { const box = document.querySelector(`[data-pics="${r.id}"]`); if (!box) return;
    box.querySelectorAll('a').forEach((a,i) => { const u = map[r.photos[i]]; if (u){ a.href = u; a.target = '_blank'; a.querySelector('img').src = u; } }); });
}
const SCOPE = [['','전체'],['OPS','클린 (직영·지원·도급)'],['RES','부동산']];
function ntcView(){
  const S = H.S; const active = S.staff.filter(s => s.status !== 'left');
  const target = n => active.filter(s => !n.team || s.team === n.team || (n.team==='OPS' && ['SPT','PRT'].includes(s.team)));
  return `<form data-f="ntc" style="display:flex;flex-direction:column;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--line)"><input class="in" name="title" placeholder="제목 (선택)"><textarea class="in" name="body" rows="3" placeholder="직원들에게 알릴 내용" required></textarea>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><div class="chips">${SCOPE.map(([v,l],i)=>`<label><input type="radio" name="team" value="${v}" ${i===0?'checked':''}><span>${l}</span></label>`).join('')}</div>
    <label style="font-size:12.5px;display:flex;gap:4px;align-items:center"><input type="checkbox" name="important">확인 버튼</label><button class="btn sm" style="margin-left:auto" type="submit">올리기</button></div>
    <span class="note">올린 뒤 카톡으로 "새 공지가 있어요"만 보내면 돼요. 누가 읽었는지 여기서 보여요.</span></form>`
  + (S.notices||[]).map(n => { const tg = target(n);
      const read = n.notice_reads.filter(r => tg.some(s => s.id === r.staff_id));
      const unread = tg.filter(s => !read.some(r => r.staff_id === s.id));
      const conf = n.notice_reads.filter(r => r.confirmed_at).length;
      return `<div class="rep"><div class="t"><span class="tag" style="background:var(--notice)">${n.team==='OPS'?'클린':n.team==='RES'?'부동산':n.team?esc(H.T(n.team).name):'전체'}</span>${n.title?`<b>${esc(n.title)}</b>`:''}<small>${H.ago(n.created_at)}</small></div><p>${esc(n.body)}</p>
        <div class="people"><span class="pill p-ok">읽음 ${read.length}/${tg.length}</span>${n.important?`<span class="pill p-info">확인 ${conf}</span>`:''}${unread.length?`<span class="pill p-warn">안 읽음: ${esc(unread.map(s=>s.name).join(', '))}</span>`:''}
        <button class="btn ghost sm" data-a="ntcDel" data-id="${n.id}">삭제</button></div></div>`; }).join('');
}

/* ---------- 동작 ---------- */
H.CHANGE.schedF = el => { st().f[el.value] = el.checked; H.render(); };
H.ACT.schedMode = el => { st().mode = el.dataset.m; H.render(); };
H.ACT.schedNav = async el => { const n = +el.dataset.n; const v = st();
  v.anchor = n === 0 ? new Date(H.today().getFullYear(), H.today().getMonth(), 1) : new Date(v.anchor.getFullYear(), v.anchor.getMonth()+n, 1);
  if (n === 0) v.sel = ymd(H.today()); else v.sel = ymd(v.anchor);
  H._dirty = Date.now(); H.render(); };
H.ACT.schedPick = el => { st().sel = el.dataset.d; st().side = 'day'; H.render(); if (window.innerWidth < 1100) setTimeout(()=>document.getElementById('dayside').scrollIntoView({behavior:'smooth'}), 50); };
H.ACT.schedSide = el => { st().side = el.dataset.s; H.render(); };
H.ACT.addMenu = () => H.open(`<h3>무엇을 올릴까요?</h3><div style="display:flex;flex-direction:column;gap:8px">
  <button class="btn" data-a="jobNew" data-d="${st().sel}">클린 현장 (일정)</button>
  <button class="btn ghost" data-a="quoteNew">오더 접수 (견적 중)</button>
  <button class="btn ghost" data-a="evNew" data-d="${st().sel}">내 일정 (사업 꼬리표)</button>
  <button class="btn ghost" data-a="ntcGo">공지</button></div>`);
H.ACT.ntcGo = () => { H.close(); st().side = 'ntc'; if (H.cur() !== 'sched') H.go('sched'); else H.render(); };
H.ACT.repChk = async el => { await H.q(sb.from('reports').update({checked_at:new Date().toISOString()}).eq('id', +el.dataset.id)); H.refresh(); };
H.ACT.ntcDel = async el => { if (!confirm('공지를 지울까요?')) return; await H.q(sb.from('notices').delete().eq('id', +el.dataset.id)); H.refresh(); };
H.FORM.ntc = async v => {
  await H.q(sb.from('notices').insert({title:H.nn(v.get('title')), body:v.get('body'), team:H.nn(v.get('team')), important:v.get('important')==='on'}));
  H.copy(`[${H.C.BRAND}] 새 공지가 있어요. 일정판 [공지]에서 확인해주세요.`, '공지 올림 · 카톡 알림 문구 복사됐어요'); H.refresh();
};

const J = id => (H.S.jobs||[]).find(j => j.id == id);
H.J = J;
H.ACT.approve = async el => { const j = J(el.dataset.j), sid = el.dataset.s;
  await H.q(sb.from('assignments').update({status:'approved', decided_at:new Date().toISOString()}).match({job_id:j.id, staff_id:sid}));
  const n = j.assignments.filter(a=>a.status==='approved').length + 1;
  if (n >= j.headcount) await H.q(sb.from('jobs').update({status:'full'}).eq('id', j.id));
  H.toast(`${H.P(sid).name}님 확정 · 카톡으로 알려주세요`); H.refresh(); };
H.ACT.reject = async el => { await H.q(sb.from('assignments').update({status:'rejected', decided_at:new Date().toISOString()}).match({job_id:+el.dataset.j, staff_id:el.dataset.s})); H.toast('거절했어요'); H.refresh(); };
H.ACT.unassign = async el => { const sid = el.dataset.s; if (!confirm(`${H.P(sid).name}님을 이 일정에서 뺄까요?`)) return;
  await H.q(sb.from('assignments').update({status:'cancelled', decided_at:new Date().toISOString()}).match({job_id:+el.dataset.j, staff_id:sid}));
  await sb.from('jobs').update({status:'open'}).eq('id', +el.dataset.j).eq('status','full'); H.refresh(); };

/* 현장 올리기 · 수정 */

/* ---------- 정기 반복 ---------- */
const REP_END = [['1m','1개월',1],['3m','3개월',3],['6m','6개월',6],['1y','1년',12],['date','날짜 지정',0]];
const isReg = k => /정기/.test(k||'');
function repHtml(j){
  const on = isReg(j.kind), dw = parse(j.job_date).getDay();
  return `<div class="rep ${on?'':'off'}" id="rep">
    <h4>🔁 정기 일정으로 반복할까요?</h4>
    <div class="rseg">${[['once','한 번만'],['week','매주 같은 요일'],['month','매월 같은 날짜']].map(([v,l])=>`<label><input type="radio" name="rep" value="${v}" ${(on?'week':'once')===v?'checked':''} data-c="repPrev"><span>${l}</span></label>`).join('')}</div>
    <div class="rw-week"><div class="rl">요일 (여러 개 가능)</div><div class="rdow">${DOW.map((d,i)=>`<label><input type="checkbox" name="rep_dow" value="${i}" ${i===dw?'checked':''} data-c="repPrev"><span class="${i===0?'sun':''}">${d}</span></label>`).join('')}</div>
      <div class="rl">간격</div><div class="rpill">${[['1','매주'],['2','2주마다']].map(([v,l],k)=>`<label><input type="radio" name="rep_every" value="${v}" ${k?'':'checked'} data-c="repPrev"><span>${l}</span></label>`).join('')}</div></div>
    <div class="rw-month"><div class="rl">매월</div><div class="rpill" id="rep-mm"></div></div>
    <div class="rw-end"><div class="rl">언제까지</div><div class="rpill">${REP_END.map(([v,l],k)=>`<label><input type="radio" name="rep_end" value="${v}" ${v==='3m'?'checked':''} data-c="repPrev"><span>${l}</span></label>`).join('')}</div>
      <input type="date" name="rep_until" class="in" style="margin-top:6px;display:none" data-c="repPrev"></div>
    <div class="rprev" id="rep-prev"></div></div>`;
}
function repScopeHtml(j){
  if (!j.series_id) return '';
  return `<div class="rep" style="grid-column:1/-1"><h4>🔁 정기 일정이에요 <span class="note" style="font-weight:400">${esc(repRuleTxt(j.series_rule))}</span></h4>
    <div class="rseg two">${[['one','이 날만 바꾸기'],['after',`${md(j.job_date)} 이후 전부 바꾸기`]].map(([v,l],k)=>`<label><input type="radio" name="scope" value="${v}" ${k?'':'checked'}><span>${l}</span></label>`).join('')}</div>
    <div class="note">'이후 전부'는 시간·이름·인원·메모·금액만 같이 바뀌어요 (날짜·상태·배정은 그대로)</div>
    <button type="button" class="btn sm ghost" data-a="repExtend" data-j="${j.id}" style="justify-self:start">＋ 3개월 연장</button></div>`;
}
function repRuleTxt(r){ if (!r) return '';
  if (r.mode === 'week') return `${r.every==2?'2주마다':'매주'} ${(r.dows||[]).map(i=>DOW[i]).join('·')}`;
  if (r.mode === 'month') return r.mtype === 'lastdow' ? `매월 마지막 ${DOW[r.dow]}요일` : `매월 ${r.mday}일`;
  return ''; }
function repRead(f){
  const g = n => f.querySelector(`[name="${n}"]:checked`); const mode = (g('rep')||{}).value || 'once';
  const first = f.job_date.value; if (!first) return null; const d0 = parse(first);
  const endK = (g('rep_end')||{}).value || '3m'; let end;
  if (endK === 'date') { end = f.rep_until.value ? parse(f.rep_until.value) : null; }
  else { const m = REP_END.find(x=>x[0]===endK)[2]; end = new Date(d0); end.setMonth(end.getMonth()+m); end.setDate(end.getDate()-1); }
  const rule = {mode};
  if (mode === 'week') { rule.dows = [...f.querySelectorAll('[name="rep_dow"]:checked')].map(x=>+x.value); rule.every = +((g('rep_every')||{}).value||1); }
  if (mode === 'month') { const mt = (g('rep_mtype')||{}).value || 'date'; rule.mtype = mt; rule.mday = d0.getDate(); rule.dow = d0.getDay(); }
  return {mode, rule, first, end, endK};
}
// 규칙대로 날짜 만들기 (from 포함, end까지, 최대 120건)
function repDates(rule, from, end, anchor){
  const out = []; if (!end) return out; const a = parse(anchor || ymd(from));
  if (rule.mode === 'week') {
    if (!rule.dows || !rule.dows.length) return out;
    const wk0 = H.addDays(a, -a.getDay());
    for (let d = new Date(from); d <= end && out.length < 120; d = H.addDays(d, 1)) {
      if (!rule.dows.includes(d.getDay())) continue;
      const wk = Math.round((H.addDays(d, -d.getDay()) - wk0) / (7*864e5));
      if (rule.every == 2 && wk % 2) continue; out.push(ymd(d)); }
  } else if (rule.mode === 'month') {
    for (let k = 0; k < 120; k++) {
      const y = from.getFullYear(), m = from.getMonth() + k; const last = new Date(y, m + 1, 0);
      let d;
      if (rule.mtype === 'lastdow') { d = new Date(last); while (d.getDay() !== rule.dow) d.setDate(d.getDate()-1); }
      else d = new Date(y, m, Math.min(rule.mday, last.getDate()));
      if (d > end) break; if (d >= from) out.push(ymd(d)); }
  }
  return out;
}
H.CHANGE.repKind = el => { const f = el.form, r = f.querySelector('#rep'); if (!r) return;
  if (isReg(el.value)) { r.classList.remove('off'); const w = f.querySelector('[name="rep"][value="week"]'), o = f.querySelector('[name="rep"]:checked'); if (w && (!o || o.value === 'once')) w.checked = true; }
  H.CHANGE.repPrev(el); };
H.CHANGE.repPrev = el => { const f = el.form, r = f.querySelector('#rep'); if (!r) return;
  const x = repRead(f); if (!x) return; const d0 = parse(x.first);
  r.dataset.mode = x.mode; if (x.mode !== 'once') r.classList.remove('off');
  f.rep_until.style.display = x.endK === 'date' ? '' : 'none';
  const mm = r.querySelector('#rep-mm'), cur = (f.querySelector('[name="rep_mtype"]:checked')||{}).value || 'date';
  mm.innerHTML = [['date',`매월 ${d0.getDate()}일`],['lastdow',`매월 마지막 ${DOW[d0.getDay()]}요일`]].map(([v,l])=>`<label><input type="radio" name="rep_mtype" value="${v}" ${cur===v?'checked':''} data-c="repPrev"><span>${l}</span></label>`).join('');
  const btn = f.querySelector('.sacts [type=submit]'), pv = r.querySelector('#rep-prev');
  if (x.mode === 'once') { pv.innerHTML = ''; if (btn) btn.textContent = '올리기'; return; }
  const ds = repDates(x.rule, d0, x.end, x.first);
  const odd = x.mode === 'month' && x.rule.mtype !== 'lastdow' ? ds.filter(d => +d.slice(8) !== x.rule.mday) : [];
  const t = f.start_time.value ? ' '+f.start_time.value : '';
  pv.innerHTML = ds.length ? `📅 <b>${esc(repRuleTxt(x.rule))}${t} · 총 ${ds.length}건</b><br>${ds.slice(0,6).map(d=>odd.includes(d)?`<b class="o">${md(d)}</b>`:md(d)).join(' · ')}${ds.length>6?' … '+md(ds[ds.length-1]):''}
    ${odd.length?`<br><span class="o">${x.rule.mday}일이 없는 달은 말일로 잡혀요</span>`:''}<br><span class="note">끝나기 2주 전에 HQ 홈에서 '연장할까요?' 알려드려요</span>` : '<span class="o">요일·기간을 확인해 주세요 (0건)</span>';
  if (btn) btn.textContent = ds.length ? `${ds.length}건 올리기` : '올리기';
};
const SERIES_COPY = ['boss_on','start_time','title','kind','headcount','teams','target_staff','public_note','address','private_note','order_channel','collector_id','total_amount','deposit_amount','balance_amount','admin_memo','contract_mode','live_title'];
H.ACT.repExtend = async el => { const j = J(el.dataset.j); if (!j || !j.series_id) return;
  const {data:last} = await sb.from('jobs').select('*').eq('series_id', j.series_id).order('job_date', {ascending:false}).limit(1).single();
  const from = H.addDays(parse(last.job_date), 1), end = new Date(from); end.setMonth(end.getMonth()+3);
  const ds = repDates(j.series_rule||{}, from, end, (j.series_rule||{}).anchor || last.job_date);
  if (!ds.length) return H.toast('늘릴 날짜가 없어요');
  if (!confirm(`${md(ds[0])} ~ ${md(ds[ds.length-1])} · ${ds.length}건 더 올릴까요?`)) return;
  await H.q(sb.from('jobs').insert(ds.map(d => repRow(last, d))));
  H.close(); H.toast(`${ds.length}건 연장했어요`); H.refresh(); };
function repRow(src, d){ const r = {job_date:d, status:'open', series_id:src.series_id, series_rule:src.series_rule}; SERIES_COPY.forEach(k => r[k] = src[k] ?? null);
  if (H.autoLive()) { r.live_code = H.rnd(8); r.live_close_days = +((H.setting('live')||{}).close_days) || 7; } return r; }

H.jobSheet = jobSheet;
function jobSheet(j, def){
  const S = H.S;
  j = j || Object.assign({job_date: st().sel < ymd(H.today()) ? ymd(H.today()) : st().sel, start_time:'08:00', headcount:2, teams:['OPS'], status:'open'}, def||{});
  const chans = S.settings.order_channels || [];
  const tgt = j.target_staff || [];
  const lock = I('lock').replace('class="i"','class="i" style="width:14px;height:14px"');
  H.open(`<form data-f="job"><h3>${j.id?'현장 수정':j.status==='quote'?'오더 접수':'클린 현장 올리기'}</h3><div class="fg">
    <div class="field full"><label>볼 수 있는 팀 (여러 개 가능)</label><div class="chips">${S.teams.filter(t=>t.code!=='HQS').map(t=>`<label><input type="checkbox" name="teams" value="${t.code}" ${(j.teams||[]).includes(t.code)?'checked':''}><span>${t.code} · ${esc(t.name)}</span></label>`).join('')}</div></div>
    <div class="field"><label>날짜${j.id?'':' (첫 날)'}</label><input type="date" name="job_date" value="${j.job_date}" required data-c="repPrev"></div>
    <div class="field"><label>시간</label><input type="time" name="start_time" value="${(j.start_time||'').slice(0,5)}" data-c="repPrev"></div>
    <div class="field full"><label>지역 · 현장 이름 <small>(팀 전체 공개)</small></label><input name="title" value="${esc(j.title||'')}" placeholder="예) 수영구 광안동 아파트 이사청소 24평" required></div>
    <div class="field"><label>종류</label><input name="kind" value="${esc(j.kind||'')}" list="kinds" placeholder="이사청소" data-c="repKind"><datalist id="kinds">${['이사청소','입주청소','퇴실청소','상가','사무실','정기','에어컨','철거','시설관리','폐기물','특수'].map(k=>`<option value="${k}">`).join('')}</datalist></div>
    <div class="field"><label>필요 인원</label><input type="number" name="headcount" min="1" max="50" value="${j.headcount}"></div>
    <div class="field full"><label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--ink)"><input type="checkbox" name="boss_on" ${j.boss_on?'checked':''} style="width:auto">🧹 대표님도 이 현장 가요 <small style="color:var(--sub)">(직원 화면 대표 상태가 시간 맞춰 '현장 근무중'으로)</small></label></div>
${j.id ? repScopeHtml(j) : repHtml(j)}
    <div class="field full"><label>팀 공개 메모 <small>(장비·주차 등)</small></label><input name="public_note" value="${esc(j.public_note||'')}"></div>
    <div class="sec">${lock} 확정자에게만</div>
    <div class="field full"><label>상세 주소</label><input name="address" value="${esc(j.address||'')}" placeholder="부산 수영구 광안동 ○○아파트 103동 2302호"></div>
    <div class="field full"><label>출입 비번 · 고객 요청</label><input name="private_note" value="${esc(j.private_note||'')}"></div>
    <div class="field full"><label>특정 사람에게만 보이기 <small>(도급 지정 등 · 비우면 팀 전체)</small></label><div class="chips">${S.staff.filter(s=>s.status!=='left').map(s=>`<label><input type="checkbox" name="target" value="${s.id}" ${tgt.includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('')}</div></div>
    <div class="sec">${lock} 관리 정보 (직원에게 안 보임)</div>
    <div class="field"><label>오더 채널</label><select name="order_channel"><option value="">-</option>${chans.map(c=>`<option ${j.order_channel===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label>상태</label><select name="status">${[['quote','견적 중 (오더 접수함)'],['open','모집 중'],['full','인원 완료'],['done','마감 완료'],['cancelled','취소']].map(([v,l])=>`<option value="${v}" ${j.status===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>계약 금액</label><input type="number" name="total_amount" step="1000" value="${j.total_amount??''}"></div>
    <div class="field"><label>예약금</label><input type="number" name="deposit_amount" step="1000" value="${j.deposit_amount??''}"></div>
    <div class="field"><label>현장 잔금</label><input type="number" name="balance_amount" step="1000" value="${j.balance_amount??''}"></div>
    <div class="field"><label>수금 담당</label><select name="collector_id"><option value="">없음 (회사 계좌)</option>${S.staff.filter(s=>s.can_collect&&s.status!=='left').map(s=>`<option value="${s.id}" ${j.collector_id===s.id?'selected':''}>${esc(s.name)} (${s.team})</option>`).join('')}</select></div>
    <div class="field"><label>도급 정산</label><select name="contract_mode"><option value="">도급 아님</option><option value="A" ${j.contract_mode==='A'?'selected':''}>A · 예약금만 본사</option><option value="B" ${j.contract_mode==='B'?'selected':''}>B · 전액 받고 잔금 송금</option></select></div>
    <div class="field"><label>손님 링크 제목</label><input name="live_title" value="${esc(j.live_title||'')}" placeholder="비우면 현장 이름 (손님 이름 넣지 않기)"></div>
    <div class="field full"><label>대표 메모</label><input name="admin_memo" value="${esc(j.admin_memo||'')}"></div>
  </div>${H.sacts(j.id?'저장':'올리기', j.id?`<button type="button" class="btn danger" data-a="jobDel" data-j="${j.id}" style="flex:0 0 auto">삭제</button>`:'')}
  <input type="hidden" name="id" value="${j.id||''}"></form>`);
  const rf = document.querySelector('#sheet form [name="rep"]'); if (rf) H.CHANGE.repPrev(rf);
}
H.ACT.jobNew = el => { H.close(); setTimeout(()=>jobSheet(null, {job_date: el.dataset.d || st().sel}), 10); };
H.ACT.quoteNew = () => { H.close(); setTimeout(()=>jobSheet(null, {status:'quote', headcount:2}), 10); };
H.ACT.jobEdit = el => jobSheet(J(el.dataset.j));
H.ACT.jobDel = async el => { const j = J(el.dataset.j);
  if (j && j.series_id) {
    const {data:after} = await sb.from('jobs').select('id,job_date').eq('series_id', j.series_id).gte('job_date', j.job_date).order('job_date');
    const {count:past} = await sb.from('jobs').select('id', {count:'exact', head:true}).eq('series_id', j.series_id).lt('job_date', j.job_date);
    const list = after || [];
    return H.open(`<h3>일정 지우기</h3><p class="note" style="margin:-4px 0 12px">${esc(j.title)} <span class="tag" style="background:#6366F1">🔁 ${esc(repRuleTxt(j.series_rule))}</span><br>지금 고른 날: <b>${md(j.job_date)}</b></p>
      <div style="display:grid;gap:8px">
        <button class="ropt" data-a="repDel" data-j="${j.id}" data-scope="one"><b>이 날만 지우기</b><small>${md(j.job_date)} 하나만 빠지고 나머지 정기 일정은 그대로</small></button>
        <button class="ropt bad" data-a="repDel" data-j="${j.id}" data-scope="after"><b>🗑 ${md(j.job_date)}부터 이후 전부 지우기 · ${list.length}건</b><small>${list.slice(0,4).map(x=>md(x.job_date)).join(' · ')}${list.length>4?' … '+md(list[list.length-1].job_date):''}${past?`<br>지난 일정 ${past}건과 정산 기록은 그대로 남아요`:''}</small></button>
      </div><div class="sacts"><button type="button" class="btn ghost" data-a="close">취소</button></div>`);
  }
  if (!confirm('이 현장을 완전히 지울까요? (취소 표시만 하려면 상태를 [취소]로 저장하세요)')) return;
  await H.q(sb.from('jobs').delete().eq('id', +el.dataset.j)); H.close(); H.toast('지웠어요'); H.refresh(); };
H.ACT.repDel = async el => { const j = J(el.dataset.j);
  if (el.dataset.scope === 'one') await H.q(sb.from('jobs').delete().eq('id', j.id));
  else await H.q(sb.from('jobs').delete().eq('series_id', j.series_id).gte('job_date', j.job_date));
  H.close(); H.toast(el.dataset.scope === 'one' ? '이 날만 지웠어요' : `${md(j.job_date)} 이후 정기 일정을 지웠어요`); H.refresh(); };
H.autoLive = () => { const c = H.setting('live'); return !c || c.auto_issue !== false; };
H.FORM.job = async v => {
  const tms = v.getAll('teams'); if (!tms.length) return H.toast('팀을 하나 이상 골라주세요');
  const row = { job_date:v.get('job_date'), start_time:H.nn(v.get('start_time')), title:v.get('title').trim(), kind:H.nn(v.get('kind')), headcount:+v.get('headcount')||1, teams:tms,
    target_staff: v.getAll('target').length ? v.getAll('target') : null, public_note:H.nn(v.get('public_note')), address:H.nn(v.get('address')), private_note:H.nn(v.get('private_note')),
    order_channel:H.nn(v.get('order_channel')), collector_id:H.nn(v.get('collector_id')), total_amount:H.nnum(v.get('total_amount')), deposit_amount:H.nnum(v.get('deposit_amount')),
    balance_amount:H.nnum(v.get('balance_amount')), status:v.get('status'), admin_memo:H.nn(v.get('admin_memo')), contract_mode:H.nn(v.get('contract_mode')), live_title:H.nn(v.get('live_title')) };
  if (!H.S.needV4) row.boss_on = v.get('boss_on') === 'on';
  const id = v.get('id'); const old = id ? J(id) : null;
  if (['open','full'].includes(row.status) && H.autoLive() && !(old && old.live_code)) { row.live_code = H.rnd(8); row.live_close_days = +((H.setting('live')||{}).close_days) || 7; }
  const f = document.querySelector('#sheet form');
  const rx = !id && f ? repRead(f) : null;
  if (rx && rx.mode !== 'once') {
    const ds = repDates(rx.rule, parse(rx.first), rx.end, rx.first); if (!ds.length) return H.toast('반복 날짜가 0건이에요 · 요일·기간 확인');
    const sid = H.rnd(10), rule = Object.assign({anchor: rx.first}, rx.rule);
    const rows = ds.map(d => { const x = Object.assign({}, row, {job_date:d, series_id:sid, series_rule:rule});
      if (x.live_code) x.live_code = H.rnd(8); return x; });
    const ins = await sb.from('jobs').insert(rows).select();
    if (ins.error) { if (/series/.test(ins.error.message||'')) return H.toast('HQ 업데이트(v3)를 먼저 실행해 주세요 · 홈 맨 위'); throw ins.error; }
    H.close(); H.copy(`[${H.C.BRAND}] 정기 일정이 올라왔어요\n${row.title} · ${repRuleTxt(rule)} ${row.start_time?row.start_time.slice(0,5):''}\n${md(ds[0])}부터 ${ds.length}회 · 일정판에서 신청해주세요`, `${ds.length}건 올렸어요 · 카톡 알림 문구 복사됨`);
    return H.refresh();
  }
  if (id && old && old.series_id && v.get('scope') === 'after') {
    const common = {}; SERIES_COPY.forEach(k => { if (k in row) common[k] = row[k]; });
    const u = await sb.from('jobs').update(common).eq('series_id', old.series_id).gte('job_date', old.job_date);
    if (u.error) throw u.error;
  }
  const r = id ? await sb.from('jobs').update(row).eq('id', +id).select().single() : await sb.from('jobs').insert(row).select().single();
  if (r.error) throw r.error; H.close();
  if (!id && row.status !== 'quote') H.copy(jobMsg(r.data), '올렸어요 · 카톡 알림 문구가 복사됐어요'); else H.toast('저장했어요');
  H.refresh();
};
H.ACT.quoteConfirm = async el => { const j = J(el.dataset.j);
  const up = {status:'open'}; if (H.autoLive() && !j.live_code) { up.live_code = H.rnd(8); up.live_close_days = +((H.setting('live')||{}).close_days) || 7; }
  await H.q(sb.from('jobs').update(up).eq('id', j.id)); H.copy(jobMsg(Object.assign({}, j, up)), '확정 · 모집 시작 · 카톡 알림 문구 복사됐어요'); H.refresh(); };
function jobMsg(j){ const d = parse(j.job_date); return `[${H.C.BRAND}] 새 일정이 올라왔어요\n${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]}) ${j.start_time?j.start_time.slice(0,5):''} ${j.title}\n필요 ${j.headcount}명 · 일정판에서 신청해주세요`; }
H.ACT.jobCopy = el => H.copy(jobMsg(J(el.dataset.j)), '카톡 알림 문구 복사했어요');

/* 직접 배정 */
H.ACT.assign = el => { const j = J(el.dataset.j), S = H.S;
  const ok = new Set((S.avail||[]).filter(a=>a.day===j.job_date && a.kind==='ok').map(a=>a.staff_id));
  const no = new Set((S.avail||[]).filter(a=>a.day===j.job_date && a.kind==='no').map(a=>a.staff_id));
  const tag = s => ok.has(s.id) ? ' ✓가능' : no.has(s.id) ? ' ✕불가' : '';
  const cand = S.staff.filter(s => s.status !== 'left' && j.teams.includes(s.team) && !j.assignments.some(a => a.staff_id === s.id && a.status === 'approved')).sort((a,b)=>(ok.has(b.id)-ok.has(a.id))||(no.has(a.id)-no.has(b.id)));
  const others = S.staff.filter(s => s.status !== 'left' && !j.teams.includes(s.team) && s.team !== 'RES');
  H.open(`<form data-f="assign"><h3>직접 배정</h3><p class="note" style="margin:-6px 0 10px">${esc(j.title)} · ${md(j.job_date)} · '가능'으로 표시한 사람이 앞에 와요</p>
    <div class="chips">${cand.map(s=>`<label><input type="checkbox" name="s" value="${s.id}"><span>${esc(s.name)}${s.status==='leave'?` (${H.STL(s).leave})`:''}${tag(s)}</span></label>`).join('') || '<span class="note">팀 직원이 없어요</span>'}</div>
    ${others.length?`<p class="note" style="margin:12px 0 6px">다른 팀에서 지원</p><div class="chips">${others.map(s=>`<label><input type="checkbox" name="s" value="${s.id}"><span>${s.team} ${esc(s.name)}${tag(s)}</span></label>`).join('')}</div>`:''}
    ${H.sacts('배정')}<input type="hidden" name="id" value="${j.id}"></form>`); };
H.FORM.assign = async v => { const id = +v.get('id'); const ids = v.getAll('s'); if (!ids.length) return H.close();
  const now = new Date().toISOString();
  await H.q(sb.from('assignments').upsert(ids.map(s=>({job_id:id, staff_id:s, status:'approved', decided_at:now})), {onConflict:'job_id,staff_id'}));
  const j = J(id); const n = new Set([...j.assignments.filter(a=>a.status==='approved').map(a=>a.staff_id), ...ids]).size;
  if (n >= j.headcount) await H.q(sb.from('jobs').update({status:'full'}).eq('id', id));
  H.close(); H.toast('배정했어요 · 카톡으로 알려주세요'); H.refresh(); };

/* 당일 마감 · 지급액 */
H.ACT.payClose = el => { const j = J(el.dataset.j);
  const ap = j.assignments.filter(a => a.status === 'approved');
  const presets = H.S.settings.pay_presets || [];
  H.open(`<form data-f="pay"><h3>당일 마감 · 지급액</h3><p class="note" style="margin:-6px 0 10px">${esc(j.title)} · ${md(j.job_date)}<br>직원은 마감 후에 자기 금액만 봐요. 공제(3.3% 등)는 직원별 지급 방식대로 정산에서 계산돼요.</p>
    ${ap.map(a => `<div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(H.P(a.staff_id).name)}</b>
      <div style="display:flex;gap:4px"><select class="in" data-c="preset" data-s="${a.staff_id}"><option value="">금액</option>${presets.map(p=>`<option value="${p}" ${a.pay_amount===p?'selected':''}>${won(p)}</option>`).join('')}</select>
        <input class="in num" type="number" step="1000" name="pay_${a.staff_id}" value="${a.pay_amount??''}" placeholder="기본"></div>
      <input class="in num" type="number" step="1000" name="extra_${a.staff_id}" value="${a.extra_amount??''}" placeholder="추가수당"></div>
      <input class="in" style="margin:4px 0 6px" name="memo_${a.staff_id}" value="${esc(a.pay_memo||'')}" placeholder="${esc(H.P(a.staff_id).name)} 메모 (추가작업 내용 등)">`).join('') || '<p class="empty">확정된 사람이 없어요</p>'}
    ${H.sacts('마감 저장')}<input type="hidden" name="id" value="${j.id}"></form>`); };
H.CHANGE.preset = el => { const inp = document.querySelector(`[name="pay_${el.dataset.s}"]`); if (el.value) inp.value = el.value; };
H.FORM.pay = async v => { const id = +v.get('id'); const j = J(id);
  for (const a of j.assignments.filter(a=>a.status==='approved'))
    await H.q(sb.from('assignments').update({pay_amount:H.nnum(v.get('pay_'+a.staff_id)), extra_amount:H.nnum(v.get('extra_'+a.staff_id)), pay_memo:H.nn(v.get('memo_'+a.staff_id))}).match({job_id:id, staff_id:a.staff_id}));
  await H.q(sb.from('jobs').update({status:'done'}).eq('id', id));
  H.close(); H.toast('마감 저장 · 직원들이 자기 금액을 볼 수 있어요'); H.refresh(); };

/* 내 일정 (대표) */
const BIZ = [['clean','클린'],['res','부동산'],['ago','아고'],['common','공통'],['me','개인']];
function evSheet(e){
  e = e || {ev_date: st().sel, kind:'기타', biz:'common'};
  H.open(`<form data-f="ev"><h3>${e.id?'내 일정 수정':'내 일정 올리기'}</h3><div class="fg">
    <div class="field full"><label>사업 꼬리표</label><div class="chips">${BIZ.map(([k,l])=>`<label><input type="radio" name="biz" value="${k}" ${e.biz===k?'checked':''}><span>${l}</span></label>`).join('')}</div></div>
    <div class="field"><label>날짜</label><input type="date" name="ev_date" value="${e.ev_date}" required></div>
    <div class="field"><label>시간</label><input type="time" name="ev_time" value="${(e.ev_time||'').slice(0,5)}"></div>
    <div class="field"><label>종류</label><select name="kind">${['기타','회의','계약','잔금','안내','견적','임장','개인'].map(k=>`<option ${e.kind===k?'selected':''}>${k}</option>`).join('')}</select></div>
    <div class="field"><label>매물번호 (선택)</label><input name="maemul_id" value="${esc(e.maemul_id||'')}" placeholder="권-0001"></div>
    <div class="field full"><label>제목</label><input name="title" value="${esc(e.title||'')}" required></div>
    <div class="field full"><label>메모 (나만 보기)</label><input name="memo" value="${esc(e.memo||'')}"></div>
  </div>${H.sacts('저장', e.id?`<button type="button" class="btn danger" data-a="evDel" data-id="${e.id}" style="flex:0 0 auto">삭제</button>`:'')}<input type="hidden" name="id" value="${e.id||''}"></form>`);
}
H.ACT.evNew = el => { H.close(); setTimeout(()=>evSheet({ev_date: el.dataset.d || st().sel, kind:'기타', biz:'common'}), 10); };
H.ACT.evEdit = el => evSheet((H.S.events||[]).find(e=>e.id==el.dataset.id));
H.ACT.evDel = async el => { if (!confirm('이 일정을 지울까요?')) return; await H.q(sb.from('events').delete().eq('id', +el.dataset.id)); H.close(); H.refresh(); };
H.FORM.ev = async v => { const row = {ev_date:v.get('ev_date'), ev_time:H.nn(v.get('ev_time')), kind:v.get('kind'), biz:v.get('biz')||'common', maemul_id:H.nn(v.get('maemul_id')), title:v.get('title').trim(), memo:H.nn(v.get('memo')), staff_id:null, show_boss:true};
  const id = v.get('id'); await H.q(id ? sb.from('events').update(row).eq('id', +id) : sb.from('events').insert(row)); H.close(); H.toast('저장했어요'); H.refresh(); };

/* ---------- 손님 링크 ---------- */
H.liveMsg = j => `[리츠종합클린] 안녕하세요, 고객님 😊\n오늘 ${j.live_title||j.title} 진행합니다.\n\n작업 사진이 실시간으로 올라가는 페이지예요. 언제든 들어와 보세요!\n👉 ${H.liveUrl(j.live_code)}\n\n작업이 끝나면 전후 사진 리포트로 바뀌어요.`;
H.ACT.liveSheet = async el => {
  let j = J(el.dataset.j);
  if (!j.live_code) { const code = H.rnd(8), days = +((H.setting('live')||{}).close_days) || 7; await H.q(sb.from('jobs').update({live_code: code, live_close_days: days}).eq('id', j.id)); j.live_code = code; j.live_close_days = days; H._dirty = Date.now(); H.toast('손님 링크를 발급했어요'); }
  const cfg = H.setting('live') || {};
  const done = j.work_done_at || j.done_at; const close = done ? addDays(new Date(done), j.live_close_days) : null;
  const state = j.live_closed || (close && close < new Date()) ? '<span class="pill p-mute">닫힘</span>' : done ? '<span class="pill p-ok">완료 리포트</span>' : '<span class="pill p-ok">열림 · 작업 중</span>';
  H.open(`<h3>🔗 손님 링크 · ${esc(j.title)}</h3>
    <div class="lnk">${esc(H.liveUrl(j.live_code))}</div>
    <div class="acts" style="margin:10px 0 12px"><button class="btn sm" data-a="liveCopy" data-j="${j.id}">링크 복사</button><button class="btn sm" data-a="liveMsgCopy" data-j="${j.id}">카톡 문구 복사</button><a class="btn sm ghost" href="${H.liveUrl(j.live_code)}" target="_blank" rel="noopener">미리보기</a><button class="btn sm ghost" data-a="liveQR" data-j="${j.id}">QR 보기</button><button class="btn sm ghost" data-a="liveNew" data-j="${j.id}">새로 발급</button><button class="btn sm danger" data-a="liveClose" data-j="${j.id}">${j.live_closed?'다시 열기':'지금 닫기'}</button></div>
    <div class="opt"><span>링크 상태</span><span>${state} <span class="note">손님 ${j.live_views}번 봄 · 사진 ${H.photosOf(j.id).length}장</span></span></div>
    <div class="opt"><span>자동으로 닫기</span><select class="in sm" style="width:auto" data-c="liveDays" data-j="${j.id}">${[1,3,7,14,30].map(d=>`<option value="${d}" ${j.live_close_days===d?'selected':''}>작업 끝 + ${d}일</option>`).join('')}</select></div>
    <div class="opt"><span>작업 끝 표시</span>${j.work_done_at?`<span class="note">${new Date(j.work_done_at).toLocaleString('ko-KR')}</span>`:`<button class="btn sm ghost" data-a="liveDone" data-j="${j.id}">지금 작업 끝으로</button>`}</div>
    <div class="ptitle">손님에게 보낼 카톡 문구</div><div class="kwrap"><div class="kmsg">${esc(H.liveMsg(j))}</div></div>
    <div id="qrbox" style="margin-top:10px"></div>
    <p class="note">손님이 처음 들어오면 청소 서비스 안내 → 추가 옵션 안내가 떠요. 작업이 끝나면 계좌 안내와 잔금, 닫히면 마감 인사와 네이버 후기 버튼이 나와요. (설정: 홍보 탭 › 손님 링크 설정)</p>
    <div class="sacts"><button type="button" class="btn ghost" data-a="close">닫기</button>${H.photosOf(j.id).length?`<button class="btn" data-a="photosSheet" data-j="${j.id}">사진함 보기</button>`:''}</div>`);
  if (!cfg.review_url) H.toast('네이버 후기 주소가 비어 있어요 · 홍보 탭 › 손님 링크 설정');
};
H.ACT.liveCopy = el => H.copy(H.liveUrl(J(el.dataset.j).live_code), '링크를 복사했어요');
H.ACT.liveMsgCopy = el => H.copy(H.liveMsg(J(el.dataset.j)), '카톡 문구를 복사했어요');
H.ACT.liveNew = async el => { if (!confirm('새로 발급하면 예전 링크는 바로 막혀요. 올린 사진도 새 링크로 옮겨지지 않아요. 계속할까요?')) return;
  const j = J(el.dataset.j); const code = H.rnd(8); await H.q(sb.from('jobs').update({live_code: code, live_views:0}).eq('id', j.id)); j.live_code = code; j.live_views = 0; H.toast('새 링크를 발급했어요'); H.ACT.liveSheet(el); H._dirty = Date.now(); };
H.ACT.liveClose = async el => { const j = J(el.dataset.j); await H.q(sb.from('jobs').update({live_closed: !j.live_closed}).eq('id', j.id)); j.live_closed = !j.live_closed; H.toast(j.live_closed?'닫았어요':'다시 열었어요'); H.ACT.liveSheet(el); H._dirty = Date.now(); };
H.ACT.liveDone = async el => { const j = J(el.dataset.j); const t = new Date().toISOString(); await H.q(sb.from('jobs').update({work_done_at: t}).eq('id', j.id)); j.work_done_at = t; H.ACT.liveSheet(el); H._dirty = Date.now(); };
H.CHANGE.liveDays = async el => { const j = J(el.dataset.j); await H.q(sb.from('jobs').update({live_close_days: +el.value}).eq('id', j.id)); j.live_close_days = +el.value; H.toast('저장했어요'); };
H.ACT.liveQR = async el => { const j = J(el.dataset.j); const box = document.getElementById('qrbox');
  try {
    if (!window.QRCode) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    box.innerHTML = '<div id="qrimg" style="width:180px;padding:8px;border:1px solid var(--line);border-radius:10px;background:#fff"></div><div class="note">현장에서 손님 폰으로 찍으면 바로 열려요</div>';
    new QRCode(document.getElementById('qrimg'), {text: H.liveUrl(j.live_code), width: 162, height: 162, correctLevel: QRCode.CorrectLevel.M});
  } catch(_) { box.innerHTML = '<div class="note">QR을 불러오지 못했어요. 링크 복사로 보내 주세요.</div>'; } };

/* 사진함 */
H.ACT.photosSheet = el => { const j = J(el.dataset.j); const ph = H.photosOf(j.id);
  const lab = {before:'작업 전', during:'작업 중', after:'작업 후'};
  H.open(`<h3>📷 ${esc(j.title)} · 사진 ${ph.length}장</h3><p class="note" style="margin:-6px 0 10px">직원이 현장노트에서 올린 사진이에요. 흐린 사진은 손님 화면에서 숨겨요.</p>
    <div class="ph-grid">${ph.map(p=>`<figure class="${p.hidden?'hid':''}"><a href="${H.photoUrl(p.path)}" target="_blank" rel="noopener"><img loading="lazy" src="${H.photoUrl(p.path)}" alt=""></a><figcaption>${lab[p.stage]||''} · ${esc(H.P(p.staff_id).name)} <button class="btn sm ghost" style="padding:1px 6px;font-size:11px" data-a="phHide" data-id="${p.id}" data-j="${j.id}">${p.hidden?'보이기':'숨기기'}</button></figcaption></figure>`).join('') || '<p class="empty">아직 사진이 없어요</p>'}</div>
    <div class="sacts"><button class="btn ghost" data-a="close">닫기</button></div>`, true); };
H.ACT.phHide = async el => { const p = H.S.photos.find(x=>x.id==el.dataset.id); await H.q(sb.from('job_photos').update({hidden: !p.hidden}).eq('id', p.id)); p.hidden = !p.hidden; H.ACT.photosSheet(el); };
})(window.HQ);
