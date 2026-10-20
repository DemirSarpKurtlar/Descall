import puppeteer from "puppeteer-core";
const [,, label, fmtp, loss, red="1", jb="0"] = process.argv;
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream","--disable-features=WebRtcHideLocalIpsWithMdns","--allow-loopback-in-peer-connection",
   `--force-fieldtrials=WebRTC-FakeNetworkSendConfig/loss_percent:${loss},avg_delay_ms:40,delay_std_dev_ms:15/`] });
import dgram from "dgram";
const LOSS = Number(loss)/100; let peerC = null, peerA = null;
const front = dgram.createSocket("udp4"), back = dgram.createSocket("udp4");
await new Promise(r => front.bind(0, "172.30.0.2", r)); await new Promise(r => back.bind(0, "172.30.0.2", r));
const jit = () => 40 + Math.random()*30; // delay 40-70ms -> jitter
const isMedia = m => m.length > 0 && (m[0] & 0xc0) === 0x80; // RTP/RTCP only; STUN/DTLS pass
front.on("message", (m, ri) => { peerA = ri; if (!peerC) return; if (isMedia(m) && Math.random() < LOSS) return; setTimeout(() => back.send(m, peerC.port, peerC.address), isMedia(m) ? jit() : 0); });
back.on("message", (m) => { if (!peerA) return; if (isMedia(m) && Math.random() < LOSS) return; setTimeout(() => front.send(m, peerA.port, peerA.address), isMedia(m) ? jit() : 0); });
const p = await b.newPage();
await p.exposeFunction("relayFor", (ip, port) => { peerC = { address: ip, port: Number(port) }; return front.address().port; }); await p.goto("http://127.0.0.1:8977/");
const r = await p.evaluate(async (fmtp, cfg) => {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
  const a = new RTCPeerConnection({iceServers:[{urls:"stun:172.30.0.2:3478"}]}), c = new RTCPeerConnection({iceServers:[{urls:"stun:172.30.0.2:3478"}]});
  const done = pc => new Promise(r => { const t=setTimeout(r,8000); const f=()=>{ if (pc.iceGatheringState==="complete" && /172\.30\.0\.2 \d+ typ/.test(pc.localDescription.sdp)) { clearTimeout(t); r(); } }; pc.addEventListener("icegatheringstatechange", f); pc.addEventListener("icecandidate", f); f(); });
  s.getTracks().forEach(t => a.addTrack(t, s));
  if (cfg.red === "1") { const caps = RTCRtpSender.getCapabilities("audio").codecs; const rk = c => c.mimeType.toLowerCase()==="audio/red"?0:c.mimeType.toLowerCase()==="audio/opus"?1:2; a.getTransceivers()[0].setCodecPreferences([...caps].sort((x,y)=>rk(x)-rk(y))); }
  let got; c.ontrack = e => { if (+cfg.jb) e.receiver.jitterBufferTarget = +cfg.jb; got = new Audio(); got.srcObject = e.streams[0]; got.muted = true; got.play().catch(()=>{}); };
  const tune = sdp => sdp.replace(/a=fmtp:(\d+) minptime=10;useinbandfec=1/g, (m, pt) => `a=fmtp:${pt} ${fmtp}`);
  const o = await a.createOffer(); o.sdp = tune(o.sdp); await a.setLocalDescription(o); await done(a); await c.setRemoteDescription(a.localDescription);
  const an = await c.createAnswer(); an.sdp = tune(an.sdp); await c.setLocalDescription(an); await done(c);
  let sdpC = c.localDescription.sdp.split(/\r\n/).filter(l => !l.startsWith("a=candidate") || (/ udp /i.test(l) && l.includes(" 172.30.0.2 "))).slice();
  const ci = sdpC.findIndex(l => l.startsWith("a=candidate")); const parts = sdpC[ci].split(" ");
  parts[5] = String(await window.relayFor(parts[4], parts[5])); sdpC = sdpC.filter(l => !l.startsWith("a=candidate")); sdpC.splice(ci, 0, parts.join(" "));
  await a.setRemoteDescription({ type: "answer", sdp: sdpC.join("\r\n") });
  await new Promise(r => setTimeout(r, 20000)); if (!0) { const st=[]; (await c.getStats()).forEach(x=>st.push(x.type)); window.__dbg = {cands:(a.localDescription.sdp.match(/a=candidate.*/g)||[]).slice(0,4), cst:c.connectionState,ice:c.iceConnectionState, st:[...new Set(st)], sdp:o.sdp.match(/a=fmtp.*opus.*|a=fmtp:111.*/g)}; }
  if(!0){} let inb, out; (await c.getStats()).forEach(x => { if (x.type==="inbound-rtp" && x.kind==="audio") inb = x; });
  (await a.getStats()).forEach(x => { if (x.type==="outbound-rtp" && x.kind==="audio") out = x; });
  if(!inb) return {dbg: window.__dbg}; return { lost: inb.packetsLost, recv: inb.packetsReceived, jitter: inb.jitter, conceal: inb.concealedSamples/inb.totalSamplesReceived,
    fecRecv: inb.fecPacketsReceived, codec: [...(await c.getStats()).values()].find(x=>x.type==='codec'&&x.id===inb.codecId)?.mimeType, jbMs: 1000*inb.jitterBufferDelay/inb.jitterBufferEmittedCount, kbps: out.bytesSent*8/20/1000 };
}, fmtp, { red, jb });
if(r.dbg){console.log(JSON.stringify(r.dbg)); process.exit()} const lossPct = r.lost/(r.lost+r.recv);
// E-model (G.107 simplified, Opus Ie~0, Bpl~20 with FEC effect via concealment ratio)
const d = r.jbMs + 40 + 20; const Id = d < 177 ? 0.024*d : 0.024*d + 0.11*(d-177.3);
const Ie = 95 * (r.conceal*100) / (r.conceal*100 + 20); const R = 93.2 - Id - Ie;
const mos = 1 + 0.035*R + 7e-6*R*(R-60)*(100-R);
console.log(JSON.stringify({ label, loss, ...r, lossPct: +(lossPct*100).toFixed(1), mos: +mos.toFixed(2) }));
await b.close(); front.close(); back.close();
