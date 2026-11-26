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
        <div class="hr" style="background-image:url(img/village.jpg?v=1126e)"><span>오피니 빌리지 (구상도)</span></div></section>
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
})(window.HQ);
