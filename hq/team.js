/* 지금 우리 팀 — 청소는 현장판, 부동산은 사람판 (직원 화면엔 안 보임, 부동산은 대표 화면에만) */
(function(H){
const {esc} = H;
const SITE_MIN = 240; // 현장 1건 = 4시간 기준
const hm = t => t ? String(t).slice(0,5) : '';
const mins = t => { if (!t) return null; const [h,m] = String(t).split(':'); return (+h)*60 + (+m||0); };
const nowMin = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); };
const clock = d => { d = new Date(d); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); };
const isToday = t => t && new Date(t).toDateString() === new Date().toDateString();

H.teamData = () => {
  const S = H.S, today = H.ymd(H.today()), now = nowMin();
  const appr = j => (j.assignments||[]).filter(a => a.status === 'approved');
  // 청소 현장
  const yday = H.ymd(H.addDays(H.today(), -1));
  const mk = day => (S.jobs||[]).filter(j => j.job_date === day && j.status !== 'cancelled' && j.status !== 'quote').map(j => {
    const ppl = appr(j).map(a => H.P(a.staff_id));
    const partner = H.isPartner(j) && ppl.some(p => p.team === 'PRT');   // 직영 현장에 지원 온 도급 사장님은 일반 인원
    const boss = (j.boss_on && !ppl.length) || (!ppl.length && j.status === 'full'); // 대표 현장 (배정 없이 마감)
    const crewN = H.crewN(j);
    const lead = (j.collector_id && appr(j).some(a => a.staff_id === j.collector_id)) ? H.P(j.collector_id) : (appr(j).map(a => H.P(a.staff_id)).find(p => /팀장|실장/.test(p.role||'')) || null);   // 그날 팀장 = 수금 담당   // 직원 + 대표님 + 외부지원 (도급 확정이면 정원)
    const st = mins(j.start_time), ph = H.photosOf(j.id), done = j.work_done_at || j.done_at;
    const el = st == null ? null : now - st;
    let state = done ? 'done' : (st != null && el >= 0) ? (el > SITE_MIN + 60 ? 'over' : 'on') : 'next';
    const warn = [], info = [];
    if (!done && !partner && !boss && j.headcount && crewN < j.headcount) warn.push(`인원 ${j.headcount - crewN}명 부족`);
    if (state === 'on' && el >= 60 && !ph.length && !boss) warn.push(`${Math.floor(el/60)}시간째 사진 0장`);
    if (state === 'over') warn.push('끝날 시간 지남 · 작업 끝 안 누름');
    if (j.collector_id && +j.balance_amount && !j.collected_at && done) info.push(`잔금 ${H.won(j.balance_amount)} · 수금 대기`);
    return {j, ppl, crewN, lead, partner, boss, state, warn, info, ph, done, el, prog: el == null ? 0 : Math.max(0, Math.min(1, el / SITE_MIN))};
  });
  const sites = mk(today), ysites = mk(yday);
  const rank = s => s.warn.length ? 0 : s.state === 'on' ? 1 : s.state === 'next' ? 2 : 3;
  sites.sort((a,b) => rank(a) - rank(b) || (mins(a.j.start_time)||0) - (mins(b.j.start_time)||0));
  const busy = new Set(sites.flatMap(s => s.ppl.map(p => p.id)));
  const free = (S.staff||[]).filter(s => s.status === 'active' && ['OPS','SPT'].includes(s.team) && s.role !== '대표' && !busy.has(s.id))
    .map(s => ({s, ok: (S.avail||[]).some(a => a.staff_id === s.id && a.day === today && a.kind === 'ok'), no: (S.avail||[]).some(a => a.staff_id === s.id && a.day === today && a.kind === 'no')}))
    .filter(x => !x.no).sort((a,b) => b.ok - a.ok);

  // 부동산 사람 (대표 화면만)
  let people = [];
  if (S.owner) {
    const mm = (S.mm && S.mm.all || []).map(r => ({agent:r[0], status:r[3], reg:r[2], chk:r[18]}));
    people = (S.staff||[]).filter(s => s.status === 'active' && s.team === 'RES' && s.role !== '대표').map(s => {
      const evs = (S.events||[]).filter(e => e.staff_id === s.id && e.ev_date === today).sort((a,b) => (a.ev_time||'').localeCompare(b.ev_time||''));
      const curE = evs.find(e => { const t = mins(e.ev_time); return t != null && now >= t && now < t + 60; });
      const nextE = evs.find(e => { const t = mins(e.ev_time); return t != null && t > now; });
      const mine = mm.filter(r => r.agent === s.name);
      const reg = mine.filter(r => r.reg === today).length, chk = mine.filter(r => r.chk === today).length;
      const stale = mine.filter(r => r.status === '진행' && (!r.chk || (Date.now() - new Date(r.chk + 'T00:00:00')) / 864e5 > 30)).length;
      const seenToday = isToday(s.last_seen_at) || reg || chk;
      const wk = (S.avail||[]).find(x => x.staff_id === s.id && x.day === today), wkT = wk && wk.kind === 'work' && wk.memo ? wk.memo.split('-') : null;   // v35 출근표
      const inOffice = wkT && now >= mins(wkT[0]) && now < mins(wkT[1]);
      let icon, now_;
      if (wk && wk.kind === 'no' && !curE) { icon = '🌙'; now_ = '오늘 휴무' + (nextE ? ` · ${hm(nextE.ev_time)} ${nextE.kind}` : ''); }
      else if (curE) { icon = '🚗'; now_ = `${curE.kind} 중 ~${clock(new Date(new Date().setHours(0, mins(curE.ev_time) + 60, 0, 0)))}${curE.maemul_id ? ' · ' + curE.maemul_id : ''}`; }
      else if (inOffice) { icon = '🏢'; now_ = `사무실 ${wkT[0]}~${wkT[1]}` + (nextE ? ` · 다음 ${hm(nextE.ev_time)} ${nextE.kind}` : ''); }
      else if (wkT && now < mins(wkT[0])) { icon = '⏰'; now_ = `오늘 ${wkT[0]} 출근 예정` + (nextE ? ` · ${hm(nextE.ev_time)} ${nextE.kind}` : ''); }
      else if (seenToday) { icon = '🏢'; now_ = '근무 중' + (wkT ? ` (출근표 ${wkT[0]}~${wkT[1]})` : '') + (nextE ? ` · 다음 ${hm(nextE.ev_time)} ${nextE.kind}` : ''); }
      else { icon = '💤'; now_ = '오늘 접속 없음' + (nextE ? ` · ${hm(nextE.ev_time)} ${nextE.kind} 예정` : ''); }
      // 1107: 출근표에 출근 잡힌 날만 경고 (주말·안 나오는 날은 접속 없어도 정상)
      const warn = !curE && !seenToday && !!wkT && now >= mins(wkT[0]) + 60;
      return {s, icon, now: now_, reg, chk, stale, warn, evN: evs.length, seen: s.last_seen_at};
    }).sort((a,b) => b.warn - a.warn || (a.icon === '🚗' ? -1 : 0));
  }
  // 아고 파트너 (대표 화면만, 일정 기준)
  const partners = !S.owner ? [] : (S.staff||[]).filter(s => s.status === 'active' && s.team === 'AGO').map(s => {
    const evs = (S.events||[]).filter(e => e.staff_id === s.id && e.ev_date === today).sort((a,b) => (a.ev_time||'').localeCompare(b.ev_time||''));
    const curE = evs.find(e => { const t = mins(e.ev_time); return t != null && now >= t && now < t + 120; });
    const nextE = evs.find(e => { const t = mins(e.ev_time); return t != null && t > now; });
    const icon = curE ? ({'촬영':'🎬','라이브':'🎤','미팅':'🤝','교육':'📚'}[curE.kind] || '📌') : nextE ? '🗓' : '·';
    const now_ = curE ? `${curE.kind} 중${curE.title?' · '+curE.title:''}` : nextE ? `다음 ${hm(nextE.ev_time)} ${nextE.kind}${nextE.title?' · '+nextE.title:''}` : '오늘 함께하는 일정 없음';
    return {s, icon, now: now_, seen: s.last_seen_at, evN: evs.length};
  });
  const warnN = sites.filter(x => x.warn.length).length + people.filter(p => p.warn).length;
  return {sites, ysites, free, people, partners, warnN};
};

const TONE = {on:['on','작업 중'], next:['mute','예정'], done:['ok','작업 끝'], over:['bad','작업 중']};
function siteCard(x){
  const j = x.j, [tc, tl] = TONE[x.state];
  const lead = x.ppl.find(p => /팀장|실장/.test(p.role||'')) || x.ppl[0];
  const empty = !x.partner && j.headcount > x.crewN && x.state !== 'done' ? j.headcount - x.crewN : 0;
  // 이름 누르면 연락 (v1104) — 대표님 본인은 그냥 표시
  const call = (name, phone, cls, label) => phone ? `<i class="${cls} call" data-a="tmCall" data-n="${esc(name)}" data-p="${esc(phone)}" role="button">${label}</i>` : `<i class="${cls}">${label}</i>`;
  const extra = (j.boss_on ? '<i class="lead">대표</i>' : '') + H.helpers(j).map(h => call(h.name, h.phone, '', `외부 ${esc(h.name)}`)).join('');
  const c = j.cs || {}, bad = !!(c.claim || c.revisit);
  return `<div class="tm-site ${x.warn.length?'warn':x.partner?'prt':x.state}${bad?' cs':''}">
    <div class="r1"><b>${esc(j.title)}</b><span class="tm">${hm(j.start_time)||'시간 미정'}~ <a href="#sched" class="go">일정 ›</a></span></div>
    <div class="ldr">🧑‍💼 현장 책임자 <b>${x.lead ? esc(x.lead.name) + (x.lead.role ? ' ' + esc(x.lead.role) : '') : x.boss || j.boss_on ? '대표' : '<span class="no">수금 담당 없음</span>'}</b></div>
    <div class="ppl">${x.boss ? '<i class="lead">대표 현장</i>' : x.partner ? '<span class="tg prt">도급 파트너</span> ' + x.ppl.map(p => call(p.name, p.phone, '', esc(p.name))).join('')
      : `<span class="n">${x.crewN}${j.headcount?'/'+j.headcount:''}인</span>${extra}${x.ppl.map(p => call(p.name, p.phone, p===lead&&!j.boss_on?'lead':'', `${esc(p.name)}${p.role&&p===lead?' '+esc(p.role):''}`)).join('')}${empty?`<i class="empty">+${empty} 비었음</i>`:''}`}</div>
    <div class="st"><span class="tg ${tc}">${x.state==='done'?'✅ '+tl+' '+clock(x.done):tl}</span>${!x.done && (x.partner || x.boss || (j.headcount && x.crewN >= j.headcount)) ? '<span class="tg okc">👥 인원 확정</span>' : ''}${x.warn.map(w => `<span class="tg bad">⚠ ${esc(w)}</span>`).join('')}
      ${x.ph.length?`<span>📸 ${x.ph.length}장 · 마지막 ${clock(x.ph[0].created_at)}</span>`:''}${j.live_views?`<span>👀 고객님 ${j.live_views}번 봄</span>`:''}${x.info.map(t => `<span>${esc(t)}</span>`).join('')}</div>
    ${x.state==='on'||x.state==='over'?`<div class="bar"><i style="width:${Math.round(x.prog*100)}%"></i></div>`:''}
    <div class="csr"><label class="csk"><input type="checkbox" data-c="tmCsOn" data-j="${j.id}" ${bad?'checked':''}> ⚠ 사고</label>
      ${bad ? `<input class="in sm csm" data-c="tmCsWhy" data-j="${j.id}" value="${esc(c.claim||'')}" placeholder="사유 (예: 욕실 곰팡이 남았다고 연락 옴)">` : '<span class="cs0">문제 생기면 체크하고 사유를 적어요</span>'}</div></div>`;
}
function personRow(p){
  return `<div class="tm-per ${p.warn?'warn':''}">${H.av(p.s, 40)}
    <div><b>${esc(p.s.name)} ${esc(p.s.role||'')}</b><div class="now">${p.icon} ${esc(p.now)}</div>
    <div class="meta">오늘 등록 ${p.reg} · 확인 ${p.chk}${p.evN?` · 일정 ${p.evN}건`:''}${p.stale?` · <span style="color:var(--warn)">30일 미확인 ${p.stale}건</span>`:''}</div></div>
    <div class="rt"><strong>${p.seen ? H.ago(p.seen) : '-'}</strong>접속</div></div>`;
}

// 홈 맨 위 아이콘 줄
H.teamStrip = () => {
  const d = H.teamData(), S = H.S;
  if (!d.sites.length && !d.people.length && !(d.partners||[]).length) return '';
  // 오늘 청소 현장: 투입된 사람 얼굴 (사람 없으면 🧹 아이콘)
  const ST = {on:'작업 중', over:'작업 중', next:'예정', done:'작업 끝'};
  // 1107: 같은 사람이 오전·오후 여러 현장이면 얼굴 하나로 합침 (지금 하는 곳 우선: 작업 중 > 예정 > 끝)
  const RK = {on:3, over:3, next:2, done:1}, byP = new Map(), empt = [];
  d.sites.forEach(x => { if (!x.ppl.length) { empt.push(x); return; }
    x.ppl.forEach(p => { const k = p.id || p.name, o = byP.get(k) || {p, xs:[]}; o.xs.push(x); byP.set(k, o); }); });
  const sIc = [...byP.values()].map(({p, xs}) => {
      const x = xs.slice().sort((a, b) => RK[b.state] - RK[a.state])[0], warn = xs.some(y => y.warn.length);
      const tip = xs.map(y => `${y.j.start_time ? y.j.start_time.slice(0,5)+' ' : ''}${y.j.title} · ${ST[y.state]}`).join('\n');
      return `<span class="tm-ic cln ${warn?'warn':x.state}" title="${esc(p.name)}${xs.length>1?' · '+xs.length+'곳':''}\n${esc(tip)}">${H.av(p, 34)}<em>${xs.every(y=>y.state==='done')?'✅':'🧹'}</em></span>`; }).join('')
    + empt.map(x => `<span class="tm-ic ${x.warn.length?'warn':x.state}" title="${esc(x.j.title)}">🧹<em>${x.boss?'대표':0}</em></span>`).join('');
  const pIc = d.people.map(p => `<span class="tm-ic res ${p.warn?'warn':''}" title="${esc(p.s.name)} · ${esc(p.now)}">${H.av(p.s, 34)}<em>${p.icon}</em></span>`).join('');
  const gIc = (d.partners||[]).map(p => `<span class="tm-ic ago" title="${esc(p.s.name)} 사장님 · ${esc(p.now)}">${H.av(p.s, 34, 'ago')}<em>${p.icon}</em></span>`).join('');
  return `<a class="box tm-strip" href="#team"><div class="tm-sh"><b>지금 우리 팀</b>${d.warnN?`<span class="tg bad">⚠ ${d.warnN}</span>`:''}<span class="go">자세히 →</span></div>
    <div class="tm-icons">${sIc}${sIc&&pIc?'<i class="sep"></i>':''}${pIc}${gIc?'<i class="sep"></i>'+gIc:''}</div></a>`;
};

H.view('team', {label:'팀',
  async load(){
    const T = H.today();
    await H.loadRange(H.addDays(T,-1), H.addDays(T,1));
    if (H.S.owner && !H.S.mm) await H.loadMaemul();
    try { await loadMonthStats(); } catch(_){}   // 대표님·HQS 관리자
  },
  render(){
    const d = H.teamData(), S = H.S, on = d.sites.filter(x => x.state === 'on' || x.state === 'over');
    const n = new Date(), when = `${n.getMonth()+1}월 ${n.getDate()}일(${'일월화수목금토'[n.getDay()]}) ${clock(n)}`;
    return `<section class="box"><div class="tm-head"><div><h2>지금 우리 팀</h2><small>${when} · 자동으로 갱신돼요</small></div><button class="btn sm ghost" data-a="teamRefresh">새로고침</button></div>
      <div class="chips2"><span>🧹 현장 ${on.length}곳 진행 · ${on.reduce((a,x)=>a+x.ppl.length,0)}명</span><span>✅ ${d.sites.filter(x=>x.state==='done').length}곳 끝</span>${S.owner?`<span>🏠 부동산 ${d.people.length}명</span>`:''}${d.warnN?`<span class="w">⚠ 확인 ${d.warnN}건</span>`:''}</div></section>
    <div class="${S.owner?'g2':''}">
      <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--clean)"></i>클린 현장판 <span class="sub">오늘 ${d.sites.length}곳</span></h3><a class="btn sm ghost" href="#sched">일정판 →</a></div>
        <div class="tm-sites">${d.sites.map(siteCard).join('') || '<div class="note">오늘 클린 현장이 없어요</div>'}</div>
        ${d.ysites.length ? `<details class="tm-yd" ${S.tmYd?'open':''}><summary data-a="tmYd">어제 현장 ${d.ysites.length}곳 · 사고 체크${d.ysites.some(x => x.j.cs && (x.j.cs.claim || x.j.cs.revisit)) ? ' <em>⚠</em>' : ''}</summary><div class="tm-sites" style="margin-top:8px">${d.ysites.map(siteCard).join('')}</div></details>` : ''}
        ${d.free.length?`<div class="tm-free">오늘 일정 없는 사람: ${d.free.map(x => x.ok ? `<b>${esc(x.s.name)} ✓</b>` : esc(x.s.name)).join(' · ')} <span style="opacity:.7">(✓ = 오늘 가능 표시함)</span></div>`:''}</section>
      ${S.owner?`<section class="box"><div class="bh"><h3><i class="dot" style="background:var(--res)"></i>부동산 사람판 <span class="sub">리츠부동산</span></h3>${S.mcode?`<a class="btn sm ghost" href="../maemul/?k=${encodeURIComponent(S.mcode)}">매물노트 →</a>`:''}</div>
        ${d.people.map(personRow).join('') || '<div class="note">근무 중인 부동산 직원이 없어요</div>'}
        <p class="tm-foot">상태는 본인이 넣은 일정(안내·계약·잔금)과 매물노트 활동으로만 정해져요 · 위치 추적 없음</p></section>`:''}
    </div>
    ${S.owner && d.partners.length ? `<section class="box"><div class="bh"><h3><i class="dot" style="background:var(--ago)"></i>아고 파트너판 <span class="sub">레이블 co-work</span></h3></div>
      ${d.partners.map(p => `<div class="tm-per">${H.av(p.s, 40, 'ago')}<div><b>${esc(p.s.name)} ${esc((p.s.role||'사장').replace(/님$/,''))}님</b><div class="now">${p.icon} ${esc(p.now)}</div><div class="meta">오늘 일정 ${p.evN}건</div></div><div class="rt"><strong>${p.seen ? H.ago(p.seen) : '-'}</strong>접속</div></div>`).join('')}</section>` : ''}
    ${statsBox()}
    <p class="tm-foot">직원 화면엔 안 보여요${S.owner?' · 관리자(HQS)에게는 클린 현장판만 보여요':''}</p>`;
  }
});
H.ACT.teamRefresh = () => H.refresh();
H.ACT.tmYd = () => { H.S.tmYd = !H.S.tmYd; };
// 사고 체크 · 사유 (지금 우리 팀 화면에서만) — 팀별 현황 사고 수로 집계
const csSave = async (id, patch) => { const j = (H.S.jobs||[]).find(x => x.id === id); if (!j) return; const c = Object.assign({}, j.cs || {}, patch, {at: new Date().toISOString()});
  await H.q(H.sb.from('jobs').update({cs: c}).eq('id', id)); j.cs = c; };
H.CHANGE.tmCsOn = async el => { const id = +el.dataset.j;
  if (el.checked) { await csSave(id, {claim: '사고', revisit: false}); H.toast('사고로 체크했어요 · 사유를 적어주세요'); H.render(); setTimeout(() => { const i = document.querySelector(`.csm[data-j="${id}"]`); if (i) { i.select(); i.focus(); } }, 50); }
  else { if (!confirm('사고 체크를 풀까요? (사유도 지워져요)')) { el.checked = true; return; } await csSave(id, {claim: '', revisit: false}); H.toast('사고 체크를 풀었어요'); H.render(); } };
H.CHANGE.tmCsWhy = async el => { await csSave(+el.dataset.j, {claim: el.value.trim() || '사고'}); H.toast('사유를 저장했어요'); };
H.ACT.tmCall = (el, e) => { if (e) { e.preventDefault(); e.stopPropagation(); }
  const n = el.dataset.n, p = el.dataset.p, d = String(p).replace(/[^0-9+]/g, '');
  H.open(`<h3>${H.esc(n)}</h3><p class="note" style="margin:-4px 0 14px;font-size:15px">${H.esc(p)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><a class="btn" href="tel:${d}">📞 전화</a><a class="btn ghost" href="sms:${d}">💬 문자</a></div>
    <button class="btn ghost" style="width:100%;margin-top:8px" data-a="close">닫기</button>`); };

/* 대표님만: 이번 달 함께한 현장 카운트 */
async function loadMonthStats(){
  const S = H.S, off = S.tmMon || 0, T = H.today();
  const m0 = new Date(T.getFullYear(), T.getMonth() + off, 1), m1 = new Date(T.getFullYear(), T.getMonth() + off + 1, 0);
  const to = off === 0 ? T : m1;
  const rows = await H.q(H.sb.from('jobs').select('id,job_date,status,boss_on,helpers,collector_id,cs,assignments(staff_id,status)')
    .gte('job_date', H.ymd(m0)).lte('job_date', H.ymd(to)).not('status', 'in', '(cancelled,quote)'));
  S.tmStats = {m: m0.getMonth() + 1, off, rows: rows || []};
}
function monthStats(){
  const st = H.S.tmStats; if (!st) return null;
  const isLead = p => /팀장|실장/.test(p.role || '');
  const add = (o, k) => o[k] = (o[k] || 0) + 1;
  const boss = {n: 0, bad: 0, w: {}, wb: {}}, pair = {}, pairBad = {}, lead = {}; let badN = 0;
  st.rows.forEach(j => {
    const ppl = (j.assignments || []).filter(a => a.status === 'approved').map(a => H.P(a.staff_id)).filter(p => p && p.name !== '?');
    const ld = ppl.find(p => p.id === j.collector_id) || ppl.find(isLead) || (H.isPartner(j) ? ppl.find(p => p.team === 'PRT') : null);   // 그날 팀장 = 수금 담당 (없으면 같이 간 팀장·실장)
    // 대표님도 팀장 밑에서 같이 갔으면 팀원으로 셈 (짝·팀장 카드에 '대표'로)
    const names = ppl.map(p => p.name).concat((j.helpers || []).map(h => '외부 ' + h.name)).concat(j.boss_on && ld ? ['대표'] : []);
    const bad = !!(j.cs && (j.cs.claim || j.cs.revisit)); if (bad) badN++;   // 사고 = 클레임 or 재방문 (운영 › CS·품질)
    if (j.boss_on) { boss.n++; if (bad) boss.bad++; names.filter(n => n !== '대표').forEach(n => { add(boss.w, n); if (bad) add(boss.wb, n); }); }
    for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) { const k = [names[a], names[b]].sort().join(' · '); add(pair, k); if (bad) add(pairBad, k); }
    if (ld) { const L = lead[ld.name] = lead[ld.name] || {p: ld, n: 0, bad: 0, w: {}, wb: {}}; L.n++; if (bad) L.bad++;
      names.filter(n => n !== ld.name).forEach(n => { add(L.w, n); if (bad) add(L.wb, n); }); }
  });
  const pairs = Object.entries(pair).map(([k, c]) => ({k, c, b: pairBad[k] || 0}));
  return {m: st.m, off: st.off, total: st.rows.length, badN, boss,
    good: pairs.filter(x => !x.b && x.c >= 2).sort((a, b) => b.c - a.c).slice(0, 5),
    watch: pairs.filter(x => x.b).sort((a, b) => b.b - a.b || b.c - a.c).slice(0, 5),
    leads: Object.values(lead).sort((a, b) => b.n - a.n)};
}
function statsBox(){
  const d = monthStats(); if (!d) return `<section class="box"><div class="note">함께한 현장 숫자 불러오는 중…</div></section>`;
  const own = H.S.owner, pct = (b, n) => n ? Math.round(b / n * 100) : 0;
  const row = (n, c, b, max) => `<div class="sr"><span class="nm">${esc(n)}</span><span class="sb"><i style="width:${(c - b) / (max || 1) * 100}%"></i><i class="b" style="width:${b / (max || 1) * 100}%"></i></span><span class="c">${c}${b ? `<em>⚠${b}</em>` : ''}</span></div>`;
  const bars = (w, wb, max, prt) => { const e = Object.entries(w).sort((a, b) => b[1] - a[1]); return e.length ? e.map(([n, c]) => row(n, c, wb[n] || 0, max)).join('') : `<p class="note">${prt ? '도급 — 자기 팀 인원으로 가요' : '아직 없어요'}</p>`; };
  const card = (title, sub, n, bad, w, wb, av, prt) => `<div class="lc"><div class="lct">${av}<div class="t"><b>${title}</b><small>${sub}</small></div>
      <div class="rate ${bad ? 'warn' : 'ok'}"><b>${bad ? '⚠ ' + bad : '0'}</b><small>사고 ${pct(bad, n)}%</small></div></div>
      <div class="mem">${bars(w, wb, n, prt)}</div></div>`;
  const bossCard = card(own ? '나 (대표)' : '대표님', `${d.boss.n}곳 같이 감`, d.boss.n, d.boss.bad, d.boss.w, d.boss.wb, '<span class="avme">대표</span>');
  const leadCards = d.leads.map(L => card(`${esc(L.p.name)} ${esc(L.p.team === 'PRT' ? '도급' : (L.p.role || ''))}`, `${L.n}곳 맡음`, L.n, L.bad, L.w, L.wb, H.av(L.p, 40), L.p.team === 'PRT')).join('');
  const plist = (arr, good) => arr.length ? arr.map(x => `<div class="pair"><span class="n">${esc(x.k)}</span><b>${x.c}</b><span class="tag ${good ? 'g' : ''}">${good ? '사고 0' : '⚠ ' + x.b}</span></div>`).join('') : `<p class="note">${good ? '2번 이상 같이 간 짝이 아직 없어요' : '사고 난 짝이 없어요 👍'}</p>`;
  return `<section class="box tm-stat"><div class="bh"><h3>📊 ${d.m}월 함께한 현장 <span class="sub">대표님·관리자만 보여요</span></h3>
      <div class="seg"><button class="${d.off ? '' : 'on'}" data-a="tmMon" data-v="0">이번 달</button><button class="${d.off ? 'on' : ''}" data-a="tmMon" data-v="-1">지난달</button></div></div>
    <div class="kpis"><div class="kpi"><small>${d.off ? '지난달' : '이번 달'} 현장</small><b>${d.total}<i>곳</i></b></div><div class="kpi"><small>대표님 간 현장</small><b>${d.boss.n}<i>곳</i></b></div>
      <div class="kpi ${d.badN ? 'bad' : ''}"><small>사고 (클레임·재방문)</small><b>${d.badN}<i>곳</i></b></div><div class="kpi"><small>사고율</small><b>${pct(d.badN, d.total)}<i>%</i></b></div></div>
    <div class="leads">${bossCard}${leadCards}</div>
    <div class="pairs"><div><h4>👥 잘 맞는 짝 <small>사고 0 · 많이 간 순</small></h4>${plist(d.good, true)}</div><div><h4>⚠ 살펴볼 짝 <small>사고 있었던 짝</small></h4>${plist(d.watch, false)}</div></div>
    <p class="tm-foot">취소·견적 중 현장은 빼요 · 현장 책임자 = 그날 수금 담당, 없으면 같이 간 팀장·실장 · 대표님·실장·팀장도 남이 책임자인 현장에선 팀원으로 셈 · 사고 = 현장판에서 ⚠ 사고 체크한 현장 · 막대 빨강 = 그중 사고</p></section>`;
}
H.ACT.tmMon = async el => { H.S.tmMon = +el.dataset.v; H.S.tmStats = null; H.render(); await loadMonthStats(); H.render(); };
})(window.HQ);

