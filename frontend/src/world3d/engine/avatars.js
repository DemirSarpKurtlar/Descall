/**
 * Avatars: one shared GLB (rig + 13 clips + morphs), instantiated per member.
 * Colours come from a 64 x 64 palette texture per avatar (see look.js), so every
 * avatar is a handful of draw calls whatever its outfit.
 *
 * AvatarController blends animation groups by weight (idle/walk/run by speed,
 * sit/emote layers with cross-fades), keeps yaw smooth, blinks and moves the
 * mouth while the person is speaking.
 */
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
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

export async function loadAvatarAsset(scene, url) {
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: ".glb" });
  // Keep the template out of the scene; instances are created per member.
  return { container, template: container.materials.find((m) => /AVATAR/i.test(m.name)) || container.materials[0] };
}

function paletteTexture(scene, name, colors) {
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, false, Texture.NEAREST_SAMPLINGMODE);
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
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

let shadowMat = null;
function blobShadow(scene, name) {
  if (!shadowMat || shadowMat.getScene() !== scene) {
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
    shadowMat = new StandardMaterial("blobMat", scene);
    shadowMat.diffuseTexture = tex;
    shadowMat.opacityTexture = tex;
    shadowMat.disableLighting = true;
    shadowMat.emissiveColor = Color3.Black();
    shadowMat.useAlphaFromDiffuseTexture = true;
    shadowMat.backFaceCulling = false;
    shadowMat.zOffset = -2;
  }
  const disc = CreateDisc(name, { radius: 0.36, tessellation: 24 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.material = shadowMat;
  disc.isPickable = false;
  return disc;
}

export class AvatarController {
  constructor(scene, asset, id, look, { yawOffset = 0 } = {}) {
    this.scene = scene;
    this.id = String(id);
    this.look = look;
    this.yawOffset = yawOffset;
    this.holder = new TransformNode(`avatar_${id}`, scene);
    this.holder.scaling.setAll(AVATAR_SCALE);
    const inst = asset.container.instantiateModelsToScene((n) => `${id}:${n}`, false, { doNotInstantiate: true });
    this.inst = inst;
    for (const r of inst.rootNodes) r.parent = this.holder;
    this.meshes = [];
    for (const r of inst.rootNodes) this.meshes.push(...r.getChildMeshes(false));
    this.palette = paletteTexture(scene, `palette_${id}`, look.colors);
    const mat = asset.template.clone(`avatarMat_${id}`);
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
    const show = new Set(["body", "face", `hair_${look.hair}`, ...(look.outfit === "sweater" ? [] : [`extra_${look.outfit}`]), ...look.accessories.map((a) => `acc_${a}`)]);
    // eyes, brows and mouth: glossy (big dark eyes with a sharp highlight)
    this.faceMaterial = mat.clone(`avatarFace_${id}`);
    if ("roughness" in this.faceMaterial) {
      // a cloned DynamicTexture would come back empty: share the palette itself
      this.faceMaterial.albedoTexture = this.palette;
      this.faceMaterial.roughness = 0.16;
      if (this.faceMaterial.sheen) this.faceMaterial.sheen.isEnabled = false;
    }
    // the cap covers the hair completely (no hair poking through the crown)
    if (look.accessories.includes("cap")) show.delete(`hair_${look.hair}`);
    for (const m of this.meshes) {
      m.material = mat;
      m.isPickable = false;
      const part = String(m.name).split(":").pop().replace(/_primitive\d+$/, "");
      const visible = show.has(part);
      m.setEnabled(visible);
      m.alwaysSelectAsActiveMesh = false;
      if (part === "face") {
        this.face = m;
        m.material = this.faceMaterial;
      }
      if (part === "acc_guitar") this.guitar = m;
      if (visible) m.metadata = { ...(m.metadata || {}), avatarId: this.id };
    }
    this.shadow = blobShadow(scene, `shadow_${id}`);
    this.groups = {};
    for (const g of inst.animationGroups) {
      const name = String(g.name).split(":").pop();
      g.stop();
      g.weight = 0;
      this.groups[name] = { g, w: 0, target: 0, playing: false };
    }
    this.morphs = this.face?.morphTargetManager || null;
    this.blinkT = 2 + Math.random() * 3;
    this.speaking = false;
    this.mouth = 0;
    this.state = "idle";
    this.emote = null;
    this.emoteUntil = 0;
    this.speed = 0;
    this.yaw = 0;
    this.seated = false;
    this.position = new Vector3(0, 0, 0);
    this.headOffset = 1.68 * AVATAR_SCALE;
    this.setTarget("idle", 1, true);
  }

  play(name, { loop = LOOPS.has(name), from = 0, speed = 1 } = {}) {
    const slot = this.groups[name];
    if (!slot) return null;
    if (!slot.playing) {
      slot.g.start(loop, speed, slot.g.from + from, slot.g.to, false);
      slot.playing = true;
    } else {
      slot.g.speedRatio = speed;
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
    }
  }

  restart(name) {
    const slot = this.groups[name];
    if (!slot) return;
    slot.g.stop();
    slot.playing = false;
    slot.g.start(LOOPS.has(name), 1, slot.g.from, slot.g.to, false);
    slot.playing = true;
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

  /** Per frame: weights, blink, mouth. dt seconds. */
  update(dt, now) {
    const T = {};
    for (const k of Object.keys(this.groups)) T[k] = 0;
    const st = this.state;
    if (st === "sitDown") T.sitDown = 1;
    else if (st === "sit") T.sit = 1;
    else if (st === "standUp") T.standUp = 1;
    else {
      const v = this.speed;
      if (v < 0.05) T.idle = 1;
      else if (v < WALK_SPEED) {
        const k = Math.min(1, v / 0.6);
        T.idle = 1 - k;
        T.walk = k;
      } else {
        const k = Math.min(1, (v - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
        T.walk = 1 - k;
        T.run = k;
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
        for (const k of Object.keys(T)) T[k] = 0;
        T[this.emote.clip] = 1;
      }
    }
    if (this.guitar) this.guitar.setEnabled(this.emote?.name === "guitar");
    const rate = Math.min(1, dt * 7);
    let sum = 0;
    for (const [k, slot] of Object.entries(this.groups)) {
      const tgt = T[k] || 0;
      slot.w += (tgt - slot.w) * rate;
      if (tgt === 0 && slot.w < 0.01) slot.w = 0;
      sum += slot.w;
    }
    for (const [k, slot] of Object.entries(this.groups)) {
      const w = sum > 0 ? slot.w / sum : 0;
      if (w > 0 && !slot.playing) this.play(k);
      if (w === 0 && slot.playing && slot.w === 0) {
        slot.g.stop();
        slot.playing = false;
      }
      slot.g.weight = w;
    }
    // match clip cadence to ground speed (no foot sliding)
    const v = this.speed;
    if (this.groups.walk?.playing) this.groups.walk.g.speedRatio = Math.max(0.6, Math.min(2.2, v < 0.3 ? 1 : v / WALK_NOMINAL));
    if (this.groups.run?.playing) this.groups.run.g.speedRatio = Math.max(0.8, Math.min(1.6, v < RUN_SPEED * 0.5 ? 1.1 : v / RUN_NOMINAL));
    // keep walk and run in phase while both are weighted
    const wk = this.groups.walk;
    const rn = this.groups.run;
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
    if (this.morphs) {
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
      for (let i = 0; i < this.morphs.numTargets; i += 1) {
        const t = this.morphs.getTarget(i);
        if (/blink/i.test(t.name)) t.influence = blink;
        else if (/mouth/i.test(t.name)) t.influence = this.mouth;
      }
    }
  }

  setPose(position, yaw, dt = 0, smoothYaw = true) {
    this.position.copyFrom(position);
    this.holder.position.copyFrom(position);
    this.yaw = smoothYaw && dt > 0 ? lerpAngle(this.yaw, yaw, Math.min(1, dt * 12)) : yaw;
    this.holder.rotation.y = this.yaw + this.yawOffset;
    // blob shadow on the floor under the avatar (tiered rooms: the tier it stands on)
    this.shadow.position.set(position.x, position.y + 0.012, position.z);
    const seated = this.state === "sit" || this.state === "sitDown";
    this.shadow.scaling.setAll(seated ? 0.8 : 1);
    this.shadow.setEnabled(position.y > -10); // parked (not yet placed) avatars sit far below
  }

  headPosition(out) {
    const seated = this.state === "sit" || this.state === "sitDown";
    out.set(this.position.x, this.position.y + (seated ? this.headOffset - 0.24 : this.headOffset), this.position.z);
    return out;
  }

  dispose() {
    for (const slot of Object.values(this.groups)) slot.g.dispose();
    for (const s of this.inst.skeletons) s.dispose();
    for (const m of this.meshes) m.dispose(false, false);
    this.holder.dispose();
    this.shadow.dispose();
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
