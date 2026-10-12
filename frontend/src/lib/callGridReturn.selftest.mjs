/**
 * After a screen share ends, the stage must be the equal grid again.
 * Run: node frontend/src/lib/callGridReturn.selftest.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const grid = read("src/styles/call-grid.css");
assert(grid.includes("transform: none !important"), "grid children must ignore a leftover share transform");
assert(grid.includes(".call-stage-stack"), "stage stack class missing");

const overlay = read("src/components/CallOverlay.jsx");
const gridFn = overlay.slice(overlay.indexOf("function ParticipantGrid"), overlay.indexOf("function ScreenShareLayout"));
assert(!gridFn.includes("layout"), "participant grid must not use framer layout projection");
assert(overlay.includes("returningFromShare"), "share end must spring the equal grid back in");
assert(overlay.includes('if (!anyScreenShare && screenExpanded) setScreenExpanded(false)'), "fullscreen share must reset when the share ends");

const stop = overlay.slice(overlay.indexOf("function ScreenShareLayout"), overlay.indexOf("function CircleBtn"));
assert(stop.includes('if (!ids.length && shareLayout !== "stage") setShareLayout("stage")'), "empty sharer list must leave stage layout");

const voice = read("src/components/servers/ServerVoicePanel.jsx");
assert(voice.includes("returningFromShare"), "server voice must spring back when a share ends");
assert(voice.includes("setScreenExpand({ token: 0, id: null })"), "server voice expand state must reset");

const dm = read("src/hooks/useCall.js");
assert(dm.includes("remoteCameraTrackIdsRef.current.has(track.id)"), "DM share stop must drop non-camera video");

const servers = read("src/styles/servers.css");
assert(servers.includes(".server-voice-room-stage:not(.is-sharing) .server-voice-tile"), "server tiles must leave the share rail");

console.log("callGridReturn.selftest ok");
