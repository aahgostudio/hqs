/* 인사카드 — 직원 이름을 누르면 열림 (대표·관리자 화면 전용, 직원에겐 안 보임)
   기본 정보 · 레벨 · 서류 체크 · 근무 기록 · 정산(대표만) · 공지 확인 · 1:1 대화 · 인사 메모
   레벨·서류·메모는 settings 'staff_hr' {직원id: {...}} 에 저장 (주민번호·계좌번호 같은 민감 정보는 넣지 않기) */
(function(H){
const {esc, sb} = H;
const LV_CLEAN = ['교육생','가정청소 팀원','가정청소 고정팀원','가정청소 팀장 · 상가 팀원','상가·특수청소 팀장'];
// 부동산 = 3.3% + 비율제 (직원 몫). 맨 아래 교육생, 직원 8할이 최상위. 단계 이름은 교육과정 정해지면 바꾸기
const RES_RATE = {'교육생':40, '2단계':50, '3단계':60, '4단계':70, '최상위':80};
const LV_RES = Object.keys(RES_RATE);
const LV_AGO = ['교육생','파트너'];
const LV = t => t === 'RES' ? LV_RES : t === 'AGO' ? LV_AGO : LV_CLEAN;
const DOCS = [['contract','계약서 (근로·용역·도급)'],['bank','지급 계좌 확인'],['id','신분 확인'],['consent','업무 연락·대화 보관 동의'],['edu','신입 교육 이수']];
const hrMap = () => (H.S.settings && H.S.settings.staff_hr) || {};
const ym = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const tel = p => String(p||'').replace(/[^0-9]/g,'');

H.ACT.stCard = async el => {
  const s = (H.S.staffAll||H.S.staff||[]).find(x => x.id === el.dataset.s); if (!s) return;
  H.open(`<div class="hr"><div class="spin"></div></div>`, true);
  const isRes = s.team === 'RES';
  const [asg, nr, av, evs] = await Promise.all([
    H.q(sb.from('assignments').select('*, jobs(id, job_date, title, status, kind, teams)').eq('staff_id', s.id)),
    H.q(sb.from('notice_reads').select('read_at, confirmed_at').eq('staff_id', s.id)).catch(() => []),
    H.q(sb.from('availability').select('day, kind').eq('staff_id', s.id).gte('day', ym(new Date()) + '-01')).catch(() => []),
    isRes ? H.q(sb.from('events').select('ev_date, kind, title').eq('staff_id', s.id).order('ev_date', {ascending:false}).limit(200)).catch(() => []) : []
  ]);
  const hr = hrMap()[s.id] || {}, own = H.S.owner, now = new Date(), thisM = ym(now), lastM = ym(new Date(now.getFullYear(), now.getMonth()-1, 1));
  const ok = (asg||[]).filter(a => a.status === 'approved' && a.jobs && a.jobs.status !== 'cancelled').sort((a,b) => String(b.jobs.job_date).localeCompare(a.jobs.job_date));
  const done = ok.filter(a => a.jobs.status === 'done');
  const pay = a => (+a.pay_amount||0) + (+a.extra_amount||0);
  const inM = (a, m) => String(a.jobs.job_date).startsWith(m);
  const nThis = ok.filter(a => inM(a, thisM)).length, nLast = ok.filter(a => inM(a, lastM)).length;
  const payThis = done.filter(a => inM(a, thisM)).reduce((x,a) => x + pay(a), 0), payAll = done.reduce((x,a) => x + pay(a), 0);
  const upcoming = ok.filter(a => a.jobs.job_date >= H.ymd(H.today())).length;
  const leftOn = ((H.S.settings||{}).staff_left||{})[s.id];
  const days = s.joined_on ? Math.floor((now - new Date(s.joined_on + 'T00:00:00')) / 864e5) : null;
  const avOk = (av||[]).filter(x => x.kind === 'ok').length, avNo = (av||[]).filter(x => x.kind === 'no').length;
  const nRead = (nr||[]).filter(x => x.read_at).length, nConf = (nr||[]).filter(x => x.confirmed_at).length;
  const docN = DOCS.filter(([k]) => (hr.docs||{})[k]).length;
  H.open(`<form class="hr" data-f="stHr"><input type="hidden" name="id" value="${s.id}">
    <div class="hr-top">${H.av(s, 64, s.team==='RES'?'':'cl')}<div style="min-width:0"><h3 style="margin:0">${esc(s.name)} <span class="note" style="font-size:14px">${esc(s.role||'')}</span></h3>
      <div class="hr-tags"><span class="tag" style="background:${H.T(s.team).color}">${s.team}</span><span>${esc(H.T(s.team).name)}</span><span class="pill ${s.status==='active'?'p-info':'p-mute'}">${H.ST[s.status]}</span>${hr.level?`<span class="pill p-mute">Lv. ${esc(hr.level)}</span>`:''}</div>
      <div class="note">${s.joined_on?`입사 ${s.joined_on} · ${days}일째`:'입사일 미입력'}${leftOn?` · ${leftOn} 퇴사`:''} · 마지막 접속 ${s.last_seen_at?H.ago(s.last_seen_at):'-'}</div></div></div>
    <div class="hr-acts">${s.phone?`<a class="btn sm ghost" href="tel:${tel(s.phone)}">📞 ${esc(s.phone)}</a><a class="btn sm ghost" href="sms:${tel(s.phone)}">💬 문자</a>`:''}
      ${own?`<button type="button" class="btn sm ghost" data-a="hrChat" data-s="${s.id}">🗨 1:1 대화</button>`:''}
      ${s.status!=='left'?`<button type="button" class="btn sm ghost" data-a="stLink" data-s="${s.id}">🔗 링크 복사</button>`:''}
      <button type="button" class="btn sm ghost" data-a="stEdit" data-s="${s.id}">✏️ 기본 정보 수정</button></div>
    <div class="hr-k">
      ${isRes ? (() => { const e = evs||[], m = e.filter(x => String(x.ev_date).startsWith(thisM)), c = k => m.filter(x => x.kind === k).length;
        return `<div><span>이번 달 계약</span><b>${c('계약')}</b><small>잔금 ${c('잔금')}</small></div><div><span>이번 달 안내</span><b>${c('안내')}</b><small>일정 ${m.length}건</small></div><div><span>누적 일정</span><b>${e.length}</b><small>계약 ${e.filter(x=>x.kind==='계약').length}</small></div>`; })()
      : `<div><span>이번 달 현장</span><b>${nThis}</b><small>지난달 ${nLast}</small></div>
      <div><span>누적 현장</span><b>${ok.length}</b><small>예정 ${upcoming}</small></div>
      ${own?`<div><span>이번 달 지급</span><b>${H.won(payThis)}</b><small>누적 ${H.won(payAll)}원</small></div>`:''}
      <div><span>이번 달 가능일</span><b>${avOk}</b><small>불가 ${avNo}</small></div>`}
      <div><span>공지</span><b>${nRead}</b><small>읽음 · 확인 ${nConf}</small></div>
      <div><span>서류</span><b>${docN}/${DOCS.length}</b><small>체크</small></div>
    </div>
    <div class="fg">
      <div class="field"><label>레벨 (등급제)</label><select name="level"><option value="">미정</option>${LV(s.team).map(l => `<option value="${l}" ${hr.level===l?'selected':''}>${l}${s.team==='RES'?` · 직원 ${RES_RATE[l]/10} : 대표 ${10-RES_RATE[l]/10}`:''}</option>`).join('')}</select><div class="hint">${s.team==='RES'?`저장하면 배분율(직원 몫)도 같이 바뀌어요${own?` · 지금 ${(H.S.payRules||[]).find(p=>p.staff_id===s.id)?.share_rate ?? '미정'}%`:''}`:s.team==='AGO'?'아고 파트너 단계':'무단결근 시 레벨 하향 규칙'}</div></div>
      <div class="field"><label>지급 방식</label><input value="${esc(H.PT[s.pay_type]||'')}${s.team==='RES'?' · 비율제':''}${s.can_collect?' · 수금 가능':''}" disabled><div class="hint">기본 정보 수정에서 바꿔요 · 세금 방식은 세무사 확인</div></div>
      <div class="field full"><label>서류 · 확인</label><div class="hr-docs">${DOCS.map(([k,l]) => `<label><input type="checkbox" name="doc_${k}" ${(hr.docs||{})[k]?'checked':''}> ${l}</label>`).join('')}</div>
        <div class="hint">체크만 해요 · 주민번호·계좌번호·신분증 사진은 여기에 넣지 마세요</div></div>
      <div class="field full"><label>인사 메모 <small>(대표·관리자만 보여요)</small></label><textarea name="memo" rows="4" placeholder="면담 내용, 근태, 칭찬·주의 기록 등 — 날짜와 함께 적어두면 나중에 근거가 돼요">${esc(hr.memo||'')}</textarea></div>
    </div>
    ${isRes ? `<div class="ptitle">최근 일정</div><div class="hr-jobs">${(evs||[]).slice(0,12).map(e => `<div><span>${String(e.ev_date).slice(5).replace('-','/')}</span><b>${esc(e.title||'')}</b><span class="note">${esc(e.kind||'')}</span></div>`).join('') || '<p class="note">아직 일정이 없어요</p>'}</div>` : `
    <div class="ptitle">최근 근무 ${ok.length ? `<span class="note">(${ok.length}건 중 최근 12건)</span>` : ''}</div>
    <div class="hr-jobs">${ok.slice(0,12).map(a => `<div><span>${String(a.jobs.job_date).slice(5).replace('-','/')}</span><b>${esc(a.jobs.title||'현장')}</b><span class="note">${a.jobs.status==='done'?'완료':'예정'}</span>${own?`<span class="num">${a.jobs.status==='done'?H.won(pay(a)):''}</span>`:''}</div>`).join('') || '<p class="note">아직 근무 기록이 없어요</p>'}</div>`}
    ${H.sacts('인사카드 저장')}</form>`, true);
};
H.ACT.hrChat = el => { if (H.chatGo) H.chatGo(el.dataset.s); };
H.FORM.stHr = async (fd0, f) => {
  const fd = new FormData(f), id = fd.get('id'), m = {...hrMap()};
  m[id] = {level: fd.get('level') || '', memo: (fd.get('memo')||'').slice(0, 5000), docs: Object.fromEntries(DOCS.map(([k]) => [k, !!fd.get('doc_'+k)])), at: new Date().toISOString()};
  await H.q(sb.from('settings').upsert({key:'staff_hr', value:m})); H.S.settings.staff_hr = m;
  const st = (H.S.staffAll||H.S.staff||[]).find(x => x.id === id);
  if (st && st.team === 'RES' && H.S.owner && RES_RATE[m[id].level] != null) {   // 부동산: 레벨 → 배분율
    const v = RES_RATE[m[id].level]; await H.q(sb.from('pay_rules').upsert({staff_id: id, share_rate: v}));
    const r = (H.S.payRules||[]).find(p => p.staff_id === id); if (r) r.share_rate = v; else (H.S.payRules = H.S.payRules||[]).push({staff_id: id, share_rate: v});
  }
  H.close(); H.toast('인사카드를 저장했어요'); if (H.cur() === 'staff') H.render();
};
})(window.HQ);
