/* 내 현장 다이어리 (2026-11-08)
   · 직원 일정판 하단 [다이어리] → 전체 화면
   · 내가 다녀간 현장이 날짜별로 쌓임: 대문(블로그 썸네일 / 전·후), 함께한 사람, 오늘의 한마디
   · 반응(👏💪🔥❤️😂)·이야기(댓글)로 소통 — 직원이 따로 할 일은 없음 */
(function(){
const RX = ['👏','💪','🔥','❤️','😂'];
const DOWE = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DOWK = ['일','월','화','수','목','금','토'];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const parse = s => { const [y,m,d] = String(s).slice(0,10).split('-').map(Number); return new Date(y, m-1, d); };
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m/60) + '시간 전' : Math.round(m/1440) + '일 전'; };
const short = n => { n = String(n||'').trim(); return n.length >= 3 ? n.slice(-2) : n; };
let O = {}, S = {scope:'mine', month:null, data:null, one:null, pv:null}, root = null;
const SEEN = 'ep_dy_seen';
const seen = () => { try { return localStorage.getItem(SEEN); } catch(_){ return null; } };
const markSeen = () => { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch(_){} };
const url = p => /^(https?:|\/|\.)/.test(p) ? p : O.photoUrl(p);

/* 오늘의 한마디 — 대표님이 따로 안 적으면 현장 성격에 맞춰 자동 */
function autoNote(it){
  const t = (it.title || '') + ' ' + (it.kind || ''), n = (it.crew||[]).length + (it.boss ? 1 : 0), id = it.id || 0;
  const pick = a => a[id % a.length];
  const lead = /입주/.test(t) ? pick(['새 집의 첫 페이지를 우리가 열었어요.', '입주하실 분이 문 열자마자 웃으실 거예요.', '새 출발하는 집, 첫 단추를 반짝하게 끼웠어요.'])
    : /이사/.test(t) ? pick(['떠난 자리까지 깨끗하게, 그게 우리 방식이죠.', '다음 사람이 기분 좋게 시작할 수 있겠어요.', '짐 빠진 집이 이렇게 환해질 수 있다니!'])
    : /퇴실/.test(t) ? pick(['물때 하나 없이, 다음 사람을 위한 첫 페이지.', '퇴실 점검 걱정 없게 꼼꼼히 마무리했어요.'])
    : /정기/.test(t) ? pick(['꾸준함이 제일 어려운 건데, 오늘도 해냈어요.', '늘 같은 자리, 늘 같은 반짝임. 믿고 맡기는 이유예요.'])
    : /준공|인테리어|공사/.test(t) ? pick(['공사 먼지와의 싸움, 오늘도 우리가 이겼어요.', '먼지 속에서 새 공간을 꺼내 준 하루예요.'])
    : /상가|사무실|헬스|병원|학원|매장/.test(t) ? pick(['손님 맞을 준비 끝! 가게가 한층 밝아졌어요.', '일하는 공간이 깨끗하면 하루가 달라지죠.'])
    : pick(['오늘도 우리 손 거쳐 간 공간이 하나 늘었어요.', '들어갈 때와 나올 때가 이렇게 다를 수 있다니!']);
  const tail = it.photo_n >= 60 ? ` 사진 ${it.photo_n}장 기록까지 꼼꼼했던 하루!` : n >= 3 ? ` ${n}명이 한마음으로 만든 결과, 고생 많으셨어요!` : n === 2 ? ' 두 분 호흡 최고였어요, 고생 많으셨어요!' : ' 혼자서도 꼼꼼했던 하루, 고생 많으셨어요!';
  return lead + tail;
}
const note = it => it.note && it.note.trim() ? it.note : autoNote(it);
const crewList = it => (it.crew||[]).map(n => ({n, s:short(n)})).concat(it.boss ? [{n:'권성환 대표', s:'성환', boss:true}] : []);
const avs = it => crewList(it).slice(0,5).map((c,i) => `<span class="dy-av c${c.boss ? 'b' : i%3}">${esc(c.s)}</span>`).join('');
const names = it => crewList(it).map(c => c.n.replace(' 대표','')).join(' · ');

function cover(it, big){
  if (it.cover) return `<div class="dy-cv one${big?' big':''}"><img src="${esc(url(it.cover))}" alt="" loading="lazy"></div>`;
  const b = it.before, a = it.after && it.after !== it.before ? it.after : null;
  if (!b) return `<div class="dy-cv none${big?' big':''}"><span>${esc(it.title)}</span></div>`;
  if (!a) return `<div class="dy-cv one${big?' big':''}"><img src="${esc(url(b))}" alt="" loading="lazy"></div>`;
  return `<div class="dy-cv${big?' big':''}"><img src="${esc(url(b))}" alt="" loading="lazy"><img src="${esc(url(a))}" alt="" loading="lazy"><span class="tg l">Before</span><span class="tg r">After</span></div>`;
}
function rxRow(it, all){
  const list = all ? RX : RX.filter(e => (it.rx||{})[e]).concat(RX.filter(e => !(it.rx||{})[e]).slice(0, Math.max(0, 3 - RX.filter(e => (it.rx||{})[e]).length)));
  return list.map(e => { const n = (it.rx||{})[e] || 0, on = (it.my_rx||[]).includes(e);
    return `<button class="dy-rx${on?' on':''}" data-dyrx="${e}" data-j="${it.id}">${e}${n ? ` <b>${n}</b>` : ''}</button>`; }).join('');
}

/* ---------- 화면 ---------- */
function feed(){
  const d = S.data, m = S.month, mine = S.scope === 'mine';
  const head = `<div class="dy-top"><button class="dy-x" data-dyx="1" aria-label="닫기">‹</button><span>RITZ · SITE DIARY</span></div>
    <div class="dy-hd"><h1>${mine ? '내 현장 다이어리' : '우리 현장 다이어리'}</h1>
      <p>${mine ? `${esc(d ? d.me : '')}님이 다녀간 공간들, 하루씩 적어가요` : '사람이 먼저인 회사, 우리가 함께 쌓은 하루들'}</p></div>
    ${d && mine ? `<div class="dy-sum"><div><b>${d.mine_total}</b><small>함께한 현장</small></div><div><b>${d.month_mine}</b><small>${m.getMonth()+1}월</small></div><div><b>${d.cheers}</b><small>받은 응원</small></div></div>`
      : d ? `<div class="dy-sum"><div><b>${d.total}</b><small>우리의 기록</small></div><div><b>${d.month_n}</b><small>${m.getMonth()+1}월</small></div><div><b>${d.mine_total}</b><small>내가 함께</small></div></div>` : ''}
    <div class="dy-bar"><div class="dy-seg"><button data-dysc="mine" aria-pressed="${mine}">내 현장</button><button data-dysc="all" aria-pressed="${!mine}">우리 모두</button></div>
      <div class="dy-mn"><button data-dymn="-1" aria-label="이전 달">‹</button><b>${m.getFullYear() !== new Date().getFullYear() ? m.getFullYear() + '. ' : ''}${m.getMonth()+1}월</b><button data-dymn="1" aria-label="다음 달">›</button></div></div>`;
  if (!d) return head + `<p class="dy-empty">불러오는 중…</p>`;
  if (!d.items.length) return head + `<div class="dy-empty"><b>${m.getMonth()+1}월엔 아직 기록이 없어요</b><br>${mine ? '현장을 다녀오면 여기에 하루씩 쌓여요<br>그동안 <button class="dy-lk" data-dysc="all">우리 모두의 기록</button>을 둘러보세요' : ''}</div>`;
  return head + `<div class="dy-tl">${d.items.map(it => { const dt = parse(it.date);
    return `<div class="dy-en"><div class="dy-dc"><b>${pad(dt.getDate())}</b><small>${DOWE[dt.getDay()]}</small></div>
      <article class="dy-cd"><div data-dyo="${it.id}">${cover(it)}</div>
        <div class="dy-bd"><h3 data-dyo="${it.id}">${esc(it.title)}</h3>
          <div class="dy-cr">${avs(it)}<span>${esc(names(it))}</span><em class="dy-st">No.${it.no}</em></div>
          <div class="dy-note"><i>오늘의 한마디</i>${esc(note(it))}</div>
          <div class="dy-rxs">${rxRow(it)}<button class="dy-cm" data-dyo="${it.id}">이야기 ${it.cm_n || 0} ›</button></div></div></article></div>`; }).join('')}</div>`;
}
function oneView(){
  const it = S.one;
  if (!it) return `<div class="dy-top"><button class="dy-x" data-dyback="1">‹</button></div><p class="dy-empty">불러오는 중…</p>`;
  const dt = parse(it.date), cm = it.comments || [];
  return `<div class="dy-one"><div class="dy-ot">${cover(it, true)}<button class="dy-x fl" data-dyback="1" aria-label="뒤로">‹</button></div>
    <div class="dy-sh"><div class="dy-ttl"><h2>${esc(it.title)}</h2><em class="dy-st">No.${it.no}</em></div>
      <div class="dy-meta">${dt.getFullYear()}. ${dt.getMonth()+1}. ${dt.getDate()} ${DOWK[dt.getDay()]}요일${it.photo_n ? ` · <button data-dyph="1">사진 ${it.photo_n}장 ›</button>` : ''}</div>
      <div class="dy-sec">함께한 사람</div><div class="dy-cr">${avs(it)}<span>${esc(names(it)) || '기록 없음'}</span></div>
      <div class="dy-note"><i>오늘의 한마디</i>${esc(note(it))}</div>
      <div class="dy-rxs">${rxRow(it, true)}</div>
      <div class="dy-sec">이야기 ${cm.length}</div>
      ${cm.length ? cm.map(c => `<div class="dy-c${c.mine ? ' me' : ''}${c.boss ? ' bs' : ''}"><span class="dy-av c${c.boss ? 'b' : c.mine ? 1 : 0}">${esc(short(c.name))}</span><p><b>${esc(c.name)}${c.role ? ' ' + esc(c.role) : ''}<i>${ago(c.at)}</i>${c.mine ? `<button data-dydel="${c.id}">지우기</button>` : ''}</b>${esc(c.body)}</p></div>`).join('')
        : `<p class="dy-nocm">첫 이야기를 남겨보세요 :)</p>`}
      <div style="height:90px"></div></div>
    <form class="dy-in" data-dyform="1"><input name="b" maxlength="300" placeholder="한마디 남기기…" autocomplete="off"><button>올리기</button></form></div>`;
}
function photosView(){
  const it = S.one, ps = (it && it.photos) || [];
  return `<div class="dy-top"><button class="dy-x" data-dyph="0" aria-label="뒤로">‹</button><span>${esc(it.title)} · 사진 ${ps.length}장</span></div>
    <div class="dy-grid">${ps.map((p,i) => `<img src="${esc(url(p))}" loading="lazy" alt="" data-dypv="${i}">`).join('')}</div>
    ${S.pv != null ? `<div class="dy-pv" data-dypv="x"><img src="${esc(url(ps[S.pv]))}" alt=""><button class="pr" data-dypv="${S.pv-1}" ${S.pv<=0?'disabled':''}>‹</button><button class="nx" data-dypv="${S.pv+1}" ${S.pv>=ps.length-1?'disabled':''}>›</button><span>${S.pv+1} / ${ps.length}</span></div>` : ''}`;
}
function draw(){
  if (!root) return;
  const y = S.view === 'feed' ? window.scrollY : 0;
  root.innerHTML = S.view === 'one' ? oneView() : S.view === 'ph' ? photosView() : feed();
}

/* ---------- 데이터 ---------- */
async function loadFeed(){
  S.data = null; draw();
  try { S.data = await O.rpc('staff_diary', {p_token:O.token, p_scope:S.scope, p_month:ymd(S.month)});
    // 처음 온 사람(교육생 등)은 내 기록이 없으니 '우리 모두'부터 보여줌
    if (!S.auto && S.scope === 'mine' && !S.data.mine_total) { S.auto = 1; S.scope = 'all'; S.data = await O.rpc('staff_diary', {p_token:O.token, p_scope:'all', p_month:ymd(S.month)}); } S.auto = 1; }
  catch(e){ S.data = {items:[], me:'', mine_total:0, month_mine:0, cheers:0, total:0, month_n:0}; O.toast && O.toast('잠시 후 다시 열어주세요'); }
  draw();
}
async function loadOne(id){
  try { S.one = await O.rpc('staff_diary_one', {p_token:O.token, p_job:+id}); } catch(_){ O.toast && O.toast('잠시 후 다시 열어주세요'); S.view = 'feed'; }
  draw();
}

/* ---------- 누르기 ---------- */
async function onClick(e){
  const t = e.target.closest('[data-dyx],[data-dysc],[data-dymn],[data-dyo],[data-dyrx],[data-dyback],[data-dyph],[data-dypv],[data-dydel]'); if (!t) return;
  const d = t.dataset;
  if (d.dyx){ close(); return; }
  if (d.dysc){ S.scope = d.dysc; loadFeed(); return; }
  if (d.dymn){ S.month = new Date(S.month.getFullYear(), S.month.getMonth() + (+d.dymn), 1); loadFeed(); return; }
  if (d.dyrx){ e.stopPropagation();
    const id = +d.j, upd = r => { [S.one, ...((S.data && S.data.items) || [])].forEach(x => { if (x && x.id === id) { x.rx = r.rx; x.my_rx = r.my_rx; } }); };
    try { const r = await O.rpc('staff_diary_react', {p_token:O.token, p_job:id, p_emoji:d.dyrx}); upd(r || {}); draw(); } catch(_){ O.toast && O.toast('잠시 후 다시 눌러주세요'); }
    return; }
  if (d.dyo){ S.view = 'one'; S.one = null; S.fy = window.scrollY; draw(); window.scrollTo(0,0); loadOne(d.dyo); return; }
  if (d.dyback){ S.view = 'feed'; draw(); window.scrollTo(0, S.fy || 0); return; }
  if (d.dyph != null && d.dyph !== undefined && t.hasAttribute('data-dyph')){ S.view = d.dyph === '1' ? 'ph' : 'one'; S.pv = null; draw(); window.scrollTo(0,0); return; }
  if (t.hasAttribute('data-dypv')){ const v = d.dypv; if (v === 'x' && e.target.tagName !== 'IMG' && e.target.tagName !== 'BUTTON') S.pv = null; else if (v !== 'x') S.pv = +v; draw(); return; }
  if (d.dydel){ if (!confirm('이 이야기를 지울까요?')) return;
    try { await O.rpc('staff_diary_comment_del', {p_token:O.token, p_id:+d.dydel}); loadOne(S.one.id); } catch(_){} return; }
}
async function onSubmit(e){
  if (!e.target.matches('[data-dyform]')) return; e.preventDefault();
  const inp = e.target.querySelector('input'), b = inp.value.trim(); if (!b || !S.one) return;
  inp.disabled = true;
  try { await O.rpc('staff_diary_comment', {p_token:O.token, p_job:S.one.id, p_body:b});
    const it = (S.data && S.data.items || []).find(x => x.id === S.one.id); if (it) it.cm_n = (it.cm_n||0) + 1;
    await loadOne(S.one.id); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50);
  } catch(_){ O.toast && O.toast('잠시 후 다시 올려주세요'); inp.disabled = false; }
}

function open(){
  if (!root) { root = document.createElement('div'); root.id = 'dy'; document.body.appendChild(root);
    root.addEventListener('click', onClick); root.addEventListener('submit', onSubmit);
    if (!document.getElementById('dy-font')) { const l = document.createElement('link'); l.id = 'dy-font'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Gowun+Batang:wght@400;700&display=swap'; document.head.appendChild(l); } }
  S.view = 'feed'; S.month = S.month || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  document.documentElement.classList.add('dy-on'); S.y0 = window.scrollY; window.scrollTo(0,0);
  markSeen(); W.news = 0; O.onChange && O.onChange();
  loadFeed();
}
function close(){ document.documentElement.classList.remove('dy-on'); if (root) root.innerHTML = ''; window.scrollTo(0, S.y0 || 0); O.onChange && O.onChange(); }
async function refresh(){
  try { W.news = await O.rpc('staff_diary_new', {p_token:O.token, p_since:seen()}) || 0; W.off = false; } catch(_){ W.news = 0; W.off = true; }
  O.onChange && O.onChange();
}
const W = window.EPDiary = { news:0, off:true, open, close, refresh, init(o){ O = o; refresh(); } };
})();
