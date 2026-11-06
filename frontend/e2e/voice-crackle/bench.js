// Offline render cost of each suppressor (ms of CPU per second of audio).
import { GtcrnWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import gtcrnWasmPath from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url";
import gtcrnWorkletPath from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
window.__bench = async (seconds = 20) => {
  const gt = await loadGtcrn({ url: gtcrnWasmPath });
  const rn = await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdWasmPath });
  const out = {};
  for (const engine of ["dsp", "rnnoise", "gtcrn"]) {
    const ctx = new OfflineAudioContext(1, 48000 * seconds, 48000);
    await ctx.audioWorklet.addModule(gtcrnWorkletPath); await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
    const osc = ctx.createOscillator(); osc.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.1;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 80;
    osc.connect(g).connect(hp);
    let node = hp;
    if (engine === "gtcrn") { const n = new GtcrnWorkletNode(ctx, { wasmBinary: gt, maxChannels: 1 }); node.connect(n); node = n; }
    if (engine === "rnnoise") { const n = new RnnoiseWorkletNode(ctx, { wasmBinary: rn, maxChannels: 1 }); node.connect(n); node = n; }
    const comp = ctx.createDynamicsCompressor(); node.connect(comp); comp.connect(ctx.destination);
    osc.start();
    const t = performance.now(); await ctx.startRendering();
    out[engine] = +((performance.now() - t) / seconds).toFixed(1); // ms per 1 s of audio
  }
  return out;
};
window.__ready = true;
