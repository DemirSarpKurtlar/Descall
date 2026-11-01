/**
 * Dev-only harness for the 3D world (world3d-harness.html on the Vite dev server).
 * Mounts the real World3DView against a local /world namespace
 * (e2e/world3d/worldMockServer.cjs runs backend/socket/worldHandlers.js with bots).
 * Query: ?port=4791&me=demir&name=Demir&speakers=ayse,zeynep&quality=high&lang=tr
 *
 * Room preview (no socket, engine only): ?room=cinema|game-room|camp|living-room
 *   [&quality=high][&screen=demo|off]. The cast in roomCasts.js sits down through the
 *   engine's own paths (local sitOn, remote snapshots via onSnaps). Evidence capture
 *   steps frames by hand: window.__roomPreview.step(n).
 */
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocaleProvider } from "../../context/LocaleContext";
import World3DView from "../World3DView.jsx";
import { ROOM_CASTS } from "./roomCasts.js";

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

/** Average colour of an image (for the screen glow of a static demo picture). */
function imageColor(img) {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 9;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, 16, 9);
  const d = ctx.getImageData(0, 0, 16, 9).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = (d.length / 4) * 255;
  return [r / n, g / n, b / n];
}

function RoomPreview({ roomId }) {
  const canvasRef = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let engine = null;
    (async () => {
      const [{ WorldEngine }, { PRESETS }, { STATE, EMOTES }, { Texture }, { Color3 }] = await Promise.all([
        import("../engine/index.js"),
        import("../engine/quality.js"),
        import("../net/protocol.js"),
        import("@babylonjs/core/Materials/Textures/texture"),
        import("@babylonjs/core/Maths/math.color"),
      ]);
      const cast = ROOM_CASTS[roomId] || [];
      const looks = Object.fromEntries(cast.map((c) => [c.id, c.look ?? 0]));
      const quality = PRESETS[q.get("quality") || "high"] || PRESETS.high;
      engine = new WorldEngine(canvasRef.current, { roomId, quality, selfId: cast[0]?.id || "me", lookOverrides: { ...looks, ...lookOverrides } });
      await engine.init();
      window.__descallWorld = engine;
      engine.lockQuality = true;
      engine.setMembers(cast.map((c) => ({ id: c.id })));
      const seatIndex = (name) => engine.seats.findIndex((s) => s.name === name);
      const self = cast[0];
      if (self) {
        const k = seatIndex(self.seat);
        const s = engine.seats[k];
        if (s) {
          // stand on the seat's approach point (or just in front of it), then sit: the real path
          const front = s.approach ? s.approach.clone() : s.pos.add(new s.pos.constructor(Math.sin(s.yaw) * 0.64, 0, Math.cos(s.yaw) * 0.64));
          engine.local.pos.set(front.x, s.pos.y, front.z);
          engine.sitOn(k);
        }
      }
      const others = cast.slice(1);
      const feed = () => {
        const t = engine.nowMs();
        const rows = [];
        for (const c of others) {
          const k = seatIndex(c.seat);
          const s = engine.seats[k];
          if (!s) continue;
          const em = c.emote ? EMOTES.indexOf(c.emote) : 0;
          const seq = c.emote ? (1 + Math.floor(t / 1000 / (c.every || 999))) & 255 : 0;
          rows.push([c.id, s.pos.x, 0, s.pos.z, s.yaw, STATE.sit, em, seq, k]);
        }
        engine.onSnaps({ t, s: rows }, t);
      };
      feed();
      const screenMode = q.get("screen") || "demo";
      if (engine.roomRuntime?.screen && screenMode === "demo") {
        const url = new URL("./screen-demo.jpg", import.meta.url).href;
        const img = new Image();
        img.src = url;
        await img.decode();
        const tex = new Texture(url, engine.scene, false, false);
        const c = imageColor(img);
        engine.roomRuntime.screen.setSource({ texture: tex, color: new Color3(c[0], c[1], c[2]) });
      }
      // draft evidence: deal the hands shown in scene-2.jpg (production shows idle tables)
      if (q.get("dressing")) for (const p of engine.roomRuntime?.props || []) p.redress?.(q.get("dressing"));
      const robot = (engine.roomRuntime?.props || []).find((p) => p.kind === "robot");
      if (robot && q.get("robot")) robot.play(q.get("robot"), true);
      window.__roomPreview = {
        roomId,
        cast,
        step(n = 1) {
          for (let i = 0; i < n; i += 1) {
            feed();
            engine.manualStep(1);
          }
        },
        layoutFromGlb() {
          // the phase 1 GLB parse, printed as a layout module (living room migration / checks)
          const L = engine.roomState.glbLayout;
          const r = (v) => Math.round(v * 1e6) / 1e6;
          return {
            id: roomId,
            bounds: L.bounds && Object.fromEntries(Object.entries(L.bounds).map(([k, v]) => [k, r(v)])),
            colliders: L.boxes.map((b) => ({ name: b.name, cx: r(b.cx), cz: r(b.cz), hx: r(b.hx), hz: r(b.hz), angle: r(Math.atan2(b.sin, b.cos)) })),
            seats: L.seats.map((s) => ({ name: s.name, type: /beanbag/.test(s.name) ? "beanbag" : "sofa", pos: [r(s.pos.x), 0, r(s.pos.z)], yaw: r(s.yaw), height: r(s.height) })),
            spawns: L.spawns.map((p) => [r(p.x), r(p.y), r(p.z)]),
            floors: [],
            hero: L.hero && { pos: [r(L.hero.pos.x), r(L.hero.pos.y), r(L.hero.pos.z)], target: [r(L.hero.target.x), r(L.hero.target.y), r(L.hero.target.z)], fov: 1.211 },
            anchors: {},
          };
        },
      };
    })().catch((e) => {
      console.error(e);
      setErr(String(e?.stack || e));
    });
    return () => engine?.dispose();
  }, [roomId]);
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", outline: "none" }} />
      {err && <pre style={{ position: "fixed", top: 0, left: 0, color: "#f88", font: "12px monospace" }}>{err}</pre>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  q.get("room") ? (
    <RoomPreview roomId={q.get("room")} />
  ) : (
    <LocaleProvider>
      <Harness />
    </LocaleProvider>
  )
);
