/* 돈 (대표만) */
(function(H){
const {esc, md, won, ymd, sb} = H;
const V = H.V; V.money = {month: new Date(H.today().getFullYear(), H.today().getMonth(), 1), detail: null};

H.view('money', {label:'돈', owner:true,
  async load(){
    const [m0, m1] = H.monthRange(V.money.month); const f = ymd(m0), t = ymd(m1);
    const [jobs, deals, shares, rules, ex, pu, staff] = await Promise.all([
      H.q(sb.from('jobs').select('*, assignments(*)').gte('job_date', f).lte('job_date', t).order('job_date')),
      H.q(sb.from('deals').select('*').gte('deal_date', f).lte('deal_date', t).order('deal_date')),
      H.q(sb.from('deal_shares').select('*')),
      H.q(sb.from('pay_rules').select('*')),
      H.q(sb.from('expenses').select('*').gte('ex_date', f).lte('ex_date', t)),
      H.q(sb.from('purchases').select('*').gte('pu_date', f).lte('pu_date', t)),
      H.q(sb.from('staff').select('*').order('created_at'))
    ]);
    if (H.loadPays) await H.loadPays(f, t).catch(() => {});
    if (H.loadAccts) await H.loadAccts((staff||[]).filter(x => x.status !== 'left' && !x.hidden).map(x => x.id)).catch(() => {});
    Object.assign(H.S, {mJobs: jobs, mDeals: deals, mShares: shares, payRules: rules, mEx: ex, mPu: pu, staffAll: staff, staff: (staff||[]).filter(x => !x.hidden)});
  },
  render(){ const R = H.calcMonth(); const m = V.money.month;
    return `<div class="bh" style="margin:0"><div style="display:flex;gap:6px;align-items:center"><button class="btn ghost sm" data-a="monNav" data-n="-1">${H.I('left')}</button><b>${m.getFullYear()}년 ${m.getMonth()+1}월</b><button class="btn ghost sm" data-a="monNav" data-n="1">${H.I('right')}</button></div><span class="note">세금·공제는 기본 계산이에요 · 신고 전 세무사 확인</span></div>
    <section class="box money"><div class="bh"><h3>${m.getMonth()+1}월 전체 수익</h3><button class="btn sm ghost" data-a="monXlsx">엑셀 받기 (세무사용)</button></div>
      <div class="mrow">
        <div><span>총 매출</span><b>${won(R.rev)}</b><small> 청소 ${won(R.cleanRev)} · 부동산 ${won(R.resRev)}</small></div>
        <div><span>− 청소 인건비</span><b style="font-size:20px">${won(R.labor)}</b></div>
        <div><span>− 부동산 배분</span><b style="font-size:20px">${won(R.shareTot)}</b></div>
        <div><span>− 외주 · 매입</span><b style="font-size:20px">${won(R.puTot)}</b></div>
        <div><span>− 운영비</span><b style="font-size:20px">${won(R.exTot)}</b></div>
        <div><span>미수금</span><b style="font-size:20px;color:#FCA5A5">${won(R.unpaid)}</b></div>
        <div class="net"><span>순수익</span><b>${won(R.net)}</b></div>
      </div></section>
    <div class="g3">
      <section class="box"><div class="bh"><h3>매출 구분</h3><span class="sub">둘 다 합계에 포함</span></div>
        <div class="ptitle">리츠종합클린</div>${bar(R.clean.issued, R.clean.not, 'var(--clean)')}
        <div class="rw"><span>증빙 발행</span><b>${won(R.clean.issued)}</b></div>
        <div class="rw"><span>증빙 안 함 ${R.clean.need?`<span class="pill p-warn">현금영수증 ${R.clean.need}건</span>`:''}</span><b>${won(R.clean.not)}</b></div>
        <div class="ptitle">리츠부동산</div>${bar(R.res.issued, R.res.not, 'var(--res)')}
        <div class="rw"><span>증빙 발행</span><b>${won(R.res.issued)}</b></div>
        <div class="rw"><span>증빙 안 함 ${R.res.need?`<span class="pill p-warn">${R.res.need}건</span>`:''}${R.res.wait?` <span class="pill p-wait">수령 전 ${R.res.wait}건</span>`:''}</span><b>${won(R.res.not)}</b></div>
        <p class="note">현금영수증 의무발행 업종은 10만원 이상 현금 거래에 발행이 필요해요. 미발행분은 세무사와 처리 방법을 정해 주세요.</p></section>
      <section class="box"><div class="bh"><h3><i class="dot" style="background:#6B7280"></i>운영비 · 구좌별</h3><span class="sub">${won(R.exTot)}</span></div>
        <div class="ptitle">항목별</div>${R.exByCat.map(([k,v])=>`<div class="rw"><span>${esc(k)}</span><b>${won(v)}</b></div>`).join('') || '<div class="note">없음</div>'}
        <div class="ptitle">결제 구좌별</div>${R.exByAcc.map(([k,v])=>`<div class="rw"><span>${esc(k)}${k==='현금'&&R.exNoRcpt?` <span class="pill p-wait">영수증 없음 ${R.exNoRcpt}건</span>`:''}</span><b>${won(v)}</b></div>`).join('') || '<div class="note">없음</div>'}
        ${R.exTot?`<div class="hb" style="margin-top:10px">${R.exByBiz.map(([k,v])=>`<i style="width:${v/R.exTot*100}%;background:${k==='clean'?'var(--clean)':k==='res'?'var(--res)':k==='ago'?'#2E8B57':'#9CA3AF'}"></i>`).join('')}</div><div class="note">${R.exByBiz.map(([k,v])=>`${({clean:'청소',res:'부동산',common:'공통',ago:'아고'})[k]||k} ${Math.round(v/R.exTot*100)}%`).join(' · ')}</div>`:''}</section>
      <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--prt)"></i>매입 · 외주 지급</h3><span class="sub">매출과 따로</span></div>
        <div class="kp" style="grid-template-columns:1fr 1fr"><div class="k"><span>매입 합계</span><b>${won(R.puTot)}</b></div><div class="k ok"><span>증빙 받음</span><b>${won(R.pu.got)}</b></div>
          <div class="k wait"><span>요청 중</span><b>${won(R.pu.req)}</b></div><div class="k ${R.pu.none?'warn':''}"><span>증빙 없음</span><b>${won(R.pu.none)}</b></div></div>
        <div class="ptitle">항목별</div>${R.puByCat.map(([k,v])=>`<div class="rw"><span>${esc(k)}</span><b>${won(v)}</b></div>`).join('') || '<div class="note">없음</div>'}
        <div class="ptitle">받은 증빙 종류</div>${R.puByProof.map(([k,v])=>`<div class="rw"><span>${esc(k)}</span><b>${won(v)}</b></div>`).join('') || '<div class="note">없음</div>'}</section>
    </div>
    <div class="g2">
      <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--clean)"></i>청소 · 현장별 수익</h3><span class="sub">${R.cleanJobs.length}곳</span></div>
        <div class="tbl"><table><thead><tr><th>현장</th><th class="num">매출</th><th class="num">추가금</th><th class="num">인건비</th><th class="num">외주</th><th class="num">현장 이익</th></tr></thead><tbody>
        ${R.cleanJobs.map(x=>`<tr><td>${md(x.j.job_date)} ${esc(x.j.title)}${x.j.contract_mode?` <span class="tag" style="background:var(--prt)">도급 ${x.j.contract_mode}</span>`:''}</td><td class="num">${won(x.rev)}</td><td class="num">${x.ext?'+'+won(x.ext):'-'}</td><td class="num">${won(x.lab)}</td><td class="num">${x.pu?won(x.pu):'-'}</td><td class="num"><b>${won(x.rev-x.lab-x.pu)}</b>${x.unpaid?' <span class="pill p-warn">미수</span>':''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">이 달 현장이 없어요</td></tr>'}
        </tbody></table></div>
        <div class="ptitle">추가금 사유 TOP</div>${R.extraTop.map(([k,v])=>`<div class="rw"><span>${esc(k)}</span><b>${v.n}건 · ${won(v.s)}</b></div>`).join('') || '<div class="note">이 달 추가금이 없어요</div>'}
        <p class="note">도급 A는 예약금만 본사 매출, B는 전액 매출이고 잔금 송금은 외주 지급(청소 도급)으로 넣어 주세요.</p></section>
      <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--clean)"></i>청소 · 직원별 정산</h3><span class="sub">이름을 누르면 현장별 상세</span></div>
        <div class="tbl"><table><thead><tr><th>직원</th><th>지급 방식</th><th class="num">현장</th><th class="num">지급 총액</th><th class="num">공제</th><th class="num">실지급</th><th>상태</th></tr></thead><tbody>
        ${[['OPS','직영'],['SPT','지원'],['PRT','도급']].map(([tm,l])=>{ const rows = R.pay.filter(p=>p.s.team===tm); if (!rows.length) return '';
          return `<tr class="grp"><td colspan="7">${l}</td></tr>` + rows.map(p=>`<tr><td><button class="btn sm ghost" data-a="payDetail" data-s="${p.s.id}" style="font-weight:700">${esc(p.s.name)}</button></td>
            <td><select class="in sm" data-c="payType" data-s="${p.s.id}">${Object.entries(H.PT).map(([k,v])=>`<option value="${k}" ${p.s.pay_type===k?'selected':''}>${v}</option>`).join('')}</select></td>
            <td class="num">${p.n}</td><td class="num">${won(p.gross)}${p.extra?`<div class="note">추가수당 ${won(p.extra)}</div>`:''}</td><td class="num">${p.s.pay_type==='salary'?'<span class="note">급여에서</span>':won(p.ded)}</td><td class="num"><b>${won(p.gross-p.ded)}</b>${H.payHtml?H.payHtml(p.s.id, p.gross-p.ded):''}${H.acctHtml?H.acctHtml(p.s.id):''}</td>
            <td>${p.paid?'<span class="pill p-ok">지급 완료</span>':`<button class="btn sm" data-a="payDone" data-s="${p.s.id}">지급 완료로</button>`}</td></tr>`).join(''); }).join('') || '<tr><td colspan="7" class="empty">이 달 지급액이 들어간 현장이 없어요</td></tr>'}
        ${R.pay.length?`<tr><td colspan="3"><b>합계</b></td><td class="num"><b>${won(R.labor)}</b></td><td class="num">${won(R.pay.reduce((n,p)=>n+p.ded,0))}</td><td class="num"><b>${won(R.labor-R.pay.reduce((n,p)=>n+p.ded,0))}</b></td><td></td></tr>`:''}
        </tbody></table></div>
        <p class="note">지급 방식: 3.3% / 공제 없음 / 일용직 / 급여 / 도급 · 일용직은 하루 15만원 넘는 부분만 원천징수로 계산 (세무사 확인)</p></section>
    </div>
    <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--res)"></i>부동산 · 직원별 배분 · 수익</h3><span class="sub">배분율은 사람마다 기본값, 계약마다 바꿀 수 있어요</span></div>
      <div class="tbl"><table><thead><tr><th>직원</th><th>배분율</th><th class="num">계약 몫</th><th class="num">개인 수익</th><th>지급 방식</th><th class="num">공제</th><th class="num">실지급</th><th>상태</th></tr></thead><tbody>
      ${R.res.rows.map(r=>`<tr><td><button class="btn sm ghost" data-a="resDetail" data-s="${r.s.id}" style="font-weight:700">${esc(r.s.name)}</button> ${r.s.status==='leave'?'<span class="pill p-leave">휴직</span>':''}<div class="note">${r.n}건</div></td>
        <td><input class="in sm num" style="width:70px" type="number" min="0" max="100" data-c="shareRate" data-s="${r.s.id}" value="${r.rate??''}" placeholder="%"></td>
        <td class="num">${won(r.base)}</td><td class="num"><b>${won(r.inc)}</b></td>
        <td><select class="in sm" data-c="payType" data-s="${r.s.id}">${['freelance33','salary','none'].map(k=>`<option value="${k}" ${r.s.pay_type===k?'selected':''}>${H.PT[k]}</option>`).join('')}</select></td>
        <td class="num">${r.s.pay_type==='salary'?'<span class="note">급여에서</span>':won(r.ded)}</td><td class="num"><b>${won(r.inc-r.ded)}</b>${H.payHtml?H.payHtml(r.s.id, r.inc-r.ded):''}${H.acctHtml?H.acctHtml(r.s.id):''}</td>
        <td>${!r.n?'-':r.paid?'<span class="pill p-ok">지급 완료</span>':`<button class="btn sm" data-a="resPaid" data-s="${r.s.id}">지급 완료로</button>`}</td></tr>`).join('')}
      <tr class="boss"><td><b>대표 몫</b></td><td class="note">나머지</td><td class="num">${won(R.resRev)}</td><td class="num"><b>${won(R.resRev - R.shareTot)}</b></td><td colspan="4" class="note">사업 소득</td></tr>
      </tbody></table></div>
      ${R.res.noRate?'<div class="banner warn" style="margin-top:8px">배분율이 비어 있는 직원이 있어요. 비어 있으면 0%로 계산돼요.</div>':''}
      <div class="ptitle">이 달 계약 (계약마다 배분 바꾸기)</div>
      ${(H.S.mDeals||[]).map(d=>`<div class="rw"><span>${md(d.deal_date)} ${esc(d.title)} <span class="note">${esc(d.maemul_id||'')} · ${(d.agents||[]).map(a=>esc(H.P(a).name)).join('·')||'대표'}</span></span><span><b>${won(H.dealTotal(d))}</b> <button class="btn sm ghost" data-a="shareSheet" data-id="${d.id}">배분</button></span></div>`).join('') || '<div class="note">이 달 계약이 없어요 · 운영 › 부동산 계약에서 넣어요</div>'}
      <p class="note">공동중개는 기여 비율(기본 똑같이 나눔)로 먼저 나눈 뒤 배분율을 곱해요. 3.3%/급여 처리는 세무사 확인이 필요해요.</p></section>`;
  }
});
const bar = (a, b, c) => (a+b) ? `<div class="hb"><i style="width:${a/(a+b)*100}%;background:${c}"></i><i style="width:${b/(a+b)*100}%;background:#F59E0B"></i></div>` : '';
H.dealTotal = d => (d.sides||[]).reduce((n,x)=>n+(+x.amount||0),0);

H.calcMonth = () => {
  const S = H.S; const R = {};
  const jobs = (S.mJobs||[]).filter(j => !['quote','cancelled'].includes(j.status));
  const puByJob = {}; (S.mPu||[]).forEach(p => { if (p.job_id) puByJob[p.job_id] = (puByJob[p.job_id]||0) + (+p.amount||0); });
  const today = ymd(H.today());
  R.cleanJobs = jobs.map(j => ({j, rev:H.jobRevenue(j), ext:j.contract_mode==='A'?0:H.extrasSum(j), lab:H.jobLabor(j), pu:puByJob[j.id]||0,
    unpaid: j.job_date < today && ((j.balance_amount && !j.collected_at && j.contract_mode !== 'A') || (+j.deposit_amount && !j.deposit_paid)) }));
  R.cleanRev = R.cleanJobs.reduce((n,x)=>n+x.rev,0);
  R.labor = R.cleanJobs.reduce((n,x)=>n+x.lab,0);
  R.clean = jobs.reduce((r,j) => { const s = H.jobProofSplit(j); r.issued += s.issued; r.not += s.not; r.need += s.need; return r; }, {issued:0, not:0, need:0});
  const ext = {}; jobs.forEach(j => (j.extras||[]).filter(x=>x.agreed!==false).forEach(x => { const k = x.name || '기타'; ext[k] = ext[k] || {n:0, s:0}; ext[k].n++; ext[k].s += +x.amount||0; }));
  R.extraTop = Object.entries(ext).sort((a,b)=>b[1].s-a[1].s).slice(0,6);
  // 부동산
  const deals = S.mDeals||[];
  R.resRev = deals.reduce((n,d)=>n+H.dealTotal(d),0);
  const res = {issued:0, not:0, need:0, wait:0};
  deals.forEach(d => (d.sides||[]).forEach(x => { const a = +x.amount||0; if (!a) return; if (x.paid === false) res.wait++;
    if (x.issued || x.proof==='카드' || x.how==='카드') res.issued += a; else { res.not += a; if (x.proof==='현금영수증' || x.how==='현금' || x.how==='계좌이체') res.need++; } }));
  const rate = sid => { const r = (S.payRules||[]).find(p=>p.staff_id===sid); return r && r.share_rate != null ? +r.share_rate : null; };
  const resStaff = S.staff.filter(s => s.team === 'RES' && s.status !== 'left');
  res.rows = resStaff.map(s => {
    let base = 0, inc = 0, n = 0, paid = true;
    deals.forEach(d => { if (!(d.agents||[]).includes(s.id)) return; n++;
      const sh = (S.mShares||[]).find(x=>x.deal_id===d.id && x.staff_id===s.id);
      const contrib = sh ? +sh.contrib : 100 / (d.agents.length||1);
      const rt = sh && sh.rate != null ? +sh.rate : (rate(s.id) || 0);
      const b = H.dealTotal(d) * contrib / 100; base += b; inc += Math.round(b * rt / 100);
      if (!(sh && sh.paid)) paid = false; });
    const ded = s.pay_type === 'freelance33' ? H.deduct('freelance33', inc) : 0;
    return {s, base:Math.round(base), inc, ded, n, paid, rate: rate(s.id)};
  });
  res.noRate = res.rows.some(r => r.n && r.rate == null);
  R.res = res; R.shareTot = res.rows.reduce((n,r)=>n+r.inc,0);
  // 청소 직원별
  const by = {};
  jobs.forEach(j => (j.assignments||[]).filter(a=>a.status==='approved' && (a.pay_amount!=null || a.extra_amount!=null)).forEach(a => {
    const p = by[a.staff_id] = by[a.staff_id] || {s:H.P(a.staff_id), n:0, gross:0, extra:0, paid:true, items:[]};
    p.n++; p.gross += (+a.pay_amount||0) + (+a.extra_amount||0); p.extra += +a.extra_amount||0; if (!a.paid) p.paid = false; p.items.push({j, a}); }));
  R.pay = Object.values(by).filter(p=>p.s.team && p.s.team!=='RES').map(p => Object.assign(p, {ded: H.deduct(p.s.pay_type, p.gross, p.n)})).sort((a,b)=>b.gross-a.gross);
  R.payBy = by;
  // 운영비 · 매입
  const grp = (arr, key) => { const o = {}; arr.forEach(x => { const k = key(x) || '기타'; o[k] = (o[k]||0) + (+x.amount||0); }); return Object.entries(o).sort((a,b)=>b[1]-a[1]); };
  const ex = S.mEx||[]; R.exTot = ex.reduce((n,x)=>n+(+x.amount||0),0); R.exByCat = grp(ex, x=>x.category); R.exByAcc = grp(ex, x=>x.account); R.exByBiz = grp(ex, x=>x.biz); R.exNoRcpt = ex.filter(x=>!x.has_receipt).length;
  const pu = S.mPu||[]; R.puTot = pu.reduce((n,x)=>n+(+x.amount||0),0);
  R.pu = {got: pu.filter(p=>p.proof_status==='받음').reduce((n,x)=>n+(+x.amount||0),0), req: pu.filter(p=>p.proof_status==='요청함').reduce((n,x)=>n+(+x.amount||0),0), none: pu.filter(p=>p.proof_status==='없음').reduce((n,x)=>n+(+x.amount||0),0)};
  R.puByCat = grp(pu, x=>x.category); R.puByProof = grp(pu.filter(p=>p.proof_status==='받음'), x=>x.proof);
  R.rev = R.cleanRev + R.resRev;
  R.unpaid = jobs.filter(j=>j.job_date<today).reduce((n,j)=>n + (j.balance_amount && !j.collected_at && j.contract_mode!=='A' ? +j.balance_amount : 0) + (+j.deposit_amount && !j.deposit_paid ? +j.deposit_amount : 0), 0)
    + deals.reduce((n,d)=>n+(d.sides||[]).filter(x=>x.paid===false).reduce((a,x)=>a+(+x.amount||0),0),0);
  R.net = R.rev - R.labor - R.shareTot - R.puTot - R.exTot;
  return R;
};

H.ACT.monNav = el => { const m = V.money.month; V.money.month = new Date(m.getFullYear(), m.getMonth()+(+el.dataset.n), 1); H._dirty = Date.now(); H.render(); };
H.CHANGE.payType = async el => { await H.q(sb.from('staff').update({pay_type: el.value}).eq('id', el.dataset.s)); const s = H.S.staff.find(x=>x.id===el.dataset.s); if (s) s.pay_type = el.value; H.toast('지급 방식을 바꿨어요'); H.render(); };
H.CHANGE.shareRate = async el => { const v = el.value === '' ? null : +el.value;
  await H.q(sb.from('pay_rules').upsert({staff_id: el.dataset.s, share_rate: v})); const r = (H.S.payRules||[]).find(p=>p.staff_id===el.dataset.s); if (r) r.share_rate = v; else (H.S.payRules = H.S.payRules||[]).push({staff_id:el.dataset.s, share_rate:v}); H.toast('배분율을 저장했어요'); H.render(); };
H.ACT.payDone = async el => { const p = H.calcMonth().payBy[el.dataset.s]; if (!p || !confirm(`${p.s.name}님 ${V.money.month.getMonth()+1}월 정산을 지급 완료로 바꿀까요?`)) return;
  for (const {j} of p.items) await H.q(sb.from('assignments').update({paid:true}).match({job_id:j.id, staff_id:el.dataset.s}));
  H.toast('지급 완료로 바꿨어요 · 직원 정산 화면에도 보여요'); H.refresh(); };
H.ACT.payDetail = el => { const R = H.calcMonth(); const p = R.payBy[el.dataset.s]; if (!p) return;
  H.open(`<h3>${esc(p.s.name)} · ${V.money.month.getMonth()+1}월 정산</h3><p class="note">${H.PT[p.s.pay_type]} · 직원이 '내 정산'에서 보는 것과 같은 내역이에요</p>
    <div class="tbl"><table><thead><tr><th>날짜</th><th>현장</th><th class="num">기본</th><th class="num">추가</th><th>메모</th><th>지급</th></tr></thead><tbody>
    ${p.items.map(({j,a})=>`<tr><td>${md(j.job_date)}</td><td>${esc(j.title)}</td><td class="num">${won(a.pay_amount)}</td><td class="num">${a.extra_amount?won(a.extra_amount):'-'}</td><td class="note">${esc(a.pay_memo||'')}</td><td>${a.paid?'<span class="pill p-ok">완료</span>':'<span class="pill p-wait">대기</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="sum"><span>지급 총액 ${won(p.gross)} − 공제 ${won(p.ded)}</span><b>${won(p.gross-p.ded)}원</b></div>
    <div class="sacts"><button class="btn ghost" data-a="close">닫기</button></div>`, true); };
H.ACT.resDetail = el => { const S = H.S, R = H.calcMonth(); const r = R.res.rows.find(x=>x.s.id===el.dataset.s); const deals = (S.mDeals||[]).filter(d=>(d.agents||[]).includes(el.dataset.s));
  H.open(`<h3>${esc(r.s.name)} · ${V.money.month.getMonth()+1}월 계약별</h3><div class="tbl"><table><thead><tr><th>계약</th><th class="num">중개보수</th><th class="num">기여</th><th class="num">배분율</th><th class="num">개인 몫</th></tr></thead><tbody>
    ${deals.map(d=>{ const sh = (S.mShares||[]).find(x=>x.deal_id===d.id && x.staff_id===r.s.id); const c = sh ? +sh.contrib : 100/(d.agents.length||1); const rt = sh && sh.rate!=null ? +sh.rate : (r.rate||0);
      return `<tr><td>${md(d.deal_date)} ${esc(d.title)}</td><td class="num">${won(H.dealTotal(d))}</td><td class="num">${Math.round(c)}%</td><td class="num">${rt}%</td><td class="num"><b>${won(Math.round(H.dealTotal(d)*c/100*rt/100))}</b></td></tr>`; }).join('')}
    </tbody></table></div><div class="sum"><span>개인 수익 ${won(r.inc)} − 공제 ${won(r.ded)}</span><b>${won(r.inc-r.ded)}원</b></div><div class="sacts"><button class="btn ghost" data-a="close">닫기</button></div>`, true); };
H.ACT.resPaid = async el => { const deals = (H.S.mDeals||[]).filter(d=>(d.agents||[]).includes(el.dataset.s)); if (!confirm('이 달 배분을 지급 완료로 바꿀까요?')) return;
  for (const d of deals) { const sh = (H.S.mShares||[]).find(x=>x.deal_id===d.id && x.staff_id===el.dataset.s);
    await H.q(sb.from('deal_shares').upsert({deal_id:d.id, staff_id:el.dataset.s, contrib: sh ? sh.contrib : 100/(d.agents.length||1), rate: sh ? sh.rate : null, paid:true})); }
  H.toast('지급 완료로 바꿨어요'); H.refresh(); };
H.ACT.shareSheet = el => { const S = H.S; const d = S.mDeals.find(x=>x.id==el.dataset.id); const ag = d.agents||[];
  H.open(`<form data-f="share"><h3>배분 · ${esc(d.title)}</h3><p class="note">중개보수 ${won(H.dealTotal(d))}원 · 기여는 합이 100%가 되게 · 배분율을 비우면 직원 기본값</p>
    ${ag.map(a=>{ const sh = (S.mShares||[]).find(x=>x.deal_id===d.id && x.staff_id===a); const def = (S.payRules||[]).find(p=>p.staff_id===a);
      return `<div class="fg" style="grid-template-columns:1fr 1fr 1fr;align-items:end;margin-bottom:6px"><b>${esc(H.P(a).name)}</b><div class="field"><label>기여 %</label><input type="number" name="c_${a}" value="${sh?sh.contrib:Math.round(100/ag.length)}"></div><div class="field"><label>배분율 % (기본 ${def&&def.share_rate!=null?def.share_rate:'없음'})</label><input type="number" name="r_${a}" value="${sh&&sh.rate!=null?sh.rate:''}"></div></div>`; }).join('') || '<p class="empty">담당이 대표뿐이라 배분이 없어요</p>'}
    ${H.sacts('저장')}<input type="hidden" name="id" value="${d.id}"></form>`); };
H.FORM.share = async v => { const d = H.S.mDeals.find(x=>x.id==v.get('id'));
  for (const a of d.agents||[]) { const sh = (H.S.mShares||[]).find(x=>x.deal_id===d.id && x.staff_id===a);
    await H.q(sb.from('deal_shares').upsert({deal_id:d.id, staff_id:a, contrib:+v.get('c_'+a)||0, rate:H.nnum(v.get('r_'+a)), paid: sh ? sh.paid : false})); }
  H.close(); H.toast('배분을 저장했어요'); H.refresh(); };

/* 엑셀 (세무사 전달용) */
H.ACT.monXlsx = async () => {
  if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const S = H.S, R = H.calcMonth(), m = V.money.month, wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  add('요약', [['항목','금액'],['청소 매출',R.cleanRev],['부동산 매출',R.resRev],['청소 인건비',R.labor],['부동산 배분',R.shareTot],['외주·매입',R.puTot],['운영비',R.exTot],['순수익',R.net],['미수금',R.unpaid],[],['청소 증빙 발행',R.clean.issued],['청소 증빙 안 함',R.clean.not],['부동산 증빙 발행',R.res.issued],['부동산 증빙 안 함',R.res.not]]);
  const cl = [['날짜','현장','계약금액','도급','예약금','예약금 결제','예약금 증빙','예약금 발행','잔금','잔금 결제','잔금 증빙','잔금 발행','추가금','추가금 내역','본사 매출','인건비','외주']];
  R.cleanJobs.forEach(({j,rev,lab,pu}) => cl.push([j.job_date, j.title, j.total_amount||0, j.contract_mode||'', j.deposit_amount||0, j.deposit_how||'', j.deposit_proof||'', j.deposit_issued?'O':'', j.balance_amount||0, j.balance_how||'', j.balance_proof||'', j.balance_issued?'O':'', H.extrasSum(j), (j.extras||[]).map(x=>`${x.name} ${x.amount}${x.issued?'(발행)':''}`).join(', '), rev, lab, pu]));
  add('청소 매출', cl);
  const rs = [['계약일','매물번호','계약','종류','받는 쪽','중개보수','결제','증빙','발행','받음','담당']];
  (S.mDeals||[]).forEach(d => (d.sides||[]).forEach(x => rs.push([d.deal_date, d.maemul_id||'', d.title, d.deal_kind||'', x.side, x.amount||0, x.how||'', x.proof||'', x.issued?'O':'', x.paid===false?'':'O', (d.agents||[]).map(a=>H.P(a).name).join('·')||'대표'])));
  add('부동산 매출', rs);
  const pc = [['직원','팀','지급 방식','현장 수','지급 총액','공제','실지급','지급 완료']]; R.pay.forEach(p => pc.push([p.s.name, p.s.team, H.PT[p.s.pay_type], p.n, p.gross, p.ded, p.gross-p.ded, p.paid?'O':''])); add('청소 정산', pc);
  const pr = [['직원','배분율','계약 몫','개인 수익','지급 방식','공제','실지급']]; R.res.rows.forEach(r => pr.push([r.s.name, r.rate??'', r.base, r.inc, H.PT[r.s.pay_type], r.ded, r.inc-r.ded])); add('부동산 배분', pr);
  const ex = [['날짜','사업','항목','내용','금액','결제 구좌','영수증']]; (S.mEx||[]).forEach(x => ex.push([x.ex_date, x.biz, x.category, x.memo||'', x.amount, x.account||'', x.has_receipt?'O':''])); add('운영비', ex);
  const pu = [['날짜','현장','항목','지급처','금액','증빙','증빙 상태','지급 방법','메모']]; (S.mPu||[]).forEach(p => { const j = (S.mJobs||[]).find(x=>x.id===p.job_id); pu.push([p.pu_date, j?j.title:'', p.category, p.vendor||'', p.amount, p.proof||'', p.proof_status, p.pay_how||'', p.memo||'']); }); add('매입', pu);
  XLSX.writeFile(wb, `어닝플레이스_${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}_정산.xlsx`);
};
})(window.HQ);
