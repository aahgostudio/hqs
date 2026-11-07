/* 1108: 사진 미리보기는 작은 사진으로 (Supabase 이미지 변환) — 누르면 원본 그대로
   loading="lazy"인 목록 사진만 바꿈 · 실패하면 원본으로 되돌림 · 크게 보기 화면은 안 건드림 */
(function(){
  const RX = /\/storage\/v1\/object\/public\/(live|chat)\//, NOT = /\.(mov|mp4|m4v|webm|3gp|pdf|heic|heif)(\?|$)/i;
  function fix(img){
    if (img.dataset.th || img.getAttribute('loading') !== 'lazy') return;
    const s = img.getAttribute('src') || ''; if (!RX.test(s) || NOT.test(s)) return;
    img.dataset.th = '1';
    img.addEventListener('error', () => { if (img.src !== s) img.src = s; }, {once: true});
    img.src = s.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + (s.includes('?') ? '&' : '?') + 'width=480&height=480&resize=cover&quality=70';
  }
  const scan = n => { if (n.tagName === 'IMG') fix(n); if (n.querySelectorAll) n.querySelectorAll('img[loading="lazy"]').forEach(fix); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && scan(n)))).observe(document.documentElement, {childList: true, subtree: true});
})();
