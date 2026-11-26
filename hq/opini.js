/* 1125d 오피니 매장 칸막이 — 대표 화면만: [어닝플레이스 | 리츠종합클린 | 리츠부동산 | 아고스튜디오] 탭 + 매장별 메뉴
   · 탭 = 회사 이름 + 단계 배지 (단계는 승인된 직원 수로 자동 · 어닝플레이스는 빌리지 샘플이라 '랜드마크')
   · 관리자(HQS) 화면은 그대로 */
(function(H){
const {esc} = H;
// 성장 9단계 (11/25 확정 · 노무 기준선)
H.STAGES = [[1,'팝업'],[2,'부스'],[3,'샵'],[5,'스토어'],[10,'라운지'],[30,'센터'],[50,'타워'],[100,'랜드마크']];
H.stageOf = n => { let r = '팝업'; for (const [m, nm] of H.STAGES) if (n >= m) r = nm; return r; };
H.STORES = [
  {k:'ep',   name:'어닝플레이스', icon:'🏢', fixed:'랜드마크', color:'#1B2240', views:['hqhome','impact','money','staff'],
   lab:{hqhome:'본사 홈', impact:'효과 기록판', money:'경영 (전체 돈)', staff:'직원 (전체)'}},
  {k:'ritz', name:'리츠종합클린', no:1, grp:'CLEAN', color:'#16347A', views:['home','sched','chat','pay','team','ops','promo','impact'],
   lab:{home:'홈', impact:'리츠 효과'}},
  {k:'res',  name:'리츠부동산', no:2, grp:'RES', color:'#4B2A8C', views:['realty'], lab:{realty:'홈'}},
  {k:'ago',  name:'아고스튜디오', no:3, grp:'AGO', color:'#1F4D3A', views:['ago','select'], lab:{ago:'홈', select:'셀렉트'}}
];
H.storeN = st => { if (!st.grp) return 0; const g = H.GROUPS.find(x => x.key === st.grp);
  return (H.S.staff||[]).filter(s => g && g.teams.includes(s.team) && s.status !== 'left').length; };
H.storeStage = st => st.fixed || H.stageOf(Math.max(1, H.storeN(st)));
H.storeOfView = k => { let cur; try { cur = localStorage.getItem('hq_store'); } catch(_){}
  const c = H.STORES.find(s => s.k === cur);
  if (c && c.views.includes(k)) return c;
  return H.STORES.find(s => s.views.includes(k)) || H.STORES[0]; };
H.storeHome = () => { let cur; try { cur = localStorage.getItem('hq_store'); } catch(_){}
  return (H.STORES.find(s => s.k === cur) || H.STORES[0]).views[0]; };
H.ACT.storeGo = el => { const st = H.STORES.find(s => s.k === el.dataset.k); if (!st) return;
  try { localStorage.setItem('hq_store', st.k); } catch(_){}
  H.go(st.views[0]); };
// 대표 화면 위쪽 (매장 탭 + 매장 메뉴)
H.ownerBar = k => {
  const cur = H.storeOfView(k);
  try { localStorage.setItem('hq_store', cur.k); } catch(_){}
  const tabs = H.STORES.map(st => `<button class="stp ${st.k===cur.k?'on':''}" data-a="storeGo" data-k="${st.k}" style="--k:${st.color}">${st.icon ? st.icon + ' ' : `<i></i>`}${esc(st.name)}<small>${H.storeStage(st)}</small></button>`).join('')
    + `<button class="stp add" data-a="opiJoin">＋ 협력사</button>`;
  const sub = cur.views.filter(x => H.views[x]).map(x => `<a href="#${x}" ${x===k?'aria-current="page"':''}>${esc(cur.lab[x] || H.views[x].label)}</a>`).join('');
  return {cur, html:`<div class="stores">${tabs}</div><nav class="snav" style="--k:${cur.color}" aria-label="매장 메뉴">${sub}</nav>`};
};
H.ACT.opiJoin = () => H.open(`<h3>협력사 입점</h3><p class="note" style="line-height:1.7">외부 사장님이 입점하면 여기에 탭이 하나 더 생겨요.<br>첫 협력사는 도급팀 4주 시범으로 시작할 예정이에요 (로드맵 4단계).</p><div class="sacts"><button class="btn" data-a="close">확인</button></div>`);

/* ---------- 본사 홈 (어닝플레이스) ---------- */
const ROAD = [['속도','3단계 끝'],['매장 칸막이','11/25 끝'],['리츠 1호 매장','IBK 실사용'],['첫 협력사 입점','도급팀 시범'],['모듈','업종별 추가'],['2D 단지 안내도','로드맵 화면'],['3D 매장','들어가면 3D']];
H.view('hqhome', {label:'본사 홈', owner:true,
  async load(){
    const T = H.today(), [m0, m1] = H.monthRange(T);
    const r = await H.sb.from('jobs').select('id', {count:'exact', head:true}).gte('job_date', H.ymd(m0)).lte('job_date', H.ymd(m1)).not('status', 'in', '(cancelled,quote)');
    H.S.opJobs = r.error ? null : r.count;
  },
  render(){
    const S = H.S, step = Number(S.settings.opini_step || 3);
    const ppl = (S.staff||[]).filter(s => s.status !== 'left').length + 1;
    const ins = H.STORES.filter(s => s.no);
    const n = st => H.storeN(st);
    const card = st => {
      const m = st.k === 'ritz' ? [[S.opJobs ?? '–', '이번 달 현장'], [n(st), '직원']]
        : st.k === 'res' ? [[n(st), '직원'], ['매물노트', '매물·사진']]
        : [[n(st) || 1, '사람'], ['이내만', '셀렉트']];
      return `<button class="opc" data-a="storeGo" data-k="${st.k}" style="--k:${st.color}"><span class="no">인샵 ${st.no}호 · ${H.storeStage(st)}</span>
        <b>${esc(st.name)}</b><div class="mn">${m.map(([v, l]) => `<div><b>${esc(String(v))}</b><small>${l}</small></div>`).join('')}</div><span class="go">매장 들어가기 ›</span></button>`; };
    return `<section class="ophero"><div class="hl"><span class="chip">오피니 빌리지</span><span class="chip">🏙 어닝플레이스 · 랜드마크 단계</span>
        <h1>어닝 빌리지</h1><p>입점하면 '내 오피니'가 생겨요 — 팝업에서 시작해 랜드마크까지<br>일정 · 직원 · 고객 · 정산을 한 곳에서</p>
        <div class="kp"><div><b>${ins.length}</b><small>인샵</small></div><div><b>0 / 5</b><small>협력사 입점</small></div><div><b>${ppl}</b><small>빌리지 사람</small></div><div><b>${S.opJobs ?? '–'}</b><small>이번 달 현장</small></div></div></div>
        <div class="hr" style="background-image:url(img/village.jpg?v=1127a)"><span>오피니 빌리지 (구상도)</span></div></section>
      <section class="box oprm"><div class="bh"><h3>🗺 오피니 로드맵</h3><span class="note">지금 ${step}단계</span></div>
        <div class="steps">${ROAD.map(([t, s], i) => `<div class="st ${i+1 < step ? 'd' : i+1 === step ? 'n' : ''}"><i>${i+1 < step ? '✓' : i+1}</i><b>${t}</b><small>${s}</small></div>`).join('')}</div></section>
      <div class="oph"><b>🏙 어닝플레이스 인샵 · 협력사</b><small>누르면 그 매장으로 들어가요</small></div>
      <div class="opg">${ins.map(card).join('')}<button class="opc wait" data-a="opiJoin"><span class="no">협력사 · 입점 준비</span><b>＋ 첫 협력사</b><p class="note" style="margin:8px 0 0">도급팀 4주 시범 → 입점</p></button></div>`;
  }});

/* ---------- 리츠부동산 홈 ---------- */
// 대표 화면: 리츠종합클린 [홈]에서는 부동산 칸을 빼고, 리츠부동산 [홈]으로 옮김
const homeRender = H.views.home.render;
H.views.home.render = function(){ H._hideRes = !!H.S.owner; try { return homeRender.call(this); } finally { H._hideRes = false; } };
H.view('realty', {label:'부동산', owner:true,
  load(){ return H.views.home.load(); },
  render(){
    let resBox = ''; try { const d = document.createElement('div'); d.innerHTML = homeRender.call(H.views.home); const x = d.querySelector('section.hm-res'); resBox = x ? x.outerHTML : ''; } catch(_){}
    return this.top() + resBox;
  },
  top(){
    const S = H.S, st = H.STORES.find(s => s.k === 'res'), g = H.GROUPS.find(x => x.key === 'RES');
    const ms = (S.staff||[]).filter(s => g.teams.includes(s.team) && s.status !== 'left');
    return `<section class="box"><div class="bh"><h3>👥 함께하는 사람 · ${ms.length}명</h3><span class="tag" style="background:${st.color}">${H.storeStage(st)}</span></div>
      <div class="oppl">${ms.map(s => `<span>${H.av(s, 24, '')} ${esc(s.name)} <small class="note">${esc(s.role||'')}</small></span>`).join('') || '<span class="note">아직 없어요</span>'}</div></section>`;
  }});

/* ---------- 1126 로드맵 3단계 · 리츠 1호 매장: [홈] 위 '매장 머리' + 매장 정보(간판·색) ---------- */
H.CARE = [[2,'근로계약서 · 4대보험','부스부터'],[5,'연차 · 가산수당 · 주52시간','스토어부터'],[10,'취업규칙 작성 · 신고','10명 이상'],[30,'노사협의회 · 고충처리위원','30명 이상'],[50,'장애인 고용 · 안전보건관리자','50명 이상'],[100,'장애인 고용부담금','100명 이상']];
const NEXT = n => { const i = H.STAGES.findIndex(([m]) => m > n); return i < 0 ? null : H.STAGES[i]; };
const PREV = n => { let r = H.STAGES[0]; for (const x of H.STAGES) if (n >= x[0]) r = x; return r; };
const VAR = st => ({'라운지':'lounge','센터':'lounge','타워':'lounge','랜드마크':'lounge'})[st] || 'box';
const sInfo = k => Object.assign({color:'#3B6FE0', intro:'', tags:[], bname:'', sym:'', mat:'glass', props:[], night:'#FFE7B8', shape:''}, (H.S.settings||{})['opini_store:' + k] || {});
const COLORS = ['#2FBF9F','#3FB6D8','#3B6FE0','#8E62F0','#E0559E','#E08A2E','#E0B22E'];
const won = v => (+v||0).toLocaleString('ko-KR');
// 홈 불러올 때 매장 숫자도 같이 (대표만 · 10분에 한 번)
const homeLoad = H.views.home.load;
H.views.home.load = async function(){
  const r = await homeLoad.apply(this, arguments);
  if (H.S.owner && (!H.S.opAt || Date.now() - H.S.opAt > 6e5)) {
    const T = H.today(), [m0] = H.monthRange(T);
    const [a, b] = await Promise.all([
      H.sb.from('jobs').select('id', {count:'exact', head:true}).gte('job_date', H.ymd(m0)).lte('job_date', H.ymd(T)).not('status', 'in', '(cancelled,quote)'),
      H.sb.rpc('boss_impact', {p_from: H.ymd(m0), p_to: H.ymd(T)})]);
    H.S.opJobsNow = a.error ? null : a.count; H.S.opImp = b.error ? null : b.data; H.S.opAt = Date.now();
  }
  return r; };
H.storeHead = k => {
  const st = H.STORES.find(s => s.k === k); if (!st) return '';
  const n = H.storeN(st), stage = H.storeStage(st), nx = NEXT(n), pv = PREV(n), inf = sInfo(k), d = H.S.opImp;
  const rt = Object.assign({msg:2, cust:2, pay:10}, (H.S.settings||{}).impact_rate || {});
  const hrs = d ? Math.round((d.auto * rt.msg + d.cust_sent * rt.cust + d.pays * rt.pay) / 60) : null;
  const pct = nx ? Math.max(4, Math.min(100, Math.round((n - pv[0]) / (nx[0] - pv[0]) * 100))) : 100;
  const care = (H.S.settings||{}).opini_care || {};
  const items = H.CARE.filter(([m]) => m <= Math.max(n, 1)), nextItem = H.CARE.find(([m]) => m > n);
  return `<section class="osh">
    <div class="ohero" style="--k:${st.color}"><div class="t"><span class="no">인샵 ${st.no}호 · ${stage}</span><h2>${esc(inf.bname || st.name)}</h2><p>${esc(inf.intro || '상가·사무실 청소 · 에그홈케어 · 시설철거')}</p></div>
      <div class="bld" data-a="opiStore" data-k="${k}" role="button" title="내 매장 크게 보기">${H.bld ? H.bld({w:190, h:160, S:8.6, oy:60, v:inf.shape || VAR(stage), c:inf.color, mat:inf.mat, props:inf.props}) : ''}<span class="zm">크게 보기 ›</span></div>
      <div class="gr"><div class="l"><span>함께하는 사람 <b>${n}명</b></span><span>${nx ? `${nx[1]}까지 <b>${nx[0] - n}명</b>` : '<b>최고 단계</b>'}</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="tk"><span>${pv[1]} ${pv[0]}</span><span>${nx ? nx[1] + ' ' + nx[0] : ''}</span></div></div></div>
    <div class="okp"><div><b>${H.S.opJobsNow ?? '–'}곳</b><small>이번 달 현장</small></div><div data-a="go" data-v="impact" role="button"><b>${hrs ?? '–'}시간</b><small>아낀 시간 · 효과 기록판 ›</small></div>
      <div><b>${d ? won(d.cust_sent) : '–'}건</b><small>고객님 방으로 보낸 것</small></div><div><b>${d ? won(d.late_amt) : '–'}</b><small>늦게라도 받아낸 돈</small></div></div>
    <div class="ocd"><h4>🧭 ${stage} 단계에서 챙길 것 <small>참고용 · 노무사 확인</small></h4>
      ${items.map(([m, t, s]) => `<div class="ock" data-a="opiCare" data-m="${m}" role="button"><i class="${care[m] ? 'y' : 'n'}">${care[m] ? '✓' : '!'}</i><span>${t} <small>${s}</small></span>${care[m] ? '' : '<em>눌러서 체크</em>'}</div>`).join('')}
      ${nextItem ? `<div class="ock nx"><i>›</i><span>다음: ${nextItem[1]} <small>${nextItem[0]}명이 되면</small></span></div>` : ''}</div>
    <div class="ocd orow"><div data-a="opiInfo" data-k="${k}" role="button"><span>🎨</span><b>매장 정보 · 간판</b><small>심볼 · 브랜드 색 · 한 줄 소개</small></div>
      <div data-a="go" data-v="impact" role="button"><span>📄</span><b>매장 리포트</b><small>IBK·영업 자료로 내보내기</small></div></div>
  </section>`; };
H.ACT.go = el => H.go(el.dataset.v);
H.ACT.opiCare = async el => { const m = el.dataset.m, c = Object.assign({}, (H.S.settings||{}).opini_care || {}); c[m] = !c[m];
  try { await H.q(H.sb.from('settings').upsert({key:'opini_care', value:c})); H.S.settings.opini_care = c; H.render(); } catch(e){ H.toast('저장 실패 · ' + (e.message||e)); } };
H.ACT.opiInfo = el => { const k = el.dataset.k, st = H.STORES.find(s => s.k === k), inf = sInfo(k), stage = H.storeStage(st), canName = H.storeN(st) >= 10;
  H._opi = {k, inf: JSON.parse(JSON.stringify(inf))};
  H.open(`<h3>🎨 매장 정보</h3><div class="opv" id="opv"></div>
    <form id="opif" class="grid" onsubmit="return false">
    <div class="field full"><label>매장 이름</label><div class="olock"><span>${esc(st.name)}</span><span>🔒 회사 이름</span></div></div>
    <div class="field full"><label>간판 심볼</label><div class="osym"><span class="lg" id="osym">${inf.sym ? `<img src="${esc(H.photoUrl(inf.sym))}" alt="">` : '<i></i>'}</span><p><b>우리 심볼</b><br><span class="note">정사각 로고 이미지 · 빌리지 간판에 들어가요</span></p><label class="btn sm ghost" style="cursor:pointer">바꾸기<input type="file" accept="image/*" data-opisym hidden></label></div></div>
    <div class="field full"><label>브랜드 색 · 유리 라인 · 차양</label><div class="osw">${COLORS.map(c => `<button type="button" data-a="opiColor" data-c="${c}" style="background:${c}" class="${c === inf.color ? 'on' : ''}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="field full"><label>한 줄 소개</label><input name="intro" maxlength="40" value="${esc(inf.intro)}" placeholder="예: 부산 상가·사무실 청소, 사진으로 끝까지 보여드려요"></div>
    <div class="field full"><label>건물 이름 <small style="font-weight:500">라운지(10명)부터 · 12자 · 단계 이름(타워·센터 등)은 못 써요</small></label><input name="bname" maxlength="12" value="${esc(inf.bname)}" ${canName ? '' : 'disabled'} placeholder="비우면 회사 이름 그대로"></div>
    </form><div class="sacts"><button class="btn ghost" data-a="close">닫기</button><button class="btn" data-a="opiSave">저장</button></div>`);
  opv(); };
const opv = () => { const o = H._opi, el = document.getElementById('opv'); if (!o || !el) return; const st = H.STORES.find(s => s.k === o.k);
  el.innerHTML = `<span class="nm">${esc(st.name)} · ${H.storeStage(st)}</span>` + (H.bld ? H.bld({w:340, h:190, S:11, oy:68, v:VAR(H.storeStage(st)), c:o.inf.color}) : ''); };
H.ACT.opiColor = el => { if (!H._opi) return; H._opi.inf.color = el.dataset.c; document.querySelectorAll('.osw button').forEach(b => b.classList.toggle('on', b === el)); opv(); };
document.addEventListener('change', async e => { const i = e.target.closest && e.target.closest('[data-opisym]'); if (!i || !H._opi) return;
  const f = i.files && i.files[0]; if (!f) return; const path = `opini/${H._opi.k}-sym-${Date.now()}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`;
  H.toast('심볼 올리는 중…'); const {error} = await H.sb.storage.from('live').upload(path, f, {contentType: f.type || 'image/jpeg', cacheControl: '31536000'});
  if (error) return H.toast('올리기 실패 · ' + error.message); H._opi.inf.sym = path; const lg = document.getElementById('osym'); if (lg) lg.innerHTML = `<img src="${esc(H.photoUrl(path))}" alt="">`; H.toast('심볼 바꿨어요 · 저장을 눌러주세요'); });
H.ACT.opiSave = async () => { const o = H._opi, f = document.getElementById('opif'); if (!o || !f) return;
  const bn = (f.bname.value || '').trim(); if (/타워|센터|랜드마크|라운지|스토어|빌리지|팝업|부스|샵/.test(bn)) return H.toast('건물 이름에 단계 이름(타워·센터 등)은 못 써요');
  const v = Object.assign({}, o.inf, {intro: f.intro.value.trim(), bname: bn});
  try { await H.q(H.sb.from('settings').upsert({key:'opini_store:' + o.k, value:v})); H.S.settings['opini_store:' + o.k] = v; H.close(); H.toast('저장했어요'); H.render(); } catch(e){ H.toast('저장 실패 · ' + (e.message||e)); } };

/* ---------- 1126 내 매장 크게 보기 (건물 누르면 전체 화면 · 아래 꾸미기 바) ---------- */
const MATS = [['glass','유리','linear-gradient(135deg,#9DB4E8,#E6EEFF 55%,#7C93CC)'],['wood','우드','#B07A45'],['white','화이트','#F2EEE7'],['brick','벽돌','#B85A3E']];
const PROPS = [['pot','🪴','화분'],['para','⛱️','파라솔'],['bench','🪑','벤치']];
const LOCKED = [['💡','밤 조명','줄어든 시간 10h'],['🌳','나무','타운 소식 첫 글'],['⛲','분수','프리미엄'],['🚐','업무 차','현장 50곳']];
const NIGHT = ['#FFE7B8','#BFE3FF','#FFD1E8'];
const SHAPES = {one:[['box','유리 박스형'],['corner','코너 테라스형'],['twin','2동 연결형']], two:[['lounge','2층 테라스형']]};
const shapesOf = st => ['라운지','센터','타워','랜드마크'].includes(st) ? SHAPES.two : SHAPES.one;
const O = {};   // 지금 열린 매장
const draw = () => { const el = document.getElementById('opsS'); if (!el || !O.k) return; const w = Math.min(innerWidth, 560);
  el.innerHTML = H.bld({w, h:Math.round(w * 1.05), S:w / 18.5, oy:Math.round(w * 0.4), v:O.inf.shape || VAR(O.stage), c:O.inf.color, mat:O.inf.mat, props:O.inf.props});
  el.firstChild.style.transform = O.flip ? 'scaleX(-1)' : ''; };
const pane = () => { const t = O.tab, i = O.inf, el = document.getElementById('opsP'); if (!el) return;
  document.querySelectorAll('#opst .otab button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  el.innerHTML = t === 'color' ? `<h5>브랜드 색 · 유리 라인 · 차양 · 파라솔</h5><div class="osw">${COLORS.map(c => `<button data-a="opsSet" data-f="color" data-v="${c}" style="background:${c}" class="${c===i.color?'on':''}"></button>`).join('')}</div>
      <h5>밤 조명 색 <small>밤에 빌리지에서 보여요</small></h5><div class="osw">${NIGHT.map(c => `<button data-a="opsSet" data-f="night" data-v="${c}" style="background:${c}" class="${c===i.night?'on':''}"></button>`).join('')}</div>`
    : t === 'mat' ? `<h5>외벽 재질</h5><div class="omat">${MATS.map(([k, n, bg]) => `<button data-a="opsSet" data-f="mat" data-v="${k}" class="${k===i.mat?'on':''}"><i style="background:${bg}"></i>${n}</button>`).join('')}</div><p class="note" style="margin:10px 0 0">💡 유리는 안이 보여서 '일하는 모습'이 잘 보여요</p>`
    : t === 'prop' ? `<div class="oprop">${PROPS.map(([k, e, n]) => `<button data-a="opsProp" data-v="${k}" class="${(i.props||[]).includes(k)?'on':''}"><span>${e}</span>${n}</button>`).join('')}${LOCKED.map(([e, n, c]) => `<button class="lk" data-a="opsLock" data-v="${c}"><span>${e}</span>${n}<small>${c}</small></button>`).join('')}</div>`
    : t === 'sign' ? `<div class="osym"><span class="lg">${i.sym ? `<img src="${esc(H.photoUrl(i.sym))}" alt="">` : '<i></i>'}</span><p><b>간판 심볼 · 한 줄 소개 · 건물 이름</b><br><span class="note">${esc(i.intro || '아직 소개가 없어요')}</span></p><button class="btn sm ghost" data-a="opiInfo" data-k="${O.k}">바꾸기</button></div>`
    : `<h5>건물 모양 <small>${O.stage} 단계에서 고를 수 있는 것</small></h5><div class="omat">${shapesOf(O.stage).map(([k, n]) => `<button data-a="opsSet" data-f="shape" data-v="${k}" class="${(i.shape || VAR(O.stage))===k?'on':''}">${n}</button>`).join('')}</div><p class="note" style="margin:10px 0 0">단계가 올라가면 모양이 더 열려요</p>`;
};
H.ACT.opiStore = el => { const k = el.dataset.k, st = H.STORES.find(s => s.k === k); if (!st) return;
  Object.assign(O, {k, st, stage:H.storeStage(st), inf:JSON.parse(JSON.stringify(sInfo(k))), tab:'color', flip:false});
  O.orig = JSON.stringify(O.inf);
  const td = H.ymd(H.today()), js = (H.S.jobs||[]).filter(j => j.job_date === td && !['cancelled','quote'].includes(j.status));
  const onSite = new Set(js.flatMap(j => (j.assignments||[]).filter(a => a.status === 'approved').map(a => a.staff_id))).size;
  let d = document.getElementById('opst'); if (d) d.remove(); d = document.createElement('div'); d.id = 'opst';
  d.innerHTML = `<div class="otb"><button class="ox" data-a="opsClose" aria-label="닫기">✕</button><div class="onm"><b>${esc(O.inf.bname || st.name)}</b><small>인샵 ${st.no}호 · ${O.stage} · ${H.storeN(st)}명</small></div><button class="ovl" data-a="opsVillage">🏘 빌리지</button></div>
    <div class="olive"><span>🧹 오늘 현장 ${js.length}곳 · ${onSite}명</span></div>
    <div class="ostg" id="opsS"></div><button class="orot" data-a="opsFlip">↻ 돌려보기</button>
    <div class="odk"><div class="otab"><button data-a="opsTab" data-t="color">색</button><button data-a="opsTab" data-t="mat">외벽</button><button data-a="opsTab" data-t="prop">소품</button><button data-a="opsTab" data-t="sign">간판</button><button data-a="opsTab" data-t="shape">모양</button></div>
      <div class="opn" id="opsP"></div><div class="osv"><button class="btn ghost" data-a="opsReset">되돌리기</button><button class="btn" data-a="opsSave">저장</button></div></div>`;
  document.body.appendChild(d); document.body.style.overflow = 'hidden'; draw(); pane();
  // 손가락으로 옆으로 밀면 돌려보기
  const sg = d.querySelector('#opsS'); let x0 = null;
  sg.addEventListener('pointerdown', e => { x0 = e.clientX; }); sg.addEventListener('pointerup', e => { if (x0 != null && Math.abs(e.clientX - x0) > 40) { O.flip = !O.flip; draw(); } x0 = null; });
};
H.ACT.opsTab = el => { O.tab = el.dataset.t; pane(); };
H.ACT.opsSet = el => { O.inf[el.dataset.f] = el.dataset.v; draw(); pane(); };
H.ACT.opsProp = el => { const v = el.dataset.v, p = new Set(O.inf.props || []); p.has(v) ? p.delete(v) : (p.add(v), H.toast(`${PROPS.find(x => x[0]===v)[1]} 놓았어요`)); O.inf.props = [...p]; draw(); pane(); };
H.ACT.opsLock = el => H.toast(`🔒 ${el.dataset.v} 되면 열려요`);
H.ACT.opsFlip = () => { O.flip = !O.flip; draw(); };
H.ACT.opsReset = () => { O.inf = JSON.parse(O.orig); draw(); pane(); };
H.ACT.opsVillage = () => H.toast('🏘 빌리지 줌아웃은 로드맵 6단계에서 열려요');
H.ACT.opsClose = () => { const d = document.getElementById('opst'); if (d) d.remove(); document.body.style.overflow = ''; O.k = null; };
H.ACT.opsSave = async () => { const cur = sInfo(O.k), v = Object.assign({}, cur, {color:O.inf.color, night:O.inf.night, mat:O.inf.mat, props:O.inf.props, shape:O.inf.shape});
  try { await H.q(H.sb.from('settings').upsert({key:'opini_store:' + O.k, value:v})); H.S.settings['opini_store:' + O.k] = v; O.orig = JSON.stringify(Object.assign(O.inf, v)); H.toast('저장했어요'); H.ACT.opsClose(); H.render(); }
  catch(e){ H.toast('저장 실패 · ' + (e.message||e)); } };
const homeRender2 = H.views.home.render;
H.views.home.render = function(){ const html = homeRender2.call(this); return H.S.owner && H.storeHead ? H.storeHead('ritz') + html : html; };
})(window.HQ);
