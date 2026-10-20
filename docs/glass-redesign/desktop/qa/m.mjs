import { chromium } from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
for (const [n,u] of [['home','/'],['download','/download']]){await p.goto('https://descall.com'+u,{waitUntil:'networkidle'});await p.waitForTimeout(1500);
const r=await p.evaluate(()=>({ov:document.documentElement.scrollWidth-innerWidth,btn:[...document.querySelectorAll('a,button')].filter(e=>e.offsetHeight>0&&/başla|İndir|indir/i.test(e.textContent)).map(e=>e.offsetHeight).slice(0,6)}));
console.log(n,JSON.stringify(r));await p.screenshot({path:`/workspace/qa/m-${n}.png`});}
await b.close();
