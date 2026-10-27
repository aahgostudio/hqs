/* 오늘 정산 — 현장 수금 확인 후 저녁 일괄 지급용 (대표 전용)
   그날 현장: 계약·예약금·잔금·수금 상태 / 직원별: 지급액 → 공제(지급 방식) → 실지급 · 계좌 · 입금 기록 */
(function(H){
const {esc, sb} = H, won = H.won;
const md = d => `${+d.slice(5,7)}/${+d.slice(8,10)}`;
let SD = null;

async function load(d){
  const jobs = (await H.q(sb.from('jobs').select('*, assignments(*)').eq('job_date', d).order('start_time')))
    .filter(j => j.status !== 'cancelled' && j.status !== 'quote');
  const ids = new Set(); jobs.forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => ids.add(a.staff_id)));
  if (H.loadAccts) await H.loadAccts([...ids]).catch(() => {});
  let pays = [];
  if (!H.S.needV9) pays = await H.q(sb.from('payouts').select('*').eq('paid_on', d).eq('void', false)).catch(() => []);
  return {d, jobs, pays};
}
function calc(D){
  const by = {}, miss = [];
  D.jobs.forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => {
    const p = by[a.staff_id] = by[a.staff_id] || {s: H.P(a.staff_id), gross: 0, n: 0, items: []};
    if (a.pay_amount == null && a.extra_amount == null) miss.push({j, s: H.P(a.staff_id)});
    const g = (+a.pay_amount||0) + (+a.extra_amount||0); p.gross += g; p.n++; p.items.push({j, g}); }));
  const rows = Object.values(by).map(p => { const ded = p.s.pay_type === 'salary' ? 0 : H.deduct(p.s.pay_type, p.gross, 1);
    const paid = D.pays.filter(x => x.staff_id === p.s.id).reduce((a,x) => a + x.amount, 0);
    return Object.assign(p, {ded, net: p.gross - ded, paid}); }).sort((a,b) => b.net - a.net);
  const sites = D.jobs.map(j => { const rev = H.jobRevenue(j), dep = +j.deposit_amount||0, bal = j.balance_amount != null ? +j.balance_amount : Math.max(0, rev - dep);
    return {j, rev, dep, bal, got: !!j.collected_at || !bal, who: j.collector_id ? H.P(j.collector_id).name : '대표'}; });
  return {rows, sites, miss, rev: sites.reduce((a,x) => a + x.rev, 0), balGot: sites.filter(x => x.got).reduce((a,x) => a + x.bal, 0),
    balWait: sites.filter(x => !x.got).reduce((a,x) => a + x.bal, 0), labor: rows.reduce((a,r) => a + r.gross, 0), net: rows.reduce((a,r) => a + r.net, 0)};
}
const amtTxt = n => n % 10000 === 0 ? String(n / 10000) : won(n) + '원';
const nick = s => s.name.length >= 3 ? s.name.slice(1) : s.name;

function draw(){
  const D = SD, C = calc(D), on = !H.S.needV9;
  H.open(`<div class="st">
    <div class="bh"><h3 style="margin:0">💰 ${md(D.d)} 정산</h3><span style="display:flex;gap:6px"><input type="date" class="in sm" value="${D.d}" data-c="stlDate" style="width:auto"><button class="btn sm ghost" data-a="stlCopy">전체 복사</button></span></div>
    <div class="hr-k">
      <div><span>현장</span><b>${C.sites.length}</b><small>매출 ${won(C.rev)}</small></div>
      <div><span>잔금 수금 완료</span><b style="color:#15803D">${won(C.balGot)}</b><small>대기 ${won(C.balWait)}</small></div>
      <div><span>직원 지급 총액</span><b>${won(C.labor)}</b><small>${C.rows.length}명</small></div>
      <div><span>실제 보낼 돈</span><b>${won(C.net)}</b><small>공제 ${won(C.labor - C.net)}</small></div>
    </div>
    ${C.balWait ? `<div class="banner warn" style="margin-bottom:8px">아직 수금 확인 안 된 잔금 ${won(C.balWait)}원 — 일정판에서 수금 확인 후 지급하세요</div>` : ''}
    ${C.miss.length ? `<div class="banner warn" style="margin-bottom:8px">지급액 미입력: ${C.miss.map(m => esc(m.s.name) + '(' + esc(m.j.title||'') + ')').join(', ')} — 일정판 › 현장 › 마감에서 금액을 넣어주세요</div>` : ''}
    <div class="ptitle">현장 · 수금</div>
    <div class="tbl"><table><thead><tr><th>현장</th><th class="num">매출</th><th class="num">예약금</th><th class="num">잔금</th><th>수금</th></tr></thead><tbody>
      ${C.sites.map(x => `<tr><td>${x.j.start_time ? x.j.start_time.slice(0,5) + ' ' : ''}${esc(x.j.title||'')}</td><td class="num">${won(x.rev)}</td><td class="num">${won(x.dep)}</td><td class="num">${won(x.bal)}</td><td>${x.got ? `<span class="pill p-ok">✓ ${esc(x.who)}</span>` : `<span class="pill p-warn">대기 · ${esc(x.who)}</span>`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">이날 현장이 없어요</td></tr>'}
    </tbody></table></div>
    <div class="ptitle">직원 지급</div>
    <div class="tbl"><table><thead><tr><th>직원</th><th class="num">지급액</th><th>방식</th><th class="num">공제</th><th class="num">보낼 돈</th><th>계좌</th><th></th></tr></thead><tbody>
      ${C.rows.map(r => `<tr><td><b>${esc(r.s.name)}</b><div class="note">${r.items.map(i => esc(i.j.title||'')).join(' · ')}</div></td><td class="num">${won(r.gross)}</td><td class="note">${H.PT[r.s.pay_type]||''}</td><td class="num">${won(r.ded)}</td><td class="num"><b>${won(r.net)}</b></td>
        <td>${H.acctHtml ? H.acctHtml(r.s.id) : ''}</td>
        <td style="white-space:nowrap">${!on ? '' : r.paid >= r.net && r.net ? `<span class="pill p-ok">입금 ✓</span>` : `<button class="btn sm" data-a="stlPaid" data-s="${r.s.id}" data-n="${r.net}">입금 완료</button>`}${on && r.paid && r.paid < r.net ? `<div class="note">기록 ${won(r.paid)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">지급할 직원이 없어요</td></tr>'}
    </tbody></table></div>
    <p class="note">공제: 3.3% = 지급액×3.3% · 일용직 = 하루 15만원 넘는 부분만 · 급여 = 월급에서 정산 (세무사 확인)${on ? ' · [입금 완료] = 입금 기록 + (대화 열린 뒤엔) 1:1에 "OO님 7 넣었어요" 자동 전송' : ''}</p>
    <div class="sacts"><button class="btn ghost" data-a="close">닫기</button></div></div>`, true);
}
H.ACT.daySettle = async el => { const d = (el && el.dataset && el.dataset.d) || H.ymd(new Date()); H.open('<div class="spin"></div>', true); SD = await load(d); draw(); };
H.CHANGE.stlDate = async el => { SD = await load(el.value); draw(); };
H.ACT.stlPaid = async el => {
  const s = H.P(el.dataset.s), n = +el.dataset.n;
  if (!confirm(`${s.name}님께 ${won(n)}원 입금하셨어요?\n입금 기록으로 남겨요.`)) return;
  const chatOn = await sb.from('settings').select('value').eq('key', 'chat_on').maybeSingle();
  const dm = (chatOn.data && String(chatOn.data.value) === 'true') ? await sb.from('chat_rooms').select('id').eq('kind', 'dm').eq('staff_id', s.id).maybeSingle() : {data: null};
  if (dm.data && SD.d === H.ymd(new Date())) {   // 대화가 열려 있으면 1:1로 알림 → 자동 기록
    const {error} = await sb.rpc('chat_admin_send', {p_room: dm.data.id, p_body: `${nick(s)}님 ${amtTxt(n)} 넣었어요\n고맙습니다`, p_photo: null}); if (error) throw error;
  } else {
    await H.q(sb.from('payouts').insert({staff_id: s.id, amount: n, paid_on: SD.d, source: 'manual', body: `${md(SD.d)} 정산`}));
  }
  H.toast(`${s.name}님 입금 기록 완료`); SD = await load(SD.d); draw();
};
H.ACT.stlCopy = () => { const C = calc(SD);
  const t = [`[${md(SD.d)} 정산] 현장 ${C.sites.length}곳 · 매출 ${won(C.rev)} · 잔금 수금 ${won(C.balGot)}${C.balWait ? ` (대기 ${won(C.balWait)})` : ''}`,
    ...C.rows.map(r => { const a = (H.S.accts||{})[r.s.id] || {}; return `${r.s.name} ${won(r.gross)}${r.ded ? ` - ${H.PT[r.s.pay_type]} ${won(r.ded)}` : ''} = ${won(r.net)}원${a.acct ? ` / ${a.bank||''} ${a.acct} ${a.holder||''}` : ''}`; }),
    `합계 보낼 돈 ${won(C.net)}원`].join('\n');
  H.copy(t, '정산 내용을 복사했어요'); };
})(window.HQ);
