/**
 * Hero scenes of the Descall+ category pages (approved draft E): one picture of the whole
 * category with numbered markers. pin(key, style) draws the marker of a feature (its card
 * number); clicking it opens that card. Decorative apart from the markers.
 */
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { Ico } from "./icons.jsx";
import { Parts, st } from "./previews.jsx";

const { Lines, Win, DsWin, Other, Side, CallCard, Av, Bars, Keyboard, Dock } = Parts;
const P = (s) => st(s);

function Windows({ pin }) {
  return (
    <div className="ps-scene">
      <Other at="left:20%;top:12%;width:46%;height:58%" />
      <DsWin at="left:4%;top:8%;width:30%;height:54%" />
      <Win cls="ds pop" at="left:36%;top:44%;width:22%;height:30%"><span className="pt" /><Lines n={2} /></Win>
      <Side at="right:0;top:0;width:9%;height:84%" />
      <Win cls="ds call" at="left:68%;top:9%;width:20%;height:30%"><div className="vid"><i /><i /></div></Win>
      <CallCard at="right:12%;bottom:17%;width:24%" />
      <Dock />
      {pin("mini_mode", P("right:34%;bottom:30%"))}
      {pin("pip_call", P("left:66%;top:3%"))}
      {pin("multi_window", P("left:55%;top:40%"))}
      {pin("window_layouts", P("left:2%;top:3%"))}
      {pin("screen_edge_actions", P("right:6%;top:40%"))}
      {pin("taskbar_plus", P("left:56%;bottom:2%"))}
    </div>
  );
}

function Audio({ pin, s, t }) {
  const gate = { ...AUDIO_DEFAULTS.noise_gate, ...(s.noise_gate || {}) };
  const gain = Number((s.mic_presets || {}).gain ?? 100);
  const nodes = [
    ["voice_activity_monitor", "mic", t("premiumAudio.profiles.part.input"), ""],
    ["noise_gate", "gate", t("premiumStory.hero.gate"), t("premiumAudio.common.db", { n: gate.thresholdDb })],
    ["mic_presets", "sliders", t("premiumAudio.profiles.part.preset"), t("premium.panel.opacityValue", { value: gain })],
    ["audio_routing", "route", t("premiumStory.hero.route"), ""],
    ["auto_device_switch", "head", t("premiumAudio.profiles.part.output"), ""],
  ];
  return (
    <div className="ps-scene is-audio">
      <div className="chain">
        {nodes.map(([k, ic, a, b], i) => (
          <div key={k} className="cn-wrap">
            {i ? <span className="cw" aria-hidden="true"><Bars n={7} level={1} /></span> : null}
            <div className="cn">
              {pin(k, P("position:absolute;top:-10px;right:2px"))}
              <span className="ci"><Ico n={ic} size={18} /></span>
              <b>{a}</b>
              {b ? <small className="tnum">{b}</small> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shortcuts({ pin }) {
  return (
    <div className="ps-scene is-keys">
      <div className="kb-wrap"><Keyboard hot={[-1, -2, 26, 18]} /></div>
      <div className="mouse"><span className="side" /><i className="wheel" /></div>
      <div className="media"><span><Ico n="prev" size={11} /></span><span className="on"><Ico n="play" size={11} /></span><span><Ico n="next" size={11} /></span></div>
      <div className="toast"><Av i={1} /><span><b /><i /></span><span className="rep"><Ico n="reply" size={10} /></span></div>
      <div className="pal"><Ico n="sparkle" size={10} /><i /></div>
      {pin("global_mute", P("left:46%;top:44%"))}
      {pin("global_ptt", P("right:3%;top:46%"))}
      {pin("per_user_volume_hotkeys", P("left:66%;bottom:12%"))}
      {pin("custom_hotkeys", P("left:4%;bottom:12%"))}
      {pin("media_keys", P("left:1%;top:5%"))}
      {pin("quick_launcher", P("left:29%;top:5%"))}
      {pin("quick_reply", P("right:4%;top:6%"))}
    </div>
  );
}

function Notifications({ pin }) {
  return (
    <div className="ps-scene is-notif">
      <DsWin at="left:4%;top:8%;width:42%;height:66%" />
      <div className="game" />
      <div className="held"><Ico n="bell" size={12} /><b className="tnum">3</b></div>
      <div className="moon"><Ico n="moon" size={18} /></div>
      <div className="modes"><span className="on"><Ico n="bell" size={11} /></span><span><Ico n="gamepad" size={11} /></span><span><Ico n="calendar" size={11} /></span></div>
      <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="n"><Av i={i} /><span><b /><i /></span></div>)}</div>
      <Dock />
      {pin("focus_mode", P("left:44%;top:6%"))}
      {pin("notification_profiles", P("left:4%;bottom:6%"))}
      {pin("smart_game_notifications", P("left:56%;bottom:34%"))}
      {pin("notification_history", P("right:3%;top:6%"))}
    </div>
  );
}

function Gaming({ pin }) {
  return (
    <div className="ps-scene is-game">
      <div className="game" />
      <div className="hud l">{[0, 1, 2].map((i) => <div key={i} className="hr"><Av i={i} talk={i === 0} /><i /></div>)}</div>
      <div className="hud r"><div className="hr"><Ico n="clock" size={10} /><i /></div><div className="hr"><Ico n="signal" size={10} /><i className="w40" /></div><div className="hr"><Ico n="users" size={10} /><i className="w60" /></div></div>
      <div className="tl"><span className="buf" /><span className="now" /></div>
      <div className="gcard"><Av i={4} /><span><b /><small><Ico n="gamepad" size={10} /><i /></small></span></div>
      <div className="gbars">{[90, 60, 35].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div>
      {pin("voice_hud", P("left:3%;top:4%"))}
      {pin("gaming_hud", P("right:3%;top:4%"))}
      {pin("instant_clip", P("left:47%;bottom:24%"))}
      {pin("game_status", P("left:3%;bottom:30%"))}
      {pin("game_session_history", P("right:3%;bottom:30%"))}
    </div>
  );
}

function Productivity({ pin }) {
  return (
    <div className="ps-scene is-prod">
      <DsWin at="left:4%;top:8%;width:52%;height:70%" />
      <div className="qa">{["user", "vol", "moon", "chat"].map((n) => <span key={n}><Ico n={n} size={12} /></span>)}</div>
      <div className="clips">{[0, 1, 2].map((i) => <div key={i} className="cb" style={{ transform: `translate(${i * 7}px, ${i * 8}px)` }}><Ico n="copy" size={10} /><i /></div>)}</div>
      <div className="zone"><Ico n="down" size={13} /></div>
      <span className="file"><Ico n="file" size={14} /></span>
      <div className="lockp"><Ico n="lock" size={16} /><span>{[0, 1, 2, 3].map((i) => <i key={i} />)}</span></div>
      <Dock />
      {pin("quick_actions", P("left:4%;bottom:4%"))}
      {pin("clipboard_history", P("left:58%;top:4%"))}
      {pin("quick_file_drop", P("right:3%;top:30%"))}
      {pin("app_lock", P("left:60%;bottom:12%"))}
    </div>
  );
}

function DesktopTools({ pin }) {
  return (
    <div className="ps-scene is-desk">
      <Other at="left:6%;top:10%;width:48%;height:58%" />
      <Side at="right:0;top:0;width:10%;height:84%" />
      <div className="wg" style={P("left:58%;top:10%;width:20%;height:30%")}><Ico n="users" size={10} /><i /><i className="w60" /></div>
      <div className="wg" style={P("left:58%;top:46%;width:20%;height:22%")}><Ico n="phone" size={10} /><i /></div>
      <div className="ccp">{["chat", "users", "phone", "bell"].map((n) => <span key={n}><Ico n={n} size={11} /></span>)}</div>
      <Dock />
      {pin("desktop_sidebar", P("right:7%;top:6%"))}
      {pin("widgets", P("left:56%;top:4%"))}
      {pin("command_center", P("left:20%;bottom:26%"))}
    </div>
  );
}

function Automation({ pin, t }) {
  return (
    <div className="ps-scene is-auto">
      <div className="flow">
        <span className="n"><Ico n="gamepad" size={15} /></span>
        <span className="ar" />
        <span className="n wide">
          {["game", "work", "daily"].map((id, i) => <span key={id} className={i === 0 ? "on" : ""}>{t(`premiumGaming.workspace.names.${id}`)}</span>)}
        </span>
      </div>
      <div className="tl">{[["call", 6, 12], ["game", 24, 24], ["call", 54, 8], ["game", 68, 20]].map(([k, l, w], i) => <span key={i} className={`is-${k}`} style={{ left: `${l}%`, width: `${w}%` }} />)}</div>
      <div className="acc">{[0, 1, 2].map((i) => <Av key={i} i={i} />)}</div>
      {pin("workspace_profiles", P("left:40%;top:8%"))}
      {pin("desktop_automations", P("left:4%;top:8%"))}
      {pin("activity_timeline", P("left:4%;bottom:34%"))}
      {pin("multi_account", P("right:4%;bottom:8%"))}
    </div>
  );
}

export const HEROES = Object.freeze({
  windows: Windows,
  audio: Audio,
  shortcuts: Shortcuts,
  notifications: Notifications,
  gaming: Gaming,
  productivity: Productivity,
  desktop_tools: DesktopTools,
  automation: Automation,
});
