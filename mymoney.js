/* 어닝플레이스 · 직원 '내 돈' (공용) — 번 돈 · 받은 돈 · 아직 안 받은 돈
   사용: EPMoney.init({token, demo, onChange}) → EPMoney.html()  */
(function(){
  const C = window.EP_CONFIG || {};
  const URL_ = C.SUPABASE_URL || 'https://ldvknvmsnpbporxhnsli.supabase.co';
  const KEY_ = C.SUPABASE_KEY || 'sb_publishable_7MeTgyPzwzK47RKG-mUapQ_K5ngrTw5';
  const H = {apikey: KEY_, Authorization: 'Bearer ' + KEY_};
  const won = n => (Math.round(+n||0)).toLocaleString('ko-KR');
  let opt = {token:'', demo:false, onChange:()=>{}}, D = null, open = false;
  const DEMO = {team:'OPS', pay_type:'freelance33', since:'2026-09-01', net_all:812800, received_all:735400, due:77400,
    months:[{ym:'2026-11', n:11, gross:840000, ded:27720, net:812280, received:735400},{ym:'2026-10', n:15, gross:1190000, ded:39270, net:1150730, received:1150730},{ym:'2026-09', n:12, gross:950000, ded:31350, net:918650, received:918650}],
    recent:[{date:'2026-11-12', amount:70000},{date:'2026-11-11', amount:90000},{date:'2026-11-08', amount:77360}]};
  const DEMO_RES = {team:'RES', pay_type:'freelance33', since:'2026-09-01', net_all:2320800, received_all:0, due:2320800,
    months:[{ym:'2026-11', n:3, gross:2400000, ded:79200, net:2320800, received:0},{ym:'2026-10', n:4, gross:3200000, ded:105600, net:3094400, received:3094400},{ym:'2026-09', n:2, gross:1600000, ded:52800, net:1547200, received:1547200}],
    recent:[{date:'2026-11-10', amount:3094400},{date:'2026-10-10', amount:1547200}]};
  async function load(){
    if (opt.demo) { D = opt.demoTeam === 'RES' ? DEMO_RES : DEMO; return opt.onChange(); }
    if (!opt.token) return;
    try { const r = await fetch(`${URL_}/rest/v1/rpc/staff_money`, {method:'POST', headers:Object.assign({'content-type':'application/json'}, H), body:JSON.stringify({p_token: opt.token})});
      if (!r.ok) return; D = await r.json(); opt.onChange(); } catch(_){}
  }
  function css(){ if (document.getElementById('epm-css')) return; const s = document.createElement('style'); s.id = 'epm-css';
    s.textContent = `.epm{border:1px solid var(--line,#E3E7F0);border-radius:16px;padding:14px;background:var(--card,#fff);margin:6px 0 4px}
.epm-k{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.epm-k div{border-radius:12px;padding:10px;background:var(--soft,var(--sunk,#F4F6FB))}
.epm-k span{display:block;font-size:11.5px;opacity:.7}.epm-k b{display:block;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:2px}
.epm-k .due b{color:#B45309}.epm-k .ok b{color:#15803D}
.epm p{font-size:11.5px;opacity:.6;margin:8px 0 0;line-height:1.5}
.epm-pg{margin-top:14px;padding-top:12px;border-top:1px dashed var(--line,#E3E7F0)}.epm-pg .t{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px}
.epm-bar{height:10px;border-radius:99px;background:var(--soft,var(--sunk,#EEF1F7));overflow:hidden}.epm-bar i{display:block !important;height:100%;max-width:none;border-radius:99px;background:var(--navy,var(--accent,#16347A))}
.epm-m3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.epm-m3 div{text-align:center}.epm-m3 .epm-col{height:64px;display:flex;align-items:flex-end;justify-content:center}
.epm-m3 .epm-col i{width:32px;border-radius:8px 8px 3px 3px;background:var(--navy,var(--accent,#16347A));opacity:.25}.epm-m3 .cur .epm-col i{opacity:1}
.epm-m3 b{display:block;font-size:13px;margin-top:6px}.epm-m3 span{display:block;font-size:11px;opacity:.6}
.epm-list{margin-top:6px}.epm-list div{display:flex;justify-content:space-between;font-size:12.5px;padding:7px 0;border-bottom:1px solid var(--line,#EEF1F7)}.epm-list div:last-child{border:0}
@media (min-width:760px){.epm{display:grid;grid-template-columns:1.5fr 1fr;column-gap:22px;align-items:start}.epm-k{grid-column:1}.epm-pg{grid-column:1;border-top:0;padding-top:0}.epm-m3{grid-column:2;grid-row:1 / span 2;margin-top:0;align-self:stretch;align-items:end;border-left:1px dashed var(--line,#E3E7F0);padding-left:18px}.epm-f,.epm-list,.epm p{grid-column:1 / -1}}
.epm-f{display:flex;align-items:center;justify-content:space-between;margin-top:10px}.epm-f i{font-style:normal;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:99px;background:var(--soft,var(--sunk,#F4F6FB));margin-right:5px;opacity:.85}
.epm button.epm-more{border:0;background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:4px 0;cursor:pointer;opacity:.75}
.epm table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}.epm td,.epm th{padding:5px 2px;border-bottom:1px solid var(--line,#E3E7F0);text-align:right;font-variant-numeric:tabular-nums}.epm th{font-weight:600;opacity:.7}.epm td:first-child,.epm th:first-child{text-align:left}`;
    document.head.appendChild(s); }
  function html(){
    if (!D) return '';
    css(); const cur = (D.months||[])[0] || {}, ms = (D.months||[]).filter(m => m.n || m.received);
    const PT = {freelance33:'3.3% 공제', daily:'일용직 (하루 15만원 넘는 부분만 공제)', none:'공제 없음', contract:'도급 (공제 없음)'}[D.pay_type] || '';
    if (D.pay_type === 'salary') return `<div class="epm"><div class="epm-k">
        <div><span>이번 달 근무</span><b>${cur.n||0}<small style="font-size:12px;font-weight:600"> ${D.team==='RES'?'건':'현장'}</small></b></div>
        <div class="ok"><span>이번 달 받은 급여</span><b>${won(cur.received)}</b></div>
        <div><span>지난달 근무</span><b>${((D.months||[])[1]||{}).n||0}</b></div></div>
      <div class="epm-f"><span><i>급여제</i><i>정해진 날 지급</i></span><button class="epm-more" type="button" data-epm="1">${open ? '접기 ▴' : '내역 ▾'}</button></div>
      ${open ? `<table><tr><th>월</th><th>근무</th><th></th><th>받은 돈</th></tr>${ms.map(m => `<tr><td>${+m.ym.slice(5)}월</td><td>${m.n}</td><td></td><td>${won(m.received)}</td></tr>`).join('') || '<tr><td colspan="4">아직 기록이 없어요</td></tr>'}</table>` : ''}
      </div>`;
    const chips = [PT.split(' (')[0], D.team === 'RES' ? '다음 달 10일 지급' : '마감 후 저녁 지급'].filter(Boolean);
    const unit = D.team === 'RES' ? '계약' : '현장', last = (D.months||[])[1] || {}, m3 = (D.months||[]).slice(0,3).reverse();
    const pct = last.n ? Math.round((cur.n||0) / last.n * 100) : null, mx = Math.max(1, ...m3.map(m => m.n||0));
    return `<div class="epm"><div class="epm-k">
        <div><span>이번 달 번 돈</span><b>${won(cur.net)}</b></div>
        <div class="ok"><span>받은 돈</span><b>${won(cur.received)}</b></div>
        <div class="${D.due > 0 ? 'due' : 'ok'}"><span>안 받은 돈</span><b>${won(D.due)}</b></div></div>
      <div class="epm-pg"><div class="t"><span>이번 달 <b>${cur.n||0}${unit}</b>${pct != null ? ' · 지난달의' : ''}</span><b>${pct != null ? pct + '%' : ''}</b></div>${pct != null ? `<div class="epm-bar"><i style="width:${Math.min(100, pct)}%"></i></div>` : ''}</div>
      <div class="epm-m3">${m3.map((m, i) => `<div class="${i === m3.length - 1 ? 'cur' : ''}"><div class="epm-col"><i style="height:${Math.max(8, Math.round((m.n||0) / mx * 100))}%"></i></div><b>${+m.ym.slice(5)}월</b><span>${m.n||0}${unit}</span></div>`).join('')}</div>
      <div class="epm-f"><span>${chips.map(c => `<i>${c}</i>`).join('')}</span><button class="epm-more" type="button" data-epm="1">${open ? '접기 ▴' : '입금 내역 ▾'}</button></div>
      ${open ? `<div class="epm-list">${(D.recent||[]).map(r => `<div><span>${String(r.date).slice(5).replace('-','/')} 입금</span><b>${won(r.amount)}</b></div>`).join('') || '<div><span>아직 입금 기록이 없어요</span></div>'}</div>
        <p>${D.team === 'RES' ? '계약 몫(배분율)' : '마감된 현장 지급액'}${D.pay_type==='none'||D.pay_type==='contract'?'':' − 공제'} 기준 · 금액이 다르면 대표님께 1:1로 말씀해주세요</p>` : ''}</div>`;
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-epm]')) { e.stopPropagation(); open = !open; opt.onChange(); } }, true);
  window.EPMoney = { init(o){ opt = Object.assign(opt, o||{}); load(); setInterval(() => { if (!document.hidden) load(); }, 300000); }, html, reload: load, get data(){ return D; } };
})();
