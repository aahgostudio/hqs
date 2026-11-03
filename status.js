/* 어닝플레이스 · 대표님 현재 상태 + 연락하기 (직원 화면 공용)
   - 상태는 대표님 구글 캘린더(청소일정 구독 + 개인 캘린더)를 보고 자동으로 정해져요.
   - HQ에서 대표님이 직접 바꾼 상태(외근·휴가·Busy 등)가 있으면 그게 먼저 보여요.
   사용: <script src="../status.js"></script> → EPStatus.init({manual:()=>상태, onChange:render}) → `${EPStatus.pill()}` */
(function(){
  // 캘린더 자동 상태 주소 (Apps Script 웹앱). 비어 있으면 HQ에서 정한 상태만 보여요.
  const STATUS_URL = 'https://script.google.com/macros/s/AKfycbyN4H5mjfqVtNgsUmjcT2ejAtWKQ0BBbQSzBPa7Vpu6MwIcT9mYe8pwxir4qMxmb_5_hg/exec';
  const PHONE = '010-7193-2246';
  const KAKAO = 'http://pf.kakao.com/_hZqWX/chat';

  const LOOK = {
    '현장 근무중': {k:'site', i:'🦺', n:'현장', t:'field', busy:true},
    '내근중':      {k:'office', i:'📋', n:'사무실', t:'ok'},
    '근무중':      {k:'office', i:'📋', n:'사무실', t:'ok'},
    '회의중':      {k:'meet', i:'💬', n:'미팅', t:'busy', busy:true},
    '계약중':      {k:'contract', i:'✍️', n:'계약', t:'busy', busy:true},
    '견적 외근중': {k:'out', i:'💼', n:'외근', t:'away', busy:true},
    '부동산 외근중':{k:'guide', i:'🏠', n:'안내', t:'away', busy:true},
    '외근중':      {k:'out', i:'💼', n:'외근', t:'away', busy:true},
    '일정 중':     {k:'out', i:'📌', t:'away', busy:true},
    '휴가중':      {k:'vac', i:'🌴', n:'휴가', t:'off', busy:true},
    '휴무':        {k:'rest', i:'☀️', n:'휴무', t:'off', busy:true},
    '부재':        {k:'rest', i:'⏸', t:'off', busy:true},
    'Busy':        {k:'busy', i:'📵', n:'통화불가', t:'busy', busy:true},
    '업무 종료':   {k:'off', i:'🌙', n:'퇴근', t:'off', busy:true}
  };
  const BK = {office:['사무실','#10B981','<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10.5 21v-3h3v3"/>'],
  site:['현장','#2453C7','<path d="M3 18h18"/><path d="M5 18v-2a7 7 0 0 1 14 0v2"/><path d="M10 9.5V6.5a2 2 0 0 1 4 0v3"/>'],
  meet:['미팅','#0891B2','<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'],
  contract:['계약','#7C3AED','<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 17c1.5-2 2.5-2 3.5 0s2 2 3.5 0"/>'],
  guide:['안내','#6D28D9','<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'],
  busy:['바쁨','#DC2626','<circle cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>'],
  rest:['휴무','#DB2777','<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
  vac:['휴가','#EA580C','<path d="M2.5 19h19"/><path d="M3.5 13.5 6 15l13.2-4.4a1.8 1.8 0 0 0-1-3.4l-3.7 1L8.6 4.7 6.9 5.3l3.4 4.6-4 1.1L4.4 9.6 3 10z"/>'],
  off:['퇴근','#9CA3AF','<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
  out:['외근','#E08A00','<path d="M3 17v-4l2.2-5.2A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1.3L21 13v4"/><path d="M3 13h18M3 17h18"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>']};
  const ico = (k, sz) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="${BK[k][1]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block">${BK[k][2]}</svg>`;
  const MANUAL_NAME = {'현장':'현장 근무중'};

  let auto = null, opt = {manual:()=>null, onChange:()=>{}, demo:false};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hm = d => { d = new Date(d); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
  const untilTxt = u => { if (!u) return ''; const d = new Date(u); if (isNaN(d)) return '';
    return d.toDateString() === new Date().toDateString() ? '~' + hm(d) : '~' + (d.getMonth()+1) + '/' + d.getDate(); };

  // 시간만 보고 정하는 기본값 (캘린더 연결 전·실패 시)
  function byClock(){ const h = new Date().getHours(); return h >= 7 && h < 22 ? {state:'근무중'} : {state:'업무 종료', note:'내일 아침 7시부터 답드려요'}; }

  function current(){
    const m = opt.manual && opt.manual();
    const live = m && m.state && m.state !== '근무중' && (!m.until || new Date(m.until) > new Date());
    if (live) return {state: MANUAL_NAME[m.state] || m.state, until: m.until, memo: m.memo, next: auto && auto.next, manual: true, start: m.start, since: m.since};
    let a = auto && auto.state ? auto : byClock();
    const site = siteNow();
    if (site && a.state !== '휴가중') a = Object.assign({}, a, site);
    if (!a.next) { const ns = nextSite(); if (ns) a = Object.assign({}, a, {next: ns}); }
    return Object.assign({}, a, {memo: m && m.memo});
  }

  function pill(){
    const c = current(), L = LOOK[c.state] || LOOK['근무중'];
    return `<button type="button" class="epst-ic t-${L.t}" style="--epc:${BK[L.k||'office'][1]}" data-epst="1" title="대표님 ${esc(L.n||c.state)} · 눌러서 연락" aria-label="대표님 ${esc(L.n||c.state)}, 연락하기"><span class="em">${ico(L.k || 'office', 17)}</span><span class="dot"></span></button>`;
  }

  function openSheet(){
    const c = current(), L = LOOK[c.state] || LOOK['근무중'];
    const tel = PHONE.replace(/-/g,'');
    const talk = !!(window.EPChat && EPChat.state.on), KT = talk ? '어닝톡' : '카톡';   // 어닝톡(팀 대화) 켜져 있으면 어닝톡 1:1로, 아니면 예전처럼 카톡 채널
    const hint = c.state === '업무 종료' ? `지금은 업무 시간이 아니에요. ${KT}으로 남겨주시면 아침에 바로 답드릴게요.`
      : L.busy ? `지금은 바로 받기 어려울 수 있어요. 급하지 않으면 ${KT}으로 남겨주세요. 급하면 전화 주세요.`
      : `지금 사무실에 있어요. 편하게 전화나 ${KT} 주세요.`;
    const btnCall = `<a class="epst-btn ${L.busy?'':'pri'}" href="tel:${tel}">📞 전화하기<small>${PHONE}</small></a>`;
    const btnKakao = talk ? `<button type="button" class="epst-btn ${L.busy?'pri':''}" data-epst-talk="1">💬 어닝톡으로 문의<small>대표님 1:1</small></button>`
      : `<a class="epst-btn ${L.busy?'pri':''}" href="${KAKAO}" target="_blank" rel="noopener">💬 카톡으로 문의<small>어닝플레이스 채널 1:1</small></a>`;
    const btnSms = `<a class="epst-btn" href="sms:${tel}">✉️ 문자 보내기</a>`;
    const wrap = document.createElement('div');
    wrap.className = 'epst-back';
    wrap.innerHTML = `<div class="epst-sheet" role="dialog" aria-label="대표님 연락하기">
      <div class="epst-grab"></div>
      <div class="epst-now t-${L.t}" style="--epc:${BK[L.k||'office'][1]};--eps:${BK[L.k||'office'][1]}1A"><span class="big">${ico(L.k || 'office', 32)}</span><div><small>대표님 지금</small><b>${esc(L.n||c.state)}${c.until?` <em>${esc(untilTxt(c.until))}</em>`:''}</b>
        ${c.start && c.state !== '휴가중' ? `<p>${esc(hm(c.start))} 출근${c.state === '업무 종료' && c.since ? ' · ' + esc(hm(c.since)) + ' 퇴근' : ''}</p>` : ''}${c.memo?`<p>${esc(c.memo)}</p>`:''}${c.next?`<p class="nx">다음 · ${esc(c.next)}</p>`:''}${c.note?`<p class="nx">${esc(c.note)}</p>`:''}</div></div>
      <p class="epst-hint">${hint}</p>
      <div class="epst-btns">${L.busy ? btnKakao + btnCall : btnCall + btnKakao}${btnSms}</div>
      <button type="button" class="epst-close" data-epst-close="1">닫기</button>
      <p class="epst-foot">대표님이 출근·현장·외근·퇴근을 찍으면 자동으로 바뀌어요.</p></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('on'));
    const shut = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 200); };
    wrap.addEventListener('click', e => {
      if (e.target.closest('[data-epst-talk]')) { shut(); EPChat.openDm().then(ok => { if (!ok) window.open(KAKAO, '_blank'); }); return; }
      if (e.target === wrap || e.target.closest('[data-epst-close]')) shut(); });
  }

  let bossJobs = [];
  const SB_URL = (window.EP_CONFIG||{}).SUPABASE_URL || 'https://ldvknvmsnpbporxhnsli.supabase.co';
  const SB_KEY = (window.EP_CONFIG||{}).SUPABASE_KEY || 'sb_publishable_7MeTgyPzwzK47RKG-mUapQ_K5ngrTw5';
  async function loadJobs(){ try { const r = await fetch(SB_URL + '/rest/v1/rpc/boss_jobs_today', {method:'POST', headers:{apikey:SB_KEY, 'content-type':'application/json'}, body:'{}'}); if (r.ok) { const j = await r.json(); if (Array.isArray(j)) bossJobs = j; } } catch(_){} }
  // 일정판에 '대표님도 가는 현장'이면 그 시간(4시간)은 현장 근무중
  function siteNow(){ const n = new Date(), m = n.getHours()*60 + n.getMinutes();
    for (const b of bossJobs) { const [h, mi] = String(b.t||'').split(':').map(Number); if (isNaN(h)) continue; const s0 = h*60 + (mi||0);
      if (m >= s0 && m < s0 + 240) { const u = new Date(n); u.setHours(0, s0 + 240, 0, 0); return {state:'현장 근무중', until:u.toISOString()}; } }
    return null; }
  function nextSite(){ const n = new Date(), m = n.getHours()*60 + n.getMinutes();
    const b = bossJobs.find(b => { const [h, mi] = String(b.t||'').split(':').map(Number); return h*60 + (mi||0) > m; }); return b ? b.t + ' 현장' : null; }
  async function load(){
    if (!opt.demo) await loadJobs();
    if (opt.demo) { auto = {state:'현장 근무중', until:new Date(Date.now()+2*3600e3).toISOString(), next:'13:00 회의'}; return opt.onChange(); }
    if (!STATUS_URL) return opt.onChange();
    try { const r = await fetch(STATUS_URL, {cache:'no-store'}); if (!r.ok) return; const a = await r.json();
      if (a && a.state && JSON.stringify(a) !== JSON.stringify(auto)) { auto = a; opt.onChange(); } } catch(_){}
  }

  document.addEventListener('click', e => { if (e.target.closest('[data-epst]')) { e.preventDefault(); e.stopPropagation(); openSheet(); } }, true);

  const css = `
.epst-ic{position:relative;width:30px;height:30px;border-radius:50%;border:2px solid var(--epc);background:var(--epbg);display:inline-grid;place-items:center;padding:0;cursor:pointer;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.epst-ic .em{font-size:15px;line-height:1}
.epst-ic .dot{position:absolute;right:-3px;bottom:-3px;width:10px;height:10px;border-radius:50%;background:var(--epc);border:2px solid var(--epbg)}
.epst-ic.t-field .dot,.epst-ic.t-busy .dot{animation:epst-p 1.6s ease-in-out infinite}
@keyframes epst-p{50%{box-shadow:0 0 0 4px var(--eps)}}
@media (prefers-reduced-motion:reduce){.epst-ic .dot{animation:none!important}}
.epst-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--epl);background:var(--epbg);color:var(--epink);border-radius:99px;padding:5px 6px 5px 11px;font:inherit;cursor:pointer;max-width:100%;box-shadow:0 1px 2px rgba(0,0,0,.05);flex-shrink:0}
.epst-pill .dot{width:8px;height:8px;border-radius:50%;background:var(--epc);box-shadow:0 0 0 3px var(--eps);flex-shrink:0}
.epst-pill .tx{display:flex;flex-direction:column;line-height:1.15;text-align:left;min-width:0}
.epst-pill small{font-size:10.5px;color:var(--epsub)}.epst-pill b{font-size:13px;font-weight:700;white-space:nowrap}
.epst-pill .call{font-size:12px;font-weight:700;background:var(--epc);color:#fff;border-radius:99px;padding:5px 10px}
.t-ok{--epc:#0F7A55;--eps:#E2F2EA}.t-field{--epc:#EA580C;--eps:#FFEDD5}.t-away{--epc:#0284C7;--eps:#E0F2FE}.t-busy{--epc:#C2410C;--eps:#FFF1E8}.t-off{--epc:#6B7280;--eps:#EEF0F2}
:root{--epbg:#fff;--epink:#0E1B16;--epsub:#5F7168;--epl:#D9E2DD;--epsheet:#fff}
@media (prefers-color-scheme:dark){:root{--epbg:#101A16;--epink:#ECF4F0;--epsub:#A9BCB3;--epl:#1F3029;--epsheet:#101A16}.t-ok{--eps:#12302A}.t-field{--eps:#33200F}.t-away{--eps:#0F2836}.t-busy{--eps:#2E1A10}.t-off{--eps:#23282B}}
.epst-back{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9999;display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}
.epst-back.on{opacity:1}
.epst-sheet{background:var(--epsheet);color:var(--epink);width:100%;max-width:440px;border-radius:22px 22px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom));transform:translateY(30px);transition:transform .2s;font-family:inherit}
.epst-back.on .epst-sheet{transform:none}
.epst-grab{width:40px;height:4px;border-radius:9px;background:var(--epl);margin:0 auto 14px}
.epst-now{display:flex;gap:12px;align-items:flex-start;background:var(--eps);border-radius:16px;padding:14px}
.epst-now .big{font-size:30px;line-height:1}.epst-now small{font-size:12px;color:var(--epsub)}
.epst-now b{display:block;font-size:20px;font-weight:800;color:var(--epc);letter-spacing:-.02em}.epst-now em{font-style:normal;font-size:14px;color:var(--epsub);font-weight:600}
.epst-now p{margin:4px 0 0;font-size:13.5px}.epst-now .nx{color:var(--epsub)}
.epst-hint{font-size:13px;color:var(--epsub);margin:12px 2px}
.epst-btns{display:grid;gap:8px}
.epst-btn{display:flex;justify-content:space-between;align-items:center;border:1px solid var(--epl);border-radius:14px;padding:14px 16px;font-size:15px;font-weight:700;color:var(--epink);text-decoration:none;background:var(--epbg)}
.epst-btn small{font-size:12px;font-weight:500;color:var(--epsub)}
.epst-btn.pri{background:var(--accent,var(--navy,#16347A));border-color:transparent;color:#fff}.epst-btn.pri small{color:rgba(255,255,255,.8)}
button.epst-btn{width:100%;font:inherit;font-size:15px;font-weight:700;cursor:pointer;text-align:left}
.epst-close{width:100%;margin-top:10px;border:0;background:none;color:var(--epsub);font:inherit;font-size:14px;padding:10px}
.epst-foot{text-align:center;font-size:11.5px;color:var(--epsub);margin:0}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.EPStatus = {
    init(o){ opt = Object.assign(opt, o || {}); load(); setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); }); },
    pill, open: openSheet, current
  };
})();
