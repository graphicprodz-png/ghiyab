const {chromium}=require('playwright');
const fs=require('fs');
const FONT=fs.readFileSync('/home/claude/guide/fontcss.css','utf8')+`
html,body,button,input,select,textarea,.sheet{font-family:"GE SS Two","Inter",sans-serif!important}`;
const OUT='/home/claude/guide/shots/';
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1180,height:820},deviceScaleFactor:2,timezoneId:'Africa/Algiers'});
await ctx.addInitScript(()=>{const T=new Date('2026-11-03T10:20:00+01:00').getTime();const R=Date;const off=T-R.now();class D extends R{constructor(...a){super(...(a.length?a:[R.now()+off]))} static now(){return R.now()+off}};window.Date=D;let calls={supported:true,sdk:34,inAvailable:true,outAvailable:true,inRole:true,outRole:true,blockIn:true,blockOut:true,autoReply:true,log:[{t:T-600000,type:'in',n:'+213661552210'},{t:T-3600000,type:'out',n:'0550123456'}]};
  const pl={send:async()=>({parts:1}),getSims:async()=>({sims:[{id:1,slot:0,carrier:'Mobilis',name:'Mobilis',isDefault:true},{id:2,slot:1,carrier:'Djezzy',name:'DJEZZY'}]}),keepAwake:async()=>{},getDeviceId:async()=>({id:'demo'}),
   checkBalance:async()=>({text:'Votre solde est de 1250,00 DA'}),getCallBlock:async()=>calls,setCallBlock:async o=>Object.assign(calls,o),requestCallRole:async()=>calls,getDeliveries:async()=>({d:{}}),print:async()=>{},saveFile:async()=>({}),shareFile:async()=>({})};
  window.Capacitor={isNativePlatform:()=>true,registerPlugin:()=>pl};});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/guide/app.html'); await p.addStyleTag({content:FONT}); await p.waitForTimeout(700);
const card=async(name,txt)=>{ await p.waitForTimeout(300); const l=p.locator('.card',{has:p.locator('h2',{hasText:txt})}).first(); await l.scrollIntoViewIfNeeded(); await l.screenshot({path:OUT+name+'.png'}); };

const shot=async(name,fn,opts={})=>{ if(fn) await p.evaluate(fn); await p.waitForTimeout(350); await p.evaluate(()=>window.scrollTo(0,0)); await p.screenshot({path:OUT+name+'.png',fullPage:!!opts.full}); };
await p.evaluate(()=>{LIC={st:'trial',left:30};view='session';render()}); await shot('23_setup');
// ---- seed
await p.evaluate(()=>{
  seedDemo();
  Object.assign(S.cfg,{school:"ثانوية عمر بن الخطاب",directorate:"المدية",schoolCode:"26012345",commune:"المدية",address:"حي 500 مسكن، المدية",schoolPhone:"025 58 12 34",director:"أحمد بن سالم",counselor:"سعاد مرزوق",attendanceOfficer:"كمال حداد",delayMin:15});
  const ph=["0661 23 45 67","0770 11 22 33","0550 99 88 77","0662 45 12 90","0771 30 40 50","0556 70 80 90"];
  S.students.forEach((s,i)=>{ s.phone=ph[i%6].replace(/(\d{4}) (\d{2}) (\d{2}) (\d{2})/,(m,a,b2,c,d)=>a+String((+b2+i)%90+10)+c+d).replace(/\s/g,""); });
  // history: last 3 weeks for all classes
  const today=todayStr();
  S.classes.forEach((c,ci)=>{ const st=classStudents(c.id);
    for(let d=1; d<22; d++){ const date=addDays(today,-d); const dow=new Date(date+"T12:00:00").getDay(); if(![0,1,2,3,4].includes(dow)) continue; if(calOn(date)&&calOn(date).type==="holiday") continue;
      slotsOn(date,c.id).forEach((x,k)=>{ const id=x.sid; S.sessions.push({id,slotId:x.slotId,classId:c.id,subject:x.subject,teacher:x.teacher,date,from:x.from,to:x.to,roster:st.map(s=>s.id),savedAt:Date.now(),notes:"",createdAt:0});
        st.forEach((s,i)=>{ if((i*13+d*7+k*5+ci*3)%29===0) S.absences.push({id:id+"_"+s.id,sessionId:id,studentId:s.id,studentName:s.name,code:s.code,classId:c.id,className:c.name,subject:x.subject,teacher:x.teacher,date,from:x.from,to:x.to,createdAt:0,notifyAt:0,status:"sent",channel:"sms",via:"شريحة 1 (Mobilis)",sentAt:Date.now()-d*86400000,justified:(i+d)%5===0,reason:(i+d)%5===0?"مرض (شهادة طبية)":""}); });
      }); }
  });
  // today: earlier periods saved for all classes, 08:00 & 09:00
  S.classes.forEach((c,ci)=>{ const st=classStudents(c.id); slotsOn(today,c.id).filter(x=>x.from<"10:00").forEach((x,k)=>{ S.sessions.push({id:x.sid,slotId:x.slotId,classId:c.id,subject:x.subject,teacher:x.teacher,date:today,from:x.from,to:x.to,roster:st.map(s=>s.id),savedAt:Date.now()-3600000,notes:""});
     st.forEach((s,i)=>{ if((i+k+ci)%9===0) S.absences.push({id:x.sid+"_"+s.id,sessionId:x.sid,studentId:s.id,studentName:s.name,code:s.code,classId:c.id,className:c.name,subject:x.subject,teacher:x.teacher,date:today,from:x.from,to:x.to,createdAt:Date.now()-3600000,notifyAt:Date.now()-2700000,status:i%4===0?"waiting":"sent",channel:"sms",via:i%2?"شريحة 2 (Djezzy)":"شريحة 1 (Mobilis)",sentAt:Date.now()-2600000}); }); }); });
  // current period: 1 class saved
  const c0=S.classes.find(c=>c.level==="1 ثانوي"); const x0=slotsOn(today,c0.id).find(x=>x.from==="10:00"); const st0=classStudents(c0.id);
  S.sessions.push({id:x0.sid,slotId:x0.slotId,classId:c0.id,subject:x0.subject,teacher:x0.teacher,date:today,from:x0.from,to:x0.to,roster:st0.map(s=>s.id),savedAt:Date.now()-120000,notes:""});
  [2,7].forEach(i=>{ const s=st0[i]; S.absences.push({id:x0.sid+"_"+s.id,sessionId:x0.sid,studentId:s.id,studentName:s.name,code:s.code,classId:c0.id,className:c0.name,subject:x0.subject,teacher:x0.teacher,date:today,from:x0.from,to:x0.to,createdAt:Date.now()-120000,notifyAt:Date.now()+780000,status:"waiting",attempts:0}); });
  S.cfg.simsCache=[{id:1,slot:0,carrier:"Mobilis",name:"Mobilis",isDefault:true},{id:2,slot:1,carrier:"Djezzy",name:"DJEZZY",isDefault:false}];
  S.cfg.simMap={mobilis:1,djezzy:2}; S.cfg.lastBackup=Date.now()-3600000; S.cfg.autoBackup=true; S.cfg.lastAutoBackup=Date.now()-1800000;
  S.cfg.calendar.push({id:"ex1",type:"exam",name:"اختبارات الفصل الأول",from:"2026-12-06",to:"2026-12-10"},{id:"hw",type:"holiday",name:"عطلة الشتاء",from:"2026-12-18",to:"2027-01-03"},{id:"sp1",type:"special",name:"توقيت رمضان",from:"2027-02-08",to:"2027-03-09",periods:Object.fromEntries(S.cfg.periods.map((p,i)=>[p.id,{from:addHM("08:30",i*50),to:addHM("08:30",i*50+45)}]))});
  const sid=n=>(S.subjects.find(x=>x.name===n)||{}).id;
  S.exams.push({id:"e1",calId:"ex1",date:"2026-12-06",from:"08:00",to:"10:00",subjectId:sid("الرياضيات"),target:"lv:3 ثانوي",supervisor:"كريم سعدي"},{id:"e2",calId:"ex1",date:"2026-12-06",from:"10:30",to:"12:30",subjectId:sid("اللغة العربية"),target:"lv:3 ثانوي",supervisor:"نادية حمدي"},{id:"e3",calId:"ex1",date:"2026-12-07",from:"08:00",to:"10:00",subjectId:sid("العلوم الفيزيائية"),target:"all",supervisor:"سمير بلعيد"});
  saveLocal(); flashMsg=null;
});
await p.evaluate(()=>{LIC={st:'ok',exp:20271103,left:365}; S.absences.forEach(a=>{if(a.status==='sent'){a.dlr='ok';a.dlrAt=a.sentAt+40000}}); S.cfg.autoSms=true;S.cfg.testSent=1;S.cfg.setupHidden=true;S.cfg.bellOn=true;S.cfg.autoBalance=true;S.cfg.lateSms=true; S.cfg.balances={'1':{txt:'Votre solde est de 1250,00 DA',amt:1250,at:Date.now()-7200000,code:'*222#'},'2':{txt:'Solde: 860,00 DA',amt:860,at:Date.now()-7200000,code:'*710#'}}; saveLocal();});
const c3=await p.evaluate(()=>S.classes.find(c=>c.name.includes("3 ثانوي — قسم 2")).id);
await shot('01_home',()=>{view='session';homeLevel='3 ثانوي';homeClass=S.classes.find(c=>c.name.includes("قسم 2")).id;flashMsg=null;render()});
await shot('02_week',()=>{view='week';render()});
await shot('03_day',()=>{view='day';render()});
await p.evaluate(()=>{ const x=slotsOn(todayStr(),homeClass).find(z=>z.from==="10:00"); openSlot(x.key); });
await p.evaluate(()=>{ const r=attRoster(); att.absent.add(r[1].id); att.absent.add(r[5].id); att.late.set(r[3].id,'10:12'); render(); });
await shot('04_roster');
await p.evaluate(()=>{ saveAttendance(); });
await p.waitForTimeout(300); await p.screenshot({path:OUT+'05_saved.png'});
await shot('06_round',()=>{closeModal();roundPid=null;view='round';render()});
await shot('07_notifs',()=>{view='notifs';render()});
await shot('08_report_class',()=>{view='reports';rp.type='class';rp.range='month';rp.cls=S.classes.find(c=>c.name.includes("قسم 2")).id;zoom=0;render()});
await shot('09_report_warn',()=>{S.cfg.warn1=2;S.cfg.warn2=4;rp.type='warn';rp.range='month';render()});
await p.evaluate(()=>{S.cfg.warn1=6;S.cfg.warn2=12;});
await shot('10_sheet',()=>{ const id=S.sessions.find(x=>x.date===todayStr()&&x.from==="08:00"&&x.classId===homeClass).id; openReport(id); });
await shot('11_set_school',()=>{view='settings';setTab='school';render()});
await shot('12_set_msg',()=>{setTab='msg';render()});
await shot('13_set_sms',()=>{setTab='sms';render()});
await shot('14_set_cal',()=>{setTab='cal';calOpen='ex1';render()});
await shot('15_set_data',()=>{setTab='data';render()});
await shot('16_students',()=>{view='students';selClass=S.classes.find(c=>c.name.includes("قسم 2")).id;render()});
await shot('17_timetable',()=>{view='timetable';ttClass=S.classes.find(c=>c.name.includes("قسم 2")).id;render()});
await shot('18_about',()=>{view='settings';setTab='about';render()});
await shot('19_sessions',()=>{view='sessions';sessDate=addDays(todayStr(),-1);sessClass='';render()});
await shot('20_staff',()=>{view='staff';render()});
await shot('22_labels',()=>{view='labels';labelClass=S.classes.find(c=>c.name.includes("قسم 2")).id;render()});
await p.evaluate(()=>{S.cfg.appPin=pinHash("2468");showLock();});
await p.waitForTimeout(300); await p.screenshot({path:OUT+'21_lock.png'});

await shot('24_credit',()=>{S.cfg.creditAlert={sims:["2"],at:Date.now()};S.cfg.balances["2"]={txt:"Votre solde est de 0,00 DA",amt:0,at:Date.now(),code:"*710#"};S.cfg.appPin="";document.getElementById('lock').classList.add('hide');locked=false;view='session';render()});
await p.evaluate(()=>{S.cfg.creditAlert=null;S.cfg.balances["2"]={txt:"Solde: 860,00 DA",amt:860,at:Date.now()-7200000,code:"*710#"};});
await p.evaluate(()=>{view='settings';setTab='sms';CALLS=null;render()}); await p.waitForTimeout(400);
await card('25_credit','رصيد الشرائح'); await card('26_calls','حجب المكالمات');
await p.evaluate(()=>{setTab='time';render()}); await card('27_bell','جرس بداية الحصص');
await p.evaluate(()=>{setTab='msg';render()}); await card('28_late_msg','رسالة التأخر');
await p.evaluate(()=>{LIC={st:'trial',left:12};setTab='about';render()}); await card('29_lic','الترخيص');
await p.evaluate(()=>{LIC={st:'ok',exp:20271103,left:365};setTab='data';render()}); await card('30_merge','عدة طابليتات');
await shot('31_consent',()=>{openConsent(S.classes.find(c=>c.name.includes("قسم 2")).id)});
await p.evaluate(()=>{view='students';selClass=S.classes.find(c=>c.name.includes("قسم 2")).id;render();renumberDlg(selClass);document.getElementById('rnPre').value='3S2-';document.getElementById('rnPad').value='2';document.getElementById('rnPre').oninput()});
await p.waitForTimeout(300); await p.screenshot({path:OUT+'32_renumber.png'}); await p.evaluate(()=>closeModal());
console.log(errs);
await b.close();})();
