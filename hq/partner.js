/* 영업파트너 (HQ '영업파트너' 탭 · 1104j)
   소개 접수함 / 파트너 / 수수료 정산 — 데이터는 update_v40.sql (partners · referrals · partner_payouts) */
(function(H){
const {esc, md, won, ymd, sb} = H;
const ST = {new:['새 소개','p-warn'], contact:['리츠 연락 중','p-wait'], won:['계약 성사','p-ok'], lost:['불발','p-mute']};
const KINDS = ['준공·인테리어 후','상가·사무실 정기','입주·이사','외국계 사무실','기타'];
const PK = {refer:'소개형', sales:'전담 영업'};
const PS = {active:'활동', sleep:'휴면', end:'계약종료'};
const SRC = {partner:'파트너 입력', link:'소개 링크', hq:'본사 입력'};
const digits = t => String(t||'').replace(/[^0-9]/g,'');
const ym = d => ymd(d).slice(0,7);
const addMonth = (s, n) => { const [y,m] = s.split('-').map(Number); const d = new Date(y, m-1+n, 1); return ym(d); };
const PT = id => (H.S.partners||[]).find(p => p.id === id) || {name:'(파트너 없음)'};
const R = id => (H.S.refs||[]).find(r => r.id === +id);
H.partnerUrl = p => `${location.origin}/partner/?k=${p.token}`;
H.refUrl = p => p.ref_code ? `${location.origin}/r/?c=${p.ref_code}` : '';

H.loadPartners = async () => {
  if (H.S.needV40) return;
  const [p, r, x] = await Promise.all([
    H.q(sb.from('partners').select('*').order('created_at')),
    H.q(sb.from('referrals').select('*').order('created_at', {ascending:false}).limit(1000)),
    (H.S.owner || H.S.needV42) ? H.q(sb.from('partner_payouts').select('*').order('due_month', {ascending:false}).limit(2000)) : Promise.resolve([])
  ]);
  Object.assign(H.S, {partners: p, refs: r, ppays: x});
  // v42: 입금 계좌는 대표만 읽는 partner_private 표 (관리자 계정은 서버에서 막힘)
  H.S.pbank = {};
  if (H.S.owner) { if (H.S.needV42) p.forEach(a => { if (a.bank) H.S.pbank[a.id] = a.bank; });
    else (await H.q(sb.from('partner_private').select('*'))).forEach(b => { H.S.pbank[b.partner_id] = b.bank; }); }
  if (!H.S.needV44) { const [dd, dc] = await Promise.all([H.q(sb.rpc('deal_days')), H.q(sb.from('settings').select('value').eq('key','deal'))]); H.S.deal = dd || {rate:10, days:[]}; H.S.dealCfg = (dc && dc[0] && dc[0].value) || {rate:10, days:14, cap:2, off:[]}; }
  H.S.pkit = H.S.needV43 ? [] : await H.q(sb.from('partner_kit').select('*').order('sort', {ascending:false}).order('created_at', {ascending:false}));
  H.S.pmsgs = H.S.needV41 ? [] : await H.q(sb.from('partner_msgs').select('*').order('created_at', {ascending:false}).limit(1500));
};
H.pUnread = () => (H.S.pmsgs||[]).filter(m => !m.from_hq && !m.hq_read_at).length;

const needBox = () => `<section class="box"><div class="bh"><h3>영업파트너 시작하기 (서버 업데이트 한 번)</h3></div>
  <p class="note" style="line-height:1.7">파트너 명부 · 소개 접수 · 수수료 정산 표를 서버에 만들어야 해요.<br>1. [SQL 복사] → 2. Supabase SQL Editor에 붙여넣고 Run → 3. '업데이트 완료 (v40)'가 보이면 새로고침</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-a="v40copy">SQL 복사</button><a class="btn ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">SQL Editor 열기</a></div></section>`;
H.ACT.v40copy = async () => { const t = await (await fetch('update_v40.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL 복사했어요 · SQL Editor에 붙여넣고 Run'); };

/* ---------- 오른쪽 작은 칸: 채널 · 견적 ---------- */
const sideSmall = () => {
  const jobs = H.S.jobs || [], m = ym(H.today());
  const q = jobs.filter(j => j.status === 'quote').length;
  const chans = {}; jobs.filter(j => (j.job_date||'').slice(0,7) === m || j.status === 'quote').forEach(j => { const c = j.order_channel || '미입력'; chans[c] = (chans[c]||0) + 1; });
  const top = Object.entries(chans).sort((a,b) => b[1]-a[1]).slice(0,4);
  return `<section class="box pt-mini"><div class="bh"><h3 style="font-size:13px">채널 · 견적</h3><a class="sub" href="#ops/order">열기</a></div>
    <div class="rw"><span>견적 중</span><b>${q}건</b></div>
    ${top.map(([c,n]) => `<div class="rw"><span>${esc(c)}</span><b>${n}건</b></div>`).join('')}
    <button class="btn ghost sm" data-a="quoteNew" style="margin-top:8px;width:100%">+ 오더 접수</button></section>`;
};

/* ---------- 소개 접수함 ---------- */
H.partnerIn = () => {
  if (H.S.needV40) return needBox();
  const S = H.S, refs = S.refs || [], T = H.today(), mon = ym(T);
  const act = (S.partners||[]).filter(p => p.status === 'active');
  const wk = ymd(H.addDays(T, -7));
  const monRefs = refs.filter(r => r.created_at.slice(0,7) === mon);
  const done = refs.filter(r => r.status === 'won' || r.status === 'lost');
  const rate = done.length ? Math.round(refs.filter(r => r.status === 'won').length / done.length * 100) : null;
  const due = (S.ppays||[]).filter(x => !x.paid_on).reduce((a,x) => a + (x.pay||0), 0);
  const kpi = `<div class="pt-kpis">
    <div><small>활동 파트너</small><b>${act.length}<i>명</i></b><em>이번 주 새로 ${act.filter(p => p.created_at.slice(0,10) >= wk).length}명</em></div>
    <div><small>이번 달 소개</small><b>${monRefs.length}<i>건</i></b><em>새 소개 ${refs.filter(r => r.status === 'new').length}건 대기</em></div>
    <div><small>계약 전환율</small><b>${rate == null ? '-' : rate}<i>${rate == null ? '' : '%'}</i></b><em>성사 ${refs.filter(r => r.status === 'won').length}건</em></div>
    <div><small>지급 예정 수수료</small><b>${S.owner ? won(due) : '-'}<i>${S.owner ? '원' : ''}</i></b><em>${S.owner ? '정기 회차 포함' : '대표님만 보여요'}</em></div></div>`;
  const cut = (st, days) => refs.filter(r => r.status === st && (!days || (r.updated_at||r.created_at).slice(0,10) >= ymd(H.addDays(T, -days))));
  const col = (st, list, extra) => `<div class="pt-col"><div class="pt-ch"><b>${ST[st][0]}</b><span>${list.length}</span></div>${list.map(card).join('') || '<p class="note" style="text-align:center;padding:14px 0">없어요</p>'}${extra||''}</div>`;
  return `<div class="gside"><div style="display:grid;gap:14px;min-width:0">${kpi}
    <section class="box"><div class="bh"><h3>소개 접수함</h3><div style="display:flex;gap:6px"><button class="btn sm ghost" data-a="refNew">+ 본사 입력</button></div></div>
      <div class="pt-board">${col('new', cut('new'))}${col('contact', cut('contact'))}${col('won', cut('won', 90))}${col('lost', cut('lost', 30))}</div>
      <p class="note" style="margin-top:8px">흐름: 새 소개 → [연락 시작] → 견적·상담 → [처리]에서 계약 성사(금액) 또는 불발. 성사되면 수수료 줄이 자동으로 생겨요 (정기는 개월 수만큼 회차).</p></section></div>
    <div style="display:grid;gap:14px;align-content:start">${sideSmall()}
      <section class="box pt-mini"><div class="bh"><h3 style="font-size:13px">파트너 화면 공지</h3><button class="btn sm ghost" data-a="ptNotice">수정</button></div><p class="note" style="white-space:pre-line">${esc(H.setting('partner_notice') || '아직 없어요 · 파트너 화면 맨 위에 보여요')}</p></section></div></div>`;
};
const card = r => {
  const p = PT(r.partner_id), d = r.dup_of && R(r.dup_of);
  const amt = r.status === 'won' ? (r.recurring ? `정기 월 ${won(r.monthly)}` : won(r.amount) + '원') : '';
  return `<div class="pt-card${r.dup_of ? ' dup' : ''}">
    <div class="t"><b>${esc(r.customer)}</b>${r.source === 'link' ? '<span class="pill p-info">링크</span>' : ''}</div>
    <div class="m">${esc([r.kind, r.area].filter(Boolean).join(' · '))}</div>
    <div class="m">소개 · <b>${esc(p.name)}</b> · ${md(r.created_at.slice(0,10))}${amt ? ` · ${amt}` : ''}</div>
    ${r.memo ? `<div class="m memo">${esc(r.memo)}</div>` : ''}
    ${d ? `<div class="pt-dup">같은 연락처를 ${md(d.created_at.slice(0,10))} ${esc(PT(d.partner_id).name)} 님이 먼저 소개</div>` : r.dup_of ? '<div class="pt-dup">같은 연락처로 먼저 들어온 소개가 있어요</div>' : ''}
    ${r.note ? `<div class="m">리츠 메모 · ${esc(r.note)}</div>` : ''}
    <div class="acts">${r.phone ? `<a class="btn sm ghost" href="tel:${esc(digits(r.phone))}">전화</a>` : ''}${r.status === 'new' ? `<button class="btn sm" data-a="refGo" data-r="${r.id}">연락 시작</button>` : ''}<button class="btn sm ghost" data-a="refEdit" data-r="${r.id}">처리</button></div></div>`;
};
H.ACT.refGo = async el => { await H.q(sb.from('referrals').update({status:'contact', updated_at: new Date().toISOString()}).eq('id', +el.dataset.r)); H.toast('연락 중으로 옮겼어요 · 파트너 화면에도 보여요'); H.refresh(); };

H.ACT.refEdit = el => { const r = R(el.dataset.r); if (!r) return;
  const jobs = (H.S.jobs||[]).filter(j => j.status !== 'cancelled').slice().sort((a,b) => (b.job_date||'').localeCompare(a.job_date||'')).slice(0, 120);
  H.open(`<form data-f="refEdit"><h3>${esc(r.customer)}</h3>
    <p class="note" style="margin:-6px 0 10px">소개 · ${esc(PT(r.partner_id).name)} · ${SRC[r.source]||''} · ${md(r.created_at.slice(0,10))}${r.phone ? ` · <a href="tel:${esc(digits(r.phone))}">${esc(r.phone)}</a>` : ''}</p>
    <div class="chips" style="margin-bottom:12px">${Object.entries(ST).map(([k,[l]]) => `<label><input type="radio" name="status" value="${k}" ${r.status===k?'checked':''}><span>${l}</span></label>`).join('')}</div>
    <div class="fg">
      <div class="field"><label>계약금액 (1회)</label><input type="number" step="1000" name="amount" value="${r.amount??''}" placeholder="예) 3000000"></div>
      <div class="field"><label>정기청소 월 금액</label><input type="number" step="1000" name="monthly" value="${r.monthly??''}" placeholder="정기일 때만"></div>
      <div class="field full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="recurring" ${r.recurring?'checked':''} style="width:auto">정기청소 (월 금액 × ${PT(r.partner_id).months||3}개월 수수료)</label></div>
      <div class="field full"><label>일정판 현장 연결 (잔금 받음 확인용)</label><select name="job_id"><option value="">연결 안 함</option>${jobs.map(j => `<option value="${j.id}" ${r.job_id===j.id?'selected':''}>${md(j.job_date)} ${esc(j.title)}</option>`).join('')}</select></div>
      <div class="field full"><label>파트너에게 보이는 메모</label><input name="note" value="${esc(r.note||'')}" placeholder="예) 11/6 현장 견적 방문 예정"></div>
      <div class="field full"><label>불발 사유 (불발일 때)</label><input name="lost_reason" value="${esc(r.lost_reason||'')}" placeholder="예) 기존 업체와 계속하기로"></div>
      <div class="field"><label>고객 이름·업체</label><input name="customer" value="${esc(r.customer)}"></div>
      <div class="field"><label>연락처</label><input name="phone" value="${esc(r.phone||'')}"></div>
      <div class="field"><label>지역</label><input name="area" value="${esc(r.area||'')}"></div>
      <div class="field"><label>소개한 파트너</label><select name="partner_id"><option value="">없음</option>${(H.S.partners||[]).map(p => `<option value="${p.id}" ${r.partner_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
    </div>
    <p class="note" style="margin-top:8px">계약 성사로 저장하면 수수료 줄이 자동으로 생겨요. 이미 입금한 회차는 그대로 둬요.</p>
    ${H.sacts('저장', `<button type="button" class="btn danger" data-a="refDel" data-r="${r.id}" style="flex:0 0 auto">지우기</button>`)}<input type="hidden" name="id" value="${r.id}"></form>`, true); };
H.ACT.refDel = async el => { if (!confirm('이 소개를 지울까요? (수수료 줄도 같이 지워져요)')) return; await H.q(sb.from('referrals').delete().eq('id', +el.dataset.r)); H.close(); H.toast('지웠어요'); H.refresh(); };

// 계약 성사 → 수수료 회차 만들기 (입금 안 한 줄만 다시 계산)
const makePays = async r => {
  if (!H.S.needV42) return -1;   // v42부터는 서버(트리거)가 수수료 회차를 만듦 — 관리자가 처리해도 생김
  const p = PT(r.partner_id); if (!p.id) return 0;
  const old = (H.S.ppays||[]).filter(x => x.referral_id === r.id);
  const unpaid = old.filter(x => !x.paid_on).map(x => x.id);
  if (unpaid.length) await H.q(sb.from('partner_payouts').delete().in('id', unpaid));
  if (r.status !== 'won') return 0;
  const paidRounds = new Set(old.filter(x => x.paid_on).map(x => x.round));
  const rate = +p.rate || 10, start = (r.won_at || ymd(H.today())).slice(0,7);
  const rows = [];
  if (r.recurring && r.monthly) { const n = +p.months || 3;
    for (let i = 1; i <= n; i++) { if (paidRounds.has(i)) continue; const fee = Math.round(r.monthly * rate / 100); const tax = H.deduct('freelance33', fee);
      rows.push({referral_id: r.id, partner_id: p.id, round: i, rounds: n, base: r.monthly, fee, tax, pay: fee - tax, due_month: addMonth(start, i-1)}); } }
  else if (r.amount && !paidRounds.has(1)) { const fee = Math.round(r.amount * rate / 100); const tax = H.deduct('freelance33', fee);
    rows.push({referral_id: r.id, partner_id: p.id, round: 1, rounds: 1, base: r.amount, fee, tax, pay: fee - tax, due_month: start}); }
  if (rows.length) await H.q(sb.from('partner_payouts').insert(rows));
  return rows.length;
};
H.FORM.refEdit = async v => { const id = +v.get('id'), r0 = R(id);
  const up = {status: v.get('status'), amount: H.nnum(v.get('amount')), monthly: H.nnum(v.get('monthly')), recurring: v.get('recurring') === 'on',
    job_id: H.nnum(v.get('job_id')), note: H.nn((v.get('note')||'').trim()), lost_reason: H.nn((v.get('lost_reason')||'').trim()),
    customer: (v.get('customer')||'').trim() || r0.customer, phone: H.nn(v.get('phone')), area: H.nn(v.get('area')), partner_id: H.nnum(v.get('partner_id')), updated_at: new Date().toISOString()};
  if (up.status === 'won' && !r0.won_at) up.won_at = ymd(H.today());
  if (up.status === 'won' && !up.amount && !(up.recurring && up.monthly)) return H.toast('계약 성사면 계약금액(또는 정기 월 금액)을 넣어 주세요');
  await H.q(sb.from('referrals').update(up).eq('id', id));
  const n = await makePays({...r0, ...up, id});
  H.close(); H.toast(up.status === 'won' ? (n < 0 ? '계약 성사 · 수수료는 자동으로 잡혔어요' : `계약 성사 · 수수료 ${n}줄 만들었어요`) : '저장했어요 · 파트너 화면에도 바로 보여요'); H.refresh(); };

H.ACT.refNew = () => H.open(`<form data-f="refNew"><h3>본사 입력 · 소개 접수</h3><p class="note" style="margin:-6px 0 10px">파트너가 전화·카톡으로 알려준 소개를 대신 넣어요.</p>
  <div class="fg"><div class="field full"><label>소개한 파트너</label><select name="partner_id" required>${(H.S.partners||[]).filter(p=>p.status!=='end').map(p => `<option value="${p.id}">${esc(p.name)} · ${PK[p.kind]}</option>`).join('')}</select></div>
  <div class="field"><label>업체명 · 고객 이름</label><input name="customer" required></div><div class="field"><label>연락처</label><input name="phone" inputmode="tel"></div>
  <div class="field"><label>지역 (동까지)</label><input name="area"></div><div class="field"><label>청소 종류</label><select name="kind">${KINDS.map(k=>`<option>${k}</option>`).join('')}</select></div>
  <div class="field full"><label>메모</label><input name="memo"></div></div>${H.sacts('접수')}</form>`);
H.FORM.refNew = async v => { if (!(H.S.partners||[]).length) return H.toast('먼저 파트너를 추가해 주세요');
  const r = await H.q(sb.from('referrals').insert({partner_id: +v.get('partner_id'), customer: v.get('customer').trim(), phone: H.nn(v.get('phone')), area: H.nn(v.get('area')), kind: v.get('kind'), memo: H.nn(v.get('memo')), consent: true, source: 'hq'}).select().single());
  H.close(); H.toast(r.dup_of ? '접수했어요 · 같은 연락처로 먼저 들어온 소개가 있어요' : '접수했어요'); H.refresh(); };

H.ACT.ptNotice = () => H.open(`<form data-f="ptNotice"><h3>파트너 화면 공지</h3><p class="note" style="margin:-6px 0 10px">모든 파트너 화면 맨 위에 보여요. 비우면 안 보여요.</p>
  <div class="field"><textarea name="t" style="min-height:120px">${esc(H.setting('partner_notice')||'')}</textarea></div>${H.sacts('저장')}</form>`);
H.FORM.ptNotice = async v => { const t = (v.get('t')||'').trim(); await H.q(sb.from('settings').upsert({key:'partner_notice', value: t})); H.close(); H.toast('공지 저장했어요'); H.refresh(); };

/* ---------- 파트너 명부 ---------- */
H.partnerList = () => {
  if (H.S.needV40) return needBox();
  const S = H.S, refs = S.refs || [], pays = S.ppays || [];
  const rows = (S.partners||[]).slice().sort((a,b) => ({active:0,sleep:1,end:2}[a.status] - {active:0,sleep:1,end:2}[b.status]) || b.created_at.localeCompare(a.created_at)).map(p => {
    const mine = refs.filter(r => r.partner_id === p.id), wonN = mine.filter(r => r.status === 'won').length;
    const fee = pays.filter(x => x.partner_id === p.id).reduce((a,x) => a + (x.fee||0), 0);
    return `<tr${p.status==='end'?' style="opacity:.55"':''}><td><b>${esc(p.name)}</b><div class="note">${esc(p.job||'')}${p.phone?' · '+esc(p.phone):''}</div></td><td>${PK[p.kind]}</td><td>${mine.length}</td><td>${wonN}</td>
      <td>${S.owner ? won(fee) : '-'}</td><td>${p.signed ? '<span class="pill p-ok">서명</span>' : '<span class="pill p-warn">미서명</span>'}</td><td>${PS[p.status]}</td>
      <td style="white-space:nowrap"><button class="btn sm ghost" data-a="ptLink" data-p="${p.id}">${H.I('link')} 링크 보내기</button> <button class="btn sm ghost" data-a="ptEdit" data-p="${p.id}">수정</button></td></tr>`; }).join('');
  return `<section class="box"><div class="bh"><h3>파트너 ${(S.partners||[]).filter(p=>p.status==='active').length}명</h3><button class="btn sm" data-a="ptEdit">+ 파트너 추가</button></div>
    <div class="tbl"><table><thead><tr><th>이름</th><th>유형</th><th>소개</th><th>성사</th><th>누적 수수료</th><th>계약서</th><th>상태</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="empty">아직 파트너가 없어요 · [+ 파트너 추가]로 시작</td></tr>'}</tbody></table></div>
    <p class="note" style="margin-top:8px">파트너는 앱 설치 없이 개인 링크 하나로 소개 접수·진행 현황·내 돈을 봐요. 소개 링크로 고객이 직접 문의하면 그 파트너 소개로 자동 기록돼요.</p></section>`;
};
H.ACT.ptEdit = el => { const p = el.dataset.p ? PT(+el.dataset.p) : {kind:'refer', status:'active', rate:10, months:3};
  H.open(`<form data-f="ptEdit"><h3>${p.id ? esc(p.name) : '파트너 추가'}</h3><div class="fg">
    <div class="field"><label>이름</label><input name="name" value="${esc(p.name||'')}" required></div>
    <div class="field"><label>연락처</label><input name="phone" value="${esc(p.phone||'')}" inputmode="tel"></div>
    <div class="field"><label>유형</label><select name="kind">${Object.entries(PK).map(([k,l]) => `<option value="${k}" ${p.kind===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>하는 일 (메모)</label><input name="job" value="${esc(p.job||'')}" placeholder="직장인 · 공인중개사 · 주부 …"></div>
    <div class="field"><label>수수료 %</label><input type="number" step="0.5" name="rate" value="${p.rate??10}"></div>
    <div class="field"><label>정기청소 개월 수</label><input type="number" name="months" value="${p.months??3}"></div>
    <div class="field"><label>상태</label><select name="status">${Object.entries(PS).map(([k,l]) => `<option value="${k}" ${p.status===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>소개 링크 코드</label><input name="ref_code" value="${esc(p.ref_code||'')}" placeholder="비우면 자동"></div>
    <div class="field full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="signed" ${p.signed?'checked':''} style="width:auto">파트너 계약서 서명 완료</label></div>
    ${H.S.owner ? `<div class="field full"><label>입금 계좌 (대표만 봄)</label><input name="bank" value="${esc((H.S.pbank||{})[p.id]||'')}" placeholder="은행 · 계좌번호 · 예금주"></div>` : ''}
    <div class="field full"><label>메모</label><input name="memo" value="${esc(p.memo||'')}"></div></div>
    ${H.sacts('저장')}<input type="hidden" name="id" value="${p.id||''}"></form>`, true); };
H.FORM.ptEdit = async v => { const id = H.nnum(v.get('id'));
  const code = (v.get('ref_code')||'').trim().replace(/[^A-Za-z0-9_-]/g,'') || (id && PT(id).ref_code) || H.rnd(6);
  const row = {name: v.get('name').trim(), phone: H.nn(v.get('phone')), kind: v.get('kind'), job: H.nn(v.get('job')), rate: +v.get('rate')||10, months: +v.get('months')||3,
    status: v.get('status'), ref_code: code, signed: v.get('signed') === 'on', memo: H.nn(v.get('memo'))};
  if (H.S.owner && H.S.needV42) row.bank = H.nn(v.get('bank'));
  let pid = id;
  if (id) await H.q(sb.from('partners').update(row).eq('id', id)); else pid = (await H.q(sb.from('partners').insert(row).select('id').single())).id;
  if (H.S.owner && !H.S.needV42) await H.q(sb.from('partner_private').upsert({partner_id: pid, bank: H.nn(v.get('bank')), updated_at: new Date().toISOString()}));
  H.close(); H.toast(id ? '저장했어요' : '파트너를 추가했어요 · [링크 보내기]로 개인 링크를 보내세요'); H.refresh(); };
H.ACT.ptLink = el => { const p = PT(+el.dataset.p);
  const msg = `${p.name}님, 리츠종합클린 영업파트너가 되신 걸 환영해요 :)\n\n① 내 파트너 화면 (소개 접수 · 진행 현황 · 내 수수료)\n${H.partnerUrl(p)}\n\n② 고객님께 보내는 소개 링크 (여기로 문의하면 ${p.name}님 소개로 자동 기록)\n${H.refUrl(p)}\n\n궁금한 건 010-7193-2246 으로 편하게 연락 주세요!`;
  H.open(`<h3>${esc(p.name)} · 링크</h3>
    <div class="field"><label>파트너 화면 (본인만)</label><input readonly value="${esc(H.partnerUrl(p))}"></div>
    <div class="field" style="margin-top:8px"><label>고객용 소개 링크</label><input readonly value="${esc(H.refUrl(p))}"></div>
    <div class="sacts"><button type="button" class="btn ghost" data-a="ptCopyOne" data-t="${esc(H.refUrl(p))}">소개 링크만 복사</button><button type="button" class="btn" data-a="ptCopyOne" data-t="${esc(msg)}">안내 멘트 복사</button></div>`); };
H.ACT.ptCopyOne = el => H.copy(el.dataset.t, '복사했어요 · 카톡에 붙여넣으세요');

/* ---------- 파트너 대화 (v41) ---------- */
H.V.pchat = H.V.pchat || {room: 'notice'};
const hm = t => { const d = new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
H.partnerChat = () => {
  if (H.S.needV40) return needBox();
  if (H.S.needV41) return `<section class="box"><div class="bh"><h3>파트너 대화 시작하기 (서버 업데이트 한 번)</h3></div><p class="note">📣 파트너 공지방 + 💬 1:1 대화 표를 만들어야 해요. [SQL 복사] → Supabase SQL Editor에 붙여넣고 Run → '업데이트 완료 (v41)' 확인 후 새로고침.</p><div style="margin-top:10px"><button class="btn" data-a="v41copy">SQL 복사</button></div></section>`;
  const M = H.S.pmsgs || [], room = H.V.pchat.room;
  const ps = (H.S.partners||[]).filter(p => p.status !== 'end').map(p => { const mine = M.filter(m => m.partner_id === p.id); return {p, last: mine[0], un: mine.filter(m => !m.from_hq && !m.hq_read_at).length}; })
    .sort((a,b) => (b.last ? b.last.created_at : '').localeCompare(a.last ? a.last.created_at : '') || a.p.name.localeCompare(b.p.name));
  const noticeLast = M.find(m => m.partner_id == null);
  const item = (key, title, sub, un) => `<button class="pc-it" data-a="pcRoom" data-r="${key}" aria-pressed="${String(room)===String(key)}"><b>${title}</b>${un ? `<span class="cnt">${un}</span>` : ''}<small>${esc(sub||'')}</small></button>`;
  const list = item('notice', '📣 파트너 공지방', noticeLast ? noticeLast.body.slice(0,30) : '전체 파트너에게 보여요', 0) + ps.map(x => item(x.p.id, '💬 ' + esc(x.p.name), x.last ? x.last.body.slice(0,30) : '아직 대화 없음', x.un)).join('');
  const msgs = (room === 'notice' ? M.filter(m => m.partner_id == null) : M.filter(m => m.partner_id === +room)).slice().reverse();
  const P = room === 'notice' ? null : PT(+room);
  const thread = msgs.map(m => `<div class="pc-m ${m.from_hq ? 'me' : ''}"><div class="b">${esc(m.body)}</div><small>${m.from_hq ? esc(m.author||'리츠') + ' · ' : ''}${hm(m.created_at)}</small></div>`).join('') || `<p class="empty">${room === 'notice' ? '첫 공지를 올려보세요 · 모든 파트너 화면에 보여요' : '아직 대화가 없어요'}</p>`;
  return `<section class="box pcx"><div class="pc-l">${list}</div><div class="pc-r">
    <div class="bh" style="margin-bottom:6px"><h3>${room === 'notice' ? '📣 파트너 공지방 <span class="sub" style="font-weight:400">모든 활동 파트너에게 보여요</span>' : '💬 ' + esc(P.name) + ' <span class="sub" style="font-weight:400">' + esc(P.job||'') + '</span>'}</h3>${P && P.phone ? `<a class="btn sm ghost" href="tel:${esc(digits(P.phone))}">전화</a>` : ''}</div>
    <div class="pc-th" id="pcth">${thread}</div>
    <form data-f="pcSend" class="pc-in"><textarea name="t" placeholder="${room === 'notice' ? '공지·안내글 (예: 11월 이벤트, 소개 잘 받는 법)' : '메시지'}" required></textarea><input type="hidden" name="room" value="${room}"><button class="btn" type="submit">${room === 'notice' ? '공지 올리기' : '보내기'}</button></form>
    ${room === 'notice' ? `<div class="pc-tp">${['이번 달 이벤트 안내','소개 잘 받는 법','수수료 지급 안내'].map((t,i) => `<button type="button" class="btn sm ghost" data-a="pcTpl" data-i="${i}">${t}</button>`).join('')}</div>` : ''}</div></section>`;
};
H.ACT.v41copy = async () => { const t = await (await fetch('update_v41.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL 복사했어요 · SQL Editor에 붙여넣고 Run'); };
H.ACT.pcRoom = async el => { H.V.pchat.room = el.dataset.r === 'notice' ? 'notice' : +el.dataset.r;
  const pid = H.V.pchat.room; if (pid !== 'notice') { const ids = (H.S.pmsgs||[]).filter(m => m.partner_id === pid && !m.from_hq && !m.hq_read_at).map(m => m.id);
    if (ids.length) { const t = new Date().toISOString(); await H.q(sb.from('partner_msgs').update({hq_read_at: t}).in('id', ids)); H.S.pmsgs.forEach(m => { if (ids.includes(m.id)) m.hq_read_at = t; }); } }
  H.$('#main').innerHTML = H.views.ops.render(); H.pcScroll(); };
H.pcScroll = () => { const t = document.getElementById('pcth'); if (t) t.scrollTop = t.scrollHeight; };
const TPL = ['[이번 달 이벤트]\n이번 달 정기청소 소개는 첫 달 수수료를 ○%로 드려요!\n주변 가게·사무실 사장님께 소개 링크 보내주세요 :)',
  '[소개 잘 받는 법]\n1. 인테리어 끝난 가게·사무실이 제일 좋아요 (준공청소)\n2. 이사·입주 앞둔 지인\n3. 청소업체 바꾸고 싶은 사장님\n소개 링크로 보내면 자동으로 파트너님 소개로 기록돼요!',
  '[수수료 지급 안내]\n계약 성사 + 잔금까지 받은 현장은 매월 ○일에 3.3% 공제 후 입금돼요.\n파트너 화면 [내 돈]에서 언제든 확인하세요.'];
H.ACT.pcTpl = el => { const ta = document.querySelector('.pc-in textarea'); if (ta) { ta.value = TPL[+el.dataset.i].replace(/\\n/g, '\n'); ta.focus(); } };
H.FORM.pcSend = async v => { const t = (v.get('t')||'').trim(); if (!t) return; const room = v.get('room');
  const row = {partner_id: room === 'notice' ? null : +room, from_hq: true, author: H.S.name || '리츠', body: t};
  const r = await H.q(sb.from('partner_msgs').insert(row).select().single()); H.S.pmsgs.unshift(r);
  H.$('#main').innerHTML = H.views.ops.render(); H.pcScroll(); H.toast(room === 'notice' ? '공지 올렸어요 · 파트너 화면 대화에 보여요' : '보냈어요'); };

/* ---------- 수수료 정산 (대표만) ---------- */
H.partnerFee = () => {
  if (H.S.needV40) return needBox();
  if (!H.S.owner) return '<p class="empty">수수료 정산은 대표님 화면에서만 보여요.</p>';
  const m = ym(H.V.ops.month), pays = H.S.ppays || [];
  const list = pays.filter(x => x.due_month === m || (!x.paid_on && x.due_month < m)).sort((a,b) => a.due_month.localeCompare(b.due_month) || a.partner_id - b.partner_id);
  const sum = k => list.reduce((a,x) => a + (x[k]||0), 0);
  const job = r => r && r.job_id && (H.S.jobs||[]).find(j => j.id === r.job_id);
  const rows = list.map(x => { const r = R(x.referral_id) || {}, p = PT(x.partner_id), j = job(r);
    const col = !r.job_id ? '<span class="pill p-mute">현장 미연결</span>' : !j ? '<span class="pill p-mute">기간 밖</span>' : j.collected_at ? '<span class="pill p-ok">잔금 받음</span>' : '<span class="pill p-warn">잔금 미수</span>';
    return `<tr${x.paid_on?' style="opacity:.6"':''}><td><b>${esc(p.name)}</b></td><td>${esc(r.customer||'')}${x.due_month < m ? ' <span class="pill p-warn">밀림</span>' : ''}</td><td>${x.rounds > 1 ? `정기 ${x.round}/${x.rounds}` : '1회'}</td>
      <td class="num">${won(x.base)}</td><td class="num">${won(x.fee)}</td><td class="num">${won(x.tax)}</td><td class="num"><b>${won(x.pay)}</b></td><td>${col}</td>
      <td style="white-space:nowrap">${H.S.pbank[p.id] ? `<button class="btn sm ghost" data-a="ptCopyOne" data-t="${esc(H.S.pbank[p.id])}">계좌</button> ` : ''}${x.paid_on ? `<span class="pill p-ok">${md(x.paid_on)} 입금</span> <button class="btn sm ghost" data-a="ppUndo" data-x="${x.id}">취소</button>` : `<button class="btn sm" data-a="ppPaid" data-x="${x.id}">입금 완료</button>`}</td></tr>`; }).join('');
  return `<section class="box"><div class="bh"><h3>파트너 수수료 · ${H.V.ops.month.getFullYear()}년 ${H.V.ops.month.getMonth()+1}월</h3><span class="sub">잔금 받은 현장만 지급 · 3.3% 원천징수</span></div>
    <div class="pt-kpis" style="margin-bottom:12px"><div><small>수수료 합계</small><b>${won(sum('fee'))}</b></div><div><small>3.3% 공제</small><b>${won(sum('tax'))}</b></div><div><small>보낼 돈</small><b style="color:var(--wait)">${won(list.filter(x=>!x.paid_on).reduce((a,x)=>a+x.pay,0))}</b></div><div><small>입금 완료</small><b>${list.filter(x=>x.paid_on).length}<i>/ ${list.length}건</i></b></div></div>
    <div class="tbl"><table><thead><tr><th>파트너</th><th>고객</th><th>구분</th><th class="num">기준금액</th><th class="num">수수료</th><th class="num">3.3%</th><th class="num">보낼 돈</th><th>현장</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="empty">이번 달 지급할 수수료가 없어요</td></tr>'}</tbody></table></div>
    <p class="note" style="margin-top:8px">정기청소는 계약 성사 달부터 개월 수만큼 회차가 자동으로 잡혀요. 입금 완료를 누르면 파트너 화면 '받은 돈'에 바로 반영돼요.</p></section>`;
};
H.ACT.ppPaid = async el => { await H.q(sb.from('partner_payouts').update({paid_on: ymd(H.today())}).eq('id', +el.dataset.x)); H.toast('입금 완료 · 파트너 화면에 바로 보여요'); H.refresh(); };
H.ACT.ppUndo = async el => { if (!confirm('입금 완료를 취소할까요?')) return; await H.q(sb.from('partner_payouts').update({paid_on: null}).eq('id', +el.dataset.x)); H.refresh(); };
/* ---------- 사진 자료 (v43) : 파트너가 받아 가는 현장 사진 앨범 ---------- */
const KURL = (path, bucket) => `${window.EP_CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket||'live'}/${path}`;
const STG = {before:'작업 전', during:'작업 중', after:'작업 후'};
const KINDS2 = ['준공·인테리어 후','상가·사무실 정기','입주·이사','외국계 사무실','특수청소','기타'];
const KK = id => (H.S.pkit||[]).find(k => k.id === +id);
H.ACT.v43copy = async () => { const t = await (await fetch('update_v43.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL 복사했어요 · SQL Editor에 붙여넣고 Run'); };
H.partnerKit = () => {
  if (H.S.needV40) return needBox();
  if (H.S.needV43) return `<section class="box"><div class="bh"><h3>사진 자료함 시작하기 (서버 업데이트 한 번)</h3></div>
    <p class="note" style="line-height:1.7">1. [SQL 복사] → 2. Supabase SQL Editor에 붙여넣고 Run → 3. '업데이트 완료 (v43)'가 보이면 새로고침</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-a="v43copy">SQL 복사</button><a class="btn ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">SQL Editor 열기</a></div></section>`;
  const K = H.S.pkit || [];
  const tile = k => { const ph = k.photos||[], cv = ph.find(x=>x.stage==='after') || ph[0];
    return `<div class="kt${k.hidden?' hid':''}">${cv ? `<img loading="lazy" src="${KURL(cv.path, cv.bucket)}" alt="">` : '<div class="kt-e">사진 없음</div>'}
      <div class="kt-b"><b>${esc(k.title)}</b><span>${esc(k.kind||'')} · ${ph.length}장${k.hidden?' · 숨김':''}</span>
      <div class="kt-a"><button class="btn sm ghost" data-a="kitEdit" data-k="${k.id}">수정</button><button class="btn sm ghost" data-a="kitHide" data-k="${k.id}">${k.hidden?'보이기':'숨기기'}</button></div></div></div>`; };
  return `<section class="box"><div class="bh"><h3>파트너 사진 자료 ${K.filter(k=>!k.hidden).length}개</h3><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-a="kitPick">+ 현장 사진에서 고르기</button><button class="btn sm ghost" data-a="kitUp">+ 사진 직접 올리기</button></div></div>
    <p class="note" style="margin:-4px 0 12px">여기 올린 앨범은 파트너 화면 '홍보 자료함'에 바로 보여요. 파트너는 사진 저장 · 자랑 문구 복사만 할 수 있어요.<br>⚠️ 간판 · 상호 · 사람 얼굴 · 주소가 보이는 사진은 빼 주세요.</p>
    <div class="kgrid">${K.map(tile).join('') || '<p class="empty">아직 없어요 · 작업 전·후가 잘 나온 현장부터 올려 보세요</p>'}</div></section>`;
};
const kitForm = (k, photos, extra) => `<form data-f="kitSave"><input type="hidden" name="id" value="${k.id||''}"><input type="hidden" name="job" value="${k.job_id||''}">
  <h3>${k.id ? '사진 자료 수정' : '파트너 사진 자료 만들기'}</h3><div class="fg">
  <div class="field full"><label>제목 (상호 말고 지역·업종으로)</label><input name="title" required value="${esc(k.title||'')}" placeholder="예) 해운대 카페 준공청소"></div>
  <div class="field full"><label>종류</label><select name="kind">${KINDS2.map(x=>`<option ${x===(k.kind||KINDS2[0])?'selected':''}>${x}</option>`).join('')}</select></div>
  ${extra||''}
  ${photos.length ? `<div class="field full"><label>사진 고르기 · 전/후 바꾸기</label><div class="kpick">${photos.map((p,i)=>`<label><input type="checkbox" name="ph" value="${i}" ${p.on?'checked':''}><img loading="lazy" src="${KURL(p.path, p.bucket)}" alt=""><select name="st${i}">${Object.entries(STG).map(([a,b])=>`<option value="${a}" ${a===p.stage?'selected':''}>${b}</option>`).join('')}</select></label>`).join('')}</div></div>` : ''}
  <div class="field full"><label>자랑 문구 (파트너가 복사해서 보내요)</label><textarea name="cap" rows="3" placeholder="예) 인테리어 끝난 카페, 먼지 하나 없이 오픈 준비 끝! 부산 리츠종합클린">${esc(k.caption||'')}</textarea></div></div>
  <div class="sacts">${k.id?`<button type="button" class="btn ghost" data-a="kitDel" data-k="${k.id}" style="margin-right:auto;color:#B42318">삭제</button>`:''}<button type="button" class="btn ghost" data-a="close">닫기</button><button class="btn">저장 · 파트너에게 보이기</button></div></form>`;
H._kitPhotos = [];
H.ACT.kitPick = async () => {
  H.open('<h3>현장 사진에서 고르기</h3><div class="spin"></div>', true);
  const ph = await H.q(sb.from('job_photos').select('id, job_id, path, bucket, stage, hidden, created_at, jobs(title, job_date)').eq('hidden', false).order('created_at', {ascending:false}).limit(600));
  const by = {}; ph.forEach(p => { (by[p.job_id] = by[p.job_id] || {job: p.jobs||{}, list: []}).list.push(p); });
  H._kitJobs = by;
  const used = new Set((H.S.pkit||[]).map(k => k.job_id));
  const rows = Object.entries(by).map(([id, g]) => { const b = g.list.filter(p=>p.stage==='before').length, a = g.list.filter(p=>p.stage==='after').length;
    return `<button class="kjob" data-a="kitJob" data-j="${id}"><img loading="lazy" src="${KURL((g.list.find(p=>p.stage==='after')||g.list[0]).path, g.list[0].bucket)}" alt=""><span><b>${esc(g.job.title||'현장')}</b><small>${esc(g.job.job_date||'')} · 전 ${b} · 후 ${a} · 전체 ${g.list.length}장${used.has(+id)?' · 이미 올림':''}</small></span>${b&&a?'<em>전·후 있음</em>':''}</button>`; }).join('');
  H.open(`<h3>현장 사진에서 고르기</h3><p class="note" style="margin:-6px 0 10px">직원이 현장노트에 올린 사진이에요 (고객 화면에서 숨긴 사진은 빠져요). 전·후가 다 있는 현장이 홍보에 좋아요.</p>
    <div class="kjobs">${rows || '<p class="empty">아직 현장 사진이 없어요</p>'}</div><div class="sacts"><button class="btn ghost" data-a="close">닫기</button></div>`, true);
};
H.ACT.kitJob = el => { const g = H._kitJobs[el.dataset.j]; if (!g) return;
  H._kitPhotos = g.list.map(p => ({path: p.path, bucket: p.bucket||'live', stage: p.stage, on: p.stage !== 'during'}));
  H.open(kitForm({job_id: +el.dataset.j, kind: KINDS2[0]}, H._kitPhotos), true); };
H.ACT.kitEdit = el => { const k = KK(el.dataset.k); if (!k) return;
  H._kitPhotos = (k.photos||[]).map(p => ({...p, on: true}));
  H.open(kitForm(k, H._kitPhotos), true); };
H.ACT.kitUp = () => { H._kitPhotos = [];
  H.open(kitForm({}, [], `<div class="field full"><label>사진 (여러 장 · 작업 전 사진부터 순서대로)</label><input type="file" name="files" accept="image/*" multiple required></div><div class="field full"><label>올린 사진 구분</label><select name="ust"><option value="pair">앞 절반 작업 전 · 뒤 절반 작업 후</option><option value="after">전부 작업 후</option><option value="before">전부 작업 전</option></select></div>`), true); };
const shrink = async file => { try { const bmp = await createImageBitmap(file, {imageOrientation:'from-image'}); const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width*s); c.height = Math.round(bmp.height*s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82)); } catch(_) { return file; } };
H.FORM.kitSave = async v => {
  const on = new Set(v.getAll('ph').map(Number));
  let photos = H._kitPhotos.map((p,i) => ({path: p.path, bucket: p.bucket, stage: v.get('st'+i) || p.stage, on: on.has(i)})).filter(p => p.on).map(({on, ...p}) => p);
  const files = v.getAll('files').filter(f => f && f.size);
  if (files.length) { H.toast(`사진 ${files.length}장 올리는 중…`); const half = Math.ceil(files.length/2), ust = v.get('ust') || 'after';
    for (let i = 0; i < files.length; i++) { const b = await shrink(files[i]); const path = `${ymd(H.today()).slice(0,7)}/${Date.now()}_${i}.jpg`;
      const r = await sb.storage.from('kit').upload(path, b, {contentType: 'image/jpeg'}); if (r.error) return H.toast('사진 올리기 실패 · ' + r.error.message);
      photos.push({path, bucket: 'kit', stage: ust === 'pair' ? (i < half ? 'before' : 'after') : ust}); } }
  if (!photos.length) return H.toast('사진을 1장 이상 골라 주세요');
  const ord = {before:0, during:1, after:2}; photos.sort((a,b) => ord[a.stage]-ord[b.stage]);
  const row = {title: v.get('title').trim(), kind: v.get('kind'), caption: H.nn((v.get('cap')||'').trim()), photos, job_id: H.nnum(v.get('job'))};
  const id = H.nnum(v.get('id'));
  await H.q(id ? sb.from('partner_kit').update(row).eq('id', id) : sb.from('partner_kit').insert(row));
  H.close(); H.toast('저장했어요 · 파트너 화면 홍보 자료함에 바로 보여요'); H.refresh(); };
H.ACT.kitHide = async el => { const k = KK(el.dataset.k); await H.q(sb.from('partner_kit').update({hidden: !k.hidden}).eq('id', k.id)); H.toast(k.hidden ? '다시 보여요' : '파트너 화면에서 숨겼어요'); H.refresh(); };
H.ACT.kitDel = async el => { if (!confirm('이 사진 자료를 지울까요? (현장 사진 원본은 그대로예요)')) return; const k = KK(el.dataset.k);
  const mine = (k.photos||[]).filter(p => p.bucket === 'kit').map(p => p.path); if (mine.length) await sb.storage.from('kit').remove(mine);
  await H.q(sb.from('partner_kit').delete().eq('id', k.id)); H.close(); H.toast('지웠어요'); H.refresh(); };
/* ---------- 빈 날 특가 (v44) : 14일 안 빈 날만 10% ---------- */
const DOW = ['일','월','화','수','목','금','토'];
const dLabel = x => { const [y,m,d] = x.d.split('-').map(Number); return `${m}/${d}(${DOW[x.dow]})`; };
const slot = x => x.am && x.pm ? '종일' : x.am ? '오전' : '오후';
H.dealText = (kind) => { const D = (H.S.deal||{}).days||[], r = (H.S.deal||{}).rate||10; const list = D.map(x => `✔ ${dLabel(x)} ${slot(x)}`).join('\n');
  if (!D.length) return '';
  if (kind === 'insta') return `📅 리츠 이번 주 빈 날 특가 ${r}%\n\n아래 날짜에 예약하시면 ${r}% 할인해 드려요.\n${list}\n\n하루 한 집만 집중해서 작업해요.\n먼저 연락 주시는 분께 드려요 :)\n\n📞 010-7193-2246 · DM\n\n#리츠종합클린 #부산청소 #입주청소 #이사청소 #빈날특가`;
  if (kind === 'karrot') return `[리츠종합클린] 이번 주 빈 날 ${r}% 특가\n\n${list}\n\n위 날짜에 청소 예약하시면 ${r}% 할인해 드려요.\n입주·이사·상가·사무실 청소 모두 가능해요.\n먼저 연락 주시는 순서대로 마감돼요.\n\n📞 010-7193-2246`;
  if (kind === 'partner') return `🔥 이번 주 빈 날 특가 ${r}%\n\n${list}\n\n이 날짜로 소개하시면 고객님께 ${r}% 할인이 들어가요.\n"이 날이면 더 싸게 해준대요" 한마디가 제일 잘 먹혀요!`;
  return D.map(x => `${x.d} ${slot(x)}`).join('\n'); };
H.partnerDeal = () => {
  if (H.S.needV44) return `<section class="box"><div class="bh"><h3>빈 날 특가 시작하기 (서버 업데이트 한 번)</h3></div>
    <p class="note" style="line-height:1.7">1. [SQL 복사] → 2. Supabase SQL Editor에 붙여넣고 Run → 3. '업데이트 완료 (v44)'가 보이면 새로고침</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-a="v44copy">SQL 복사</button><a class="btn ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">SQL Editor 열기</a></div></section>`;
  const cfg = H.S.dealCfg || {}, off = new Set(cfg.off||[]), D = (H.S.deal||{}).days||[], by = Object.fromEntries(D.map(x => [x.d, x]));
  const t0 = H.today(), cells = [];
  for (let i = 1; i <= (cfg.days||14); i++) { const d = new Date(t0); d.setDate(d.getDate()+i); const k = H.ymd(d), x = by[k], isOff = off.has(k);
    const st = isOff ? ['쉬는 날','off'] : x ? [slot(x)+' 빈','free'] : ['꽉 참','full'];
    cells.push(`<button class="dl ${st[1]}" data-a="dealOff" data-d="${k}" title="눌러서 쉬는 날 지정·해제"><b>${d.getMonth()+1}/${d.getDate()}</b><small>${DOW[d.getDay()]}</small><span>${st[0]}</span></button>`); }
  const btn = (k,l) => `<button class="btn sm ghost" data-a="dealCopy" data-k="${k}">${l}</button>`;
  return `<section class="box"><div class="bh"><h3>빈 날 특가 · 앞으로 ${cfg.days||14}일</h3><div style="display:flex;gap:6px;align-items:center;font-size:13px">할인 <input type="number" min="0" max="50" value="${cfg.rate||10}" data-a="dealRate" style="width:60px;padding:6px;border:1px solid var(--line);border-radius:8px">%</div></div>
    <p class="note" style="margin:-4px 0 12px">우리 직영 현장이 하루 ${cfg.cap||2}건 미만인 날이 자동으로 '빈 날'이 돼요 (도급 현장은 안 셈). 쉬는 날은 날짜를 눌러 빼 주세요.</p>
    <div class="dls">${cells.join('')}</div>
    <div style="margin-top:16px;font-weight:700;font-size:14px">지금 특가 날짜 ${D.length}일</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${btn('insta','인스타·스레드 문구')}${btn('karrot','당근 소식 문구')}${btn('soomgo','숨고용 날짜 목록')}<button class="btn sm" data-a="dealNotice">파트너 공지로 보내기</button></div>
    <p class="note" style="margin-top:12px">숨고 견적 점검은 이 날짜를 읽어서, 고객 희망일이 빈 날이면 자동으로 ${cfg.rate||10}% 할인가로 보내요. 파트너 화면 홈에도 바로 떠요.</p></section>`;
};
const saveDeal = async cfg => { await H.q(sb.from('settings').upsert({key:'deal', value: cfg})); H.S.dealCfg = cfg; H.S.deal = await H.q(sb.rpc('deal_days')); H.render(); };
H.ACT.v44copy = async () => { const t = await (await fetch('update_v44.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL 복사했어요 · SQL Editor에 붙여넣고 Run'); };
H.ACT.dealOff = async el => { const cfg = {...(H.S.dealCfg||{})}, off = new Set(cfg.off||[]), k = el.dataset.d; off.has(k) ? off.delete(k) : off.add(k);
  const today = H.ymd(H.today()); cfg.off = [...off].filter(x => x > today).sort(); await saveDeal(cfg); H.toast(off.has(k) ? '쉬는 날로 뺐어요' : '다시 특가 대상이에요'); };
document.addEventListener('change', async e => { if (!e.target.matches('[data-a="dealRate"]')) return; const v = Math.max(0, Math.min(50, +e.target.value||0)); await saveDeal({...(H.S.dealCfg||{}), rate: v}); H.toast(`할인 ${v}%로 바꿨어요`); });
H.ACT.dealCopy = el => { const t = H.dealText(el.dataset.k); if (!t) return H.toast('지금 특가 날짜가 없어요'); H.copy(t, '복사했어요'); };
H.ACT.dealNotice = async () => { const t = H.dealText('partner'); if (!t) return H.toast('지금 특가 날짜가 없어요'); if (!confirm('파트너 공지방에 빈 날 특가를 올릴까요?')) return;
  await H.q(sb.from('partner_msgs').insert({partner_id: null, from_hq: true, author: '리츠 본사', body: t})); H.toast('파트너 공지방에 올렸어요'); };
})(window.HQ);
