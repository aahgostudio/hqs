/* 어닝플레이스 일정판 → 구글 캘린더 (10분마다 추가·수정·삭제까지 맞춤)
   1) 아래 ICS_URL 따옴표 안에 HQ 홈의 [구독 주소 복사] 주소를 붙여넣기
   2) 위 함수 고르는 칸에서 setup 고르고 ▶ 실행 → 권한 허용 (처음 한 번)  */
const ICS_URL = '여기에_구독_주소_붙여넣기';
const CAL_NAME = '어닝플레이스 일정판';
const SB_URL = 'https://ldvknvmsnpbporxhnsli.supabase.co/rest/v1/rpc/boss_ics';
const SB_KEY = 'sb_publishable_7MeTgyPzwzK47RKG-mUapQ_K5ngrTw5';

function sync() {
  const m = ICS_URL.match(/[?&]ics=([^&]+)/); if (!m) throw new Error('ICS_URL에 구독 주소를 넣어주세요');
  const res = UrlFetchApp.fetch(SB_URL, {method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY}, payload: JSON.stringify({p_key: decodeURIComponent(m[1])})});
  if (res.getResponseCode() !== 200) throw new Error(res.getContentText());
  const items = JSON.parse(res.getContentText()).items || [];
  const cal = CalendarApp.getCalendarsByName(CAL_NAME)[0] || CalendarApp.createCalendar(CAL_NAME, {timeZone: 'Asia/Seoul', color: CalendarApp.Color.BLUE});
  const from = new Date(Date.now() - 61 * 864e5), to = new Date(Date.now() + 122 * 864e5);
  const have = {};
  cal.getEvents(from, to).forEach(ev => { const u = ev.getTag('uid'); if (!u) return; if (have[u]) ev.deleteEvent(); else have[u] = ev; });
  const want = {};
  items.forEach(it => {
    want[it.uid] = 1;
    const sig = [it.date, it.time || '', it.dur || 60, it.title].join('|'), ev = have[it.uid];
    if (ev && ev.getTag('sig') === sig) return;          // 그대로면 건드리지 않음
    if (ev) ev.deleteEvent();                             // 바뀌었으면 지우고 새로
    let ne;
    if (it.time) { const s = new Date(it.date + 'T' + it.time + ':00+09:00'); ne = cal.createEvent(it.title, s, new Date(s.getTime() + (it.dur || 60) * 6e4)); }
    else ne = cal.createAllDayEvent(it.title, new Date(it.date + 'T12:00:00+09:00'));
    ne.setTag('uid', it.uid); ne.setTag('sig', sig);
  });
  Object.keys(have).forEach(u => { if (!want[u]) have[u].deleteEvent(); });   // 일정판에서 지운 건 캘린더에서도 지움
  try { blogSync(decodeURIComponent(m[1])); } catch (e) { console.log('blog: ' + e); }
}

/* 청소 블로그 새 글 → 홍보 진행표 '블로그 ✓' 자동 체크 */
function blogSync(key) {
  const xml = UrlFetchApp.fetch('https://rss.blog.naver.com/landys_earningplace.xml', {muteHttpExceptions: true}).getContentText();
  const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item').slice(0, 20);
  const posts = items.map(it => ({title: it.getChildText('title'), url: String(it.getChildText('link')).split('?')[0],
    date: Utilities.formatDate(new Date(it.getChildText('pubDate')), 'Asia/Seoul', 'yyyy-MM-dd')}));
  const res = UrlFetchApp.fetch(SB_URL.replace('boss_ics', 'promo_blog_sync'), {method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY}, payload: JSON.stringify({p_key: key, p_posts: posts})});
  console.log('blog: ' + res.getContentText());
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
  sync();
}
