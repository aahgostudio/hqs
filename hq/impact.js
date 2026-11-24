/* 📈 리츠 효과 기록판 (1124, 대표만) — #impact
   이미 쌓인 기록(자동 알림·고객님 방·정산·사진·다이어리)으로 '오피니가 아껴준 시간·돈'을 보여줌
   · 도입 전 숫자는 대표님이 한 번 입력 (settings.impact_base) · 건당 기준 시간은 settings.impact_rate
   · '내보내기' = 인쇄 창 → PDF 저장 (IBK·입점 영업용) */
(function(H){
const {esc, won, ymd, sb} = H;
const V = H.V; V.imp = V.imp || {off: 0};
const DEF_RATE = {msg: 3, cust: 2, pay: 10};
const DEF_BASE = {calls: 25, settle: 360, accident: 3.5, miss: 1.5};
const set = k => H.S.settings ? H.S.settings[k] : null;
const saveSet = async (k, v) => { await H.q(sb.from('settings').upsert({key: k, value: v})); H.S.settings[k] = v; };
const range = () => { const T = H.today(), a = new Date(T.getFullYear(), T.getMonth() + V.imp.off, 1), b = V.imp.off ? new Date(a.getFullYear(), a.getMonth() + 1, 0) : T; return [a, b]; };
const n = v => (+v || 0).toLocaleString('ko-KR');
const md = d => `${d.getMonth()+1}/${d.getDate()}`;

H.view('impact', {label:'리츠 효과', owner:true,
  async load(){ const [a, b] = range(); V.imp.err = '';
    try { V.imp.d = await H.q(sb.rpc('boss_impact', {p_from: ymd(a), p_to: ymd(b)})); } catch(e){ V.imp.d = null; V.imp.err = 'SQL(update_impact.sql)을 먼저 넣어주세요'; } },
  render(){
    const [a, b] = range(), d = V.imp.d, rt = Object.assign({}, DEF_RATE, set('impact_rate') || {}), bs = Object.assign({}, DEF_BASE, set('impact_base') || {}), nw = set('impact_now') || {};
    const start = set('impact_start') || '2026-10-12';
    const head = `<div class="imp-top"><div><h2>📈 리츠 효과 기록판</h2><small>오피니 1호 매장 · 도입 ${esc(start)}부터 · ${a.getFullYear()}년 ${md(a)}~${md(b)}</small></div>
      <div class="imp-r"><button class="btn ghost sm" data-a="impNav" data-n="-1">‹</button><button class="btn ghost sm" data-a="impNav" data-n="1" ${V.imp.off >= 0 ? 'disabled' : ''}>›</button>
      <button class="btn ghost sm" data-a="impBase">도입 전 기준 고치기</button><button class="btn sm" data-a="impPrint">📄 IBK·영업 자료로 내보내기</button></div></div>`;
    if (!d) return `<div class="imp">${head}<section class="box"><p class="note">${esc(V.imp.err || '불러오는 중…')}</p></section></div>`;
    const days = Math.max(1, Math.round((b - a) / 864e5) + 1);
    const mMsg = d.auto * rt.msg, mCust = d.cust_sent * rt.cust, mPay = d.pays * rt.pay, tot = mMsg + mCust + mPay;
    const hrs = Math.round(tot / 60), perDay = Math.round(tot / days);
    const wk = d.weeks || [], wv = wk.map(w => (w.auto * rt.msg + w.cust * rt.cust + w.pays * rt.pay) / 60), mx = Math.max(1, ...wv);
    const callsNow = Math.round(d.boss_dm / days * 10) / 10, pct = (x, y) => y ? Math.round((x - y) / y * 100) : 0;
    const rows = [
      ['하루 직원 연락 (대표가 직접)', `약 ${bs.calls}통`, `${callsNow}통`, bs.calls ? (pct(callsNow, bs.calls) + '%') : ''],
      ['월말 정산 시간', `약 ${Math.round(bs.settle/60*10)/10}시간`, nw.settle != null ? `${nw.settle}분` : '— (입력)', nw.settle != null ? pct(nw.settle, bs.settle) + '%' : ''],
      ['일정 사고 (월)', `${bs.accident}건`, nw.accident != null ? `${nw.accident}건` : '— (입력)', ''],
      ['고객 사진 보내기', '카톡 개별', `고객님 방 ${n(d.cust_sent)}건`, '✓'],
      ['미수금 7일 넘김', `월 ${bs.miss}건`, `${d.unpaid_n}건`, '']];
    return `<div class="imp">${head}
      <section class="imp-hero"><div class="big"><span>이번 달 대표님이 아낀 시간</span><b>${hrs}<small>시간</small></b><p>하루 약 ${Math.floor(perDay/60) ? Math.floor(perDay/60) + '시간 ' : ''}${perDay % 60}분 · 자동 처리 ${n(d.auto + d.cust_sent + d.pays)}건</p></div>
        <div class="k"><span>대신 보낸 연락</span><b>${n(d.auto)}건</b><small>새 현장·내일 일정·변경 알림</small><em>전화·카톡 개별 연락 대신</em></div>
        <div class="k"><span>늦게라도 받아낸 돈</span><b>${won(d.late_amt)}</b><small>미수 잔금·예약금 ${d.late_n}건 회수</small><em>놓칠 뻔한 돈</em></div>
        <div class="k"><span>일정 변경 자동 전달</span><b>${n(d.changes)}회</b><small>날짜·시간·주소 바뀌면 바로</small><em>일정 사고 예방</em></div></section>
      <div class="imp-g"><section class="box"><div class="bh"><h3>주별 아낀 시간</h3><span class="sub">사람이 했으면 걸렸을 시간</span></div>
        <div class="imp-bars">${wk.map((w, i) => { const tt = wv[i] || 1, h = v => Math.round(v / 60 / mx * 130);
          return `<div><div class="s"><i style="height:${h(w.auto*rt.msg)}px;background:#16347A"></i><i style="height:${h(w.pays*rt.pay)}px;background:#6E88D4"></i><i style="height:${h(w.cust*rt.cust)}px;background:#F59E0B"></i></div>${(+w.w.slice(5,7))}/${(+w.w.slice(8))}주<b>${Math.round(wv[i]*10)/10}h</b></div>`; }).join('')}</div>
        <div class="imp-lg"><span><i style="background:#16347A"></i>직원 연락 (알림)</span><span><i style="background:#6E88D4"></i>정산</span><span><i style="background:#F59E0B"></i>고객 응대 (고객님 방)</span></div></section>
      <section class="box"><div class="bh"><h3>도입 전 → 지금</h3><button class="btn sm ghost" data-a="impBase">고치기</button></div>
        <table class="imp-ba"><tr><th>항목</th><th>도입 전</th><th>지금</th><th></th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td class="now">${esc(r[2])}</td><td class="up">${esc(r[3])}</td></tr>`).join('')}</table></section></div>
      <div class="imp-g3">
        <section class="box"><div class="bh"><h3>👥 직원 참여</h3><span class="sub">앱 설치 없이 링크로</span></div>
          <div class="rw"><span>최근 7일 접속한 직원</span><b>${d.staff_7d} / ${d.staff_all}명</b></div><div class="rw"><span>현장 사진</span><b>${n(d.photos)}장</b></div>
          <div class="rw"><span>현장 다이어리 이야기</span><b>${n(d.diary)}개</b></div><div class="rw"><span>배정된 현장 인원</span><b>${n(d.assign)}명</b></div></section>
        <section class="box"><div class="bh"><h3>🙂 고객 반응</h3></div>
          <div class="rw"><span>고객님 방 연 고객</span><b>${d.cust_rooms ? Math.round(d.cust_open / d.cust_rooms * 100) : 0}% <small>(${d.cust_open}/${d.cust_rooms})</small></b></div>
          <div class="rw"><span>이번 달 현장</span><b>${n(d.jobs)}곳</b></div><div class="rw"><span>정기 고객</span><b>${n(d.regular)}곳</b></div></section>
        <section class="box"><div class="bh"><h3>🧾 이 숫자는 어디서?</h3></div>
          <div class="rw"><span>자동 알림·변경 전달</span><span class="pill">대화 기록</span></div><div class="rw"><span>정산·미수 회수</span><span class="pill">정산 기록</span></div><div class="rw"><span>사진·다이어리·접속</span><span class="pill">일정판 기록</span></div>
          <p class="note">아낀 시간 = 자동 처리 건수 × 건당 기준 시간 (연락 ${rt.msg}분 · 정산 ${rt.pay}분 · 고객 응대 ${rt.cust}분) <button class="lk" data-a="impBase">기준 고치기</button></p></section></div></div>`;
  }
});
H.ACT.impNav = el => { V.imp.off = Math.min(0, V.imp.off + +el.dataset.n); H.refresh(); };
H.ACT.impPrint = () => window.print();
H.ACT.impBase = () => { const bs = Object.assign({}, DEF_BASE, set('impact_base') || {}), rt = Object.assign({}, DEF_RATE, set('impact_rate') || {}), nw = set('impact_now') || {};
  H.open(`<form data-f="impBase"><h3>도입 전 기준 · 계산 기준</h3><p class="note" style="margin:-4px 0 10px">오피니(일정판) 쓰기 전 숫자를 대략 적어주세요. 한 번만 적으면 돼요.</p>
    <div class="ptitle">도입 전</div><div class="grid2">
    <div class="field"><label>하루 직원 연락 (통)</label><input name="calls" inputmode="decimal" value="${bs.calls}"></div>
    <div class="field"><label>월말 정산 시간 (분)</label><input name="settle" inputmode="decimal" value="${bs.settle}"></div>
    <div class="field"><label>일정 사고 (월, 건)</label><input name="accident" inputmode="decimal" value="${bs.accident}"></div>
    <div class="field"><label>미수금 놓침 (월, 건)</label><input name="miss" inputmode="decimal" value="${bs.miss}"></div></div>
    <div class="ptitle">지금 (직접 적는 것)</div><div class="grid2">
    <div class="field"><label>월말 정산 시간 (분)</label><input name="n_settle" inputmode="decimal" value="${nw.settle ?? ''}"></div>
    <div class="field"><label>일정 사고 (이번 달, 건)</label><input name="n_accident" inputmode="decimal" value="${nw.accident ?? ''}"></div></div>
    <div class="ptitle">건당 기준 시간 (분)</div><div class="grid2">
    <div class="field"><label>알림 1건 = 연락</label><input name="r_msg" inputmode="decimal" value="${rt.msg}"></div>
    <div class="field"><label>정산 1건</label><input name="r_pay" inputmode="decimal" value="${rt.pay}"></div>
    <div class="field"><label>고객님 방 1건</label><input name="r_cust" inputmode="decimal" value="${rt.cust}"></div>
    <div class="field"><label>도입일</label><input name="start" type="date" value="${esc(set('impact_start') || '2026-10-12')}"></div></div>
    ${H.sacts('저장')}</form>`); };
H.FORM.impBase = async (fd0, f) => { const v = new FormData(f), num = k => v.get(k) === '' ? null : +v.get(k);
  await saveSet('impact_base', {calls: num('calls'), settle: num('settle'), accident: num('accident'), miss: num('miss')});
  await saveSet('impact_now', {settle: num('n_settle'), accident: num('n_accident')});
  await saveSet('impact_rate', {msg: num('r_msg') || 3, pay: num('r_pay') || 10, cust: num('r_cust') || 2});
  await saveSet('impact_start', v.get('start') || '2026-10-12');
  H.close(); H.toast('저장했어요'); H.render(); };
})(window.HQ);
