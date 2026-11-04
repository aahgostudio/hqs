/* 어닝플레이스 HQ · HQS 공통 */
window.HQ = (function(){
const C = window.EP_CONFIG;
const OWNER_EMAIL = 'landyswork@gmail.com';
const MAEMUL_API = C.MAEMUL_API || 'https://script.google.com/macros/s/AKfycbxZFsXwTIiiq7xd2iFbbAb5vgtS4lRbNuBp0XCrleCQZYAzr_1ja6VnZKhnvh6fkp-h/exec';
const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
const H = { C, sb, MAEMUL_API, S: {}, views: {}, ACT: {}, FORM: {}, CHANGE: {} };

/* ---------- 도우미 ---------- */
const $ = s => document.querySelector(s);
H.$ = $;
H.I = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
H.esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
H.DOW = ['일','월','화','수','목','금','토'];
const pad = n => String(n).padStart(2,'0');
H.ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
H.parse = s => { const [y,m,d] = String(s).slice(0,10).split('-').map(Number); return new Date(y,m-1,d); };
H.addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
H.today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
H.won = n => n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR');
H.wonU = n => n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR') + '원';
H.md = s => { const d = H.parse(s); return `${d.getMonth()+1}/${d.getDate()}(${H.DOW[d.getDay()]})`; };
H.ago = t => { if (!t) return '-'; const m = Math.round((Date.now()-new Date(t))/60000); return m<1?'방금':m<60?m+'분 전':m<1440?Math.round(m/60)+'시간 전':Math.round(m/1440)+'일 전'; };
H.nn = v => v === '' || v == null ? null : v;
H.nnum = v => v === '' || v == null ? null : Number(String(v).replace(/[^0-9.-]/g,''));
H.monthRange = d => [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth()+1, 0)];
H.rnd = (n=8) => { const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>A[x%32]).join(''); };
H.toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(H.toast.t); H.toast.t = setTimeout(()=>t.classList.remove('on'), 2600); };
H.fail = e => { console.error(e); let b = document.getElementById('errbar'); if (!b){ b = document.createElement('div'); b.id='errbar'; b.style.cssText='position:fixed;left:12px;right:12px;top:12px;z-index:99;background:#FDECEC;color:#B91C1C;border:1px solid #F5B5B5;border-radius:12px;padding:10px 14px;font-size:13.5px;white-space:pre-wrap;box-shadow:0 8px 24px rgba(0,0,0,.15);cursor:pointer'; b.onclick=()=>b.remove(); document.body.appendChild(b); } b.textContent = '문제가 생겼어요 (눌러서 닫기)\n' + [e && e.message || e, e && e.details, e && e.hint].filter(Boolean).join('\n'); };
H.copy = async (t, m) => { try { await navigator.clipboard.writeText(t); H.toast(m || '복사했어요'); } catch(_) { prompt('복사해서 쓰세요', t); } };
H.q = async p => { const r = await p; if (r.error) throw r.error; return r.data; };
H.photoUrl = (path, bucket) => `${C.SUPABASE_URL}/storage/v1/object/public/${bucket === 'chat' ? 'chat' : 'live'}/${path}`;
H.liveUrl = code => `${location.origin}/live/?s=${code}`;
H.setting = k => H.S.settings ? H.S.settings[k] : null;

/* ---------- 팀 · 사람 ---------- */
H.T = c => (H.S.teams||[]).find(t => t.code === c) || {code:c, name:c, color:'#9CA3AF'};
H.P = id => (H.S.staffAll||H.S.staff||[]).find(s => s.id === id) || {name:'?'};
// 프로필 사진 (없으면 이름 두 글자: 조원경 → 원경)
H.two = n => { n = String(n||'?').trim(); return n.length >= 3 ? n.slice(1,3) : n; };
H.av = (s, size, cls) => { size = size||34; s = s||{}; const st = `width:${size}px;height:${size}px;font-size:${Math.round(size*.36)}px`;
  return s.avatar_path ? `<span class="hav ${cls||''}" style="${st}"><img src="${C.SUPABASE_URL}/storage/v1/object/public/avatars/${H.esc(s.avatar_path)}" alt="" loading="lazy"></span>` : `<span class="hav ${cls||''}" style="${st}">${H.esc(H.two(s.name))}</span>`; };
H.GROUPS = [
  {key:'RES', label:'리츠부동산', teams:['RES']},
  {key:'CLEAN', label:'리츠종합클린', teams:['OPS','SPT','PRT']},
  {key:'AGO', label:'아고스튜디오', teams:['AGO']}
];
// 직급 순서 (모든 직원 목록 공통): 실장이 팀장보다 위
H.RANK = ['대표','소장','실장','특수팀장','상가팀장','팀장','고정팀원','팀원','파트너','지원','사원','교육생'];
H.rankOf = r => { r = r || ''; const i = H.RANK.findIndex(x => r.includes(x)); return i < 0 ? H.RANK.length : i; };
H.rankSort = list => (list || []).slice().sort((a, b) => H.rankOf(a.role) - H.rankOf(b.role));
H.ST = {active:'근무', leave:'휴직', left:'퇴사'};
H.ST_PRT = {active:'근무', leave:'휴업', left:'계약종료'};   // 도급(파트너)은 휴업·계약종료로 표기
H.STL = s => (s && s.team === 'PRT') ? H.ST_PRT : H.ST;
H.stPill = (s, team) => { const L = team === 'PRT' ? H.ST_PRT : H.ST; return s === 'leave' ? `<span class="pill p-leave">${L.leave}</span>` : s === 'left' ? `<span class="pill p-mute">${L.left}</span>` : '<span class="pill p-ok">근무</span>'; };
H.PT = {none:'공제 없음', freelance33:'3.3%', daily:'일용직', salary:'급여', contract:'도급'};
H.PROOF = ['세금계산서','현금영수증','카드','플랫폼','없음'];
H.HOW = ['계좌이체','카드','현금','플랫폼'];

/* ---------- 돈 계산 (대표 화면 · 홈에서 같이 씀) ---------- */
H.extrasSum = j => (j.extras||[]).filter(x => x.agreed !== false).reduce((a,x) => a + (+x.amount||0), 0);
H.isClean = j => !(j.teams||[]).includes('RES') || (j.teams||[]).some(t => t !== 'RES');
H.isPartner = j => (j.teams||[]).includes('PRT') || !!j.contract_mode;
// 본사 매출로 잡히는 금액: 도급 A = 예약금만, 그 외 = 계약금액 + 추가금
H.jobRevenue = j => {
  if (j.status === 'cancelled' || j.status === 'quote') return 0;
  if (j.contract_mode === 'A') return +j.deposit_amount || 0;
  return (+j.total_amount || 0) + H.extrasSum(j);
};
// 외부지원(일용직): 그 현장에만 붙는 임시 인원 — jobs.helpers [{id,name,phone,src,pay,extra,memo,paid}] (v29)
H.helpers = j => (H.S.needV29 || !j) ? [] : (j.helpers||[]);
// 현장 인원 = 확정 직원 + 대표(가면) + 외부지원
H.isPrt = sid => H.P(sid).team === 'PRT';
// 도급 사장님이 확정되면 그 팀이 인원을 다 데려오니 자리 다 찬 걸로 (v30)
H.prtOn = j => H.isPartner(j) && (j.assignments||[]).some(a => a.status === 'approved' && H.isPrt(a.staff_id));   // 도급 현장일 때만 — 우리 직영 현장에 도급 사장님이 '지원'으로 오면 일반 인원으로 셈
H.crewN = j => H.prtOn(j) ? Math.max(j.headcount||0, 1) : (j.assignments||[]).filter(a => a.status === 'approved').length + (j.boss_on && !H.S.needV4 ? 1 : 0) + H.helpers(j).length;
H.jobLabor = j => (j.assignments||[]).filter(a => a.status === 'approved').reduce((n,a) => n + (+a.pay_amount||0) + (+a.extra_amount||0), 0)
  + H.helpers(j).reduce((n,x) => n + (+x.pay||0) + (+x.extra||0), 0);
// 증빙 발행/미발행 나누기: 예약금 · 잔금 · 추가금 줄마다
H.jobProofSplit = j => {
  const r = {issued:0, not:0, need:0};
  if (j.status === 'cancelled' || j.status === 'quote') return r;
  const add = (amt, proof, issued, how) => { amt = +amt||0; if (!amt) return;
    if (issued || proof === '카드' || proof === '플랫폼' || how === '카드' || how === '플랫폼') r.issued += amt;
    else { r.not += amt; if (proof === '현금영수증' || ((how === '현금' || how === '계좌이체') && amt >= 100000)) r.need++; } };
  if (j.contract_mode === 'A') { add(j.deposit_amount, j.deposit_proof, j.deposit_issued, j.deposit_how); return r; }
  const base = +j.total_amount || 0, dep = +j.deposit_amount || 0;
  add(dep, j.deposit_proof, j.deposit_issued, j.deposit_how);
  add(j.balance_amount != null ? j.balance_amount : Math.max(0, base - dep), j.balance_proof, j.balance_issued, j.balance_how);
  (j.extras||[]).filter(x => x.agreed !== false).forEach(x => add(x.amount, x.proof, x.issued, x.how));
  return r;
};
// 공제 계산 (세무사 확인 전 기본값)
/* 1104g: 어디서든 [입금 완료] → 1:1 대화에 "OO님 7 넣었어요" 자동 + 입금 기록 (대화 꺼져 있으면 기록만)
   지난 날 정산이면 기록 날짜를 그날로 맞춤 */
H.payNotify = async (staffId, amount, onDate, label) => {
  const s = H.P(staffId), n = Math.round(+amount || 0); if (!n || !s || !s.id) return 'skip';
  const today = H.ymd(new Date()), d = onDate || today;
  const nk = s.name.length >= 3 ? s.name.slice(1) : s.name, amt = n % 10000 === 0 ? String(n / 10000) : H.won(n) + '원';
  try {
    const on = await H.sb.from('settings').select('value').eq('key','chat_on').maybeSingle();
    if (on.data && String(on.data.value) === 'true' && !H.S.needV9) {
      const dm = await H.sb.from('chat_rooms').select('id').eq('kind','dm').eq('staff_id', s.id).maybeSingle();
      if (dm.data) {
        const r = await H.sb.rpc('chat_admin_send', {p_room: dm.data.id, p_body: `${nk}님 ${amt} 넣었어요${label ? `\n(${label})` : ''}\n고맙습니다`, p_photo: null});
        if (!r.error) { if (d !== today && r.data) await H.sb.from('payouts').update({paid_on: d}).eq('msg_id', r.data); return 'chat'; }
      }
    }
  } catch(_){}
  if (!H.S.needV9) await H.q(H.sb.from('payouts').insert({staff_id: s.id, amount: n, paid_on: d, source: 'manual', body: label || `${H.md(d)} 정산`}));
  return 'record';
};
H.deduct = (type, amount, days) => {
  amount = +amount||0;
  if (type === 'freelance33') return Math.floor(amount * 0.033 / 10) * 10;
  if (type === 'daily') { // 일용근로: 하루 15만원 넘는 부분 × 6% × (1-55%) × 1.1 (지방세 포함)
    const perDay = days ? amount / days : amount; const tax = Math.max(0, perDay - 150000) * 0.06 * 0.45 * 1.1;
    const t = Math.floor(tax * (days||1) / 10) * 10; return t < 1000 * (days||1) ? 0 : t; }
  return 0;
};

/* ---------- 매물노트 ---------- */
H.maemul = async (fn, args) => {
  const r = await fetch(MAEMUL_API, {method:'POST', body: JSON.stringify({fn, k: H.S.mcode, args: args||[]})});
  const j = await r.json(); if (!j.ok) throw new Error(j.error || '매물노트 오류'); return j.data;
};

/* ---------- 불러오기 ---------- */
H.loadBase = async () => {
  const S = H.S;
  const [tm, st, set] = await Promise.all([
    H.q(sb.from('teams').select('*').order('sort')),
    H.q(sb.from('staff').select('*').order('created_at')),
    H.q(sb.from('settings').select('*'))
  ]);
  S.teams = tm; S.staffAll = H.rankSort(st); S.staff = S.staffAll.filter(x => !x.hidden); S.settings = Object.fromEntries(set.map(r => [r.key, r.value]));
  S.mcode = S.settings.hq_maemul_code ? String(S.settings.hq_maemul_code) : '';
  if (S.owner) {
    S.payRules = await H.q(sb.from('pay_rules').select('*'));
  }
};
H.loadMaemul = async () => {
  const S = H.S; if (!S.owner || !S.mcode) return;
  try { S.mm = await H.maemul('getBootstrap'); S.mmErr = ''; await H.syncMaemulCodes(); }
  catch(e){ S.mm = null; S.mmErr = e.message; }
};
// 매물노트 직원 코드를 일정판 직원과 이름으로 연결 (부동산 직원이 매물노트 링크 하나로 일정판도 씀)
H.syncMaemulCodes = async () => {
  const mStaff = (H.S.mm && H.S.mm.admin && H.S.mm.admin.staff) || [];
  for (const m of mStaff) {
    if (!m.code || m.role === '대표') continue;
    const s = H.S.staff.find(x => x.name === m.name);
    if (s && s.maemul_code !== m.code) {
      const {error} = await sb.from('staff').update({maemul_code: m.code}).eq('id', s.id);
      if (!error) s.maemul_code = m.code;
    }
  }
};
H.loadRange = async (from, to) => {
  const S = H.S; const f = H.ymd(from), t = H.ymd(to);
  const [jobs, evs, av, ph] = await Promise.all([
    H.q(sb.from('jobs').select('*, assignments(*)').gte('job_date', f).lte('job_date', t).order('job_date').order('start_time', {nullsFirst:true})),
    H.q(sb.from('events').select('*').gte('ev_date', f).lte('ev_date', t).order('ev_date').order('ev_time', {nullsFirst:true})),
    H.q(sb.from('availability').select('*').gte('day', f).lte('day', t)),
    H.q(sb.from('job_photos').select('*').order('created_at', {ascending:false}).limit(2000))
  ]);
  S.jobs = jobs; S.events = evs; S.avail = av; S.photos = ph; S.range = [f, t];
};
H.loadFeed = async () => {
  const S = H.S;
  const [rp, nt] = await Promise.all([
    H.q(sb.from('reports').select('*').order('created_at', {ascending:false}).limit(60)),
    H.q(sb.from('notices').select('*, notice_reads(staff_id, read_at, confirmed_at)').order('created_at', {ascending:false}).limit(30))
  ]);
  S.reports = rp; S.notices = nt;
};
H.photosOf = jid => (H.S.photos||[]).filter(p => p.job_id === jid);

/* ---------- 화면 틀 ---------- */
H.view = (key, def) => { H.views[key] = def; };
const ORDER = ['home','pay','team','chat','sched','ops','promo','money','staff'];
H.cur = () => { const h = (location.hash||'').replace('#',''); const k = h.split('/')[0]; return H.views[k] && (!H.views[k].owner || H.S.owner) ? k : 'home'; };
H.go = k => { if (location.hash !== '#'+k) location.hash = k; else H.render(); };

H.untilTxt = u => { if (!u) return ''; const d = new Date(u), p = n => String(n).padStart(2,'0');
  return d.toDateString() === new Date().toDateString() ? ` ~${p(d.getHours())}:${p(d.getMinutes())}` : ` ~${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
/* 1104G 대표 출퇴근: 상태 → 칩 (선 아이콘 + 글자) */
H.BK = {office:['사무실','#10B981','<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10.5 21v-3h3v3"/>'],
  site:['현장','#2453C7','<path d="M3 18h18"/><path d="M5 18v-2a7 7 0 0 1 14 0v2"/><path d="M10 9.5V6.5a2 2 0 0 1 4 0v3"/>'],
  meet:['미팅','#0891B2','<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'],
  contract:['계약','#7C3AED','<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 17c1.5-2 2.5-2 3.5 0s2 2 3.5 0"/>'],
  guide:['안내','#6D28D9','<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'],
  busy:['바쁨','#DC2626','<circle cx="12" cy="12" r="9"/><path d="M7.5 12h9"/>'],
  rest:['휴무','#DB2777','<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
  vac:['휴가','#EA580C','<path d="M2.5 19h19"/><path d="M3.5 13.5 6 15l13.2-4.4a1.8 1.8 0 0 0-1-3.4l-3.7 1L8.6 4.7 6.9 5.3l3.4 4.6-4 1.1L4.4 9.6 3 10z"/>'],
  off:['퇴근','#9CA3AF','<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'],
  out:['외근','#E08A00','<path d="M3 17v-4l2.2-5.2A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1.3L21 13v4"/><path d="M3 13h18M3 17h18"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>']};
H.bIco = (k, sz=16) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="${H.BK[k][1]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${H.BK[k][2]}</svg>`;
H.bKind = st => ({'내근중':'office','근무중':'office','외근중':'out','견적 외근중':'out','부동산 외근중':'guide','일정 중':'out','현장':'site','현장 근무중':'site','Busy':'busy','회의중':'meet','계약중':'contract','업무 종료':'off','휴가중':'vac','휴무':'rest','부재':'rest'})[st] || 'office';
H.bossChip = () => {
  const b = H.S.boss || {state:'근무중'}, k = H.bKind(b.state);
  const until = H.untilTxt(b.until);
  if (H.S.owner && b.state === '근무중' && !b.punch) return `<button class="bstat bk" data-a="bossSheet" title="출근 전">${H.bIco('off')}출근 전 ▾</button>`;
  return H.S.owner ? `<button class="bstat bk" data-a="bossSheet" title="직원 화면 오른쪽 위에 보여요">${H.bIco(k)}${H.BK[k][0]}${H.esc(until)} ▾</button>`
    : `<span class="bstat bk" title="대표님 상태">${H.bIco(k)}대표님 ${H.BK[k][0]}${H.esc(until)}</span>`;
};

H.render = async () => {
  const S = H.S, k = H.cur(), v = H.views[k];
  document.body.dataset.tab = k;
  document.title = `${S.owner ? 'HQ' : 'HQS'} · ${v.label} · 어닝플레이스`;
  const tabs = ORDER.filter(x => H.views[x] && (!H.views[x].owner || S.owner))
    .map(x => `<a href="#${x}" ${x===k?'aria-current="page"':''}>${H.views[x].label}</a>`).join('');
  const shell = `<header class="top"><div class="topin">
      <a class="brand" href="#home" title="본사 홈" style="text-decoration:none;color:inherit"><img class="logo" src="../logo.svg" alt=""><div><b>어닝플레이스 ${S.owner ? 'HQ' : 'HQS'}</b><small>${S.owner ? '대표 · 본사 홈' : '본사일정관리팀'}</small></div></a>
      <nav class="tabs" aria-label="메뉴">${tabs}</nav>
      <div class="me">${S.isOwner ? `<button class="mode ${S.owner?'owner':'mgr'}" data-a="modeSwap" title="${S.owner?'눌러서 관리자(HQS) 화면 보기':'눌러서 대표 화면으로 돌아가기'}" style="border:0;cursor:pointer">${S.owner?'대표 모드 ⇄':'관리자 모드 · 미리보기 ⇄'}</button>` : `<span class="mode mgr">관리자 모드</span>`}${H.bossChip()}<span style="color:var(--sub)">${H.esc(S.name||'')}</span><button class="btn ghost sm" data-a="logout">로그아웃</button></div>
    </div></header><main class="wrap" id="main"><div class="spin"></div></main><button class="fab" data-a="quickAdd" aria-label="올리기">＋</button>`;
  if (!document.querySelector('header.top') || H._lastShell !== tabs + S.owner) { $('#app').innerHTML = shell; H._lastShell = tabs + S.owner; }
  else { const bc = document.querySelector('header .bstat'); if (bc) bc.outerHTML = H.bossChip(); }
  try {
    if (v.load && H._loaded !== k + (H._dirty||'')) { await v.load(); H._loaded = k + (H._dirty||''); }
    $('#main').innerHTML = v.render();
    if (v.after) v.after();
  } catch(e){ $('#main').innerHTML = '<p class="empty">불러오지 못했어요</p>'; H.fail(e); }
};
// 데이터가 바뀌었을 때 다시 그리기
H.ACT.modeSwap = () => { try { if (H.S.owner) localStorage.setItem('hq_preview_mgr','1'); else localStorage.removeItem('hq_preview_mgr'); } catch(e){}
  const u = new URL(location.href); u.searchParams.delete('mode'); history.replaceState(null, '', u.pathname + u.search + u.hash); location.reload(); };
// 폰: 어느 화면에서든 [＋] → 바로 올리기
H.ACT.quickAdd = () => { const S = H.S;
  H.open(`<h3>무엇을 올릴까요?</h3><div class="qadd">
    ${S.owner ? `<button class="qa" data-a="bossSheet"><b>🕘 내 상태 · 출퇴근</b><small>사무실 · 현장 · 외근 · 통화불가 · 휴무 · 퇴근</small></button>
    <button class="qa" data-a="bossPast"><b>🗓 지난 출퇴근 넣기</b><small>깜빡한 날 시간 직접 넣기</small></button>` : ''}
    <button class="qa" data-a="jobNew" data-paste="1"><b>🧹 클린 현장</b><small>예약글 붙여넣으면 자동으로 채워져요</small></button>
    <button class="qa" data-a="evNew"><b>📅 내 일정</b><small>계약 · 잔금 · 안내 · 미팅 · 견적</small></button>
    ${S.owner && S.mcode ? `<a class="qa" href="../maemul/?k=${encodeURIComponent(S.mcode)}&new=1"><b>🏠 매물 등록</b><small>매물노트에서 캡처·글로 자동 채우기</small></a>` : ''}
    <button class="qa" data-a="quoteNew"><b>📝 오더 접수 (견적 중)</b><small>아직 날짜 안 정해진 문의</small></button>
    <button class="qa" data-a="ntcGo"><b>📣 공지</b><small>직원 일정판에 공지 올리기</small></button>
  </div><div class="sacts"><button type="button" class="btn ghost" data-a="close">닫기</button></div>`); };
H.refresh = async () => { H._dirty = Date.now(); await H.loadBossStatus(); await H.render(); };

/* ---------- 시트 ---------- */
H.open = (html, wide) => { const s = $('#sheet'); s.className = 'sheet' + (wide ? ' wide' : ''); s.innerHTML = html; $('#scrim').classList.add('on'); const f = s.querySelector('input:not([type=hidden]),select,textarea'); if (f && window.innerWidth > 700) setTimeout(()=>f.focus(), 30); };
H.close = () => $('#scrim').classList.remove('on');
document.getElementById('scrim').addEventListener('click', e => { if (e.target.id === 'scrim') H.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') H.close(); });
H.sacts = (label, extra='') => `<div class="sacts">${extra}<button type="button" class="btn ghost" data-a="close">닫기</button><button class="btn" type="submit">${label}</button></div>`;

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = H.ACT[el.dataset.a]; if (!fn) return;
  if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
  try { await fn(el, e); } catch(err){ H.fail(err); }
});
document.addEventListener('submit', async e => {
  const f = e.target; const fn = H.FORM[f.dataset.f]; if (!fn) return; e.preventDefault();
  const btn = f.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
  try { await fn(new FormData(f), f); } catch(err){ H.fail(err); } finally { if (btn) btn.disabled = false; }
});
document.addEventListener('change', async e => {
  const el = e.target.closest('[data-c]'); if (!el) return;
  const fn = H.CHANGE[el.dataset.c]; if (!fn) return;
  try { await fn(el, e); } catch(err){ H.fail(err); }
});
window.addEventListener('hashchange', () => H.render());

H.ACT.close = () => H.close();
H.ACT.logout = async () => { await sb.auth.signOut(); location.reload(); };

/* ---------- 대표 상태 ---------- */
H.loadBossStatus = async () => { try { H.S.boss = await H.q(sb.rpc('boss_status')); } catch(_){} };
H.ACT.bossSheet = async () => { if (!H.S.owner) return H.toast('대표 상태는 대표님만 바꿀 수 있어요'); await H.loadPunchToday();
  const b = H.S.boss || {state:'근무중'}, cur = b.punch || b.state !== '근무중' ? H.bKind(b.state) : null;
  const P = (H.S.punchToday||[]);
  const log = P.map(x => `${H.hm(x.at)} ${H.BK[x.kind][0]}`).join(' → ');
  const K = ['office','site','meet','contract','guide','busy','rest','vac','off'];
  H.open(`<h3>지금 상태</h3><p class="note" style="margin:-6px 0 10px">누르면 바로 바뀌고 시간이 기록돼요.</p>
    <div class="pk3">${K.map(k => `<button type="button" class="pkb ${cur===k?'on':''}" data-a="bossTap" data-k="${k}">${H.bIco(k,26)}<b>${H.BK[k][0]}</b></button>`).join('')}</div>
    ${log ? `<div class="pklog"><b>오늘</b> ${log}</div>` : ''}
    <div class="sacts"><button type="button" class="btn ghost" data-a="bossMemo">메모·시간 정하기</button><button type="button" class="btn" data-a="close">닫기</button></div>`);
};
// 1104R: 상태 누르면 바로 — 사무실·현장·외근·퇴근 = 시간 기록 / 통화불가·휴무 = 오늘 끝까지 표시
H.ACT.bossTap = async el => { const k = el.dataset.k, b = H.S.boss || {};
  if (k === 'vac') return H.ACT.bossVac();
  const later = h => { const u = new Date(Date.now() + h*3600e3); return u.toISOString(); };
  const eod = () => { const u = new Date(); u.setHours(23,59,0,0); return u.toISOString(); };
  const MAN = {busy:['Busy', later(1)], rest:['휴무', eod()], meet:['회의중', later(2)], contract:['계약중', later(2)], guide:['부동산 외근중', later(2)]};
  const PUNCH = {office:'office', site:'site', off:'off', meet:'out', contract:'out', guide:'out'};
  try {
    if (PUNCH[k]) await H.q(sb.from('boss_punch').insert({kind: PUNCH[k]}));
    if (MAN[k]) await H.q(sb.from('settings').upsert({key:'boss_status', value:{state: MAN[k][0], memo: b.memo||'', until: MAN[k][1]}}));
    else if (b.state && b.state !== '근무중' && !b.punch) await H.q(sb.from('settings').upsert({key:'boss_status', value:{state:'근무중', memo:b.memo||'', until:null}}));
    if (k === 'rest') { const d = H.ymd(H.today()); try { await H.q(sb.from('boss_rest').upsert({day: d})); } catch(_){} }
  } catch(e){ return H.toast('저장 못 했어요 · ' + String(e.message||e).slice(0, 80)); }
  H.close(); H.toast(k === 'off' ? '퇴근 · 오늘도 수고하셨어요' : H.BK[k][0] + ' · 직원 화면에 바로 보여요');
  await H.loadPunchToday(); H._dirty = Date.now(); await H.refresh(); };
H.ACT.bossVac = () => { const t = H.ymd(H.addDays(H.today(), 2));
  H.open(`<form data-f="bossVac"><h3>휴가</h3><p class="note" style="margin:-6px 0 10px">오늘부터 고른 날까지 직원 화면에 "휴가"로 보이고, 달력에 휴무 점이 찍혀요.</p>
    <div class="fg"><div class="field"><label>시작</label><input type="date" name="s" value="${H.ymd(H.today())}" required></div><div class="field"><label>끝나는 날</label><input type="date" name="e" value="${t}" required></div></div>${H.sacts('휴가 시작')}</form>`); };
H.FORM.bossVac = async v => { const s0 = v.get('s'), e0 = v.get('e'); if (!s0 || !e0 || e0 < s0) return H.toast('날짜를 확인해 주세요');
  const days = []; for (let d = H.parse(s0); H.ymd(d) <= e0; d = H.addDays(d, 1)) days.push({day: H.ymd(d)});
  await H.q(sb.from('boss_rest').upsert(days));
  if (s0 <= H.ymd(H.today())) { const u = H.parse(e0); u.setHours(23,59,0,0); await H.q(sb.from('settings').upsert({key:'boss_status', value:{state:'휴가중', memo:(H.S.boss||{}).memo||'', until:u.toISOString()}})); }
  H.close(); H.toast(`휴가 ${H.md(s0)} ~ ${H.md(e0)} · 잘 쉬다 오세요`); H._dirty = Date.now(); await H.refresh(); };
H.ACT.bossMemo = () => { const b = H.S.boss || {state:'근무중'};
  const states = ['근무중','Busy','휴무','휴가중'];
  const u = b.until ? new Date(b.until) : null;
  const loc = u ? new Date(u.getTime() - u.getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
  H.open(`<form data-f="boss"><h3>메모·시간 정하기</h3>
    <div class="chips" style="margin-bottom:12px">${states.map(s=>`<label><input type="radio" name="state" value="${s}" ${b.state===s?'checked':''}><span>${s==='근무중'?'자동 (찍은 대로)':s==='Busy'?'통화불가':s==='휴가중'?'휴가':s}</span></label>`).join('')}</div>
    <div class="fg"><div class="field full"><label>한 줄 메모 (직원에게 보임)</label><input name="memo" value="${H.esc(b.memo||'')}" placeholder="예) 급한 건 전화 · 신봉진 실장에게"></div>
    <div class="field"><label>언제까지</label><input type="datetime-local" name="until" value="${loc}"></div>
    <div class="field"><label>&nbsp;</label><div class="chips">${[['1h','1시간'],['3h','3시간'],['eod','오늘 끝까지']].map(([k,l])=>`<label><input type="radio" name="quick" value="${k}"><span>${l}</span></label>`).join('')}</div></div></div>
    ${H.sacts('저장')}</form>`); };
H.hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
H.loadPunchToday = async () => { try { const d0 = new Date(); d0.setHours(0,0,0,0);
  H.S.punchToday = await H.q(sb.from('boss_punch').select('id,at,kind').gte('at', d0.toISOString()).order('at')); } catch(_){ H.S.punchToday = []; } };
H.ACT.bossPunch = async el => { const k = el.dataset.k;
  try { await H.q(sb.from('boss_punch').insert({kind:k}));
    const b = H.S.boss || {}; if (['외근중','현장','휴가중','부재'].includes(b.state)) await H.q(sb.from('settings').upsert({key:'boss_status', value:{state:'근무중', memo:b.memo||'', until:null}}));
  } catch(e){ return H.toast('저장 못 했어요 · ' + String(e.message||e).slice(0, 80)); }
  H.close(); H.toast(k==='off' ? '퇴근 찍었어요 · 오늘도 수고하셨어요' : H.BK[k][0] + ' 찍었어요 · 직원 화면에 바로 보여요');
  await H.loadPunchToday(); H._dirty = Date.now(); await H.refresh(); };
H.FORM.boss = async v => {
  let until = v.get('until') ? new Date(v.get('until')) : null;
  const q = v.get('quick'); const now = new Date();
  if (q === '1h') until = new Date(now.getTime() + 3600e3); if (q === '3h') until = new Date(now.getTime() + 3*3600e3);
  if (q === 'eod') { until = new Date(); until.setHours(23,59,0,0); }
  const state = v.get('state') || '근무중';
  const val = {state, memo: (v.get('memo')||'').trim(), until: state === '근무중' ? null : (until ? until.toISOString() : null)};
  await H.q(sb.from('settings').upsert({key:'boss_status', value: val}));
  H.close(); H.toast('상태를 바꿨어요 · 직원 화면에 바로 보여요'); await H.refresh();
};

/* ---------- 첫 화면 ---------- */
function loginView(msg){
  $('#app').innerHTML = `<form class="login" id="lf"><div style="display:flex;align-items:center;gap:10px"><img class="logo" src="../logo.svg" alt=""><b style="font-size:17px">어닝플레이스 HQ · HQS</b></div>
    <div style="font-size:13px;color:var(--sub)">대표님 · 관리자 전용 화면이에요.</div>
    ${msg?`<p style="color:var(--warn);margin:0">${H.esc(msg)}</p>`:''}
    <div class="field"><label>이메일</label><input type="email" name="email" autocomplete="username" required></div>
    <div class="field"><label>비밀번호</label><input type="password" name="password" autocomplete="current-password" required></div>
    <button class="btn" type="submit">로그인</button></form>`;
  $('#lf').onsubmit = async e => { e.preventDefault(); const v = new FormData(e.target);
    const {error} = await sb.auth.signInWithPassword({email:v.get('email'), password:v.get('password')}); if (error) return loginView('로그인하지 못했어요'); H.boot(); };
}
function setupView(){
  $('#app').innerHTML = `<div class="login" style="max-width:560px"><b style="font-size:18px">업데이트 마무리가 필요해요 (한 번만)</b>
    <div style="font-size:13.5px;line-height:1.7">새 HQ · HQS 화면을 쓰려면 서버에 표를 몇 개 추가해야 해요.<br>
    1. 아래 [SQL 복사]를 누르세요<br>2. Supabase → <b>SQL Editor</b> → New query 에 붙여넣고 <b>Run</b><br>3. '업데이트 완료 (v2)'가 보이면 이 화면을 새로고침</div>
    <button class="btn" id="cpsql">SQL 복사</button>
    <a class="btn ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">Supabase SQL Editor 열기</a>
    <a class="btn ghost" href="../hqs-old.html">그동안은 예전 일정판 쓰기</a></div>`;
  $('#cpsql').onclick = async () => { const t = await (await fetch('update_v2.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL을 복사했어요 · SQL Editor에 붙여넣고 Run'); };
}

H.boot = async () => {
  try {
    const {data:{session}} = await sb.auth.getSession();
    if (!session) return loginView();
    const {data:isAdmin, error} = await sb.rpc('is_admin');
    if (error || !isAdmin){ await sb.auth.signOut(); return loginView('관리자 계정이 아니에요'); }
    const ver = await sb.rpc('hq_schema_version');
    if (ver.error || (ver.data||0) < 2) return setupView();
    H.S.needV3 = (ver.data||0) < 3; H.S.needV4 = (ver.data||0) < 4; H.S.needV5 = (ver.data||0) < 5; H.S.needV6 = (ver.data||0) < 6; H.S.needV7 = (ver.data||0) < 7; H.S.needV8 = (ver.data||0) < 8; H.S.needV9 = (ver.data||0) < 9; H.S.needV10 = (ver.data||0) < 10; H.S.needV19 = (ver.data||0) < 19; H.S.needV20 = (ver.data||0) < 20; H.S.needV21 = (ver.data||0) < 21; H.S.needV22 = (ver.data||0) < 22; H.S.needV23 = (ver.data||0) < 23; H.S.needV24 = (ver.data||0) < 24; H.S.needV25 = (ver.data||0) < 25; H.S.needV26 = (ver.data||0) < 26; H.S.needV27 = (ver.data||0) < 27; H.S.schemaV = ver.data||0; H.S.needV32 = (ver.data||0) < 38; H.S.needV29 = (ver.data||0) < 29;
    const own = await sb.rpc('is_owner');
    H.S.isOwner = !!own.data && (session.user.email||'').toLowerCase() === OWNER_EMAIL;
    // 대표님이 관리자(HQS) 화면을 미리 볼 수 있게: ?mode=hqs 로 들어오거나 모드 버튼을 누르면 전환
    const qm = new URLSearchParams(location.search).get('mode');
    try { if (qm === 'hqs') localStorage.setItem('hq_preview_mgr','1'); else if (qm === 'hq') localStorage.removeItem('hq_preview_mgr'); } catch(e){}
    let pv = false; try { pv = localStorage.getItem('hq_preview_mgr') === '1'; } catch(e){}
    H.S.owner = H.S.isOwner && !pv;
    const ad = await sb.from('admins').select('name').eq('user_id', session.user.id).maybeSingle();
    H.S.name = (ad.data && ad.data.name) || (H.S.owner ? '권성환' : '관리자');
    await Promise.all([H.loadBase(), H.loadBossStatus()]);
    if (H.S.owner && !H.S.mcode) H.toast('매물노트를 연결하면 부동산 현황도 보여요 (홈 › 연결하기)');
    await H.render();
    H.loadMaemul().then(() => { if (['home','team','staff','ops'].includes(H.cur())) { H._dirty = Date.now(); H.render(); } });
    setInterval(() => { if (document.visibilityState === 'visible' && !$('#scrim').classList.contains('on') && !document.activeElement.closest('#main input,#main select,#main textarea')) H.refresh(); }, 90000);
  } catch(e){ H.fail(e); }
};
return H;
})();
