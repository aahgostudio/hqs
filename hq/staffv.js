/* 직원 */
(function(H){
const {esc, sb} = H;
const M2S = {'재직':'active','휴직':'leave','퇴사':'left'}, S2M = {active:'재직', leave:'휴직', left:'퇴사'};
// 정렬: 근무 → 휴직 → 퇴사, 같은 상태 안에서는 직급순 (소장 → 실장 → 팀장 → 팀원 …)
const RANK = ['대표','소장','실장','특수팀장','상가팀장','팀장','고정팀원','팀원','지원','사원','교육생'];
const rk = r => { r = r || ''; const i = RANK.findIndex(x => r.includes(x)); return i < 0 ? RANK.length : i; };
const SO = {active:0, leave:1, left:2};
const byOrder = (a,b) => (SO[a.status]??0) - (SO[b.status]??0) || rk(a.role) - rk(b.role) || String(a.created_at||'').localeCompare(String(b.created_at||''));
// 퇴사 날짜는 settings 'staff_left' {직원id: 'YYYY-MM-DD'} 에 기록, 30일 지나면 목록에서 숨김
const HIDE_DAYS = 30;
const leftMap = () => (H.S.settings && H.S.settings.staff_left) || {};
const ymd = d => { const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
const isOldLeft = s => { if (s.status !== 'left') return false; const d = leftMap()[s.id]; return !!d && (Date.now() - new Date(d + 'T00:00:00').getTime()) / 864e5 > HIDE_DAYS; };
async function saveLeft(id, status){ const m = {...leftMap()};
  if (status === 'left') { if (!m[id]) m[id] = ymd(new Date()); } else delete m[id];
  try { await H.q(sb.from('settings').upsert({key:'staff_left', value:m})); H.S.settings.staff_left = m; } catch(e){} }
H.saveLeft = saveLeft;
H.view('staff', {label:'직원',
  async load(){ H.S.staffAll = await H.q(sb.from('staff').select('*').order('created_at')); H.S.staff = H.S.staffAll.filter(x => !x.hidden);  /* 숨김 = 처음부터 없던 사람 */
    if (H.S.owner) H.S.payRules = await H.q(sb.from('pay_rules').select('*'));
    // 퇴사 날짜가 없는 예전 퇴사자는 오늘부터 30일 계산
    const m = leftMap(), miss = H.S.staff.filter(s => s.status === 'left' && !m[s.id]);
    if (miss.length) { const n = {...m}; miss.forEach(s => n[s.id] = ymd(new Date())); try { await H.q(sb.from('settings').upsert({key:'staff_left', value:n})); H.S.settings.staff_left = n; } catch(e){} } },
  render(){
    const S = H.S; const mStaff = (S.mm && S.mm.admin && S.mm.admin.staff) || [];
    const rate = id => { const r = (S.payRules||[]).find(p=>p.staff_id===id); return r && r.share_rate != null ? r.share_rate : ''; };
    const b = S.boss || {state:'근무중'};
    const leftOn = s => { const d = leftMap()[s.id]; return d ? ` <span class="note">${d.slice(5).replace('-','/')} 퇴사</span>` : ''; };
    const row = s => { const m = mStaff.find(x=>x.name===s.name); const mis = s.team==='RES' && m && M2S[m.status||'재직'] !== s.status;
      return `<tr><td><span data-a="stCard" data-s="${s.id}" style="cursor:pointer">${H.av(s, 26, s.team==='RES'?'':'cl')}</span> <button class="st-name" data-a="stCard" data-s="${s.id}" title="인사카드 열기"><b>${esc(s.name)}</b></button> <span class="note">${esc(s.role||'')}${s.partner_area?' · '+esc(s.partner_area):''}</span>${s.status==='leave'?' <span class="pill p-leave">휴직</span>':''}${s.status==='left'?leftOn(s):''}</td>
        <td><span class="tag" style="background:${H.T(s.team).color}">${s.team}</span></td>
        <td><select class="in sm" style="width:auto" data-c="stStatus" data-s="${s.id}">${Object.entries(H.ST).map(([v,l])=>`<option value="${v}" ${s.status===v?'selected':''}>${l}</option>`).join('')}</select>
          ${mis?`<div class="note" style="color:var(--warn)">매물노트는 '${esc(m.status)}' <button class="btn sm ghost" style="padding:0 6px" data-a="stSync" data-s="${s.id}">맞추기</button></div>`:''}</td>
        <td class="note">${H.PT[s.pay_type]||''}${S.owner&&s.team==='RES'?` · 배분 ${rate(s.id)!==''?rate(s.id)+'%':'미정'}`:''}</td>
        <td class="note">${esc(s.phone||'')}</td>
        <td class="note">${s.last_seen_at?H.ago(s.last_seen_at):'-'}</td>
        <td style="white-space:nowrap">${s.status!=='left'?`<button class="btn sm ghost" data-a="stLink" data-s="${s.id}">링크 복사</button> `:''}<button class="btn sm ghost" data-a="stEdit" data-s="${s.id}">수정</button></td></tr>`; };
    const hidden = S.staff.filter(isOldLeft);
    const groups = H.GROUPS.map(g => { const ms = S.staff.filter(s => g.teams.includes(s.team) && (S.showOldLeft || !isOldLeft(s))); if (!ms.length) return '';
      const sub = {OPS:'직영', SPT:'지원', PRT:'도급'};
      return `<tr class="grp"><td colspan="7">${g.label} · ${ms.filter(s=>s.status!=='left').length}명</td></tr>` + g.teams.map(t => { const ts = ms.filter(s=>s.team===t).sort(byOrder); if (!ts.length) return '';
        return (g.teams.length > 1 ? `<tr><td colspan="7" class="note" style="padding:6px 8px 2px;font-weight:700">${sub[t]||t}</td></tr>` : '') + ts.map(row).join(''); }).join(''); }).join('');
    return `<section class="box"><div class="bh"><h3>직원 전체</h3><div class="acts" style="margin:0"><button class="btn sm" data-a="stNew">+ 직원 추가</button><button class="btn sm ghost" data-a="stCopyAll">전체 링크 목록 복사</button></div></div>
      <div class="tbl"><table><thead><tr><th>이름</th><th>팀</th><th>상태</th><th>지급 방식</th><th>연락처</th><th>마지막 접속</th><th></th></tr></thead><tbody>
      <tr class="boss"><td><b>권성환</b> <span class="note">대표</span></td><td><span class="tag" style="background:var(--navy)">HQ</span></td><td>${H.bossChip()}</td><td colspan="4" class="note">대표 상태는 직원 화면 맨 위에 보여요</td></tr>
      ${groups}</tbody></table></div>
      <p class="note">휴직은 링크가 그대로 열려요. 퇴사로 바꾸면 일정판 링크가 바로 막혀요${S.owner?' · 부동산 직원은 매물노트 상태도 같이 바뀌어요':''}. 개인 링크는 카톡 1:1로만 보내 주세요. 퇴사자는 ${HIDE_DAYS}일 뒤 목록에서 숨겨져요.${hidden.length?` <button class="btn sm ghost" data-a="stOldLeft">${S.showOldLeft?'지난 퇴사자 숨기기':`지난 퇴사자 ${hidden.length}명 보기`}</button>`:''}</p></section>`;
  }
});
H.CHANGE.stStatus = async el => { const s = H.S.staff.find(x=>x.id===el.dataset.s); const v = el.value;
  if (v === 'left' && !confirm(`${s.name}님을 퇴사 처리할까요? 개인 링크가 바로 막혀요.`)) { el.value = s.status; return; }
  await H.q(sb.from('staff').update({status: v}).eq('id', s.id)); s.status = v; await saveLeft(s.id, v);
  if (s.team === 'RES' && H.S.owner && H.S.mcode) { try { H.S.mm = await H.maemul('setStaff', [{name: s.name, status: S2M[v]}]); H.toast('일정판·매물노트 상태를 같이 바꿨어요'); } catch(e){ H.toast('일정판은 바꿨어요 · 매물노트는 못 바꿨어요: ' + e.message); } }
  else H.toast('상태를 바꿨어요');
  H.render(); };
H.ACT.stOldLeft = () => { H.S.showOldLeft = !H.S.showOldLeft; H.render(); };
H.ACT.stSync = async el => { const s = H.S.staff.find(x=>x.id===el.dataset.s); H.S.mm = await H.maemul('setStaff', [{name: s.name, status: S2M[s.status]}]); H.toast('매물노트를 일정판 상태로 맞췄어요'); H.render(); };
const linkOf = s => `${location.origin}/clean/?k=${s.token}`;
const agoMsg = s => `[아고스튜디오] ${s.name} ${(s.role||'사장').replace(/님$/,'')}님, 파트너룸 링크예요.\n${linkOf(s)}\n\n· 함께하는 촬영·라이브·미팅 일정, 공지, 파트너 정산을 여기서 봐요.\n· 사장님만 쓰는 링크라 다른 분께 보내지 말아주세요.\n· 휴대폰 홈 화면에 추가해두시면 편해요.`;
const linkMsg = s => s.team === 'AGO' ? agoMsg(s) : `[${H.C.BRAND}] ${s.name}님 전용 링크예요 👇\n${linkOf(s)}\n\n✔ 이것만 하시면 돼요\n1. 현장 가면 [현장 사진] 눌러서 사진 올리기\n2. 다 끝나면 초록 [작업 끝] 누르기\n\n· 일정 신청, 일할 수 있는 날, 공지, 내 정산(번 돈·받은 돈)도 여기서 봐요\n· 지금부터 10/31까지는 베타 기간이에요. 둘러보면서 11월 일정 보고 [일할 수 있는 날] 미리 표시해 주세요. 실제 사용은 11월 1일부터예요 (대표님과의 대화도 11/1부터 이 안에서 해요)\n· 앱 설치·로그인 없어요. 링크를 열고 [홈 화면에 추가]하면 편해요\n· 본인 전용이라 다른 분께 보내지 말아주세요`;
const resMsg = s => `[${H.C.BRAND}] ${s.name}님 매물노트 링크예요 👇\n${location.origin}/maemul/?k=${s.maemul_code}\n\n✔ 이것만 하시면 돼요\n1. 매물은 [＋ 매물 등록] (캡처나 글을 넣으면 칸이 자동으로 채워져요)\n2. 계약·잔금·안내 일정은 [일정]에 넣기\n\n· 내 정산(이번 달 몫·받은 돈)도 홈에서 봐요\n· 지금부터 10/31까지는 베타 기간이에요. 연습으로 매물 1개 넣어보세요. 실제 사용은 11월 1일부터예요 (대표님과의 대화도 11/1부터 이 안에서 해요)\n· 앱 설치·로그인 없어요. 링크를 열고 [홈 화면에 추가]하면 편해요\n· 본인 전용이라 다른 분께 보내지 말아주세요`;
H.ACT.stLink = el => { const s = H.S.staff.find(x=>x.id===el.dataset.s);
  if (s.team === 'RES' && s.maemul_code) H.copy(resMsg(s), `${s.name}님 매물노트 링크 안내문 복사 · 카톡 1:1에 붙여넣으세요`);
  else H.copy(linkMsg(s), `${s.name}님 링크 안내문 복사 · 카톡 1:1에 붙여넣으세요`); };
H.ACT.stCopyAll = () => H.copy(H.S.staff.filter(s=>s.status!=='left').map(s=>`${s.name}: ${s.team==='RES'&&s.maemul_code?location.origin+'/maemul/?k='+s.maemul_code:linkOf(s)}`).join('\n'), '전체 링크 목록 복사했어요 (대표님 보관용)');
function staffSheet(s){
  const S = H.S; s = s || {team:'OPS', status:'active', pay_type:'none', can_collect:false};
  H.open(`<form data-f="staff"><h3>${s.id?'직원 수정':'직원 추가'}</h3><div class="fg">
    <div class="field"><label>이름</label><input name="name" value="${esc(s.name||'')}" required></div>
    <div class="field"><label>팀</label><select name="team" data-c="stTeam">${S.teams.filter(t=>t.code!=='HQS').map(t=>`<option value="${t.code}" ${s.team===t.code?'selected':''}>${t.code} · ${esc(t.name)}</option>`).join('')}</select></div>
    <div class="field"><label>직책 <small>(아고 파트너는 사장님)</small></label><input name="role" value="${esc(s.role||'')}"></div>
    <div class="field"><label>연락처</label><input name="phone" value="${esc(s.phone||'')}"></div>
    <div class="field full"><label>파트너 지역 · 분야 (도급)</label><input name="partner_area" value="${esc(s.partner_area||'')}"></div>
    <div class="field"><label>지급 방식</label><select name="pay_type">${Object.entries(H.PT).map(([v,l])=>`<option value="${v}" ${s.pay_type===v?'selected':''}>${l}</option>`).join('')}</select><div class="hint">세금 방식은 세무사 확인 후 정해 주세요</div></div>
    <div class="field"><label>상태</label><select name="status">${[['active','근무'],['leave','휴직 (링크 유지)'],['left','퇴사 (링크 막힘)']].map(([v,l])=>`<option value="${v}" ${s.status===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label>입사 · 계약일</label><input type="date" name="joined_on" value="${s.joined_on||''}"></div>
    <div class="field"><label>&nbsp;</label><label style="display:flex;gap:6px;align-items:center;font-size:14px;color:var(--ink)"><input type="checkbox" name="can_collect" ${s.can_collect?'checked':''} style="width:auto">수금 담당 가능</label></div>
    ${!s.id && S.owner && S.mcode ? `<div class="field full"><label style="display:flex;gap:6px;align-items:center;font-size:14px;color:var(--ink)"><input type="checkbox" name="mm" style="width:auto">부동산 직원이면 매물노트 파일·링크도 같이 만들기</label></div>` : ''}
  </div>${H.sacts('저장', s.id?`<button type="button" class="btn ghost" data-a="stToken" data-s="${s.id}" style="flex:0 0 auto">링크 새로 발급</button>`:'')}<input type="hidden" name="id" value="${s.id||''}"></form>`);
}
H.ACT.stNew = () => staffSheet();
H.CHANGE.stTeam = el => { const r = el.form.role; if (el.value === 'AGO' && !r.value) r.value = '사장님'; if (el.value === 'RES' && !el.form.id.value) el.form.pay_type.value = 'freelance33'; };  // 부동산 기본 3.3%
H.ACT.stEdit = el => staffSheet(H.S.staff.find(x=>x.id===el.dataset.s));
H.ACT.stToken = async el => { if (!confirm('새 링크를 만들면 예전 링크는 바로 막혀요. 계속할까요?')) return;
  const tok = [...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');
  await H.q(sb.from('staff').update({token: tok}).eq('id', el.dataset.s)); H.close(); H.toast('새 링크 발급 · [링크 복사]로 다시 보내주세요'); H.refresh(); };
H.FORM.staff = async v => {
  const row = {name:v.get('name').trim(), team:v.get('team'), role:H.nn(v.get('role')) || (v.get('team')==='AGO' ? '사장님' : null), phone:H.nn(v.get('phone')), partner_area:H.nn(v.get('partner_area')), pay_type:v.get('pay_type'), status:v.get('status'), joined_on:H.nn(v.get('joined_on')), can_collect:v.get('can_collect')==='on'};
  const id = v.get('id'); await H.q(id ? sb.from('staff').update(row).eq('id', id) : sb.from('staff').insert(row));
  if (id) await saveLeft(id, row.status);
  if (!id && v.get('mm') === 'on') { try { H.S.mm = await H.maemul('addStaff', [{name: row.name, role: row.role || '사원'}]); H.S.staff = await H.q(sb.from('staff').select('*').order('created_at')); await H.syncMaemulCodes(); H.toast('매물노트 파일·링크도 만들었어요'); } catch(e){ H.toast('일정판엔 추가했어요 · 매물노트는 못 만들었어요: ' + e.message); } }
  else H.toast('저장했어요');
  H.close(); H.refresh(); };
})(window.HQ);
