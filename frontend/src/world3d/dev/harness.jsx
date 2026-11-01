/**
 * Dev-only harness for the 3D world (world3d-harness.html on the Vite dev server).
 * Mounts the real World3DView against a local /world namespace
 * (e2e/world3d/worldMockServer.cjs runs backend/socket/worldHandlers.js with bots).
 * Query: ?port=4791&me=demir&name=Demir&speakers=ayse,zeynep&quality=high&lang=tr
 */
import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { LocaleProvider } from "../../context/LocaleContext";
import World3DView from "../World3DView.jsx";

const q = new URLSearchParams(window.location.search);
const port = q.get("port") || "4791";
const meId = q.get("me") || "demir";
const meName = q.get("name") || "Demir";
const speakers = (q.get("speakers") || "").split(",").filter(Boolean);
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
  const [exited, setExited] = useState(null);
  if (exited) return <p style={{ color: "#fff", font: "16px sans-serif", padding: 24 }}>exit: {exited}</p>;
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <World3DView
        kind="voice"
        roomId="c1"
        title={q.get("title") || "Hafta Sonu Ekibi"}
        me={me}
        members={[]}
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
