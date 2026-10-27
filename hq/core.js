/* 어닝플레이스 HQ · HQS 공통 */
window.HQ = (function(){
const C = window.EP_CONFIG;
const OWNER_EMAIL = 'landyswork@gmail.com';
const MAEMUL_API = C.MAEMUL_API || 'https://script.google.com/macros/s/AKfycbxTXK4vWTm5ARCY-ElhQPtwd6xU-bMbnQPsd4MAl5TuLEKnW3Ie6qiAUpL_OyxCiOxqKQ/exec';
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
H.photoUrl = path => `${C.SUPABASE_URL}/storage/v1/object/public/live/${path}`;
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
H.ST = {active:'근무', leave:'휴직', left:'퇴사'};
H.stPill = s => s === 'leave' ? '<span class="pill p-leave">휴직</span>' : s === 'left' ? '<span class="pill p-mute">퇴사</span>' : '<span class="pill p-ok">근무</span>';
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
H.jobLabor = j => (j.assignments||[]).filter(a => a.status === 'approved').reduce((n,a) => n + (+a.pay_amount||0) + (+a.extra_amount||0), 0);
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
  S.teams = tm; S.staffAll = st; S.staff = st.filter(x => !x.hidden); S.settings = Object.fromEntries(set.map(r => [r.key, r.value]));
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
    H.q(sb.from('job_photos').select('id,job_id,path,stage,memo,hidden,created_at,staff_id').order('created_at', {ascending:false}).limit(2000))
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
const ORDER = ['home','team','chat','sched','ops','promo','money','staff'];
H.cur = () => { const h = (location.hash||'').replace('#',''); const k = h.split('/')[0]; return H.views[k] && (!H.views[k].owner || H.S.owner) ? k : 'home'; };
H.go = k => { if (location.hash !== '#'+k) location.hash = k; else H.render(); };

H.untilTxt = u => { if (!u) return ''; const d = new Date(u), p = n => String(n).padStart(2,'0');
  return d.toDateString() === new Date().toDateString() ? ` ~${p(d.getHours())}:${p(d.getMinutes())}` : ` ~${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
H.bossChip = () => {
  const b = H.S.boss || {state:'근무중'};
  const cls = b.state === 'Busy' ? 'busy' : b.state === '근무중' ? '' : 'away';
  const until = H.untilTxt(b.until);
  return H.S.owner ? `<button class="bstat ${cls}" data-a="bossSheet" title="직원 화면 맨 위에 보여요"><i></i>${H.esc(b.state)}${H.esc(until)} ▾</button>`
    : `<span class="bstat ${cls}" title="대표님 상태"><i></i>대표님 ${H.esc(b.state)}${H.esc(until)}</span>`;
};

H.render = async () => {
  const S = H.S, k = H.cur(), v = H.views[k];
  document.title = `${S.owner ? 'HQ' : 'HQS'} · ${v.label} · 어닝플레이스`;
  const tabs = ORDER.filter(x => H.views[x] && (!H.views[x].owner || S.owner))
    .map(x => `<a href="#${x}" ${x===k?'aria-current="page"':''}>${H.views[x].label}</a>`).join('');
  const shell = `<header class="top"><div class="topin">
      <div class="brand"><img class="logo" src="../logo.svg" alt=""><div><b>어닝플레이스 ${S.owner ? 'HQ' : 'HQS'}</b><small>${S.owner ? '대표 · 본사 홈' : '본사일정관리팀'}</small></div></div>
      <nav class="tabs" aria-label="메뉴">${tabs}</nav>
      <div class="me">${S.isOwner ? `<button class="mode ${S.owner?'owner':'mgr'}" data-a="modeSwap" title="${S.owner?'눌러서 관리자(HQS) 화면 보기':'눌러서 대표 화면으로 돌아가기'}" style="border:0;cursor:pointer">${S.owner?'대표 모드 ⇄':'관리자 모드 · 미리보기 ⇄'}</button>` : `<span class="mode mgr">관리자 모드</span>`}${H.bossChip()}<span style="color:var(--sub)">${H.esc(S.name||'')}</span><button class="btn ghost sm" data-a="logout">로그아웃</button></div>
    </div></header><main class="wrap" id="main"><div class="spin"></div></main>`;
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
  location.href = location.pathname + (location.hash || ''); };
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
H.ACT.bossSheet = () => { if (!H.S.owner) return H.toast('대표 상태는 대표님만 바꿀 수 있어요');
  const b = H.S.boss || {state:'근무중'};
  const states = ['근무중','외근중','현장','휴가중','부재','Busy'];
  const u = b.until ? new Date(b.until) : null;
  const loc = u ? new Date(u.getTime() - u.getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
  H.open(`<form data-f="boss"><h3>대표 상태</h3>
    <p class="note" style="margin:-6px 0 12px">직원 화면 오른쪽 위에 보여요. 평소엔 '자동 (캘린더)' — 일정 보고 현장·내근·회의를 알아서 표시해요. 여기서 고르면 끝나는 시간까지 이게 먼저 보여요.</p>
    <div class="chips" style="margin-bottom:12px">${states.map(s=>`<label><input type="radio" name="state" value="${s}" ${b.state===s?'checked':''}><span>${s==='근무중'?'자동 (캘린더)':s}</span></label>`).join('')}</div>
    <div class="fg"><div class="field full"><label>한 줄 메모 (직원에게 보임)</label><input name="memo" value="${H.esc(b.memo||'')}" placeholder="예) 급한 건 전화 · 신봉진 실장에게"></div>
    <div class="field"><label>언제까지</label><input type="datetime-local" name="until" value="${loc}"></div>
    <div class="field"><label>&nbsp;</label><div class="chips">${[['1h','1시간'],['3h','3시간'],['eod','오늘 끝까지']].map(([k,l])=>`<label><input type="radio" name="quick" value="${k}"><span>${l}</span></label>`).join('')}</div></div></div>
    <p class="note">Busy로 두면 직원 화면에 "Busy ~시간 · 급한 건 전화"로 보여요. 본사 홈은 잠기지 않아요.</p>
    ${H.sacts('저장')}</form>`);
};
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
    H.S.needV3 = (ver.data||0) < 3; H.S.needV4 = (ver.data||0) < 4; H.S.needV5 = (ver.data||0) < 5; H.S.needV6 = (ver.data||0) < 6; H.S.needV7 = (ver.data||0) < 7; H.S.needV8 = (ver.data||0) < 8;
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
