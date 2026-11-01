/**
 * Avatars: one shared GLB (rig + 18 clips + morphs), instantiated per member.
 * Colours come from a 64 x 64 palette texture per avatar (see look.js), so every
 * avatar is a handful of draw calls whatever its outfit.
 *
 * AvatarController blends animation groups by weight (idle/walk/run by speed,
 * sit/emote layers with cross-fades), keeps yaw smooth, blinks and moves the
 * mouth while the person is speaking.
 *
 * Frame cost (3D world performance pass):
 *   - no allocation per frame: slots are an array, targets live on the slots
 *   - a group's weight is written only when it changes (the setter walks every
 *     animatable of the group), and a group that owns the pose alone runs with weight -1,
 *     which skips Babylon's late blending (it allocated holder objects for every bone)
 *   - face morphs: a constant number of influencers (optimizeInfluencers off) and never
 *     exactly 0, so blinking or talking never marks the mesh dirty or asks for a new
 *     shader variant mid-session
 *   - skinning runs on the GPU (bone texture); off-screen avatars pause their clips
 *   - parts skip bounding-box sync and frustum culling (cheaper than drawing them)
 *   - blob shadows are thin instances of one disc: one draw call for everyone
 *   - controllers are pooled: a member joining reuses a prepared instance (palette repaint
 *     and part visibility), so nothing is cloned or compiled while people come and go
 */
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { CELLS } from "./look.js";
import { lerpAngle } from "../net/snapshotBuffer.js";

// The model is authored ~1.5 m tall; the drafts show the cast a bit larger next to the sofa.
export const AVATAR_SCALE = 1.15;
// Nominal ground speeds of the authored clips (stride / cycle, build_character.py) at that scale.
export const WALK_NOMINAL = 0.96 * AVATAR_SCALE;
export const RUN_NOMINAL = 2.33 * AVATAR_SCALE;
export const WALK_SPEED = 1.35;
export const RUN_SPEED = 3.0;

const LOOPS = new Set(["idle", "walk", "run", "sit", "dance", "cheer", "sitCheer", "guitar", "sitGuitar"]);
const EMOTE_CLIPS = { wave: "wave", dance: "dance", clap: "clap", laugh: "laugh", jump: "jump", cheer: "cheer", guitar: "guitar" };
const SEATED_EMOTES = { wave: "sitWave", clap: "sitClap", laugh: "sitLaugh", jump: "sitCheer", cheer: "sitCheer", dance: "sitCheer", guitar: "sitGuitar" };
// guitar plays until the person moves, stands up or stops it
const EMOTE_SECONDS = { wave: 1.95, dance: 6.0, clap: 1.6, laugh: 2.0, jump: 1.2, cheer: 4.0, guitar: 36000 };
/** Parts on the head: hidden from the owner's own first-person camera. */
const HEAD_PARTS = /^(face|hair_.+|acc_cap|acc_glasses|acc_headphones)$/;
/** Lowest morph influence: never exactly 0 (a 0 crossing re-syncs the morph manager). */
const MORPH_FLOOR = 1e-4;
/** Weight not written yet (forces the next update to set it). */
const UNSET = 99;

export async function loadAvatarAsset(scene, url, onProgress) {
  const container = await LoadAssetContainerAsync(url, scene, {
    pluginExtension: ".glb",
    onProgress: onProgress ? (e) => e.lengthComputable && onProgress(e.loaded / e.total) : undefined,
  });
  // Keep the template out of the scene; instances are created per member.
  return { container, template: container.materials.find((m) => /AVATAR/i.test(m.name)) || container.materials[0] };
}

function paintPalette(tex, colors) {
  const ctx = tex.getContext();
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 64, 64);
  for (const [cell, idx] of Object.entries(CELLS)) {
    const hex = colors[cell];
    if (!hex) continue;
    ctx.fillStyle = hex;
    ctx.fillRect((idx % 8) * 8, Math.floor(idx / 8) * 8, 8, 8);
  }
  tex.update(false);
}

function paletteTexture(scene, name) {
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Blob shadows for every avatar as thin instances of one disc (one draw call).
 * set(slot, x, z, scale) per frame, flush() once after all avatars moved.
 */
export function createShadowPool(scene, capacity = 16) {
  const tex = new DynamicTexture("blob", { width: 128, height: 128 }, scene, true);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(10,6,24,0.62)");
  g.addColorStop(0.55, "rgba(10,6,24,0.32)");
  g.addColorStop(1, "rgba(10,6,24,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  tex.hasAlpha = true;
  tex.update();
  const mat = new StandardMaterial("blobMat", scene);
  mat.diffuseTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  mat.emissiveColor = Color3.Black();
  mat.useAlphaFromDiffuseTexture = true;
  mat.backFaceCulling = false;
  mat.zOffset = -2;
  const disc = CreateDisc("blobShadows", { radius: 0.36, tessellation: 24 }, scene);
  disc.material = mat;
  disc.isPickable = false;
  disc.alwaysSelectAsActiveMesh = true; // the instances move every frame, the disc itself never culls
  disc.doNotSyncBoundingInfo = true;
  let cap = capacity;
  let buf = new Float32Array(cap * 16);
  const free = [];
  let count = 0;
  const m = new Matrix();
  const rot = Matrix.RotationX(Math.PI / 2);
  const hide = (i) => {
    buf.fill(0, i * 16, i * 16 + 16);
  };
  disc.thinInstanceSetBuffer("matrix", buf, 16, false);
  disc.thinInstanceCount = 0;
  let dirty = true;
  return {
    mesh: disc,
    material: mat,
    acquire() {
      if (free.length) return free.pop();
      if (count >= cap) {
        const next = new Float32Array(cap * 2 * 16);
        next.set(buf);
        buf = next;
        cap *= 2;
        disc.thinInstanceSetBuffer("matrix", buf, 16, false);
        disc.thinInstanceCount = count;
      }
      const i = count;
      count += 1;
      disc.thinInstanceCount = count;
      hide(i);
      dirty = true;
      return i;
    },
    release(i) {
      hide(i);
      free.push(i);
      dirty = true;
    },
    set(i, x, z, scale) {
      if (scale <= 0) {
        hide(i);
      } else {
        Matrix.ScalingToRef(scale, scale, scale, m);
        m.multiplyToRef(rot, m);
        m.setTranslationFromFloats(x, 0.012, z);
        m.copyToArray(buf, i * 16);
      }
      dirty = true;
    },
    flush() {
      if (!dirty) return;
      dirty = false;
      disc.thinInstanceBufferUpdated("matrix");
    },
    dispose() {
      disc.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

let poolSeq = 0;

export class AvatarController {
  constructor(scene, asset, id, look, { yawOffset = 0, shadows = null } = {}) {
    this.scene = scene;
    this.yawOffset = yawOffset;
    this.key = `av${(poolSeq += 1)}`;
    this.holder = new TransformNode(`avatar_${this.key}`, scene);
    this.holder.scaling.setAll(AVATAR_SCALE);
    const inst = asset.container.instantiateModelsToScene((n) => `${this.key}:${n}`, false, { doNotInstantiate: true });
    this.inst = inst;
    for (const r of inst.rootNodes) r.parent = this.holder;
    this.meshes = [];
    for (const r of inst.rootNodes) this.meshes.push(...r.getChildMeshes(false));
    this.palette = paletteTexture(scene, `palette_${this.key}`);
    const mat = asset.template.clone(`avatarMat_${this.key}`);
    if ("albedoTexture" in mat) {
      mat.albedoTexture = this.palette;
      mat.albedoColor = Color3.White();
      mat.metallic = 0;
      mat.roughness = 0.62;
      mat.maxSimultaneousLights = 6;
      mat.environmentIntensity = 0.55;
      // soft toon-PBR look: fabric-like sheen reads as a gentle lavender rim light
      if (mat.sheen) {
        mat.sheen.isEnabled = true;
        mat.sheen.intensity = 0.55;
        mat.sheen.color = Color3.FromHexString("#d6c8ff");
        mat.sheen.roughness = 0.45;
      }
    } else {
      mat.diffuseTexture = this.palette;
    }
    this.material = mat;
    // eyes, brows and mouth: glossy (big dark eyes with a sharp highlight)
    this.faceMaterial = mat.clone(`avatarFace_${this.key}`);
    if ("roughness" in this.faceMaterial) {
      // a cloned DynamicTexture would come back empty: share the palette itself
      this.faceMaterial.albedoTexture = this.palette;
      this.faceMaterial.roughness = 0.16;
      if (this.faceMaterial.sheen) this.faceMaterial.sheen.isEnabled = false;
    }
    this.parts = [];
    for (const m of this.meshes) {
      m.material = mat;
      m.isPickable = false;
      // skinned parts move every frame: no bounding-box sync or culling per part (eight
      // avatars of a few thousand triangles cost less to draw than to cull and re-box)
      m.alwaysSelectAsActiveMesh = true;
      m.doNotSyncBoundingInfo = true;
      const part = String(m.name).split(":").pop().replace(/_primitive\d+$/, "");
      this.parts.push({ mesh: m, part, head: HEAD_PARTS.test(part) });
      if (part === "face") {
        this.face = m;
        m.material = this.faceMaterial;
      }
      if (part === "acc_guitar") this.guitar = m;
    }
    this.headNode = null;
    for (const r of inst.rootNodes) {
      this.headNode = this.headNode || r.getDescendants(false).find((n) => /:head$/.test(n.name)) || null;
    }
    this.headScale = this.headNode ? this.headNode.scaling.clone() : null;
    this.shadows = shadows;
    this.shadowSlot = shadows ? shadows.acquire() : -1;
    this.slots = [];
    this.groups = {};
    for (const g of inst.animationGroups) {
      const name = String(g.name).split(":").pop();
      g.stop();
      g.weight = 0;
      const slot = { name, g, w: 0, target: 0, playing: false, set: 0, ratio: 1 };
      this.slots.push(slot);
      this.groups[name] = slot;
    }
    this.morphs = this.face?.morphTargetManager || null;
    this.blinkTarget = null;
    this.mouthTarget = null;
    if (this.morphs) {
      // a constant influencer count: one shader for the face, whatever the expression
      this.morphs.optimizeInfluencers = false;
      for (let i = 0; i < this.morphs.numTargets; i += 1) {
        const t = this.morphs.getTarget(i);
        if (/blink/i.test(t.name)) this.blinkTarget = t;
        else if (/mouth/i.test(t.name)) this.mouthTarget = t;
        t.influence = MORPH_FLOOR;
      }
    }
    this.position = new Vector3(0, 0, 0);
    this.headOffset = 1.68 * AVATAR_SCALE;
    this.measureEye();
    this.reset(id, look);
  }

  /** Eye height and how far in front of the body axis the face is (bind pose). */
  measureEye() {
    this.eye = { y: 1.55 * AVATAR_SCALE, forward: 0.2 * AVATAR_SCALE, headY: 1.25 * AVATAR_SCALE };
    try {
      this.holder.computeWorldMatrix(true);
      for (const r of this.inst.rootNodes) r.computeWorldMatrix(true);
      if (this.headNode) {
        this.headNode.computeWorldMatrix(true);
        this.eye.headY = this.headNode.getAbsolutePosition().y - this.holder.position.y;
      }
      if (this.face) {
        this.face.computeWorldMatrix(true);
        const bb = this.face.getBoundingInfo().boundingBox;
        const h = bb.maximumWorld.y - bb.minimumWorld.y;
        // eyes sit in the upper part of the face mesh (eyes, brows above the mouth)
        this.eye.y = bb.minimumWorld.y + h * 0.62 - this.holder.position.y;
        const c = bb.centerWorld;
        this.eye.forward = Math.hypot(c.x - this.holder.position.x, c.z - this.holder.position.z) + Math.max(0.02, (bb.maximumWorld.z - bb.minimumWorld.z) * 0.5);
      }
    } catch {
      /* defaults */
    }
  }

  /** (Re)dress this instance for a member: id, palette, outfit parts. Used by the pool. */
  reset(id, look) {
    this.id = String(id);
    this.look = look;
    paintPalette(this.palette, look.colors);
    const show = new Set(["body", "face", `hair_${look.hair}`, ...(look.outfit === "sweater" ? [] : [`extra_${look.outfit}`]), ...look.accessories.map((a) => `acc_${a}`)]);
    // the cap covers the hair completely (no hair poking through the crown)
    if (look.accessories.includes("cap")) show.delete(`hair_${look.hair}`);
    this.show = show;
    for (const p of this.parts) {
      p.mesh.metadata = show.has(p.part) ? { ...(p.mesh.metadata || {}), avatarId: this.id } : p.mesh.metadata;
    }
    this.headHidden = false;
    this.applyVisibility();
    this.blinkT = 2 + Math.random() * 3;
    this.speaking = false;
    this.mouth = 0;
    this.blink = 0;
    this.state = "idle";
    this.emote = null;
    this.emoteUntil = 0;
    this.speed = 0;
    this.yaw = 0;
    this.animPaused = false;
    this.offscreenFor = 0;
    for (const s of this.slots) {
      if (s.playing) s.g.stop();
      s.playing = false;
      s.w = 0;
      s.target = 0;
      s.set = 0;
      s.g.weight = 0;
    }
    this.holder.setEnabled(true);
    this.setTarget("idle", 1, true);
  }

  applyVisibility() {
    for (const p of this.parts) {
      if (p.part === "acc_guitar") {
        p.mesh.setEnabled(this.emote?.name === "guitar" && !this.headHidden);
        continue;
      }
      p.mesh.setEnabled(this.show.has(p.part) && !(this.headHidden && p.head));
    }
  }

  /** First person: the owner's camera sits in the head, so the head is not drawn. */
  setHeadHidden(v) {
    const next = Boolean(v);
    if (next === this.headHidden) return;
    this.headHidden = next;
    this.applyVisibility();
    if (!next && this.headNode && this.headScale) this.headNode.scaling.copyFrom(this.headScale);
  }

  /** After the animations wrote the bones: collapse the head bone (skin of the head) while hidden. */
  applyHeadHide() {
    if (this.headHidden && this.headNode) this.headNode.scaling.setAll(1e-4);
  }

  /** Back to the pool: invisible, clips stopped, shadow hidden. */
  deactivate() {
    for (const s of this.slots) {
      if (s.playing) s.g.stop();
      s.playing = false;
      s.w = 0;
      s.set = 0;
    }
    this.emote = null;
    this.holder.setEnabled(false);
    if (this.shadows && this.shadowSlot >= 0) this.shadows.set(this.shadowSlot, 0, 0, 0);
    this.position.set(0, -50, 0);
    this.holder.position.copyFrom(this.position);
  }

  play(name, { loop = LOOPS.has(name), from = 0, speed = 1 } = {}) {
    const slot = this.groups[name];
    if (!slot) return null;
    if (!slot.playing) {
      slot.g.start(loop, speed, slot.g.from + from, slot.g.to, false);
      slot.playing = true;
      slot.ratio = speed;
      slot.set = UNSET;
      if (this.animPaused) slot.g.pause();
    }
    return slot;
  }

  setTarget(name, w, immediate = false) {
    const slot = this.groups[name];
    if (!slot) return;
    slot.target = w;
    if (w > 0) this.play(name);
    if (immediate) {
      slot.w = w;
      slot.g.weight = w;
      slot.set = w;
    }
  }

  restart(name) {
    const slot = this.groups[name];
    if (!slot) return;
    slot.g.stop();
    slot.playing = false;
    slot.g.start(LOOPS.has(name), 1, slot.g.from, slot.g.to, false);
    slot.playing = true;
    slot.ratio = 1;
    slot.set = UNSET;
    if (this.animPaused) slot.g.pause();
  }

  /** Locomotion / sit state from gameplay. `speed` in m/s. */
  setLocomotion(state, speed) {
    this.state = state;
    this.speed = speed;
  }

  triggerEmote(name, nowSec = performance.now() / 1000) {
    let clip = EMOTE_CLIPS[name];
    if (!clip) return;
    const seated = this.state === "sit" || this.state === "sitDown";
    if (seated) clip = SEATED_EMOTES[name] || "sitCheer";
    if (!this.groups[clip]) return;
    const same = this.emote?.clip === clip && this.groups[clip].playing && this.groups[clip].w > 0.5;
    this.emote = { name, clip };
    // the same looping emote again just keeps going (no snap back to the first frame)
    if (!same || !LOOPS.has(clip)) this.restart(clip);
    this.emoteUntil = nowSec + (EMOTE_SECONDS[name] || 2);
  }

  cancelEmote() {
    this.emote = null;
  }

  setSpeaking(v) {
    this.speaking = Boolean(v);
  }

  /** Off-screen avatars stop evaluating their clips (they resume where they were). */
  setAnimPaused(v) {
    const next = Boolean(v);
    if (next === this.animPaused) return;
    this.animPaused = next;
    for (const s of this.slots) {
      if (!s.playing) continue;
      if (next) s.g.pause();
      else s.g.play();
    }
  }

  setSpeedRatio(slot, v) {
    // quantised: the setter walks every animatable of the group
    const q = Math.round(v * 50) / 50;
    if (q !== slot.ratio) {
      slot.ratio = q;
      slot.g.speedRatio = q;
    }
  }

  /** Per frame: weights, blink, mouth. dt seconds. */
  update(dt, now) {
    const slots = this.slots;
    for (let i = 0; i < slots.length; i += 1) slots[i].target = 0;
    const G = this.groups;
    const st = this.state;
    if (st === "sitDown") G.sitDown && (G.sitDown.target = 1);
    else if (st === "sit") G.sit && (G.sit.target = 1);
    else if (st === "standUp") G.standUp && (G.standUp.target = 1);
    else {
      const v = this.speed;
      if (v < 0.05) G.idle.target = 1;
      else if (v < WALK_SPEED) {
        const k = Math.min(1, v / 0.6);
        G.idle.target = 1 - k;
        G.walk.target = k;
      } else {
        const k = Math.min(1, (v - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
        G.walk.target = 1 - k;
        G.run.target = k;
      }
    }
    if (this.emote) {
      const seatedNow = st === "sit" || st === "sitDown";
      const seatedClip = this.emote.clip.startsWith("sit");
      if (seatedClip !== seatedNow && now <= this.emoteUntil) {
        // sat down or stood up mid-emote: switch to the matching variant
        const clip = seatedNow ? SEATED_EMOTES[this.emote.name] || "sitCheer" : EMOTE_CLIPS[this.emote.name];
        if (clip && this.groups[clip] && st !== "standUp") {
          this.emote.clip = clip;
          this.restart(clip);
        } else {
          this.emote = null;
        }
      }
      if (this.emote && (now > this.emoteUntil || this.speed > 0.2)) {
        this.emote = null;
      } else if (this.emote) {
        for (let i = 0; i < slots.length; i += 1) slots[i].target = 0;
        G[this.emote.clip].target = 1;
      }
    }
    if (this.guitar) this.guitar.setEnabled(this.emote?.name === "guitar" && !this.headHidden);
    const rate = Math.min(1, dt * 7);
    let sum = 0;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      slot.w += (slot.target - slot.w) * rate;
      if (slot.target === 0 && slot.w < 0.01) slot.w = 0;
      sum += slot.w;
    }
    // one group at full weight and nothing else: write its bones directly (weight -1)
    let solo = null;
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      if (slot.w === 0) continue;
      if (solo || slot.w / sum < 0.999) {
        solo = false;
        break;
      }
      solo = slot;
    }
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const w = sum > 0 ? slot.w / sum : 0;
      if (w > 0 && !slot.playing) this.play(slot.name);
      if (w === 0 && slot.playing && slot.w === 0) {
        slot.g.stop();
        slot.playing = false;
        slot.set = 0;
        continue;
      }
      if (!slot.playing) continue;
      const want = solo === slot ? -1 : w;
      if (want === -1 ? slot.set !== -1 : Math.abs(want - slot.set) > 0.002 || (want === 0) !== (slot.set === 0)) {
        slot.g.weight = want;
        slot.set = want;
      }
    }
    // match clip cadence to ground speed (no foot sliding)
    const v = this.speed;
    if (G.walk?.playing) this.setSpeedRatio(G.walk, Math.max(0.6, Math.min(2.2, v < 0.3 ? 1 : v / WALK_NOMINAL)));
    if (G.run?.playing) this.setSpeedRatio(G.run, Math.max(0.8, Math.min(1.6, v < RUN_SPEED * 0.5 ? 1.1 : v / RUN_NOMINAL)));
    // keep walk and run in phase while both are weighted
    const wk = G.walk;
    const rn = G.run;
    if (wk?.playing && rn?.playing && wk.w > 0.05 && rn.w > 0.05) {
      const a = wk.g.animatables[0];
      const b = rn.g.animatables[0];
      if (a && b) {
        const pa = (a.masterFrame - wk.g.from) / Math.max(1, wk.g.to - wk.g.from);
        const fb = rn.g.from + pa * (rn.g.to - rn.g.from);
        if (Math.abs(b.masterFrame - fb) > 2) rn.g.goToFrame(fb);
      }
    }
    // face
    if (this.morphs && !this.animPaused) {
      this.blinkT -= dt;
      let blink = 0;
      if (this.blinkT < 0) {
        const p = -this.blinkT / 0.14;
        blink = p < 0.5 ? p * 2 : Math.max(0, 2 - p * 2);
        if (p >= 1) this.blinkT = 2.2 + Math.random() * 3.5;
      }
      let mouthTarget = 0;
      const emoteName = this.emote?.name;
      if (emoteName === "laugh") mouthTarget = 0.65 + 0.35 * Math.abs(Math.sin(now * 13));
      else if (emoteName === "cheer" || emoteName === "jump") mouthTarget = 0.75;
      else if (emoteName === "guitar") mouthTarget = 0.18 + 0.2 * Math.abs(Math.sin(now * 3.1));
      else if (this.speaking) mouthTarget = 0.12 + 0.45 * Math.abs(Math.sin(now * 17) * Math.sin(now * 7.3));
      this.mouth += (mouthTarget - this.mouth) * Math.min(1, dt * 18);
      const b = Math.max(MORPH_FLOOR, blink);
      const m = Math.max(MORPH_FLOOR, this.mouth);
      if (this.blinkTarget && Math.abs(b - this.blink) > 1e-3) {
        this.blink = b;
        this.blinkTarget.influence = b;
      }
      if (this.mouthTarget && Math.abs(m - this.mouthTarget.influence) > 1e-3) this.mouthTarget.influence = m;
    }
  }

  setPose(position, yaw, dt = 0, smoothYaw = true) {
    this.position.copyFrom(position);
    this.holder.position.copyFrom(position);
    this.yaw = smoothYaw && dt > 0 ? lerpAngle(this.yaw, yaw, Math.min(1, dt * 12)) : yaw;
    this.holder.rotation.y = this.yaw + this.yawOffset;
    if (this.shadows && this.shadowSlot >= 0) {
      const seated = this.state === "sit" || this.state === "sitDown";
      this.shadows.set(this.shadowSlot, position.x, position.z, position.y < 0.2 && position.y > -1 ? (seated ? 0.8 : 1) : 0);
    }
  }

  headPosition(out) {
    const seated = this.state === "sit" || this.state === "sitDown";
    out.set(this.position.x, this.position.y + (seated ? this.headOffset - 0.24 : this.headOffset), this.position.z);
    return out;
  }

  dispose() {
    for (const slot of this.slots) slot.g.dispose();
    for (const s of this.inst.skeletons) s.dispose();
    for (const m of this.meshes) m.dispose(false, false);
    this.holder.dispose();
    if (this.shadows && this.shadowSlot >= 0) this.shadows.release(this.shadowSlot);
    this.material.dispose(false, false);
    this.faceMaterial?.dispose(false, false);
    this.palette.dispose();
  }
}

/** Measure the model's forward direction once, so yaw 0 faces +Z in world space. */
export function measureYawOffset(asset) {
  const tn = asset.container.transformNodes;
  const foot = tn.find((n) => /foot\.L$/.test(n.name)) || null;
  const toe = tn.find((n) => /toe\.L$/.test(n.name)) || null;
  if (!foot || !toe) return 0;
  foot.computeWorldMatrix(true);
  toe.computeWorldMatrix(true);
  const d = toe.getAbsolutePosition().subtract(foot.getAbsolutePosition());
  return -Math.atan2(d.x, d.z);
}
