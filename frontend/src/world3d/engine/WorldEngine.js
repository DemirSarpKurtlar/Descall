/**
 * Babylon.js runtime for the 3D world (phase 1: living room).
 * Loaded lazily with the world chunk; nothing here runs unless the world opens.
 *
 * - Room: baked GLB (static lighting in textures, drawn unlit) + emissive lamps
 *   and city (HDR, bloom). Colliders, seats, spawn points and the hero camera
 *   come from named nodes in the GLB (COL_*, ROOM_BOUNDS, SEAT_*, SPAWN_*, CAM_*).
 * - Avatars: AvatarController per member (pooled), palette-recoloured.
 * - Local player: WASD / arrows relative to the view, Shift runs, click on the floor to
 *   walk there (third person), E sits on / stands up from the nearest seat, G emote wheel.
 * - Camera: CameraRig with three modes (third person orbit follow, first person, free
 *   cam), V cycles, every change eases over 0.5 s.
 * - Rendering pauses while the window is hidden / minimised; dispose() frees the GPU.
 *
 * Performance (docs/design/3d-world/PERFORMANCE.md):
 * - one render loop (engine.runRenderLoop), no timers; an opaque, non-multisampled canvas
 * - presets fix the effects; dynamic resolution (small render-scale steps with hysteresis)
 *   holds 60 fps and never compiles a shader; every material and post effect is compiled
 *   and warmed up behind the loading state (parallel shader compile where available)
 * - static room: frozen world matrices and materials, no bounding sync, picking only on click
 * - name tags are moved here with one transform write per changed tag (no React per frame)
 * - no per-frame allocation in movement, interpolation, animation blending or tags
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import "@babylonjs/loaders/glTF/2.0";
import "@babylonjs/loaders/glTF/glTFFileLoader";

import { AvatarController, createShadowPool, loadAvatarAsset, measureYawOffset, RUN_SPEED, WALK_SPEED } from "./avatars.js";
import { makeBox, resolve } from "./collision.js";
import { PRESETS } from "./quality.js";
import { createResolutionController, hardwareScalingFor } from "./dynamicResolution.js";
import { CameraRig } from "./cameraRig.js";
import { DEFAULT_CAMERA_PREFS, damp, headBob, normalizePrefs } from "./cameraModes.js";
import { createClock, createSnapshotBuffer } from "../net/snapshotBuffer.js";
import { STATE, STATES, EMOTES, encodeSnapshot, SNAP_INTERVAL_MS } from "../net/protocol.js";
import { lookFor, looksForRoom } from "./look.js";

const AVATAR_RADIUS = 0.24;
const SIT_RANGE = 1.9;
const POOL_SIZE = 8;
const FRAME_RING = 600;
const EMISSIVE_LEVELS = {
  EMIT_shade: 1.15,
  EMIT_globe: 1.2,
  EMIT_lava: 1.3,
  EMIT_sky_far: 0.95,
  EMIT_sky_near: 1.0,
};
const ACTIVITY_EMOTES = new Set(["dance", "laugh", "clap", "wave", "guitar"]);
const MOVE_KEYS = new Set(["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);

function isTyping() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

class Aborted extends Error {
  constructor() {
    super("world3d: disposed during init");
    this.name = "AbortError";
  }
}

let liveEngines = 0;

export class WorldEngine {
  /** Engines alive right now (leak check for leave / re-enter). */
  static get live() {
    return liveEngines;
  }

  constructor(canvas, { assetBase = "/world3d/", quality, selfId, lookOverrides = null, cameraPrefs = null, onSeatHint, onEmoteWheel, onLocalSnapshot, onFatal, onProgress, onActivity, onCameraMode, onPointerLock, onHelp, onChatFocus } = {}) {
    this.canvas = canvas;
    this.assetBase = assetBase;
    this.quality = quality || PRESETS.medium;
    this.selfId = String(selfId || "me");
    this.lookOverrides = lookOverrides; // { userId: LOOKS index } (previews / tests only)
    this.cameraPrefs = normalizePrefs(cameraPrefs || DEFAULT_CAMERA_PREFS);
    this.cb = { onSeatHint, onEmoteWheel, onLocalSnapshot, onFatal, onProgress, onActivity, onCameraMode, onPointerLock, onHelp, onChatFocus };
    this.avatars = new Map();
    this.pool = [];
    this.remote = new Map(); // id -> { buffer, lastEmoteSeq, last, sample, speed, offscreen, lodAcc }
    this.tags = new Map(); // id -> { el, x, y, on }
    this.activity = new Map(); // id -> emote name shown on the tag
    this.clock = createClock();
    this.keys = new Set();
    this.moveTarget = null;
    this.local = { pos: new Vector3(2.5, 0, 2.5), yaw: 0, speed: 0, state: "idle", seat: -1, emote: 0, emoteSeq: 0, stateUntil: 0, sitFrom: null, moveDir: new Vector3(0, 0, 1) };
    this.lastSent = 0;
    this.lastSentKey = "";
    this.paused = false;
    this.disposed = false;
    this.speakers = new Set();
    this.dynres = createResolutionController();
    this.frames = new Float32Array(FRAME_RING);
    this.frameCount = 0;
    this.drawCalls = 0;
    this.eyeY = null;
    this.bobPhase = 0;
    this.tmp = new Vector3();
    this.tmp2 = new Vector3();
    this.eye = new Vector3();
    this.projected = new Vector3();
    this.planes = Frustum.GetPlanes(Matrix.Identity());
    this.fly = { forward: 0, right: 0, up: 0, fast: false };
    this.rigCtx = { avatar: this.local.pos, moving: false, eye: null, fly: this.fly };
    this.progress = 0;
    liveEngines += 1;
  }

  setProgress(p) {
    const v = Math.max(this.progress, Math.min(1, p));
    if (v - this.progress < 0.005 && v < 1) return;
    this.progress = v;
    this.cb.onProgress?.(v);
  }

  check() {
    if (this.disposed) throw new Aborted();
  }

  async init() {
    // The canvas is opaque and single-sampled: the scene renders into the post-processing
    // target, so a multisampled or transparent back buffer would only cost bandwidth and
    // compositing. powerPreference picks the discrete GPU on dual-GPU laptops (where the
    // browser honours it; Electron adds force_high_performance_gpu on Windows).
    const engine = new Engine(this.canvas, false, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
      disableWebGL2Support: false,
      doNotHandleContextLost: false,
      failIfMajorPerformanceCaveat: false,
    }, false);
    this.engine = engine;
    engine.enableOfflineSupport = false;
    this.renderer = this.probeRendererName();
    if (engine.getCaps().timerQuery) {
      try {
        this.gpuTimer = new EngineInstrumentation(engine);
        this.gpuTimer.captureGPUFrameTime = true;
      } catch {
        this.gpuTimer = null;
      }
    }
    this.applyScale();
    const scene = new Scene(engine, { useGeometryUniqueIdsMap: true, useMaterialMeshMap: true, useClonedMeshMap: true });
    this.scene = scene;
    scene.clearColor = new Color4(0.04, 0.03, 0.09, 1);
    // picking only on a click (done by hand), never on move / down / up
    scene.skipPointerMovePicking = true;
    scene.skipPointerDownPicking = true;
    scene.skipPointerUpPicking = true;
    this.shadows = createShadowPool(scene);
    this.rig = new CameraRig(scene, this.canvas, {
      bounds: null,
      prefs: this.cameraPrefs,
      onModeChange: (mode, prev) => this.onModeChange(mode, prev),
      onPointerLock: (locked) => this.cb.onPointerLock?.(locked),
    });
    this.camera = this.rig.camera;
    scene.activeCamera = this.camera;
    this.setProgress(0.04);

    await this.loadRoom();
    this.check();
    await this.loadAvatars();
    this.check();
    this.setupLights();
    this.setupPost();
    this.setupInput();
    this.rig.bounds = this.bounds;
    this.applyHeroCamera();
    this.fillPool();
    this.setProgress(0.9);
    await this.prewarm();
    this.check();
    // the room is closed and the third / first person camera stays inside it: every pixel
    // is drawn each frame, so the colour clear is skipped (free cam keeps it, to be safe)
    scene.autoClear = this.rig.mode === "free";
    scene.autoClearDepthAndStencil = true;
    // own head collapsed after the clips wrote the bones (first person)
    scene.onAfterAnimationsObservable.add(() => this.avatars.get(this.selfId)?.applyHeadHide());
    this.setProgress(1);

    this.lastT = this.nowMs();
    this.loop = () => this.frame();
    engine.runRenderLoop(this.loop);
    this.onResize = () => {
      engine.resize();
      this.updateViewport();
    };
    window.addEventListener("resize", this.onResize);
    this.setupVisibility();
    this.ready = true;
    return this;
  }

  probeRendererName() {
    try {
      const gl = this.engine._gl;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || "");
    } catch {
      return "";
    }
  }

  /** Render scale = device pixel ratio (capped by the preset) x preset scale x dynamic scale. */
  applyScale() {
    if (!this.engine) return;
    const level = this.lockedLevel || hardwareScalingFor({
      devicePixelRatio: window.devicePixelRatio || 1,
      maxPixelRatio: this.quality.maxPixelRatio ?? 1,
      presetScale: this.quality.presetScale ?? 1,
      scale: this.dynres.scale,
    });
    if (Math.abs(this.engine.getHardwareScalingLevel() - level) > 1e-4) this.engine.setHardwareScalingLevel(level);
    this.updateViewport();
  }

  updateViewport() {
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    this.vp = new Viewport(0, 0, w, h);
    this.cssRatio = (this.canvas.clientWidth || w) / Math.max(1, w);
  }

  async loadRoom() {
    const scene = this.scene;
    const room = await LoadAssetContainerAsync(`${this.assetBase}living-room.glb`, scene, {
      pluginExtension: ".glb",
      onProgress: (e) => {
        if (e.lengthComputable) this.setProgress(0.04 + 0.6 * (e.loaded / e.total));
      },
    });
    this.check();
    scene.blockMaterialDirtyMechanism = true;
    room.addAllToScene();
    this.room = room;
    const boxes = [];
    this.seats = [];
    this.spawns = [];
    const nodes = [...room.transformNodes, ...room.meshes];
    const byName = new Map(nodes.map((n) => [n.name, n]));
    for (const n of nodes) n.computeWorldMatrix?.(true);
    this.roomMaterials = new Set();
    for (const m of room.meshes) {
      const name = m.name || "";
      if (name.startsWith("COL_") || name === "ROOM_BOUNDS") {
        m.isVisible = false;
        m.isPickable = false;
        m.setEnabled(false);
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        if (name === "ROOM_BOUNDS") {
          this.bounds = { minX: bb.minimumWorld.x, maxX: bb.maximumWorld.x, minY: bb.minimumWorld.y, maxY: bb.maximumWorld.y, minZ: bb.minimumWorld.z, maxZ: bb.maximumWorld.z };
        } else {
          // oriented box in the floor plane from the world matrix
          const wm = m.getWorldMatrix();
          const c = bb.centerWorld;
          const ax = Vector3.TransformNormal(new Vector3(1, 0, 0), wm);
          const az = Vector3.TransformNormal(new Vector3(0, 0, 1), wm);
          const ext = bb.extendSize;
          const hx = Math.hypot(ax.x, ax.z) * ext.x;
          const hz = Math.hypot(az.x, az.z) * ext.z;
          const angle = Math.atan2(ax.z, ax.x);
          boxes.push(makeBox(c.x, c.z, hx, hz, -angle));
        }
        continue;
      }
      m.isPickable = name === "FLOOR" || /rug/i.test(name);
      // static: no world matrix, bounding info or culling work after this
      m.freezeWorldMatrix?.();
      m.doNotSyncBoundingInfo = true;
      m.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
      const mat = m.material;
      if (!mat) continue;
      this.roomMaterials.add(mat);
      const mname = mat.name || "";
      if (mname.startsWith("BAKED_")) {
        if ("unlit" in mat) mat.unlit = true;
        // leaves are single sided cards
        mat.backFaceCulling = mname !== "BAKED_foliage";
        if (mat.albedoTexture) mat.albedoTexture.anisotropicFilteringLevel = 8;
        // grade toward the draft: dusty lavender walls, browner floor (the bake is neutral-warm)
        const GRADE = { FLOOR: [0.9, 0.8, 0.88], BAKED_shell: [1.02, 0.98, 1.4], BAKED_furniture: [1.22, 1.18, 1.4], BAKED_rug: [1.05, 1.0, 1.08], BAKED_props: [1.05, 1.0, 1.15] };
        const g = GRADE[name] || GRADE[mname];
        if (g && "albedoColor" in mat) mat.albedoColor = new Color3(g[0], g[1], g[2]);
      } else if (mname.startsWith("EMIT_")) {
        if ("unlit" in mat) mat.unlit = false;
        const lvl = EMISSIVE_LEVELS[mname] ?? 1.5;
        mat.emissiveIntensity = lvl;
        if ("albedoColor" in mat) mat.albedoColor = Color3.Black();
        if (mname === "EMIT_sky_near" && mat.emissiveTexture) {
          mat.opacityTexture = null;
          mat.albedoTexture = mat.emissiveTexture;
          mat.useAlphaFromAlbedoTexture = true;
          mat.transparencyMode = 1; // ALPHATEST
          mat.alphaCutOff = 0.5;
        }
      }
    }
    scene.blockMaterialDirtyMechanism = false;
    this.boxes = boxes;
    for (const [name, n] of byName) {
      const mm = /^SEAT_(.+)_(\d+)$/.exec(name);
      if (mm) {
        const look = byName.get(`${name}_look`);
        const p = n.getAbsolutePosition().clone();
        const q = look ? look.getAbsolutePosition() : p.add(new Vector3(0, 0, 1));
        const yaw = Math.atan2(q.x - p.x, q.z - p.z);
        this.seats.push({ name, pos: new Vector3(p.x, 0, p.z), height: p.y, yaw });
      }
      if (/^SPAWN_\d+$/.test(name)) this.spawns.push(n.getAbsolutePosition().clone());
    }
    // byte order, same as the build script and the server-side seat indexes
    this.seats.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const hero = byName.get("CAM_hero");
    const heroT = byName.get("CAM_hero_target");
    this.hero = hero && heroT ? { pos: hero.getAbsolutePosition().clone(), target: heroT.getAbsolutePosition().clone() } : null;
    if (!this.bounds) this.bounds = { minX: -3, maxX: 3, minY: 0, maxY: 3, minZ: -3, maxZ: 3 };
    this.floor = room.meshes.find((m) => m.name === "FLOOR") || null;
    this.lampPositions = room.meshes.filter((m) => /EMIT_(lamp|globe|lava)/.test(m.name)).map((m) => ({ name: m.name, pos: m.getBoundingInfo().boundingBox.centerWorld.clone() }));
  }

  async loadAvatars() {
    this.avatarAsset = await loadAvatarAsset(this.scene, `${this.assetBase}avatar.glb`, (f) => this.setProgress(0.64 + 0.2 * f));
    this.yawOffset = measureYawOffset(this.avatarAsset);
  }

  setupLights() {
    const scene = this.scene;
    // Characters only: the room is baked. Approximate the baked light so avatars sit in it.
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.diffuse = Color3.FromHexString("#9a86ff");
    hemi.groundColor = Color3.FromHexString("#3b2846");
    hemi.specular = Color3.Black();
    hemi.intensity = 0.46;
    const win = new DirectionalLight("window", new Vector3(0.15, -0.35, -1), scene);
    win.diffuse = Color3.FromHexString("#6f7cff");
    win.specular = Color3.FromHexString("#3b46aa");
    win.intensity = 0.42;
    const front = new DirectionalLight("front", new Vector3(0.2, -0.45, 1), scene);
    front.diffuse = Color3.FromHexString("#ffd9e6");
    front.specular = Color3.Black();
    front.intensity = 0.3;
    this.lights = [hemi, win, front];
    for (const l of this.lampPositions) {
      const p = new PointLight(`pl_${l.name}`, l.pos, scene);
      if (/lava/.test(l.name)) {
        p.diffuse = Color3.FromHexString("#ff5fd2");
        p.intensity = 0.9;
        p.range = 2.2;
      } else {
        p.diffuse = Color3.FromHexString("#ffb46e");
        p.intensity = 2.4;
        p.range = 5.5;
      }
      p.specular = p.diffuse.scale(0.4);
      this.lights.push(p);
    }
    // the room itself must not be lit twice
    for (const m of this.room.meshes) {
      if (m.material?.name?.startsWith("BAKED_") || m.material?.name?.startsWith("EMIT_")) {
        for (const l of this.lights) l.excludedMeshes.push(m);
      }
    }
    // the blob shadows are unlit too
    for (const l of this.lights) l.excludedMeshes.push(this.shadows.mesh);
  }

  setupPost() {
    const scene = this.scene;
    const q = this.quality;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.75;
    scene.imageProcessingConfiguration.contrast = 1.05;
    // one pipeline, one AA method: MSAA on the scene target (high) or FXAA (low, medium)
    const pipe = new DefaultRenderingPipeline("post", true, scene, [this.camera]);
    pipe.samples = q.msaa;
    pipe.imageProcessingEnabled = true;
    pipe.imageProcessing.toneMappingEnabled = true;
    pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipe.imageProcessing.exposure = 1.75;
    pipe.imageProcessing.contrast = 1.05;
    // colour grade: violet shadows and mids, warm highlights (scene-3.jpg)
    const curves = new ColorCurves();
    curves.globalHue = 272;
    curves.globalDensity = 30;
    curves.globalSaturation = -20;
    curves.shadowsHue = 250;
    curves.shadowsDensity = 55;
    curves.highlightsHue = 32;
    curves.highlightsDensity = 14;
    pipe.imageProcessing.colorCurvesEnabled = true;
    pipe.imageProcessing.colorCurves = curves;
    pipe.imageProcessing.vignetteEnabled = true;
    pipe.imageProcessing.vignetteWeight = 1.4;
    pipe.imageProcessing.vignetteColor = new Color4(0.05, 0.02, 0.12, 0);
    pipe.fxaaEnabled = q.fxaa;
    pipe.bloomEnabled = q.bloom;
    if (q.bloom) {
      pipe.bloomThreshold = 0.82;
      pipe.bloomWeight = 0.45;
      // the kernel is relative to the output: same glow radius on a smaller target
      pipe.bloomScale = q.bloomScale ?? 0.5;
      pipe.bloomKernel = 72;
    }
    pipe.depthOfFieldEnabled = q.dof;
    if (q.dof) {
      pipe.depthOfFieldBlurLevel = 0; // low
      pipe.depthOfField.fStop = 4.0;
      pipe.depthOfField.focalLength = 28;
      pipe.depthOfField.focusDistance = 5200;
    }
    this.pipeline = pipe;
    const mat = this.floor?.material;
    if (mat) mat.unfreeze?.();
    if (q.mirror && this.floor && !this.mirror) {
      // glossy floor: blurred mirror of the lamps and people (high only), every second frame
      const mirror = new MirrorTexture("floorMirror", { ratio: 0.35 }, scene, true);
      mirror.mirrorPlane = new Plane(0, -1, 0, 0.0);
      mirror.adaptiveBlurKernel = 16;
      mirror.refreshRate = 2;
      mirror.renderList = this.scene.meshes.filter((m) => /EMIT_/.test(m.name) || /sofa|table|console|tv/i.test(m.name));
      for (const av of [...this.avatars.values(), ...this.pool]) mirror.renderList.push(...av.meshes);
      this.mirror = mirror;
      if (mat && "reflectionTexture" in mat) {
        mat.reflectionTexture = mirror;
        mat.reflectionTexture.level = 0.22;
        mat.unlit = false;
        mat.metallic = 0;
        mat.roughness = 1;
        mat.emissiveTexture = mat.albedoTexture;
        mat.emissiveColor = Color3.White();
        mat.albedoColor = Color3.Black();
        for (const l of this.lights) if (!l.excludedMeshes.includes(this.floor)) l.excludedMeshes.push(this.floor);
      }
    } else if (!q.mirror && this.mirror) {
      if (mat) {
        mat.reflectionTexture = null;
        mat.unlit = true;
        mat.albedoTexture = mat.emissiveTexture || mat.albedoTexture;
        mat.albedoColor = new Color3(0.9, 0.8, 0.88);
        mat.emissiveTexture = null;
        mat.emissiveColor = Color3.Black();
      }
      this.mirror.dispose();
      this.mirror = null;
    }
    this.freezeRoom();
  }

  /** Room materials never change after setup: skip their per-frame define checks. */
  freezeRoom() {
    if (!this.roomMaterials) return;
    // freeze once the effects exist (a frozen material that was never ready stays unready)
    const doFreeze = () => {
      if (this.disposed) return;
      for (const m of this.roomMaterials) m.freeze?.();
    };
    if (this.warm) doFreeze();
    else this.freezeAfterWarm = doFreeze;
  }

  applyHeroCamera() {
    if (this.hero) {
      this.rig.setHero(this.hero.pos, this.hero.target);
      this.roomFocus = this.hero.target.clone();
    } else {
      this.rig.setHero(new Vector3(6, 2.2, 6), new Vector3(3, 0.8, 3));
      this.roomFocus = new Vector3(3, 0.8, 3);
    }
  }

  /** Avatars ready for people who join later: no cloning or compiling while they arrive. */
  fillPool() {
    while (this.pool.length + this.avatars.size < POOL_SIZE) {
      const av = new AvatarController(this.scene, this.avatarAsset, `pool${this.pool.length}`, lookFor(`pool${this.pool.length}`), { yawOffset: this.yawOffset, shadows: this.shadows });
      av.deactivate();
      if (this.mirror) this.mirror.renderList.push(...av.meshes);
      this.pool.push(av);
    }
  }

  /**
   * Compile every shader the session can need and draw a few frames, all behind the
   * loading state: every avatar part (all hair, outfits, accessories and the guitar)
   * on one pooled avatar in view, shadows, mirror, post effects. Parallel compile
   * (KHR_parallel_shader_compile) lets the browser build them side by side.
   */
  async prewarm() {
    const scene = this.scene;
    const engine = this.engine;
    const av = this.pool[0];
    const spot = this.spawns[0] || new Vector3(2.5, 0, 2.5);
    if (av) {
      av.holder.setEnabled(true);
      for (const p of av.parts) p.mesh.setEnabled(true);
      av.setPose(spot, 0, 0, false);
      av.triggerEmote("guitar", 0);
      av.update(0.016, 0);
    }
    // look at the warm-up avatar (and the room) for these frames
    this.rig.update(0, 0, this.rigCtx);
    this.camera.position.set(spot.x, 1.4, spot.z - 2.4);
    this.camera.rotation.set(0.12, 0, 0);
    this.shadows.flush();
    try {
      await scene.whenReadyAsync(true);
    } catch {
      /* draw anyway */
    }
    this.check();
    const t0 = performance.now();
    for (let i = 0; i < 90; i += 1) {
      engine.beginFrame();
      scene.render();
      engine.endFrame();
      await new Promise((r) => requestAnimationFrame(r));
      this.check();
      const allReady = engine.areAllEffectsReady ? engine.areAllEffectsReady() : true;
      if (i >= 3 && allReady) break;
      if (performance.now() - t0 > 12000) break;
      this.setProgress(0.9 + 0.08 * Math.min(1, i / 20));
    }
    if (av) {
      av.cancelEmote();
      av.deactivate();
    }
    this.warm = true;
    this.freezeAfterWarm?.();
    this.freezeAfterWarm = null;
    this.applyHeroCamera();
  }

  setupInput() {
    const onKeyDown = (e) => {
      if (this.disposed) return;
      if (isTyping()) return;
      const k = e.key.toLowerCase();
      const mode = this.rig.mode;
      if (MOVE_KEYS.has(k) && !(k === "e" && mode !== "free") && !(k === "q" && mode !== "free")) {
        this.keys.add(k);
        if (mode !== "free") this.moveTarget = null;
        if (k.startsWith("arrow")) e.preventDefault();
        return;
      }
      if (e.repeat) return;
      if (k === "e") this.toggleSit();
      else if (k === "b") this.toggleGuitar();
      else if (k === "g") {
        this.rig.exitLock();
        this.cb.onEmoteWheel?.("toggle");
      } else if (k === "v") this.cycleCamera();
      else if (k === "r" && mode === "free") this.rig.returnToAvatar(this.nowMs());
      else if (k === "h" || e.key === "?") {
        this.rig.exitLock();
        this.cb.onHelp?.("toggle");
      } else if (k === "enter") {
        this.rig.exitLock();
        if (this.cb.onChatFocus) {
          e.preventDefault();
          this.cb.onChatFocus();
        }
      } else if (k === "escape") {
        this.cb.onEmoteWheel?.("close");
        this.cb.onHelp?.("close");
      }
    };
    const onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === "Shift") this.keys.delete("shift");
    };
    const onBlur = () => this.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    this.unbindKeys = () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    let down = null;
    this.scene.onPointerObservable.add((pi) => {
      const ev = pi.event;
      if (pi.type === PointerEventTypes.POINTERDOWN && ev.button === 0) {
        down = { x: ev.clientX, y: ev.clientY, t: this.nowMs() };
      } else if (pi.type === PointerEventTypes.POINTERUP && down && ev.button === 0) {
        const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
        const quick = this.nowMs() - down.t < 450;
        down = null;
        // click to walk: third person only (first person / free cam: the click locks the mouse)
        if (moved > 6 || !quick || !this.rig.policy.clickToWalk) return;
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m.isPickable && m.isEnabled());
        if (pick?.hit && pick.pickedPoint) {
          if (this.local.state === "sit" || this.local.state === "sitDown") this.standUp();
          const p = pick.pickedPoint;
          this.moveTarget = new Vector3(p.x, 0, p.z);
          this.rig.follow = Math.max(this.rig.follow, 0.6);
        }
      }
    });
  }

  setupVisibility() {
    const update = () => {
      const hidden = document.hidden || document.documentElement.classList.contains("app-backgrounded");
      if (hidden && !this.paused) {
        this.paused = true;
        this.engine.stopRenderLoop(this.loop);
      } else if (!hidden && this.paused && !this.disposed && !this.fixedStepMs) {
        this.paused = false;
        this.lastT = this.nowMs();
        this.dynres.reset(this.lastT);
        this.engine.runRenderLoop(this.loop);
      }
    };
    document.addEventListener("visibilitychange", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    this.unbindVisibility = () => {
      document.removeEventListener("visibilitychange", update);
      mo.disconnect();
    };
  }

  // ------------------------------------------------------------ camera

  cycleCamera() {
    this.rig.cycle(this.nowMs());
  }

  setCameraMode(mode) {
    this.rig.setMode(mode, this.nowMs());
  }

  setCameraPrefs(prefs) {
    this.cameraPrefs = normalizePrefs({ ...this.cameraPrefs, ...prefs, mode: this.rig.mode });
    this.rig.setPrefs(this.cameraPrefs);
  }

  onModeChange(mode, prev) {
    this.keys.clear();
    if (mode !== "third") this.moveTarget = null;
    // free cam: the avatar stops where it is
    if (mode === "free") this.local.speed = 0;
    this.eyeY = null;
    if (this.scene && this.ready) this.scene.autoClear = mode === "free";
    this.cb.onCameraMode?.(mode, prev);
  }

  resetCamera() {
    if (this.rig.mode !== "third") this.rig.setMode("third", this.nowMs());
    this.applyHeroCamera();
  }

  /** Evidence capture: hold the camera at a fixed pose (null releases it). */
  lockCameraPose(pos, target) {
    this.cameraLocked = pos && target ? { pos: pos.clone(), target: target.clone() } : null;
  }

  // ------------------------------------------------------------ members

  /** members: [{ id, name, snap? }] including self. */
  setMembers(members) {
    const ids = members.map((m) => String(m.id));
    const looks = looksForRoom(ids, this.lookOverrides);
    for (const id of [...this.avatars.keys()]) {
      if (!ids.includes(id)) {
        const av = this.avatars.get(id);
        av.deactivate();
        this.pool.push(av);
        this.avatars.delete(id);
        this.remote.delete(id);
        if (this.activity.has(id)) {
          this.activity.delete(id);
          this.cb.onActivity?.(id, null);
        }
      }
    }
    for (const m of members) {
      const id = String(m.id);
      if (this.avatars.has(id)) continue;
      let av = this.pool.pop();
      if (av) av.reset(id, looks.get(id));
      else {
        av = new AvatarController(this.scene, this.avatarAsset, id, looks.get(id), { yawOffset: this.yawOffset, shadows: this.shadows });
        if (this.mirror) this.mirror.renderList.push(...av.meshes);
      }
      this.avatars.set(id, av);
      if (id === this.selfId) {
        const spawn = this.pickSpawn();
        this.local.pos.copyFrom(spawn);
        this.local.yaw = Math.atan2(this.roomFocus.x - spawn.x, this.roomFocus.z - spawn.z);
        av.setPose(this.local.pos, this.local.yaw, 0, false);
        av.setHeadHidden(this.rig.mode === "first");
      } else {
        this.remote.set(id, { buffer: createSnapshotBuffer(), lastEmoteSeq: m.snap ? m.snap[6] : 0, last: null, sample: {}, speed: 0, offscreen: 0, lodAcc: 0, hasLast: false });
        if (m.snap) this.pushRemote(id, this.clock.serverNow(this.nowMs()), m.snap, 0);
        else av.setPose(this.tmp.set(0, -50, 0), 0, 0, false);
      }
    }
  }

  pickSpawn() {
    for (const s of this.spawns.length ? this.spawns : [new Vector3(2.5, 0, 2.5)]) {
      let taken = false;
      for (const a of this.avatars.values()) if (Vector3.Distance(a.position, s) < 0.7) taken = true;
      if (!taken) return s.clone();
    }
    return (this.spawns[0] || new Vector3(2.5, 0, 2.5)).clone();
  }

  /** Server batch: { t, s: [[id, ...snap]] } */
  onSnaps(batch, localNow = this.nowMs()) {
    if (!batch || !Array.isArray(batch.s)) return;
    this.clock.observe(batch.t, localNow);
    for (const row of batch.s) {
      const id = String(row[0]);
      if (id === this.selfId) continue;
      this.pushRemote(id, batch.t, row, 1);
    }
  }

  pushRemote(id, t, row, o) {
    const r = this.remote.get(id);
    if (!r) return;
    r.buffer.push(t, { x: row[o], y: row[o + 1], z: row[o + 2], yaw: row[o + 3], state: row[o + 4], emote: row[o + 5], emoteSeq: row[o + 6], seat: row[o + 7] });
  }

  /** Speaking edges from the speaking monitor (no React state). */
  setSpeaking(id, v) {
    const sid = String(id);
    if (v) this.speakers.add(sid);
    else this.speakers.delete(sid);
  }

  setSpeakers(ids) {
    this.speakers = new Set([...ids].map(String));
  }

  /** Name tag element for a member; positioned here every frame it moves. */
  setTagElement(id, el) {
    const sid = String(id);
    if (el) this.tags.set(sid, { el, x: -1e4, y: -1e4, on: null });
    else this.tags.delete(sid);
  }

  // ------------------------------------------------------------ local actions

  nearestSeat(range = SIT_RANGE) {
    let best = null;
    let bd = range;
    for (let i = 0; i < this.seats.length; i += 1) {
      let occupied = false;
      for (const r of this.remote.values()) if (r.hasLast && r.sample.seat === i) occupied = true;
      if (occupied) continue;
      const s = this.seats[i];
      const d = Math.hypot(s.pos.x - this.local.pos.x, s.pos.z - this.local.pos.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  toggleSit() {
    const st = this.local.state;
    if (st === "sit" || st === "sitDown") {
      this.standUp();
      return;
    }
    const i = this.nearestSeat();
    if (i == null) return;
    this.sitOn(i);
  }

  sitOn(i) {
    const seat = this.seats[i];
    if (!seat) return;
    // just outside the seat's collider (seat front + avatar radius)
    const front = new Vector3(seat.pos.x + Math.sin(seat.yaw) * 0.64, 0, seat.pos.z + Math.cos(seat.yaw) * 0.64);
    const d = Math.hypot(front.x - this.local.pos.x, front.z - this.local.pos.z);
    if (d > 0.18) {
      // walk to the front of the seat, then turn round and sit (no snap)
      this.moveTarget = front;
      this.approach = { seat: i };
      return;
    }
    this.approach = null;
    this.moveTarget = null;
    this.local.seat = i;
    this.local.state = "sitDown";
    this.local.stateUntil = this.nowMs() + 1000;
    this.local.sitFrom = { t: this.nowMs() };
    this.local.emote = 0;
    this.avatars.get(this.selfId)?.cancelEmote();
  }

  standUp() {
    if (this.local.seat < 0) return;
    this.local.state = "standUp";
    this.local.stateUntil = this.nowMs() + 870;
    this.local.standFrom = this.local.seat;
    this.local.seat = -1;
  }

  toggleGuitar() {
    const av = this.avatars.get(this.selfId);
    if (av?.emote?.name === "guitar") {
      av.cancelEmote();
      this.local.emote = 0;
      this.local.emoteSeq = (this.local.emoteSeq + 1) & 255;
      return;
    }
    this.emote("guitar");
    this.local.emoteUntil = this.nowMs() + 36000000;
  }

  emote(name) {
    const idx = EMOTES.indexOf(name);
    if (idx <= 0) return;
    if (name === "sit") return;
    this.local.emote = idx;
    this.local.emoteSeq = (this.local.emoteSeq + 1) & 255;
    this.local.emoteUntil = this.nowMs() + 2500;
    this.moveTarget = null;
    this.avatars.get(this.selfId)?.triggerEmote(name, this.nowMs() / 1000);
  }

  /** Quality preset chosen by the user (never automatic). */
  setQuality(preset) {
    if (!preset || !this.scene) return;
    this.quality = preset;
    this.pipeline?.dispose();
    this.pipeline = null;
    this.setupPost();
    this.applyScale();
  }

  // ------------------------------------------------------------ frame

  /** Wall clock, or a virtual clock while stepping frames by hand (evidence capture). */
  nowMs() {
    return this.fixedStepMs ? this.virtualNow : performance.now();
  }

  /** Stop the loop and advance in fixed steps (deterministic capture on slow software GL). */
  manualStep(frames = 1, stepMs = 1000 / 30) {
    if (!this.fixedStepMs) {
      this.engine.stopRenderLoop(this.loop);
      this.fixedStepMs = stepMs;
      this.virtualNow = performance.now();
      this.lastT = this.virtualNow;
      this.scene.useConstantAnimationDeltaTime = true;
    }
    for (let i = 0; i < frames; i += 1) {
      this.virtualNow += stepMs;
      this.engine.beginFrame();
      this.frame();
      this.engine.endFrame();
    }
    // wait for the GPU (software GL queues frames far ahead otherwise)
    this.engine._gl?.finish?.();
  }

  /** Perf probe: pin the hardware scaling level (0 releases it). */
  perfLockScale(level) {
    this.lockedLevel = level > 0 ? level : 0;
    this.dynres.lock(level > 0 ? 1 / level : null);
    this.applyScale();
  }

  /** Perf probe / tests: what the governor does when the frame rate drops (one step). */
  perfGovernorStep() {
    const s = this.dynres.stepDown(this.nowMs());
    if (s != null) this.applyScale();
    return s;
  }

  frame() {
    if (this.disposed) return;
    const now = this.nowMs();
    const rawDt = now - this.lastT;
    const dt = Math.min(0.1, rawDt / 1000);
    this.lastT = now;
    this.frames[this.frameCount % FRAME_RING] = rawDt;
    this.frameCount += 1;
    if (!this.fixedStepMs && !this.lockedLevel) {
      const gpuNs = this.gpuTimer?.gpuFrameTimeCounter?.current;
      const scale = this.dynres.push(rawDt, now, gpuNs > 0 ? gpuNs * 1e-6 : null);
      if (scale != null) this.applyScale();
    }
    this.engine._drawCalls?.fetchNewFrame?.();
    this.updateLocal(dt, now);
    this.updateRemote(dt, now);
    this.shadows.flush();
    this.updateCamera(dt, now);
    this.scene.render();
    this.drawCalls = this.engine._drawCalls?.current ?? 0;
    this.updateTags();
    this.updateActivities();
  }

  updateLocal(dt, now) {
    const av = this.avatars.get(this.selfId);
    if (!av) return;
    const L = this.local;
    const mode = this.rig.mode;
    let speed = 0;
    if (L.state === "sitDown" || L.state === "sit") {
      const seat = this.seats[L.seat];
      if (seat) {
        const k = L.sitFrom ? Math.min(1, (now - L.sitFrom.t) / 380) : 1;
        L.pos.x += (seat.pos.x - L.pos.x) * (k >= 1 ? 1 : Math.min(1, dt * 10));
        L.pos.z += (seat.pos.z - L.pos.z) * (k >= 1 ? 1 : Math.min(1, dt * 10));
        L.yaw = seat.yaw;
      }
      if (L.state === "sitDown" && now > L.stateUntil) L.state = "sit";
      if (this.keys.size && mode !== "free" && this.hasMoveKey()) this.standUp();
    } else if (L.state === "standUp") {
      if (now > L.stateUntil) {
        L.state = "idle";
        const seat = this.seats[L.standFrom];
        if (seat) {
          // step forward off the seat
          L.pos.x += Math.sin(seat.yaw) * 0.35;
          L.pos.z += Math.cos(seat.yaw) * 0.35;
          const p = resolve(L.pos.x, L.pos.z, AVATAR_RADIUS, this.boxes, this.bounds);
          L.pos.x = p[0];
          L.pos.z = p[1];
        }
      }
    } else {
      // input direction relative to the view (free cam: the keys fly the camera instead)
      const yaw = this.rig.walkYaw;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      let ix = 0;
      let iz = 0;
      if (mode !== "free") {
        if (this.keys.has("w") || this.keys.has("arrowup")) iz += 1;
        if (this.keys.has("s") || this.keys.has("arrowdown")) iz -= 1;
        if (this.keys.has("d") || this.keys.has("arrowright")) ix += 1;
        if (this.keys.has("a") || this.keys.has("arrowleft")) ix -= 1;
      }
      let hasDir = false;
      let dx = 0;
      let dz = 0;
      if (ix || iz) {
        // forward (fx, fz), right (fz, -fx)
        dx = fx * iz + fz * ix;
        dz = fz * iz - fx * ix;
        hasDir = true;
      } else if (this.moveTarget) {
        dx = this.moveTarget.x - L.pos.x;
        dz = this.moveTarget.z - L.pos.z;
        if (Math.hypot(dx, dz) < 0.08) this.moveTarget = null;
        else hasDir = true;
      }
      if (hasDir) {
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
      }
      const target = hasDir ? (this.keys.has("shift") ? RUN_SPEED : WALK_SPEED) : 0;
      L.speed += (target - L.speed) * Math.min(1, dt * (target > L.speed ? 6 : 10));
      if (L.speed < 0.02) L.speed = 0;
      if (hasDir) {
        L.moveDir.set(dx, 0, dz);
        L.yaw = Math.atan2(dx, dz);
      } else if (mode === "first") {
        // standing in first person: the body turns with the view
        L.yaw = this.rig.look.yaw;
      }
      if (L.speed > 0) {
        const nx = L.pos.x + L.moveDir.x * L.speed * dt;
        const nz = L.pos.z + L.moveDir.z * L.speed * dt;
        const p = resolve(nx, nz, AVATAR_RADIUS, this.boxes, this.bounds);
        // actual ground speed after collisions (keeps feet planted when sliding along walls)
        speed = Math.hypot(p[0] - L.pos.x, p[1] - L.pos.z) / Math.max(1e-4, dt);
        if (this.moveTarget && speed < 0.05 * L.speed) {
          this.moveTarget = null;
          this.approach = null; // blocked on the way to the seat
        }
        L.pos.x = p[0];
        L.pos.z = p[1];
      }
      if (this.approach && !this.moveTarget && L.speed < 0.3) {
        const seat = this.approach.seat;
        this.approach = null;
        this.sitOn(seat);
      }
      if (this.approach && this.hasMoveKey()) this.approach = null;
      if (L.emote && now > (L.emoteUntil || 0)) L.emote = 0;
      if (speed > 0.2) L.emote = 0;
      L.state = speed > 0.05 ? (speed > WALK_SPEED + 0.2 ? "run" : "walk") : "idle";
      if (L.emote) L.state = "emote";
    }
    L.groundSpeed = speed;
    av.setLocomotion(L.state === "walk" || L.state === "run" || L.state === "emote" ? "idle" : L.state, speed);
    av.setSpeaking(this.speakers.has(this.selfId));
    av.update(dt, now / 1000);
    av.setPose(L.pos, L.yaw, dt);
    // seat hint for the overlay
    const near = L.state === "sit" || L.state === "sitDown" ? "stand" : this.nearestSeat() != null ? "sit" : null;
    if (near !== this.lastHint) {
      this.lastHint = near;
      this.cb.onSeatHint?.(near);
    }
    this.sendLocal(now);
  }

  hasMoveKey() {
    for (const k of this.keys) if (k !== "shift" && k !== "q" && k !== "e") return true;
    return false;
  }

  sendLocal(now) {
    if (now - this.lastSent < SNAP_INTERVAL_MS) return;
    const L = this.local;
    const snap = encodeSnapshot({
      x: L.pos.x,
      y: 0,
      z: L.pos.z,
      yaw: L.yaw,
      state: STATE[L.state] ?? 0,
      emote: L.emote || 0,
      emoteSeq: L.emoteSeq,
      seat: L.seat,
    });
    const key = `${snap[0]},${snap[2]},${snap[3]},${snap[4]},${snap[5]},${snap[6]},${snap[7]}`;
    if (key === this.lastSentKey && now - this.lastSent < 1000) return;
    this.lastSent = now;
    this.lastSentKey = key;
    this.cb.onLocalSnapshot?.(snap);
  }

  /** Remote avatars: interpolation without allocation, off-screen ones animate at 5 Hz. */
  updateRemote(dt, now) {
    const serverNow = this.clock.serverNow(now);
    Frustum.GetPlanesToRef(this.scene.getTransformMatrix(), this.planes);
    const planes = this.planes;
    for (const [id, r] of this.remote) {
      const av = this.avatars.get(id);
      if (!av) continue;
      const s = r.buffer.sampleInto(serverNow, r.sample);
      if (!s) continue;
      if (r.hasLast) {
        const v = Math.hypot(s.x - r.lastX, s.z - r.lastZ) / Math.max(1e-4, dt);
        r.speed += (v - r.speed) * Math.min(1, dt * 8);
      }
      r.lastX = s.x;
      r.lastZ = s.z;
      r.hasLast = true;
      const stateName = STATES[s.state] || "idle";
      if (s.emoteSeq !== r.lastEmoteSeq) {
        r.lastEmoteSeq = s.emoteSeq;
        if (s.emote > 0) av.triggerEmote(EMOTES[s.emote], now / 1000);
        else av.cancelEmote();
      }
      const loco = stateName === "walk" || stateName === "run" || stateName === "emote" ? "idle" : stateName;
      av.setLocomotion(loco, stateName === "walk" || stateName === "run" ? r.speed : 0);
      av.setSpeaking(this.speakers.has(id));
      // animation LOD: an avatar outside the view (with margin) for 0.4 s stops evaluating
      // its clips and updates its blend state 5 times a second; it resumes before it shows
      const cx = s.x;
      const cy = 0.9;
      const cz = s.z;
      let inView = true;
      for (let i = 0; i < 6; i += 1) {
        const p = planes[i];
        if (p.normal.x * cx + p.normal.y * cy + p.normal.z * cz + p.d < -1.3) {
          inView = false;
          break;
        }
      }
      r.offscreen = inView ? 0 : r.offscreen + dt;
      const lod = r.offscreen > 0.4;
      av.setAnimPaused(lod);
      if (lod) {
        r.lodAcc += dt;
        if (r.lodAcc >= 0.2) {
          av.update(r.lodAcc, now / 1000);
          r.lodAcc = 0;
        }
      } else {
        r.lodAcc = 0;
        av.update(dt, now / 1000);
      }
      // seated avatars face the seat direction and sit on it
      const seat = (stateName === "sit" || stateName === "sitDown") && this.seats[s.seat];
      if (seat) av.setPose(seat.pos, seat.yaw, dt);
      else av.setPose(this.tmp.set(s.x, 0, s.z), s.yaw, dt);
    }
  }

  updateCamera(dt, now) {
    const self = this.avatars.get(this.selfId);
    if (this.cameraLocked) {
      this.camera.position.copyFrom(this.cameraLocked.pos);
      this.camera.setTarget(this.cameraLocked.target);
      return;
    }
    const mode = this.rig.mode;
    const ctx = this.rigCtx;
    ctx.avatar = self ? self.position : this.local.pos;
    ctx.moving = this.local.speed > 0.1;
    ctx.eye = mode === "first" && self ? this.computeEye(self, dt) : null;
    const f = this.fly;
    f.forward = 0;
    f.right = 0;
    f.up = 0;
    if (mode === "free") {
      const K = this.keys;
      f.forward = (K.has("w") || K.has("arrowup") ? 1 : 0) - (K.has("s") || K.has("arrowdown") ? 1 : 0);
      f.right = (K.has("d") || K.has("arrowright") ? 1 : 0) - (K.has("a") || K.has("arrowleft") ? 1 : 0);
      f.up = (K.has("e") ? 1 : 0) - (K.has("q") ? 1 : 0);
      f.fast = K.has("shift");
    }
    this.rig.update(dt, now, ctx);
    // own head: hidden once the first-person camera is close to it
    if (self) {
      const st = this.rig.state;
      const w = st.blend ? Math.min(1, (now - st.blend.start) / st.blend.duration) : 1;
      self.setHeadHidden(mode === "first" && w > 0.55);
    }
  }

  /** First-person eye: in front of the face, at eye height; seated it follows the head. */
  computeEye(av, dt) {
    const L = this.local;
    const st = L.state;
    const follows = st === "sit" || st === "sitDown" || st === "standUp" || st === "emote";
    let x = L.pos.x;
    let z = L.pos.z;
    let y = L.pos.y + av.eye.y;
    if (follows && av.headNode) {
      const h = av.headNode.getAbsolutePosition();
      x = h.x;
      z = h.z;
      y = h.y - av.eye.headY + av.eye.y;
    }
    this.eyeY = this.eyeY == null ? y : damp(this.eyeY, y, follows ? 12 : 20, dt);
    const yaw = av.yaw;
    const fwd = av.eye.forward;
    let bx = 0;
    let by = 0;
    if (this.cameraPrefs.headBob && L.groundSpeed > 0.1 && !follows) {
      this.bobPhase += dt * (4.2 + L.groundSpeed * 2.1);
      const b = headBob(this.bobPhase, L.groundSpeed);
      bx = b.x;
      by = b.y;
    }
    this.eye.set(x + Math.sin(yaw) * fwd + Math.cos(yaw) * bx, this.eyeY + by, z + Math.cos(yaw) * fwd - Math.sin(yaw) * bx);
    return this.eye;
  }

  /** Name tags: one transform per moved tag, written straight to the DOM. */
  updateTags() {
    if (!this.tags.size || !this.vp) return;
    const tm = this.scene.getTransformMatrix();
    const ratio = this.cssRatio || 1;
    const out = this.projected;
    const first = this.rig.mode === "first";
    for (const [id, av] of this.avatars) {
      const t = this.tags.get(id);
      if (!t) continue;
      av.headPosition(this.tmp2);
      Vector3.ProjectToRef(this.tmp2, Matrix.IdentityReadOnly, tm, this.vp, out);
      const on = out.z > 0 && out.z < 1 && av.position.y > -10 && !(first && id === this.selfId);
      if (on !== t.on) {
        t.on = on;
        t.el.style.opacity = on ? "1" : "0";
      }
      if (!on) continue;
      const x = Math.round(out.x * ratio * 2) / 2;
      const y = Math.round(out.y * ratio * 2) / 2;
      if (x !== t.x || y !== t.y) {
        t.x = x;
        t.y = y;
        t.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;
      }
    }
  }

  /** Activity labels (dancing, guitar...): reported on change only. */
  updateActivities() {
    if (!this.cb.onActivity) return;
    for (const [id, av] of this.avatars) {
      const name = av.emote && ACTIVITY_EMOTES.has(av.emote.name) ? av.emote.name : null;
      if ((this.activity.get(id) || null) !== name) {
        if (name) this.activity.set(id, name);
        else this.activity.delete(id);
        this.cb.onActivity(id, name);
      }
    }
  }

  /** Numbers for the performance HUD (read twice a second). */
  perfStats() {
    const n = Math.min(this.frameCount, FRAME_RING);
    const recent = [];
    let sum1s = 0;
    let frames1s = 0;
    for (let i = 0; i < n; i += 1) {
      const v = this.frames[(this.frameCount - 1 - i + FRAME_RING) % FRAME_RING];
      if (!(v > 0) || v > 1000) continue;
      recent.push(v);
      if (sum1s < 1000) {
        sum1s += v;
        frames1s += 1;
      }
    }
    recent.sort((a, b) => a - b);
    const pct = (p) => (recent.length ? recent[Math.min(recent.length - 1, Math.floor(p * recent.length))] : 0);
    const worst = recent.slice(Math.floor(recent.length * 0.99));
    const worstAvg = worst.length ? worst.reduce((a, b) => a + b, 0) / worst.length : 0;
    const gpuNs = this.gpuTimer?.gpuFrameTimeCounter?.lastSecAverage;
    return {
      fps: sum1s > 0 ? (frames1s * 1000) / sum1s : 0,
      low1: worstAvg > 0 ? 1000 / worstAvg : 0,
      p95: pct(0.95),
      p99: pct(0.99),
      drawCalls: this.drawCalls,
      triangles: Math.round((this.scene?.getActiveIndices?.() || 0) / 3),
      renderer: this.renderer || "",
      scale: this.lockedLevel ? 1 / this.lockedLevel : this.dynres.scale,
      renderW: this.engine?.getRenderWidth() || 0,
      renderH: this.engine?.getRenderHeight() || 0,
      gpuMs: gpuNs > 0 ? gpuNs * 1e-6 : null,
      quality: this.quality.id,
      avatars: this.avatars.size,
    };
  }

  stats() {
    const p = this.perfStats();
    return { fps: p.fps, drawCalls: p.drawCalls, frameMs: p.fps ? 1000 / p.fps : null, activeTriangles: p.triangles, activeMeshes: this.scene?.getActiveMeshes?.().length ?? 0 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    liveEngines = Math.max(0, liveEngines - 1);
    try {
      this.engine?.stopRenderLoop();
      this.unbindKeys?.();
      this.unbindVisibility?.();
      if (this.onResize) window.removeEventListener("resize", this.onResize);
      this.rig?.dispose();
      for (const a of this.avatars.values()) a.dispose();
      for (const a of this.pool) a.dispose();
      this.avatars.clear();
      this.pool.length = 0;
      this.tags.clear();
      this.shadows?.dispose();
      this.avatarAsset?.container.dispose();
      this.pipeline?.dispose();
      this.mirror?.dispose();
      this.gpuTimer?.dispose();
      this.scene?.dispose();
      // release the GL context so the GPU memory goes back right away
      const gl = this.engine?._gl;
      this.engine?.dispose();
      gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    } catch {
      /* best effort */
    }
  }
}
