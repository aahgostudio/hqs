/* 💸 정산 (폰용 간단 화면) — 밖에서 바로 보고 바로 입금
   사람별: 기본(레벨 금액 또는 입력값) + 알파 → 공제(지급 방식) → 보낼 돈 · 계좌 복사 · [입금 완료]
   레벨 금액표는 settings 'level_pay' (없으면 기본값) */
(function(H){
const {esc, sb} = H, won = H.won;
const LEVEL_PAY_DEF = {'교육생':50000, '가정청소 팀원 (일반)':70000, '가정청소 팀원 (고정)':80000, '가정청소 팀장':90000, '상가청소 팀장':100000, '특수청소 팀장':120000};
const ROLE_LV = {'교육생':'교육생', '팀원':'가정청소 팀원 (일반)', '고정팀원':'가정청소 팀원 (고정)', '팀장':'가정청소 팀장', '상가팀장':'상가청소 팀장', '특수팀장':'특수청소 팀장'};
const P = {d: null, jobs: [], pays: [], open: {}}; H._payState = P;
const levelPay = () => Object.assign({}, LEVEL_PAY_DEF, (H.S.settings||{}).level_pay || {});
const lvOf = s => (((H.S.settings||{}).staff_hr||{})[s.id]||{}).level || ROLE_LV[s.role] || '';
const baseOf = (s, a) => a.pay_amount != null ? +a.pay_amount : (levelPay()[lvOf(s)] || 0);
const md = d => `${+d.slice(5,7)}/${+d.slice(8,10)}`;
const nick = s => s.name.length >= 3 ? s.name.slice(1) : s.name;

async function load(d){
  P.d = d;
  P.jobs = (await H.q(sb.from('jobs').select('*, assignments(*)').eq('job_date', d).order('start_time')))
    .filter(j => j.status !== 'cancelled' && j.status !== 'quote');
  const ids = new Set(); P.jobs.forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => ids.add(a.staff_id)));
  if (H.loadAccts) await H.loadAccts([...ids]).catch(() => {});
  P.pays = H.S.needV9 ? [] : await H.q(sb.from('payouts').select('*').eq('paid_on', d).eq('void', false)).catch(() => []);
}
function people(){
  const by = {};
  P.jobs.forEach(j => (j.assignments||[]).filter(a => a.status === 'approved').forEach(a => {
    const s = H.P(a.staff_id); if (s.team === 'RES') return;
    const p = by[a.staff_id] = by[a.staff_id] || {s, items: [], base: 0, extra: 0, paid: true};
    const b = baseOf(s, a), x = +a.extra_amount || 0;
    p.items.push({j, a, b, x}); p.base += b; p.extra += x; if (!a.paid) p.paid = false; }));
  return Object.values(by).map(p => { const gross = p.base + p.extra, ded = p.s.pay_type === 'salary' ? 0 : H.deduct(p.s.pay_type, gross, 1);
    const sent = P.pays.filter(x => x.staff_id === p.s.id).reduce((a,x) => a + x.amount, 0);
    return Object.assign(p, {gross, ded, net: gross - ded, sent, done: p.paid || (sent && sent >= gross - ded)}); })
    .sort((a,b) => a.done - b.done || b.net - a.net);
}

H.view('pay', {label:'정산', owner:true,
  async load(){ await load(P.d || H.ymd(new Date())); },
  render(){
    const ps = people(), left = ps.filter(p => !p.done), d = P.d, today = d === H.ymd(new Date());
    const bal = P.jobs.map(j => { const rev = H.jobRevenue(j), dep = +j.deposit_amount||0, b = j.balance_amount != null ? +j.balance_amount : Math.max(0, rev - dep); return {j, b, got: !!j.collected_at || !b}; });
    const wait = bal.filter(x => !x.got);
    return `<div class="pay-m">
      <div class="pay-top"><button class="btn ghost sm" data-a="pyDay" data-n="-1">‹</button><b>${md(d)}${today ? ' 오늘' : ''} 정산</b><button class="btn ghost sm" data-a="pyDay" data-n="1">›</button></div>
      <div class="pay-sum"><div><span>남은 입금</span><b>${left.length}명</b></div><div><span>보낼 돈</span><b>${won(left.reduce((a,p) => a + p.net, 0))}</b></div><div class="${wait.length?'w':''}"><span>잔금 수금</span><b>${wait.length ? '대기 ' + wait.length : '완료'}</b></div></div>
      ${wait.length ? `<div class="pay-warn">수금 대기: ${wait.map(x => esc(x.j.title||'')).join(', ')}</div>` : ''}
      ${ps.map(p => { const a = (H.S.accts||{})[p.s.id] || {}, op = P.open[p.s.id];
        return `<div class="pay-card ${p.done?'done':''}">
          <div class="pay-h"><div><b>${esc(p.s.name)}</b> <small>${esc(lvOf(p.s) || p.s.role || '')}</small><div class="pay-sub">${p.items.map(i => esc(i.j.title||'현장')).join(' · ')}</div></div>
            <div class="pay-net"><b>${won(p.net)}</b><small>${p.ded ? `${H.PT[p.s.pay_type]} −${won(p.ded)}` : '공제 없음'}</small></div></div>
          <div class="pay-line"><span>기본 ${won(p.base)}${p.extra ? ` · <b style="color:#15803D">+α ${won(p.extra)}</b>` : ''}</span>
            ${p.done ? '' : `<span class="pay-alpha">${[5000,10000,20000].map(v => `<button data-a="pyAlpha" data-s="${p.s.id}" data-v="${v}">+${v/10000}만</button>`).join('')}<button data-a="pyAlpha" data-s="${p.s.id}" data-v="ask">직접</button>${p.extra ? `<button data-a="pyAlpha" data-s="${p.s.id}" data-v="0">α 0</button>` : ''}</span>`}</div>
          <div class="pay-act">${a.acct ? `<button class="btn ghost" data-a="acctCopy" data-s="${p.s.id}">📋 ${esc(a.bank||'')} ${esc(String(a.acct).slice(-4))}</button>` : '<span class="note">계좌 미입력 · 인사카드에서 넣기</span>'}
            ${p.done ? `<span class="pill p-ok">입금 완료${p.sent ? ' ' + won(p.sent) : ''}</span>` : `<button class="btn" data-a="pyDone" data-s="${p.s.id}">입금 완료</button>`}</div>
          ${op ? `<div class="pay-det">${p.items.map(i => `<div><span>${esc(i.j.title||'')}</span><span>${won(i.b)}${i.x ? ' +' + won(i.x) : ''} <button class="link" data-a="pyBase" data-s="${p.s.id}" data-j="${i.j.id}">기본 수정</button></span></div>`).join('')}</div>` : ''}
          <button class="pay-more" data-a="pyOpen" data-s="${p.s.id}">${op ? '접기 ▴' : '현장별 ▾'}</button></div>`; }).join('') || '<p class="empty">이날 지급할 직원이 없어요</p>'}
      <p class="note" style="margin-top:12px">기본 = 지급액을 넣었으면 그 금액, 안 넣었으면 레벨 금액 · 공제는 지급 방식대로 (3.3% · 일용직은 세무사 확인) · <a href="#" data-a="pyLevels">레벨 금액표</a></p></div>`;
  }
});

const findA = (sid, jid) => { for (const j of P.jobs) if (!jid || j.id == jid) for (const a of (j.assignments||[])) if (a.staff_id === sid && a.status === 'approved') return {j, a}; return {}; };
H.ACT.pyDay = async el => { const d = new Date(P.d + 'T00:00:00'); d.setDate(d.getDate() + (+el.dataset.n)); await load(H.ymd(d)); H.render(); };
H.ACT.pyOpen = el => { P.open[el.dataset.s] = !P.open[el.dataset.s]; H.render(); };
H.ACT.pyAlpha = async el => {
  const {j, a} = findA(el.dataset.s); if (!a) return;
  let v = el.dataset.v;
  if (v === 'ask') { const t = prompt('추가 금액 (원, 예: 15000 · 만원 단위면 1.5)'); if (!t) return; v = +String(t).replace(/[^0-9.]/g,''); if (v < 1000) v = Math.round(v * 10000); }
  const nx = v === '0' ? 0 : (+a.extra_amount || 0) + (+v);
  await H.q(sb.from('assignments').update({extra_amount: nx}).match({job_id: j.id, staff_id: el.dataset.s}));
  a.extra_amount = nx; H.render();
};
H.ACT.pyBase = async el => {
  const {j, a} = findA(el.dataset.s, el.dataset.j); if (!a) return;
  const t = prompt('이 현장 기본 지급액 (원)', baseOf(H.P(el.dataset.s), a)); if (t == null) return;
  const v = +String(t).replace(/[^0-9]/g,''); await H.q(sb.from('assignments').update({pay_amount: v}).match({job_id: j.id, staff_id: el.dataset.s}));
  a.pay_amount = v; H.render();
};
H.ACT.pyDone = async el => {
  const p = people().find(x => x.s.id === el.dataset.s); if (!p) return;
  if (!confirm(`${p.s.name}님께 ${won(p.net)}원 입금하셨어요?`)) return;
  for (const i of p.items) await H.q(sb.from('assignments').update({pay_amount: i.b, paid: true}).match({job_id: i.j.id, staff_id: p.s.id}));
  if (!H.S.needV9) {
    let sentViaChat = false;
    try { const on = await sb.from('settings').select('value').eq('key','chat_on').maybeSingle();
      if (on.data && String(on.data.value) === 'true' && P.d === H.ymd(new Date())) {
        const dm = await sb.from('chat_rooms').select('id').eq('kind','dm').eq('staff_id', p.s.id).maybeSingle();
        if (dm.data) { const n = p.net % 10000 === 0 ? String(p.net / 10000) : won(p.net) + '원';
          const {error} = await sb.rpc('chat_admin_send', {p_room: dm.data.id, p_body: `${nick(p.s)}님 ${n} 넣었어요\n고맙습니다`, p_photo: null}); if (!error) sentViaChat = true; } } } catch(_){}
    if (!sentViaChat) await H.q(sb.from('payouts').insert({staff_id: p.s.id, amount: p.net, paid_on: P.d, source: 'manual', body: `${md(P.d)} 정산`}));
  }
  H.toast(`${p.s.name}님 입금 완료 기록`); await load(P.d); H.render();
};
H.ACT.pyLevels = el => { const lp = levelPay();
  H.open(`<form data-f="pyLevels"><h3>레벨별 현장당 기본 금액</h3><p class="note">현장 1건(4시간) 기준 · 지급액을 따로 넣은 현장은 그 금액이 우선</p>
    ${Object.keys(LEVEL_PAY_DEF).map(k => `<div class="field"><label>${k}</label><input type="number" step="5000" name="${k}" value="${lp[k]}"></div>`).join('')}${H.sacts('저장')}</form>`); };
H.FORM.pyLevels = async fd => { const o = {}; Object.keys(LEVEL_PAY_DEF).forEach(k => o[k] = +fd.get(k) || 0);
  await H.q(sb.from('settings').upsert({key:'level_pay', value:o})); H.S.settings.level_pay = o; H.close(); H.toast('레벨 금액표를 저장했어요'); H.render(); };
})(window.HQ);
