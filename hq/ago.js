/* 🐊 아고스튜디오 — 앱 여러 개를 한눈에 (1124, 대표님 전용)
   · #ago          : 아고 홈 (오늘 챙길 것 · 우리 앱 카드 · 일정 · 바로가기)
   · #ago/inaeman  : 이내만 현황판 (가입 · 접속 · 작품 · 12/8 판단 지표 · 신고)
   이내만 숫자는 이내만 서버의 hq_stats 함수에서 '합계 숫자만' 받아 옴 (개인정보 X)
   연결 정보는 settings.ago_inaeman = {pub, key} — 대표님이 [이내만 연결]에서 한 번 붙여넣음 */
(function(H){
const {esc, sb, won} = H;
const INM_URL = 'https://yrurxmarmyzqetxkwlnx.supabase.co';
const INM_SQL = 'https://supabase.com/dashboard/project/yrurxmarmyzqetxkwlnx/sql/new';
const LAUNCH = '2026-11-24', JUDGE = '2026-12-08';
const DEF_PLAN = ['12/8 이내만 지표 판단일', '12월 이내만 1.0.1 (방명록 손글씨)', '12월 오피니 리츠 실사용 시작', '1월 오피니 외부 업체 3~5곳 시범'];
const DEF_OPINI = {pct: 25, pilots: 0, next: '직원 일정판 · 대화 보관 먼저 (3D는 나중)'};
const dday = d => Math.round((H.parse(d) - H.today()) / 864e5);
const set = k => H.S.settings ? H.S.settings[k] : null;
const saveSet = async (k, v) => { await H.q(sb.from('settings').upsert({key: k, value: v})); H.S.settings[k] = v; };
const n = v => v == null ? '-' : Number(v).toLocaleString('ko-KR');
const pct = (a, b) => b ? Math.round(a / b * 100) : null;
const sealSvg = w => `<svg viewBox="0 0 100 100" width="${w}"><circle cx="50" cy="50" r="44" fill="#6C4DFF"/><circle cx="38" cy="46" r="6" fill="#fff"/><circle cx="62" cy="46" r="6" fill="#fff"/><path d="M41 60 Q50 67 59 60" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;

// 이내만 숫자 가져오기 (실패해도 화면은 뜸)
async function loadInm(){
  const c = set('ago_inaeman'); H.S.inm = null; H.S.inmErr = '';
  if (!c || !c.pub || !c.key) return;
  try {
    const r = await fetch(`${INM_URL}/rest/v1/rpc/hq_stats`, {method: 'POST',
      headers: {apikey: c.pub, Authorization: 'Bearer ' + c.pub, 'Content-Type': 'application/json'},
      body: JSON.stringify({p_key: c.key})});
    const j = await r.json(); if (!r.ok) throw new Error(j.message || j.hint || ('HTTP ' + r.status));
    H.S.inm = j;
  } catch(e){ H.S.inmErr = e.message || String(e); }
}
async function loadSel(){
  H.S.agoSel = null;
  if ((H.S.schemaV || 0) < 47) return;
  try { H.S.agoSel = await H.q(sb.from('select_items').select('status,kc,price,sold,qty,unit_cost')); } catch(_){}
}

H.view('ago', {label:'아고', owner:true,
  async load(){ await Promise.all([loadInm(), loadSel()]); },
  render(){
    const sub = (location.hash.split('/')[1] || '');
    return `<div class="ago">${sub === 'inaeman' ? inmPage() : homePage()}</div>`;
  }
});

/* ---------- 아고 홈 ---------- */
function homePage(){
  const m = H.S.inm, sel = H.S.agoSel, op = Object.assign({}, DEF_OPINI, set('ago_opini') || {});
  const plan = (set('ago_plan') || DEF_PLAN);
  const selLive = sel ? sel.filter(x => x.status === '판매중').length : null;
  const selWait = sel ? sel.filter(x => x.status === '접수').length : 0;
  const selKc = sel ? sel.filter(x => x.kc === '표시없음').length : 0;
  const selNet = sel && H.selCalc ? sel.reduce((a, it) => a + H.selCalc(it).net, 0) : null;
  const todo = [
    m && m.reports_open && ['#DC2626', `이내만 신고 ${m.reports_open}건 처리`, '이내만', '#ago/inaeman'],
    !m && ['#6C4DFF', H.S.inmErr ? '이내만 숫자를 못 불러왔어요 (연결 확인)' : '이내만 현황판 연결하기 (처음 한 번)', '이내만', '!agoLink'],
    selKc && ['#E0A020', `셀렉트 KC·표시 확인 ${selKc}건`, '셀렉트', '#select'],
    selWait && ['#E0A020', `셀렉트 접수 ${selWait}건 · 상품 초안 대기`, '셀렉트', '#select'],
    dday(JUDGE) >= 0 && dday(JUDGE) <= 3 && ['#1E4A37', `이내만 판단일 ${dday(JUDGE) ? 'D-' + dday(JUDGE) : '오늘'} · 지표 확인`, '이내만', '#ago/inaeman']
  ].filter(Boolean);
  const link = (go, inner, cls) => go[0] === '!' ? `<button class="${cls}" data-a="${go.slice(1)}">${inner}</button>` : `<a class="${cls}" href="${go}">${inner}</a>`;
  const appsLive = 1 + (sel ? 1 : 0);

  // 1124: PC(넓은 화면)에선 왼쪽 = 앱 카드(오른쪽에 그래프·단계), 오른쪽 = 챙길 것·이번 주·일정·바로가기 — 폰은 그대로 한 줄
  const daily = (m && m.daily) || [], dmx = Math.max(1, ...daily.map(x => +x.n || 0));
  const spark = daily.length ? (() => { const W = 260, Hh = 64, st = W / Math.max(1, daily.length - 1);
      const pts = daily.map((x, i) => `${Math.round(i * st)},${Math.round(Hh - 4 - (+x.n || 0) / dmx * (Hh - 12))}`).join(' ');
      return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#6C4DFF" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
        <div class="ago-vx">${daily.map((x, i) => `<span>${i === daily.length - 1 ? '오늘' : (+String(x.d).slice(8)) + '일'}<b>${+x.n || 0}</b></span>`).join('')}</div>`; })()
    : '<div class="note">이내만 연결 후 보여요</div>';
  const steps = op.steps || ['✓ 일정판 · 직원 링크', '✓ 팀 대화 · 3년 보관', '● 정산 · 수익 화면', '○ 외부 업체 시범 (1월)'];
  const stepHtml = steps.map(t => { const c = /^✓/.test(t) ? 'ok' : /^●/.test(t) ? 'now' : 'no'; return `<div class="${c}">${esc(t)}</div>`; }).join('');
  const selN = sel ? [['판매 중', selLive], ['접수 대기', selWait], ['판매 완료', sel.filter(x => x.status === '판매완료' || x.sold).length]] : [];
  const selMx = Math.max(1, ...selN.map(x => +x[1] || 0));
  const selViz = sel ? `<div class="ago-bars">${selN.map(([t, v]) => `<div><i style="height:${Math.max(4, (+v || 0) / selMx * 100)}%"></i><b>${v || 0}</b><span>${t}</span></div>`).join('')}</div>` : '<div class="note">셀렉트 업데이트 후 보여요</div>';
  const W7 = ['일','월','화','수','목','금','토'], t0 = H.today(), mon = new Date(t0); mon.setDate(t0.getDate() - ((t0.getDay() + 6) % 7));
  const week = Array.from({length: 7}, (_, k) => { const d = new Date(mon); d.setDate(mon.getDate() + k); return d; });
  const jd = H.parse(JUDGE);

  return `
  <section class="ago-hero">
    <div class="ago-ht"><div class="ago-h1"><span class="ago-croc">🐊</span>아고스튜디오</div>
    <div class="ago-slo">Aah, then Go. 아~ 하는 순간, 바로 만든다.</div></div>
    <div class="ago-sum">
      <div><b>${appsLive}</b><span>운영 중</span></div><div><b>1</b><span>개발 중</span></div>
      <div><b>${m ? n(m.users_new) : '-'}</b><span>이내만 사용자</span></div>
      <div><b class="${todo.length ? 'hot' : ''}">${todo.length}</b><span>챙길 것</span></div>
    </div>
  </section>

  <div class="ago-g"><div class="ago-main">
  <div class="ago-sec">우리 앱 <span class="pc-only">카드 누르면 앱별 현황판</span></div>
  <a class="ago-app" href="#ago/inaeman">
    <span class="ago-ic" style="background:#171225">${sealSvg(36)}</span>
    <span class="ago-tx"><span class="ago-nm">이내만 <em class="live">운영 중 D+${-dday(LAUNCH)}</em></span><small>창작자 플랫폼 · iOS · Android · v1.0</small>
      ${m ? `<span class="ago-kp"><span><b>${n(m.users_new)}</b>가입</span><span><b>${n(m.active_today)}</b>오늘 접속</span><span><b>${m.users_new ? pct(m.makers_new, m.users_new) + '%' : '-'}</b>작품 등록률</span><span><b class="${m.reports_open ? 'warn' : ''}">${n(m.reports_open)}</b>신고</span></span>`
        : `<span class="ago-kp"><span class="note">${H.S.inmErr ? '숫자를 못 불러왔어요 · 눌러서 확인' : '아직 연결 전 · 눌러서 연결'}</span></span>`}
      <span class="ago-nx">📌 다음: 12/8 지표 보고 계속 키울지 판단 (${dday(JUDGE) >= 0 ? 'D-' + dday(JUDGE) : '지남'})</span></span>
    <span class="ago-viz"><span class="ago-vh">최근 7일 가입</span>${spark}</span><span class="ago-ar">›</span></a>
  <button class="ago-app" data-a="agoOpini">
    <span class="ago-ic" style="background:#FFF4C2;font-size:28px">🐤</span>
    <span class="ago-tx"><span class="ago-nm">오피니 <em class="dev">개발 중</em></span><small>사업자 운영 플랫폼 · 직원은 앱 설치 없이 링크 하나로</small>
      <span class="ago-bar"><i style="width:${Math.max(0, Math.min(100, +op.pct || 0))}%"></i></span>
      <span class="ago-kp"><span><b>${+op.pct || 0}%</b>준비</span><span><b>${+op.pilots || 0}/5</b>외부 시범 업체</span><span><b>${(H.S.staff || []).filter(x => x.status !== 'left' && !x.hidden).length}</b>리츠 직원 사용 중</span></span>
      <span class="ago-nx">📌 다음: ${esc(op.next)}</span></span>
    <span class="ago-viz ago-ms"><span class="ago-vh">단계</span>${stepHtml}</span><span class="ago-ar">✎</span></button>
  <a class="ago-app" href="#select">
    <span class="ago-ic" style="background:#1E4A37;color:#C8F04C;font-size:26px;font-weight:900">✓</span>
    <span class="ago-tx"><span class="ago-nm">아고셀렉트 <em class="live">운영 중</em></span><small>쇼핑몰 · 스마트스토어</small>
      ${sel ? `<span class="ago-kp"><span><b>${selLive}</b>판매 중</span><span><b>${selWait}</b>접수 대기</span><span><b>${won(selNet)}</b>순이익</span><span><b class="${selKc ? 'warn' : ''}">${selKc}</b>KC 확인</span></span>` : '<span class="ago-kp"><span class="note">셀렉트 업데이트(v47) 후 보여요</span></span>'}
    </span><span class="ago-viz"><span class="ago-vh">상품 현황</span>${selViz}</span><span class="ago-ar">›</span></a>
  <div class="ago-app dim"><span class="ago-ic" style="background:#EEF1EC;color:#5E7166;font-size:24px">＋</span>
    <span class="ago-tx"><span class="ago-nm">다음 앱 <em class="prep">아이디어</em></span><small>이내만 피드 앱 · 스튜디오 임대 · 쇼호스트 교육 (2027 하반기)</small></span></div>
  </div>

  <div class="ago-side">
  <section class="box"><div class="bh"><h3>오늘 챙길 것</h3><span class="sub">앱 전체에서 모음</span></div>
    ${todo.map(([c, t, tag, go]) => link(go, `<i style="background:${c}"></i><span>${esc(t)}</span><em>${tag}</em>`, 'ago-todo')).join('') || '<div class="note">✓ 급한 일 없어요</div>'}
  </section>
  <section class="box pc-only"><div class="bh"><h3>이번 주</h3></div>
    <div class="ago-wk">${week.map(d => `<div class="${H.ymd(d) === H.ymd(t0) ? 'on' : ''} ${H.ymd(d) === H.ymd(jd) ? 'ev' : ''}">${W7[d.getDay()]}<b>${d.getDate()}</b></div>`).join('')}</div></section>

  <section class="box"><div class="bh"><h3>다가오는 일정</h3><button class="btn sm ghost" data-a="agoPlan">고치기</button></div>
    <div class="ago-tl">${plan.map(l => { const s = String(l).trim(), i = s.indexOf(' ');
      return `<div><b>${esc(i > 0 ? s.slice(0, i) : s)}</b>${esc(i > 0 ? s.slice(i + 1) : '')}</div>`; }).join('')}</div></section>

  <div class="ago-sec">바로가기</div>
  <div class="ago-links">
    <a href="https://appstoreconnect.apple.com/apps" target="_blank" rel="noopener"><i>🍎</i>App Store<br>Connect</a>
    <a href="https://play.google.com/console" target="_blank" rel="noopener"><i>▶</i>Play<br>Console</a>
    <a href="https://supabase.com/dashboard/project/yrurxmarmyzqetxkwlnx" target="_blank" rel="noopener"><i>🗄</i>이내만<br>Supabase</a>
    <a href="https://github.com/aahgostudio" target="_blank" rel="noopener"><i>🐙</i>GitHub</a>
    <a href="https://sell.smartstore.naver.com/" target="_blank" rel="noopener"><i>🛒</i>스마트<br>스토어</a>
    <a href="https://business.kakao.com/dashboard/" target="_blank" rel="noopener"><i>💬</i>카톡 채널<br>관리자</a>
  </div>
  </div></div>`;
}

/* ---------- 이내만 현황판 ---------- */
function inmPage(){
  const m = H.S.inm, c = set('ago_inaeman');
  const head = `<div class="ago-back"><a href="#ago">‹ 아고스튜디오</a></div>`;
  if (!m) return head + `<section class="box"><div class="bh"><h3>이내만 현황판 연결 (처음 한 번)</h3></div>
    ${H.S.inmErr ? `<div class="banner warn" style="margin-bottom:10px">못 불러왔어요: ${esc(H.S.inmErr)}</div>` : ''}
    <p class="note" style="line-height:1.8">1. [SQL 복사] → 이내만 SQL Editor에 붙여넣고 Run<br>2. 맨 아래 나온 <b>연결 키</b>를 복사<br>3. [이내만 연결]에 공개 키 + 연결 키 붙여넣기</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-a="agoSql">SQL 복사</button><a class="btn ghost" href="${INM_SQL}" target="_blank" rel="noopener">이내만 SQL Editor</a><button class="btn ghost" data-a="agoLink">${c ? '연결 다시 하기' : '이내만 연결'}</button></div></section>`;

  const reg = pct(m.makers_new, m.users_new), d1 = pct(m.d1_back, m.d1_base);
  const daily = m.daily || [], mx = Math.max(1, ...daily.map(x => x.n));
  const dl = set('ago_dl') || {};
  const at = new Date(m.at), hh = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
  const jd = dday(JUDGE);
  const say = !m.users_new ? '아직 출시 후 가입자가 없어요. 출시 공지 릴스·카톡 채널 소식을 올려 볼까요?'
    : `출시 후 ${n(m.users_new)}명 가입, 작품 등록률 ${reg}%${d1 != null ? `, 다음 날 재방문 ${d1}%` : ''}.${m.reports_open ? ` 신고 ${m.reports_open}건 먼저 봐 주세요.` : ''}`;

  return head + `
  <section class="ago-hero inm">
    <div class="ago-h1"><span class="ago-croc" style="background:#171225">${sealSvg(26)}</span>이내만 현황<span class="ago-dd">출시 D+${-dday(LAUNCH)}</span></div>
    <div class="ago-slo">${H.md(H.ymd(at))} ${hh} 기준 · <button class="ago-re" data-a="agoReload">새로고침</button></div>
  </section>
  ${m.reports_open ? `<a class="ago-alert" href="https://supabase.com/dashboard/project/yrurxmarmyzqetxkwlnx/editor" target="_blank" rel="noopener">🚨 처리 안 한 신고 <b>${m.reports_open}건</b><span>확인하기</span></a>`
    : `<div class="ago-ok">✓ 처리 안 한 신고 없음</div>`}
  <div class="ago-g2">
    <div class="ago-c"><small>출시 후 가입자</small><b>${n(m.users_new)}<i>명</i></b><em>▲ 오늘 +${n(m.users_today)}</em></div>
    <div class="ago-c"><small>오늘 접속자</small><b>${n(m.active_today)}<i>명</i></b><em>어제 ${n(m.active_yday)}명</em></div>
    <div class="ago-c"><small>출시 후 작품</small><b>${n(m.works_new)}<i>점</i></b><em>▲ 오늘 +${n(m.works_today)}</em></div>
    <div class="ago-c"><small>방명록</small><b>${n(m.guestbook_new)}<i>개</i></b><em>눈도장 ${n(m.stamps_new)}</em></div>
  </div>
  <div class="ago-sec">12/8 판단 지표 <span>${jd > 0 ? 'D-' + jd : jd === 0 ? '오늘' : '지남'}</span></div>
  <section class="box">
    <div class="ago-mr"><span>첫 작품 등록률</span><b>${reg == null ? '-' : reg + '%'}</b></div>
    <div class="ago-bar big"><i style="width:${reg || 0}%"></i></div><div class="note">출시 후 가입자 ${n(m.users_new)}명 중 ${n(m.makers_new)}명이 작품을 1개 이상 올림</div>
    <div class="ago-mr" style="margin-top:14px"><span>다음 날 재방문율</span><b>${d1 == null ? '-' : d1 + '%'}</b></div>
    <div class="ago-bar big gold"><i style="width:${d1 || 0}%"></i></div><div class="note">${m.d1_base ? `가입 다음 날이 지난 ${n(m.d1_base)}명 중 ${n(m.d1_back)}명이 다음 날 다시 들어옴` : '가입 다음 날이 지나야 계산돼요 (내일부터)'}</div>
  </section>
  <div class="ago-sec">일별 가입자 <span>최근 7일</span></div>
  <section class="box"><div class="ago-chart">${daily.map((x, i) => `<div class="${i === daily.length - 1 ? 't' : ''}"><b>${x.n || ''}</b><i style="height:${Math.max(3, x.n / mx * 100)}%"></i>${i === daily.length - 1 ? '오늘' : (+x.d.slice(8)) + '일'}</div>`).join('')}</div></section>
  <div class="ago-sec">스토어 다운로드 <span>스토어 숫자는 1~2일 늦게 · 주 1회 입력</span></div>
  <button class="ago-g2 ago-dlb" data-a="agoDl">
    <div class="ago-c"><small> App Store</small><b>${dl.ios != null ? n(dl.ios) : '-'}</b><em>${dl.on ? H.md(dl.on) + ' 기준' : '눌러서 입력'}</em></div>
    <div class="ago-c"><small>▶ Google Play</small><b>${dl.and != null ? n(dl.and) : '-'}</b><em>${dl.on ? H.md(dl.on) + ' 기준' : '눌러서 입력'}</em></div>
  </button>
  <div class="ago-say">💡 한 줄 요약<br>${esc(say)}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn sm ghost" href="${INM_SQL}" target="_blank" rel="noopener">이내만 SQL Editor</a><a class="btn sm ghost" href="https://supabase.com/dashboard/project/yrurxmarmyzqetxkwlnx/auth/users" target="_blank" rel="noopener">가입자 목록</a><button class="btn sm ghost" data-a="agoLink">연결 다시 하기</button></div>`;
}

/* ---------- 버튼 ---------- */
H.ACT.agoReload = async () => { await loadInm(); H.render(); H.toast(H.S.inm ? '새로 불러왔어요' : '못 불러왔어요'); };
H.ACT.agoSql = async () => { const t = await (await fetch('ago_inaeman.sql', {cache: 'no-store'})).text(); H.copy(t, 'SQL을 복사했어요 · 이내만 SQL Editor에 붙여넣고 Run'); };
H.ACT.agoLink = () => { const c = set('ago_inaeman') || {};
  H.open(`<form data-f="agoLink"><h3>이내만 연결</h3>
    <p class="note" style="line-height:1.7">이내만 서버에서 <b>합계 숫자만</b> 가져와요. 이름·연락처는 안 와요.</p>
    <div class="field"><label>① 이내만 공개 키 (publishable)</label><input name="pub" value="${esc(c.pub || '')}" placeholder="sb_publishable_… 또는 eyJ…" required autocomplete="off">
      <div class="hint">이내만 Supabase › Project Settings › API Keys 의 publishable(또는 anon) 키</div></div>
    <div class="field"><label>② 연결 키</label><input name="key" value="${esc(c.key || '')}" required autocomplete="off">
      <div class="hint">[SQL 복사] 해서 이내만 SQL Editor에서 Run 하면 맨 아래 나오는 키</div></div>
    ${H.sacts('연결하기', `<button type="button" class="btn ghost" data-a="agoSql">SQL 복사</button>`)}</form>`); };
H.FORM.agoLink = async v => {
  const c = {pub: String(v.get('pub')).trim(), key: String(v.get('key')).trim()};
  const old = set('ago_inaeman'); H.S.settings.ago_inaeman = c; await loadInm();
  if (!H.S.inm) { H.S.settings.ago_inaeman = old; return H.toast('연결 못 했어요: ' + H.S.inmErr); }
  await saveSet('ago_inaeman', c); H.close(); H.toast('이내만을 연결했어요'); H.render();
};
H.ACT.agoOpini = () => { const o = Object.assign({}, DEF_OPINI, set('ago_opini') || {});
  H.open(`<form data-f="agoOpini"><h3>오피니 진행 상황</h3><div class="fg">
    <div class="field"><label>준비 (%)</label><input name="pct" type="number" min="0" max="100" value="${+o.pct || 0}"></div>
    <div class="field"><label>외부 시범 업체 (곳)</label><input name="pilots" type="number" min="0" value="${+o.pilots || 0}"></div>
    <div class="field full"><label>다음 할 일</label><input name="next" value="${esc(o.next)}"></div></div>${H.sacts('저장')}</form>`); };
H.FORM.agoOpini = async v => { await saveSet('ago_opini', {pct: +v.get('pct') || 0, pilots: +v.get('pilots') || 0, next: String(v.get('next'))}); H.close(); H.toast('저장했어요'); H.render(); };
H.ACT.agoPlan = () => H.open(`<form data-f="agoPlan"><h3>다가오는 일정</h3><p class="note">한 줄에 하나 · 앞에 날짜, 띄우고 내용 (예: 12/8 이내만 지표 판단일)</p>
  <div class="field"><textarea name="t" rows="7">${esc((set('ago_plan') || DEF_PLAN).join('\n'))}</textarea></div>${H.sacts('저장')}</form>`);
H.FORM.agoPlan = async v => { await saveSet('ago_plan', String(v.get('t')).split('\n').map(s => s.trim()).filter(Boolean)); H.close(); H.toast('저장했어요'); H.render(); };
H.ACT.agoDl = () => { const d = set('ago_dl') || {};
  H.open(`<form data-f="agoDl"><h3>스토어 다운로드 (누적)</h3><p class="note">App Store Connect › 분석, Play Console › 통계에서 누적 숫자를 보고 적어 주세요.</p><div class="fg">
    <div class="field"><label>App Store</label><input name="ios" type="number" min="0" value="${d.ios ?? ''}"></div>
    <div class="field"><label>Google Play</label><input name="and" type="number" min="0" value="${d.and ?? ''}"></div></div>${H.sacts('저장')}</form>`); };
H.FORM.agoDl = async v => { await saveSet('ago_dl', {ios: H.nnum(v.get('ios')), and: H.nnum(v.get('and')), on: H.ymd(H.today())}); H.close(); H.toast('저장했어요'); H.render(); };
})(window.HQ);
