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
    H.q(sb.from('partner_payouts').select('*').order('due_month', {ascending:false}).limit(2000))
  ]);
  Object.assign(H.S, {partners: p, refs: r, ppays: x});
};

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
  H.close(); H.toast(up.status === 'won' ? `계약 성사 · 수수료 ${n}줄 만들었어요` : '저장했어요 · 파트너 화면에도 바로 보여요'); H.refresh(); };

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
    ${H.S.owner ? `<div class="field full"><label>입금 계좌 (대표만 봄)</label><input name="bank" value="${esc(p.bank||'')}" placeholder="은행 · 계좌번호 · 예금주"></div>` : ''}
    <div class="field full"><label>메모</label><input name="memo" value="${esc(p.memo||'')}"></div></div>
    ${H.sacts('저장')}<input type="hidden" name="id" value="${p.id||''}"></form>`, true); };
H.FORM.ptEdit = async v => { const id = H.nnum(v.get('id'));
  const code = (v.get('ref_code')||'').trim().replace(/[^A-Za-z0-9_-]/g,'') || (id && PT(id).ref_code) || H.rnd(6);
  const row = {name: v.get('name').trim(), phone: H.nn(v.get('phone')), kind: v.get('kind'), job: H.nn(v.get('job')), rate: +v.get('rate')||10, months: +v.get('months')||3,
    status: v.get('status'), ref_code: code, signed: v.get('signed') === 'on', memo: H.nn(v.get('memo'))};
  if (H.S.owner) row.bank = H.nn(v.get('bank'));
  if (id) await H.q(sb.from('partners').update(row).eq('id', id)); else await H.q(sb.from('partners').insert(row));
  H.close(); H.toast(id ? '저장했어요' : '파트너를 추가했어요 · [링크 보내기]로 개인 링크를 보내세요'); H.refresh(); };
H.ACT.ptLink = el => { const p = PT(+el.dataset.p);
  const msg = `${p.name}님, 리츠종합클린 영업파트너가 되신 걸 환영해요 :)\n\n① 내 파트너 화면 (소개 접수 · 진행 현황 · 내 수수료)\n${H.partnerUrl(p)}\n\n② 고객님께 보내는 소개 링크 (여기로 문의하면 ${p.name}님 소개로 자동 기록)\n${H.refUrl(p)}\n\n궁금한 건 010-7193-2246 으로 편하게 연락 주세요!`;
  H.open(`<h3>${esc(p.name)} · 링크</h3>
    <div class="field"><label>파트너 화면 (본인만)</label><input readonly value="${esc(H.partnerUrl(p))}"></div>
    <div class="field" style="margin-top:8px"><label>고객용 소개 링크</label><input readonly value="${esc(H.refUrl(p))}"></div>
    <div class="sacts"><button type="button" class="btn ghost" data-a="ptCopyOne" data-t="${esc(H.refUrl(p))}">소개 링크만 복사</button><button type="button" class="btn" data-a="ptCopyOne" data-t="${esc(msg)}">안내 멘트 복사</button></div>`); };
H.ACT.ptCopyOne = el => H.copy(el.dataset.t, '복사했어요 · 카톡에 붙여넣으세요');

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
      <td style="white-space:nowrap">${p.bank ? `<button class="btn sm ghost" data-a="ptCopyOne" data-t="${esc(p.bank)}">계좌</button> ` : ''}${x.paid_on ? `<span class="pill p-ok">${md(x.paid_on)} 입금</span> <button class="btn sm ghost" data-a="ppUndo" data-x="${x.id}">취소</button>` : `<button class="btn sm" data-a="ppPaid" data-x="${x.id}">입금 완료</button>`}</td></tr>`; }).join('');
  return `<section class="box"><div class="bh"><h3>파트너 수수료 · ${H.V.ops.month.getFullYear()}년 ${H.V.ops.month.getMonth()+1}월</h3><span class="sub">잔금 받은 현장만 지급 · 3.3% 원천징수</span></div>
    <div class="pt-kpis" style="margin-bottom:12px"><div><small>수수료 합계</small><b>${won(sum('fee'))}</b></div><div><small>3.3% 공제</small><b>${won(sum('tax'))}</b></div><div><small>보낼 돈</small><b style="color:var(--wait)">${won(list.filter(x=>!x.paid_on).reduce((a,x)=>a+x.pay,0))}</b></div><div><small>입금 완료</small><b>${list.filter(x=>x.paid_on).length}<i>/ ${list.length}건</i></b></div></div>
    <div class="tbl"><table><thead><tr><th>파트너</th><th>고객</th><th>구분</th><th class="num">기준금액</th><th class="num">수수료</th><th class="num">3.3%</th><th class="num">보낼 돈</th><th>현장</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="empty">이번 달 지급할 수수료가 없어요</td></tr>'}</tbody></table></div>
    <p class="note" style="margin-top:8px">정기청소는 계약 성사 달부터 개월 수만큼 회차가 자동으로 잡혀요. 입금 완료를 누르면 파트너 화면 '받은 돈'에 바로 반영돼요.</p></section>`;
};
H.ACT.ppPaid = async el => { await H.q(sb.from('partner_payouts').update({paid_on: ymd(H.today())}).eq('id', +el.dataset.x)); H.toast('입금 완료 · 파트너 화면에 바로 보여요'); H.refresh(); };
H.ACT.ppUndo = async el => { if (!confirm('입금 완료를 취소할까요?')) return; await H.q(sb.from('partner_payouts').update({paid_on: null}).eq('id', +el.dataset.x)); H.refresh(); };
})(window.HQ);
