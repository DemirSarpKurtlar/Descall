/**
 * Babylon.js runtime for the 3D world (phase 1: living room).
 * Loaded lazily with the world chunk; nothing here runs unless the world opens.
 *
 * - Room: baked GLB (static lighting in textures, drawn unlit) + emissive lamps
 *   and city (HDR, bloom). Colliders, seats, spawn points and the hero camera
 *   come from named nodes in the GLB (COL_*, ROOM_BOUNDS, SEAT_*, SPAWN_*, CAM_*).
 * - Avatars: AvatarController per member, palette-recoloured.
 * - Local player: WASD / arrows relative to the camera, Shift runs, click on the
 *   floor to walk there, E sits on / stands up from the nearest seat, G emote wheel.
 * - Camera: orbit (drag) + zoom (wheel), boom shortened so it never leaves the room.
 * - Rendering pauses while the window is hidden / minimised; dispose() frees the GPU.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import "@babylonjs/loaders/glTF/2.0";
import "@babylonjs/loaders/glTF/glTFFileLoader";

import { AvatarController, loadAvatarAsset, measureYawOffset, RUN_SPEED, WALK_SPEED } from "./avatars.js";
import { makeBox, resolve, clampBoom } from "./collision.js";
import { PRESETS, createGovernor, lowerPreset } from "./quality.js";
import { createClock, createSnapshotBuffer } from "../net/snapshotBuffer.js";
import { STATE, STATES, EMOTE, EMOTES, encodeSnapshot, SNAP_INTERVAL_MS } from "../net/protocol.js";
import { looksForRoom } from "./look.js";

const AVATAR_RADIUS = 0.24;
const SIT_RANGE = 1.9;
const EMISSIVE_LEVELS = {
  EMIT_shade: 1.15,
  EMIT_globe: 1.2,
  EMIT_lava: 1.3,
  EMIT_sky_far: 0.95,
  EMIT_sky_near: 1.0,
};

function isTyping() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export class WorldEngine {
  constructor(canvas, { assetBase = "/world3d/", quality, selfId, lookOverrides = null, onFrame, onSeatHint, onEmoteWheel, onStats, onLocalSnapshot, onFatal } = {}) {
    this.canvas = canvas;
    this.assetBase = assetBase;
    this.quality = quality || PRESETS.medium;
    this.selfId = String(selfId || "me");
    this.lookOverrides = lookOverrides; // { userId: LOOKS index } (previews / tests only)
    this.cb = { onFrame, onSeatHint, onEmoteWheel, onStats, onLocalSnapshot, onFatal };
    this.avatars = new Map();
    this.remote = new Map(); // id -> { buffer, lastEmoteSeq, lastPos }
    this.clock = createClock();
    this.keys = new Set();
    this.moveTarget = null;
    this.local = { pos: new Vector3(2.5, 0, 2.5), yaw: 0, speed: 0, state: "idle", seat: -1, emote: 0, emoteSeq: 0, stateUntil: 0, sitFrom: null };
    this.lastSent = 0;
    this.lastSentKey = "";
    this.paused = false;
    this.disposed = false;
    this.governor = createGovernor();
    this.tmp = new Vector3();
    this.speakers = new Set();
  }

  async init() {
    const engine = new Engine(this.canvas, this.quality.msaa > 1, {
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: "high-performance",
      antialias: this.quality.msaa > 1,
      disableWebGL2Support: false,
      doNotHandleContextLost: false,
    }, false);
    this.engine = engine;
    engine.setHardwareScalingLevel(1 / Math.min(1.5, (window.devicePixelRatio || 1) * this.quality.pixelRatio));
    const scene = new Scene(engine);
    this.scene = scene;
    this.instrumentation = new SceneInstrumentation(scene);
    this.instrumentation.captureFrameTime = true;
    scene.clearColor = new Color4(0.04, 0.03, 0.09, 1);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;

    const cam = new ArcRotateCamera("cam", -Math.PI / 2, 1.1, 6, new Vector3(3, 1, 3), scene);
    cam.minZ = 0.05;
    cam.maxZ = 120;
    cam.lowerRadiusLimit = 1.6;
    cam.upperRadiusLimit = 9;
    cam.lowerBetaLimit = 0.35;
    cam.upperBetaLimit = 1.52;
    cam.wheelDeltaPercentage = 0.01;
    cam.panningSensibility = 0;
    cam.angularSensibilityX = 1400;
    cam.angularSensibilityY = 1400;
    cam.inertia = 0.82;
    cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    cam.fov = 1.211; // 69.4 deg horizontal, same as the hero render (26 mm on 36 mm)
    cam.attachControl(this.canvas, true);
    this.camera = cam;

    await this.loadRoom();
    await this.loadAvatars();
    this.setupLights();
    this.setupPost();
    this.setupInput();
    this.applyHeroCamera();

    this.lastT = this.nowMs();
    engine.runRenderLoop(() => this.frame());
    this.onResize = () => engine.resize();
    window.addEventListener("resize", this.onResize);
    this.setupVisibility();
    return this;
  }

  async loadRoom() {
    const scene = this.scene;
    const room = await LoadAssetContainerAsync(`${this.assetBase}living-room.glb`, scene, { pluginExtension: ".glb" });
    room.addAllToScene();
    this.room = room;
    const boxes = [];
    this.seats = [];
    this.spawns = [];
    const nodes = [...room.transformNodes, ...room.meshes];
    const byName = new Map(nodes.map((n) => [n.name, n]));
    for (const n of nodes) n.computeWorldMatrix?.(true);
    for (const m of room.meshes) {
      const name = m.name || "";
      if (name.startsWith("COL_") || name === "ROOM_BOUNDS") {
        m.isVisible = false;
        m.isPickable = false;
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
      m.freezeWorldMatrix?.();
      m.doNotSyncBoundingInfo = true;
      const mat = m.material;
      if (!mat) continue;
      const mname = mat.name || "";
      if (mname.startsWith("BAKED_")) {
        if ("unlit" in mat) mat.unlit = true;
        // leaves are single sided cards
        mat.backFaceCulling = mname !== "BAKED_foliage";
        if (mat.albedoTexture) mat.albedoTexture.anisotropicFilteringLevel = 8;
        // grade: the bake came out a little red on the planks; pull them toward the draft's brown
        if (name === "FLOOR" && "albedoColor" in mat) mat.albedoColor = new Color3(0.86, 0.86, 0.98);
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
    this.avatarAsset = await loadAvatarAsset(this.scene, `${this.assetBase}avatar.glb`);
    this.yawOffset = measureYawOffset(this.avatarAsset);
  }

  setupLights() {
    const scene = this.scene;
    // Characters only: the room is baked. Approximate the baked light so avatars sit in it.
    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
    hemi.diffuse = Color3.FromHexString("#9a86ff");
    hemi.groundColor = Color3.FromHexString("#3b2846");
    hemi.specular = Color3.Black();
    hemi.intensity = 0.62;
    const win = new DirectionalLight("window", new Vector3(0.15, -0.35, -1), scene);
    win.diffuse = Color3.FromHexString("#6f7cff");
    win.specular = Color3.FromHexString("#3b46aa");
    win.intensity = 0.55;
    const front = new DirectionalLight("front", new Vector3(0.2, -0.45, 1), scene);
    front.diffuse = Color3.FromHexString("#ffd9e6");
    front.specular = Color3.Black();
    front.intensity = 0.38;
    this.lights = [hemi, win, front];
    for (const l of this.lampPositions) {
      const p = new PointLight(`pl_${l.name}`, l.pos, scene);
      if (/lava/.test(l.name)) {
        p.diffuse = Color3.FromHexString("#ff5fd2");
        p.intensity = 1.2;
        p.range = 2.2;
      } else {
        p.diffuse = Color3.FromHexString("#ffb46e");
        p.intensity = 3.2;
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
  }

  setupPost() {
    const scene = this.scene;
    const q = this.quality;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.15;
    scene.imageProcessingConfiguration.contrast = 1.12;
    const pipe = new DefaultRenderingPipeline("post", true, scene, [this.camera]);
    pipe.samples = q.msaa;
    pipe.imageProcessingEnabled = true;
    pipe.imageProcessing.toneMappingEnabled = true;
    pipe.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipe.imageProcessing.exposure = 1.15;
    pipe.imageProcessing.contrast = 1.12;
    pipe.imageProcessing.vignetteEnabled = true;
    pipe.imageProcessing.vignetteWeight = 1.4;
    pipe.imageProcessing.vignetteColor = new Color4(0.05, 0.02, 0.12, 0);
    pipe.fxaaEnabled = q.fxaa;
    pipe.bloomEnabled = q.bloom;
    if (q.bloom) {
      pipe.bloomThreshold = 0.82;
      pipe.bloomWeight = 0.45;
      pipe.bloomKernel = 72;
      pipe.bloomScale = 0.5;
    }
    pipe.depthOfFieldEnabled = q.dof;
    if (q.dof) {
      pipe.depthOfFieldBlurLevel = 0; // low
      pipe.depthOfField.fStop = 4.0;
      pipe.depthOfField.focalLength = 28;
      pipe.depthOfField.focusDistance = 5200;
    }
    this.pipeline = pipe;
    if (q.ssao) {
      try {
        const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera], true);
        ssao.radius = 0.6;
        ssao.totalStrength = 0.9;
        ssao.samples = 12;
        ssao.maxZ = 30;
        this.ssao = ssao;
      } catch {
        this.ssao = null;
      }
    }
    if (q.mirror && this.floor) {
      // glossy floor: blurred mirror of the lamps and people (high preset only)
      const mirror = new MirrorTexture("floorMirror", { ratio: 0.5 }, scene, true);
      mirror.mirrorPlane = new Plane(0, -1, 0, 0.0);
      mirror.adaptiveBlurKernel = 24;
      mirror.renderList = this.scene.meshes.filter((m) => /EMIT_/.test(m.name) || /sofa|table|console|tv/i.test(m.name));
      this.mirror = mirror;
      this.mirrorAvatars = true;
      const mat = this.floor.material;
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
    }
  }

  applyHeroCamera() {
    const cam = this.camera;
    if (this.hero) {
      cam.setTarget(this.hero.target.clone());
      cam.setPosition(this.hero.pos.clone());
      this.heroRadius = cam.radius;
      this.roomFocus = this.hero.target.clone();
    } else {
      this.roomFocus = new Vector3(3, 0.8, 3);
    }
    this.camFollow = 0; // 0 = hero framing, 1 = follow avatar
  }

  setupInput() {
    const onKeyDown = (e) => {
      if (isTyping() || this.disposed) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
        this.keys.add(k);
        this.moveTarget = null;
        if (k.startsWith("arrow")) e.preventDefault();
      } else if (k === "e" && !e.repeat) {
        this.toggleSit();
      } else if (k === "b" && !e.repeat) {
        this.toggleGuitar();
      } else if (k === "g" && !e.repeat) {
        this.cb.onEmoteWheel?.("toggle");
      } else if (k === "escape") {
        this.cb.onEmoteWheel?.("close");
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
        if (moved > 6 || !quick) return;
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m.isPickable && m.isEnabled());
        if (pick?.hit && pick.pickedPoint) {
          if (this.local.state === "sit" || this.local.state === "sitDown") this.standUp();
          const p = pick.pickedPoint;
          this.moveTarget = new Vector3(p.x, 0, p.z);
          this.camFollow = Math.max(this.camFollow, 0.6);
        }
      }
    });
  }

  setupVisibility() {
    const update = () => {
      const hidden = document.hidden || document.documentElement.classList.contains("app-backgrounded");
      if (hidden && !this.paused) {
        this.paused = true;
        this.engine.stopRenderLoop();
      } else if (!hidden && this.paused && !this.disposed) {
        this.paused = false;
        this.lastT = this.nowMs();
        this.engine.runRenderLoop(() => this.frame());
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

  // ------------------------------------------------------------ members

  /** members: [{ id, name, snap? }] including self. */
  setMembers(members) {
    const ids = members.map((m) => String(m.id));
    const looks = looksForRoom(ids, this.lookOverrides);
    for (const id of [...this.avatars.keys()]) {
      if (!ids.includes(id)) {
        this.avatars.get(id).dispose();
        this.avatars.delete(id);
        this.remote.delete(id);
      }
    }
    for (const m of members) {
      const id = String(m.id);
      if (this.avatars.has(id)) continue;
      const av = new AvatarController(this.scene, this.avatarAsset, id, looks.get(id), { yawOffset: this.yawOffset });
      this.avatars.set(id, av);
      if (this.mirror && this.mirrorAvatars) this.mirror.renderList.push(...av.meshes.filter((x) => x.isEnabled()));
      if (id === this.selfId) {
        const spawn = this.pickSpawn();
        this.local.pos.copyFrom(spawn);
        this.local.yaw = Math.atan2(this.roomFocus.x - spawn.x, this.roomFocus.z - spawn.z);
        av.setPose(this.local.pos, this.local.yaw, 0, false);
      } else {
        this.remote.set(id, { buffer: createSnapshotBuffer(), lastEmoteSeq: m.snap ? m.snap[6] : 0, last: null });
        if (m.snap) this.pushRemote(id, this.clock.serverNow(this.nowMs()), m.snap);
        else av.setPose(new Vector3(0, -50, 0), 0, 0, false);
      }
    }
  }

  pickSpawn() {
    const taken = [...this.avatars.values()].map((a) => a.position);
    for (const s of this.spawns.length ? this.spawns : [new Vector3(2.5, 0, 2.5)]) {
      if (!taken.some((p) => Vector3.Distance(p, s) < 0.7)) return s.clone();
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
      this.pushRemote(id, batch.t, row.slice(1));
    }
  }

  pushRemote(id, t, snap) {
    const r = this.remote.get(id);
    if (!r) return;
    const [x, y, z, yaw, state, emote, emoteSeq, seat] = snap;
    r.buffer.push(t, { x, y, z, yaw, state, emote, emoteSeq, seat });
  }

  setSpeakers(ids) {
    this.speakers = new Set([...ids].map(String));
  }

  // ------------------------------------------------------------ local actions

  nearestSeat(range = SIT_RANGE) {
    let best = null;
    let bd = range;
    const occupied = new Set();
    for (const [id, r] of this.remote) {
      const last = r.last;
      if (last && last.seat >= 0) occupied.add(last.seat);
    }
    this.seats.forEach((s, i) => {
      if (occupied.has(i)) return;
      const d = Math.hypot(s.pos.x - this.local.pos.x, s.pos.z - this.local.pos.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
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
    this.local.sitFrom = { pos: this.local.pos.clone(), yaw: this.local.yaw, t: this.nowMs() };
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

  resetCamera() {
    this.applyHeroCamera();
  }

  setQuality(preset) {
    // simplest correct path: rebuild post-processing with the new preset
    this.quality = preset;
    this.engine.setHardwareScalingLevel(1 / Math.min(1.5, (window.devicePixelRatio || 1) * preset.pixelRatio));
    this.pipeline?.dispose();
    this.ssao?.dispose?.();
    this.ssao = null;
    if (this.mirror && !preset.mirror) {
      const mat = this.floor?.material;
      if (mat) {
        mat.reflectionTexture = null;
        mat.unlit = true;
        mat.albedoTexture = mat.emissiveTexture || mat.albedoTexture;
        mat.albedoColor = Color3.White();
        mat.emissiveTexture = null;
        mat.emissiveColor = Color3.Black();
      }
      this.mirror.dispose();
      this.mirror = null;
    }
    this.setupPost();
  }

  // ------------------------------------------------------------ frame

  /** Wall clock, or a virtual clock while stepping frames by hand (evidence capture). */
  nowMs() {
    return this.fixedStepMs ? this.virtualNow : performance.now();
  }

  /** Stop the loop and advance in fixed steps (deterministic capture on slow software GL). */
  manualStep(frames = 1, stepMs = 1000 / 30) {
    if (!this.fixedStepMs) {
      this.engine.stopRenderLoop();
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

  frame() {
    if (this.disposed) return;
    const now = this.nowMs();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.governor.push(dt * 1000);
    this.updateLocal(dt, now);
    this.updateRemote(dt, now);
    this.updateCamera(dt);
    this.scene.render();
    this.emitFrame(now);
    if (now - (this.lastStats || 0) > 1000) {
      this.lastStats = now;
      this.cb.onStats?.({
        fps: Math.round(this.engine.getFps()),
        frameMs: this.governor.average(),
        drawCalls: this.instrumentation?.drawCallsCounter.current ?? null,
        meshes: this.scene.getActiveMeshes().length,
        avatars: this.avatars.size,
        quality: this.quality.id,
      });
      if (this.governor.shouldStepDown() && this.quality.id !== "low" && !this.lockQuality) {
        this.setQuality(PRESETS[lowerPreset(this.quality.id)]);
      }
    }
  }

  updateLocal(dt, now) {
    const av = this.avatars.get(this.selfId);
    if (!av) return;
    const L = this.local;
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
      if (this.keys.size) this.standUp();
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
      // input direction relative to the camera
      const fwd = this.camera.getForwardRay(1).direction;
      const f = new Vector3(fwd.x, 0, fwd.z).normalize();
      const r = new Vector3(f.z, 0, -f.x);
      let ix = 0;
      let iz = 0;
      if (this.keys.has("w") || this.keys.has("arrowup")) iz += 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) iz -= 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) ix += 1;
      if (this.keys.has("a") || this.keys.has("arrowleft")) ix -= 1;
      let dir = null;
      if (ix || iz) {
        dir = f.scale(iz).add(r.scale(ix)).normalize();
      } else if (this.moveTarget) {
        const d = this.moveTarget.subtract(new Vector3(L.pos.x, 0, L.pos.z));
        if (d.length() < 0.08) this.moveTarget = null;
        else dir = d.normalize();
      }
      const target = dir ? (this.keys.has("shift") ? RUN_SPEED : WALK_SPEED) : 0;
      L.speed += (target - L.speed) * Math.min(1, dt * (target > L.speed ? 6 : 10));
      if (L.speed < 0.02) L.speed = 0;
      if (dir) {
        L.moveDir = dir;
        L.yaw = Math.atan2(dir.x, dir.z);
      }
      if (L.speed > 0 && L.moveDir) {
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
      if (this.keys.size && this.approach) this.approach = null;
      if (L.emote && now > (L.emoteUntil || 0)) L.emote = 0;
      if (speed > 0.2) L.emote = 0;
      L.state = speed > 0.05 ? (speed > WALK_SPEED + 0.2 ? "run" : "walk") : "idle";
      if (L.emote) L.state = "emote";
    }
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
    const key = snap.join(",");
    if (key === this.lastSentKey && now - this.lastSent < 1000) return;
    this.lastSent = now;
    this.lastSentKey = key;
    this.cb.onLocalSnapshot?.(snap);
  }

  updateRemote(dt, now) {
    const serverNow = this.clock.serverNow(now);
    for (const [id, r] of this.remote) {
      const av = this.avatars.get(id);
      if (!av) continue;
      const s = r.buffer.sample(serverNow);
      if (!s) continue;
      const pos = this.tmp.set(s.x, 0, s.z);
      let speed = 0;
      if (r.last) {
        speed = Math.hypot(s.x - r.last.x, s.z - r.last.z) / Math.max(1e-4, dt);
        r.speed = (r.speed || 0) + (speed - (r.speed || 0)) * Math.min(1, dt * 8);
      }
      const stateName = STATES[s.state] || "idle";
      if (s.emoteSeq !== r.lastEmoteSeq) {
        r.lastEmoteSeq = s.emoteSeq;
        if (s.emote > 0) av.triggerEmote(EMOTES[s.emote], now / 1000);
        else av.cancelEmote();
      }
      const loco = stateName === "walk" || stateName === "run" || stateName === "emote" ? "idle" : stateName;
      av.setLocomotion(loco, stateName === "walk" || stateName === "run" ? r.speed || 0 : 0);
      av.setSpeaking(this.speakers.has(id));
      av.update(dt, now / 1000);
      // seated avatars face the seat direction and sit on it
      if ((stateName === "sit" || stateName === "sitDown") && this.seats[s.seat]) {
        const seat = this.seats[s.seat];
        av.setPose(seat.pos, seat.yaw, dt);
      } else {
        av.setPose(pos, s.yaw, dt);
      }
      r.last = s;
    }
  }

  updateCamera(dt) {
    if (this.cameraLocked) return;
    const cam = this.camera;
    const self = this.avatars.get(this.selfId);
    if (!self) return;
    if (this.local.speed > 0.1) this.camFollow = Math.min(1, this.camFollow + dt * 0.8);
    const k = 0.55 * this.camFollow;
    const desired = new Vector3(
      this.roomFocus.x + (self.position.x - this.roomFocus.x) * k,
      this.roomFocus.y + (1.0 - this.roomFocus.y) * k,
      this.roomFocus.z + (self.position.z - this.roomFocus.z) * k,
    );
    cam.target.x += (desired.x - cam.target.x) * Math.min(1, dt * 3);
    cam.target.y += (desired.y - cam.target.y) * Math.min(1, dt * 3);
    cam.target.z += (desired.z - cam.target.z) * Math.min(1, dt * 3);
    // camera collision: keep the camera inside the room box
    const dir = cam.position.subtract(cam.target).normalize();
    this.userRadius = this.userRadius ?? cam.radius;
    if (Math.abs(cam.radius - (this.lastSetRadius ?? cam.radius)) > 1e-3) this.userRadius = cam.radius; // wheel input
    const allowed = clampBoom(cam.target, dir, this.userRadius, this.bounds, 0.25);
    cam.radius = Math.min(this.userRadius, allowed);
    this.lastSetRadius = cam.radius;
  }

  emitFrame(now) {
    if (!this.cb.onFrame) return;
    const out = [];
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const vp = this.camera.viewport.toGlobal(w, h);
    const tm = this.scene.getTransformMatrix();
    const head = new Vector3();
    for (const [id, av] of this.avatars) {
      av.headPosition(head);
      const p = Vector3.Project(head, Matrix.IdentityReadOnly, tm, vp);
      const behind = Vector3.Dot(head.subtract(this.camera.position), this.camera.getForwardRay(1).direction) < 0;
      out.push({ id, x: p.x / w, y: p.y / h, visible: !behind && p.z > 0 && p.z < 1 && av.position.y > -10, state: id === this.selfId ? this.local.state : STATES[this.remote.get(id)?.last?.state] });
    }
    this.cb.onFrame(out, now);
  }

  stats() {
    return {
      fps: this.engine?.getFps?.() ?? 0,
      drawCalls: this.instrumentation?.drawCallsCounter.current ?? null,
      frameMs: this.instrumentation?.frameTimeCounter.lastSecAverage ?? null,
      activeTriangles: Math.round((this.scene?.getActiveIndices?.() || 0) / 3),
      activeMeshes: this.scene?.getActiveMeshes?.().length ?? 0,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.instrumentation?.dispose();
      this.unbindKeys?.();
      this.unbindVisibility?.();
      window.removeEventListener("resize", this.onResize);
      for (const a of this.avatars.values()) a.dispose();
      this.avatars.clear();
      this.avatarAsset?.container.dispose();
      this.pipeline?.dispose();
      this.ssao?.dispose?.();
      this.mirror?.dispose();
      this.engine?.stopRenderLoop();
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
