import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs";
const require=createRequire("/workspace/queue-mobile-lists/harness/");
const { chromium, webkit } = require("playwright-core");
const srv=http.createServer((q,s)=>{const f=q.url.includes("mf.js")?"mf.js":"page.html";s.setHeader("content-type",f.endsWith("js")?"text/javascript":"text/html");s.end(fs.readFileSync(f))});await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${srv.address().port}/`;
async function scenario(browser,mode,{suspend=false,midSuspend=false}={}){
  const mk=async()=>{const c=await browser.newContext({permissions:["microphone"]});const p=await c.newPage();await p.goto(url);await p.evaluate(()=>{makePc()});return p};
  const A=await mk(),B=await mk();
  await A.evaluate(([m,s])=>startSender(m,s),[mode,suspend]);
  await B.evaluate(()=>{pc.addTransceiver("audio",{direction:"recvonly"})});
  const off=await A.evaluate(async()=>{const o=await pc.createOffer();await pc.setLocalDescription(o);return {type:o.type,sdp:o.sdp}});
  const ans=await B.evaluate(async o=>{await pc.setRemoteDescription(o);const a=await pc.createAnswer();await pc.setLocalDescription(a);return {type:a.type,sdp:a.sdp}},off);
  await A.evaluate(async a=>{await pc.setRemoteDescription(a)},ans);
  await new Promise(r=>setTimeout(r,800));
  for(const[x,y]of[[A,B],[B,A]]){for(const c of await x.evaluate(()=>cands))await y.evaluate(async c=>{await pc.addIceCandidate(c)},c)}
  if(midSuspend){await new Promise(r=>setTimeout(r,1500));await A.evaluate(()=>{window.__noResume=true;return ctx.suspend().then(()=>{})})}
  await new Promise(r=>setTimeout(r,6000));
  const s=await A.evaluate(()=>stats()), r=await B.evaluate(()=>rxStats());
  const a1=r.bytesReceived; await new Promise(r=>setTimeout(r,1500)); const r2=await B.evaluate(()=>rxStats());
  const fb=await A.evaluate(()=>({fallback:window.fallback,ctx:ctx.state}));
  await A.context().close();await B.context().close();
  return {...s,...r2,receivedLast1500ms:r2.bytesReceived-a1,...fb};
}
const args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required","--disable-features=WebRtcHideLocalIpsWithMdns"];
const out={};
for(const[name,launch]of[["chromium",()=>chromium.launch({executablePath:"/usr/bin/google-chrome",args})],["webkit",()=>webkit.launch()]]){
  let b; try{b=await launch()}catch(e){out[name]="launch failed: "+e.message.split("\n")[0];continue}
  b._name=name;
  for(const [label,mode,opt] of [["normal-old","old",{}],["normal-new","new",{}],["suspended-old","old",{suspend:true}],["suspended-new","new",{suspend:true}],["suspended-mid-call-old","old",{midSuspend:true}],["suspended-mid-call-new","new",{midSuspend:true}]]){
    try{out[`${name} ${label}`]=await scenario(b,mode,opt)}catch(e){out[`${name} ${label}`]="error: "+e.message.split("\n")[0]}
  }
  await b.close();
}
console.log(JSON.stringify(out,null,1));srv.close();
