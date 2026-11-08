/* 💸 정산 (폰용 간단 화면) — 밖에서 바로 보고 바로 입금
   사람별: 기본(레벨 금액 또는 입력값) + 알파 → 공제(지급 방식) → 보낼 돈 · 계좌 복사 · [입금 완료]
   레벨 금액표는 settings 'level_pay' (없으면 기본값) */
(function(H){
const {esc, sb} = H, won = H.won;
const LEVEL_PAY_DEF = {'교육생':50000, '가정청소 팀원 (일반)':70000, '가정청소 팀원 (고정)':80000, '가정청소 팀장':90000, '상가청소 팀장':100000, '특수청소 팀장':120000};
const ROLE_LV = {'교육생':'교육생', '팀원':'가정청소 팀원 (일반)', '고정팀원':'가정청소 팀원 (고정)', '팀장':'가정청소 팀장', '상가팀장':'상가청소 팀장', '특수팀장':'특수청소 팀장'};
const P = {d: null, jobs: [], pays: [], open: {}, mOff: 0, mJobs: [], mOpen: {}}; H._payState = P;
const levelPay = () => Object.assign({}, LEVEL_PAY_DEF, (H.S.settings||{}).level_pay || {});
const lvOf = s => (((H.S.settings||{}).staff_hr||{})[s.id]||{}).level || ROLE_LV[s.role] || '';
const baseOf = (s, a) => a.pay_amount != null ? +a.pay_amount : (levelPay()[lvOf(s)] || 0);
const md = d => `${+d.slice(5,7)}/${+d.slice(8,10)}`;
const nick = s => s.name.length >= 3 ? s.name.slice(1) : s.name;

// 월별 직원 정산: 고른 달 + 앞 두 달 (전월 대비) · 지급액 · 입금 완료 · 남은 돈
async function loadMonth(){
  const T = new Date(), base = new Date(T.getFullYear(), T.getMonth() + P.mOff, 1);
  const from = new Date(base.getFullYear(), base.getMonth() - 2, 1), m1 = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  const to = P.mOff === 0 ? T : m1;
  P.mKeys = [2, 1, 0].map(n => { const d = new Date(base.getFullYear(), base.getMonth() - n, 1); return H.ymd(d).slice(0, 7); });   // [2달 전, 전월, 이번]
  P.mLabel = base.getMonth() + 1;
  P.mJobs = (await H.q(sb.from('jobs').select('id,job_date,title,kind,status,helpers,extras,boss_on,contract_mode,total_amount,deposit_amount,balance_amount,work_done_at,assignments(*)').gte('job_date', H.ymd(from)).lte('job_date', H.ymd(to)).order('job_date')))
    .filter(j => j.status !== 'cancelled' && j.status !== 'quote');
  // 1109: 이 달에 받은 예약금 (받은 날 기준 — 대표님 공식: 예약금 + 잔금 − 인건비)
  P.mDeps = H.S.owner ? await H.q(sb.from('jobs').select('id,deposit_amount,kind').eq('deposit_paid', true).neq('status', 'cancelled')
    .gte('deposit_paid_at', H.ymd(base) + 'T00:00:00+09:00').lte('deposit_paid_at', H.ymd(to === T ? T : m1) + 'T23:59:59+09:00')).catch(() => null) : null;
}
const grp = p => p.s.ext ? 2 : p.s.team === 'PRT' ? 1 : 0;
function monthRows(){
  const by = {}, cur = P.mKeys[2];
  P.mJobs.forEach(j => { const ym = String(j.job_date).slice(0, 7);
    (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => { const s = H.P(a.staff_id); if (s.team === 'RES' || s.name === '?') return;
      const p = by[s.id] = by[s.id] || {s, items: []}; p.items.push({j, ym, g: baseOf(s, a) + (+a.extra_amount||0), paid: !!a.paid, set: a.pay_amount != null}); });
    H.helpers(j).forEach(x => { const k = 'h:' + x.name + (x.phone||''); const p = by[k] = by[k] || {s: {name: x.name, ext: true, pay_type: 'none'}, items: []};
      p.items.push({j, ym, g: (+x.pay||0) + (+x.extra||0), paid: !!x.paid, set: x.pay != null}); }); });
  return Object.values(by).map(p => { const pt = p.s.ext ? 'none' : p.s.pay_type, D = (g, n) => pt === 'salary' ? 0 : H.deduct(pt, g, n);
    const netOf = arr => { const g = arr.reduce((a,i) => a + i.g, 0); return g - D(g, arr.length); };
    const mon = P.mKeys.map(k => { const it = p.items.filter(i => i.ym === k); return {k, n: it.length, net: netOf(it)}; });
    const ci = p.items.filter(i => i.ym === cur);
    // 이번 달(진행 중)은 전월 '같은 날짜까지'와 비교 — 월초에 무조건 ▼로 나오지 않게
    const dd = new Date().getDate(), prevSame = P.mOff === 0 ? netOf(p.items.filter(i => i.ym === P.mKeys[1] && +String(i.j.job_date).slice(8, 10) <= dd)) : mon[1].net;
    return Object.assign(p, {prevSame, cur: ci, mon, n: ci.length, net: netOf(ci), sent: netOf(ci.filter(i => i.paid)), left: netOf(ci.filter(i => !i.paid))}); })
    .filter(p => p.mon.some(m => m.n))
    .sort((a,b) => grp(a) - grp(b) || b.net - a.net || b.mon[1].net - a.mon[1].net);   // 직영·지원 → 도급 → 외부, 그 안에서 많이 받은 순
}
// 1107: 대표님도 현장 뛴 건 직원처럼 — 대표님 몫 = 잔금 − 그 현장 직원 지급액 (보낼 돈엔 안 들어감)
const share = j => { if (!j.boss_on || j.contract_mode) return 0;
  const bal = j.balance_amount != null ? +j.balance_amount : Math.max(0, (+j.total_amount||0) - (+j.deposit_amount||0));
  const lab = (j.assignments||[]).filter(a => a.status === 'approved').reduce((n,a) => n + baseOf(H.P(a.staff_id), a) + (+a.extra_amount||0), 0)
    + H.helpers(j).reduce((n,x) => n + (+x.pay||0) + (+x.extra||0), 0);
  return bal - lab; };   // 1108: 인건비가 잔금보다 많으면 마이너스 그대로
// 1108: 오늘 현장 수익 = 잔금 + 추가금 − 페이백 − 인건비 (대표님이 안 간 현장도 · 도급 제외 · 마이너스 그대로)
const dayNet = j => { if (j.contract_mode || ['cancelled','quote'].includes(j.status)) return 0;
  const bal = j.balance_amount != null ? +j.balance_amount : Math.max(0, (+j.total_amount||0) - (+j.deposit_amount||0));
  const lab = (j.assignments||[]).filter(a => a.status === 'approved').reduce((n,a) => n + baseOf(H.P(a.staff_id), a) + (+a.extra_amount||0), 0)
    + H.helpers(j).reduce((n,x) => n + (+x.pay||0) + (+x.extra||0), 0);
  return bal + H.extrasSum(j) - H.refundSum(j) - lab; };
function bossRow(){
  const items = P.mJobs.filter(j => j.boss_on && !j.contract_mode).map(j => ({j, ym: String(j.job_date).slice(0, 7), g: share(j)}));
  if (!items.length) return null;
  const mon = P.mKeys.map(k => { const it = items.filter(i => i.ym === k); return {k, n: it.length, net: it.reduce((a,i) => a + i.g, 0)}; });
  const cur = items.filter(i => i.ym === P.mKeys[2]);
  // 1108: 청소 순수익 (끝난 현장 · 오늘까지) = 매출 − 직원 임금 · 용달 빼고
  const cj = P.mJobs.filter(j => String(j.job_date).slice(0, 7) === P.mKeys[2] && (j.status === 'done' || j.work_done_at));   // 1109: 용달 포함
  // 1109: 대표님 공식 = 이 달 받은 예약금 + (끝난 현장 잔금 − 인건비) — '오늘 내 수익'을 하루하루 더한 것과 같음
  const dps = (P.mDeps||[]), dep = dps.reduce((a,j) => a + (+j.deposit_amount||0), 0);
  const site = cj.reduce((a,j) => a + dayNet(j), 0);
  return {mon, cur, n: cur.length, net: mon[2].net, clean: {n: cj.length, dep, depN: dps.length, site, net: dep + site, jobs: cj, deps: dps}};
}
function monthBox(){
  const rs = monthRows(), tot = k => rs.reduce((a,r) => a + r[k], 0), tag = s => s.ext ? '외부지원' : (lvOf(s) || s.role || '');
  const ml = k => +k.slice(5) + '월', man = v => v >= 10000 ? (Math.round(v / 1000) / 10).toLocaleString() + '만' : won(v);
  const totM = P.mKeys.map((k, i) => rs.reduce((a,r) => a + r.mon[i].net, 0)), diff = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  const dTot = diff(totM[2], rs.reduce((a,r) => a + r.prevSame, 0));
  const chg = d => d == null ? '<span class="pd z">새로</span>' : d === 0 ? '<span class="pd z">±0%</span>' : `<span class="pd ${d > 0 ? 'u' : 'd'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%</span>`;
  return `<section class="pm"><div class="pm-hd"><button class="pm-nav" data-a="pyMon" data-n="-1">‹</button><div><b>📒 ${P.mLabel||''}월 직원별 정산</b><small>${P.mOff ? '그 달 전체 · ▲▼ 전월 대비' : `오늘(${new Date().getDate()}일)까지 · ▲▼ 전월 같은 기간 대비`}</small></div><button class="pm-nav" data-a="pyMon" data-n="1" ${P.mOff >= 0 ? 'disabled' : ''}>›</button></div>
    <div class="pm-k"><div><span>지급 총액</span><b>${won(totM[2])}</b>${chg(dTot)}</div><div><span>입금 완료</span><b class="g">${won(tot('sent'))}</b></div><div class="${tot('left') > 0 ? 'w' : ''}"><span>남은 돈</span><b>${won(tot('left'))}</b></div></div>
    ${(() => { const b = bossRow(); if (!b) return ''; const mx = Math.max(1, ...b.mon.map(m => m.net)), op = P.mOpen.__boss;
      return `<div class="pm-list"><div class="pm-g">대표님 (보낼 돈엔 안 들어가요)</div><div class="pm-c">
        <button class="pm-top" data-a="pyMonOpen" data-k="__boss"><span class="av">${esc((H.S.name||'대표').slice(-2))}</span>
          <span class="nm"><b>${esc(H.S.name||'대표')}</b><small>대표 · 현장 뛴 몫</small></span><span class="am"><b>${won(b.net)}</b></span></button>
        <div class="pm-3">${b.mon.map((m, i) => `<div class="${i === 2 ? 'on' : ''}"><i style="height:${Math.max(4, Math.round(m.net / mx * 100))}%"></i><b>${m.net ? man(m.net) : '-'}</b><small>${ml(m.k)} · ${m.n}곳</small></div>`).join('')}</div>
        <div class="pm-cn" data-a="pyMonOpen" data-k="__net" role="button" style="cursor:pointer"><span>현장 순수익 <small>(청소+용달 · 끝난 ${b.clean.n}현장 · ${P.mOff ? '그 달' : '오늘까지'})</small></span><b>${won(b.clean.net)}</b><small>예약금 ${won(b.clean.dep)} (${b.clean.depN}건) · 현장 ${won(b.clean.site)} · 외주·운영비는 경영 탭 · ${P.mOpen.__net ? '접기 ▴' : '현장별 ▾'}</small></div>
        ${P.mOpen.__net ? `<div class="pm-nl">${b.clean.jobs.slice().sort((x,y)=>String(x.job_date).localeCompare(y.job_date)).map(j => { const bal = j.balance_amount != null ? +j.balance_amount : Math.max(0, (+j.total_amount||0) - (+j.deposit_amount||0)), n = dayNet(j);
            return `<div><span>${md(j.job_date)} ${esc(String(j.title||'').slice(0,18))}${j.contract_mode?' (도급·안 셈)':''}</span><em>잔금 ${won(bal + H.extrasSum(j))} − 인건비 ${won(bal + H.extrasSum(j) - n)}</em><b class="${n<0?'neg':''}">${won(n)}</b></div>`; }).join('') || '<p class="note">끝난 현장이 없어요</p>'}
          <div class="tot"><span>예약금 (이 달 받은 날 기준 ${b.clean.depN}건)</span><b>${won(b.clean.dep)}</b></div></div>` : ''}
        <div class="pm-st"><span>잔금 − 직원 지급액 · 예약금은 회사 몫</span><button class="lk" data-a="pyMonOpen" data-k="__boss">${op ? '접기 ▴' : '현장별 ▾'}</button></div>
        ${op ? `<div class="pm-det">${b.cur.map(it => `<div><span>${md(it.j.job_date)} ${esc(it.j.title||'')}</span><span>${won(it.g)}</span></div>`).join('') || '<div><span>이 달 현장 없음</span></div>'}</div>` : ''}</div></div>`; })()}
    <div class="pm-list">${rs.map((r, ri) => { const gh = ri === 0 || grp(rs[ri-1]) !== grp(r) ? `<div class="pm-g">${['직영 · 지원', '도급', '외부지원'][grp(r)]}</div>` : ''; const k = r.s.id || r.s.name, op = P.mOpen[k], mx = Math.max(1, ...r.mon.map(m => m.net)), d = diff(r.mon[2].net, r.prevSame);
      return gh + `<div class="pm-c ${r.left > 0 ? 'due' : ''}">
        <button class="pm-top" data-a="pyMonOpen" data-k="${esc(k)}"><span class="av">${esc(r.s.name.length >= 3 ? r.s.name.slice(1) : r.s.name)}</span>
          <span class="nm"><b>${esc(r.s.name)}</b><small>${esc(tag(r.s))}</small></span>
          <span class="am"><b>${won(r.net)}</b>${chg(r.prevSame || r.mon[2].net ? d : 0)}</span></button>
        <div class="pm-3">${r.mon.map((m, i) => `<div class="${i === 2 ? 'on' : ''}"><i style="height:${Math.max(4, Math.round(m.net / mx * 100))}%"></i><b>${m.net ? man(m.net) : '-'}</b><small>${ml(m.k)} · ${m.n}곳</small></div>`).join('')}</div>
        <div class="pm-st">${r.n ? (r.left > 0 ? `<span class="due">남은 돈 ${won(r.left)}</span><span>보냄 ${won(r.sent)}</span>` : '<span class="ok">✓ 다 보냄</span>') : `<span>${ml(P.mKeys[2])} 현장 없음</span>`}<button class="lk" data-a="pyMonOpen" data-k="${esc(k)}">${op ? '접기 ▴' : '현장별 ▾'}</button></div>
        ${op ? `<div class="pm-det">${r.cur.map(it => `<div><span>${md(it.j.job_date)} ${esc(it.j.title||'')}</span><span>${won(it.g)}${it.set ? '' : ' <small>레벨</small>'} ${it.paid ? '<b class="ok">✓</b>' : '<b class="no">·</b>'}</span></div>`).join('') || '<div><span>이 달 현장 없음</span></div>'}
          ${r.s.ext ? '' : `<p>공제 전 금액 · ${esc(H.PT[r.s.pay_type] || '')} 공제는 달 합계에서</p>`}</div>` : ''}</div>`; }).join('') || '<p class="empty">이 기간 정산할 현장이 없어요</p>'}</div>
    <p class="note">현장 지급액(안 넣었으면 레벨 금액) − 공제 · 막대 = 최근 3달 실지급 · ▲▼ = 전월 대비 (이번 달은 같은 날짜까지끼리) · 직원 폰 '나 › 내 수입'과 같은 기준</p></section>`;
}
async function load(d){
  P.d = d;
  P.jobs = (await H.q(sb.from('jobs').select('*, assignments(*)').eq('job_date', d).order('start_time')))
    .filter(j => j.status !== 'cancelled' && j.status !== 'quote');
  const ids = new Set(); P.jobs.forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => ids.add(a.staff_id)));
  if (H.loadAccts) await H.loadAccts([...ids]).catch(() => {});
  P.pays = H.S.needV9 ? [] : await H.q(sb.from('payouts').select('*').eq('paid_on', d).eq('void', false)).catch(() => []);
  // 1107: 그날 받은 예약금 (받은 날 기준 — SQL 안 돌렸으면 null)
  P.deps = H.S.owner ? await H.q(sb.from('jobs').select('id,deposit_amount').eq('deposit_paid', true).neq('status', 'cancelled')
    .gte('deposit_paid_at', d + 'T00:00:00+09:00').lte('deposit_paid_at', d + 'T23:59:59+09:00')).catch(() => null) : null;
}
function people(){
  const by = {};
  P.jobs.forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => {
    const s = H.P(a.staff_id); if (s.team === 'RES') return;
    const p = by[a.staff_id] = by[a.staff_id] || {s, items: [], base: 0, extra: 0, paid: true};
    const b = baseOf(s, a), x = +a.extra_amount || 0;
    p.items.push({j, a, b, x}); p.base += b; p.extra += x; if (!a.paid) p.paid = false; }));
  const st = Object.values(by).map(p => { const gross = p.base + p.extra, ded = p.s.pay_type === 'salary' ? 0 : H.deduct(p.s.pay_type, gross, 1);
    const sent = P.pays.filter(x => x.staff_id === p.s.id).reduce((a,x) => a + x.amount, 0);
    return Object.assign(p, {gross, ded, net: gross - ded, sent, done: p.paid || (sent && sent >= gross - ded)}); });
  return st.concat(extPeople())
    .sort((a,b) => a.done - b.done || b.net - a.net);
}

// 외부지원(일용직): 현장마다 따로 한 줄 · 공제 없이 그대로 · 입금 완료는 현장 기록(helpers.paid)에 남김
function extPeople(){ const out = [];
  P.jobs.forEach(j => H.helpers(j).forEach(x => { const b = +x.pay || 0, e = +x.extra || 0;
    out.push({s: {id: `h_${j.id}_${x.id}`, name: x.name, ext: true, src: x.src, phone: x.phone}, hj: j, hx: x, items: [{j, b, x: e}], base: b, extra: e,
      gross: b + e, ded: 0, net: b + e, sent: 0, paid: !!x.paid, done: !!x.paid, miss: x.pay == null}); }));
  return out; }
// 홈 요약용: 그 날 현장 직원별 보낼 돈 (jobs = assignments 포함)
H.paySummary = jobs => { const by = {};
  (jobs||[]).filter(j => j.status !== 'cancelled' && j.status !== 'quote').forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => {
    const s = H.P(a.staff_id); if (s.team === 'RES') return; const p = by[a.staff_id] = by[a.staff_id] || {s, g: 0, paid: true, done: true};
    p.g += baseOf(s, a) + (+a.extra_amount || 0); if (!a.paid) p.paid = false; if (!(j.work_done_at || j.done_at || j.status === 'done')) p.done = false; }));
  (jobs||[]).filter(j => j.status !== 'cancelled' && j.status !== 'quote').forEach(j => H.helpers(j).forEach(x => {
    by['h_' + j.id + '_' + x.id] = {s: {name: x.name, ext: true}, g: (+x.pay||0) + (+x.extra||0), ext: true, paid: !!x.paid, done: !!(j.work_done_at || j.done_at || j.status === 'done')}; }));
  const ps = Object.values(by).map(p => Object.assign(p, {net: p.ext ? p.g : p.g - (p.s.pay_type === 'salary' ? 0 : H.deduct(p.s.pay_type, p.g, 1))}));
  return {n: ps.length, left: ps.filter(p => !p.paid), net: ps.filter(p => !p.paid).reduce((a,p) => a + p.net, 0), notDone: ps.filter(p => !p.done).length, paidN: ps.filter(p => p.paid).length};
};
H.payDate = d => { P.d = d; };
H.view('pay', {label:'정산', owner:true,
  async load(){ await Promise.all([load(P.d || H.ymd(new Date())), loadMonth().catch(() => { P.mJobs = []; })]); },
  render(){
    const ps = people(), left = ps.filter(p => !p.done), d = P.d, today = d === H.ymd(new Date());
    const bal = P.jobs.map(j => { const rev = H.jobRevenue(j), dep = +j.deposit_amount||0, b = j.balance_amount != null ? +j.balance_amount : Math.max(0, rev - dep); return {j, b, got: !!j.collected_at || !b}; });
    const wait = bal.filter(x => !x.got);
    return `<div class="pay-m">
      <div class="pay-top"><button class="btn ghost sm" data-a="pyDay" data-n="-1">‹</button><b>${md(d)}${today ? ' 오늘' : ''} 정산</b><button class="btn ghost sm" data-a="pyDay" data-n="1">›</button></div>
      <div class="pay-sum"><div><span>남은 입금</span><b>${left.length}명</b></div><div><span>보낼 돈</span><b>${won(left.reduce((a,p) => a + p.net, 0))}</b></div><div class="${wait.length?'w':''}"><span>잔금 수금</span><b>${wait.length ? '대기 ' + wait.length : '완료'}</b></div>${H.S.owner ? (() => { const dep = (P.deps||[]).reduce((n,j) => n + (+j.deposit_amount||0), 0), sh = P.jobs.reduce((n,j) => n + dayNet(j), 0);
          return `<div class="me"><span>오늘 내 수익</span><b>${won(dep + sh)}</b><small>예약금 ${won(dep)}${P.deps ? ` (${P.deps.length}건)` : ''} · 현장 ${sh < 0 ? '<i style="font-style:normal;color:#FCA5A5;font-weight:700">' + won(sh) + '</i>' : won(sh)}</small></div>`; })() : ''}</div>
      ${wait.length ? `<div class="pay-warn">수금 대기: ${wait.map(x => esc(x.j.title||'')).join(', ')}</div>` : ''}
      ${ps.map(p => { const a = (H.S.accts||{})[p.s.id] || {}, op = P.open[p.s.id];
        return `<div class="pay-card ${p.done?'done':''}">
          <div class="pay-h"><div><b>${esc(p.s.name)}</b> <small>${p.s.ext ? `<span class="who ext" style="font-size:11px">외부지원</span>${p.s.src ? ' ' + esc(p.s.src) : ''}` : esc(lvOf(p.s) || p.s.role || '')}</small><div class="pay-sub">${p.items.map(i => esc(i.j.title||'현장')).join(' · ')}</div></div>
            <div class="pay-net"><b>${won(p.net)}</b><small>${p.miss ? '<span style="color:#B91C1C">금액 미입력</span>' : p.ded ? `${H.PT[p.s.pay_type]} −${won(p.ded)}` : '공제 없음'}</small></div></div>
          <div class="pay-line"><span>기본 ${won(p.base)}${p.extra ? ` · <b style="color:#15803D">+α ${won(p.extra)}</b>` : ''}</span>
            ${p.done || p.s.ext ? '' : `<span class="pay-alpha">${[5000,10000,20000].map(v => `<button data-a="pyAlpha" data-s="${p.s.id}" data-v="${v}">+${v/10000}만</button>`).join('')}<button data-a="pyAlpha" data-s="${p.s.id}" data-v="ask">직접</button>${p.extra ? `<button data-a="pyAlpha" data-s="${p.s.id}" data-v="0">α 0</button>` : ''}</span>`}</div>
          <div class="pay-act">${p.s.ext ? (p.miss ? '<span class="note">일정판 › 현장 › 당일 마감에서 금액 넣기</span>' : p.s.phone ? `<a class="btn ghost" href="tel:${esc(String(p.s.phone).replace(/[^0-9]/g,''))}">📞 ${esc(p.s.phone)}</a>` : '<span class="note">외부지원 · 계좌는 직접</span>') : a.acct ? `<button class="btn ghost" data-a="acctCopy" data-s="${p.s.id}">📋 ${esc(a.bank||'')} ${esc(String(a.acct).slice(-4))}</button>` : '<span class="note">계좌 미입력 · 인사카드에서 넣기</span>'}
            ${p.done ? `<span class="pill p-ok">입금 완료${p.sent ? ' ' + won(p.sent) : ''}</span>` : `<button class="btn" data-a="pyDone" data-s="${p.s.id}">입금 완료</button>`}</div>
          ${op && !p.s.ext ? `<div class="pay-det">${p.items.map(i => `<div><span>${esc(i.j.title||'')}</span><span>${won(i.b)}${i.x ? ' +' + won(i.x) : ''} <button class="link" data-a="pyBase" data-s="${p.s.id}" data-j="${i.j.id}">기본 수정</button></span></div>`).join('')}</div>` : ''}
          ${p.s.ext ? '' : `<button class="pay-more" data-a="pyOpen" data-s="${p.s.id}">${op ? '접기 ▴' : '현장별 ▾'}</button>`}</div>`; }).join('') || '<p class="empty">이날 지급할 직원이 없어요</p>'}
      <p class="note" style="margin-top:12px">기본 = 지급액을 넣었으면 그 금액, 안 넣었으면 레벨 금액 · 공제는 지급 방식대로 (3.3% · 일용직은 세무사 확인) · <a href="#" data-a="pyLevels">레벨 금액표</a></p>
      ${monthBox()}</div>`;
  }
});

const findA = (sid, jid) => { for (const j of P.jobs) if (!jid || j.id == jid) for (const a of (j.assignments||[])) if (a.staff_id === sid && a.status === 'approved') return {j, a}; return {}; };
H.ACT.pyDay = async el => { const d = new Date(P.d + 'T00:00:00'); d.setDate(d.getDate() + (+el.dataset.n)); await load(H.ymd(d)); H.render(); };
H.ACT.pyMon = async el => { P.mOff = Math.min(0, P.mOff + (+el.dataset.n)); P.mOpen = {}; await loadMonth(); H.render(); };
H.ACT.pyMonOpen = el => { P.mOpen[el.dataset.k] = !P.mOpen[el.dataset.k]; H.render(); };
H.ACT.pyOpen = el => { P.open[el.dataset.s] = !P.open[el.dataset.s]; H.render(); };
H.ACT.pyAlpha = async el => {
  const {j, a} = findA(el.dataset.s); if (!a) return;
  let v = el.dataset.v;
  if (v === 'ask') { const t = prompt('추가 금액 (원, 예: 15000 · 만원 단위면 1.5)'); if (!t) return; v = +String(t).replace(/[^0-9.]/g,''); if (v < 1000) v = Math.round(v * 10000); }
  const nx = v === '0' ? 0 : (+a.extra_amount || 0) + (+v);
  await H.q(sb.from('assignments').update({extra_amount: nx}).match({job_id: j.id, staff_id: el.dataset.s}));
  a.extra_amount = nx; H._dirty = Date.now(); H.render();
};
H.ACT.pyBase = async el => {
  const {j, a} = findA(el.dataset.s, el.dataset.j); if (!a) return;
  const t = prompt('이 현장 기본 지급액 (원)', baseOf(H.P(el.dataset.s), a)); if (t == null) return;
  const v = +String(t).replace(/[^0-9]/g,''); await H.q(sb.from('assignments').update({pay_amount: v}).match({job_id: j.id, staff_id: el.dataset.s}));
  a.pay_amount = v; H._dirty = Date.now(); H.render();
};
H.ACT.pyDone = async el => {
  const p = people().find(x => x.s.id === el.dataset.s); if (!p) return;
  if (!confirm(`${p.s.name}님께 ${won(p.net)}원 입금하셨어요?`)) return;
  if (p.s.ext) {   // 외부지원: 현장 기록에 '지급 완료'만 남김 (직원 1:1·입금 기록 없음)
    const j = p.hj, list = H.helpers(j).map(x => x.id === p.hx.id ? Object.assign({}, x, {pay: p.base, paid: true, paid_at: new Date().toISOString()}) : x);
    await H.q(sb.from('jobs').update({helpers: list}).eq('id', j.id));
    H._dirty = Date.now(); H.toast(`외부지원 ${p.s.name}님 입금 완료 기록`); await load(P.d); H.render(); return;
  }
  for (const i of p.items) await H.q(sb.from('assignments').update({pay_amount: i.b, paid: true}).match({job_id: i.j.id, staff_id: p.s.id}));
  await H.payNotify(p.s.id, p.net, P.d, P.d === H.ymd(new Date()) ? '' : `${md(P.d)} 정산`);
  H._dirty = Date.now();   // 홈·다른 화면이 예전 데이터로 '안 눌렀다'고 뜨지 않게
  H.toast(`${p.s.name}님 입금 완료 기록`); await load(P.d); await loadMonth().catch(() => {}); H.render();
};
H.ACT.pyLevels = el => { const lp = levelPay();
  H.open(`<form data-f="pyLevels"><h3>레벨별 현장당 기본 금액</h3><p class="note">현장 1건(4시간) 기준 · 지급액을 따로 넣은 현장은 그 금액이 우선</p>
    ${Object.keys(LEVEL_PAY_DEF).map(k => `<div class="field"><label>${k}</label><input type="number" step="5000" name="${k}" value="${lp[k]}"></div>`).join('')}${H.sacts('저장')}</form>`); };
H.FORM.pyLevels = async fd => { const o = {}; Object.keys(LEVEL_PAY_DEF).forEach(k => o[k] = +fd.get(k) || 0);
  await H.q(sb.from('settings').upsert({key:'level_pay', value:o})); H.S.settings.level_pay = o; H.close(); H.toast('레벨 금액표를 저장했어요'); H.render(); };
})(window.HQ);
