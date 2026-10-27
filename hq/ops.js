/* 운영 (HQS) */
(function(H){
const {esc, md, won, ymd, parse, addDays, sb} = H;
const V = H.V; V.ops = {month: new Date(H.today().getFullYear(), H.today().getMonth(), 1)};
const SUBS = [['order','오더 접수함'],['match','인력 매칭'],['money','현장 금액'],['deals','부동산 계약'],['buy','외주 지급'],['exp','운영비'],['cs','CS · 품질']];
const sub = () => { const s = (location.hash.split('/')[1]||''); return SUBS.some(x=>x[0]===s) ? s : 'order'; };
const EXP_CAT = ['광고비','비품비','소모품','차량·유류','통신비','수수료','식대','교육','기타'];
const ACCOUNTS = ['사업용 카드','사업자 통장','현금','개인 카드'];
const BUY_CAT = ['클린 도급','철거','시설관리','폐기물 처리','장비 임대','자재','기타'];
const BUY_PROOF = ['세금계산서','현금영수증(지출증빙)','카드','원천징수(3.3%)','없음'];
const BIZ = [['clean','클린'],['res','부동산'],['common','공통'],['ago','아고']];
const bizL = k => (BIZ.find(b=>b[0]===k)||[0,k])[1];

H.view('ops', {label:'운영',
  async load(){
    const m = V.ops.month, [m0, m1] = H.monthRange(m), T = H.today();
    const from = addDays(m0 < addDays(T,-30) ? m0 : addDays(T,-30), -7);
    const to = addDays(m1 > addDays(T,120) ? m1 : addDays(T,120), 0);
    await H.loadRange(from, to);
    const f = ymd(m0), t = ymd(m1);
    const [dl, pu, ex, puw] = await Promise.all([
      H.q(sb.from('deals').select('*').gte('deal_date', f).lte('deal_date', t).order('deal_date')),
      H.q(sb.from('purchases').select('*').gte('pu_date', f).lte('pu_date', t).order('pu_date')),
      H.q(sb.from('expenses').select('*').gte('ex_date', f).lte('ex_date', t).order('ex_date', {ascending:false})),
      H.q(sb.from('purchases').select('*').eq('proof_status','요청함'))
    ]);
    Object.assign(H.S, {deals: dl, purchases: pu, expenses: ex, puWait: puw});
  },
  render(){
    const s = sub(), m = V.ops.month;
    const quotes = (H.S.jobs||[]).filter(j=>j.status==='quote').length;
    const nav = `<div class="subnav">${SUBS.map(([k,l])=>`<button data-a="opsSub" data-s="${k}" aria-pressed="${s===k}">${l}${k==='order'&&quotes?`<span class="cnt">${quotes}</span>`:''}</button>`).join('')}</div>`;
    const mnav = ['money','deals','buy','exp'].includes(s) ? `<div style="display:flex;gap:6px;align-items:center"><button class="btn ghost sm" data-a="opsMonth" data-n="-1">${H.I('left')}</button><b>${m.getFullYear()}년 ${m.getMonth()+1}월</b><button class="btn ghost sm" data-a="opsMonth" data-n="1">${H.I('right')}</button></div>` : '';
    const body = {order, match, money, deals, buy, exp, cs}[s]();
    return `<div class="bh" style="margin:0">${nav}${mnav}</div>${body}`;
  }
});
H.ACT.opsSub = el => { location.hash = 'ops/' + el.dataset.s; };
H.ACT.opsMonth = el => { const m = V.ops.month; V.ops.month = new Date(m.getFullYear(), m.getMonth() + (+el.dataset.n), 1); H._dirty = Date.now(); H.render(); };
const inMonth = d => { const m = V.ops.month; return d && d.slice(0,7) === ymd(m).slice(0,7); };

/* ---------- 오더 접수함 ---------- */
function order(){
  const q = (H.S.jobs||[]).filter(j=>j.status==='quote').sort((a,b)=>a.job_date.localeCompare(b.job_date));
  const chans = {}; (H.S.jobs||[]).filter(j=>inMonth(j.job_date)||j.status==='quote').forEach(j=>{ const c = j.order_channel||'미입력'; chans[c] = (chans[c]||0)+1; });
  return `<div class="gside"><section class="box"><div class="bh"><h3>견적 중 ${q.length}건</h3><button class="btn sm" data-a="quoteNew">+ 오더 접수</button></div>
    ${q.map(j=>`<div class="card" style="--tc:#CBD5E1"><div class="t">${md(j.job_date)} ${j.start_time?j.start_time.slice(0,5):''} ${esc(j.title)}<span class="pill p-info">${esc(j.order_channel||'채널 미입력')}</span></div>
      <div class="m"><span>기본 ${won(j.total_amount)}원</span>${(j.quote&&j.quote.items||[]).length?`<span>체크: ${esc(j.quote.items.join(', '))}</span>`:''}${j.quote&&j.quote.note?`<span>${esc(j.quote.note)}</span>`:''}</div>
      <div class="acts"><button class="btn sm ghost" data-a="quoteSheet" data-j="${j.id}">견적 체크리스트</button><button class="btn sm ghost" data-a="quoteCopy" data-j="${j.id}">견적 카톡 문구</button><button class="btn sm ghost" data-a="jobEdit" data-j="${j.id}">수정</button><button class="btn sm" data-a="quoteConfirm" data-j="${j.id}">확정 → 모집 시작</button></div></div>`).join('') || '<p class="empty">견적 중인 오더가 없어요. 숨고·블로그·당근으로 들어온 문의를 [+ 오더 접수]로 넣어 두세요.</p>'}</section>
    <section class="box"><div class="bh"><h3>채널별 (이번 달 + 견적 중)</h3></div>${Object.entries(chans).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<div class="rw"><span>${esc(c)}</span><b>${n}건</b></div>`).join('') || '<div class="note">아직 없어요</div>'}
      <p class="note" style="margin-top:10px">흐름: 접수(견적 중) → 견적 체크리스트로 예상 추가금 미리 안내 → 확정하면 일정판에 모집으로 올라가고 손님 링크가 생겨요.</p></section></div>`;
}
const parseRange = p => { const s = String(p||'').replace(/,/g,''); if (/평당/.test(s)) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(만)?\s*(?:원)?\s*(~)?\s*(\d+(?:\.\d+)?)?\s*(만)?/); if (!m) return null;
  const unit = (s.includes('만') ? 10000 : 1); const a = +m[1] * (m[2]||s.includes('만')?10000:1); const b = m[4] ? +m[4] * unit : (m[3] ? null : a);
  return [a, b]; };
H.ACT.quoteSheet = el => { const j = H.J(el.dataset.j); const opts = H.setting('extra_options') || []; const sel = new Set((j.quote&&j.quote.items)||[]);
  const groups = [...new Set(opts.map(o=>o.g))];
  H.open(`<form data-f="quote"><h3>견적 · 미리 묻는 체크리스트</h3><p class="note" style="margin:-6px 0 10px">${esc(j.title)} · 상담 때 고객에게 확인 → 체크한 항목은 견적서에 '예상 추가금'으로 미리 표시돼요.</p>
    <div class="fg"><div class="field"><label>기본 금액</label><input type="number" step="1000" name="base" value="${j.total_amount??''}"></div><div class="field"><label>메모</label><input name="note" value="${esc((j.quote&&j.quote.note)||'')}"></div></div>
    ${groups.map(g=>`<div class="ptitle">${esc(g)}</div><div class="chk">${opts.filter(o=>o.g===g).map(o=>`<label><input type="checkbox" name="it" value="${esc(o.n)}" ${sel.has(o.n)?'checked':''}>${esc(o.n)}<b>${esc(o.p)}</b></label>`).join('')}</div>`).join('')}
    ${H.sacts('저장', `<button type="button" class="btn ghost" data-a="quoteCopyForm" style="flex:0 0 auto">카톡 문구 복사</button>`)}<input type="hidden" name="id" value="${j.id}"></form>`, true); };
const quoteText = (j, base, items) => { const opts = H.setting('extra_options') || []; let lo = 0, hi = 0, open = false;
  items.forEach(n => { const o = opts.find(x=>x.n===n); const r = o && parseRange(o.p); if (!r) { open = true; return; } lo += r[0]; if (r[1] == null) open = true; else hi += r[1]; });
  const rng = items.length ? ` + 예상 추가 ${won(lo)}${hi>lo?'~'+won(hi):''}원${open?'~':''}` : '';
  return `[리츠종합클린] ${j.title} 견적 안내드려요 😊\n\n기본 ${won(base)}원${rng}\n${items.length?'· 미리 말씀해주신 항목: '+items.join(', ')+'\n':''}· 추가 작업은 현장 확인 후, 고객님과 충분히 상의한 뒤 진행해요.\n· 표시 금액 부가세(VAT) 별도`; };
H.ACT.quoteCopy = el => { const j = H.J(el.dataset.j); H.copy(quoteText(j, j.total_amount||0, (j.quote&&j.quote.items)||[]), '견적 카톡 문구 복사했어요'); };
H.ACT.quoteCopyForm = el => { const f = el.closest('form'); const v = new FormData(f); const j = H.J(v.get('id')); H.copy(quoteText(j, +v.get('base')||0, v.getAll('it')), '견적 카톡 문구 복사했어요'); };
H.FORM.quote = async v => { const id = +v.get('id');
  await H.q(sb.from('jobs').update({total_amount: H.nnum(v.get('base')), quote: {items: v.getAll('it'), note: v.get('note')||''}}).eq('id', id)); H.close(); H.toast('저장했어요'); H.refresh(); };

/* ---------- 인력 매칭 ---------- */
function match(){
  const S = H.S, T = H.today(), today = ymd(T), end = ymd(addDays(T, 14));
  const jobs = (S.jobs||[]).filter(j => j.job_date >= today && j.job_date <= end && j.status === 'open');
  const busy = d => new Set((S.jobs||[]).filter(j=>j.job_date===d && j.status!=='cancelled').flatMap(j=>(j.assignments||[]).filter(a=>['approved','applied'].includes(a.status)).map(a=>a.staff_id)));
  const rows = jobs.map(j => { const ap = j.assignments.filter(a=>a.status==='approved').length; const left = j.headcount - ap; if (left <= 0) return '';
    const b = busy(j.job_date); const av = (S.avail||[]).filter(a=>a.day===j.job_date);
    const ok = S.staff.filter(s => s.status==='active' && s.team!=='RES' && av.some(a=>a.staff_id===s.id && a.kind==='ok') && !b.has(s.id));
    const no = S.staff.filter(s => av.some(a=>a.staff_id===s.id && a.kind==='no'));
    const apl = j.assignments.filter(a=>a.status==='applied');
    return `<div class="card" style="--tc:var(--cleanl)"><div class="t">${md(j.job_date)} ${j.start_time?j.start_time.slice(0,5):''} ${esc(j.title)}<span class="pill p-warn">${left}자리 남음</span></div>
      <div class="m"><span>신청 ${apl.length}명${apl.length?': '+apl.map(a=>esc(H.P(a.staff_id).name)).join(', '):''}</span></div>
      <div class="avl" style="margin:6px 0 4px">이날 가능 (아직 배정 안 됨): ${ok.map(s=>esc(s.name)+' <small>'+s.team+'</small>').join(' · ') || '없음'}</div>
      ${no.length?`<div class="avl no" style="margin:0 0 4px">불가: ${no.map(s=>esc(s.name)).join(' · ')}</div>`:''}
      <div class="acts"><button class="btn sm" data-a="assign" data-j="${j.id}">배정하기</button><button class="btn sm ghost" data-a="urgentCopy" data-j="${j.id}">급구 카톡 문구</button></div></div>`; }).join('');
  return `<section class="box"><div class="bh"><h3>사람이 더 필요한 현장 (14일)</h3><span class="sub">직원이 일정판에 '일할 수 있는 날'로 표시한 사람을 보여줘요</span></div>${rows || '<p class="empty">14일 안에 사람이 부족한 현장이 없어요 👍</p>'}</section>`;
}
H.ACT.urgentCopy = el => { const j = H.J(el.dataset.j); const d = parse(j.job_date); const left = j.headcount - j.assignments.filter(a=>a.status==='approved').length;
  H.copy(`[${H.C.BRAND}] 급구 🙏\n${d.getMonth()+1}/${d.getDate()}(${H.DOW[d.getDay()]}) ${j.start_time?j.start_time.slice(0,5):''} ${j.title}\n${left}자리 남았어요. 가능하신 분 일정판에서 신청해주세요!`, '급구 문구 복사했어요'); };

/* ---------- 현장 금액 ---------- */
const pillPay = (paid, label) => paid ? `<span class="pill p-ok">${label||'받음'}</span>` : `<span class="pill p-wait">대기</span>`;
const proofPill = (proof, issued, how, amt) => { if (!amt) return ''; if (issued || proof==='카드' || proof==='플랫폼' || how==='카드' || how==='플랫폼') return `<span class="pill p-ok">${esc(proof||how)}${issued?' 발행':''}</span>`;
  if (proof==='현금영수증' || ((how==='현금'||how==='계좌이체') && amt>=100000)) return '<span class="pill p-warn">현금영수증 발행 필요</span>'; return proof?`<span class="pill p-mute">${esc(proof)}</span>`:''; };
function money(){
  const S = H.S;
  const jobs = (S.jobs||[]).filter(j => inMonth(j.job_date) && !['quote','cancelled'].includes(j.status)).sort((a,b)=>a.job_date.localeCompare(b.job_date));
  const T = ymd(H.today());
  return `<section class="box"><div class="bh"><h3><i class="dot" style="background:var(--clean)"></i>리츠종합클린 · 현장 금액</h3><span class="sub">현장마다 넣기만 해요 · 합계와 이익은 대표 화면(돈)에서</span></div>
    <div class="tbl"><table><thead><tr><th>현장</th><th class="num">계약 금액</th><th>예약금</th><th>잔금</th><th>추가금 (사유)</th><th>투입 인력 · 지급</th><th></th></tr></thead><tbody>
    ${jobs.map(j => { const ap = j.assignments.filter(a=>a.status==='approved'); const late = j.job_date < T && ['open','full'].includes(j.status);
      return `<tr><td><b>${md(j.job_date)} ${esc(j.title)}</b><div class="note">${esc(j.kind||'')}${j.contract_mode?` · <span class="tag" style="background:var(--prt)">도급 ${j.contract_mode}</span>`:''}${late?' · <span style="color:var(--warn)">미마감</span>':''}</div></td>
        <td class="num">${won(j.total_amount)}</td>
        <td>${j.deposit_amount?`${won(j.deposit_amount)} ${pillPay(j.deposit_paid)}<div class="note">${esc(j.deposit_how||'')} ${proofPill(j.deposit_proof, j.deposit_issued, j.deposit_how, +j.deposit_amount)}</div>`:'-'}</td>
        <td>${j.balance_amount!=null?`${won(j.balance_amount)} ${j.collected_at?'<span class="pill p-ok">받음</span>':j.job_date<T?'<span class="pill p-warn">미수</span>':'<span class="pill p-wait">현장</span>'}<div class="note">${esc(j.balance_how||'')} ${proofPill(j.balance_proof, j.balance_issued, j.balance_how, +j.balance_amount)}</div>`:'-'}</td>
        <td>${(j.extras||[]).map(x=>`<div>${won(x.amount)} <span class="note">${esc(x.name)}${x.notice==='site'?' · 현장 추가':' · 견적 때 고지'}${x.agreed===false?' · 미동의':''}</span></div>`).join('') || '-'}</td>
        <td>${ap.map(a=>`<div>${esc(H.P(a.staff_id).name)} <span class="note">${a.pay_amount!=null?won((+a.pay_amount||0)+(+a.extra_amount||0)):'-'}</span></div>`).join('') || (j.contract_mode?'<span class="note">도급팀</span>':'-')}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-a="moneySheet" data-j="${j.id}">금액 · 증빙</button> <button class="btn sm ghost" data-a="payClose" data-j="${j.id}">지급액</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">이 달 현장이 없어요</td></tr>'}
    </tbody></table></div><p class="note">결제·증빙: 카드 · 세금계산서 · 현금영수증 · 현금 · 계좌이체 · 플랫폼 | 추가금은 줄마다 사유 · 견적 때 고지/현장 추가 · 고객 동의를 남겨요</p></section>`;
}
const sel = (name, list, v, blank='-') => `<select class="in sm" name="${name}"><option value="">${blank}</option>${list.map(x=>`<option ${v===x?'selected':''}>${x}</option>`).join('')}</select>`;
const xRow = (x, opts) => `<div class="xl" data-x>
    <div style="display:flex;gap:4px"><select class="in sm" data-c="xopt" style="max-width:44%"><option value="">항목 선택</option>${opts.map(o=>`<option value="${esc(o.n)}" data-v="${o.v||''}">${esc(o.n)} (${esc(o.p)})</option>`).join('')}<option value="__">직접 입력</option></select><input class="in sm" name="x_name" value="${esc(x.name||'')}" placeholder="사유"></div>
    <input class="in sm num" type="number" step="1000" name="x_amount" value="${x.amount??''}" placeholder="금액">
    <select class="in sm" name="x_notice"><option value="pre" ${x.notice!=='site'?'selected':''}>견적 때 고지</option><option value="site" ${x.notice==='site'?'selected':''}>현장 추가</option></select>
    <div style="display:flex;gap:3px">${sel('x_how', H.HOW, x.how, '결제')}${sel('x_proof', H.PROOF, x.proof, '증빙')}</div>
    <div style="display:flex;gap:6px"><label class="ck"><input type="checkbox" name="x_agreed" ${x.agreed!==false?'checked':''}>동의</label><label class="ck"><input type="checkbox" name="x_issued" ${x.issued?'checked':''}>발행</label><button type="button" class="btn sm ghost" data-a="xDel" style="padding:2px 7px">✕</button></div></div>`;
H.ACT.moneySheet = el => { const j = H.J(el.dataset.j); const opts = H.setting('extra_options') || [];
  const cb = (n, v, l) => `<label class="ck" style="font-size:12.5px;display:flex;gap:4px;align-items:center"><input type="checkbox" name="${n}" ${v?'checked':''}>${l}</label>`;
  H.open(`<form data-f="money"><h3>금액 · 증빙 · 추가금</h3><p class="note" style="margin:-6px 0 10px">${esc(j.title)} · ${md(j.job_date)}</p>
    <div class="fg">
      <div class="field"><label>계약 금액</label><input type="number" step="1000" name="total_amount" value="${j.total_amount??''}"></div>
      <div class="field"><label>도급 정산</label><select name="contract_mode"><option value="">도급 아님</option><option value="A" ${j.contract_mode==='A'?'selected':''}>A · 예약금만 본사 (잔금은 팀이 직접)</option><option value="B" ${j.contract_mode==='B'?'selected':''}>B · 전액 받고 잔금 송금</option></select></div>
      <div class="sec">예약금</div>
      <div class="field"><label>금액</label><input type="number" step="1000" name="deposit_amount" value="${j.deposit_amount??''}"></div>
      <div class="field"><label>결제 · 증빙</label><div style="display:flex;gap:4px">${sel('deposit_how', H.HOW, j.deposit_how, '결제')}${sel('deposit_proof', H.PROOF, j.deposit_proof, '증빙')}</div></div>
      <div class="field full" style="display:flex;gap:14px">${cb('deposit_paid', j.deposit_paid, '입금 받음')}${cb('deposit_issued', j.deposit_issued, '증빙 발행함')}</div>
      <div class="sec">잔금</div>
      <div class="field"><label>금액</label><input type="number" step="1000" name="balance_amount" value="${j.balance_amount??''}"></div>
      <div class="field"><label>결제 · 증빙</label><div style="display:flex;gap:4px">${sel('balance_how', H.HOW, j.balance_how, '결제')}${sel('balance_proof', H.PROOF, j.balance_proof, '증빙')}</div></div>
      <div class="field"><label>수금 담당</label><select name="collector_id"><option value="">없음 (회사 계좌)</option>${H.S.staff.filter(s=>s.can_collect&&s.status!=='left').map(s=>`<option value="${s.id}" ${j.collector_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field" style="display:flex;gap:14px;align-items:flex-end">${cb('collected', !!j.collected_at, '잔금 받음')}${cb('balance_issued', j.balance_issued, '증빙 발행함')}</div>
      <div class="sec">추가금 (줄마다 사유)</div>
      <div class="full" id="xbox">${(j.extras||[]).map(x=>xRow(x, opts)).join('')}</div>
      <div class="full"><button type="button" class="btn sm ghost" data-a="xAdd">+ 추가금 줄 추가</button> <span class="note">항목을 고르면 기준가가 들어가요. 현장 추가는 고객 동의 체크 후 저장</span></div>
    </div>${H.sacts('저장')}<input type="hidden" name="id" value="${j.id}"></form>`, true); };
H.ACT.xAdd = () => { const box = document.getElementById('xbox'); box.insertAdjacentHTML('beforeend', xRow({notice:'site', agreed:false}, H.setting('extra_options')||[])); };
H.ACT.xDel = el => el.closest('[data-x]').remove();
H.CHANGE.xopt = el => { const row = el.closest('[data-x]'); const o = el.selectedOptions[0]; if (!el.value) return;
  if (el.value === '__') { row.querySelector('[name=x_name]').focus(); return; }
  row.querySelector('[name=x_name]').value = el.value; const v = +o.dataset.v; if (v) row.querySelector('[name=x_amount]').value = v; };
H.FORM.money = async (v, f) => { const id = +v.get('id'); const j = H.J(id);
  const extras = [...f.querySelectorAll('[data-x]')].map(r => ({name: r.querySelector('[name=x_name]').value.trim(), amount: H.nnum(r.querySelector('[name=x_amount]').value), notice: r.querySelector('[name=x_notice]').value,
    how: r.querySelector('[name=x_how]').value || null, proof: r.querySelector('[name=x_proof]').value || null, agreed: r.querySelector('[name=x_agreed]').checked, issued: r.querySelector('[name=x_issued]').checked}))
    .filter(x => x.name || x.amount);
  if (extras.some(x => !x.name)) return H.toast('추가금마다 사유를 적어주세요');
  if (extras.some(x => x.notice === 'site' && !x.agreed) && !confirm('현장 추가 중 고객 동의 체크가 안 된 줄이 있어요. 동의 안 된 금액은 매출·손님 잔금에 안 들어가요. 저장할까요?')) return;
  const up = {total_amount:H.nnum(v.get('total_amount')), contract_mode:H.nn(v.get('contract_mode')), deposit_amount:H.nnum(v.get('deposit_amount')), deposit_how:H.nn(v.get('deposit_how')), deposit_proof:H.nn(v.get('deposit_proof')),
    deposit_paid:v.get('deposit_paid')==='on', deposit_issued:v.get('deposit_issued')==='on', balance_amount:H.nnum(v.get('balance_amount')), balance_how:H.nn(v.get('balance_how')), balance_proof:H.nn(v.get('balance_proof')),
    balance_issued:v.get('balance_issued')==='on', collector_id:H.nn(v.get('collector_id')), extras};
  const col = v.get('collected')==='on'; if (col && !j.collected_at) { up.collected_at = new Date().toISOString(); up.collected_how = up.balance_how || '계좌'; } if (!col && j.collected_at) up.collected_at = null;
  await H.q(sb.from('jobs').update(up).eq('id', id)); H.close(); H.toast('저장했어요'); H.refresh(); };

/* ---------- 부동산 계약 (중개보수) ---------- */
const SIDES = {'월세':['임대인','임차인'],'전세':['임대인','임차인'],'매매':['매도인','매수인'],'기타':['의뢰인','상대방']};
function deals(){
  const S = H.S; const resStaff = S.staff.filter(s=>s.team==='RES');
  const mmDone = S.owner && S.mm ? (S.mm.all||[]).filter(r=>r[3]==='계약완료' && !(S.deals||[]).some(d=>d.maemul_id===r[1])).slice(0,8) : [];
  return `<section class="box"><div class="bh"><h3><i class="dot" style="background:var(--res)"></i>리츠부동산 · 계약 중개보수</h3><button class="btn sm" data-a="dealNew">+ 계약 추가</button></div>
    ${mmDone.length?`<div class="banner info" style="margin-bottom:10px">매물노트 '계약완료' 중 아직 안 넣은 것: ${mmDone.map(r=>`<button class="btn sm ghost" data-a="dealNew" data-m="${esc(r[1])}" data-ag="${esc(r[0])}" data-k="${esc(r[4]||'')}">${esc(r[1])} ${esc(r[7]||'')} ${esc(r[8]||'')}</button>`).join(' ')}</div>`:''}
    <div class="tbl"><table><thead><tr><th>계약</th><th>담당</th><th>받는 쪽</th><th class="num">중개보수</th><th>결제 · 증빙</th><th>발행</th><th></th></tr></thead><tbody>
    ${(S.deals||[]).map(d => { const sides = d.sides||[]; const n = Math.max(1, sides.length);
      return sides.length ? sides.map((x,i) => `<tr>${i===0?`<td rowspan="${n}"><b>${md(d.deal_date)} ${esc(d.title)}</b><div class="note">${esc(d.deal_kind||'')} · ${esc(d.maemul_id||'')}</div></td><td rowspan="${n}">${(d.agents||[]).map(a=>esc(H.P(a).name)).join('<br>')}${(d.agents||[]).length>1?' <span class="pill p-mute">공동</span>':''}</td>`:''}
        <td>${esc(x.side)}</td><td class="num">${won(x.amount)}</td><td>${esc(x.how||'')} ${esc(x.proof||'')}</td><td>${x.issued?'<span class="pill p-ok">발행됨</span>':x.paid===false?'<span class="pill p-wait">수령 전</span>':(x.proof==='현금영수증'||x.how==='현금'||x.how==='계좌이체')?'<span class="pill p-warn">발행 필요</span>':'<span class="pill p-mute">-</span>'}</td>
        ${i===0?`<td rowspan="${n}"><button class="btn sm ghost" data-a="dealEdit" data-id="${d.id}">수정</button></td>`:''}</tr>`).join('')
        : `<tr><td><b>${md(d.deal_date)} ${esc(d.title)}</b></td><td colspan="5" class="note">받는 쪽 금액을 넣어 주세요</td><td><button class="btn sm ghost" data-a="dealEdit" data-id="${d.id}">수정</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">이 달 계약이 없어요</td></tr>'}
    </tbody></table></div><p class="note">결제: 카드 · 현금영수증 · 세금계산서 · 계좌이체 · 현금 | 공동중개는 담당 여러 명 · 배분율과 개인 수익은 대표 화면(돈)에서만 보여요</p></section>`;
}
function dealSheet(d){
  const S = H.S; const res = S.staff.filter(s=>s.team==='RES' && s.status!=='left');
  const kind = d.deal_kind || '월세'; const sides = (d.sides && d.sides.length) ? d.sides : (SIDES[kind]||SIDES['기타']).map(s=>({side:s}));
  const row = (x,i) => `<div class="xl" data-sd style="grid-template-columns:.8fr 1fr 1.6fr auto"><input class="in sm" name="sd_side" value="${esc(x.side||'')}" placeholder="받는 쪽"><input class="in sm num" type="number" step="1000" name="sd_amount" value="${x.amount??''}" placeholder="중개보수">
    <div style="display:flex;gap:3px">${sel('sd_how', ['계좌이체','카드','현금'], x.how, '결제')}${sel('sd_proof', ['현금영수증','카드','세금계산서','없음'], x.proof, '증빙')}</div>
    <div style="display:flex;gap:6px"><label class="ck"><input type="checkbox" name="sd_paid" ${x.paid!==false?'checked':''}>받음</label><label class="ck"><input type="checkbox" name="sd_issued" ${x.issued?'checked':''}>발행</label></div></div>`;
  H.open(`<form data-f="deal"><h3>${d.id?'계약 수정':'계약 추가'}</h3><div class="fg">
    <div class="field"><label>계약일</label><input type="date" name="deal_date" value="${d.deal_date||ymd(H.today())}" required></div>
    <div class="field"><label>종류</label><select name="deal_kind" data-c="dealKind">${Object.keys(SIDES).map(k=>`<option ${kind===k?'selected':''}>${k}</option>`).join('')}</select></div>
    <div class="field"><label>매물번호</label><input name="maemul_id" value="${esc(d.maemul_id||'')}" placeholder="조-0005"></div>
    <div class="field"><label>이름 (동네·종류)</label><input name="title" value="${esc(d.title||'')}" placeholder="광안동 원룸" required></div>
    <div class="field full"><label>담당 (공동중개면 여러 명)</label><div class="chips">${res.map(s=>`<label><input type="checkbox" name="agents" value="${s.id}" ${(d.agents||[]).includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('')}<label><input type="checkbox" name="agents" value="boss" ${d.id&&!(d.agents||[]).length?'checked':''}><span>대표</span></label></div></div>
    <div class="sec">받는 쪽마다 중개보수</div><div class="full" id="sdbox">${sides.map(row).join('')}</div>
    <div class="field full"><label>메모</label><input name="memo" value="${esc(d.memo||'')}"></div>
  </div>${H.sacts('저장', d.id?`<button type="button" class="btn danger" data-a="dealDel" data-id="${d.id}" style="flex:0 0 auto">삭제</button>`:'')}<input type="hidden" name="id" value="${d.id||''}"></form>`, true);
}
H.CHANGE.dealKind = el => { const sides = SIDES[el.value]||SIDES['기타']; document.querySelectorAll('[name=sd_side]').forEach((i,n)=>{ if (sides[n]) i.value = sides[n]; }); };
H.ACT.dealNew = el => { const ag = el.dataset.ag ? H.S.staff.filter(s=>s.name===el.dataset.ag).map(s=>s.id) : [];
  dealSheet({maemul_id: el.dataset.m||'', agents: ag, deal_kind: ['월세','전세','매매'].includes(el.dataset.k) ? el.dataset.k : '월세', title: ''}); };
H.ACT.dealEdit = el => dealSheet((H.S.deals||[]).find(d=>d.id==el.dataset.id));
H.ACT.dealDel = async el => { if (!confirm('이 계약을 지울까요?')) return; await H.q(sb.from('deals').delete().eq('id', +el.dataset.id)); H.close(); H.refresh(); };
H.FORM.deal = async (v, f) => {
  const sides = [...f.querySelectorAll('[data-sd]')].map(r => ({side:r.querySelector('[name=sd_side]').value.trim(), amount:H.nnum(r.querySelector('[name=sd_amount]').value), how:r.querySelector('[name=sd_how]').value||null, proof:r.querySelector('[name=sd_proof]').value||null, paid:r.querySelector('[name=sd_paid]').checked, issued:r.querySelector('[name=sd_issued]').checked})).filter(x=>x.side);
  const row = {deal_date:v.get('deal_date'), deal_kind:v.get('deal_kind'), maemul_id:H.nn(v.get('maemul_id')), title:v.get('title').trim(), agents:v.getAll('agents').filter(x=>x!=='boss'), sides, memo:H.nn(v.get('memo'))};
  const id = v.get('id'); await H.q(id ? sb.from('deals').update(row).eq('id', +id) : sb.from('deals').insert(row)); H.close(); H.toast('저장했어요'); H.refresh(); };

/* ---------- 외주 · 도급 지급 (매입) ---------- */
function buy(){
  const S = H.S; const old = (S.puWait||[]).filter(p => (Date.now() - parse(p.pu_date)) / 864e5 > 7);
  return `${old.length?`<div class="banner warn">세금계산서·현금영수증 '요청함'이 7일 넘은 건 ${old.length}개: ${old.map(p=>esc(p.vendor||p.category)+' '+won(p.amount)).join(', ')} — 지금 다시 요청하세요</div>`:''}
    <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--prt)"></i>외주 · 도급 지급 <span class="sub">우리가 낸 돈, 받은 증빙 (매입 자료)</span></h3><button class="btn sm" data-a="buyNew">+ 지급 추가</button></div>
    <div class="tbl"><table><thead><tr><th>날짜 · 현장</th><th>항목</th><th>지급처</th><th class="num">지급액</th><th>받은 증빙</th><th>지급 방법</th><th></th></tr></thead><tbody>
    ${(S.purchases||[]).map(p => { const j = (S.jobs||[]).find(x=>x.id===p.job_id);
      return `<tr><td>${md(p.pu_date)} ${j?esc(j.title):''}</td><td>${esc(p.category)}</td><td>${esc(p.vendor||'')}</td><td class="num">${won(p.amount)}</td>
      <td>${esc(p.proof||'')} ${p.proof_status==='받음'?'<span class="pill p-ok">받음</span>':p.proof_status==='요청함'?'<span class="pill p-wait">요청함</span>':'<span class="pill p-warn">증빙 없음</span>'}</td><td>${esc(p.pay_how||'')}</td>
      <td style="white-space:nowrap">${p.proof_status==='요청함'?`<button class="btn sm" data-a="buyGot" data-id="${p.id}">받음</button> `:''}<button class="btn sm ghost" data-a="buyEdit" data-id="${p.id}">수정</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">이 달 지급 기록이 없어요</td></tr>'}
    </tbody></table></div><p class="note">항목: ${BUY_CAT.join(' · ')} | 증빙: ${BUY_PROOF.join(' · ')} · 철거·폐기물처럼 큰 돈은 보낼 때 바로 세금계산서를 요청하세요</p></section>`;
}
function buySheet(p){
  const S = H.S; const T = H.today(); const jobs = (S.jobs||[]).filter(j=>j.status!=='quote' && j.job_date >= ymd(addDays(T,-60)) && j.job_date <= ymd(addDays(T,30))).sort((a,b)=>b.job_date.localeCompare(a.job_date));
  H.open(`<form data-f="buy"><h3>${p.id?'외주 지급 수정':'외주 지급 추가'}</h3><div class="fg">
    <div class="field"><label>날짜</label><input type="date" name="pu_date" value="${p.pu_date||ymd(T)}" required></div>
    <div class="field"><label>현장 (선택)</label><select name="job_id"><option value="">현장 없음</option>${jobs.map(j=>`<option value="${j.id}" ${p.job_id===j.id?'selected':''}>${md(j.job_date)} ${esc(j.title)}</option>`).join('')}</select></div>
    <div class="field"><label>항목</label><select name="category">${BUY_CAT.map(c=>`<option ${p.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>사업</label><select name="biz">${BIZ.map(([k,l])=>`<option value="${k}" ${(p.biz||'clean')===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>지급처</label><input name="vendor" value="${esc(p.vendor||'')}" placeholder="○○철거 · 해운대팀"></div>
    <div class="field"><label>지급액</label><input type="number" step="1000" name="amount" value="${p.amount??''}" required></div>
    <div class="field"><label>받을 증빙</label><select name="proof">${BUY_PROOF.map(c=>`<option ${p.proof===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>증빙 상태</label><select name="proof_status">${['받음','요청함','없음'].map(c=>`<option ${(p.proof_status||'요청함')===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>지급 방법</label><select name="pay_how">${['계좌이체','현금','카드'].map(c=>`<option ${p.pay_how===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>메모</label><input name="memo" value="${esc(p.memo||'')}"></div>
  </div>${H.sacts('저장', p.id?`<button type="button" class="btn danger" data-a="buyDel" data-id="${p.id}" style="flex:0 0 auto">삭제</button>`:'')}<input type="hidden" name="id" value="${p.id||''}"></form>`);
}
H.ACT.buyNew = () => buySheet({});
H.ACT.buyEdit = el => buySheet((H.S.purchases||[]).find(p=>p.id==el.dataset.id));
H.ACT.buyDel = async el => { if (!confirm('지울까요?')) return; await H.q(sb.from('purchases').delete().eq('id', +el.dataset.id)); H.close(); H.refresh(); };
H.ACT.buyGot = async el => { await H.q(sb.from('purchases').update({proof_status:'받음'}).eq('id', +el.dataset.id)); H.toast('받음으로 바꿨어요'); H.refresh(); };
H.FORM.buy = async v => { const row = {pu_date:v.get('pu_date'), job_id:H.nnum(v.get('job_id')), category:v.get('category'), biz:v.get('biz'), vendor:H.nn(v.get('vendor')), amount:H.nnum(v.get('amount')), proof:v.get('proof'), proof_status:v.get('proof_status'), pay_how:v.get('pay_how'), memo:H.nn(v.get('memo'))};
  const id = v.get('id'); await H.q(id ? sb.from('purchases').update(row).eq('id', +id) : sb.from('purchases').insert(row)); H.close(); H.toast('저장했어요'); H.refresh(); };

/* ---------- 운영비 ---------- */
function exp(){
  const S = H.S; const list = S.expenses||[]; const tot = list.reduce((n,x)=>n+(+x.amount||0),0);
  return `<div class="gside"><section class="box"><div class="bh"><h3><i class="dot" style="background:#6B7280"></i>운영비 입력</h3><span class="sub">광고비 · 비품비 · 차량 · 통신 …</span></div>
    <form data-f="exp" class="fg" style="padding:10px;border:1px dashed #C7D2FE;border-radius:12px;background:#F8FAFF;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="field"><label>날짜</label><input type="date" name="ex_date" value="${ymd(H.today())}" required></div>
      <div class="field"><label>사업</label><select name="biz">${BIZ.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="field"><label>항목</label><select name="category">${EXP_CAT.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>내용</label><input name="memo" placeholder="당근 지역광고"></div>
      <div class="field"><label>금액</label><input type="number" step="100" name="amount" required></div>
      <div class="field"><label>결제 구좌</label><select name="account">${ACCOUNTS.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>영수증</label><select name="has_receipt"><option value="1">있음</option><option value="0">없음</option></select></div>
      <div class="field" style="display:flex;align-items:flex-end"><button class="btn" type="submit" style="width:100%">추가</button></div></form>
    <div style="margin-top:10px">${list.map(x=>`<div class="rw"><span>${md(x.ex_date)} · ${esc(x.memo||x.category)} <span class="tag" style="background:${x.biz==='clean'?'var(--clean)':x.biz==='res'?'var(--res)':'#6B7280'}">${bizL(x.biz)}</span> <span class="note">${esc(x.category)} · ${esc(x.account||'')}${x.has_receipt?'':' · <span style="color:var(--warn)">영수증 없음</span>'}</span></span><span><b>${won(x.amount)}</b> <button class="btn sm ghost" style="padding:1px 7px" data-a="expDel" data-id="${x.id}" aria-label="지우기">✕</button></span></div>`).join('') || '<p class="empty">이 달 운영비가 없어요</p>'}</div>
    <div class="sum"><span>${V.ops.month.getMonth()+1}월 운영비 합계</span><b>${won(tot)}원</b></div></section>
    <section class="box"><div class="bh"><h3>도움말</h3></div><p class="note">· 사업용 카드는 홈택스에 등록해 두면 경비 정리가 쉬워요.<br>· 현금으로 쓴 건 영수증이 없으면 경비 인정이 어려울 수 있어요 (세무사 확인).<br>· 항목별·구좌별 합계는 대표 화면(돈)에서 보여요.</p></section></div>`;
}
H.FORM.exp = async (v, f) => { await H.q(sb.from('expenses').insert({ex_date:v.get('ex_date'), biz:v.get('biz'), category:v.get('category'), memo:H.nn(v.get('memo')), amount:H.nnum(v.get('amount')), account:v.get('account'), has_receipt:v.get('has_receipt')==='1'}));
  H.toast('추가했어요'); H.refresh(); };
H.ACT.expDel = async el => { if (!confirm('지울까요?')) return; await H.q(sb.from('expenses').delete().eq('id', +el.dataset.id)); H.refresh(); };

/* ---------- CS · 품질 ---------- */
function cs(){
  const S = H.S, T = H.today(), from = ymd(addDays(T,-30)), today = ymd(T);
  const jobs = (S.jobs||[]).filter(j => j.job_date >= from && j.job_date <= today && !['quote','cancelled'].includes(j.status)).sort((a,b)=>b.job_date.localeCompare(a.job_date));
  const flag = jobs.filter(j=>j.cs && (j.cs.revisit || j.cs.claim));
  return `<section class="box"><div class="bh"><h3>CS · 품질 (30일)</h3><span class="sub">재방문 ${jobs.filter(j=>j.cs&&j.cs.revisit).length} · 클레임 ${jobs.filter(j=>j.cs&&j.cs.claim).length}</span></div>
    ${flag.length?`<div class="banner warn" style="margin-bottom:10px">챙길 현장: ${flag.map(j=>esc(md(j.job_date)+' '+j.title)).join(', ')}</div>`:''}
    <div class="tbl"><table><thead><tr><th>현장</th><th>사진</th><th>사진 검수</th><th>재방문 필요</th><th>클레임 · 메모</th></tr></thead><tbody>
    ${jobs.map(j => { const c = j.cs||{}; const n = H.photosOf(j.id).length;
      return `<tr><td><b>${md(j.job_date)} ${esc(j.title)}</b><div class="note">${(j.assignments||[]).filter(a=>a.status==='approved').map(a=>esc(H.P(a.staff_id).name)).join('·')}</div></td>
      <td>${n?`<button class="btn sm ghost" data-a="photosSheet" data-j="${j.id}">${n}장</button>`:'<span class="pill p-warn">없음</span>'}</td>
      <td><label class="ck" style="display:flex;gap:4px"><input type="checkbox" data-c="csSet" data-j="${j.id}" data-k="photo_ok" ${c.photo_ok?'checked':''}>OK</label></td>
      <td><label class="ck" style="display:flex;gap:4px"><input type="checkbox" data-c="csSet" data-j="${j.id}" data-k="revisit" ${c.revisit?'checked':''}>필요</label></td>
      <td><input class="in sm" data-c="csSet" data-j="${j.id}" data-k="claim" value="${esc(c.claim||'')}" placeholder="클레임·고객 의견"></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">30일 안에 끝난 현장이 없어요</td></tr>'}
    </tbody></table></div></section>`;
}
H.CHANGE.csSet = async el => { const j = H.J(el.dataset.j); const c = Object.assign({}, j.cs||{}); c[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim();
  await H.q(sb.from('jobs').update({cs:c}).eq('id', j.id)); j.cs = c; H.toast('저장했어요'); };
})(window.HQ);
