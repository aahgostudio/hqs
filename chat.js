/* 어닝플레이스 · 팀 대화 (직원용 공용)
   - 직원은 자기 방만: 대표님 1:1 · 전체 · 팀 · 오늘 현장 · 대표가 만든 방
   - 수정·삭제해도 원문은 서버에 남아요 (대표 HQ에서 확인)
   사용: EPChat.init({token, demo, accent, onState:({on,unread})=>{}}) → EPChat.open() / EPChat.open(roomId)
   링크로 바로 열기: ...?k=토큰&chat=방번호  (알림톡 [대화 보기] 버튼) */
(function(){
  const C = window.EP_CONFIG || {};
  const URL_ = C.SUPABASE_URL || 'https://ldvknvmsnpbporxhnsli.supabase.co';
  const KEY_ = C.SUPABASE_KEY || 'sb_publishable_7MeTgyPzwzK47RKG-mUapQ_K5ngrTw5';
  const H = {apikey: KEY_, Authorization: 'Bearer ' + KEY_};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pub = p => `${URL_}/storage/v1/object/public/chat/${p}`;
  const two = n => { n = String(n || '?').trim(); return n.length >= 3 ? n.slice(1, 3) : n; };
  const isVid = p => /\.(mov|mp4|m4v|webm|3gp)$/i.test(p || '');
  const extOf = f => { const n = ((f.name || '').split('.').pop() || '').toLowerCase(); if (/^(jpe?g|png|webp|heic|heif|mov|mp4|m4v|webm|3gp)$/.test(n)) return n.replace('jpeg','jpg'); const t = (f.type || '').split('/')[1] || 'jpg'; return t === 'quicktime' ? 'mov' : t.replace('jpeg','jpg'); };
  const ICON = {dm:'👔', all:'📣', team:'👥', site:'📍', custom:'💬'};
  let ICONS = null;   // 대표가 고른 방 아이콘 {방번호: 이모지}
  let opt = {token:'', demo:false, accent:'#16347A', onState:()=>{}};
  let home = null, room = null, msgs = [], unreadMap = {}, view = null, pollT = null, homeT = null, busy = false, editing = null;

  async function rpc(fn, args){
    const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {method:'POST', headers:Object.assign({'content-type':'application/json'}, H), body:JSON.stringify(args)});
    if (!r.ok) throw new Error((await r.text()).slice(0, 200)); return r.json();
  }

  /* ---------- 미리보기용 ---------- */
  const now = Date.now(), ago = m => new Date(now - m*60000).toISOString();
  const DEMO = {
    home: {on:true, me:{id:'me', name:'김지원'}, rooms:[
      {id:1, kind:'dm', title:'대표님', unread:1, n:2, last:{name:'대표', body:'내일 7시 반까지 와주세요', at:ago(12)}},
      {id:2, kind:'all', title:'전체', unread:0, n:9, last:{name:'대표', body:'11/1부터 일정판에서 대화해요!', at:ago(95)}},
      {id:3, kind:'team', title:'클린팀', unread:3, n:6, last:{name:'김준호', body:'장비 챙겨서 출발합니다', at:ago(4)}},
      {id:4, kind:'site', title:'10/27 망미동 SK뷰 35평', unread:1, n:4, last:{name:'나미정', body:'사진', at:ago(30)}}]},
    room: {3: {room:{id:3, kind:'team', title:'클린팀', members:[{name:'김준호',role:'팀장'},{name:'신봉진',role:'실장'},{name:'나미정',role:'지원'},{name:'서은호',role:'지원'},{name:'김지원',role:'지원'}]},
      msgs:[{id:11, who:'boss', name:'대표', mine:false, body:'내일 망미동 7시 반까지 사무실 모여요 🙌', at:ago(70)},
            {id:12, who:'a', name:'신봉진', mine:false, body:'저는 양정 퇴실 끝나고 합류할게요', at:ago(40)},
            {id:13, who:'me', name:'김지원', mine:true, body:'네! 저도 7시 반 도착해요 👍', at:ago(20), edited:true},
            {id:14, who:'b', name:'김준호', mine:false, body:'장비 챙겨서 출발합니다', at:ago(4)}],
      unread:{11:0, 12:1, 13:2, 14:4}}}
  };

  const DEMO_RES = {
    home: {on:true, me:{id:'me', name:'조원경'}, rooms:[
      {id:1, kind:'dm', title:'대표님', unread:1, n:2, last:{name:'대표', body:'양정동 계약서 내일 오전에 같이 봐요', at:ago(12)}},
      {id:2, kind:'all', title:'전체', unread:0, n:9, last:{name:'대표', body:'11/1부터 여기서 대화해요!', at:ago(95)}},
      {id:3, kind:'team', title:'부동산팀', unread:2, n:4, last:{name:'김윤미', body:'광안동 원룸 오늘 3시 안내 갑니다', at:ago(6)}}]},
    room: {3: {room:{id:3, kind:'team', title:'부동산팀', members:[{name:'권성환',role:'대표'},{name:'조원경',role:'소장'},{name:'김윤미',role:'실장'}]},
      msgs:[{id:11, who:'boss', name:'대표', mine:false, body:'이번 주 신규 매물 꼭 등록해 주세요 🙌', at:ago(70)},
            {id:12, who:'me', name:'조원경', mine:true, body:'네! 양정동 2건 오늘 올릴게요', at:ago(30)},
            {id:13, who:'a', name:'김윤미', mine:false, body:'광안동 원룸 오늘 3시 안내 갑니다', at:ago(6)}],
      unread:{11:0, 12:1, 13:2}}}
  };

  /* ---------- 스타일 ---------- */
  function css(){
    if (document.getElementById('epc-css')) return;
    const s = document.createElement('style'); s.id = 'epc-css';
    s.textContent = `
.epc{position:fixed;inset:0;z-index:200;display:flex;flex-direction:column;background:var(--epc-bg);color:var(--epc-ink);font-family:inherit;transform:translateX(100%);transition:transform .22s ease}
.epc.on{transform:none}
.epc{bottom:auto;top:var(--kit-vvt,0px);height:var(--kit-vvh,100%);--kit-card:var(--epc-card);--kit-line:var(--epc-line);--kit-mute:var(--epc-mute);--kit-ink:var(--epc-ink);--kit-soft:var(--epc-bg);--kit-acc:#2F6FEB}
.epc{--epc-bg:#F4F6FB;--epc-card:#fff;--epc-ink:#141A2A;--epc-mute:#6B7385;--epc-line:#E3E7F0;--epc-me:var(--epc-acc);--epc-me-ink:#fff;--epc-other:#fff}
@media (prefers-color-scheme:dark){.epc{--epc-bg:#0E1220;--epc-card:#171C2C;--epc-ink:#EEF1F8;--epc-mute:#98A0B3;--epc-line:#262D40;--epc-other:#1E2436}}
.epc-h{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 12px;background:var(--epc-acc);color:#fff}
.epc-h b{font-size:17px}.epc-h small{opacity:.75;font-size:12.5px;margin-left:4px;font-weight:600}
.epc-h .epc-back{border:0;background:rgba(255,255,255,.14);color:#fff;width:34px;height:34px;border-radius:10px;font-size:18px;display:grid;place-items:center;cursor:pointer}
.epc-h .sp{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.epc-list{flex:1;overflow:auto;padding:6px 0 30px}
.epc-sec{font-size:12px;color:var(--epc-mute);font-weight:700;padding:14px 18px 6px}
.epc-kid{padding-left:46px!important;position:relative}.epc-kid::before{content:'';position:absolute;left:30px;top:-2px;width:10px;height:28px;border-left:1.5px dashed #CBD5E1;border-bottom:1.5px dashed #CBD5E1;border-bottom-left-radius:6px}
.epc-row{display:flex;align-items:center;gap:12px;width:100%;border:0;background:var(--epc-card);padding:12px 16px;border-bottom:1px solid var(--epc-line);text-align:left;color:inherit;font:inherit;cursor:pointer}
.epc-ic{width:44px;height:44px;border-radius:14px;background:var(--epc-bg);display:grid;place-items:center;font-size:21px;flex:none}
.epc-row .t{flex:1;min-width:0}.epc-row b{display:block;font-size:15px}
.epc-row p{margin:2px 0 0;font-size:13px;color:var(--epc-mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.epc-row .r{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:11px;color:var(--epc-mute)}
.epc-bd{min-width:20px;height:20px;border-radius:10px;background:#E5484D;color:#fff;font-size:11.5px;font-weight:800;display:grid;place-items:center;padding:0 6px}
.epc-note{font-size:12px;color:var(--epc-mute);padding:14px 18px;line-height:1.5}
.epc-msgs{flex:1;overflow:auto;padding:12px 12px 8px;display:flex;flex-direction:column;gap:6px}
.epc-day{align-self:center;font-size:11.5px;color:var(--epc-mute);background:var(--epc-card);border:1px solid var(--epc-line);padding:3px 10px;border-radius:20px;margin:8px 0}
.epc-m{display:flex;gap:8px;align-items:flex-start;max-width:94%}
.epc-m.mine{align-self:flex-end;flex-direction:row-reverse}
.epc-av{width:34px;height:34px;border-radius:50%;background:color-mix(in srgb,var(--epc-acc) 14%,var(--epc-card));color:var(--epc-acc);display:grid;place-items:center;font-size:12px;font-weight:800;flex:none;overflow:hidden}
.epc-av img{width:100%;height:100%;object-fit:cover}
.epc-col{display:flex;flex-direction:column;gap:3px;min-width:0}
.epc-m.mine .epc-col{align-items:flex-end}
.epc-nm{font-size:12px;color:var(--epc-mute);font-weight:600}
.epc-line{display:flex;align-items:flex-end;gap:5px}
.epc-m.mine .epc-line{flex-direction:row-reverse}
.epc-b{max-width:min(68vw,460px);width:max-content;background:var(--epc-other);border:1px solid var(--epc-line);padding:9px 12px;border-radius:4px 16px 16px 16px;font-size:14.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.epc-m.mine .epc-b{background:var(--epc-me);color:var(--epc-me-ink);border-color:transparent;border-radius:16px 4px 16px 16px}
.epc-b.del{background:transparent;color:var(--epc-mute);font-style:italic;border-style:dashed}
.epc-b img{display:block;max-width:220px;max-height:280px;border-radius:10px;margin:-3px -5px}
.epc-meta{flex:none;display:flex;flex-direction:column;font-size:10.5px;color:var(--epc-mute);white-space:nowrap;line-height:1.25}
.epc-m.mine .epc-meta{align-items:flex-end}
.epc-meta .u{color:#D9A400;font-weight:800}
.epc-in{display:flex;gap:8px;align-items:flex-end;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:var(--epc-card);border-top:1px solid var(--epc-line)}
.epc-b video{display:block;max-width:240px;max-height:320px;border-radius:12px;background:#000}
.epc-in textarea{min-height:42px;box-sizing:border-box;flex:1;resize:none;border:1px solid var(--epc-line);background:var(--epc-bg);color:inherit;border-radius:20px;padding:10px 14px;font:inherit;font-size:15px;max-height:120px;line-height:1.35}
.epc-in button{border:0;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:18px;cursor:pointer;flex:none}
.epc-send{background:var(--epc-acc);color:#fff}.epc-ph{background:var(--epc-bg);color:var(--epc-mute);font-size:24px;font-weight:300}
.epc-edit{font-size:12px;color:var(--epc-mute);padding:6px 14px;background:var(--epc-card);border-top:1px solid var(--epc-line);display:flex;justify-content:space-between}
.epc-edit button{border:0;background:none;color:var(--epc-acc);font-weight:700;font:inherit;font-size:12px}
.epc-menu{position:fixed;inset:0;z-index:210;background:rgba(10,14,25,.4);display:flex;align-items:flex-end;justify-content:center}
.epc-menu div{background:var(--epc-card);width:100%;max-width:480px;border-radius:18px 18px 0 0;padding:10px 12px calc(14px + env(safe-area-inset-bottom))}
.epc-menu button{display:block;width:100%;border:0;background:none;color:inherit;font:inherit;font-size:15.5px;padding:14px;text-align:left;border-radius:12px}
.epc-menu button:hover{background:var(--epc-bg)}
.epc-menu .warn{color:#E5484D}
.epc-menu p{font-size:12px;color:var(--epc-mute);margin:4px 14px 6px;line-height:1.5}
.epc-tabbd{position:absolute;top:2px;right:calc(50% - 22px);min-width:17px;height:17px;border-radius:9px;background:#E5484D;color:#fff;font-size:10.5px;font-weight:800;display:grid;place-items:center;padding:0 4px}`;
    document.head.appendChild(s);
  }

  /* ---------- 시간 ---------- */
  const tm = iso => { const d = new Date(iso); let h = d.getHours(), m = String(d.getMinutes()).padStart(2,'0'); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`; };
  const dayKey = iso => new Date(iso).toDateString();
  const dayLabel = iso => { const d = new Date(iso); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`; };
  const short = iso => { const d = new Date(iso), t = new Date(); if (d.toDateString() === t.toDateString()) return tm(iso); const y = new Date(t - 864e5); if (d.toDateString() === y.toDateString()) return '어제'; return `${d.getMonth()+1}/${d.getDate()}`; };

  function avatar(name, path){
    const p = path || (window.EPProfile && EPProfile.path ? EPProfile.path(name) : null);
    if (name === '대표') return `<span class="epc-av" style="background:#141A2A;color:#fff">대표</span>`;
    return `<span class="epc-av">${p ? `<img src="${esc(`${URL_}/storage/v1/object/public/avatars/${p}`)}" alt="">` : esc(two(name))}</span>`;
  }

  /* ---------- 화면 ---------- */
  function shell(){
    let w = document.getElementById('epc');
    if (!w) { w = document.createElement('div'); w.id = 'epc'; w.className = 'epc'; w.style.setProperty('--epc-acc', opt.accent); document.body.appendChild(w);
      w.addEventListener("click", e => { onClick(e); e.stopPropagation(); }); }
    return w;
  }
  function drawList(){
    const w = shell(), rs = (home && home.rooms) || [];
    const total = rs.reduce((a, r) => a + (r.unread || 0), 0);
    const row = r => `<button class="epc-row${r._kid ? ' epc-kid' : ''}" data-room="${r.id}"><span class="epc-ic">${(ICONS && ICONS[r.id]) || ICON[r.kind] || '💬'}</span>
      <span class="t"><b>${esc(r.title)}${r.kind !== 'dm' ? ` <small style="color:var(--epc-mute);font-weight:600;font-size:12px">${r.n}</small>` : ''}</b>
      <p>${r.last ? esc((r.kind === 'dm' ? '' : r.last.name + ': ') + r.last.body) : '아직 대화가 없어요'}</p></span>
      <span class="r">${r.last ? short(r.last.at) : ''}${r.unread ? `<span class="epc-bd">${r.unread > 99 ? '99+' : r.unread}</span>` : ''}</span></button>`;
    const ord = (ICONS && ICONS._order) || [], ix = id => { const i = ord.indexOf(id); return i < 0 ? 1e6 : i; };   // 대표가 정한 방 순서
    const g = k => rs.filter(r => k.includes(r.kind)).map((r, i) => [r, i]).sort((a, b) => ix(a[0].id) - ix(b[0].id) || a[1] - b[1]).map(x => x[0]);
    const P = (ICONS && ICONS._parent) || {};
    const gt = k => { const a = g(k), ids = new Set(a.map(r => r.id)), out = [];   // 하위 방은 윗방 바로 밑에
      a.forEach(r => { const p = P[r.id]; if (p && ids.has(+p) && !P[p]) return; out.push(r); a.filter(x => +P[x.id] === r.id).forEach(x => out.push(Object.assign({}, x, {_kid: true}))); }); return out; };
    w.innerHTML = `<div class="epc-h"><button class="epc-back" data-close="1" aria-label="닫기">←</button><span class="sp"><b>대화</b>${total ? `<small>안 읽음 ${total}</small>` : ''}</span></div>
      <div class="epc-list">
        ${g(['dm']).length ? `<div class="epc-sec">1:1</div>${g(['dm']).map(row).join('')}` : ''}
        ${g(['all','team','custom']).length ? `<div class="epc-sec">함께하는 방</div>${gt(['all','team','custom']).map(row).join('')}` : ''}
        ${g(['site']).length ? `<div class="epc-sec">내 현장</div>${g(['site']).map(row).join('')}` : ''}
        <p class="epc-note">🔒 내가 속한 방만 보여요.${g(['site']).length ? ' 현장방은 작업 완료 보고 7일 뒤 목록에서 빠져요.' : ''}<br>대화와 사진은 업무 기록으로 보관돼요.</p>
      </div>`;
  }
  function drawRoom(keepScroll){
    const w = shell(); if (!room) return;
    const box0 = w.querySelector('.epc-msgs'), atBottom = !box0 || box0.scrollHeight - box0.scrollTop - box0.clientHeight < 80, prevTop = box0 ? box0.scrollTop : 0;
    let last = '', out = ''; const names = memList().map(x => x.name).concat(home && home.me ? [home.me.name] : []), me = home && home.me ? home.me.name : '';
    msgs.forEach((m, i) => {
      if (dayKey(m.at) !== last) { last = dayKey(m.at); out += K().day(dayLabel(m.at)); }
      if (mark != null && m.id === mark) out += K().READ;
      const prev = msgs[i-1], cont = prev && prev.who === m.who && dayKey(prev.at) === dayKey(m.at) && (new Date(m.at) - new Date(prev.at)) < 180000;
      const u = unreadMap[m.id] || 0;
      const body = m.deleted ? `<div class="epc-b del">삭제된 메시지예요</div>`
        : `<div class="epc-b" ${m.mine ? `data-own="${m.id}"` : ''}>${m.photo ? `${isVid(m.photo) ? `<video src="${esc(pub(m.photo))}#t=0.1" controls playsinline preload="metadata"></video>` : `<a href="${esc(pub(m.photo))}" target="_blank" rel="noopener" data-view="${esc(pub(m.photo))}" data-dl="${esc(pub(m.photo))}?download="><img src="${esc(pub(m.photo))}" alt="사진" loading="lazy"></a>`}${m.body ? '<div style="margin-top:8px">' + K().text(m.body, names, me) + '</div>' : ''}` : K().text(m.body, names, me)}</div>`;
      out += `<div class="epc-m ${m.mine ? 'mine' : ''}">${m.mine ? '' : (cont ? '<span style="width:34px;flex:none"></span>' : avatar(m.name, m.avatar))}
        <div class="epc-col">${!m.mine && !cont ? `<span class="epc-nm">${esc(m.name)}</span>` : ''}
        <div class="epc-line">${body}<span class="epc-meta">${u ? `<span class="u">${u}</span>` : ''}${m.edited && !m.deleted ? '<span>수정됨</span>' : ''}<span>${tm(m.at)}</span></span></div></div></div>`;
    });
    const n = (room.room.members || []).length + 1;
    const oldIn = w.querySelector('.kit-bar'), edKey = editing ? String(editing.id) : '';
    const keepIn = oldIn && w.dataset.room === String(room.room.id) && w.dataset.ed === edKey;   // 글 쓰는 중엔 입력칸 유지 (키보드 안 닫히게)
    const html = `<div class="epc-h"><button class="epc-back" data-list="1" aria-label="목록">←</button><span class="sp"><b>${esc(room.room.title)}</b>${room.room.kind !== 'dm' ? `<small>${n}명</small>` : ''}</span></div>
      <div class="epc-msgs">${out || '<p class="epc-note" style="text-align:center;margin-top:30px">첫 메시지를 남겨보세요 👋</p>'}</div>
      ${editing ? `<div class="epc-edit"><span>✏️ 메시지 수정 중</span><button data-epccancel="1">취소</button></div>` : ''}
      ${K().bar({id:'epc-t'})}`;
    if (keepIn) {   // 입력칸은 그대로(움직이면 키보드 닫힘) · 위쪽 줄과 메시지만 바꿈
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      w.querySelector('.epc-h').replaceWith(tmp.querySelector('.epc-h'));
      w.querySelector('.epc-msgs').innerHTML = tmp.querySelector('.epc-msgs').innerHTML;
    } else w.innerHTML = html;
    w.dataset.room = String(room.room.id); w.dataset.ed = edKey;
    const box = w.querySelector('.epc-msgs');
    box.scrollTop = keepScroll && !atBottom ? prevTop : box.scrollHeight;
    const t = w.querySelector('#epc-t');
    if (keepIn) { bindBox(box); return; }
    // 입력줄: 카카오워크식 · @멘션 · 이모지 (PC는 Enter 전송, 폰은 [↑])
    K().attach(w.querySelector('.kit-bar'), {members: memList, onSend: send,
      onMedia: k => pickMedia(async fs => { for (const f of fs) await sendPhoto(f); }, k === 'album' ? 'alb' : null)});
    if (editing) { t.value = editing.body || ''; K().sync(t); t.focus(); }
    bindBox(box);
  }
  const K = () => window.EPKit;
  let mark = null;   // '여기까지 읽으셨습니다' 위치 (방에 있는 동안)
  // 멘션 목록: 방 인원(나 빼고) + 대표
  function memList(){
    const meN = home && home.me ? home.me.name : '', ms = ((room && room.room.members) || []).filter(x => x.name !== meN && x.role !== '대표');
    return [{name:'대표', sub:'대표 / 어닝플레이스', av:'대표', dark:true}, ...ms.map(x => ({name: x.name, sub: [x.role, x.team_name].filter(Boolean).join(' / ')}))];
  }
  function bindBox(box){
    if (box._bound) return; box._bound = true;
    // 사진·동영상이 늦게 불러와지면 높이가 바뀜 → 맨 아래 보고 있었으면 다시 맨 아래로
    box.addEventListener('scroll', () => { box._nearB = box.scrollHeight - box.scrollTop - box.clientHeight < 120; });
    const fix = () => { if (box._nearB !== false) box.scrollTop = box.scrollHeight; }; box.addEventListener('load', fix, true); box.addEventListener('loadedmetadata', fix, true);
    let pressT; box.addEventListener('pointerdown', e => { const b = e.target.closest('[data-own]'); if (!b) return; pressT = setTimeout(() => menu(+b.dataset.own), 450); });
    ['pointerup','pointerleave','pointercancel'].forEach(ev => box.addEventListener(ev, () => clearTimeout(pressT)));
    box.addEventListener('contextmenu', e => { const b = e.target.closest('[data-own]'); if (b) { e.preventDefault(); menu(+b.dataset.own); } });
  }

  function menu(id){
    const m = msgs.find(x => x.id === id); if (!m) return;
    const d = document.createElement('div'); d.className = 'epc-menu';
    d.innerHTML = `<div>${m.body ? '<button data-a="copy">📋 복사</button><button data-a="edit">✏️ 수정</button>' : ''}<button data-a="del" class="warn">🗑 삭제</button>
      <p>수정·삭제하면 '수정됨', '삭제된 메시지'로 표시돼요.</p><button data-a="x">닫기</button></div>`;
    document.body.appendChild(d);
    d.onclick = async e => { e.stopPropagation(); const a = e.target.closest('[data-a]'); if (e.target !== d && !a) return; d.remove(); if (!a) return;
      if (a.dataset.a === 'copy') { try { await navigator.clipboard.writeText(m.body); } catch(_){} }
      if (a.dataset.a === 'edit') { editing = m; drawRoom(true); }
      if (a.dataset.a === 'del') { if (!confirm('이 메시지를 삭제할까요?')) return;
        if (opt.demo) { m.deleted = true; return drawRoom(true); }
        try { await rpc('chat_edit', {p_token: opt.token, p_id: id, p_body: null, p_delete: true}); m.deleted = true; drawRoom(true); } catch(_){ alert('삭제하지 못했어요'); } }
    };
  }

  /* ---------- 데이터 ---------- */
  async function loadHome(){
    if (opt.demo) { home = (opt.demoTeam === 'RES' ? DEMO_RES : DEMO).home; }
    else { try { home = await rpc('chat_home', {p_token: opt.token}); } catch(_) { home = home || {on:false}; }
      if (home && home.on && ICONS === null) { try { ICONS = await rpc('chat_icons', {}) || {}; } catch(_) { ICONS = {}; } } }
    const unread = home && home.on ? home.rooms.reduce((a, r) => a + (r.unread || 0), 0) : 0;
    opt.onState({on: !!(home && home.on), unread});
    if (view === 'list') drawList();
  }
  async function openRoom(id){
    view = 'room'; editing = null; const rw = home && home.rooms ? home.rooms.find(x => x.id == id) : null, was = rw ? rw.unread || 0 : 0;
    if (opt.demo) { const d = (opt.demoTeam === 'RES' ? DEMO_RES : DEMO).room[id] || {room:{id, kind:'dm', title:(home.rooms.find(r=>r.id==id)||{}).title || '대화', members:[]}, msgs:[], unread:{}};
      room = d; msgs = d.msgs.slice(); unreadMap = Object.assign({}, d.unread); mark = K().firstUnread(msgs, was); const r = home.rooms.find(x => x.id == id); if (r) r.unread = 0; drawRoom(); K().jump(shell().querySelector('.epc-msgs')); return; }
    try { const d = await rpc('chat_load', {p_token: opt.token, p_room: id, p_after: 0, p_before: null});
      room = d; msgs = d.msgs; unreadMap = d.unread || {}; mark = K().firstUnread(msgs, was); drawRoom(); K().jump(shell().querySelector('.epc-msgs')); poll(); loadHome(); }
    catch(_) { view = 'list'; await loadHome(); drawList(); }
  }
  async function refreshRoom(){
    if (view !== 'room' || !room || opt.demo || document.hidden) return;
    try { const lastId = msgs.length ? msgs[msgs.length-1].id : 0;
      const d = await rpc('chat_load', {p_token: opt.token, p_room: room.room.id, p_after: lastId, p_before: null});
      // 새 글 + 읽음 수 갱신 (수정·삭제는 다시 열 때 반영)
      const nu = Object.assign(unreadMap, d.unread || {}); unreadMap = nu;
      if (d.msgs.length) msgs = msgs.concat(d.msgs);
      if (d.msgs.length || Object.keys(d.unread || {}).length) { const t = document.getElementById('epc-t'); const v = t ? t.value : ''; drawRoom(true); const t2 = document.getElementById('epc-t'); if (t2 && !editing) t2.value = v; }
    } catch(_){}
  }
  function poll(){ clearInterval(pollT); pollT = setInterval(refreshRoom, 3500); }

  async function send(){
    const t = document.getElementById('epc-t'); const v = (t.value || '').trim(); if (!v || busy) return;
    busy = true;
    try {
      if (editing) { const m = editing;
        if (!opt.demo) await rpc('chat_edit', {p_token: opt.token, p_id: m.id, p_body: v, p_delete: false});
        m.body = v; m.edited = true; editing = null; t.value = ''; K().sync(t); drawRoom(true);
      } else {
        t.value = ''; K().sync(t); mark = null;
        if (opt.demo) { msgs.push({id: Date.now(), who:'me', name: home.me.name, mine:true, body:v, at:new Date().toISOString()}); unreadMap[msgs[msgs.length-1].id] = (room.room.members||[]).length; drawRoom(); }
        else { await rpc('chat_send', {p_token: opt.token, p_room: room.room.id, p_body: v, p_photo: null}); await refreshRoom(); }
      }
    } catch(_) { alert('보내지 못했어요. 인터넷 연결을 확인해주세요.'); t.value = v; K().sync(t); }
    busy = false;
  }

  // 📷 누르면: 사진 찍기 / 동영상 찍기 / 앨범 — 폰 기본 선택창(카메라 2개+파일)보다 단순하게
  function pickMedia(onFiles, direct){
    const old = document.getElementById('mpick'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'mpick';
    d.innerHTML = `<style>#mpick{position:fixed;inset:0;z-index:300;background:rgba(15,23,42,.45);display:flex;align-items:flex-end;justify-content:center}
  #mpick .sh{width:100%;max-width:480px;background:#fff;color:#141A2A;border-radius:22px 22px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-family:inherit}
  #mpick .sh button{border:0;background:#F4F6FA;border-radius:18px;padding:18px 6px;font:inherit;font-size:14px;font-weight:700;color:inherit;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer}
  #mpick .sh button i{font-style:normal;display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:#fff;color:#334155}
  #mpick .sh .x{grid-column:1/-1;background:none;padding:12px;color:#6B7385;font-weight:600}</style>
  <div class="sh"><button data-pk="cam"><i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg></i>사진 찍기</button><button data-pk="vid"><i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg></i>동영상 찍기</button><button data-pk="alb"><i><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/></svg></i>앨범</button><button class="x" data-pk="x">취소</button></div>`;
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-pk]'); if (!b && e.target !== d) return;
      const k = b ? b.dataset.pk : 'x'; d.remove(); if (k === 'x') return;
      const i = document.createElement('input'); i.type = 'file'; i.style.display = 'none';
      if (k === 'cam') { i.accept = 'image/*'; i.setAttribute('capture', 'environment'); }
      else if (k === 'vid') { i.accept = 'video/*'; i.setAttribute('capture', 'environment'); }
      else if (/Android/i.test(navigator.userAgent)) { i.accept = '.jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.3gp,.webm'; }   // 갤럭시: 카메라 선택창 건너뛰고 바로 사진·파일 고르기로
    else { i.accept = 'image/*,video/*'; i.multiple = true; }   // 갤럭시(카톡 안)는 여러 장 선택이면 창이 안 열려서 한 장씩
      i.onchange = () => { const fs = [...(i.files || [])]; i.remove(); if (fs.length) onFiles(fs); };
      document.body.appendChild(i); i.click();
    });
    document.body.appendChild(d);
    if (direct) d.querySelector(`[data-pk="${direct}"]`).click();   // [사진] 버튼: 바로 앨범
  }
  
  async function sendPhoto(f){
    const vid = /^video\//.test(f.type || '') || /\.(mov|mp4|m4v|webm|3gp)$/i.test(f.name || '');
    if (vid && f.size > 50 * 1024 * 1024) return alert('동영상은 50MB까지 올릴 수 있어요.\n(약 30초~1분) 길면 잘라서 보내주세요.');
    if (!vid && f.size > 15 * 1024 * 1024) return alert('15MB 이하 사진만 올릴 수 있어요');
    if (opt.demo) { msgs.push({id: Date.now(), who:'me', name: home.me.name, mine:true, photo:null, body:'📷 (미리보기: 사진은 저장되지 않아요)', at:new Date().toISOString()}); return drawRoom(); }
    try {
      const key = await rpc('staff_avatar_slot', {p_token: opt.token});
      const ext = extOf(f);
      const path = `${key}/${room.room.id}/${Date.now()}.${ext}`;
      const r = await fetch(`${URL_}/storage/v1/object/chat/${path}`, {method:'POST', headers:Object.assign({'content-type': f.type || (vid ? 'video/mp4' : 'image/jpeg')}, H), body: f});   // 원본 그대로 (증거 보관)
      if (!r.ok) throw new Error('upload');
      await rpc('chat_send', {p_token: opt.token, p_room: room.room.id, p_body: null, p_photo: path}); await refreshRoom();
    } catch(_) { alert((vid ? '동영상' : '사진') + '을 올리지 못했어요. 잠시 뒤 다시 해주세요.'); }
  }

  function onClick(e){
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close) return close();
    if (b.dataset.list) { view = 'list'; clearInterval(pollT); room = null; drawList(); loadHome(); return; }
    if (b.dataset.room) return openRoom(+b.dataset.room);
    if (b.dataset.send) return send();
    if (b.dataset.photo) return pickMedia(async fs => { for (const f of fs) await sendPhoto(f); });
    if (b.dataset.epccancel) { editing = null; return drawRoom(true); }
  }
  function close(){
    const w = document.getElementById('epc'); if (!w) return; view = null; clearInterval(pollT); room = null;
    w.classList.remove('on'); setTimeout(() => w.remove(), 230);
    try { if (new URLSearchParams(location.search).has('chat')) { const u = new URL(location.href); u.searchParams.delete('chat'); history.replaceState(null, '', u); } } catch(_){}
    loadHome();
  }
  async function open(id){
    css(); const w = shell(); requestAnimationFrame(() => w.classList.add('on'));
    if (!home) await loadHome();
    if (!home || !home.on) { w.innerHTML = `<div class="epc-h"><button class="epc-back" data-close="1">←</button><span class="sp"><b>대화</b></span></div><p class="epc-note" style="text-align:center;margin-top:40px">대화 기능은 곧 열려요.</p>`; return; }
    if (id) return openRoom(id);
    view = 'list'; drawList();
  }

  window.EPChat = {
    init(o){ opt = Object.assign(opt, o || {}); css();
      document.addEventListener('mousedown', e => { if (e.target.closest('.epc-send')) e.preventDefault(); });   // [↑] 눌러도 키보드 유지
      document.addEventListener('touchstart', e => { const b = e.target.closest('.epc-send'); if (b && document.activeElement && document.activeElement.id === 'epc-t') { e.preventDefault(); b.click(); } }, {passive:false}); if (!opt.token && !opt.demo) return;
      loadHome().then(() => { const q = new URLSearchParams(location.search).get('chat'); if (q && home && home.on) open(/^\d+$/.test(q) ? +q : null); });
      clearInterval(homeT); homeT = setInterval(() => { if (!document.hidden && view !== 'room') loadHome(); }, 25000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { view === 'room' ? refreshRoom() : loadHome(); } });
    },
    open, close,
    badge(n){ return n ? `<span class="epc-tabbd">${n > 99 ? '99+' : n}</span>` : ''; },
    get state(){ return {on: !!(home && home.on), unread: home && home.on ? home.rooms.reduce((a, r) => a + (r.unread || 0), 0) : 0}; }
  };
})();
