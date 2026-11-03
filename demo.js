// ?demo 로 열면 서버 없이 예시 데이터로 화면 확인
(function(){
  if (!new URLSearchParams(location.search).has('demo')) return;
  const pad = n => String(n).padStart(2,'0');
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const day = n => { const d = new Date(d0); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const S = {
    v:2,
    me:{id:'me',name:'김지원',team:'OPS',team_name:'클린 직영',role:'팀원',can_collect:false,pay_type:'freelance33'},
    boss:{state:'휴가중',memo:'급한 건 신봉진 실장',until:new Date(Date.now()+86400000*3).toISOString()},
    avail:{[day(1)]:'ok',[day(3)]:'ok',[day(5)]:'no'},
    events:[{id:1,date:day(1),time:'15:00',kind:'개인',maemul:null,title:'병원',memo:null,show_boss:false,gcal:true}],
    today: day(0),
    jobs:[
      {id:1,date:day(0),time:'08:00',title:'수영구 광안동 아파트 이사청소',kind:'이사청소',headcount:3,public_note:'장비 사무실에서 챙겨가기',status:'full',team:'OPS',approved:3,crew:['김준호','김지원','김효정'],my_status:'approved',address:'부산 수영구 광안동 협성에코펠리스 103동',private_note:'공동현관 #1234',need_ack:true,collector:false,balance:null,collected_at:null,my_pay:null,live:'DEMO',photos:3,work_done:null},
      {id:2,date:day(2),time:'07:00',title:'해운대 센텀 사무실 정기청소',kind:'정기',headcount:2,public_note:null,status:'open',team:'OPS',approved:1,crew:['신봉진'],my_status:null,address:null,private_note:null,need_ack:false,collector:false,balance:null,collected_at:null,my_pay:null},
      {id:3,date:day(2),time:'13:00',title:'연제구 연산동 입주청소 24평',kind:'입주청소',headcount:2,public_note:null,status:'open',team:'OPS',approved:0,crew:[],my_status:'applied',address:null,private_note:null,need_ack:false,collector:false,balance:null,collected_at:null,my_pay:null},
      {id:6,date:day(1),time:'08:00',title:'창원 성산구 포레나대원 이사청소 35평',kind:'이사청소',headcount:3,public_note:'방3·화2·베2 · 김치냉장고 포함 · 에어컨 제외',status:'open',team:'PRT',approved:1,crew:['이정모','외부 홍길동','대표'],crew_info:[{name:'홍길동',phone:'010-1111-1111',kind:'ext'},{name:'대표',phone:'010-0000-0000',kind:'boss'},],my_status:'approved',address:'경남 창원시 성산구 창원천로 34',private_note:null,need_ack:false,collector:true,cust_name:'고객',cust_phone:'01000000000',balance:350000,collected_at:null,my_pay:null,live:'DEMO',cust_room:null,photos:0,extras:[]},
      {id:4,date:day(4),time:'09:00',title:'남구 대연동 상가 준공청소',kind:'상가',headcount:4,public_note:'4인 현장 · 사다리 필요',status:'open',team:'OPS',approved:2,crew:['김준호','나미정'],my_status:null,address:null,private_note:null,need_ack:false,collector:false,balance:null,collected_at:null,my_pay:null},
      {id:5,date:day(-3),time:'08:00',title:'동래 온천동 헬스장 준공청소',kind:'상가',headcount:4,public_note:null,status:'done',team:'OPS',approved:4,crew:['김준호','김지원','김효정','서은호'],my_status:'approved',address:'동래구 온천동',private_note:null,need_ack:false,collector:false,balance:null,collected_at:null,my_pay:130000}
    ],
    notices:[
      {id:1,title:'11월부터 일정판으로 신청 받아요',body:'카카오워크와 한 달 같이 써요.\n신청은 일정판에서, 대화는 카톡 채널로 해주세요.',important:true,team:null,at:new Date().toISOString(),read:false,confirmed:false},
      {id:2,title:null,body:'토요일 현장은 6시 정각 출발이에요.',important:false,team:'OPS',at:new Date(Date.now()-86400000*2).toISOString(),read:true,confirmed:false}
    ]
  };
  if (new URLSearchParams(location.search).get('demo') === 'res') {   // 부동산 직원 미리보기
    S.me = {id:'me',name:'조원경',team:'RES',team_name:'리츠부동산',role:'소장',can_collect:true,pay_type:'none'};
    S.jobs = []; S.avail = {[day(0)]:'work:09:00-18:00',[day(1)]:'work:13:00-18:00',[day(2)]:'work:09:00-18:00',[day(3)]:'no'};
    S.events = [{id:1,date:day(0),time:'13:00',kind:'안내',maemul:'2610-투001',title:'연산동 투룸',memo:null,show_boss:true,gcal:false},{id:2,date:day(0),time:'16:00',kind:'계약',maemul:null,title:'양정동 원룸 계약서 작성',memo:null,show_boss:true,gcal:false}];
    S.team_work = [[0,'조원경','work','09:00-18:00'],[0,'김윤미','work','13:00-18:00'],[0,'조수광','no',null],[1,'조원경','work','13:00-18:00'],[1,'조수광','work','09:00-18:00'],[2,'조원경','work','09:00-18:00'],[2,'김윤미','work','09:00-18:00'],[2,'조수광','work','10:00-19:00'],[3,'조원경','no',null]].map(([d,name,kind,memo]) => ({day:day(d),name,kind,memo}));
  }
  window.EP_DEMO = { rpc: async (fn, a) => {
    await new Promise(r=>setTimeout(r,120));
    const j = id => S.jobs.find(x=>x.id===id);
    if (fn==='staff_board') return JSON.parse(JSON.stringify(S));
    if (fn==='staff_apply'){ j(a.p_job).my_status='applied'; return 'applied'; }
    if (fn==='staff_cancel'){ const x=j(a.p_job); if (x.my_status==='approved'){x.approved--; x.crew=x.crew.filter(n=>n!==S.me.name); x.status='open';} x.my_status='cancelled'; return 'ok'; }
    if (fn==='staff_ack'){ j(a.p_job).need_ack=false; return 'ok'; }
    if (fn==='staff_add_extra'){ const x=j(a.p_job); x.extras=(x.extras||[]).concat([{name:a.p_name,amount:a.p_amount,notice:'site',agreed:true,by:S.me.id,by_name:S.me.name}]); return 'ok'; }
    if (fn==='staff_del_extra'){ j(a.p_job).extras.splice(a.p_idx,1); return 'ok'; }
    if (fn==='staff_set_avail'){ a.p_days.forEach(d => { if (a.p_kind==='clear') delete S.avail[d]; else S.avail[d] = a.p_kind==='work' ? 'work:'+a.p_memo : a.p_kind; }); return 'ok'; }
    if (fn==='staff_collect'){ j(a.p_job).collected_at=new Date().toISOString(); return 'ok'; }
    if (fn==='staff_notice_read'){ S.notices.forEach(n=>n.read=true); return 'ok'; }
    if (fn==='staff_notice_confirm'){ S.notices.find(n=>n.id===a.p_id).confirmed=true; return 'ok'; }
    if (fn==='staff_report') return 1;
    if (fn==='staff_pay') return {pay_type:'freelance33', items:[{date:day(-3),title:'동래 온천동 헬스장 준공청소',base:120000,extra:10000,amount:130000,memo:null,paid:false}]};
    if (fn==='staff_event_save'){ const e={id:a.p_id||Date.now(),date:a.p_date,time:a.p_time,kind:a.p_kind,maemul:a.p_maemul,title:a.p_title,memo:a.p_memo,show_boss:a.p_show_boss,gcal:a.p_gcal}; S.events=S.events.filter(x=>x.id!==e.id).concat(e); return e.id; }
    if (fn==='staff_event_delete'){ S.events=S.events.filter(x=>x.id!==a.p_id); return 'ok'; }
    if (fn==='staff_live_target') return 'DEMO';
    if (fn==='staff_job_photo') return a.p_paths.length;
    if (fn==='staff_work_done'){ j(a.p_job).work_done=new Date().toISOString(); return 'ok'; }
    return null;
  }};
})();
