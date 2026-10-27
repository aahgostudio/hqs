/* 어닝플레이스 · 대표님 현재 상태 + 연락하기 (직원 화면 공용)
   - 상태는 대표님 구글 캘린더(청소일정 구독 + 개인 캘린더)를 보고 자동으로 정해져요.
   - HQ에서 대표님이 직접 바꾼 상태(외근·휴가·Busy 등)가 있으면 그게 먼저 보여요.
   사용: <script src="../status.js"></script> → EPStatus.init({manual:()=>상태, onChange:render}) → `${EPStatus.pill()}` */
(function(){
  // 캘린더 자동 상태 주소 (Apps Script 웹앱). 비어 있으면 HQ에서 정한 상태만 보여요.
  const STATUS_URL = '';
  const PHONE = '010-7193-2246';
  const KAKAO = 'http://pf.kakao.com/_hZqWX/chat';

  const LOOK = {
    '현장 근무중': {i:'🧹', t:'field', busy:true},
    '내근중':      {i:'🏢', t:'ok'},
    '근무중':      {i:'🏢', t:'ok'},
    '회의중':      {i:'💬', t:'busy', busy:true},
    '견적 외근중': {i:'🚗', t:'away', busy:true},
    '부동산 외근중':{i:'🏠', t:'away', busy:true},
    '외근중':      {i:'🚗', t:'away', busy:true},
    '일정 중':     {i:'📌', t:'away', busy:true},
    '휴가중':      {i:'🌴', t:'off', busy:true},
    '부재':        {i:'⏸', t:'off', busy:true},
    'Busy':        {i:'⛔', t:'busy', busy:true},
    '업무 종료':   {i:'🌙', t:'off', busy:true}
  };
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
    if (live) return {state: MANUAL_NAME[m.state] || m.state, until: m.until, memo: m.memo, next: auto && auto.next, manual: true};
    const a = auto && auto.state ? auto : byClock();
    return Object.assign({}, a, {memo: m && m.memo});
  }

  function pill(){
    const c = current(), L = LOOK[c.state] || LOOK['근무중'];
    return `<button type="button" class="epst-pill t-${L.t}" data-epst="1" aria-label="대표님 상태 · 연락하기"><span class="dot"></span><span class="tx"><small>대표님</small><b>${L.i} ${esc(c.state)}</b></span><span class="call">연락</span></button>`;
  }

  function openSheet(){
    const c = current(), L = LOOK[c.state] || LOOK['근무중'];
    const tel = PHONE.replace(/-/g,'');
    const hint = c.state === '업무 종료' ? '지금은 업무 시간이 아니에요. 카톡으로 남겨주시면 아침에 바로 답드릴게요.'
      : L.busy ? '지금은 바로 받기 어려울 수 있어요. 급하지 않으면 카톡으로 남겨주세요. 급하면 전화 주세요.'
      : '지금 사무실에 있어요. 편하게 전화나 카톡 주세요.';
    const btnCall = `<a class="epst-btn ${L.busy?'':'pri'}" href="tel:${tel}">📞 전화하기<small>${PHONE}</small></a>`;
    const btnKakao = `<a class="epst-btn ${L.busy?'pri':''}" href="${KAKAO}" target="_blank" rel="noopener">💬 카톡으로 문의<small>어닝플레이스 채널 1:1</small></a>`;
    const btnSms = `<a class="epst-btn" href="sms:${tel}">✉️ 문자 보내기</a>`;
    const wrap = document.createElement('div');
    wrap.className = 'epst-back';
    wrap.innerHTML = `<div class="epst-sheet" role="dialog" aria-label="대표님 연락하기">
      <div class="epst-grab"></div>
      <div class="epst-now t-${L.t}"><span class="big">${L.i}</span><div><small>대표님 지금</small><b>${esc(c.state)}${c.until?` <em>${esc(untilTxt(c.until))}</em>`:''}</b>
        ${c.memo?`<p>${esc(c.memo)}</p>`:''}${c.next?`<p class="nx">다음 · ${esc(c.next)}</p>`:''}${c.note?`<p class="nx">${esc(c.note)}</p>`:''}</div></div>
      <p class="epst-hint">${hint}</p>
      <div class="epst-btns">${L.busy ? btnKakao + btnCall : btnCall + btnKakao}${btnSms}</div>
      <button type="button" class="epst-close" data-epst-close="1">닫기</button>
      <p class="epst-foot">상태는 대표님 일정에 맞춰 자동으로 바뀌어요.</p></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('on'));
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-epst-close]')) { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 200); } });
  }

  async function load(){
    if (opt.demo) { auto = {state:'현장 근무중', until:new Date(Date.now()+2*3600e3).toISOString(), next:'13:00 회의'}; return opt.onChange(); }
    if (!STATUS_URL) return;
    try { const r = await fetch(STATUS_URL, {cache:'no-store'}); if (!r.ok) return; const a = await r.json();
      if (a && a.state && JSON.stringify(a) !== JSON.stringify(auto)) { auto = a; opt.onChange(); } } catch(_){}
  }

  document.addEventListener('click', e => { if (e.target.closest('[data-epst]')) { e.preventDefault(); e.stopPropagation(); openSheet(); } }, true);

  const css = `
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
.epst-btn.pri{background:#0F7A55;border-color:#0F7A55;color:#fff}.epst-btn.pri small{color:rgba(255,255,255,.8)}
.epst-close{width:100%;margin-top:10px;border:0;background:none;color:var(--epsub);font:inherit;font-size:14px;padding:10px}
.epst-foot{text-align:center;font-size:11.5px;color:var(--epsub);margin:0}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.EPStatus = {
    init(o){ opt = Object.assign(opt, o || {}); load(); setInterval(() => { if (document.visibilityState === 'visible') load(); }, 120000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); }); },
    pill, open: openSheet, current
  };
})();
