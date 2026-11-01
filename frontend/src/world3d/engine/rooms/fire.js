/**
 * Camp fire at runtime, driven by data (rooms/camp.js fx.fire):
 *  - flame cards (EMIT_flame*, additive) on their own pivots: height, sway and
 *    brightness flicker;
 *  - a flickering point light for avatars and props, and the baked "fire" light
 *    layer on the ground / benches / tents following the same flicker;
 *  - Babylon particle systems built from plain specs (sparks, fireflies), with a soft
 *    round sprite drawn at runtime (no extra asset);
 *  - ember glow pulse.
 * createFire(engine, anchor, spec) -> { update(dt, now), dispose(), flicker }
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Particles/particleSystemComponent";

const v3 = (a) => new Vector3(a[0], a[1], a[2]);
const c4 = (a) => new Color4(a[0], a[1], a[2], a[3] ?? 1);

/** Smooth pseudo-random flicker in about [-1, 1] (sum of detuned sines). */
export function flicker(t, seed = 0) {
  return (
    0.5 * Math.sin(t * 7.3 + seed) +
    0.3 * Math.sin(t * 13.7 + seed * 2.1) +
    0.2 * Math.sin(t * 23.1 + seed * 3.7) * Math.sin(t * 1.9 + seed)
  );
}

function spriteTexture(scene, name, inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const tex = new DynamicTexture(name, { width: 64, height: 64 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.55)"));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Particle system from a plain spec (see camp.js fx.fire.particles). */
export function particlesFromSpec(scene, spec, origin, texture) {
  const ps = new ParticleSystem(spec.name, spec.capacity, scene);
  ps.particleTexture = texture;
  ps.emitter = origin.clone();
  ps.minEmitBox = v3(spec.emitBox[0]);
  ps.maxEmitBox = v3(spec.emitBox[1]);
  ps.direction1 = v3(spec.direction1);
  ps.direction2 = v3(spec.direction2);
  ps.minLifeTime = spec.minLife;
  ps.maxLifeTime = spec.maxLife;
  ps.minSize = spec.minSize;
  ps.maxSize = spec.maxSize;
  ps.minEmitPower = spec.minPower;
  ps.maxEmitPower = spec.maxPower;
  ps.emitRate = spec.emitRate;
  ps.gravity = v3(spec.gravity || [0, 0, 0]);
  ps.color1 = c4(spec.color1);
  ps.color2 = c4(spec.color2);
  ps.colorDead = c4(spec.colorDead);
  ps.blendMode = spec.blend === "add" ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
  ps.updateSpeed = spec.updateSpeed ?? 1 / 60;
  if (spec.angularSpeed) {
    ps.minAngularSpeed = -spec.angularSpeed;
    ps.maxAngularSpeed = spec.angularSpeed;
  }
  ps.preWarmCycles = spec.prewarm ?? 60;
  ps.preWarmStepOffset = 2;
  ps.isLocal = false;
  ps.start();
  return ps;
}

export function createFire(engine, anchor, spec) {
  const scene = engine.scene;
  const base = v3(anchor.pos);
  const flames = [];
  (anchor.flameMeshes || []).forEach((name, i) => {
    const m = scene.getMeshByName(name);
    if (!m?.material) return;
    const mat = m.material;
    mat.transparencyMode = 2; // ALPHABLEND
    mat.alpha = 0.999;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    m.unfreezeWorldMatrix?.();
    const pivot = new TransformNode(`flamePivot${i}`, scene);
    pivot.position = base.clone();
    m.setParent(pivot);
    flames.push({ mesh: m, mat, pivot, seed: i * 1.7 + 0.4, level: mat.emissiveIntensity || 1 });
  });
  const embers = anchor.emberMesh ? scene.getMeshByName(anchor.emberMesh) : null;
  const emberLevel = embers?.material?.emissiveIntensity ?? 1;
  const L = spec.light;
  const light = new PointLight("fireLight", v3(anchor.lightPos), scene);
  light.diffuse = Color3.FromHexString(L.color);
  light.specular = light.diffuse.scale(0.3);
  light.range = L.range;
  light.intensity = L.intensity;
  for (const m of engine.room.meshes) if (m.material?.name?.startsWith("BAKED_") || m.material?.name?.startsWith("EMIT_")) light.excludedMeshes.push(m);
  engine.lights.push(light);
  const layerColor = Color3.FromHexString(spec.layer.color);
  const spark = spriteTexture(scene, "fireSprite", "rgba(255,220,150,1)");
  const systems = (spec.particles || []).map((p) => particlesFromSpec(scene, p, p.origin ? v3(p.origin) : base, spark));
  const F = spec.flames;
  const state = { k: 1 };
  return {
    flicker: state,
    update(dt, now) {
      const t = now / 1000;
      const f = flicker(t);
      state.k = 1 + L.flicker * f;
      light.intensity = L.intensity * state.k;
      engine.roomRuntime?.layers?.set("fire", layerColor, spec.layer.level * (1 + spec.layer.flicker * f));
      for (const fl of flames) {
        const g = flicker(t * F.speed / 7, fl.seed);
        fl.pivot.scaling.set(1 + 0.05 * g, 1 + F.scaleJitter * g, 1 + 0.05 * g);
        fl.pivot.rotation.set(F.sway * flicker(t * 0.8, fl.seed + 3), 0, F.sway * flicker(t * 0.9, fl.seed + 5));
        fl.mat.emissiveIntensity = fl.level * F.intensity * (1 + 0.25 * g);
      }
      if (embers?.material) embers.material.emissiveIntensity = emberLevel * (1 + 0.3 * flicker(t * 0.5, 9));
    },
    dispose() {
      for (const s of systems) s.dispose();
      spark.dispose();
      light.dispose();
    },
  };
}
