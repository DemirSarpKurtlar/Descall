// node src/lib/softGate.selftest.mjs — calls-03: the voice gate is a soft
// expander, never a hard cut to digital zero, and it does not clip word edges.
import assert from "node:assert/strict";
import { SOFT_GATE_DEFAULTS, createSoftGate } from "./softGateWorklet.js";
import { gateSettings } from "./voiceProfile.js";

const SR = 48000;
const B = 128;
const db = (x) => 20 * Math.log10(x + 1e-12);
const block = (amp, freq = 220, t0 = 0) => {
  const a = new Float32Array(B);
  for (let i = 0; i < B; i += 1) a[i] = amp * Math.sin(2 * Math.PI * freq * (t0 + i) / SR) * Math.SQRT2;
  return a;
};
function run(gate, levelsDb) {
  const out = [];
  let t = 0;
  for (const l of levelsDb) {
    const input = block(l == null ? 0 : Math.pow(10, l / 20), 220, t);
    const o = new Float32Array(B);
    gate.process([input], [o]);
    let s = 0;
    for (const x of o) s += x * x;
    out.push(Math.sqrt(s / B));
    t += B;
  }
  return out;
}
const blocks = (ms) => Math.round((ms / 1000) * SR / B);
const rep = (n, v) => Array.from({ length: n }, () => v);

// 1) Closed = a -30 dB floor, not digital zero (no DTX on/off at every pause).
{
  const g = createSoftGate(gateSettings("on"), SR, B);
  const out = run(g, rep(blocks(1000), -75)); // steady residual noise below the close threshold
  const last = out[out.length - 1];
  assert.ok(last > 0, "never exact zero");
  assert.ok(Math.abs(db(last) - (-75 - 30)) < 1.5, `floor -30 dB under the input, got ${db(last).toFixed(1)}`);
}

// 2) Word onset passes: within 10 ms of a -40 dB syllable the gain is back above -1 dB.
{
  const g = createSoftGate(gateSettings("on"), SR, B);
  run(g, rep(blocks(500), -80));
  const out = run(g, rep(blocks(30), -40));
  const after10ms = out[blocks(10)];
  assert.ok(db(after10ms) > -41, `onset ${db(after10ms).toFixed(1)} dBFS`);
}

// 3) A short dip inside a word (consonant, 150 ms below close) never closes it.
{
  const g = createSoftGate(gateSettings("on"), SR, B);
  run(g, rep(blocks(300), -35));
  const dip = run(g, rep(blocks(150), -75));
  for (const x of dip) assert.ok(db(x) > -76, "held open through the dip (gain 1)");
  assert.equal(g.isOpen, true);
}

// 4) After the hold, the ending fades (release), it is not cut: 20 ms after
//    closing the gain is still well above the floor.
{
  const g = createSoftGate(gateSettings("on"), SR, B);
  run(g, rep(blocks(300), -35));
  const tail = run(g, rep(blocks(1000), -75));
  const holdEnd = blocks(gateSettings("on").holdMs) + 2;
  const gainDb = (x) => db(x) - (-75);
  assert.ok(gainDb(tail[holdEnd + blocks(20)]) > -6, "20 ms into the release the ending is still audible");
  assert.ok(gainDb(tail[tail.length - 1]) < -25, "then it settles at the floor");
}

// 5) Settings: soft parameters present, strong mode a deeper floor, Descall+
//    gate params (thresholds + hold only) still work with the defaults.
assert.equal(gateSettings("on").floorDb, -30);
assert.ok(gateSettings("strong").floorDb < gateSettings("on").floorDb);
assert.ok(gateSettings("on").holdMs >= 200, "hold covers pauses between words");
{
  const g = createSoftGate({ openThreshold: -52, closeThreshold: -62, holdMs: 120 }, SR, B);
  const out = run(g, rep(blocks(500), -80));
  assert.ok(out[out.length - 1] > 0);
  assert.equal(SOFT_GATE_DEFAULTS.floorDb, -30);
}
// 6) Bad options fall back to the defaults (no NaN gain).
{
  const g = createSoftGate({ openThreshold: "x", floorDb: NaN, closeThreshold: -20 }, SR, B);
  const out = run(g, rep(10, -50));
  for (const x of out) assert.ok(Number.isFinite(x));
}

console.log("softGate.selftest ok");
