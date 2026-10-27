/* 인사카드 대표 전용 칸 — 주민등록번호 · 계좌 · 주소 · 비상연락처
   대표 계정으로만 열리고, 서버 안에서 자동 암호화해서 보관 (v8). 화면엔 기본 가림 → [전체 보기] */
(function(H){
const {esc, sb} = H;
const F = [['rrn','주민등록번호','000000-0000000'],['bank','은행',''],['acct','계좌번호',''],['holder','예금주',''],['addr','주소',''],['emer','비상연락처','관계 · 번호']];
const mask = (k, v) => { v = String(v||''); if (!v) return '-';
  if (k === 'rrn') return v.replace(/^(\d{6})-?(\d)\d*$/, '$1-$2******');
  if (k === 'acct') return v.length > 4 ? '•••• ' + v.slice(-4) : v;
  return v; };

H.vaultBox = s => {
  if (!H.S.owner) return '';
  if (H.S.needV8) return `<div class="vault"><div class="vh"><b>🔒 대표 전용</b><span class="note">주민등록번호 · 계좌 — 홈 화면 위 업데이트(SQL) 한 번 실행하면 열려요</span></div></div>`;
  setTimeout(() => draw(s.id).catch(H.fail), 0);
  return `<div class="vault" id="vault" data-s="${s.id}"><div class="vh"><b>🔒 대표 전용</b><span class="note">주민등록번호 · 계좌 · 주소 — 대표님만 보여요 · 암호화 보관</span></div><div class="vb"><div class="spin"></div></div></div>`;
};
async function draw(sid){
  const box = document.querySelector('#vault .vb'); if (!box) return;
  const {data, error} = await sb.rpc('vault_get', {p_staff: sid}); if (error) throw error;
  const d = data || {};
  box.innerHTML = `<div class="vgrid">${F.map(([k,l]) => `<div><span>${l}</span><b data-v="${k}">${esc(mask(k, d[k]))}</b>${d[k] && (k==='rrn'||k==='acct') ? `<button type="button" class="link" data-a="vCopy" data-k="${k}">복사</button>` : ''}</div>`).join('')}</div>
    <div class="vact"><button type="button" class="btn sm ghost" data-a="vShow">전체 보기</button><button type="button" class="btn sm" data-a="vEdit" data-s="${sid}">입력 · 수정</button></div>`;
  box._d = d;
}
H.ACT.vShow = () => { const box = document.querySelector('#vault .vb'); const d = box && box._d || {}; box.querySelectorAll('[data-v]').forEach(b => b.textContent = d[b.dataset.v] || '-'); };
H.ACT.vCopy = el => { const d = document.querySelector('#vault .vb')._d || {}; H.copy(d[el.dataset.k] || '', '복사했어요'); };
H.ACT.vEdit = el => {
  const box = document.querySelector('#vault .vb'), d = box._d || {}, sid = el.dataset.s;
  box.innerHTML = `<div class="fg">${F.map(([k,l,ph]) => `<div class="field ${k==='addr'?'full':''}"><label>${l}</label><input data-vin="${k}" value="${esc(d[k]||'')}" placeholder="${ph}" autocomplete="off"></div>`).join('')}</div>
    <div class="vact"><button type="button" class="btn sm ghost" data-a="vBack" data-s="${sid}">취소</button><button type="button" class="btn sm" data-a="vSave" data-s="${sid}">저장</button></div>`;
};
H.ACT.vBack = el => draw(el.dataset.s);
H.ACT.vSave = async el => {
  const o = {}; document.querySelectorAll('#vault [data-vin]').forEach(i => { const v = i.value.trim(); if (v) o[i.dataset.vin] = v; });
  if (o.rrn && !/^\d{6}-?\d{7}$/.test(o.rrn)) return H.toast('주민등록번호는 13자리 숫자예요');
  if (o.rrn) o.rrn = o.rrn.replace(/^(\d{6})-?(\d{7})$/, '$1-$2');
  const {error} = await sb.rpc('vault_set', {p_staff: el.dataset.s, p_data: o}); if (error) throw error;
  H.toast('저장했어요 · 암호화 보관'); await draw(el.dataset.s);
};
})(window.HQ);
