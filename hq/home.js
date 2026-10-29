/* 홈 */
(function(H){
const {esc, md, won} = H;
H.view('home', {label:'홈',
  async load(){
    const T = H.today(); const [m0, m1] = H.monthRange(T);
    const from = H.addDays(m0 < H.addDays(T,-35) ? m0 : H.addDays(T,-35), 0), to = H.addDays(T, 21) > m1 ? H.addDays(T,21) : m1;
    await Promise.all([H.loadRange(from, to), H.loadFeed()]);
    const [pu, dl] = await Promise.all([
      H.q(H.sb.from('purchases').select('*').eq('proof_status','요청함')),
      H.q(H.sb.from('deals').select('*').gte('deal_date', H.ymd(m0)).lte('deal_date', H.ymd(m1)))
    ]);
    H.S.puWait = pu; H.S.dealsMonth = dl;
  },
  render(){
    const S = H.S, T = H.today(), today = H.ymd(T), wk = H.ymd(H.addDays(T,6)), ym = today.slice(0,7);
    const jobs = S.jobs.filter(j => j.status !== 'cancelled' && j.status !== 'quote');
    const appr = j => (j.assignments||[]).filter(a=>a.status==='approved');
    const todayJ = jobs.filter(j=>j.job_date===today);
    const weekJ = jobs.filter(j=>j.job_date>=today && j.job_date<=wk);
    const short = jobs.filter(j=>j.job_date>=today && j.job_date<=wk && j.status==='open' && appr(j).length<j.headcount);
    const waiting = jobs.filter(j=>j.job_date>=today).flatMap(j=>(j.assignments||[]).filter(a=>a.status==='applied'));
    const unseen = jobs.filter(j=>j.job_date>=today).reduce((n,j)=>n+appr(j).filter(a=>!a.seen_at||new Date(a.seen_at)<new Date(j.changed_at)).length,0);
    const notClosed = jobs.filter(j=>j.job_date<today && (j.status==='open'||j.status==='full'));
    const quotes = S.jobs.filter(j=>j.status==='quote');
    const past14 = jobs.filter(j=>j.job_date<=today && j.job_date>=H.ymd(H.addDays(T,-14)));
    const noPhoto = past14.filter(j=>!(j.promo&&j.promo.photo>0) && !H.photosOf(j.id).length);
    const month = jobs.filter(j=>j.job_date.startsWith(ym));
    const needRcpt = month.reduce((n,j)=>n+H.jobProofSplit(j).need,0);
    const unpaidCollect = jobs.filter(j=>j.job_date<=today && j.collector_id && j.balance_amount && !j.collected_at);
    const puOld = (S.puWait||[]).filter(p => (Date.now() - new Date(p.pu_date)) / 864e5 > 7);
    const newRep = (S.reports||[]).filter(r=>!r.checked_at).length;
    const serLast = {}; S.jobs.forEach(j => { if (j.series_id && (!serLast[j.series_id] || j.job_date > serLast[j.series_id])) serLast[j.series_id] = j.job_date; });
    const repEnding = Object.values(serLast).filter(d => d >= today && d <= H.ymd(H.addDays(T,14)));
    // 끝난 현장인데 아직 [입금 완료] 안 누른 직원 (지난 14일, 클린)
    const unpaidPay = new Set(); past14.filter(j => j.job_date < today && (j.work_done_at || j.done_at || j.status === 'done'))
      .forEach(j => appr(j).forEach(a => { const s = H.P(a.staff_id); if (!a.paid && s.team !== 'RES' && s.pay_type !== 'salary') unpaidPay.add(a.staff_id); }));

    const alerts = [
      short.length && ['warn', `인원 미달 ${short.length}건 (7일 안)`, 'sched'],
      waiting.length && ['wait', `신청 승인 대기 ${waiting.length}명`, 'sched'],
      unseen && ['warn', `확정됐는데 아직 안 본 직원 ${unseen}명 (연락 필요)`, 'sched'],
      quotes.length && ['info', `오더 접수함 견적 중 ${quotes.length}건`, 'ops/order'],
      notClosed.length && ['wait', `지난 현장 미마감 ${notClosed.length}건 (금액 기입)`, 'ops/money'],
      newRep && ['info', `안 본 현장 보고 ${newRep}건`, 'sched'],
      noPhoto.length && ['wait', `사진 못 받은 현장 ${noPhoto.length}곳 (14일)`, 'promo'],
      needRcpt && ['warn', `현금영수증 발행 필요 ${needRcpt}건 (이번 달)`, S.owner?'money':'ops/money'],
      puOld.length && ['warn', `외주 세금계산서 요청 7일 넘음 ${puOld.length}건`, 'ops/buy'],
      unpaidCollect.length && ['wait', `현장 잔금 미수 ${unpaidCollect.length}건`, 'ops/money'],
      S.owner && unpaidPay.size && ['warn', `입금 완료 안 누른 직원 ${unpaidPay.size}명 (지난 현장)`, 'pay'],
      repEnding.length && ['wait', `정기 일정 2주 안에 끝남 ${repEnding.length}곳 (연장하기)`, 'sched'],
      S.owner && T.getDate() <= 10 && [T.getDate() >= 8 ? 'warn' : 'info', `부동산 ${T.getMonth() || 12}월 정산 · ${T.getMonth()+1}/10 지급${T.getDate() === 10 ? ' (오늘!)' : ` (D-${10 - T.getDate()})`}`, 'money']
    ].filter(Boolean);

    // 부동산
    const mm = S.mm; let mmHtml = '';
    if (S.owner) {
      if (mm && mm.admin) {
        const all = (mm.all||[]).map(r=>({agent:r[0], id:r[1], regDate:r[2], status:r[3], checked:r[18]}));
        const live = all.filter(r=>r.status==='진행');
        const stale = live.filter(r=>!r.checked || (T - new Date(r.checked+'T00:00:00'))/864e5 > 30);
        const ai = mm.admin.ai||{};
        mmHtml = `<div class="kp">
          <div class="k"><span>진행 매물</span><b>${live.length}</b><small>전 직원</small></div>
          <div class="k"><span>이번 달 등록</span><b>${all.filter(r=>(r.regDate||'').startsWith(ym)).length}</b></div>
          <div class="k ${all.filter(r=>r.status==='보류').length?'wait':''}"><span>보류</span><b>${all.filter(r=>r.status==='보류').length}</b></div>
          <div class="k ${stale.length?'warn':''}"><span>30일 미확인</span><b>${stale.length}</b></div>
          <div class="k"><span>계약완료</span><b>${all.filter(r=>r.status==='계약완료').length}</b><small>누적</small></div>
          <div class="k"><span>이번 달 계약</span><b>${(S.dealsMonth||[]).length}</b><small>중개보수 ${won((S.dealsMonth||[]).reduce((n,d)=>n+(d.sides||[]).reduce((a,x)=>a+(+x.amount||0),0),0))}원</small></div>
          <div class="k"><span>자동 채우기</span><b>${ai.count||0}</b><small>$${(ai.cost||0).toFixed(2)}</small></div></div>`;
      } else {
        mmHtml = `<div class="banner info">${S.mmErr?'매물노트를 불러오지 못했어요: '+esc(S.mmErr):S.mcode?'매물노트 불러오는 중…':'매물노트가 아직 연결되지 않았어요.'} <button class="btn sm ghost" data-a="mmLink">연결하기</button></div>`;
      }
    }
    const resEv = (S.events||[]).filter(e => e.ev_date>=today && e.ev_date<=wk && e.staff_id && H.P(e.staff_id).team==='RES' && e.show_boss);
    const resHtml = `${mmHtml}
      <div class="ptitle">이번 7일 부동산 일정 ${resEv.length}건</div>
      ${S.owner&&S.settings.ics_key?`<div class="rw"><span class="note">부동산 직원 일정을 내 구글 캘린더에서 보기 (구글 캘린더 › 다른 캘린더 + › URL로 추가)</span><button class="btn sm ghost" data-a="bossIcs">구독 주소 복사</button></div>`:''}
      ${resEv.slice(0,8).map(e=>`<div class="rw"><span>${md(e.ev_date)} ${e.ev_time?e.ev_time.slice(0,5):''} · <b>${esc(H.P(e.staff_id).name)}</b> ${esc(e.kind)} ${e.maemul_id?esc(e.maemul_id)+' ':''}${esc(e.title)}</span></div>`).join('') || '<div class="note">직원이 일정판에 올린 계약·잔금·안내가 여기에 보여요</div>'}`;

    // 청소
    const deps = month.filter(j=>+j.deposit_amount);
    const cleanMoney = S.owner ? `<div class="kp" style="margin-top:8px">
        <div class="k"><span>이번 달 클린 예상 수익</span><b>${won(month.reduce((n,j)=>n+H.jobRevenue(j),0))}</b><small>계약 + 추가금 · 원</small></div>
        <div class="k"><span>임금 지출 (마감분)</span><b>${won(month.reduce((n,j)=>n+H.jobLabor(j),0))}</b><small>원</small></div>
        <div class="k"><span>예약금 받음</span><b>${won(deps.filter(j=>j.deposit_paid).reduce((n,j)=>n+(+j.deposit_amount),0))}</b><small>${deps.filter(j=>j.deposit_paid).length}건 · 원</small></div>
        <div class="k ${deps.filter(j=>!j.deposit_paid).length?'wait':''}"><span>예약금 대기</span><b>${won(deps.filter(j=>!j.deposit_paid).reduce((n,j)=>n+(+j.deposit_amount),0))}</b><small>${deps.filter(j=>!j.deposit_paid).length}건 · 원</small></div>
      </div>` : '';
    const cleanHtml = `<div class="kp">
        <div class="k"><span>오늘 현장</span><b>${todayJ.length}</b><small>인원 확정 ${todayJ.filter(j=>appr(j).length>=j.headcount).length}</small></div>
        <div class="k"><span>이번 7일</span><b>${weekJ.length}</b><small>~${md(wk)}</small></div>
        <div class="k ${short.length?'warn':''}"><span>인원 미달</span><b>${short.length}</b><small>7일 안</small></div>
        <div class="k ${waiting.length?'wait':''}"><span>신청 대기</span><b>${waiting.length}</b></div>
        <div class="k ${quotes.length?'wait':''}"><span>견적 중</span><b>${quotes.length}</b><small>오더 접수함</small></div>
        <div class="k ${notClosed.length?'wait':''}"><span>미마감</span><b>${notClosed.length}</b><small>지난 현장</small></div>
      </div>${cleanMoney}
      ${short.length?`<div class="ptitle">사람이 더 필요한 현장</div>${short.slice(0,6).map(j=>`<div class="rw"><span>${md(j.job_date)} ${j.start_time?j.start_time.slice(0,5):''} ${esc(j.title)}</span><span class="pill p-warn">${appr(j).length}/${j.headcount}명</span></div>`).join('')}`:''}`;

    const todayList = [...todayJ.map(j=>({t:j.start_time, h:`<span class="tag" style="background:var(--clean)">클린</span> ${esc(j.title)} <span class="note">${appr(j).map(a=>esc(H.P(a.staff_id).name)).join('·')||'미배정'}</span>`})),
      ...(S.events||[]).filter(e=>e.ev_date===today && (!e.staff_id || e.show_boss)).map(e=>({t:e.ev_time, h:`<span class="tag" style="background:${e.staff_id?'var(--res)':'#6B7280'}">${e.staff_id?esc(H.P(e.staff_id).name):'내 일정'}</span> ${esc(e.kind)} ${esc(e.title)}`}))]
      .sort((a,b)=>(a.t||'').localeCompare(b.t||''));

    return `
    ${S.needV22 && !S.needV10 && S.isOwner ? `<section class="box"><div class="banner warn v3bar"><b>업데이트 1개 (${S.needV19?'v19':'v22'})</b> ${S.needV19?'현장에 고객 이름·전화 칸 (수금 담당만 보임)':'손님방 (손님 링크 = 사진+대화 한 흐름, 작업 끝은 수금 담당)'} — SQL 한 번만 실행해 주세요<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-a="copyV19">SQL 복사</button><a class="btn sm ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">SQL Editor 열기</a></span></div></section>` : ''}
    ${(S.needV3||S.needV10) && S.isOwner ? `<section class="box"><div class="banner warn v3bar"><b>업데이트 1개 (${S.needV3?'v3':S.needV5?'v5':S.needV6?'v6':S.needV7?'v7':S.needV9?'v9':'v10'})</b> ${S.needV3?'프로필 사진 · 정기 반복 일정 · 문나원 퇴사 정리':S.needV5?'팀 대화 + 대표님 현장 → 직원 화면 상태 자동 (카카오워크 졸업)':S.needV6?'대화: 관리자(HQS)도 참여 · 방 관리는 대표만':S.needV7?'인사카드 대표 전용 칸':S.needV9?'인사카드 주민번호·계좌 칸 + 1:1 대화 입금 자동 기록':"이름 '청소' → '클린' (팀·대화방)"} — SQL 한 번만 실행해 주세요<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-a="copyV3">SQL 복사</button><a class="btn sm ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">SQL Editor 열기</a></span></div></section>` : ''}
    ${H.teamStrip ? H.teamStrip() : ''}
    ${alerts.length?`<section class="box"><div class="bh"><h3>오늘 챙길 것</h3><span class="sub">누르면 해당 화면으로 가요</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px">${alerts.map(([c,t,go])=>`<a class="banner ${c==='warn'?'warn':'info'}" href="#${go}" style="text-decoration:none;padding:8px 12px">${esc(t)} →</a>`).join('')}</div></section>`:''}
    <div class="g2">
      <section class="box"><div class="bh"><h3>오늘 ${md(today)}</h3><span style="display:flex;gap:6px">${S.owner?'<a class="btn sm" href="#pay" style="text-decoration:none">💸 오늘 정산</a>':''}<a class="btn sm ghost" href="#sched">일정판 →</a></span></div>
        ${todayList.map(x=>`<div class="rw"><span>${x.t?x.t.slice(0,5)+' · ':''}${x.h}</span></div>`).join('') || '<div class="note">오늘 일정이 없어요</div>'}</section>
      ${S.owner && H.paySummary ? (() => { const ps = H.paySummary(todayJ);
        return `<section class="box"><div class="bh"><h3>💸 오늘 정산</h3><a class="btn sm" href="#pay" style="text-decoration:none">정산 열기 →</a></div>
        ${ps.n ? `<div class="hp-k"><div><span>보낼 돈</span><b>${won(ps.net)}</b></div><div><span>남은 입금</span><b>${ps.left.length}명</b></div><div><span>입금 완료</span><b>${ps.paidN}명</b></div></div>
          ${ps.notDone ? `<div class="note" style="margin-top:8px">⏳ 아직 작업 끝 안 누른 직원 ${ps.notDone}명 · 끝나면 금액이 확정돼요</div>` : '<div class="note" style="margin-top:8px">✓ 오늘 현장 모두 끝났어요</div>'}
          ${ps.left.length ? `<div class="hp-list">${ps.left.slice(0,4).map(p => `<span>${esc(p.s.name)} <b>${won(p.net)}</b></span>`).join('')}${ps.left.length > 4 ? `<span>외 ${ps.left.length - 4}명</span>` : ''}</div>` : ''}`
        : '<div class="note">오늘 지급할 현장이 없어요</div>'}</section>`; })()
      : `<section class="box"><div class="bh"><h3>대표님 상태</h3></div><div class="note">${esc((S.boss||{}).state||'근무중')}${(S.boss||{}).memo?' · '+esc(S.boss.memo):''}</div></section>`}
    </div>
    <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--res)"></i>리츠부동산</h3>${S.owner&&S.mcode?`<a class="btn sm ghost" href="../maemul/?k=${encodeURIComponent(S.mcode)}">매물노트 열기 →</a>`:''}</div>${resHtml}</section>
    <section class="box"><div class="bh"><h3><i class="dot" style="background:var(--clean)"></i>리츠종합클린</h3><a class="btn sm ghost" href="#sched">일정판 →</a></div>${cleanHtml}</section>`;
  }
});

H.ACT.copyV19 = async () => { const t = await (await fetch(H.S.needV19 ? 'update_v19.sql' : 'update_v22.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL을 복사했어요 · SQL Editor에 붙여넣고 Run → 새로고침'); };
H.ACT.copyV3 = async () => { const t = await (await fetch(H.S.needV3 ? 'update_v3.sql' : H.S.needV5 ? 'update_v5.sql' : H.S.needV6 ? 'update_v6.sql' : H.S.needV7 ? 'update_v7.sql' : H.S.needV9 ? 'update_v9.sql' : 'update_v10.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL을 복사했어요 · SQL Editor에 붙여넣고 Run → 새로고침'); };
H.ACT.bossIcs = () => { const k = H.S.settings.ics_key; H.copy(`${H.MAEMUL_API}?ics=${encodeURIComponent(typeof k === 'string' ? k : String(k))}&boss=1`, '구독 주소를 복사했어요 · 반영까지 몇 시간 걸릴 수 있어요'); };
// 매물노트 연결 (대표 링크 붙여넣기)
H.ACT.mmLink = () => H.open(`<form data-f="mmLink"><h3>매물노트 연결</h3><p class="note">대표님 매물노트 개인 링크를 붙여넣어 주세요. 예) team.earningplace.kr/maemul/?k=…</p>
  <div class="field"><label>매물노트 내 링크</label><input name="link" required autocomplete="off"></div>${H.sacts('연결하기')}</form>`);
H.FORM.mmLink = async v => {
  const raw = String(v.get('link')); const m = raw.match(/[?&]k=([A-Za-z0-9]+)/) || raw.match(/^([A-Za-z0-9]{16,})$/);
  if (!m) return H.toast('링크에서 개인 코드를 찾지 못했어요');
  const old = H.S.mcode; H.S.mcode = m[1];
  try { const d = await H.maemul('getBootstrap'); if (!d || !d.admin) throw new Error('대표 링크가 아니에요'); }
  catch(x){ H.S.mcode = old; return H.toast(x.message || '연결하지 못했어요'); }
  await H.q(H.sb.from('settings').upsert({key:'hq_maemul_code', value: H.S.mcode}));
  H.close(); H.toast('매물노트를 연결했어요'); await H.loadMaemul(); H.refresh();
};
})(window.HQ);
