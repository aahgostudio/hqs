/* 🏷 셀렉트 — 아고셀렉트 사입 → 등록 → 판매 → 정산 (v47, 대표님 전용)
   사진은 한 번에 올리고, 정면·측면·라벨 구분은 클로가 나중에 함 */
(function(H){
const {esc, sb, won} = H;
const ST = ['접수','등록초안','판매중','품절','판매중지'];
const STEP = ['사입','사진','등록초안','판매중'];
const CHN = [['store','스토어'],['insta','인스타'],['dg','당근'],['threads','스레드']];
const CHS = ['대기','초안','게시'];
const PROOF = ['세금계산서','현금영수증','카드','없음'];
const KC = ['확인완료','해당없음','표시없음'];

const cfg = () => Object.assign({fee:0.06, ship:3500, pack:500}, H.S.selCfg || {});
const num = v => +v || 0;
// 장부(구글시트)와 같은 계산
H.selCalc = it => { const c = cfg(), sold = num(it.sold), price = num(it.price);
  const rev = price * sold, fee = Math.round(rev * c.fee), ship = sold * (num(c.ship) + num(c.pack)), cost = num(it.unit_cost) * sold;
  const unit = price ? Math.round(price * (1 - c.fee) - num(c.ship) - num(c.pack) - num(it.unit_cost)) : null;
  return {buy: num(it.qty) * num(it.unit_cost), stock: num(it.qty) - sold, rev, fee, ship, cost, net: rev - fee - ship - cost, unit, rate: price && unit != null ? unit / price : null}; };
const pct = r => r == null ? '-' : (r * 100).toFixed(1) + '%';
const stCls = s => s === '판매중' ? 'sl-on' : s === '등록초안' ? 'sl-draft' : s === '접수' ? 'sl-new' : 'sl-off';
const IT = id => (H.S.selItems||[]).find(x => x.id == id);
const purl = p => `${H.C.SUPABASE_URL}/storage/v1/object/public/select/${p.path}`;
const thumb = it => { const p = (it.photos||[])[0];
  return p ? `<span class="sl-th"><img src="${esc(purl(p))}" alt="" loading="lazy"></span>` : `<span class="sl-th sl-th0"><svg class="i"><use href="#i-cam"/></svg></span>`; };

H.view('select', {label:'셀렉트', owner:true,
  async load(){
    if (H.S.schemaV < 47) return;
    const [items, c] = await Promise.all([
      H.q(sb.from('select_items').select('*').order('created_at', {ascending:false})),
      H.q(sb.from('settings').select('value').eq('key','select_cfg'))
    ]);
    H.S.selItems = items; H.S.selCfg = (c && c[0] && c[0].value) || null;
  },
  render(){
    if (H.S.schemaV < 47) return `<section class="box"><div class="bh"><h3>셀렉트 시작하기 (서버 업데이트 한 번)</h3></div>
      <p class="note" style="line-height:1.7">1. [SQL 복사] → 2. Supabase SQL Editor에 붙여넣고 Run → 3. '업데이트 완료 (v47)'가 보이면 새로고침</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-a="selSql">SQL 복사</button><a class="btn ghost" href="https://supabase.com/dashboard/project/ldvknvmsnpbporxhnsli/sql/new" target="_blank" rel="noopener">SQL Editor 열기</a></div></section>`;
    const all = H.S.selItems || [], f = H.S.selF || '전체';
    const sum = all.reduce((a, it) => { const c = H.selCalc(it); a.rev += c.rev; a.buy += c.buy; a.fs += c.fee + c.ship; a.net += c.net; a.stockAmt += Math.max(0, c.stock) * num(it.unit_cost); return a; }, {rev:0, buy:0, fs:0, net:0, stockAmt:0});
    const cnt = s => all.filter(x => x.status === s).length;
    const kcN = all.filter(x => x.kc === '표시없음').length, noPh = all.filter(x => !(x.photos||[]).length).length;
    const list = f === '전체' ? all : all.filter(x => x.status === f);
    return `<div class="sl">
      <section class="sl-hero">
        <div class="sl-hr"><span>순이익 (지금까지)</span><b class="sl-badge">순이익률 ${pct(sum.rev ? sum.net / sum.rev : null)}</b></div>
        <div class="sl-big">${won(sum.net)}원</div>
        <div class="sl-g3"><div><small>매출</small><b>${won(sum.rev)}</b></div><div><small>사입액</small><b>${won(sum.buy)}</b></div><div><small>수수료·배송</small><b>${won(sum.fs)}</b></div></div>
        <small class="sl-foot">남은 재고 금액 ${won(sum.stockAmt)}원 (사입가 기준) · 운영 참고용, 신고 숫자는 세무사 기준</small>
      </section>
      <div class="sl-alerts">
        <button class="sl-al ${kcN ? 'warn' : ''}" data-a="selFilterKc"><small>KC·표시 확인</small><b>${kcN}건</b></button>
        <button class="sl-al" data-a="selFilter" data-f="접수"><small>접수 (클로 작업 대기)</small><b>${cnt('접수')}건</b></button>
        <button class="sl-al" data-a="selFilter" data-f="판매중"><small>판매중</small><b>${cnt('판매중')}건</b></button>
      </div>
      <div class="sl-pills">${['전체', ...ST].map(s => `<button class="${f === s ? 'on' : ''}" data-a="selFilter" data-f="${s}">${s} ${s === '전체' ? all.length : cnt(s)}</button>`).join('')}</div>
      <div class="sl-list">${list.map(it => { const c = H.selCalc(it);
        return `<button class="sl-it" data-a="selOpen" data-id="${it.id}">${thumb(it)}<span class="sl-tx">
          <span class="sl-t1"><b>${esc(it.name)}</b><span class="sl-st ${stCls(it.status)}">${esc(it.status)}</span></span>
          <small>재고 ${c.stock} / ${num(it.qty)} · ${it.price ? '판매가 ' + won(it.price) : it.want_price ? '희망가 ' + won(it.want_price) : '가격 미정'}${it.kc === '표시없음' ? ' · <b style="color:var(--warn)">KC 확인</b>' : ''}</small>
          <small class="sl-m">${it.price ? `개당 마진 ${won(c.unit)} (${pct(c.rate)})` : it.status === '접수' ? `사진 ${(it.photos||[]).length}장 · 상품 초안 대기` : '판매가 확정 대기'}</small>
        </span></button>`; }).join('') || `<p class="empty">${f === '전체' ? '아직 사입한 상품이 없어요 · 아래 [사입 등록]으로 시작해요' : f + ' 상품이 없어요'}</p>`}</div>
      <div class="sl-acts"><button class="btn sm ghost" data-a="selCfg">수수료·배송비 설정</button><a class="btn sm ghost" href="https://docs.google.com/spreadsheets/d/1J-w_dR6JT0i8XQuvA6qWGMhoLIjMFby3liA4aqIA60k/edit" target="_blank" rel="noopener">사입 장부(시트)</a></div>
      <button class="sl-fab" data-a="selNew"><svg class="i"><use href="#i-plus"/></svg>사입 등록</button>
    </div>`;
  }
});

H.ACT.selSql = async () => { const t = await (await fetch('update_v47.sql', {cache:'no-store'})).text(); H.copy(t, 'SQL을 복사했어요 · SQL Editor에 붙여넣고 Run'); };
H.ACT.selFilter = el => { H.S.selF = el.dataset.f; H.render(); };
H.ACT.selFilterKc = () => { const n = (H.S.selItems||[]).filter(x => x.kc === '표시없음'); if (!n.length) return H.toast('KC 확인할 상품이 없어요');
  H.ACT.selOpen({dataset:{id: n[0].id}}); };

/* ---------- 사입 등록 · 수정 ---------- */
const form = (it, isNew) => `<form data-f="selSave"><h3>${isNew ? '사입 등록' : '수정 · ' + esc(it.code || '')}</h3>
  <input type="hidden" name="id" value="${it.id || ''}">
  <div class="fg">
    <div class="field full"><label>사진 (한 번에 여러 장)</label><input type="file" name="files" accept="image/*" multiple>
      <div class="hint">정면·측면·뒷면·손에 든 컷·라벨(KC)·바코드를 한꺼번에 올려 주세요. 구분은 클로가 해요.${(it.photos||[]).length ? ` 지금 ${(it.photos||[]).length}장 · 새로 고르면 뒤에 붙어요.` : ''}</div></div>
    <div class="field full"><label>상품 메모</label><input name="name" value="${esc(it.name || '')}" placeholder="예) 스텐 밀폐용기 3종 세트" required></div>
    <div class="field"><label>수량</label><input name="qty" inputmode="numeric" value="${it.qty ?? ''}" data-c="selPrev" required></div>
    <div class="field"><label>개당 사입가</label><input name="unit_cost" inputmode="numeric" value="${it.unit_cost ?? ''}" data-c="selPrev" required></div>
    <div class="field"><label>희망 판매가</label><input name="want_price" inputmode="numeric" value="${it.want_price ?? ''}" data-c="selPrev"></div>
    <div class="field"><label>사입처 (내부용)</label><input name="source" value="${esc(it.source || '')}" placeholder="매장·지역"></div>
    <div class="field full"><label>증빙</label><div class="chips">${PROOF.map(p => `<label><input type="radio" name="proof" value="${p}" ${it.proof === p ? 'checked' : ''}><span>${p}</span></label>`).join('')}</div></div>
    ${isNew ? '' : `<div class="field"><label>확정 판매가 (대표님)</label><input name="price" inputmode="numeric" value="${it.price ?? ''}" data-c="selPrev"></div>
    <div class="field"><label>최저가 (비교)</label><input name="low_price" inputmode="numeric" value="${it.low_price ?? ''}"></div>
    <div class="field"><label>카테고리</label><input name="category" value="${esc(it.category || '')}"></div>
    <div class="field"><label>상태</label><select name="status">${ST.map(s => `<option ${it.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label>스토어 상품번호</label><input name="store_no" value="${esc(it.store_no || '')}"></div>`}
    <div class="field"><label>KC·표시</label><select name="kc"><option value="">아직 모름</option>${KC.map(k => `<option ${it.kc === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
    <div class="field ${isNew ? '' : 'full'}"><label>메모</label><input name="memo" value="${esc(it.memo || '')}"></div>
  </div>
  <div class="sl-warn">⚠️ 전기용품·유아용품·세정제는 라벨에 KC나 신고번호가 있는지 꼭 찍어 주세요.</div>
  <div class="sl-prev" id="selPrev">${prevHtml(it)}</div>
  ${H.sacts(isNew ? '등록하기' : '저장')}</form>`;
function prevHtml(it){ const p = num(it.price) || num(it.want_price); if (!p) return '<span>판매가를 넣으면 예상 개당 마진이 보여요</span>';
  const c = H.selCalc(Object.assign({}, it, {price: p, sold: 0})); return `<span>예상 개당 마진</span><b>${won(c.unit)}원</b><em>${pct(c.rate)}</em>`; }
H.CHANGE.selPrev = el => { const f = el.form; const g = n => f[n] ? H.nnum(f[n].value) : null;
  document.getElementById('selPrev').innerHTML = prevHtml({unit_cost: g('unit_cost'), want_price: g('want_price'), price: g('price')}); };
H.ACT.selNew = () => H.open(form({}, true), true);
H.ACT.selEdit = el => { const it = IT(el.dataset.id); if (it) H.open(form(it, false), true); };

const shrink = async file => { try { const bmp = await createImageBitmap(file, {imageOrientation:'from-image'}); const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width*s); c.height = Math.round(bmp.height*s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)); } catch(_) { return file; } };
async function nextCode(){ const ym = H.ymd(H.today()).slice(2,7).replace('-',''), pre = `AS-${ym}-`;
  const n = (H.S.selItems||[]).filter(x => (x.code||'').startsWith(pre)).length; return pre + String(n + 1).padStart(3, '0'); }

H.FORM.selSave = async v => {
  const id = H.nnum(v.get('id')), old = id ? IT(id) : {};
  let photos = [...(old.photos || [])];
  const files = v.getAll('files').filter(f => f && f.size);
  if (files.length) { H.toast(`사진 ${files.length}장 올리는 중…`);
    for (let i = 0; i < files.length; i++) { const b = await shrink(files[i]); const path = `${H.ymd(H.today()).slice(0,7)}/${Date.now()}_${i}.jpg`;
      const r = await sb.storage.from('select').upload(path, b, {contentType: 'image/jpeg', cacheControl: '31536000'});
      if (r.error) return H.toast('사진 올리기 실패 · ' + r.error.message);
      photos.push({path, kind: null}); } }
  const row = {name: String(v.get('name')).trim(), qty: H.nnum(v.get('qty')) || 0, unit_cost: H.nnum(v.get('unit_cost')) || 0,
    want_price: H.nnum(v.get('want_price')), source: H.nn((v.get('source')||'').trim()), proof: H.nn(v.get('proof')), kc: H.nn(v.get('kc')),
    memo: H.nn((v.get('memo')||'').trim()), photos, updated_at: new Date().toISOString()};
  if (id) Object.assign(row, {price: H.nnum(v.get('price')), low_price: H.nnum(v.get('low_price')), category: H.nn((v.get('category')||'').trim()),
    status: v.get('status') || old.status, store_no: H.nn((v.get('store_no')||'').trim())});
  else row.code = await nextCode();
  await H.q(id ? sb.from('select_items').update(row).eq('id', id) : sb.from('select_items').insert(row));
  H.close(); H.toast(id ? '저장했어요' : `등록했어요 · ${row.code} · 사진 ${photos.length}장`); H._dirty = Date.now(); H.render(); };

/* ---------- 상품 상세 ---------- */
H.ACT.selOpen = el => { const it = IT(el.dataset.id); if (!it) return; const c = H.selCalc(it), cf = cfg();
  const si = it.status === '판매중' || it.status === '품절' ? 3 : it.status === '등록초안' ? 2 : (it.photos||[]).length ? 1 : 0;
  const ch = it.channels || {};
  const row = (a, b, strong) => `<div class="sl-r${strong ? ' sl-rs' : ''}"><span>${a}</span><span>${b}</span></div>`;
  H.open(`<div class="sl-det">
    <h3 style="margin-bottom:2px">${esc(it.name)}</h3><p class="note" style="margin:0 0 12px">${esc(it.code || '')} · 사입 ${H.md(it.bought_on)}${it.source ? ' · ' + esc(it.source) : ''}</p>
    ${(it.photos||[]).length ? `<div class="sl-phs">${it.photos.map(p => `<a href="${esc(purl(p))}" target="_blank" rel="noopener"><img src="${esc(purl(p))}" alt="" loading="lazy">${p.kind ? `<small>${esc(p.kind)}</small>` : ''}</a>`).join('')}</div>` : '<p class="note">아직 사진이 없어요</p>'}
    <div class="sl-tags">${it.proof ? `<span>증빙 ${esc(it.proof)}</span>` : '<span class="w">증빙 미입력</span>'}<span class="${it.kc === '표시없음' ? 'w' : ''}">KC ${esc(it.kc || '아직 모름')}</span>${it.category ? `<span>${esc(it.category)}</span>` : ''}</div>
    <div class="sl-step">${STEP.map((s, i) => `<div class="${i < si ? 'done' : i === si ? 'cur' : ''}"><i>${i + 1}</i><small>${s}</small></div>`).join('')}</div>
    <div class="sl-card"><b>정산</b>
      ${row(`사입 ${num(it.qty)}개 × ${won(it.unit_cost)}`, won(c.buy))}
      ${row(`판매 ${num(it.sold)} · 재고 ${c.stock}`, '매출 ' + won(c.rev))}
      ${row(`네이버 수수료 (${(cf.fee * 100).toFixed(1)}%)`, '−' + won(c.fee))}
      ${row(`배송·포장 (${won(num(cf.ship) + num(cf.pack))} × ${num(it.sold)})`, '−' + won(c.ship))}
      ${row('팔린 만큼 원가', '−' + won(c.cost))}
      ${row('<b>순이익</b>', `<b class="sl-net">${won(c.net)}원</b>`, true)}</div>
    <div class="sl-card"><b>판매가 근거</b>
      <div class="sl-g3 dark"><div><small>희망가</small><b>${won(it.want_price)}</b></div><div><small>최저가</small><b>${won(it.low_price)}</b></div><div><small>확정가</small><b class="sl-net">${won(it.price)}</b></div></div>
      <small class="note">${it.price ? `개당 마진 ${won(c.unit)}원 · 마진율 ${pct(c.rate)}` : '확정가는 대표님이 [수정]에서 넣어요'}</small></div>
    <div class="sl-card"><b>채널 <small class="note" style="font-weight:400">누를 때마다 대기 → 초안 → 게시</small></b>
      <div class="sl-chs">${CHN.map(([k, l]) => `<button type="button" class="c${ch[k] || 0}" data-a="selCh" data-id="${it.id}" data-k="${k}"><small>${l}</small><b>${CHS[ch[k] || 0]}</b></button>`).join('')}</div></div>
    ${it.memo ? `<p class="note">메모 · ${esc(it.memo)}</p>` : ''}
    <div class="sacts"><button type="button" class="btn danger sm" data-a="selDel" data-id="${it.id}">지우기</button><button type="button" class="btn ghost" data-a="selSold" data-id="${it.id}" data-d="-1">판매 −1</button><button type="button" class="btn ghost" data-a="selSold" data-id="${it.id}" data-d="1">판매 +1</button><button type="button" class="btn" data-a="selEdit" data-id="${it.id}">수정</button></div>
  </div>`, true); };
H.ACT.selCh = async el => { const it = IT(el.dataset.id), k = el.dataset.k; const ch = Object.assign({}, it.channels || {}); ch[k] = ((ch[k] || 0) + 1) % 3;
  await H.q(sb.from('select_items').update({channels: ch, updated_at: new Date().toISOString()}).eq('id', it.id)); it.channels = ch; H.ACT.selOpen(el); };
H.ACT.selSold = async el => { const it = IT(el.dataset.id), d = +el.dataset.d; const sold = Math.max(0, Math.min(num(it.qty), num(it.sold) + d));
  if (sold === num(it.sold)) return H.toast(d > 0 ? '재고가 없어요' : '판매 수량이 0이에요');
  const up = {sold, updated_at: new Date().toISOString()}; if (sold >= num(it.qty) && it.status === '판매중') up.status = '품절';
  await H.q(sb.from('select_items').update(up).eq('id', it.id)); Object.assign(it, up); H.ACT.selOpen(el); H._dirty = Date.now(); H.render(); };
H.ACT.selDel = async el => { const it = IT(el.dataset.id); if (!confirm(`'${it.name}'을(를) 지울까요? 사진도 같이 지워져요.`)) return;
  const ps = (it.photos||[]).map(p => p.path); if (ps.length) await sb.storage.from('select').remove(ps);
  await H.q(sb.from('select_items').delete().eq('id', it.id)); H.close(); H.toast('지웠어요'); H._dirty = Date.now(); H.render(); };

/* ---------- 설정 ---------- */
H.ACT.selCfg = () => { const c = cfg();
  H.open(`<form data-f="selCfg"><h3>수수료·배송비 설정</h3><p class="note" style="margin:-6px 0 10px">지금 값은 가정값이에요. 스마트스토어 정산 내역을 보고 실제 숫자로 바꿔 주세요.</p>
    <div class="fg"><div class="field"><label>네이버 수수료 (%)</label><input name="fee" inputmode="decimal" value="${(c.fee * 100).toFixed(2).replace(/\.?0+$/,'')}"></div>
    <div class="field"><label>개당 택배비</label><input name="ship" inputmode="numeric" value="${c.ship}"><div class="hint">고객이 배송비를 내면 0</div></div>
    <div class="field"><label>개당 포장비</label><input name="pack" inputmode="numeric" value="${c.pack}"></div></div>${H.sacts('저장')}</form>`); };
H.FORM.selCfg = async v => { const c = {fee: (H.nnum(v.get('fee')) || 0) / 100, ship: H.nnum(v.get('ship')) || 0, pack: H.nnum(v.get('pack')) || 0};
  await H.q(sb.from('settings').upsert({key:'select_cfg', value:c})); H.S.selCfg = c; H.close(); H.toast('저장했어요 · 마진이 다시 계산돼요'); H.render(); };
})(window.HQ);
/* 폰 ＋ 메뉴에서 바로 사입 등록 */
window.HQ.ACT.selQuick = () => { const H = window.HQ; if (H.S.schemaV < 47) { H.close(); return H.go('select'); }
  const go = () => H.ACT.selNew(); if (H.cur() === 'select') return go(); H.go('select'); setTimeout(go, 600); };
