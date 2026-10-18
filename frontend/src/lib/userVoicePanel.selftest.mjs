// node src/lib/userVoicePanel.selftest.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  activityGameName,
  deriveVoiceSession,
  matchVoiceShortcut,
  pingTone,
  readDeafenPref,
  sessionRoomLabel,
  shouldShowUserVoicePanel,
  smoothPing,
  statusSubline,
  writeDeafenPref,
} from "./userVoicePanel.js";

const T = { "uvp.playing": "{name} oynuyor", "uvp.voiceRoom": "Sesli oda", "uvp.videoRoom": "Görüntülü oda", "uvp.directCall": "Sesli arama", Group: "Grup" };
const t = (k, v = {}) => (T[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? "");

// Ping thresholds: < 80 green, 80–200 amber, > 200 red.
assert.equal(pingTone(null), "unknown");
assert.equal(pingTone(undefined), "unknown");
assert.equal(pingTone(-1), "unknown");
assert.equal(pingTone(24), "good");
assert.equal(pingTone(79), "good");
assert.equal(pingTone(80), "warn");
assert.equal(pingTone(200), "warn");
assert.equal(pingTone(201), "bad");
assert.equal(smoothPing([30, 900, 40]), 40, "median ignores one slow ack");
assert.equal(smoothPing([]), null);
assert.equal(smoothPing([10, 20, 30, 50, 70]), 50, "last 3 only");

// Idle.
const idle = deriveVoiceSession({});
assert.equal(idle.kind, "none");
assert.equal(idle.phase, "idle");
assert.equal(deriveVoiceSession({ call: { mode: "incoming", peer: { username: "x" } } }).kind, "none", "ringing is not connected");

// DM: outgoing = connecting, active+connected = connected, media RTT used.
const dmOut = deriveVoiceSession({ call: { mode: "outgoing", peer: { displayName: "Yiğit" } } });
assert.deepEqual([dmOut.kind, dmOut.phase, dmOut.title, dmOut.canScreenShare], ["dm", "connecting", "Yiğit", false]);
const dm = deriveVoiceSession({ call: { mode: "active", peerConnectionState: "connected", peer: { username: "yigit" }, muted: true, deafened: false, networkStats: { rttMs: 31.6 } } });
assert.deepEqual([dm.phase, dm.title, dm.muted, dm.mediaRtt, dm.canScreenShare], ["connected", "yigit", true, 32, true]);
assert.equal(deriveVoiceSession({ call: { mode: "active", peerConnectionState: "connecting", peer: {} } }).phase, "connecting");
assert.equal(sessionRoomLabel(dm, t), "yigit");

// Group: name from the groups list.
const grp = deriveVoiceSession({ groupCall: { isInCall: true, activeGroupId: 7, isMuted: false, deafened: true, isScreenSharing: true, callType: "voice" }, groups: [{ id: "7", name: "BizBize" }] });
assert.deepEqual([grp.kind, grp.phase, grp.title, grp.deafened, grp.screenSharing], ["group", "connected", "BizBize", true, true]);
assert.equal(sessionRoomLabel(grp, t), "BizBize / Sesli oda");

// Server voice: "Sunucu / Kanal", connecting state, wins over others.
const srv = deriveVoiceSession({
  serverVoice: { isInVoice: true, connecting: false, activeServerId: "s1", channelName: "ZIPPIS 2.0", canStream: false },
  servers: [{ id: "s1", name: "BizBize" }],
  call: { mode: "active", peer: {} },
});
assert.deepEqual([srv.kind, srv.phase, srv.canScreenShare], ["server", "connected", false]);
assert.equal(sessionRoomLabel(srv, t), "BizBize / ZIPPIS 2.0");
assert.equal(deriveVoiceSession({ serverVoice: { isInVoice: false, connecting: true, channelName: "Genel" } }).phase, "connecting");

// Shortcuts.
assert.equal(matchVoiceShortcut({ ctrlKey: true, shiftKey: true, key: "M" }), "mute");
assert.equal(matchVoiceShortcut({ metaKey: true, shiftKey: true, key: "d" }), "deafen");
assert.equal(matchVoiceShortcut({ ctrlKey: true, shiftKey: true, key: "x", code: "KeyD" }), "deafen", "layout-independent code");
assert.equal(matchVoiceShortcut({ ctrlKey: true, key: "m" }), null, "needs Shift");
assert.equal(matchVoiceShortcut({ ctrlKey: true, shiftKey: true, altKey: true, key: "m" }), null);
assert.equal(matchVoiceShortcut({ ctrlKey: true, shiftKey: true, key: "m", repeat: true }), null);

// Status line: "Boşta · Minecraft oynuyor"; narrow keeps only the game.
assert.equal(activityGameName({ displayName: "Playing Minecraft" }), "Minecraft");
assert.equal(activityGameName({ name: "Minecraft" }), "Minecraft");
assert.equal(activityGameName(null), "");
assert.equal(statusSubline({ statusLabel: "Boşta", game: "Minecraft", t }).text, "Boşta · Minecraft oynuyor");
const nar = statusSubline({ statusLabel: "Boşta", game: "Minecraft", narrow: true, t });
assert.deepEqual([nar.text, nar.title, nar.hasGame], ["Minecraft", "Minecraft oynuyor", true]);
assert.deepEqual([statusSubline({ statusLabel: "Çevrimiçi", customStatus: "💬 kod", t }).text, statusSubline({ statusLabel: "Çevrimiçi", t }).hasGame], ["💬 kod", false]);

// Deafen preference round-trip.
const mem = new Map();
const s = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
assert.equal(readDeafenPref(s), false);
writeDeafenPref(true, s);
assert.equal(readDeafenPref(s), true);

// Web + Electron desktop only.
assert.equal(shouldShowUserVoicePanel({ isMobile: false, glassShell: false, native: false, view: "chat" }), true);
assert.equal(shouldShowUserVoicePanel({ isMobile: true, glassShell: false, native: false, view: "chat" }), false);
assert.equal(shouldShowUserVoicePanel({ isMobile: false, glassShell: true, native: false, view: "chat" }), false);
assert.equal(shouldShowUserVoicePanel({ isMobile: false, glassShell: false, native: true, view: "chat" }), false, "iPad app");
assert.equal(shouldShowUserVoicePanel({ isMobile: false, glassShell: false, native: false, view: "play" }), false);

// Source contracts.
const here = new URL(".", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, here), "utf8");
const panel = read("../components/layout/UserVoicePanel.jsx");
for (const needle of ["CallDeviceMenu", "inputMenuGroups", "outputMenuGroups", "toggleDeafen", "leaveCall", "endCall", "serverVoice?.leave", "startScreenShare", "app:ping", "matchVoiceShortcut", "useReducedMotion"]) {
  assert.ok(panel.includes(needle), `panel uses ${needle}`);
}
assert.ok(!/valorant|riot/i.test(panel + read("./userVoicePanel.js")), "no Valorant/Riot in the panel");
const layout = read("../components/layout/AppLayout.jsx");
assert.ok(layout.includes("<UserVoicePanel") && layout.includes("has-uvp"), "AppLayout mounts the panel");
const rail = read("../components/layout/NavigationRail.jsx");
assert.ok(rail.includes("UVP_STATUS_EVENT") && rail.includes("[data-uvp-avatar]"), "panel avatar opens the rail status picker");
const css = read("../styles/user-voice-panel.css");
assert.ok(/\.app-root\.has-uvp \.nav-rail-bottom\s*\{\s*display:\s*none/.test(css), "lone rail avatar hidden");
assert.ok(/backdrop-filter:\s*blur\((4[0-9]|[5-9][0-9])px\)/.test(css), "heavy blur ≥ 40px");
const base = css.match(/--uvp-base:\s*([^;]+);/)[1];
assert.ok(/8[0-9]%|9[0-9]%|0\.9/.test(base), "high-opacity tinted base (never see-through)");
assert.ok(css.includes("prefers-reduced-motion") && css.includes("prefers-reduced-transparency"), "a11y fallbacks");
const tr = read("../i18n/locales/tr.js");
for (const [k, v] of [["uvp.noVoice", "Ses bağlantısı yok"], ["uvp.connected", "Ses Bağlantısı Kuruldu"], ["uvp.share", "Ekran paylaş"], ["uvp.playing", "{name} oynuyor"]]) {
  assert.ok(tr.includes(`"${k}": "${v}"`), `tr ${k}`);
}
// ServerVoicePanel: `sharing` must be declared before the effect that reads it.
const svp = read("../components/servers/ServerVoicePanel.jsx");
assert.ok(svp.indexOf("const sharing = screenSharers.length > 0;") < svp.indexOf("}, [sharing]);"), "no TDZ on voice join");
console.log("userVoicePanel selftest ok");
