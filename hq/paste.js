/* 예약글(계약서) 붙여넣기 → 클린 현장 칸 자동 채우기
   리츠 계약서 양식(◈ 항목 : 값) 기준. 양식이 조금 달라도 날짜·시간·금액·주소는 최대한 찾아요. */
(function(H){
const won = s => { if (!s) return null; s = String(s).replace(/,/g,'');
  let m = s.match(/(\d+(?:\.\d+)?)\s*만\s*(\d+)?\s*천?/); if (m) return Math.round(parseFloat(m[1])*10000 + (m[2] ? +m[2]*1000 : 0));
  m = s.match(/(\d{4,})\s*원?/); return m ? +m[1] : null; };
const after = (t, keys) => { for (const k of keys) { const m = t.match(new RegExp(k + '\\s*[:：]\\s*([^\\n]*)')); if (m && m[1].trim()) return m[1].trim(); } return ''; };
H.parseOrder = (raw) => {
  const t = String(raw || '').replace(/\r/g,'').replace(/[ \t]+/g,' ');
  const o = {}, memo = [];
  // 날짜
  let m = t.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || t.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (m) o.job_date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  else { m = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/); if (m) { const now = new Date(); let y = now.getFullYear(); if (+m[1] < now.getMonth()+1 - 6) y++; o.job_date = `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`; } }
  // 시간
  const tl = after(t, ['시작 ?시간','시간']) || (t.match(/(오전|오후|아침|저녁)\s*\d{1,2}\s*시[^\n]*/)||[''])[0];
  m = tl.match(/(오전|오후|아침|저녁)?\s*(\d{1,2})\s*(?:시|:)\s*(\d{1,2})?\s*(?:분|반)?/);
  if (m) { let h = +m[2], mi = m[3] ? +m[3] : (/반/.test(tl) ? 30 : 0); if ((m[1]==='오후'||m[1]==='저녁') && h < 12) h += 12; o.start_time = `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`; }
  // 주소: '서비스 주소' 다음 줄 또는 같은 줄
  m = t.match(/주소\s*[:：]?\s*\n?\s*([^\n◈]+)/); if (m) o.address = m[1].trim();
  // 종류 · 타입 · 평형
  const kind = after(t, ['서비스 종류','종류']).replace(/\s/g,''); if (kind) o.kind = kind;
  const typ = after(t, ['서비스 타입','타입','건물']);
  const py = (after(t, ['서비스 평형','평형','평수']).match(/(\d+(?:\.\d+)?)/)||[])[1];
  // 지역: 주소에서 구·동
  let area = '';
  if (o.address) { const a = o.address.replace(/^(부산광역시|부산시|부산)\s*/,''); const g = a.match(/(\S+[구군])\s+(\S+?[동읍면리가])(?=\s|\d|$)/); area = g ? `${g[1]} ${g[2]}` : a.split(' ').slice(0,2).join(' '); }
  o.title = [area, typ, kind, py ? py + '평' : ''].filter(Boolean).join(' ');
  if (py) o.headcount = +py <= 20 ? 2 : +py <= 32 ? 3 : 4;
  // 구조 → 팀 공개 메모
  const rooms = after(t, ['방 ?개수']), bath = after(t, ['화장실 ?개수']), ver = after(t, ['베란다 ?개수']);
  const pub = [rooms && rooms.replace(/\s+/g,''), bath && '화장실 ' + bath.replace(/\s+/g,''), ver && '베란다 ' + ver.replace(/\s+/g,'')].filter(Boolean);
  if (/주차비/.test(t)) pub.push('주차비 별도');
  if (pub.length) o.public_note = pub.join(' · ');
  // 금액
  const tot = after(t, ['계약 ?금액','총 ?금액','금액']); o.total_amount = won(tot);
  m = t.match(/예약금\s*[:：]?\s*([\d,.]+\s*만?\s*원?)/); o.deposit_amount = m ? won(m[1]) : null;
  if (o.total_amount != null) o.balance_amount = o.total_amount - (o.deposit_amount || 0);
  if (/현금가/.test(tot)) memo.push('현금가');
  if (/VAT|부가세/.test(t)) memo.push('카드·현금영수증 시 VAT 10% 별도');
  // 고객 (관리 메모에만 · 직원에게 안 보임)
  const nm = after(t, ['고객님? ?성함','성함','고객명']).replace(/\s*님$/,''), ph = after(t, ['고객님? ?연락처','연락처']);
  if (nm) o.cust_name = nm; if (ph) o.cust_phone = (ph.match(/0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}/)||[ph])[0].replace(/[\s.]/g,'-');
  if ((nm || ph) && H.S && H.S.needV19) memo.unshift(`고객 ${[nm, ph].filter(Boolean).join(' ')}`);   // 업데이트 전엔 메모로
  if (memo.length) o.admin_memo = memo.join(' · ');
  return o;
};
const LABEL = {job_date:'날짜', start_time:'시간', title:'현장 이름', kind:'종류', headcount:'인원', address:'주소', public_note:'구조 메모', total_amount:'계약 금액', deposit_amount:'예약금', balance_amount:'잔금', admin_memo:'메모', cust_name:'고객 이름', cust_phone:'고객 전화'};
H.ACT.jobPaste = () => {
  const f = document.querySelector('#sheet form[data-f="job"]'), ta = document.getElementById('jpaste'), out = document.getElementById('jpaste-out');
  if (!f || !ta) return;
  if (!ta.value.trim()) { out.textContent = '예약글을 먼저 붙여넣어 주세요'; return; }
  const o = H.parseOrder(ta.value), got = [];
  Object.entries(o).forEach(([k, v]) => { const el = f.elements[k]; if (!el || v == null || v === '') return; el.value = v; el.classList.add('filled'); got.push(LABEL[k] || k); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); });
  if (!f.querySelector('[name="teams"]:checked')) { const ops = f.querySelector('[name="teams"][value="OPS"]'); if (ops) ops.checked = true; }
  out.innerHTML = got.length ? `✅ 채웠어요: ${got.join(' · ')}<br><small>인원은 평수로 넣은 추천값이에요. 확인하고 [올리기]만 누르면 돼요.</small>` : '찾은 내용이 없어요. 양식을 확인해 주세요.';
  const d = ta.closest('details'); if (d && got.length) d.open = false;
};
})(window.HQ);
