/* 어닝플레이스 · 직원 '내 돈' (공용) — 번 돈 · 받은 돈 · 아직 안 받은 돈
   사용: EPMoney.init({token, demo, onChange}) → EPMoney.html()  */
(function(){
  const C = window.EP_CONFIG || {};
  const URL_ = C.SUPABASE_URL || 'https://ldvknvmsnpbporxhnsli.supabase.co';
  const KEY_ = C.SUPABASE_KEY || 'sb_publishable_7MeTgyPzwzK47RKG-mUapQ_K5ngrTw5';
  const H = {apikey: KEY_, Authorization: 'Bearer ' + KEY_};
  const won = n => (Math.round(+n||0)).toLocaleString('ko-KR');
  let opt = {token:'', demo:false, onChange:()=>{}}, D = null, open = false;
  const DEMO = {team:'OPS', pay_type:'freelance33', since:'2026-11-01', payday:'현장 마감·수금 확인 후 저녁 지급', net_all:812800, received_all:735400, due:77400,
    months:[{ym:'2026-11', n:11, gross:840000, ded:27720, net:812280, received:735400}], recent:[{date:'2026-11-12', amount:70000},{date:'2026-11-11', amount:90000},{date:'2026-11-08', amount:77360}]};
  async function load(){
    if (opt.demo) { D = DEMO; return opt.onChange(); }
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
.epm p{font-size:12px;opacity:.7;margin:8px 0 0;line-height:1.5}
.epm button.epm-more{border:0;background:none;color:inherit;font:inherit;font-size:12.5px;text-decoration:underline;padding:6px 0 0;cursor:pointer;opacity:.8}
.epm table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}.epm td,.epm th{padding:5px 2px;border-bottom:1px solid var(--line,#E3E7F0);text-align:right;font-variant-numeric:tabular-nums}.epm th{font-weight:600;opacity:.7}.epm td:first-child,.epm th:first-child{text-align:left}`;
    document.head.appendChild(s); }
  function html(){
    if (!D) return '';
    css(); const cur = (D.months||[])[0] || {}, ms = (D.months||[]).filter(m => m.n || m.received);
    return `<div class="epm"><div class="epm-k">
        <div><span>이번 달 번 돈</span><b>${won(cur.net)}</b></div>
        <div class="ok"><span>이번 달 받은 돈</span><b>${won(cur.received)}</b></div>
        <div class="${D.due > 0 ? 'due' : 'ok'}"><span>아직 안 받은 돈</span><b>${won(D.due)}</b></div></div>
      <p>${D.team === 'RES' ? '계약 몫(배분율) − 3.3%' : '마감된 현장 지급액 − 공제'} 기준 · ${D.payday} · ${String(D.since).slice(5).replace('-','/')}부터 계산${D.due > 0 && D.team === 'RES' ? ' · 이번 달 몫은 다음 달 10일에 들어와요' : ''}</p>
      <button class="epm-more" type="button" data-epm="1">${open ? '접기' : '월별 · 입금 내역 보기'}</button>
      ${open ? `<table><tr><th>월</th><th>건수</th><th>번 돈</th><th>받은 돈</th></tr>${ms.map(m => `<tr><td>${+m.ym.slice(5)}월</td><td>${m.n}</td><td>${won(m.net)}</td><td>${won(m.received)}</td></tr>`).join('') || '<tr><td colspan="4">아직 기록이 없어요</td></tr>'}</table>
        ${(D.recent||[]).length ? `<table><tr><th>입금일</th><th></th><th></th><th>금액</th></tr>${D.recent.map(r => `<tr><td>${String(r.date).slice(5).replace('-','/')}</td><td></td><td></td><td>${won(r.amount)}</td></tr>`).join('')}</table>` : ''}` : ''}
      <p>금액이 다르면 대표님께 1:1로 말씀해주세요.</p></div>`;
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-epm]')) { e.stopPropagation(); open = !open; opt.onChange(); } }, true);
  window.EPMoney = { init(o){ opt = Object.assign(opt, o||{}); load(); setInterval(() => { if (!document.hidden) load(); }, 300000); }, html, reload: load, get data(){ return D; } };
})();
