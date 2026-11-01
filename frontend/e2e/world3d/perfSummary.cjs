'use strict';

/**
 * Prints perfProbe.cjs results side by side as a Markdown table.
 *   node e2e/world3d/perfSummary.cjs <a.json> [b.json ...]
 */
const fs = require('fs');
const path = require('path');

const KEYS = [
  ['qualityStart', 'quality (start)'],
  ['qualityEnd', 'quality (end)'],
  ['render', 'render size'],
  ['frames', 'frames measured'],
  ['fps', 'fps (SwiftShader)'],
  ['frameMsP50', 'frame ms p50'],
  ['frameMsP95', 'frame ms p95'],
  ['frameMsP99', 'frame ms p99'],
  ['jsMsP50', 'JS ms / frame p50'],
  ['jsMsP95', 'JS ms / frame p95'],
  ['jsMsMax', 'JS ms / frame max'],
  ['framesJsOver2xMedian', 'frames > 2x median JS'],
  ['babylonDrawCalls', 'draw calls (Babylon)'],
  ['glDrawCalls', 'gl draw calls (incl. post)'],
  ['framebufferSwitches', 'render passes (fb switches)'],
  ['activeMeshes', 'active meshes'],
  ['triangles', 'triangles'],
  ['cameraPostProcesses', 'post-process passes'],
  ['renderTargets', 'custom render targets'],
  ['reactCommitsPerSec', 'React commits / s'],
  ['mainThreadScriptMsPerSec', 'main-thread script ms / s'],
  ['layoutsPerSec', 'layouts / s'],
  ['styleRecalcsPerSec', 'style recalcs / s'],
  ['shaderProgramsLinkedAfterLoad', 'shader programs linked after load'],
  ['engineStepMsPerFrame', 'engine frame ms (120 stepped frames)'],
  ['engineStepAllocKBPerFrame', 'engine KB allocated / frame (stepped)'],
  ['allocKBPerFrame', 'allocated KB / frame'],
  ['allocKBPerSec', 'allocated KB / s'],
  ['gcMinor', 'minor GCs (6 s)'],
  ['gcMajor', 'major GCs (6 s)'],
  ['gcMs', 'GC ms (6 s)'],
  ['backdropFilterElements', 'backdrop-filter elements'],
  ['governorStep.kind', 'governor step'],
  ['governorStep.callMs', 'governor step call ms'],
  ['governorStep.programsLinked', 'governor step: programs linked'],
  ['governorStep.worstNextFramesJsMs', 'governor step: worst next frame JS ms'],
  ['worstFrameJsMsAroundEvent.emote', 'worst JS ms around emote'],
  ['worstFrameJsMsAroundEvent.sit', 'worst JS ms around sit'],
  ['worstFrameJsMsAroundEvent.chat', 'worst JS ms around chat'],
  ['worstFrameJsMsAroundEvent.wheel', 'worst JS ms around emote wheel'],
];

const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const cols = [];
for (const f of process.argv.slice(2)) {
  const rows = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of rows) cols.push({ name: `${path.basename(f, '.json')} (${r.pass})`, r });
}
console.log(`| metric | ${cols.map((c) => c.name).join(' | ')} |`);
console.log(`| --- | ${cols.map(() => '---').join(' | ')} |`);
for (const [k, label] of KEYS) {
  console.log(`| ${label} | ${cols.map((c) => { const v = get(c.r, k); return v == null ? '' : String(v); }).join(' | ')} |`);
}
