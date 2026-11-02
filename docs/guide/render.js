const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('requestfailed',r=>{ if(!r.url().startsWith('http')) errs.push('fail '+r.url()); });
await p.goto('file:///home/claude/guide/guide.html',{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
await p.pdf({path:'/home/claude/guide/out.pdf',format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:0,bottom:0,left:0,right:0}});
console.log(errs);await b.close();})();
