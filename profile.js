/* 어닝플레이스 · 직원 프로필 사진 (공용)
   - 사진이 있으면 사진, 없으면 이름 두 글자(조원경 → 원경)로 동그라미
   - 본인 동그라미를 누르면 사진 올리기·바꾸기·지우기
   사용: EPProfile.init({token, demo, onChange}) → EPProfile.av('조원경', 34, {me:true}) */
(function(){
  const C = window.EP_CONFIG || {};
  const URL_ = C.SUPABASE_URL || 'https://ldvknvmsnpbporxhnsli.supabase.co';
  const KEY_ = C.SUPABASE_KEY || 'sb_publishable_7MeTgyPzwzK47RKG-mUapQ_K5ngrTw5';
  const H = {apikey: KEY_, Authorization: 'Bearer ' + KEY_};
  let opt = {token:'', demo:false, onChange:()=>{}}, me = null, map = {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pub = p => p ? `${URL_}/storage/v1/object/public/avatars/${p}` : '';
  // 이름 두 글자: 3글자 이상이면 성 빼고(조원경 → 원경), 2글자면 그대로
  const two = n => { n = String(n || '?').trim(); return n.length >= 3 ? n.slice(1, 3) : n; };

  async function rpc(fn, args){
    const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {method:'POST', headers:Object.assign({'content-type':'application/json'}, H), body:JSON.stringify(args)});
    if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return r.json();
  }
  async function load(){
    if (opt.demo || !opt.token) return;
    try { const d = await rpc('staff_avatars', {p_token: opt.token}); me = d.me; map = {};
      (d.team || []).forEach(t => map[t.name] = t.avatar); if (me) map[me.name] = me.avatar; opt.onChange(); } catch(_){}
  }

  function av(name, size, o){
    o = o || {}; size = size || 34; const p = map[name];
    const st = `width:${size}px;height:${size}px;font-size:${Math.round(size*.36)}px`;
    const inner = p ? `<img src="${esc(pub(p))}" alt="" loading="lazy">` : esc(two(name));
    const tag = o.me ? 'button' : 'span';
    return `<${tag} ${o.me?'type="button" data-epprof="1" title="내 프로필 사진 바꾸기"':''} class="ep-av ${p?'has':''} ${o.cls||''}" style="${st}">${inner}${o.me?'<i class="ep-cam">📷</i>':''}</${tag}>`;
  }

  function sheet(){
    const name = (me && me.name) || (opt.nameFn && opt.nameFn()) || '';
    const w = document.createElement('div'); w.className = 'epst-back';
    w.innerHTML = `<div class="epst-sheet" role="dialog" aria-label="내 프로필 사진">
      <div class="epst-grab"></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin:4px 0 14px">${av(name, 96, {cls:'big'})}<b style="font-size:17px">${esc(name)}</b>
      <p class="epst-hint" style="text-align:center;margin:0">사진을 올리면 대표님 화면과 동료 화면에<br>이 사진으로 보여요.</p></div>
      <label class="epst-btn pri" style="cursor:pointer">📷 사진 고르기<small>얼굴이 잘 보이는 사진</small><input type="file" accept="image/*" hidden id="ep-file"></label>
      ${map[name] ? '<button type="button" class="epst-btn" id="ep-del" style="width:100%;margin-top:8px;font:inherit;font-weight:700">🗑 사진 지우기 (이름으로 표시)</button>' : ''}
      <p class="epst-foot" id="ep-msg" style="margin-top:10px"></p>
      <button type="button" class="epst-close" data-epst-close="1">닫기</button></div>`;
    document.body.appendChild(w); requestAnimationFrame(() => w.classList.add('on'));
    const close = () => { w.classList.remove('on'); setTimeout(() => w.remove(), 200); };
    w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-epst-close]')) close(); });
    const msg = t => { const m = w.querySelector('#ep-msg'); if (m) m.textContent = t; };
    w.querySelector('#ep-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (opt.demo) { msg('미리보기에서는 저장되지 않아요'); return; }
      try { msg('올리는 중…');
        const blob = await square(f, 320);
        const key = await rpc('staff_avatar_slot', {p_token: opt.token});
        const path = `${key}/${Date.now()}.jpg`;
        const r = await fetch(`${URL_}/storage/v1/object/avatars/${path}`, {method:'POST', headers:Object.assign({'content-type':'image/jpeg','x-upsert':'true'}, H), body: blob});
        if (!r.ok) throw new Error('upload');
        await rpc('staff_set_avatar', {p_token: opt.token, p_path: path});
        map[name] = path; opt.onChange(); close();
      } catch(_){ msg('올리지 못했어요. 잠시 뒤 다시 해주세요.'); }
    };
    const del = w.querySelector('#ep-del');
    if (del) del.onclick = async () => { if (opt.demo) return msg('미리보기에서는 저장되지 않아요');
      try { await rpc('staff_set_avatar', {p_token: opt.token, p_path: null}); delete map[name]; opt.onChange(); close(); } catch(_){ msg('지우지 못했어요'); } };
  }
  // 가운데를 잘라 정사각형 JPEG로 줄이기
  function square(file, size){
    return new Promise((ok, no) => { const img = new Image(); img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      c.toBlob(b => b ? ok(b) : no(), 'image/jpeg', .86); URL.revokeObjectURL(img.src); };
      img.onerror = no; img.src = URL.createObjectURL(file); });
  }

  document.addEventListener('click', e => { if (e.target.closest('[data-epprof]')) { e.preventDefault(); e.stopPropagation(); sheet(); } }, true);
  const css = `
.ep-av{border-radius:50%;display:inline-grid;place-items:center;flex-shrink:0;font-weight:700;letter-spacing:-.04em;background:var(--accent-soft,var(--infob,#EAF0FF));color:var(--accent,var(--navy,#16347A));position:relative;border:0;padding:0;overflow:visible;font-family:inherit;line-height:1}
.ep-av img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
button.ep-av{cursor:pointer}.ep-cam{position:absolute;right:-3px;bottom:-3px;font-style:normal;font-size:10px;width:17px;height:17px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 0 0 1px rgba(0,0,0,.12)}
.ep-av.big{font-size:30px!important}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.EPProfile = { init(o){ opt = Object.assign(opt, o || {}); load(); }, av, two, open: sheet, reload: load, set(name, path){ map[name] = path; } };
})();
