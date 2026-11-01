/**
 * Per-room runtime pieces that sit on top of the baked room:
 *  - avatar lights (the room is baked; these only light avatars and props);
 *  - baked light layers (cinema screen, camp fire): extra atlases in the baked
 *    materials' emissive slot, scaled live by a colour + level;
 *  - the cinema screen controller (texture in, room glow follows its average colour);
 *  - the projector beam (additive, soft rim);
 *  - the camp fire (flame flicker, particles, flickering light: ./fire.js);
 *  - animated emissives (aurora drift) and props loaded from their own GLBs
 *    (the game room's robot dealer, game pieces on the tables).
 * createRoomRuntime(engine) returns { lights, layers, screen, update(dt, now), dispose() }.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Constants } from "@babylonjs/core/Engines/constants";
import { createFire } from "./fire.js";
import { loadRoomProps } from "./props.js";

const hex = (h) => Color3.FromHexString(h);
const vec = (a) => new Vector3(a[0], a[1], a[2]);

/** Avatar lights from the room look (same lights the living room always had). */
export function createRoomLights(scene, look, lampPositions) {
  const spec = look.lights || {};
  const lights = [];
  if (spec.hemi) {
    const h = new HemisphericLight("hemi", vec(spec.hemi.dir || [0, 1, 0]), scene);
    h.diffuse = hex(spec.hemi.diffuse);
    h.groundColor = hex(spec.hemi.ground);
    h.specular = Color3.Black();
    h.intensity = spec.hemi.intensity;
    lights.push(h);
  }
  for (const d of spec.directional || []) {
    const l = new DirectionalLight(d.name, vec(d.dir), scene);
    l.diffuse = hex(d.diffuse);
    l.specular = d.specular ? hex(d.specular) : Color3.Black();
    l.intensity = d.intensity;
    lights.push(l);
  }
  const rules = spec.lamps?.rules || [];
  for (const lp of lampPositions || []) {
    const rule = rules.find((r) => !r.match || new RegExp(r.match).test(lp.name));
    if (!rule) continue;
    const p = new PointLight(`pl_${lp.name}`, lp.pos, scene);
    p.diffuse = hex(rule.diffuse);
    p.intensity = rule.intensity;
    p.range = rule.range;
    p.specular = p.diffuse.scale(0.4);
    lights.push(p);
  }
  for (const pt of spec.points || []) {
    const p = new PointLight(pt.name, vec(pt.pos), scene);
    p.diffuse = hex(pt.diffuse);
    p.intensity = pt.intensity;
    p.range = pt.range;
    p.specular = p.diffuse.scale(pt.specular ?? 0.3);
    lights.push(p);
  }
  return lights;
}

/** Baked light layers: name -> materials carrying that layer in their emissive slot. */
function collectLayers(meshes) {
  const out = new Map();
  for (const m of meshes) {
    const layer = m.metadata?.lightLayer;
    if (!layer || !m.material) continue;
    if (!out.has(layer)) out.set(layer, new Set());
    out.get(layer).add(m.material);
  }
  return {
    names: [...out.keys()],
    set(name, color, level = 1) {
      const mats = out.get(name);
      if (!mats) return;
      for (const mat of mats) mat.emissiveColor = color.scale(level);
    },
  };
}

/** Average colour of an image / video / canvas source (small canvas read, CSP safe). */
function averageColor(source, ctxHolder) {
  try {
    if (!ctxHolder.ctx) {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 9;
      ctxHolder.ctx = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = ctxHolder.ctx;
    ctx.drawImage(source, 0, 0, 16, 9);
    const d = ctx.getImageData(0, 0, 16, 9).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const n = (d.length / 4) * 255;
    return new Color3(r / n, g / n, b / n);
  } catch {
    return null; // cross-origin frame: keep the last colour
  }
}

/**
 * Cinema screen: SCREEN_main / EMIT_screen. setSource({ texture, element }) shows a
 * texture (phase 3: a VideoTexture of the shared screen; element = its <video>), the
 * room glow (baked "screen" layer) and the avatar light follow its average colour.
 * setSource(null) returns to the dim standby image.
 */
function createScreen(engine, anchor, layers, light) {
  const scene = engine.scene;
  const mesh = scene.getMeshByName(anchor.mesh);
  if (!mesh?.material) return null;
  const mat = mesh.material;
  const standby = mat.emissiveTexture;
  const look = engine.roomDef.look.screen || {};
  const state = { live: false, element: null, color: hex(look.standbyColor || "#2b2f7a"), target: null, holder: {}, nextSample: 0, level: 0 };
  const apply = (dt) => {
    const want = state.live ? (look.liveLevel ?? 1) : (look.standbyLevel ?? 0.12);
    state.level += (want - state.level) * Math.min(1, dt * 3);
    if (state.target) state.color = Color3.Lerp(state.color, state.target, Math.min(1, dt * 4));
    layers.set("screen", state.color, state.level * (look.layerGain ?? 1));
    mat.emissiveIntensity = state.live ? (look.emissiveLive ?? 1.25) : (look.emissiveStandby ?? 0.35);
    if (light) {
      light.diffuse = state.color;
      light.intensity = state.level * (look.avatarLight ?? 1.2);
    }
  };
  return {
    mesh,
    material: mat,
    anchor,
    setSource(src) {
      if (src && src.texture) {
        mat.emissiveTexture = src.texture;
        state.live = true;
        state.element = src.element || null;
        state.target = src.color || null;
        if (src.element) state.nextSample = 0;
      } else {
        mat.emissiveTexture = standby;
        state.live = false;
        state.element = null;
        state.target = hex(look.standbyColor || "#2b2f7a");
      }
    },
    get live() {
      return state.live;
    },
    update(dt, now) {
      if (state.element && now >= state.nextSample) {
        state.nextSample = now + 200;
        const c = averageColor(state.element, state.holder);
        if (c) {
          // keep some saturation in the glow, never pitch black
          const lum = Math.max(0.08, (c.r + c.g + c.b) / 3);
          state.target = new Color3(c.r / lum, c.g / lum, c.b / lum).scale(Math.min(1, lum * 1.6));
        }
      }
      apply(dt);
    },
  };
}

/** Projector beam: additive, bright at the lens, soft rim (vertex colours carry the falloff). */
function setupBeam(engine, anchor) {
  const mesh = engine.scene.getMeshByName(anchor.beamMesh);
  if (!mesh) return null;
  const mat = new StandardMaterial("beamMat", engine.scene);
  mat.disableLighting = true;
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = hex(engine.roomDef.look.beam?.color || "#5fa8ff").scale(engine.roomDef.look.beam?.level ?? 0.55);
  mat.emissiveFresnelParameters = new FresnelParameters({ leftColor: Color3.Black(), rightColor: Color3.White(), bias: 0.0, power: 1.6 });
  mat.alpha = 0.999;
  mat.alphaMode = Constants.ALPHA_ADD;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mesh.material?.dispose?.();
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = false;
  return { mesh, mat, base: mat.emissiveColor.clone() };
}

export async function createRoomRuntime(engine) {
  const def = engine.roomDef;
  const scene = engine.scene;
  const disposers = [];
  const updaters = [];
  const layers = collectLayers(engine.room.meshes);
  const anchors = engine.roomState?.anchors || {};
  const look = def.look || {};
  const rt = { layers, screen: null, beam: null, fire: null, props: [] };

  // screen glow light for avatars (front of the cinema)
  let screenLight = null;
  if (anchors.screen) {
    const c = anchors.screen.center;
    screenLight = new PointLight("screenLight", new Vector3(c[0], c[1], c[2] + (anchors.screen.normal?.[2] ?? -1) * 1.5), scene);
    screenLight.range = 16;
    screenLight.specular = Color3.Black();
    engine.lights.push(screenLight);
    for (const m of engine.room.meshes) if (m.material?.name?.startsWith("BAKED_") || m.material?.name?.startsWith("EMIT_")) screenLight.excludedMeshes.push(m);
    rt.screen = createScreen(engine, anchors.screen, layers, screenLight);
    if (rt.screen) updaters.push((dt, now) => rt.screen.update(dt, now));
  }
  if (anchors.projector) {
    rt.beam = setupBeam(engine, anchors.projector);
    if (rt.beam) {
      updaters.push(() => {
        const on = rt.screen?.live ? 1 : look.beam?.idle ?? 0.35;
        rt.beam.mat.emissiveColor = rt.beam.base.scale(on);
      });
    }
  }
  // drifting aurora / twinkling emissives (camp)
  for (const a of look.animated || []) {
    const mats = scene.materials.filter((m) => new RegExp(a.match).test(m.name));
    for (const mat of mats) {
      const tex = mat.emissiveTexture;
      const base = mat.emissiveIntensity;
      updaters.push((dt, now) => {
        const t = now / 1000;
        if (a.scrollU && tex) tex.uOffset = (t * a.scrollU) % 1;
        if (a.pulse) mat.emissiveIntensity = base * (1 + a.pulse * Math.sin(t * (a.speed || 1) + (a.phase || 0)));
      });
    }
  }
  if (def.fx?.fire && anchors.fire) {
    rt.fire = createFire(engine, anchors.fire, def.fx.fire);
    updaters.push((dt, now) => rt.fire.update(dt, now));
    disposers.push(() => rt.fire.dispose());
  }
  if (def.props?.length) {
    rt.props = await loadRoomProps(engine, def.props, anchors);
    for (const p of rt.props) {
      if (p.update) updaters.push((dt, now) => p.update(dt, now));
      disposers.push(() => p.dispose());
    }
  }
  // the default (idle) light-layer level, e.g. the fire glow without flicker
  for (const [name, spec] of Object.entries(look.layers || {})) layers.set(name, hex(spec.color), spec.level);

  rt.update = (dt, now) => {
    for (const u of updaters) u(dt, now);
  };
  rt.dispose = () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* best effort */
      }
    }
  };
  return rt;
}
