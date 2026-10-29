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
  const sites = (S.jobs||[]).filter(j => j.job_date === today && j.status !== 'cancelled' && j.status !== 'quote').map(j => {
    const ppl = appr(j).map(a => H.P(a.staff_id));
    const partner = ppl.some(p => p.team === 'PRT');
    const boss = (j.boss_on && !ppl.length) || (!ppl.length && j.status === 'full'); // 대표 현장 (배정 없이 마감)
    const st = mins(j.start_time), ph = H.photosOf(j.id), done = j.work_done_at || j.done_at;
    const el = st == null ? null : now - st;
    let state = done ? 'done' : (st != null && el >= 0) ? (el > SITE_MIN + 60 ? 'over' : 'on') : 'next';
    const warn = [], info = [];
    if (!done && !partner && !boss && j.headcount && ppl.length < j.headcount) warn.push(`인원 ${j.headcount - ppl.length}명 부족`);
    if (state === 'on' && el >= 60 && !ph.length && !boss) warn.push(`${Math.floor(el/60)}시간째 사진 0장`);
    if (state === 'over') warn.push('끝날 시간 지남 · 작업 끝 안 누름');
    if (j.collector_id && +j.balance_amount && !j.collected_at && done) info.push(`잔금 ${H.won(j.balance_amount)} · 수금 대기`);
    return {j, ppl, partner, boss, state, warn, info, ph, done, el, prog: el == null ? 0 : Math.max(0, Math.min(1, el / SITE_MIN))};
  });
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
      let icon, now_;
      if (curE) { icon = '🚗'; now_ = `${curE.kind} 중 ~${clock(new Date(new Date().setHours(0, mins(curE.ev_time) + 60, 0, 0)))}${curE.maemul_id ? ' · ' + curE.maemul_id : ''}`; }
      else if (seenToday) { icon = '🏢'; now_ = '근무 중' + (nextE ? ` · 다음 ${hm(nextE.ev_time)} ${nextE.kind}` : ''); }
      else { icon = '💤'; now_ = '오늘 접속 없음' + (nextE ? ` · ${hm(nextE.ev_time)} ${nextE.kind} 예정` : ''); }
      const warn = !curE && !seenToday && now >= 11*60;
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
  return {sites, free, people, partners, warnN};
};

const TONE = {on:['on','작업 중'], next:['mute','예정'], done:['ok','작업 끝'], over:['bad','작업 중']};
function siteCard(x){
  const j = x.j, [tc, tl] = TONE[x.state];
  const lead = x.ppl.find(p => /팀장|실장/.test(p.role||'')) || x.ppl[0];
  const empty = !x.partner && j.headcount > x.ppl.length && x.state !== 'done' ? j.headcount - x.ppl.length : 0;
  return `<a class="tm-site ${x.warn.length?'warn':x.partner?'prt':x.state}" href="#sched">
    <div class="r1"><b>${esc(j.title)}</b><span class="tm">${hm(j.start_time)||'시간 미정'}~</span></div>
    <div class="ppl">${x.boss ? '<i class="lead">대표 현장</i>' : x.partner ? '<span class="tg prt">도급 파트너</span> ' + x.ppl.map(p => esc(p.name)).join('·')
      : `<span class="n">${x.ppl.length}${j.headcount?'/'+j.headcount:''}인</span>${x.ppl.map(p => `<i class="${p===lead?'lead':''}">${esc(p.name)}${p.role&&p===lead?' '+esc(p.role):''}</i>`).join('')}${empty?`<i class="empty">+${empty} 비었음</i>`:''}`}</div>
    <div class="st"><span class="tg ${tc}">${x.state==='done'?'✅ '+tl+' '+clock(x.done):tl}</span>${x.warn.map(w => `<span class="tg bad">⚠ ${esc(w)}</span>`).join('')}
      ${x.ph.length?`<span>📸 ${x.ph.length}장 · 마지막 ${clock(x.ph[0].created_at)}</span>`:''}${j.live_views?`<span>👀 고객님 ${j.live_views}번 봄</span>`:''}${x.info.map(t => `<span>${esc(t)}</span>`).join('')}</div>
    ${x.state==='on'||x.state==='over'?`<div class="bar"><i style="width:${Math.round(x.prog*100)}%"></i></div>`:''}</a>`;
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
  const sIc = d.sites.map(x => x.ppl.length
      ? x.ppl.map(p => `<span class="tm-ic cln ${x.warn.length?'warn':x.state}" title="${esc(p.name)} · ${esc(x.j.title)} · ${ST[x.state]}">${H.av(p, 34)}<em>${x.state==='done'?'✅':'🧹'}</em></span>`).join('')
      : `<span class="tm-ic ${x.warn.length?'warn':x.state}" title="${esc(x.j.title)}">🧹<em>${x.boss?'대표':0}</em></span>`).join('');
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
  },
  render(){
    const d = H.teamData(), S = H.S, on = d.sites.filter(x => x.state === 'on' || x.state === 'over');
    const n = new Date(), when = `${n.getMonth()+1}월 ${n.getDate()}일(${'일월화수목금토'[n.getDay()]}) ${clock(n)}`;
    return `<section class="box"><div class="tm-head"><div><h2>지금 우리 팀</h2><small>${when} · 자동으로 갱신돼요</small></div><button class="btn sm ghost" data-a="teamRefresh">새로고침</button></div>
      <div class="chips2"><span>🧹 현장 ${on.length}곳 진행 · ${on.reduce((a,x)=>a+x.ppl.length,0)}명</span><span>✅ ${d.sites.filter(x=>x.state==='done').length}곳 끝</span>${S.owner?`<span>🏠 부동산 ${d.people.length}명</span>`:''}${d.warnN?`<span class="w">⚠ 확인 ${d.warnN}건</span>`:''}</div></section>
    <div class="${S.owner?'g2':''}">
      <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--clean)"></i>클린 현장판 <span class="sub">오늘 ${d.sites.length}곳</span></h3><a class="btn sm ghost" href="#sched">일정판 →</a></div>
        <div class="tm-sites">${d.sites.map(siteCard).join('') || '<div class="note">오늘 클린 현장이 없어요</div>'}</div>
        ${d.free.length?`<div class="tm-free">오늘 일정 없는 사람: ${d.free.map(x => x.ok ? `<b>${esc(x.s.name)} ✓</b>` : esc(x.s.name)).join(' · ')} <span style="opacity:.7">(✓ = 오늘 가능 표시함)</span></div>`:''}</section>
      ${S.owner?`<section class="box"><div class="bh"><h3><i class="dot" style="background:var(--res)"></i>부동산 사람판 <span class="sub">리츠부동산</span></h3>${S.mcode?`<a class="btn sm ghost" href="../maemul/?k=${encodeURIComponent(S.mcode)}">매물노트 →</a>`:''}</div>
        ${d.people.map(personRow).join('') || '<div class="note">근무 중인 부동산 직원이 없어요</div>'}
        <p class="tm-foot">상태는 본인이 넣은 일정(안내·계약·잔금)과 매물노트 활동으로만 정해져요 · 위치 추적 없음</p></section>`:''}
    </div>
    ${S.owner && d.partners.length ? `<section class="box"><div class="bh"><h3><i class="dot" style="background:var(--ago)"></i>아고 파트너판 <span class="sub">레이블 co-work</span></h3></div>
      ${d.partners.map(p => `<div class="tm-per">${H.av(p.s, 40, 'ago')}<div><b>${esc(p.s.name)} ${esc((p.s.role||'사장').replace(/님$/,''))}님</b><div class="now">${p.icon} ${esc(p.now)}</div><div class="meta">오늘 일정 ${p.evN}건</div></div><div class="rt"><strong>${p.seen ? H.ago(p.seen) : '-'}</strong>접속</div></div>`).join('')}</section>` : ''}
    <p class="tm-foot">직원 화면엔 안 보여요${S.owner?' · 관리자(HQS)에게는 클린 현장판만 보여요':''}</p>`;
  }
});
H.ACT.teamRefresh = () => H.refresh();
})(window.HQ);
