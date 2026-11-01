# 3D world: performance (Nov 2026)

The owner saw low fps and frequent frame drops on a Windows PC. The goal of this pass is
a steady 60 fps at 1080p on an Intel Iris Xe class GPU with 8 avatars on "auto"
quality, no hitches when people join, leave, emote, sit, chat or speak, and a "high"
preset that is smooth on a mid-range discrete GPU.

There is no GPU in the build container (Chromium falls back to SwiftShader, a CPU
rasterizer). So the numbers below are the CPU-side and structural costs, measured
before and after on the same machine, in interleaved runs, with the same mock room.
SwiftShader frame times are reported only as a rough proxy for GPU fill cost. What only
a real GPU can confirm is listed at the end.

## How it was measured

- `frontend/e2e/world3d/worldMockServer.cjs <port> perf demir`: the real `/world`
  namespace with 7 bots, so 8 avatars with the harness user: 2 seated and emoting,
  1 playing the guitar, 2 walking, 1 running, 1 leaving and joining again every 9 s,
  chat every 3 s.
- `frontend/world3d-harness.html?fakeVoice=1` (dev harness): every member gets a
  synthetic microphone (oscillator gated on and off in turns), so the real speaking
  detection runs; the harness re-renders once a second with a fresh `members` array,
  like the call overlays do with their duration clock.
- `frontend/e2e/world3d/perfProbe.cjs` (Playwright, SwiftShader, 1920 x 1080 page):
  - JS ms per engine frame (`onBeginFrame` -> `onEndFrame`) and frame intervals;
  - draw calls (Babylon counter and raw `gl.draw*` calls), framebuffer switches (render
    passes), active meshes, triangles, post-process passes;
  - React commits per second (DevTools hook stub counting `onCommitFiberRoot`);
  - main-thread script / layout / style time (CDP Performance metrics);
  - shader programs linked after load (`gl.linkProgram` wrapper);
  - bytes allocated per frame (sampling heap profiler including collected objects) and
    GC count / time (trace events), also for 120 frames stepped by hand (engine only);
  - the cost of one step of the automatic quality governor.
  `--gpu=iris` fakes `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ...)` and 8 threads, so
  "auto" picks what an Iris Xe laptop gets; `--gpu=discrete` fakes an RTX 3060 and 12
  threads. Pass `cpu` renders at 1/4 scale in a 960 x 540 page (CPU-bound), pass `full`
  at the real 1920 x 1080.
- `frontend/e2e/world3d/callStageProbe.mjs`: the real app (dev server, glass QA scenes,
  every API answered in the page) with a group call (5 remote participants, 3 cameras and
  a screen share) and a server voice channel; measures what keeps running under the world.
- Before = commit `3ab546f9` (round 2 + the tooling), after = this branch. Raw JSON and
  tables: `.shots/world/perf-camera/perf/`. `node e2e/world3d/perfSummary.cjs a.json b.json`
  prints them.

## Results

### Auto on Iris Xe (medium), 8 avatars

| | before | after |
| --- | --- | --- |
| React commits / s while the world is open | 31.1 | 3.0 |
| main-thread script ms / s | 101 | 46 |
| layouts / s (cpu pass) | 8.2 | 3.2 |
| `backdrop-filter` elements over the canvas | 4 | 0 |
| JS ms per engine frame, p50 / p95 / max | 7.5 / 17.0 / 388 | 7.7 / 17.7 / 24 |
| engine frame, 120 stepped frames: ms / KB allocated per frame | 20.2 / 249 | 18.4 / 134 |
| allocated KB / s (live) | 2938 | 1425 |
| GC time in 6 s | 122 ms | 67 ms |
| shader programs linked after load (12 s with speaking, emotes, joins) | 1 | 0 |
| quality governor step (fps drop) | rebuild pipeline: 14.6 s call, 1 program linked | resolution step: 0.2 ms, 0 programs |
| draw calls (Babylon = GL) | 60 | 54 |
| render passes (framebuffer switches) | 7 | 7 |
| SwiftShader full 1080p frame, p50 | 6251 ms | 633 ms |

The 388 ms worst frame before is the runtime shader compile of the face morph variant
(`NUM_MORPH_INFLUENCERS 2`, compiled the first time someone blinks while talking) and
the avatar created for the member who joins. Both are gone (0 programs linked after
load; joins reuse a pooled avatar).

### Auto on a discrete GPU

Before, "auto" picked **high** on any NVIDIA / Radeon with 6+ threads, and high rendered
at `devicePixelRatio x 1.5`: 2880 x 1620 for a 1080p window, with 4x MSAA on the canvas,
4x MSAA on the scene target and FXAA, depth of field, a mirror floor re-rendered every
frame and a half-size bloom. Now "auto" starts on medium everywhere (high is a manual
choice) and every preset caps the pixel ratio.

| | before (auto = high) | after (auto = medium) | after (high, chosen) |
| --- | --- | --- | --- |
| render size, 1080p window, DPR 1 | 2880 x 1620 | 1920 x 1080 | 1920 x 1080 |
| draw calls | 156 | 54 | 124 |
| render passes | 21 | 7 | 17.7 |
| post-process passes | 10 | 6 | 9 |
| triangles drawn | 757 k | 248 k | 690 k |
| engine frame, stepped: ms / KB per frame | 466 / 500 | 12.4 / 120 | 331 / 206 |
| React commits / s | 31.2 | 2.1 | 2.0 |
| governor step | 46-48 s call, 1 program | 0.9 ms, 0 programs | 1 ms, 0 programs |

(The stepped engine frame includes `gl.finish()`, so on SwiftShader it is mostly fill:
it shows the drop in pixels and passes, not a real GPU time.)

### The call stage under the world

From `callStageProbe.mjs` (1440 x 900; group call with 5 remote participants, 3 cameras
and a screen share; server voice channel with a screen share). "Before" = world open on
the old code, "after" = world open now.

| | group, before | group, after | voice, before | voice, after |
| --- | --- | --- | --- | --- |
| `<video>` elements playing under the world | 5 | 0 | 2 | 0 |
| video frames presented / s | 5.8 | 0 | 0.9 | 0 |
| `backdrop-filter` elements in the call surface | 28 visible on the page, all under the canvas | 0 | 30 | 0 |
| `<audio>` elements (call audio, screen-share audio) | 2 | 2 | 1 | 1 |
| DOM nodes | 540 | 413 | 503 | 378 |

After leaving, the stage comes back with all 5 / 2 videos playing. Leak check (enter and
leave 3 times): `WorldEngine.live` 0, 9 WebGL contexts created and 9 released, window
listeners unchanged (99 / 92). Document `visibilitychange` listeners grow by about 5 per
cycle, all added by the app's `web-vitals` telemetry on clicks (traced in
`leak-callstage.json`), none by the world.

## What changed and why

1. **No blurred glass over the canvas.** The overlay panels (room switcher, member pill,
   chat, dock, wheel, settings) used `backdrop-filter: blur(22px) saturate(1.5)`. Over a
   canvas that changes every frame the compositor re-blurs each panel every frame (a
   multi-pass blur per panel). They are now tinted surfaces (a slightly more opaque
   gradient, inner highlight, same border and shadow) that read like the draft.
2. **The call stage stops under the world.** `useWorld3DSession` drives
   loading -> entering -> open -> leaving. While open, CallOverlay and ServerVoicePanel do
   not render their stage, top bar and dock: no video decode or compositing, no tile
   meters (each was a voice-activity subscription with React state), no ring animations,
   no glass blur. The call audio is played by the call hooks, not by the stage; screen
   share audio keeps its own sink (`RemoteScreenAudioSink`) in both surfaces. Leaving
   mounts the stage again.
3. **React out of the frame loop.** Name tags are static markup moved by the engine with
   one `translate3d` write per moved tag (was `left` / `top` = layout every frame).
   Speaking detection no longer goes through `useSpeaking` (React state up to 25 times a
   second per speaker): `speakingMonitor.js` subscribes to the shared analyser graph and
   reports on / off edges only (engine mouth + a class on the tag). Activity labels are
   pushed by the engine on change (the 400 ms polling interval is gone). The stats line is
   a separate HUD component that polls only while shown. The view is memoised on what it
   displays; callbacks come through a ref, so the call overlay's per-second re-render no
   longer reaches it.
4. **No compile mid-session.** The old governor stepped the preset down when the frame
   rate fell under 30 for 120 frames, by disposing and rebuilding the post pipeline
   (shader compiles: 0.4-14 s here, typically 100 ms+ per program with ANGLE on D3D11).
   Now presets are fixed and `dynamicResolution.js` changes only the render scale
   (1, 0.9, 0.8, 0.72, 0.64, 0.57, 0.5 of the preset), with hysteresis toward 60 fps:
   down when most of ~0.9 s is slow, up after 4 s of GPU headroom (timer query) or a probe
   after 8 s of calm that backs off when it fails, a 1.2 s cooldown, and an undo when a
   step does not make the frames faster (CPU-bound). At load every material and post
   effect is compiled (`scene.whenReadyAsync` + up to 90 warm-up frames with one avatar
   showing every hair, outfit, accessory and the guitar, until
   `engine.areAllEffectsReady()`), behind the loading state; Babylon uses
   `KHR_parallel_shader_compile` where the browser has it. Face morphs keep a constant
   influencer count (`optimizeInfluencers = false`, influences never exactly 0), so
   blinking or talking never asks for another shader variant.
5. **Cheaper defaults.** Auto = medium. Device pixel ratio capped per preset (1 / 1.25 /
   1.5). One anti-aliasing method per preset (FXAA on low / medium, 4x MSAA on high),
   the WebGL back buffer is single-sampled and opaque (`antialias: false`, `alpha: false`:
   the scene renders into the post target anyway). Medium bloom runs on a quarter-size
   target with the same on-screen radius (the kernel is relative to the output: about 8x
   fewer texture reads). High keeps depth of field and the mirror floor, the mirror now at
   0.35 scale, every second frame, with a 16 px blur.
6. **Static scene.** Room meshes: frozen world matrices, no bounding sync, bounding-sphere
   culling, frozen materials (after warm-up), picking only on a click (move / down / up
   picking skipped). The room GLB was already merged per atlas (about 15 draw calls).
   `scene.freezeActiveMeshes` is not used: avatars move, join and leave, and the room is
   culled per camera. The colour clear is skipped in third and first person (the room
   fills every pixel; free cam keeps it).
7. **Avatars.** Skinning stays on the GPU (bone texture). Controllers are pooled (8 built
   at load): a join repaints a 64 x 64 palette and toggles parts, nothing is cloned or
   compiled. A clip that owns the pose runs with weight -1 (Babylon's late blending
   allocated holder objects for every bone every frame); group weights and speed ratios
   are written only when they change (each setter walks every animatable of the group).
   Off-screen avatars pause their clips and update their blend state 5 times a second.
   Avatar parts skip bounding sync and culling. Blob shadows are thin instances of one
   disc (8 draw calls -> 1). Snapshot interpolation writes into a per-avatar object
   (`sampleInto`). All 18 clips are in the avatar GLB loaded up front.
8. **One loop, one engine.** Only `engine.runRenderLoop`; hidden windows pause it (kept).
   `init()` aborts at every await when the view unmounts (StrictMode double mount, quick
   re-enter), so no loop or listener is created after `dispose()`; keys are bound only
   after warm-up; `WorldEngine.live` counts engines for leak checks.
9. **Electron.** Nothing forces software or low-power rendering in normal runs (the
   `disable-gpu` switch is only for smoke runs). WebGL asks for `powerPreference:
   "high-performance"`, but Chromium on Windows picks one adapter for the whole GPU
   process, so `force_high_performance_gpu` is added on Windows once the user has opened
   the world (a marker in userData written through IPC; it applies from the next launch,
   so people who never open the world keep the integrated GPU and their battery).
   `pointerLock` is now an allowed permission (first-person look).
10. **Performance overlay** (Ayar > "Performans göstergesi"): fps, 1% low, frame time p95 /
    p99, draw calls, triangles, resolution scale and render size, GPU time when the timer
    query exists, preset, and the GPU renderer string, so the owner can report numbers.

## Remaining risks (what only a real GPU can confirm)

- **The 60 fps target itself.** The container has no GPU. The fill cost of medium at
  1080p on Iris Xe (PBR avatars with 6 lights and sheen, bloom, FXAA, image processing
  with colour curves) is estimated, not measured. Dynamic resolution will lower the render
  scale if it does not fit; the HUD shows the scale it settles on. Please report the HUD
  numbers (fps, 1% low, p95, resolution, GPU string) from the real PC.
- **GPU timer.** Up-steps use `EXT_disjoint_timer_query_webgl2` when available; without it
  the controller probes up every 8-64 s. Each step resizes the post targets (no compile);
  on SwiftShader a resize stalls for seconds because queued frames must finish, on a GPU it
  should be a few milliseconds. To be confirmed on the real PC.
- **Windows shader compile times.** All programs are compiled behind the loading state,
  but a driver may still compile lazily on first draw. The warm-up frames draw everything
  once to trigger that; first-person / free-cam angles that reveal nothing new should not
  compile.
- **Dual-GPU laptops.** The discrete GPU switch applies from the second launch after the
  first world visit; if the HUD shows an Intel renderer on a laptop with an NVIDIA GPU,
  restart Descall once.
- **Mirror floor on high** still re-renders the reflected meshes every second frame;
  a weak discrete GPU may prefer medium.
- **Off-screen animation pause** relies on a frustum test with a 1.3 m margin; an avatar
  entering the view from behind a fast camera turn may show one frame of an old pose.
- **Chrome compositor**: the remaining app-shell glass under the call overlay (sidebar)
  is static and fully covered; Chromium should not redraw it, but its cost under an open
  world is not measurable here.
