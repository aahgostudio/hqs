/* 인사카드 대표 전용 금고 — 주민등록번호 · 계좌 · 주소 · 비상연락처
   대표님 비밀번호 → PBKDF2(25만 회) → AES-GCM 256 키. 화면에서 암호화해서 저장, 서버엔 암호문만.
   비밀번호를 잊으면 아무도 못 풀어요 (클로 포함). 새로고침하면 다시 잠겨요. */
(function(H){
const {esc, sb} = H;
const te = new TextEncoder(), td = new TextDecoder();
const b64 = u => btoa(String.fromCharCode(...new Uint8Array(u)));
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const F = [['rrn','주민등록번호','000000-0000000'],['bank','은행',''],['acct','계좌번호',''],['holder','예금주',''],['addr','주소',''],['emer','비상연락처','관계 · 번호']];
let KEY = null, META;

async function derive(pw, salt){
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function enc(obj){ const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, KEY, te.encode(JSON.stringify(obj)));
  return b64(iv) + '.' + b64(ct); }
async function dec(s, key){ const [iv, ct] = s.split('.').map(ub64);
  return JSON.parse(td.decode(await crypto.subtle.decrypt({name:'AES-GCM', iv}, key || KEY, ct))); }
async function meta(){ if (META === undefined) { const r = await sb.from('vault_meta').select('*').maybeSingle(); if (r.error) throw r.error; META = r.data || null; } return META; }

const mask = (k, v) => { v = String(v||''); if (!v) return '-';
  if (k === 'rrn') return v.replace(/^(\d{6})-?(\d)\d*$/, '$1-$2******');
  if (k === 'acct') return v.length > 4 ? '•••• ' + v.slice(-4) : v;
  return v; };

H.vaultBox = s => (H.S.owner && !H.S.needV7) ? `<div class="vault" id="vault" data-s="${s.id}"><div class="vh"><b>🔒 대표 전용</b><span class="note">주민등록번호 · 계좌 · 주소 — 대표님 비밀번호로 암호화돼요</span></div><div class="vb"><button type="button" class="btn sm" data-a="vOpen" data-s="${s.id}">${KEY ? '보기' : '잠금 풀기'}</button></div></div>` : '';

async function draw(sid){
  const box = document.querySelector('#vault .vb'); if (!box) return;
  const r = await sb.from('staff_private').select('enc').eq('staff_id', sid).maybeSingle(); if (r.error) throw r.error;
  const d = r.data ? await dec(r.data.enc) : {};
  box.innerHTML = `<div class="vgrid">${F.map(([k,l]) => `<div><span>${l}</span><b data-v="${k}">${esc(mask(k, d[k]))}</b>${d[k] && (k==='rrn'||k==='acct') ? `<button type="button" class="link" data-a="vCopy" data-k="${k}">복사</button>` : ''}</div>`).join('')}</div>
    <div class="vact"><button type="button" class="btn sm ghost" data-a="vShow">전체 보기</button><button type="button" class="btn sm" data-a="vEdit" data-s="${sid}">입력 · 수정</button><button type="button" class="btn sm ghost" data-a="vLock">잠그기</button></div>`;
  box._d = d;
}
H.ACT.vOpen = async el => {
  const sid = el.dataset.s, m = await meta();
  if (!KEY) {
    if (!m) {
      const p1 = prompt('처음이에요. 금고 비밀번호를 정해주세요 (8자 이상)\n\n⚠️ 잊으면 저장한 정보를 아무도 못 풀어요. 따로 꼭 적어두세요.'); if (!p1) return;
      if (p1.length < 8) return H.toast('8자 이상으로 정해주세요');
      if (prompt('한 번 더 입력해주세요') !== p1) return H.toast('비밀번호가 서로 달라요');
      const salt = crypto.getRandomValues(new Uint8Array(16)); KEY = await derive(p1, salt);
      const row = {id:1, salt: b64(salt), check_enc: await enc({ok:'earningplace'})};
      const r = await sb.from('vault_meta').insert(row); if (r.error) { KEY = null; throw r.error; } META = row; H.toast('금고를 만들었어요');
    } else {
      const pw = prompt('금고 비밀번호'); if (!pw) return;
      const k = await derive(pw, ub64(m.salt));
      try { const c = await dec(m.check_enc, k); if (c.ok !== 'earningplace') throw 0; KEY = k; } catch(_) { return H.toast('비밀번호가 맞지 않아요'); }
    }
  }
  await draw(sid);
};
H.ACT.vShow = () => { const box = document.querySelector('#vault .vb'); const d = box && box._d || {}; box.querySelectorAll('[data-v]').forEach(b => b.textContent = d[b.dataset.v] || '-'); };
H.ACT.vCopy = el => { const d = document.querySelector('#vault .vb')._d || {}; H.copy(d[el.dataset.k] || '', '복사했어요'); };
H.ACT.vLock = () => { KEY = null; const v = document.getElementById('vault'); if (v) v.outerHTML = H.vaultBox({id: v.dataset.s}); H.toast('잠갔어요'); };
H.ACT.vEdit = el => {
  const box = document.querySelector('#vault .vb'), d = box._d || {}, sid = el.dataset.s;
  box.innerHTML = `<div class="fg">${F.map(([k,l,ph]) => `<div class="field ${k==='addr'?'full':''}"><label>${l}</label><input data-vin="${k}" value="${esc(d[k]||'')}" placeholder="${ph}" autocomplete="off"></div>`).join('')}</div>
    <div class="vact"><button type="button" class="btn sm ghost" data-a="vOpen" data-s="${sid}">취소</button><button type="button" class="btn sm" data-a="vSave" data-s="${sid}">암호화해서 저장</button></div>`;
};
H.ACT.vSave = async el => {
  if (!KEY) return H.toast('잠겨 있어요');
  const o = {}; document.querySelectorAll('#vault [data-vin]').forEach(i => { const v = i.value.trim(); if (v) o[i.dataset.vin] = v; });
  if (o.rrn && !/^\d{6}-?\d{7}$/.test(o.rrn)) return H.toast('주민등록번호는 13자리 숫자예요');
  if (o.rrn) o.rrn = o.rrn.replace(/^(\d{6})-?(\d{7})$/, '$1-$2');
  const r = await sb.from('staff_private').upsert({staff_id: el.dataset.s, enc: await enc(o), updated_at: new Date().toISOString()}); if (r.error) throw r.error;
  H.toast('암호화해서 저장했어요'); await draw(el.dataset.s);
};
})(window.HQ);
