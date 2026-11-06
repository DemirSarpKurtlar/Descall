'use strict';

/**
 * Markup for premium overlay windows: voice HUD, gaming HUD, desktop widgets and the quick
 * file drop zone. Plain HTML + a small inline script, no framework, so each window stays
 * small (one renderer, no app bundle). Every visible string arrives in the state from the
 * renderer, already translated. Nothing is injected into other processes: these are
 * ordinary always-on-top windows, which is why they show over borderless / windowed games
 * but not over exclusive fullscreen ones.
 */

const KINDS = new Set(['voice', 'gaming', 'widget', 'quickdrop']);

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;overflow:hidden;width:100%;height:100%;
 font-family:"Inter","Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,sans-serif;
 color:#f2f4f8;font-size:13px;-webkit-font-smoothing:antialiased;user-select:none}
.card{position:absolute;inset:6px;border-radius:14px;padding:10px 12px;overflow:hidden;
 background:linear-gradient(180deg,rgba(var(--brand,88,101,242),.16),rgba(var(--brand,88,101,242),.04)) ,rgba(16,18,26,.84);
 border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 6px 20px rgba(0,0,0,.35)}
.head{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;letter-spacing:.02em;color:rgba(242,244,248,.75);margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drag{-webkit-app-region:drag;cursor:move}
.nodrag{-webkit-app-region:no-drag}
.row{display:flex;align-items:center;gap:8px;padding:4px 0;min-width:0}
.av{flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:#2b2f3d center/cover no-repeat;display:grid;place-items:center;font-weight:700;font-size:11px;color:#cfd3dc;transition:box-shadow .12s}
.av.speaking{box-shadow:0 0 0 2px #34c759,0 0 10px rgba(52,199,89,.55)}
.name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{display:block;font-size:11px;color:rgba(242,244,248,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{font-size:10px;color:rgba(242,244,248,.55)}
.empty{color:rgba(242,244,248,.55);font-size:12px;padding:4px 0}
.dot{width:8px;height:8px;border-radius:50%;background:#7c8090;flex:0 0 auto}
.dot.online{background:#34c759}.dot.idle{background:#ffcc00}.dot.dnd{background:#ff453a}
.grid{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center}
.k{color:rgba(242,244,248,.6);font-size:11px}
.v{font-variant-numeric:tabular-nums;font-weight:600;text-align:right}
.good{color:#34c759}.warn{color:#ffcc00}.bad{color:#ff453a}
.sep{height:1px;background:rgba(255,255,255,.08);margin:8px 0}
.drop{position:absolute;inset:6px;border-radius:16px;border:2px dashed rgba(255,255,255,.28);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:12px;background:rgba(16,18,26,.86)}
.drop.over{border-color:#34c759;background:rgba(20,40,28,.9)}
.drop select{-webkit-app-region:no-drag;max-width:100%;background:rgba(255,255,255,.08);color:#f2f4f8;border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:4px 6px;font:inherit;font-size:12px}
.drop select option{background:#1b1e29}
.x{position:absolute;top:8px;right:10px;-webkit-app-region:no-drag;background:none;border:0;color:rgba(242,244,248,.55);font:inherit;font-size:14px;cursor:pointer}
`;

const SCRIPT = `
(function(){
var kind=document.body.getAttribute('data-kind');
var root=document.getElementById('root');
var state={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function initial(n){n=String(n||'?').trim();return esc(n.charAt(0).toUpperCase()||'?');}
function av(m){var st=m.avatar&&/^(https:|data:image\\/)/.test(m.avatar)?' style="background-image:url(\\''+esc(m.avatar)+'\\')"':'';return '<span class="av'+(m.speaking?' speaking':'')+'"'+st+' data-id="'+esc(m.id)+'">'+(st?'':initial(m.name))+'</span>';}
function dur(since){if(!since)return '';var s=Math.max(0,Math.floor((Date.now()-since)/1000));var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;function p(n){return (n<10?'0':'')+n;}return (h?h+':'+p(m):m)+':'+p(x);}
function pingCls(ms){return ms==null?'':ms<80?'good':ms<160?'warn':'bad';}
function pingTxt(ms,l){return ms==null?'--':Math.round(ms)+' '+esc(l.ms||'ms');}
function clock(){var d=new Date();function p(n){return (n<10?'0':'')+n;}return p(d.getHours())+':'+p(d.getMinutes());}
function renderVoice(){var l=state.labels||{};var ms=state.members||[];
 var h='<div class="card"><div class="head">'+esc(state.title||'')+'</div>';
 if(!ms.length)h+='<div class="empty">'+esc(l.empty||'')+'</div>';
 for(var i=0;i<ms.length;i++){var m=ms[i];h+='<div class="row">'+av(m)+'<span class="name">'+esc(m.name)+'</span>'+(m.muted?'<span class="tag">'+esc(l.muted||'')+'</span>':'')+'</div>';}
 root.innerHTML=h+'</div>';}
function renderGaming(){var l=state.labels||{};var p=state.ping||{};var show=state.show||{};var h='<div class="card"><div class="head">'+esc(l.title||'')+'</div><div class="grid">';
 if(show.clock!==false)h+='<span class="k">'+esc(l.clock||'')+'</span><span class="v" id="clk">'+clock()+'</span>';
 if(show.ping!==false){h+='<span class="k">'+esc(l.descall||'')+'</span><span class="v '+pingCls(p.descall)+'">'+pingTxt(p.descall,l)+'</span>';
  if(p.livekit!=null)h+='<span class="k">'+esc(l.livekit||'')+'</span><span class="v '+pingCls(p.livekit)+'">'+pingTxt(p.livekit,l)+'</span>';}
 h+='</div>';
 if(show.call!==false){h+='<div class="sep"></div>';var c=state.call;
  h+=c?'<div class="row"><span class="name">'+esc(c.title)+'<span class="sub">'+esc(c.countLabel||'')+'</span></span><span class="v" id="cdur" data-since="'+(c.since||0)+'">'+dur(c.since)+'</span></div>':'<div class="empty">'+esc(l.noCall||'')+'</div>';}
 if(show.friends!==false){h+='<div class="sep"></div><div class="k" style="margin-bottom:4px">'+esc(l.friends||'')+'</div>';var f=state.friends||[];
  if(!f.length)h+='<div class="empty">'+esc(l.noFriends||'')+'</div>';
  for(var i=0;i<f.length&&i<6;i++)h+='<div class="row"><span class="dot '+esc(f[i].status||'online')+'"></span><span class="name">'+esc(f[i].name)+(f[i].sub?'<span class="sub">'+esc(f[i].sub)+'</span>':'')+'</span></div>';}
 root.innerHTML=h+'</div>';}
function renderWidget(){var l=state.labels||{};var it=state.items||[];
 var h='<div class="card"><div class="head drag">'+esc(state.title||'')+'</div><div class="nodrag">';
 if(!it.length)h+='<div class="empty">'+esc(state.empty||'')+'</div>';
 for(var i=0;i<it.length&&i<12;i++){var x=it[i];h+='<div class="row">'+(x.status?'<span class="dot '+esc(x.status)+'"></span>':av(x))+'<span class="name">'+esc(x.name)+(x.sub?'<span class="sub">'+esc(x.sub)+'</span>':'')+'</span>'+(x.since?'<span class="v" data-since="'+x.since+'">'+dur(x.since)+'</span>':'')+'</div>';}
 root.innerHTML=h+'</div></div>';}
var dropStatus='';
function renderDrop(){var l=state.labels||{};var t=state.targets||[];var sel=state.target||'';
 var h='<div class="drop drag" id="dz"><button class="x" id="dzx" title="'+esc(l.close||'')+'">&#215;</button><b>'+esc(l.drop||'')+'</b><select id="dzt" title="'+esc(l.target||'')+'">';
 if(!t.length)h+='<option value="">'+esc(l.noTargets||'')+'</option>';
 for(var i=0;i<t.length;i++)h+='<option value="'+esc(t[i].id)+'"'+(t[i].id===sel?' selected':'')+'>'+esc(t[i].label)+'</option>';
 h+='</select><span class="sub" id="dzs">'+esc(dropStatus||state.status||'')+'</span></div>';root.innerHTML=h;
 var dz=document.getElementById('dz');var ts=document.getElementById('dzt');
 document.getElementById('dzx').onclick=function(){window.descallHud.action('close');};
 ts.onchange=function(){window.descallHud.action('pick',{target:ts.value});};
}
document.addEventListener('dragover',function(e){if(kind!=='quickdrop')return;e.preventDefault();var dz=document.getElementById('dz');if(dz)dz.classList.add('over');});
document.addEventListener('dragleave',function(){var dz=document.getElementById('dz');if(dz)dz.classList.remove('over');});
document.addEventListener('drop',function(e){if(kind!=='quickdrop')return;e.preventDefault();var dz=document.getElementById('dz');if(dz)dz.classList.remove('over');
 var ts=document.getElementById('dzt');var target=ts?ts.value:'';var files=[].slice.call(e.dataTransfer.files||[]).slice(0,10);var l=state.labels||{};var max=state.maxBytes||104857600;
 if(!target||!files.length)return;
 var out=[];var big=false;var pending=files.length;
 files.forEach(function(f){if(f.size>max){big=true;if(!--pending)done();return;}f.arrayBuffer().then(function(b){out.push({name:window.descallHud.fileName(f)||f.name,type:f.type||'application/octet-stream',size:f.size,data:b});if(!--pending)done();});});
 function done(){dropStatus=big?(l.tooBig||''):(l.sending||'');var s=document.getElementById('dzs');if(s)s.textContent=dropStatus;if(out.length)window.descallHud.action('drop',{target:target,files:out});}
});
function render(){document.documentElement.style.setProperty('--brand',state.brandRgb||'88,101,242');
 if(kind==='voice')renderVoice();else if(kind==='gaming')renderGaming();else if(kind==='widget')renderWidget();else if(kind==='quickdrop')renderDrop();
 document.documentElement.style.fontSize=(state.scale||1)*13+'px';document.body.style.zoom=state.scale||1;}
window.descallHud.onState(function(s){if(s&&s.dropStatus!=null)dropStatus=s.dropStatus;state=s||{};render();});
setInterval(function(){if(document.hidden)return;var c=document.getElementById('clk');if(c)c.textContent=clock();
 var ds=document.querySelectorAll('[data-since]');for(var i=0;i<ds.length;i++){var v=+ds[i].getAttribute('data-since');if(v)ds[i].textContent=dur(v);}},1000);
render();window.descallHud.action('ready');
})();
`;

function buildHudHtml(kind) {
  const k = KINDS.has(kind) ? kind : 'widget';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>`
    + `<body data-kind="${k}"><div id="root"></div><script>${SCRIPT}</script></body></html>`;
}

function hudDataUrl(kind) {
  return `data:text/html;base64,${Buffer.from(buildHudHtml(kind), 'utf8').toString('base64')}`;
}

module.exports = { buildHudHtml, hudDataUrl, KINDS };
