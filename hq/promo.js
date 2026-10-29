/* 홍보 */
(function(H){
const {esc, md, ymd, sb} = H;
const CH = [['photo','사진'],['blog','블로그'],['insta','인스타'],['dg','당근'],['reels','릴스']];
H.PROMO_CH = CH;
// 1 = 완료, -1 = 해당 없음, 0/없음 = 아직
H.promoState = j => {
  const p = Object.assign({}, j.promo||{});
  if (!(p.photo > 0) && H.photosOf(j.id).length) p.photo = 1;
  const act = CH.filter(([k]) => p[k] !== -1);
  const cnt = act.filter(([k]) => p[k] > 0).length;
  return Object.assign(p, {cnt, total: act.length, done: act.length > 0 && cnt === act.length});
};
H.promoRow = j => { const p = H.promoState(j);
  return `<div class="prm"><div class="pc"><b style="font-size:12px">홍보 ${p.cnt}/${p.total}</b>
    ${CH.map(([k,l])=>`<button type="button" class="${p[k]>0?'on':p[k]===-1?'na':''}" data-a="promoSet" data-j="${j.id}" data-k="${k}" title="누를 때마다: 완료 → 해당 없음 → 아직">${p[k]>0?'☑':'☐'} ${l}</button>`).join('')}
    <button type="button" data-a="promoAll" data-j="${j.id}">한 번에 전체 완료</button><button type="button" data-a="promoLink" data-j="${j.id}">${H.I('link').replace('class="i"','class="i" style="width:13px;height:13px"')} 링크 ${(j.promo_links||[]).length||''}</button></div></div>`; };

const findJ = id => (H.S.jobs||[]).find(j => j.id == id) || (H.S.promoJobs||[]).find(j => j.id == id);
async function savePromo(j, promo, links){
  const up = {promo}; if (links) up.promo_links = links;
  await H.q(sb.from('jobs').update(up).eq('id', j.id)); j.promo = promo; if (links) j.promo_links = links;
}
H.ACT.promoSet = async el => { const j = findJ(el.dataset.j), k = el.dataset.k; const p = Object.assign({}, j.promo||{});
  const cur = p[k] > 0 ? 1 : p[k] === -1 ? -1 : 0; p[k] = cur === 0 ? 1 : cur === 1 ? -1 : 0;
  await savePromo(j, p); H.render(); };
H.ACT.promoAll = async el => { const j = findJ(el.dataset.j); const p = Object.assign({}, j.promo||{});
  CH.forEach(([k]) => { if (p[k] !== -1) p[k] = 1; }); await savePromo(j, p); H.toast('홍보 전체 완료로 표시했어요'); H.render(); };
H.ACT.promoLink = el => { const j = findJ(el.dataset.j);
  H.open(`<form data-f="promoLink"><h3>홍보 링크 · ${esc(j.title)}</h3>
    ${(j.promo_links||[]).map((l,i)=>`<div class="rw"><span><b>${esc(l.ch)}</b> <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></span><button type="button" class="btn sm ghost" data-a="promoLinkDel" data-j="${j.id}" data-i="${i}">빼기</button></div>`).join('')}
    <div class="fg" style="margin-top:10px"><div class="field"><label>채널</label><select name="ch">${CH.filter(([k])=>k!=='photo').map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}<option value="etc">기타</option></select></div>
    <div class="field"><label>링크</label><input name="url" type="url" placeholder="https://" required></div></div>
    <p class="note">링크를 붙이면 그 채널이 자동으로 체크돼요. '홍보자료만들어줘' 결과물을 올린 뒤 주소를 붙여 주세요.</p>
    ${H.sacts('붙이기')}<input type="hidden" name="id" value="${j.id}"></form>`); };
H.FORM.promoLink = async v => { const j = findJ(v.get('id')); const ch = v.get('ch'); const name = (CH.find(c=>c[0]===ch)||[0,'기타'])[1];
  const links = [...(j.promo_links||[]), {ch:name, k:ch, url:v.get('url').trim(), at:new Date().toISOString()}];
  const p = Object.assign({}, j.promo||{}); if (ch !== 'etc') p[ch] = 1;
  await savePromo(j, p, links); H.close(); H.toast('링크를 붙였어요'); H.render(); };
H.ACT.promoLinkDel = async el => { const j = findJ(el.dataset.j); const links = (j.promo_links||[]).filter((_,i)=>i!=el.dataset.i); await savePromo(j, j.promo||{}, links); H.ACT.promoLink(el); };

H.view('promo', {label:'홍보',
  async load(){
    const T = H.today(); const from = H.addDays(T, -45), to = H.addDays(T, 1);
    await H.loadRange(from, to);
    H.S.promoJobs = H.S.jobs;
  },
  render(){
    const S = H.S, today = ymd(H.today()), ym = today.slice(0,7);
    const jobs = (S.jobs||[]).filter(j => j.job_date <= today && !['cancelled','quote'].includes(j.status)).sort((a,b)=>b.job_date.localeCompare(a.job_date));
    const month = jobs.filter(j => j.job_date.startsWith(ym));
    const st = jobs.map(j => [j, H.promoState(j)]);
    const mst = st.filter(([j]) => j.job_date.startsWith(ym));
    const done = mst.filter(([,p]) => p.done).length, nophoto = mst.filter(([,p]) => !(p.photo > 0)).length;
    const links = jobs.flatMap(j => (j.promo_links||[]).map(l => Object.assign({job:j}, l))).sort((a,b)=>(b.at||'').localeCompare(a.at||''));
    const mlinks = links.filter(l => (l.at||'').startsWith(ym));
    const byCh = n => mlinks.filter(l => l.ch === n).length;
    const todo = [];
    st.slice(0, 40).forEach(([j,p]) => {
      if (!(p.photo > 0)) todo.push(`${md(j.job_date)} ${esc(j.title)} · 사진 받기`);
      else if (!p.done) todo.push(`${md(j.job_date)} ${esc(j.title)} · ${CH.filter(([k])=>k!=='photo' && !(p[k]>0) && p[k]!==-1).map(c=>c[1]).join('·')} 올리기`);
    });
    const cell = (j,p,k) => `<span class="prog"><button class="${p[k]>0?'on':p[k]===-1?'na':''}" data-a="promoSet" data-j="${j.id}" data-k="${k}" aria-label="${k}">${p[k]>0?'✓':p[k]===-1?'-':''}</button></span>`;
    const pl = S.settings.promo_links || [];
    return `
    <div class="kp">
      <div class="k"><span>이번 달 끝난 현장</span><b>${month.length}</b></div>
      <div class="k ok"><span>홍보 완료</span><b>${done}</b></div>
      <div class="k wait"><span>진행 중</span><b>${mst.length - done - nophoto < 0 ? 0 : mst.length - done - nophoto}</b></div>
      <div class="k ${nophoto?'warn':''}"><span>사진 못 받음</span><b>${nophoto}</b></div>
      <div class="k"><span>이번 달 게시물</span><b>${mlinks.length}</b><small>블로그 ${byCh('블로그')} · 인스타 ${byCh('인스타')} · 당근 ${byCh('당근')} · 릴스 ${byCh('릴스')}</small></div>
    </div>
    <div class="gside">
      <section class="box"><div class="bh"><h3>현장별 홍보 진행</h3><span class="sub">칸을 누를 때마다 완료 → 해당 없음(-) → 아직</span></div>
        <div class="tbl"><table><thead><tr><th>현장</th>${CH.map(c=>`<th>${c[1]}</th>`).join('')}<th>링크</th><th></th></tr></thead><tbody>
        ${st.map(([j,p])=>`<tr><td><b>${md(j.job_date)} ${esc(j.title)}</b><div class="note">${esc(j.kind||'')}${H.photosOf(j.id).length?' · 사진 '+H.photosOf(j.id).length+'장':''}</div></td>${CH.map(([k])=>`<td>${cell(j,p,k)}</td>`).join('')}
          <td><button class="btn sm ghost" data-a="promoLink" data-j="${j.id}">${(j.promo_links||[]).length||'+'}</button></td>
          <td style="white-space:nowrap">${p.done?'<span class="pill p-ok">완료</span>':!(p.photo>0)?`<button class="btn sm ghost" data-a="photoAsk" data-j="${j.id}">사진 요청 문구</button>`:`<button class="btn sm ghost" data-a="promoAll" data-j="${j.id}">전체 완료</button>`}${H.photosOf(j.id).length?` <button class="btn sm ghost" data-a="photosSheet" data-j="${j.id}">사진</button>`:''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">최근 45일 끝난 현장이 없어요</td></tr>'}
        </tbody></table></div></section>
      <section class="box"><div class="bh"><h3>할 일</h3><span class="sub">자동으로 모아요</span></div>
        ${todo.slice(0,10).map(t=>`<div class="rw"><span>${t}</span></div>`).join('') || '<div class="note">밀린 홍보가 없어요 👍</div>'}
        <div class="ptitle">최근 올린 링크</div>
        ${links.slice(0,8).map(l=>`<div class="rw"><span>${esc(l.ch)} · <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.job.title)}</a></span><span class="note">${l.at?md(l.at.slice(0,10)):''}</span></div>`).join('') || '<div class="note">아직 없어요</div>'}
        <div class="acts" style="margin-top:12px"><button class="btn sm ghost" data-a="liveCfg">고객님 방 링크 설정</button></div></section>
    </div>
    <section class="box"><div class="bh"><h3>홍보 채널 바로가기</h3><button class="btn sm ghost" data-a="plEdit">링크 편집</button></div>
      <div class="links">${pl.map(l=>`<div class="lk"><b>${esc(l.name)}</b><span>${esc(l.sub||l.url)}</span><a href="${esc(l.url)}" target="_blank" rel="noopener">열기</a></div>`).join('')}</div></section>`;
  }
});
H.ACT.photoAsk = el => { const j = findJ(el.dataset.j); const crew = (j.assignments||[]).filter(a=>a.status==='approved').map(a=>H.P(a.staff_id).name);
  H.copy(`${crew.length?crew.join('·')+'님, ':''}${md(j.job_date)} ${j.title} 현장 사진(작업 전·후) 현장노트에 올려주세요 🙏 홍보에 써요!`, '사진 요청 문구 복사했어요 · 카톡에 붙여넣으세요'); };
H.ACT.plEdit = () => { const pl = H.S.settings.promo_links || [];
  H.open(`<form data-f="plEdit"><h3>홍보 채널 바로가기</h3><p class="note">한 줄에 하나: 이름 | 주소 | 설명</p>
    <textarea class="in" name="t" rows="9">${esc(pl.map(l=>[l.name,l.url,l.sub||''].join(' | ')).join('\n'))}</textarea>${H.sacts('저장')}</form>`); };
H.FORM.plEdit = async v => { const pl = String(v.get('t')).split('\n').map(x=>x.split('|').map(s=>s.trim())).filter(x=>x[0]&&x[1]).map(([name,url,sub])=>({name,url,sub:sub||''}));
  await H.q(sb.from('settings').upsert({key:'promo_links', value:pl})); H.S.settings.promo_links = pl; H.close(); H.render(); };

/* 고객님 방 링크 설정 */
H.ACT.liveCfg = () => { const c = Object.assign({auto_issue:true, close_days:7}, H.setting('live')||{});
  H.open(`<form data-f="liveCfg"><h3>고객님 방 링크 설정</h3><div class="fg">
    <div class="field full"><label>네이버 스마트플레이스 후기 주소</label><input name="review_url" value="${esc(c.review_url||'')}" placeholder="스마트플레이스 › 리뷰 › 리뷰 쓰기 링크"><div class="hint">완료 리포트·마감 화면의 [네이버 후기 남기기] 버튼이 여기로 가요</div></div>
    <div class="field"><label>문의 전화</label><input name="phone" value="${esc(c.phone||'')}"></div>
    <div class="field"><label>카톡 상담 링크</label><input name="kakao" value="${esc(c.kakao||'')}" placeholder="카카오 채널·오픈채팅 주소"></div>
    <div class="field"><label>은행</label><input name="bank" value="${esc(c.bank||'')}"></div>
    <div class="field"><label>계좌번호</label><input name="account" value="${esc(c.account||'')}"></div>
    <div class="field"><label>예금주</label><input name="holder" value="${esc(c.holder||'')}"></div>
    <div class="field"><label>기본 자동 닫기</label><select name="close_days">${[1,3,7,14,30].map(d=>`<option value="${d}" ${+c.close_days===d?'selected':''}>작업 끝 + ${d}일</option>`).join('')}</select></div>
    <div class="field full"><label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" name="auto_issue" ${c.auto_issue!==false?'checked':''} style="width:auto">현장이 확정되면 고객님 방 링크 자동 발급</label>
      <label style="display:flex;gap:6px;align-items:center;color:var(--ink)"><input type="checkbox" name="show_staff" ${c.show_staff?'checked':''} style="width:auto">고객 화면에 직원 이름 보이기</label></div>
    <div class="sec">안내 이미지 (주소를 바꾸면 그림이 바뀌어요)</div>
    <div class="field full"><label>들어올 때 (여러 장은 줄바꿈)</label><textarea class="in" name="intro" rows="2">${esc((c.intro_imgs||[]).join('\n'))}</textarea></div>
    <div class="field"><label>작업 끝 · 계좌 안내</label><input name="done_img" value="${esc(c.done_img||'')}"></div>
    <div class="field"><label>닫힐 때 · 마감 인사</label><input name="bye_img" value="${esc(c.bye_img||'')}"></div>
  </div>${H.sacts('저장')}</form>`); };
H.FORM.liveCfg = async v => { const old = H.setting('live')||{};
  const c = Object.assign({}, old, {review_url:v.get('review_url').trim(), phone:v.get('phone').trim(), kakao:v.get('kakao').trim(), bank:v.get('bank').trim(), account:v.get('account').trim(), holder:v.get('holder').trim(),
    close_days:+v.get('close_days'), auto_issue:v.get('auto_issue')==='on', show_staff:v.get('show_staff')==='on',
    intro_imgs:String(v.get('intro')).split('\n').map(s=>s.trim()).filter(Boolean), done_img:v.get('done_img').trim(), bye_img:v.get('bye_img').trim()});
  await H.q(sb.from('settings').upsert({key:'live', value:c})); H.S.settings.live = c; H.close(); H.toast('저장했어요'); };
})(window.HQ);
