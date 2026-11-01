/**
 * Dev-only harness for the 3D world (world3d-harness.html on the Vite dev server).
 * Mounts the real World3DView against a local /world namespace
 * (e2e/world3d/worldMockServer.cjs runs backend/socket/worldHandlers.js with bots).
 * Query: ?port=4791&me=demir&name=Demir&speakers=ayse,zeynep&quality=high&lang=tr
 * &fakeVoice=1 gives every member a synthetic microphone (an oscillator gated on and off
 * in turns), so the real speaking detection runs as in a call (perf probe).
 */
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { LocaleProvider } from "../../context/LocaleContext";
import World3DView from "../World3DView.jsx";

const q = new URLSearchParams(window.location.search);
const port = q.get("port") || "4791";
const meId = q.get("me") || "demir";
const meName = q.get("name") || "Demir";
const speakers = (q.get("speakers") || "").split(",").filter(Boolean);
const FAKE_IDS = ["demir", "ayse", "mert", "zeynep", "can", "elif", "burak", "selin"];

/** Synthetic call members: one oscillator per person, audible for ~1.2 s in turns. */
function fakeVoiceMembers() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return [];
  const ctx = new AC();
  return FAKE_IDS.map((id, i) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = 140 + i * 23;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    const period = 2700 + i * 310;
    setInterval(() => {
      gain.gain.setTargetAtTime(0.6, ctx.currentTime, 0.01);
      setTimeout(() => gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01), 1200);
    }, period);
    return { id, name: id[0].toUpperCase() + id.slice(1), stream: dest.stream, muted: false };
  });
}
// looks=ayse:0,mert:1 pins outfits (character sheet comparisons)
const lookOverrides = Object.fromEntries((q.get("looks") || "").split(",").filter(Boolean).map((kv) => {
  const [k, v] = kv.split(":");
  return [k, Number(v)];
}));
if (q.get("quality")) localStorage.setItem("descall:world3d:quality", q.get("quality"));
if (q.get("lang")) localStorage.setItem("descall_language", q.get("lang"));

function Harness() {
  const [muted, setMuted] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const me = useMemo(() => ({ id: meId, username: meName.toLowerCase(), displayName: meName, is_admin: true }), []);
  const active = useMemo(() => new Set(speakers), []);
  const baseMembers = useMemo(() => (q.get("fakeVoice") === "1" ? fakeVoiceMembers() : []), []);
  // the real call overlays re-render at least once a second (duration clock) and pass a
  // fresh members array every time: do the same here so the probe sees that churn
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (q.get("fakeVoice") !== "1") return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const members = baseMembers.map((m) => ({ ...m, tick }));
  const [exited, setExited] = useState(null);
  if (exited) return <p style={{ color: "#fff", font: "16px sans-serif", padding: 24 }}>exit: {exited}</p>;
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <World3DView
        kind="voice"
        roomId="c1"
        title={q.get("title") || "Hafta Sonu Ekibi"}
        me={me}
        members={members}
        voice={{ muted, deafened: deaf, toggleMute: () => setMuted((v) => !v), toggleDeafen: () => setDeaf((v) => !v), toggleScreen: () => {}, toggleCamera: () => {} }}
        socketUrl={`http://127.0.0.1:${port}`}
        socketPath="/socket.io"
        token={meId}
        activeSpeakerIds={active}
        allowSoftware
        lookOverrides={lookOverrides}
        onExit={(r) => setExited(r)}
        onFallback={(r) => setExited(`fallback:${r}`)}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <Harness />
  </LocaleProvider>
);
