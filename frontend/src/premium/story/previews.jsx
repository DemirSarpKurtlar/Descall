/**
 * Live previews of the 47 Descall+ features (approved draft E). Each preview is a small
 * scene drawn with divs and reacts to the feature's settings (props.s, defaults applied
 * here) or to values its panel publishes (./bus.js). Sizes: "xs" (card thumbnail, no
 * labels) and "lg" (open card). Scenes are decorative: the card hides them from screen
 * readers; the settings themselves are in the panel next to it.
 *
 * summarize(key, s, t): the short "what is set" chips of a card.
 */
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { NOTIFY_DEFAULTS } from "../notify/premiumNotify.js";
import { DEFAULTS as GAMING_DEFAULTS } from "../gaming/ui.jsx";
import { DEFAULT_BINDINGS } from "../ui/hotkeyCommon.jsx";
import { KeyCaps } from "../ui/PremiumAudioKit.jsx";
import { readDockAnchor } from "../../lib/miniCallDock.js";
import { Ico } from "./icons.jsx";
import { useStoryValue } from "./bus.js";

/* ------------------------------------------------------------ helpers */
const cssKey = (k) => k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
/** "left:5%;top:7%" -> { left: "5%", top: "7%" } */
export function st(s) {
  const o = {};
  for (const part of String(s || "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) o[cssKey(part.slice(0, i))] = part.slice(i + 1).trim();
  }
  return o;
}
const W = [78, 62, 88, 54, 70, 46];
const Lines = ({ n = 4 }) => <div className="ln">{Array.from({ length: n }, (_, i) => <i key={i} style={{ width: `${W[i % 6]}%` }} />)}</div>;
const Win = ({ cls = "", at, style, children }) => <div className={`pv-w ${cls}`} style={{ ...st(at), ...style }}><i className="tb" />{children}</div>;
const DsWin = ({ at, style, children }) => (
  <Win cls="ds" at={at} style={style}><div className="ds-rail"><i /><i /><i /></div><div className="ds-body"><Lines n={5} /></div>{children}</Win>
);
const Other = ({ at, style }) => <Win cls="other" at={at} style={style}><Lines n={6} /></Win>;
const Lbl = ({ children, at, cls = "" }) => <span className={`ps-lbl ${cls}`} style={st(at)}>{children}</span>;
const Dock = () => <div className="pv-dock"><i /><i /><i className="ds" /><i /></div>;
const Scr = ({ children, cls = "", dock = true }) => <div className={`ps-scr ${cls}`}>{children}{dock ? <Dock /> : null}</div>;
const AV = [["A", "#e8457a"], ["M", "#3e7bfa"], ["K", "#30b458"], ["E", "#9b5de5"], ["D", "#f08a24"]];
const Av = ({ i = 0, talk = false }) => <span className={`pv-av${talk ? " is-talk" : ""}`} style={{ background: AV[i % AV.length][1] }}>{AV[i % AV.length][0]}</span>;
const Side = ({ at, style, children }) => (
  <Win cls="ds side" at={at} style={style}><div className="sd"><Av i={0} /><Av i={1} /><Av i={2} /></div>{children}</Win>
);
const CallCard = ({ at, mini = false, style, muted = false }) => (
  <div className={`pv-call${mini ? " is-mini" : ""}`} style={{ ...st(at), ...style }}>
    <div className="cc-top"><Av i={0} /><span className="cc-t"><b /><small><span className="dot" /><i /></small></span></div>
    <div className="cc-btns"><span className={muted ? "is-off" : ""}><Ico n={muted ? "micOff" : "mic"} size={12} /></span><span><Ico n="head" size={12} /></span><span className="red"><Ico n="phone" size={12} /></span></div>
  </div>
);
const Bars = ({ n = 9, level = 1, cls = "" }) => (
  <span className={`pv-bars ${cls}`}>{Array.from({ length: n }, (_, i) => <i key={i} className={i < Math.round(n * level) ? "on" : ""} style={{ height: `${[30, 55, 80, 45, 95, 60, 75, 40, 25, 65, 50, 85][i % 12]}%` }} />)}</span>
);
/** Locale percent ("%80" in Turkish, "80%" in English). */
const pctT = (t, v) => t("premium.panel.opacityValue", { value: Math.round(v) });
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const corner = (c, m = "6%") => ({ tl: `left:${m};top:${m}`, tr: `right:${m};top:${m}`, bl: `left:${m};bottom:${m}`, br: `right:${m};bottom:${m}` }[c] || `right:${m};top:${m}`);

/** "CommandOrControl+Alt+M" -> "Ctrl+Alt+M" (chips). */
export function fmtAccel(t, accel) {
  if (!accel) return t("premiumAudio.hotkeys.unbound");
  return String(accel).split("+").map((p) => {
    if (p === "CommandOrControl" || p === "Control") return "Ctrl";
    if (/^Mouse[345]$/.test(p)) return t(`premiumAudio.hotkeys.mouse${p.slice(5)}`);
    return p;
  }).join("+");
}

function useDock() {
  return useStoryValue("mini_mode.dock", readDockAnchor());
}

/* ------------------------------------------------------------ windows */
const DOCK_AT = {
  "top-left": "left:5%;top:7%", "top-right": "right:5%;top:7%", "mid-left": "left:5%;top:36%",
  "mid-right": "right:5%;top:36%", "bottom-left": "left:5%;bottom:17%", "bottom-right": "right:5%;bottom:17%",
};

function MiniMode({ t }) {
  const a = useDock();
  return (
    <Scr cls="pv-mini">
      <Other at="left:16%;top:12%;width:58%;height:60%" />
      {Object.keys(DOCK_AT).filter((k) => k !== a).map((k) => <i key={k} className="pv-ghost" style={st(DOCK_AT[k])} />)}
      <CallCard at={DOCK_AT[a] || DOCK_AT["bottom-right"]} />
      <Lbl at="left:4%;bottom:3.5%" cls="is-blue"><Ico n="pin" size={10} />{t(`premium.panel.dock.${a}`)}</Lbl>
    </Scr>
  );
}

const TOP_DEF = { main: false, mini: true, call: true, sidebar: true, popout: false };
function AlwaysOnTop({ s, t }) {
  const on = (k) => (typeof s[k] === "boolean" ? s[k] : TOP_DEF[k]);
  const z = (k) => (on(k) ? { zIndex: 6 } : { zIndex: 1, opacity: 0.38, filter: "saturate(.3)" });
  const pin = (k) => (on(k) ? <span className="pinb"><Ico n="pin" size={9} sw={2.4} /></span> : null);
  return (
    <Scr cls="pv-top">
      <DsWin at="left:5%;top:8%;width:46%;height:58%" style={z("main")}>{pin("main")}</DsWin>
      <Other at="left:24%;top:16%;width:52%;height:58%;z-index:3" />
      <Side at="right:0;top:0;width:13%;height:84%" style={z("sidebar")}>{pin("sidebar")}</Side>
      <Win cls="ds call" at="right:16%;top:8%;width:24%;height:26%" style={z("call")}><div className="vid"><i /><i /></div>{pin("call")}</Win>
      <Win cls="ds pop" at="left:8%;bottom:15%;width:26%;height:30%" style={z("popout")}><Lines n={3} />{pin("popout")}</Win>
      <Lbl at="left:26%;top:66%;z-index:4">{t("premiumStory.pv.otherApp")}</Lbl>
    </Scr>
  );
}

function PipCall({ t }) {
  return (
    <Scr cls="pv-pip">
      <Other at="left:6%;top:8%;width:70%;height:66%" />
      <Win cls="ds call big" at="right:5%;top:10%;width:38%;height:44%;z-index:5">
        <div className="vid"><i><Av i={0} /></i><i><Av i={1} /></i></div>
        <div className="vbar"><span><Ico n="mic" size={9} /></span><span><Ico n="monitor" size={9} /></span><span className="red"><Ico n="phone" size={9} /></span></div>
      </Win>
      <Lbl at="right:6%;top:57%"><Ico n="pin" size={10} />{t("premiumStory.pv.onTop")}</Lbl>
    </Scr>
  );
}

const POP_AT = ["left:44%;top:9%", "left:56%;top:30%", "left:46%;top:46%", "left:60%;top:12%"];
function MultiWindow({ t }) {
  const n = useStoryValue("multi_window.count", 2);
  return (
    <Scr cls="pv-multi">
      <DsWin at="left:4%;top:9%;width:44%;height:64%" />
      {POP_AT.slice(0, Math.min(4, n)).map((at, i) => (
        <Win key={at} cls="ds pop" at={`${at};width:34%;height:34%;z-index:${4 + i}`}><span className="pt" /><Lines n={2} /></Win>
      ))}
      <Lbl at="right:5%;bottom:17%;z-index:9">{t("premium.panel.popoutsOpen", { n })}</Lbl>
    </Scr>
  );
}

function WindowOpacity({ s, t }) {
  const v = (k) => Math.round((typeof s[k] === "number" ? s[k] : 1) * 100);
  return (
    <Scr cls="pv-op">
      <div className="pv-stripes" />
      <Other at="left:4%;top:7%;width:60%;height:66%" />
      <Side at="right:0;top:0;width:13%;height:84%" style={{ opacity: v("sidebar") / 100 }} />
      <Win cls="ds call" at="left:42%;top:9%;width:30%;height:30%" style={{ opacity: v("call") / 100 }}><div className="vid"><i /><i /></div></Win>
      <Win cls="ds pop" at="left:30%;top:44%;width:30%;height:32%" style={{ opacity: v("popout") / 100 }}><span className="pt" /><Lines n={2} /></Win>
      <Lbl at="left:43%;top:2%">{pctT(t, v("call"))}</Lbl>
      <Lbl at="right:1%;top:3%">{pctT(t, v("sidebar"))}</Lbl>
      <Lbl at="left:31%;top:78%">{pctT(t, v("popout"))}</Lbl>
    </Scr>
  );
}

function SessionRestore({ s, t }) {
  const popouts = s.popouts !== false;
  const side = s.mini !== false;
  const bounds = s.bounds !== false;
  const half = (after) => (
    <div className="half">
      <Lbl at="left:6%;top:5%">{after ? t("premiumStory.pv.after") : t("premiumStory.pv.before")}</Lbl>
      <DsWin at={after && !bounds ? "left:22%;top:24%;width:56%;height:46%" : "left:6%;top:24%;width:52%;height:48%"} />
      {!after || popouts ? <Win cls="ds pop" at="left:58%;top:28%;width:32%;height:30%"><Lines n={2} /></Win> : null}
      {!after || side ? <Side at="right:0;top:0;width:9%;height:100%" /> : null}
    </div>
  );
  return <div className="ps-scr pv-restore"><div className="split">{half(false)}<span className="arr"><Ico n="chev" size={16} sw={2.4} /></span>{half(true)}</div></div>;
}

function TrayControls({ t }) {
  const it = (n, label, more) => <div className="mi"><Ico n={n} size={11} /><span>{label}</span>{more ? <i className="ch"><Ico n="chev" size={9} /></i> : null}</div>;
  return (
    <Scr cls="pv-tray" dock={false}>
      <Other at="left:6%;top:8%;width:54%;height:60%" />
      <div className="pv-traymenu">
        {it("mic", t("premium.win.mute"))}
        {it("head", t("premium.win.deafen"))}
        {it("user", t("premiumAudio.launcher.status"), true)}
        <hr />
        {it("card", t("premium.panel.openMini"))}
      </div>
      <div className="pv-tray-bar"><i /><i /><i className="ds" /><span className="clk tnum">21:40</span></div>
    </Scr>
  );
}

function TaskbarPlus({ s }) {
  const badge = s.badge !== false;
  const buttons = s.buttons !== false;
  return (
    <Scr cls="pv-taskbar" dock={false}>
      <Other at="left:6%;top:8%;width:60%;height:48%" />
      <div className="pv-thumb">
        <DsWin style={{ position: "relative", left: 0, top: 0, width: "100%", height: "62%" }} />
        <div className={`tb-btns${buttons ? "" : " is-off"}`}>{buttons ? <><span><Ico n="mic" size={10} /></span><span><Ico n="head" size={10} /></span><span className="red"><Ico n="phone" size={10} /></span></> : null}</div>
      </div>
      <div className="pv-taskbar-bar"><i /><i /><i className="ds">{badge ? <b className="tnum">3</b> : null}</i><i /></div>
    </Scr>
  );
}

function WindowLayouts({ t }) {
  const names = useStoryValue("window_layouts.names", []);
  return (
    <Scr cls="pv-layout">
      <DsWin at="left:3%;top:6%;width:56%;height:70%" />
      <Win cls="ds pop" at="left:61%;top:6%;width:35%;height:36%"><span className="pt" /><Lines n={2} /></Win>
      <Win cls="ds call" at="left:61%;top:45%;width:35%;height:31%"><div className="vid"><i /><i /></div></Win>
      <Lbl at="left:4%;bottom:4%"><Ico n="layout" size={10} />{names[0] || t("premium.panel.layoutName")}</Lbl>
    </Scr>
  );
}

function AdvancedWindows({ s, t }) {
  const snap = s.snap !== false;
  const keep = s.keepVisible !== false;
  const main = s.mainMonitor !== false;
  return (
    <div className="ps-scr pv-adv">
      <div className="mons">
        <div className="mon">
          {main ? <span className="star"><Ico n="star" size={11} sw={2.2} /></span> : null}
          <DsWin at={snap ? "left:0;top:0;width:50%;height:100%" : "left:12%;top:14%;width:48%;height:66%"} />
          {snap ? <i className="snapg" /> : null}
          <Lbl at="left:54%;bottom:6%">{t("premiumStory.pv.screen", { n: 1 })}</Lbl>
        </div>
        <div className={`mon${keep ? " gone" : ""}`}>
          {keep ? <span className="back"><Ico n="restore" size={14} /></span> : <Win cls="ds pop" at="left:20%;top:20%;width:56%;height:50%"><Lines n={2} /></Win>}
          <Lbl at="left:8%;bottom:6%">{keep ? t("premiumStory.pv.unplugged") : t("premiumStory.pv.screen", { n: 2 })}</Lbl>
        </div>
      </div>
    </div>
  );
}

function ScreenEdge({ s, t }) {
  const sidebarEdge = useStoryValue("desktop_sidebar.edge", "right");
  const edge = s.edge === "left" || s.edge === "right" ? s.edge : sidebarEdge;
  const delay = [0, 250, 500, 1000].includes(s.delay) ? s.delay : 250;
  const left = edge === "left";
  return (
    <Scr cls="pv-edge">
      <Other at="left:14%;top:9%;width:70%;height:64%" />
      <Win cls="ds side" at={`${left ? "left:0" : "right:0"};top:0;width:18%;height:84%;z-index:5`}><div className="sd"><Av i={0} /><Av i={1} /><Av i={2} /><Av i={3} /></div></Win>
      <span className="pv-cursor" style={st(`${left ? "left:1%" : "right:1%"};top:44%`)}><Ico n="cursor" size={15} sw={1.6} /></span>
      <span className="pv-edgeglow" style={st(left ? "left:0" : "right:0")} />
      <Lbl at={`${left ? "left:21%" : "right:21%"};top:44%`}><Ico n="clock" size={10} />{t("premium.panel.edgeDelayValue", { ms: delay })}</Lbl>
    </Scr>
  );
}

function CustomLayouts({ t }) {
  const active = useStoryValue("custom_layouts.active", null);
  const kinds = useStoryValue("widgets.kinds", ["friends", "calls", "notifications"]);
  const spots = ["left:3%;top:4%;width:46%;height:44%", "left:51%;top:4%;width:46%;height:44%", "left:3%;top:52%;width:94%;height:42%", "left:51%;top:52%;width:46%;height:42%"];
  const list = kinds.length ? kinds.slice(0, 3) : ["friends"];
  return (
    <Scr cls="pv-widgets">
      <div className="pv-w ds" style={st("left:8%;top:6%;width:84%;height:72%")}>
        <i className="tb" />
        <div className="wg">{list.map((k, i) => <div key={`${k}${i}`} className="wgi" style={st(list.length === 3 && i === 2 ? spots[2] : spots[i])}><Ico n={k === "calls" ? "phone" : k === "notifications" ? "bell" : "users"} size={11} /></div>)}</div>
      </div>
      {active ? <Lbl at="left:9%;bottom:4%" cls="is-green">{active}</Lbl> : null}
    </Scr>
  );
}

/* ------------------------------------------------------------ audio */
const WAVE = [-70, -66, -58, -40, -30, -26, -33, -45, -62, -71, -68, -50, -36, -28, -24, -29, -38, -55, -64, -72, -74, -69, -61, -48, -35, -31, -42, -57, -67, -73, -70, -66];
function NoiseGate({ s, t }) {
  const g = { ...AUDIO_DEFAULTS.noise_gate, ...s };
  const top = -10;
  const bot = -80;
  const y = (db) => ((top - db) / (top - bot)) * 100;
  const close = g.thresholdDb - g.hysteresisDb;
  return (
    <div className="ps-scr pv-gate">
      <div className="meter">
        <div className="bars">
          {WAVE.map((db, i) => {
            const cls = db >= g.thresholdDb ? "pass" : db >= close && i > 0 && WAVE[i - 1] >= g.thresholdDb ? "hold" : "";
            return <i key={i} className={cls} style={{ height: `${100 - y(db)}%` }} />;
          })}
        </div>
        <div className="band" style={{ top: `${y(g.thresholdDb)}%`, height: `${Math.max(0, y(Math.max(bot, close)) - y(g.thresholdDb))}%` }} />
        <div className="th" style={{ top: `${y(g.thresholdDb)}%` }}><span className="ps-lbl-in tnum">{t("premiumAudio.common.db", { n: g.thresholdDb })}</span></div>
        <div className="holdw" style={{ left: "56%", width: `${Math.min(30, (g.holdMs / 1000) * 30)}%` }} />
      </div>
      <div className="lg">
        <span><i className="pass" />{t("premiumStory.pv.pass")}</span>
        <span><i />{t("premiumStory.pv.cut")}</span>
        <span><i className="hb" />{t("premiumAudio.common.ms", { n: g.holdMs })}</span>
      </div>
    </div>
  );
}

function MicPresets({ s, t }) {
  const gain = num(s.gain, AUDIO_DEFAULTS.mic_presets.gain);
  const cur = useStoryValue("mic_presets.current", null);
  const name = useStoryValue("mic_presets.activeName", "");
  const chain = cur ? [
    ["gate", cur.noiseMode !== "off", cur.noiseMode === "strong"],
    ["ear", cur.echoCancellation, false],
    ["sliders", cur.autoGainControl, false],
  ] : [["gate", true, false], ["ear", true, false], ["sliders", true, false]];
  return (
    <div className="ps-scr pv-presets">
      <div className="dial" style={{ "--a": `${Math.min(1, gain / 200) * 270}deg` }}>
        <div className="in"><b className="tnum">{pctT(t, gain)}</b><small>{t("premiumStory.pv.gain")}</small></div>
      </div>
      <div className="chain">
        {chain.map(([n, on, strong]) => <span key={n} className={`chip${on ? " on" : ""}${strong ? " strong" : ""}`}><Ico n={n} size={13} /></span>)}
      </div>
      {name ? <Lbl at="left:6%;top:7%" cls="is-green">{name}</Lbl> : null}
    </div>
  );
}

function MicMonitor({ s, t }) {
  const v = num(s.volume, AUDIO_DEFAULTS.mic_monitor.volume);
  return (
    <div className="ps-scr pv-monitor">
      <div className="flow">
        <span className="node"><Ico n="mic" size={18} /></span>
        <Bars n={9} level={v / 100} />
        <span className="node"><Ico n="head" size={18} /></span>
      </div>
      <Lbl at="left:50%;bottom:8%;transform:translateX(-50%)">{t("premiumAudio.monitor.volume")} {pctT(t, v)}</Lbl>
    </div>
  );
}

function VoiceActivity() {
  const lv = [82, 34, 58, 8];
  return (
    <div className="ps-scr pv-vam">
      <div className="ppl">
        {lv.map((l, i) => (
          <div key={i} className={`p${l > 50 ? " talk" : ""}`}>
            <Av i={i} talk={l > 50} />
            <b />
            <span className="lv"><i style={{ width: `${l}%`, animationDelay: `${i * 0.3}s` }} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutoDevice({ s, t }) {
  const order = Array.isArray(s.inputOrder) && s.inputOrder.length ? s.inputOrder : [{ label: "" }, { label: "" }, { label: "" }];
  const headsetFirst = s.headsetFirst !== false;
  return (
    <div className="ps-scr pv-auto">
      <div className="stack">
        {order.slice(0, 3).map((d, i) => (
          <div key={i} className={`d${i === 0 ? " act" : ""}`}>
            <span className="n tnum">{i + 1}</span>
            <Ico n={i === 1 ? "head" : "mic"} size={13} />
            {d.label ? <b>{d.label}</b> : <i className="bar" />}
            {i === 0 ? <em>{t("premiumAudio.common.active")}</em> : null}
          </div>
        ))}
      </div>
      {headsetFirst ? <div className="plug"><Ico n="plug" size={13} /><span>{t("premiumStory.pv.headsetFirst")}</span></div> : null}
    </div>
  );
}

function AudioRouting({ s, t }) {
  const labels = useStoryValue("audio_routing.labels", {});
  const callOut = s.callOutput || "";
  const noteOut = s.notificationOutput || "";
  const same = callOut === noteOut;
  const name = (id) => (id ? labels[id] || t("premiumAudio.common.unnamedDevice") : t("premiumAudio.routing.systemDefault"));
  return (
    <div className="ps-scr pv-route">
      <svg className="wires" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        <path d={`M34 18 C 50 18, 50 ${same ? 30 : 18}, 64 ${same ? 30 : 18}`} />
        <path className="b" d={`M34 42 C 50 42, 50 ${same ? 30 : 42}, 64 ${same ? 30 : 42}`} />
      </svg>
      <div className="src" style={{ top: "20%" }}><Ico n="phone" size={12} /><span>{t("premiumAudio.routing.call")}</span></div>
      <div className="src b" style={{ top: "60%" }}><Ico n="bell" size={12} /><span>{t("premiumAudio.routing.notifications")}</span></div>
      {same ? (
        <div className="dst" style={{ top: "40%" }}><Ico n="head" size={12} /><span>{name(callOut)}</span></div>
      ) : (
        <>
          <div className="dst" style={{ top: "20%" }}><Ico n="head" size={12} /><span>{name(callOut)}</span></div>
          <div className="dst b" style={{ top: "60%" }}><Ico n="speaker" size={12} /><span>{name(noteOut)}</span></div>
        </>
      )}
    </div>
  );
}

function DeviceProfiles({ s }) {
  const list = Array.isArray(s.profiles) && s.profiles.length ? s.profiles.slice(0, 2) : [{ id: "a", name: "" }, { id: "b", name: "" }];
  const active = s.activeId || list[0]?.id;
  return (
    <div className="ps-scr pv-prof">
      {list.map((p) => (
        <div key={p.id} className={`pc${p.id === active ? " act" : ""}`}>
          {p.name ? <b>{p.name}</b> : <i className="bar w60" />}
          <span><Ico n="mic" size={10} /><i className="bar" /></span>
          <span><Ico n="head" size={10} /><i className="bar" /></span>
          <span><Ico n="sliders" size={10} /><i className="bar w40" /></span>
        </div>
      ))}
    </div>
  );
}

function StreamAudio({ s, t }) {
  const g = { ...AUDIO_DEFAULTS.stream_audio_control, ...s };
  const fad = (label, v, m) => (
    <div className={`fd${m ? " muted" : ""}`}>
      <div className="tr"><i style={{ height: `${m ? 0 : v / 2}%` }} /><span className="knob" style={{ bottom: `${m ? 0 : v / 2}%` }} /></div>
      <b className="tnum">{m ? t("premiumStory.off") : pctT(t, v)}</b>
      <small>{label}</small>
    </div>
  );
  return (
    <div className="ps-scr pv-stream">
      <div className="mix">{fad(t("premiumStory.pv.yourShare"), g.sendVolume, g.sendMuted)}{fad(t("premiumStory.pv.theirShare"), g.viewVolume, g.viewMuted)}</div>
      <div className="scrn"><Ico n="cast" size={22} sw={1.6} /></div>
    </div>
  );
}

/* ------------------------------------------------------------ shortcuts */
function Keyboard({ hot = [], accent = "" }) {
  const rows = [10, 9, 7];
  let k = 0;
  return (
    <div className={`pv-kb ${accent}`}>
      {rows.map((n, r) => (
        <div key={r} className="row">{Array.from({ length: n }, () => { k += 1; return <i key={k} className={hot.includes(k) ? "hot" : ""} />; })}</div>
      ))}
      <div className="row"><i className={`w2${hot.includes(-1) ? " hot" : ""}`} /><i className={hot.includes(-2) ? "hot" : ""} /><i className="w6" /><i className={hot.includes(-3) ? "hot" : ""} /></div>
    </div>
  );
}

function GlobalMute({ s }) {
  const binds = useStoryValue("global_mute.bindings", {});
  const deafen = s.deafen !== false;
  return (
    <div className="ps-scr pv-keys">
      <div className="caps"><KeyCaps accel={binds.toggle_mute ?? DEFAULT_BINDINGS.toggle_mute} /></div>
      <div className="res"><span className="r is-red"><Ico n="micOff" size={16} /></span>{deafen ? <span className="r"><Ico n="head" size={16} /></span> : null}</div>
      <Keyboard hot={[-1, -2, 26]} />
    </div>
  );
}

function GlobalPtt({ s, t }) {
  const binding = useStoryValue("global_ptt.binding", "Mouse4");
  const delay = num(s.releaseDelayMs, 150);
  const toggle = Boolean(s.forceToggle);
  return (
    <div className="ps-scr pv-ptt">
      <div className="mouse"><span className="side" /><i className="wheel" /></div>
      <div className="wave">
        <Bars n={12} level={1} cls="talk" />
        <span className="tail" style={{ width: `${Math.max(4, (delay / 600) * 40)}%` }} />
      </div>
      <Lbl at="left:6%;top:7%">{fmtAccel(t, binding)}</Lbl>
      <Lbl at="right:6%;top:7%" cls={toggle ? "is-blue" : ""}>{toggle ? t("premiumAudio.ptt.forceToggle") : t("premiumAudio.common.ms", { n: delay })}</Lbl>
    </div>
  );
}

const ACT_ICON = { toggle_mute: "micOff", toggle_deafen: "head", push_to_talk: "mouse", quick_launcher: "command", volume_up: "vol", volume_down: "volOff" };
function CustomHotkeys({ s }) {
  const draft = useStoryValue("custom_hotkeys.current", "");
  let b = { ...DEFAULT_BINDINGS, ...(s.bindings || {}) };
  try { if (draft) b = JSON.parse(draft); } catch { /* keep saved bindings */ }
  return (
    <div className="ps-scr pv-hk">
      {Object.keys(ACT_ICON).map((a) => (
        <div key={a} className="hk"><span className="ic"><Ico n={ACT_ICON[a]} size={12} /></span><KeyCaps accel={b[a]} /></div>
      ))}
    </div>
  );
}

const MK = [["playPause", "play"], ["previous", "prev"], ["next", "next"], ["stop", "stop"]];
function MediaKeys({ s }) {
  const v = { playPause: "toggle_mute", next: "toggle_deafen", previous: "none", stop: "none", ...s };
  return (
    <div className="ps-scr pv-media">
      {MK.map(([k, ic]) => (
        <div key={k} className={`mk${v[k] === "none" ? " is-none" : ""}`}>
          <span className="cap"><Ico n={ic} size={14} /></span>
          <span className="to"><Ico n={v[k] === "toggle_mute" ? "micOff" : v[k] === "toggle_deafen" ? "head" : "x"} size={12} /></span>
        </div>
      ))}
    </div>
  );
}

function QuickLauncher({ t }) {
  const accel = useStoryValue("quick_launcher.accel", DEFAULT_BINDINGS.quick_launcher);
  return (
    <Scr cls="pv-launch" dock={false}>
      <Other at="left:5%;top:8%;width:90%;height:80%" />
      <div className="pal">
        <div className="q"><Ico n="sparkle" size={11} /><i /></div>
        <div className="r on"><Av i={0} /><i /></div>
        <div className="r"><Ico n="mic" size={11} /><i /></div>
        <div className="r"><Ico n="moon" size={11} /><i /></div>
      </div>
      <Lbl at="right:5%;bottom:5%">{fmtAccel(t, accel)}</Lbl>
    </Scr>
  );
}

function QuickReply() {
  return (
    <Scr cls="pv-reply" dock={false}>
      <Other at="left:5%;top:8%;width:62%;height:70%" />
      <div className="toast">
        <div className="th"><Av i={1} /><span><b /><i /></span></div>
        <div className="field"><i /><span className="send"><Ico n="reply" size={10} /></span></div>
      </div>
    </Scr>
  );
}

function UserVolume({ s, t }) {
  const stp = num(s.step, 10);
  const n = Math.round(100 / stp);
  return (
    <div className="ps-scr pv-uvol">
      <div className="who"><Av i={3} talk /><span className="pinb"><Ico n="pin" size={9} sw={2.4} /></span></div>
      <div className="steps">{Array.from({ length: Math.min(20, n) }, (_, i) => <i key={i} className={i < Math.min(20, n) * 0.6 ? "on" : ""} />)}</div>
      <div className="ud"><span><Ico n="up" size={12} /></span><b className="tnum">{`±${pctT(t, stp)}`}</b><span><Ico n="down" size={12} /></span></div>
    </div>
  );
}

/* ------------------------------------------------------------ notifications */
function NotificationHistory() {
  const unread = useStoryValue("notification_history.unread", 2);
  return (
    <div className="ps-scr pv-hist">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`n${i < unread ? " unread" : ""}`}>
          <Av i={i} /><span><b /><i /></span><small className="tnum">{`${21 - i}:${10 + i * 7}`}</small>
        </div>
      ))}
    </div>
  );
}

function FocusMode({ s, t }) {
  const g = { ...NOTIFY_DEFAULTS.focus_mode, ...s };
  const left = Math.max(0, Math.ceil((Number(g.until) - Date.now()) / 60000));
  const active = left > 0;
  const total = Math.max(15, Number(g.lastMinutes) || 60);
  const frac = active ? Math.min(1, left / total) : 1;
  return (
    <div className={`ps-scr pv-focus${active ? " is-active" : ""}`}>
      <div className="ring" style={{ "--a": `${frac * 360}deg` }}><span><Ico n="moon" size={22} /></span></div>
      <div className="side">
        <b className="tnum">{active ? t("premiumAudio.common.minutes", { n: left }) : t("premiumAudio.common.minutes", { n: g.lastMinutes })}</b>
        <span className={g.allowCalls !== false ? "ok" : "no"}><Ico n="phone" size={12} /></span>
        <span className={g.allowDms ? "ok" : "no"}><Ico n="chat" size={12} /></span>
      </div>
    </div>
  );
}

function NotificationProfiles({ s, t }) {
  const g = { ...NOTIFY_DEFAULTS.notification_profiles, ...s };
  const cols = [["default", "bell"], ["gaming", "gamepad"], ["working", "calendar"]];
  return (
    <div className="ps-scr pv-nprof">
      {cols.map(([a, ic]) => (
        <div key={a} className={`col${g.mode === a ? " on" : ""}`}>
          <span className="ic"><Ico n={ic} size={14} /></span>
          <small>{t(`premiumAudio.rules.activity.${a}`)}</small>
          <i className={a === "gaming" ? "w30" : a === "working" ? "w60" : ""} />
        </div>
      ))}
      <Lbl at="left:50%;bottom:6%;transform:translateX(-50%)" cls={g.mode === "auto" ? "is-blue" : ""}>
        {g.scheduleOn ? <Ico n="clock" size={10} /> : null}
        {g.mode === "auto" ? t("premiumAudio.rules.auto") : t(`premiumAudio.rules.activity.${g.mode}`)}
      </Lbl>
    </div>
  );
}

function SmartGame({ s }) {
  const summary = s.summary !== false;
  return (
    <div className="ps-scr pv-game pv-smart">
      <div className="game" />
      <div className="held"><Ico n="bell" size={12} /><b className="tnum">3</b></div>
      {summary ? <div className="sum"><Ico n="check" size={11} /><i /><i className="w60" /></div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ gaming */
function GameStatus({ t }) {
  const vis = useStoryValue("game_status.vis", "friends");
  return (
    <div className="ps-scr pv-gstat">
      <div className="card">
        <Av i={4} />
        <span className="who"><b /><small><Ico n="gamepad" size={11} /><i /></small></span>
      </div>
      <Lbl at="left:50%;bottom:8%;transform:translateX(-50%)"><Ico n={vis === "nobody" ? "lock" : vis === "everyone" ? "users" : "user"} size={10} />{t(`premiumGaming.gameStatus.vis.${vis}`)}</Lbl>
    </div>
  );
}

function GameHistory() {
  const totals = useStoryValue("game_session_history.totals", [100, 72, 40, 22]);
  const max = Math.max(1, ...totals);
  return (
    <div className="ps-scr pv-ghist">
      {totals.slice(0, 4).map((v, i) => (
        <div key={i} className="row"><span className="g" style={{ background: AV[i][1] }} /><span className="bar"><i style={{ width: `${Math.max(4, (v / max) * 100)}%` }} /></span></div>
      ))}
    </div>
  );
}

function Hud({ s, gaming = false }) {
  const d = gaming ? GAMING_DEFAULTS.gaming_hud : GAMING_DEFAULTS.voice_hud;
  const g = { ...d, ...s };
  const m = `${3 + Math.min(1, g.margin / 200) * 12}%`;
  return (
    <div className="ps-scr pv-game">
      <div className="game" />
      <div className={`hud${g.on ? "" : " is-hidden"}`} style={{ ...st(corner(g.corner, m)), opacity: g.on ? g.opacity : 0.25, transform: `scale(${g.scale})`, transformOrigin: `${g.corner?.[0] === "b" ? "bottom" : "top"} ${g.corner?.[1] === "l" ? "left" : "right"}` }}>
        {gaming ? (
          <>
            {g.showClock !== false ? <div className="hr"><Ico n="clock" size={10} /><i /></div> : null}
            {g.showPing !== false ? <div className="hr"><Ico n="signal" size={10} /><i className="w40" /></div> : null}
            {g.showCall !== false ? <div className="hr"><Ico n="phone" size={10} /><i className="w60" /></div> : null}
            {g.showFriends !== false ? <div className="hr"><Ico n="users" size={10} /><i className="w30" /></div> : null}
          </>
        ) : (
          [0, 1, 2].map((i) => <div key={i} className="hr"><Av i={i} talk={i === 0} /><i className={i ? "w60" : ""} /></div>)
        )}
      </div>
    </div>
  );
}

function InstantClip({ s, t }) {
  const g = { ...GAMING_DEFAULTS.instant_clip, ...s };
  const sec = g.windowSec === 60 ? 60 : 30;
  return (
    <div className="ps-scr pv-game pv-clip">
      <div className="game" />
      <div className="tl">
        <span className="buf" style={{ width: sec === 60 ? "62%" : "34%" }} />
        <span className="now" />
      </div>
      <Lbl at="left:5%;top:7%" cls={g.on ? "is-red" : ""}><i className="rec" />{t("premiumAudio.common.seconds", { n: sec })}</Lbl>
      <Lbl at="right:5%;top:7%">{fmtAccel(t, g.hotkey)}</Lbl>
    </div>
  );
}

/* ------------------------------------------------------------ productivity */
function ClipboardHistory({ s }) {
  const on = Boolean(s.on);
  return (
    <div className={`ps-scr pv-clipb${on ? "" : " is-paused"}`}>
      {[0, 1, 2].map((i) => <div key={i} className="cb" style={{ transform: `translate(${i * 8}px, ${i * 9}px)` }}><Ico n={i ? "copy" : "clipboard"} size={11} /><i /><i className="w60" /></div>)}
    </div>
  );
}

function QuickDrop({ s }) {
  const on = Boolean(s.on);
  return (
    <Scr cls="pv-drop" dock={false}>
      <Other at="left:5%;top:8%;width:60%;height:70%" />
      <span className="file"><Ico n="file" size={16} /></span>
      <div className={`zone${on ? "" : " is-off"}`}><Ico n="down" size={14} /><Av i={1} /><Av i={2} /></div>
    </Scr>
  );
}

function AppLock() {
  const st2 = useStoryValue("app_lock.state", { hasPin: true, enabled: true });
  return (
    <div className={`ps-scr pv-lock${st2.enabled ? "" : " is-open"}`}>
      <span className="pad"><Ico n="lock" size={20} /></span>
      <div className="dots">{[0, 1, 2, 3].map((i) => <i key={i} className={st2.hasPin && i < 3 ? "on" : ""} />)}</div>
    </div>
  );
}

const QA_ICON = { set_status: "user", open_dm: "chat", join_channel: "vol", toggle_focus: "moon", workspace: "layout" };
function QuickActions({ s }) {
  const items = Array.isArray(s.items) && s.items.length ? s.items.slice(0, 6) : [{ action: { type: "set_status" } }, { action: { type: "join_channel" } }, { action: { type: "toggle_focus" } }, { action: { type: "open_dm" } }];
  return (
    <div className="ps-scr pv-qa">
      {items.map((it, i) => (
        <div key={it.id || i} className="qa"><span><Ico n={QA_ICON[it.action?.type] || "zap"} size={13} /></span>{it.label ? <b>{it.label}</b> : <i />}</div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ desktop tools */
function DesktopSidebar({ s }) {
  const left = s.edge === "left";
  const autoHide = s.autoHide !== false;
  return (
    <Scr cls="pv-dside">
      <Other at="left:14%;top:9%;width:68%;height:64%" />
      <Win cls={`ds side${autoHide ? " peek" : ""}`} at={`${left ? "left:0" : "right:0"};top:0;width:18%;height:84%;z-index:5`}>
        <div className="sd"><Av i={0} /><Av i={1} /><Av i={2} /><Av i={3} /></div>
      </Win>
    </Scr>
  );
}

function Widgets({ s }) {
  const list = Array.isArray(s.widgets) && s.widgets.length ? s.widgets.slice(0, 4) : [{ id: "a", kind: "friends", x: 60, y: 120, width: 240, height: 220 }, { id: "b", kind: "calls", x: 1180, y: 120, width: 260, height: 160 }];
  const on = Boolean(s.on);
  const X = 1600;
  const Y = 900;
  return (
    <Scr cls={`pv-wid${on ? "" : " is-hidden"}`}>
      {list.map((w) => (
        <div key={w.id} className="wg" style={{ left: `${Math.min(80, (w.x / X) * 100)}%`, top: `${Math.min(70, (w.y / Y) * 100)}%`, width: `${Math.max(14, Math.min(40, (w.width / X) * 100))}%`, height: `${Math.max(16, Math.min(50, (w.height / Y) * 100))}%` }}>
          <Ico n={w.kind === "calls" ? "phone" : w.kind === "notifications" ? "bell" : "users"} size={11} /><i /><i className="w60" />
        </div>
      ))}
    </Scr>
  );
}

function CommandCenter({ s, t }) {
  const g = { ...GAMING_DEFAULTS.command_center, ...s };
  return (
    <Scr cls="pv-cc" dock={false}>
      <div className="panel">
        {["chat", "users", "phone", "bell"].map((n) => <div key={n} className="tile"><Ico n={n} size={12} /><i /><i className="w60" /></div>)}
      </div>
      <Lbl at="right:5%;bottom:5%">{fmtAccel(t, g.hotkey)}</Lbl>
    </Scr>
  );
}

/* ------------------------------------------------------------ automation */
function Workspace({ s, t }) {
  const ids = ["game", "work", "daily"];
  const active = s.active || "";
  return (
    <div className="ps-scr pv-ws">
      {ids.map((id) => (
        <div key={id} className={`pf${active === id ? " on" : ""}`}>
          <span className="ic"><Ico n={id === "game" ? "gamepad" : id === "work" ? "calendar" : "sparkle"} size={14} /></span>
          <small>{t(`premiumGaming.workspace.names.${id}`)}</small>
          <span className={`dot is-${id === "game" ? "dnd" : "online"}`} />
        </div>
      ))}
    </div>
  );
}

function Automations({ s }) {
  const on = Boolean(s.on);
  return (
    <div className={`ps-scr pv-auto2${on ? "" : " is-paused"}`}>
      <div className="flow">
        <span className="n"><Ico n="gamepad" size={14} /></span>
        <span className="ar" />
        <span className="n"><Ico n="zap" size={14} /></span>
        <span className="ar" />
        <span className="n"><Ico n="moon" size={14} /></span>
      </div>
      <div className="rules">{[0, 1].map((i) => <div key={i} className="ru"><i className={on ? "on" : ""} /><b /></div>)}</div>
    </div>
  );
}

function Timeline() {
  const segs = [["call", 8, 10], ["game", 22, 18], ["call", 46, 6], ["game", 60, 22], ["call", 86, 8]];
  return (
    <div className="ps-scr pv-tline">
      <div className="hours">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
      <div className="bar">{segs.map(([k, l, w], i) => <span key={i} className={`is-${k}`} style={{ left: `${l}%`, width: `${w}%` }} />)}</div>
      <div className="ev">{[30, 70].map((l) => <span key={l} style={{ left: `${l}%` }} />)}</div>
    </div>
  );
}

function MultiAccount() {
  const n = useStoryValue("multi_account.count", 2);
  return (
    <div className="ps-scr pv-acc">
      <div className="st">{Array.from({ length: Math.min(4, n + 1) }, (_, i) => <div key={i} className={`ac${i === 0 ? " main" : ""}`} style={{ transform: `translateX(${i * 18}%)`, zIndex: 5 - i }}><Av i={i} /><span><b /><i /></span></div>)}</div>
    </div>
  );
}

export const PREVIEWS = Object.freeze({
  mini_mode: MiniMode,
  always_on_top: AlwaysOnTop,
  pip_call: PipCall,
  multi_window: MultiWindow,
  window_opacity: WindowOpacity,
  session_restore: SessionRestore,
  tray_controls_plus: TrayControls,
  taskbar_plus: TaskbarPlus,
  window_layouts: WindowLayouts,
  advanced_window_mgmt: AdvancedWindows,
  screen_edge_actions: ScreenEdge,
  custom_layouts: CustomLayouts,
  noise_gate: NoiseGate,
  mic_presets: MicPresets,
  mic_monitor: MicMonitor,
  voice_activity_monitor: VoiceActivity,
  auto_device_switch: AutoDevice,
  audio_routing: AudioRouting,
  audio_device_profiles: DeviceProfiles,
  stream_audio_control: StreamAudio,
  global_mute: GlobalMute,
  global_ptt: GlobalPtt,
  custom_hotkeys: CustomHotkeys,
  media_keys: MediaKeys,
  quick_launcher: QuickLauncher,
  quick_reply: QuickReply,
  per_user_volume_hotkeys: UserVolume,
  notification_history: NotificationHistory,
  focus_mode: FocusMode,
  notification_profiles: NotificationProfiles,
  smart_game_notifications: SmartGame,
  game_status: GameStatus,
  game_session_history: GameHistory,
  voice_hud: (p) => <Hud {...p} />,
  gaming_hud: (p) => <Hud {...p} gaming />,
  instant_clip: InstantClip,
  clipboard_history: ClipboardHistory,
  quick_file_drop: QuickDrop,
  app_lock: AppLock,
  quick_actions: QuickActions,
  desktop_sidebar: DesktopSidebar,
  widgets: Widgets,
  command_center: CommandCenter,
  workspace_profiles: Workspace,
  desktop_automations: Automations,
  activity_timeline: Timeline,
  multi_account: MultiAccount,
});

/** Scene parts shared with the category heroes (./heroes.jsx). */
export const Parts = { Lines, Win, DsWin, Other, Side, CallCard, Av, Bars, Keyboard, Dock, Lbl };

/* ------------------------------------------------------------ chips */
const onCount = (t, list) => t("premium.hub.onCount", { on: list.filter(Boolean).length, total: list.length });

/** Short "what is set" chips of a closed card (the feature is on). */
export function summarize(key, raw, t) {
  const s = raw || {};
  const out = (() => {
    switch (key) {
      case "mini_mode": return [t(`premium.panel.dock.${readDockAnchor()}`)];
      case "always_on_top": return [t("premiumStory.sum.onTop", { n: ["main", "call", "sidebar", "popout"].filter((k) => (typeof s[k] === "boolean" ? s[k] : TOP_DEF[k])).length })];
      case "window_opacity": return [["call", "sidebar", "popout"].map((k) => pctT(t, (typeof s[k] === "number" ? s[k] : 1) * 100)).join(" · ")];
      case "session_restore": return [onCount(t, [s.popouts !== false, s.mini !== false, s.bounds !== false])];
      case "taskbar_plus": return [onCount(t, [s.badge !== false, s.buttons !== false])];
      case "advanced_window_mgmt": return [onCount(t, [s.snap !== false, s.keepVisible !== false, s.mainMonitor !== false])];
      case "screen_edge_actions": return [s.edge === "left" ? t("premium.panel.edgeLeft") : t("premium.panel.edgeRight"), t("premium.panel.edgeDelayValue", { ms: [0, 250, 500, 1000].includes(s.delay) ? s.delay : 250 })];
      case "noise_gate": { const g = { ...AUDIO_DEFAULTS.noise_gate, ...s }; return [t("premiumAudio.common.db", { n: g.thresholdDb }), t("premiumAudio.common.ms", { n: g.holdMs })]; }
      case "mic_presets": return [pctT(t, num(s.gain, 100))];
      case "mic_monitor": return [pctT(t, num(s.volume, 80))];
      case "auto_device_switch": return [s.headsetFirst !== false ? t("premiumStory.sum.headsetFirst") : t("premiumStory.sum.devices", { n: (s.inputOrder || []).length + (s.outputOrder || []).length })];
      case "audio_routing": return [(s.callOutput || "") === (s.notificationOutput || "") ? t("premiumStory.sum.oneOutput") : t("premiumStory.sum.twoOutputs")];
      case "audio_device_profiles": return [t("premiumStory.sum.profiles", { n: (s.profiles || []).length })];
      case "stream_audio_control": { const g = { ...AUDIO_DEFAULTS.stream_audio_control, ...s }; return [g.sendMuted ? t("premiumStory.off") : pctT(t, g.sendVolume), g.viewMuted ? t("premiumStory.off") : pctT(t, g.viewVolume)]; }
      case "global_mute": return [fmtAccel(t, DEFAULT_BINDINGS.toggle_mute)];
      case "global_ptt": return [s.forceToggle ? t("premiumAudio.ptt.forceToggle") : t("premiumAudio.common.ms", { n: num(s.releaseDelayMs, 150) })];
      case "custom_hotkeys": return [t("premiumStory.sum.hotkeys", { n: Object.keys(DEFAULT_BINDINGS).length })];
      case "media_keys": { const v = { playPause: "toggle_mute", next: "toggle_deafen", previous: "none", stop: "none", ...s }; return [onCount(t, ["playPause", "next", "previous", "stop"].map((k) => v[k] !== "none"))]; }
      case "quick_launcher": return [fmtAccel(t, DEFAULT_BINDINGS.quick_launcher)];
      case "per_user_volume_hotkeys": return [`±${pctT(t, num(s.step, 10))}`];
      case "focus_mode": { const left = Math.ceil((Number(s.until) - Date.now()) / 60000); return [left > 0 ? t("premiumAudio.focus.activeFor", { minutes: left }) : t("premiumAudio.focus.inactive")]; }
      case "notification_profiles": { const m = s.mode || "auto"; return [m === "auto" ? t("premiumAudio.rules.auto") : t(`premiumAudio.rules.activity.${m}`)]; }
      case "voice_hud":
      case "gaming_hud": { const g = { ...GAMING_DEFAULTS[key], ...s }; return [g.on ? t(`premiumGaming.common.corner.${g.corner}`) : t("premiumStory.sum.hidden")]; }
      case "instant_clip": { const g = { ...GAMING_DEFAULTS.instant_clip, ...s }; return [t(g.windowSec === 60 ? "premiumGaming.instantClip.sec60" : "premiumGaming.instantClip.sec30"), fmtAccel(t, g.hotkey)]; }
      case "clipboard_history":
      case "quick_file_drop":
      case "desktop_automations":
        return [s.on ? t("premiumStory.on") : t("premiumStory.sum.paused")];
      case "quick_actions": return [t("premiumStory.sum.actions", { n: (s.items || []).length })];
      case "desktop_sidebar": return [s.edge === "left" ? t("premium.panel.edgeLeft") : t("premium.panel.edgeRight"), ...(s.autoHide !== false ? [t("premium.panel.autoHide")] : [])];
      case "widgets": return [t("premiumStory.sum.widgets", { n: (s.widgets || []).length })];
      case "command_center": return [fmtAccel(t, s.hotkey || GAMING_DEFAULTS.command_center.hotkey)];
      case "workspace_profiles": return s.active ? [t(`premiumGaming.workspace.names.${s.active}`)] : [];
      default: return [];
    }
  })();
  return out.length ? out : [t("premiumStory.on")];
}
