/* 어닝플레이스 · 대화 공용 부품 (대표 HQ · 직원 화면 같이 씀)
   - 카카오워크식 입력줄: 넓은 입력칸 + 아래 [＋][사진][@][이모지] ……… [↑]
   - @멘션: @ 치면 방 인원 목록 → 고르면 @이름 (말풍선에서 파란 글씨)
   - 날짜 선 · '여기까지 읽으셨습니다' 표시 */
(function(){
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SV = p => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const IC = {
    plus: SV('<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v9M7.5 12h9"/>'),
    img: SV('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="15.5" cy="9.5" r="1.6"/><path d="M3.8 16.5l5-4.5 4.2 3.6 2.4-2 4.8 4"/>'),
    at: SV('<circle cx="12" cy="12" r="3.6"/><path d="M15.6 12v1.4a2.6 2.6 0 0 0 5.2 0V12a8.8 8.8 0 1 0-3.5 7"/>'),
    emo: SV('<circle cx="12" cy="12" r="9.5"/><path d="M8.3 14.2c.9 1.4 2.2 2.1 3.7 2.1s2.8-.7 3.7-2.1"/><circle cx="9" cy="9.8" r=".9" fill="currentColor"/><circle cx="15" cy="9.8" r=".9" fill="currentColor"/>'),
    up: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
  };
  const EMO = ['😊','😂','🥹','😍','🙏','👍','👏','🙌','💪','🔥','✨','🎉','❤️','💙','💚','😅','😭','😮','🤔','😎','🫡','👌','✅','❗','⏰','📷','🧹','🏠','🚚','☕','🍙','🌸'];

  function css(){
    if (document.getElementById('kit-css')) return;
    const s = document.createElement('style'); s.id = 'kit-css';
    s.textContent = `
.kit-bar{position:relative;flex:none;background:var(--kit-card,#fff);border-top:1px solid var(--kit-line,#E3E7F0);padding:6px 10px calc(6px + env(safe-area-inset-bottom));color:var(--kit-ink,#141A2A)}
.kit-bar textarea{display:block;width:100%;box-sizing:border-box;border:0;outline:none;background:transparent;color:inherit;resize:none;font:inherit;font-size:16px;line-height:1.4;padding:10px 6px 6px;min-height:44px;max-height:120px}
.kit-bar textarea::placeholder{color:var(--kit-mute,#8A92A3)}
.kit-tools{display:flex;align-items:center;gap:4px}
.kit-tools button{border:0;background:none;color:var(--kit-mute,#6B7385);width:42px;height:42px;border-radius:50%;display:grid;place-items:center;cursor:pointer;padding:0;flex:none;font:inherit}
.kit-tools button.on{color:var(--kit-acc,#2F6FEB)}
.kit-tools .kit-x{font-size:20px}
.kit-tools .kit-send{margin-left:auto;width:44px;height:44px;background:#D3D8E0;color:#fff;transition:background .15s}
.kit-tools .kit-send.on{background:var(--kit-acc,#2F6FEB);color:#fff}
.kit-pop{position:absolute;left:0;right:0;bottom:100%;background:var(--kit-card,#fff);border-top:1px solid var(--kit-line,#E3E7F0);box-shadow:0 -6px 18px rgba(15,23,42,.08);max-height:min(42vh,320px);overflow:auto;z-index:5}
.kit-pop .it{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;color:inherit;font:inherit;text-align:left;padding:9px 16px;cursor:pointer}
.kit-pop .it+.it{border-top:1px solid var(--kit-line,#EEF1F6)}
.kit-pop .it:active,.kit-pop .it:hover{background:var(--kit-soft,#F4F6FA)}
.kit-pop .av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none;background:#A9CDE0;color:#fff;font-size:13px;font-weight:800;overflow:hidden}
.kit-pop .av.all{background:#4CC0B9;font-size:22px;font-weight:600}
.kit-pop .it b{font-size:15.5px}.kit-pop .it small{display:block;color:var(--kit-mute,#8A92A3);font-size:12.5px;margin-top:1px}
.kit-pop .it.all small{display:inline;margin-left:6px}
.kit-emo{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px}
.kit-emo button{border:0;background:none;font-size:25px;padding:7px 0;border-radius:10px;cursor:pointer}
.kit-emo button:active{background:var(--kit-soft,#F4F6FA)}
.kit-day{align-self:stretch;display:flex;align-items:center;gap:10px;margin:14px 0 8px;font-size:12.5px;color:var(--kit-ink,#141A2A)}
.kit-day::before,.kit-day::after{content:'';flex:1;height:1px;background:var(--kit-mute,#8A92A3);opacity:.35}
.kit-day span{background:var(--kit-card,#fff);border:1px solid var(--kit-line,#E3E7F0);border-radius:20px;padding:5px 14px;font-weight:500}
.kit-read{align-self:center;display:flex;align-items:center;gap:7px;background:rgba(84,90,104,.82);color:#fff;font-size:12.5px;border-radius:20px;padding:7px 16px;margin:12px 0}
.kit-mn{color:var(--kit-acc,#2F6FEB);font-weight:700}
.kit-mn.me{background:color-mix(in srgb,var(--kit-acc,#2F6FEB) 14%,transparent);border-radius:4px;padding:0 2px}
.kit-view{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.92);display:flex;flex-direction:column;color:#fff}
.kit-view .vh{display:flex;justify-content:space-between;align-items:center;padding:calc(10px + env(safe-area-inset-top)) 12px 10px}
.kit-view .vh button{border:0;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:15px;font-weight:700;border-radius:20px;padding:9px 16px;cursor:pointer}
.kit-view .vb{flex:1;min-height:0;display:grid;place-items:center;padding:8px}
.kit-view img{max-width:100%;max-height:100%;object-fit:contain;-webkit-touch-callout:default}
.kit-view p{margin:0;text-align:center;font-size:12.5px;opacity:.7;padding:8px 16px calc(14px + env(safe-area-inset-bottom))}
.mine .kit-mn{color:inherit;text-decoration:underline;text-underline-offset:2px}`;
    document.head.appendChild(s);
  }

  // 입력줄 HTML — extra: ＋ 앞에 붙일 버튼(대표 💸 등)
  function bar(o){
    css();
    return `<div class="kit-bar ${o.cls || ''}"><textarea id="${o.id}" rows="1" placeholder="${esc(o.ph || '메시지를 입력해보세요.')}" enterkeyhint="enter"></textarea>
      <div class="kit-tools">${o.extra || ''}<button type="button" data-kit="media" aria-label="사진·동영상 찍기·고르기">${IC.plus}</button><button type="button" data-kit="album" aria-label="앨범에서 고르기">${IC.img}</button><button type="button" data-kit="at" aria-label="멘션">${IC.at}</button><button type="button" data-kit="emoji" aria-label="이모지">${IC.emo}</button><button type="button" class="kit-send" data-kit="send" aria-label="보내기">${IC.up}</button></div></div>`;
  }

  const fine = () => matchMedia('(pointer:fine)').matches;
  function sync(t){
    if (!t) return; const b = t.closest('.kit-bar'); if (!b) return;
    t.style.height = 'auto'; t.style.height = Math.min(120, t.scrollHeight) + 'px';
    const s = b.querySelector('.kit-send'); if (s) s.classList.toggle('on', !!t.value.trim());
  }
  function insert(t, text){
    const s = t.selectionStart ?? t.value.length, e = t.selectionEnd ?? s;
    t.setRangeText(text, s, e, 'end'); t.dispatchEvent(new Event('input', {bubbles: true}));
  }

  // 입력줄 동작 붙이기 — o: {members:()=>[{name,sub,av}], allowAll, onSend, onMedia(kind)}
  function attach(barEl, o){
    if (!barEl || barEl._kit) return; barEl._kit = o;
    const t = barEl.querySelector('textarea');
    let pop = null, mode = '';   // 'at' | 'emoji'
    const close = () => { if (pop) pop.remove(); pop = null; mode = ''; barEl.querySelectorAll('.kit-tools .on:not(.kit-send)').forEach(x => x.classList.remove('on')); };
    const query = () => { const pre = t.value.slice(0, t.selectionStart ?? t.value.length); const m = pre.match(/(^|\s)@([^\s@]*)$/); return m ? m[2] : null; };
    const showAt = () => {
      const q = query(); if (q === null) { if (mode === 'at') close(); return; }
      const list = [...(o.allowAll === false ? [] : [{name:'all', all:true}]), ...((o.members && o.members()) || [])].filter(x => !q || x.name.toLowerCase().includes(q.toLowerCase()));
      if (!list.length) { if (mode === 'at') close(); return; }
      if (!pop) { pop = document.createElement('div'); pop.className = 'kit-pop'; barEl.appendChild(pop); }
      mode = 'at'; barEl.querySelector('[data-kit="at"]').classList.add('on');
      pop.innerHTML = list.map(x => x.all
        ? `<button type="button" class="it all" data-kit="pick" data-v="all"><span class="av all">@</span><span><b>all</b><small>채팅방 멤버 모두에게 멘션</small></span></button>`
        : `<button type="button" class="it" data-kit="pick" data-v="${esc(x.name)}"><span class="av"${x.dark ? ' style="background:#141A2A"' : ''}>${x.av || esc(String(x.name).length >= 3 ? String(x.name).slice(1, 3) : x.name)}</span><span><b>${esc(x.name)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></button>`).join('');
    };
    const showEmoji = () => {
      if (mode === 'emoji') return close(); close();
      pop = document.createElement('div'); pop.className = 'kit-pop'; mode = 'emoji'; barEl.querySelector('[data-kit="emoji"]').classList.add('on');
      pop.innerHTML = `<div class="kit-emo">${EMO.map(e => `<button type="button" data-kit="emo" data-v="${e}">${e}</button>`).join('')}</div>`; barEl.appendChild(pop);
    };
    const pick = name => {
      const q = query(); const c = t.selectionStart ?? t.value.length;
      if (q !== null) t.setSelectionRange(c - q.length - 1, c);
      insert(t, '@' + name + ' '); close();
    };
    const act = b => {
      const k = b.dataset.kit;
      if (k === 'send') { close(); return o.onSend && o.onSend(); }
      if (k === 'media' || k === 'album') { close(); return o.onMedia && o.onMedia(k); }
      if (k === 'at') { if (mode === 'at') return close(); const pre = t.value.slice(0, t.selectionStart ?? t.value.length); insert(t, (pre && !/\s$/.test(pre) ? ' ' : '') + '@'); t.focus(); return showAt(); }
      if (k === 'emoji') return showEmoji();
      if (k === 'pick') return pick(b.dataset.v);
      if (k === 'emo') { insert(t, b.dataset.v); return; }
    };
    const KEEP = ['send', 'at', 'emoji', 'pick', 'emo'];   // 눌러도 키보드가 안 닫히게
    // 폰: 손 뗄 때 처리하고 기본 동작(포커스 이동)을 막음 → 목록은 손가락으로 스크롤 가능
    let ty = 0; barEl.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, {passive: true});
    barEl.addEventListener('touchend', e => { const b = e.target.closest('button[data-kit]'); if (!b || !KEEP.includes(b.dataset.kit) || document.activeElement !== t) return;
      e.preventDefault(); if (Math.abs((e.changedTouches[0] || {}).clientY - ty) < 10) act(b); }, {passive: false});
    barEl.addEventListener('mousedown', e => { const b = e.target.closest('button[data-kit]'); if (b && KEEP.includes(b.dataset.kit) && document.activeElement === t) e.preventDefault(); });
    barEl.addEventListener('click', e => { const b = e.target.closest('button[data-kit]'); if (!b) return; e.preventDefault(); act(b); });
    t.addEventListener('input', () => { sync(t); if (mode !== 'emoji') showAt(); });
    t.addEventListener('click', () => { if (mode !== 'emoji') showAt(); });
    t.addEventListener('keydown', e => {
      if (e.key === 'Escape' && pop) { close(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && fine()) { e.preventDefault();
        const first = mode === 'at' && pop && pop.querySelector('[data-kit="pick"]'); if (first) return pick(first.dataset.v);
        o.onSend && o.onSend(); }
    });
    sync(t);
  }

  // 말풍선 글: 이스케이프 + @이름 파란 글씨 (names = 방 인원 이름들)
  function text(body, names, me){
    let h = esc(body); if (!h || h.indexOf('@') < 0) return h;
    const ns = ['all', ...(names || [])].filter(Boolean).map(n => esc(n)).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return h.replace(new RegExp('@(' + ns.join('|') + ')', 'g'), (m, n) => `<span class="kit-mn${n === 'all' || n === esc(me || '') ? ' me' : ''}">@${n}</span>`);
  }
  const day = label => `<div class="kit-day"><span>${esc(label)}</span></div>`;
  const READ = `<div class="kit-read" id="kitRead"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9.1a2 2 0 0 1 1.5.7l4.4 5.4a3 3 0 0 1 0 3.8l-4.4 5.4a2 2 0 0 1-1.5.7H5.5A2.5 2.5 0 0 1 3 17.5z"/><circle cx="15" cy="12" r="1.6" fill="#555A68"/></svg>여기까지 읽으셨습니다.</div>`;
  // 안 읽은 수 n → 남이 보낸 메시지 중 끝에서 n번째(=처음 안 읽은 것)의 id
  function firstUnread(msgs, n){ if (!n) return null; for (let i = msgs.length - 1; i >= 0; i--) { if (!msgs[i].mine && --n <= 0) return i > 0 ? msgs[i].id : null; } return null; }
  // 방 열 때: 읽은 위치가 있으면 그 표시가 위에서 조금 아래 오게, 없으면 맨 아래
  function jump(box){ if (!box) return; const r = box.querySelector('#kitRead'); box.scrollTop = r ? Math.max(0, r.offsetTop - box.offsetTop - 60) : box.scrollHeight; }

  // 아이폰 키보드: 보이는 화면 높이·위치를 CSS 변수로 (--kit-vvh, --kit-vvt)
  (function(){ const vv = window.visualViewport; if (!vv) return; const R = document.documentElement.style;
    const f = () => { R.setProperty('--kit-vvh', vv.height + 'px'); R.setProperty('--kit-vvt', vv.offsetTop + 'px'); };
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f); f(); })();

  // 새 버전 자동 반영: 서버 ver.txt가 이 화면 버전과 다르면 한 번 새로 불러옴 (글 쓰는 중이면 기다림)
  (function(){ if (!window.EP_VER) return; const base = new URL('../ver.txt', document.currentScript ? document.currentScript.src : location.href).href;
    const check = async () => { try {
      const v = (await (await fetch(base + '?t=' + Date.now(), {cache: 'no-store'})).text()).trim();
      if (!v || v === window.EP_VER) return;
      const a = document.activeElement; if (a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && a.value) return;
      const key = 'ep_upd_' + v; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1');
      const u = new URL(location.href); u.searchParams.set('_v', v); location.replace(u.href);
    } catch(_){} };
    setTimeout(check, 1500); setInterval(check, 5 * 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); }); })();

  // 사진 크게 보기 + [저장] — 대화 사진·매물 사진 공용 (<a data-view="큰 사진 주소" data-dl="원본 받기 주소">)
  function viewer(src, dl, name){
    css(); const d = document.createElement('div'); d.className = 'kit-view';
    d.innerHTML = `<div class="vh"><button type="button" data-v="x">✕ 닫기</button><button type="button" data-v="save">⬇ 저장</button></div><div class="vb"><img src="${esc(src)}" alt="사진"></div><p>저장이 안 되면 사진을 꾹 눌러서 '사진에 저장'을 눌러주세요</p>`;
    d.addEventListener('click', async e => { const b = e.target.closest('[data-v]'); if (!b) { if (e.target === d || e.target.classList.contains('vb')) d.remove(); return; }
      if (b.dataset.v === 'x') return d.remove();
      b.textContent = '저장 중…'; await save(src, dl, name); b.textContent = '⬇ 저장'; });
    document.body.appendChild(d);
  }
  async function save(src, dl, name){
    name = name || ('사진_' + new Date().toISOString().slice(0, 10) + '.jpg');
    try { const r = await fetch(src); if (!r.ok) throw 0; const b = await r.blob(); const f = new File([b], name, {type: b.type || 'image/jpeg'});
      if (navigator.canShare && navigator.canShare({files: [f]})) { try { await navigator.share({files: [f]}); } catch(_){} return; }   // 아이폰: 공유창 → '이미지 저장'
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch(_) { window.open(dl || src, '_blank'); }
  }
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[data-view]'); if (!a) return; e.preventDefault(); e.stopPropagation(); viewer(a.dataset.view, a.dataset.dl, a.dataset.name); }, true);

  // 홈 화면 아이콘 배지: 안 읽은 수 (아이폰은 '알림 허용'을 한 번 눌러야 보여요)
  function badge(n){ try { if (!('setAppBadge' in navigator)) return; n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch(_){} }
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const needBadgeOk = () => standalone() && 'Notification' in window && Notification.permission === 'default' && 'setAppBadge' in navigator;
  async function badgeOk(){ try { await Notification.requestPermission(); } catch(_){} }
  window.EPKit = {badge, needBadgeOk, badgeOk, viewer, save, bar, attach, sync, text, day, READ, firstUnread, jump};
})();
