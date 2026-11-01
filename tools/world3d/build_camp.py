"""Descall 3D world: the camp ("Kamp"), built from code.

Target: docs/design/3d-world/scene-4.jpg. Night camp by a lake: campfire with crossed
logs in a stone ring, four log benches round it, two canvas tents strung with fairy
lights, pines, a lake with the moon's reflection, hills, the moon, aurora, stars.

Bake (roomkit.py):
  * atlas groups (ground near the fire, benches + logs + stones, tents) with a "fire"
    light layer baked on its own: the client adds it on top, flickering;
  * vertex colour groups (far terrain, pines, grass tufts, foreground bush/rock): their
    fire light is baked in, static;
  * unbaked emissives: sky dome, moon, aurora ribbons (drift at runtime), lake, fairy
    lights (twinkle), tent glow, lantern, embers, and the flame cards (the runtime
    animates them with a particle spec: rooms/camp.js fx.fire).

  blender -b -P tools/world3d/build_camp.py -- --preview out.png [--samples 16]
  blender -b -P tools/world3d/build_camp.py -- --bake --samples 32 --out frontend/public/world3d/camp.glb

Blender axes: Z up, fire at the origin, the hero camera looks toward +Y (the lake).
Walkable area x -8..8, y -8..6.8 (invisible walls); the lake starts at y = 7.4.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blib  # noqa: E402
import roomkit  # noqa: E402
from blib import cylinder, plane, principled, rbox, sphere  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith("--"):
            return ARGS[i + 1]
        return True
    return default


ACG = os.path.join(blib.CACHE, "ambientcg")
GEN = os.path.join(blib.CACHE, "gen", "rooms")
REPO = os.path.normpath(os.path.join(blib.HERE, "..", ".."))
NEAR = 8.0  # half size of the near ground patch (atlas baked)
LAKE = {"cx": 1.0, "cy": 15.0, "rx": 16.0, "ry": 7.6}
BENCHES = [("FL", (-1.55, -0.85), 18.0), ("FR", (1.55, -0.85), -18.0), ("BL", (-1.0, 1.25), -24.0), ("BR", (1.0, 1.25), 24.0)]  # centre, log axis (deg from +x)
TENTS = [("L", (-3.7, 3.1), 52.0), ("R", (3.75, 3.0), -56.0)]

kit = roomkit.Kit("camp")
M = {}
L = {}
rnd = random.Random(11)


def ray_camera_only(obj):
    for a in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(obj, a, False)


def emissive_tex(name, path, strength=1.0, alpha=False):
    m = blib.emissive(name, "#ffffff", strength, image=bpy.data.images.load(path))
    return m


# ------------------------------------------------------------------ materials

def make_materials():
    M["grass"] = roomkit.textured_gray("ground", os.path.join(ACG, "Grass004"), "Grass004", tint="#5f8a3e", rough=1.0, scale=0.7, normal_strength=0.6, detail=0.7)
    # bare earth round the fire: mix the grass with an earth colour by distance from the origin
    nt = M["grass"].node_tree
    bsdf = nt.nodes["Principled BSDF"]
    src = bsdf.inputs["Base Color"].links[0].from_socket
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    length = nt.nodes.new("ShaderNodeVectorMath")
    length.operation = "LENGTH"
    nt.links.new(geo.outputs["Position"], length.inputs[0])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.6
    ramp.inputs["From Max"].default_value = 1.5
    nt.links.new(length.outputs["Value"], ramp.inputs["Value"])
    noi = nt.nodes.new("ShaderNodeTexNoise")
    noi.inputs["Scale"].default_value = 1.6
    mixf = nt.nodes.new("ShaderNodeMath")
    mixf.operation = "MULTIPLY_ADD"
    mixf.inputs[1].default_value = 0.35
    nt.links.new(noi.outputs["Fac"], mixf.inputs[0])
    nt.links.new(ramp.outputs["Result"], mixf.inputs[2])
    clamp = nt.nodes.new("ShaderNodeClamp")
    nt.links.new(mixf.outputs[0], clamp.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(clamp.outputs["Result"], mix.inputs["Factor"])
    mix.inputs[6].default_value = blib.srgb("#6b5338")
    nt.links.new(src, mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    M["bark"] = roomkit.textured_gray("bark", os.path.join(ACG, "Bark014"), "Bark014", tint="#8a5a3a", rough=0.9, scale=1.6, normal_strength=0.8, detail=0.8)
    M["log_end"] = principled("log_end", "#ffffff", 0.8)
    t = M["log_end"].node_tree.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(GEN, "log_end.png"))
    M["log_end"].node_tree.links.new(t.outputs["Color"], M["log_end"].node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    M["wood_seat"] = roomkit.textured_gray("wood_seat", os.path.join(ACG, "Bark014"), "Bark014", tint="#a8683e", rough=0.8, scale=2.0, normal_strength=0.4, detail=0.4)
    M["canvas"] = roomkit.textured_gray("canvas", os.path.join(ACG, "Fabric030"), "Fabric030", tint="#e8cfae", rough=0.95, scale=1.5, normal_strength=0.3, detail=0.25)
    M["canvas_in"] = principled("canvas_in", "#f0c890", 0.95)
    M["tent_floor"] = principled("tent_floor", "#a8723e", 0.9)
    M["blanket"] = principled("blanket", "#c86a4a", 0.95)
    M["rope"] = principled("rope", "#cdb89a", 0.9)
    M["pole"] = principled("pole", "#6a4a32", 0.7)
    M["stone"] = principled("stone", "#6e6a78", 0.85)
    M["ash"] = principled("ash", "#2a2224", 1.0)
    M["metal"] = principled("metal", "#3a3640", 0.4, metal=0.7)
    M["needles"] = principled("needles", "#1f4a3a", 0.9)
    M["needles2"] = principled("needles2", "#2a5a40", 0.9)
    M["trunk"] = principled("trunk", "#4a3226", 0.9)
    M["terrain"] = principled("terrain", "#3f6a36", 1.0)
    M["grass_blade"] = principled("grass_blade", "#6a9a3a", 0.9)
    M["bush"] = principled("bush", "#2f5a2e", 0.9)
    M["rock"] = principled("rock", "#5d5a68", 0.9)
    M["marsh"] = principled("marsh", "#f4eee4", 0.7)
    # emissive
    M["sky"] = emissive_tex("EMIT_sky", os.path.join(GEN, "camp_sky.png"), 1.0)
    M["moon"] = emissive_tex("EMIT_moon", os.path.join(GEN, "camp_moon.png"), 1.0)
    M["halo"] = blib.emissive("EMIT_moon_halo", "#9aa6ff", 1.0)
    M["aurora"] = emissive_tex("EMIT_aurora", os.path.join(GEN, "camp_aurora.png"), 1.0)
    M["lake"] = emissive_tex("EMIT_lake", os.path.join(GEN, "camp_lake.png"), 1.0)
    M["flame"] = emissive_tex("EMIT_flame", os.path.join(GEN, "camp_flame.png"), 1.0)
    M["ember"] = blib.emissive("EMIT_embers", "#ff6a1a", 6.0)
    M["fairy"] = blib.emissive("EMIT_fairy", "#ffd27a", 16.0)
    M["tent_glow"] = blib.emissive("EMIT_tent_glow", "#ffb860", 2.4)
    M["lantern"] = blib.emissive("EMIT_lantern", "#ffcf7a", 10.0)


# ------------------------------------------------------------------ terrain

def terrain_height(x, y):
    """Far terrain: flat camp, lake basin, rising banks and hills (metres)."""
    dl = ((x - LAKE["cx"]) / LAKE["rx"]) ** 2 + ((y - LAKE["cy"]) / LAKE["ry"]) ** 2
    h = 0.0
    if dl < 1.0:
        h = -0.45 * (1 - dl)
    r = math.hypot(x, y)
    far = max(0.0, y - 23.0)
    h += min(4.5, 0.005 * far ** 2) * (1 + 0.4 * noise.noise(Vector((x * 0.04, y * 0.05, 0.3))))
    side = max(0.0, abs(x) - 20.0)
    h += min(5.0, 0.02 * side ** 1.6)
    if r > NEAR * 1.1 and dl > 1.15:
        h += 0.35 * noise.noise(Vector((x * 0.12, y * 0.12, 1.7)))
    return h


def build_terrain():
    near = plane("ground_near", 2 * NEAR, 2 * NEAR, (0, 0, 0), mat=M["grass"])
    roomkit.uv_metres(near)
    kit.grp("ground", near)
    # far terrain: grid with a hole for the near patch (vertex colour bake)
    bm = bmesh.new()
    size, step = 120.0, 1.5
    n = int(size / step)
    verts = {}
    for i in range(n + 1):
        for j in range(n + 1):
            x = -size / 2 + i * step
            y = -size / 2 + 20 + j * step
            verts[(i, j)] = bm.verts.new((x, y, terrain_height(x, y)))
    for i in range(n):
        for j in range(n):
            xs = -size / 2 + (i + 0.5) * step
            ys = -size / 2 + 20 + (j + 0.5) * step
            if abs(xs) < NEAR - 0.3 and abs(ys) < NEAR - 0.3:
                continue
            bm.faces.new((verts[(i, j)], verts[(i + 1, j)], verts[(i + 1, j + 1)], verts[(i, j + 1)]))
    # flatten the seam to the near patch
    for v in bm.verts:
        if abs(v.co.x) <= NEAR + 0.01 and abs(v.co.y) <= NEAR + 0.01:
            v.co.z = -0.005
    far = blib.mesh_from_bmesh("terrain_far", bm)
    blib.set_mat(far, M["terrain"])
    blib.shade_smooth(far)
    kit.vc("terrain", far)
    # lake surface (unbaked emissive), elliptical
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    ring = []
    segs = 64
    for k in range(segs):
        a = 2 * math.pi * k / segs
        ring.append(bm.verts.new((LAKE["cx"] + LAKE["rx"] * 0.98 * math.cos(a), LAKE["cy"] + LAKE["ry"] * 0.98 * math.sin(a), -0.12)))
    f = bm.faces.new(ring)
    uvl = bm.loops.layers.uv.active
    for loop in f.loops:
        co = loop.vert.co
        loop[uvl].uv = ((co.x - (LAKE["cx"] - LAKE["rx"])) / (2 * LAKE["rx"]), 1 - (co.y - (LAKE["cy"] - LAKE["ry"])) / (2 * LAKE["ry"]))
    lake = blib.mesh_from_bmesh("EMIT_lake", bm)
    bmesh_poke(lake)
    blib.set_mat(lake, M["lake"])
    ray_camera_only(lake)
    kit.emit(lake)


def bmesh_poke(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.poke(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()


# ------------------------------------------------------------------ sky

def build_sky():
    # dome (inside), u around, v from below the horizon to the zenith
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    R = 96.0
    segs, rings = 64, 20
    rows = []
    for j in range(rings + 1):
        el = math.radians(-12 + (90 + 12) * j / rings)
        row = []
        for i in range(segs + 1):
            az = 2 * math.pi * i / segs
            row.append(bm.verts.new((R * math.cos(el) * math.sin(az), R * math.cos(el) * math.cos(az), R * math.sin(el) - 4)))
        rows.append(row)
    for j in range(rings):
        for i in range(segs):
            f = bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
            for loop, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                el = -12 + 102 * jj / rings
                v = 0.5 + 0.5 * (el / 90.0) if el >= 0 else 0.5 + el / 12 * 0.08
                loop[uvl].uv = (ii / segs * 2.0, v)
    dome = blib.mesh_from_bmesh("EMIT_sky", bm)
    blib.set_mat(dome, M["sky"])
    ray_camera_only(dome)
    kit.emit(dome)
    # moon: textured disc facing the camp + a soft halo, high above the lake
    mp = Vector((0.8, 86.0, 11.5))
    d = (Vector((0, -5, 1.5)) - mp).normalized()
    moon = plane("EMIT_moon", 8.6, 8.6, tuple(mp), mat=M["moon"])
    moon.rotation_mode = "QUATERNION"
    moon.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    ray_camera_only(moon)
    kit.emit(moon)
    kit.anchor("moon", {"pos": roomkit.bab(tuple(mp))})
    # aurora ribbons: curved vertical curtains above the far hills
    for k, (x0, x1, y, zb, zh, bend) in enumerate(((-40, -4, 76, 4.5, 15, 6), (10, 44, 74, 5.5, 16, -8), (-16, 8, 84, 8.0, 12, 4))):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        n = 24
        top, bot = [], []
        for i in range(n + 1):
            u = i / n
            x = x0 + (x1 - x0) * u
            yy = y + bend * math.sin(u * math.pi * 1.5)
            wave = 2.5 * math.sin(u * 7 + k)
            bot.append(bm.verts.new((x, yy + wave, zb)))
            top.append(bm.verts.new((x, yy + wave * 1.3, zb + zh)))
        for i in range(n):
            f = bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
            for loop, (uu, vv) in zip(f.loops, ((i / n, 0), ((i + 1) / n, 0), ((i + 1) / n, 1), (i / n, 1))):
                loop[uvl].uv = (uu, vv)
        rib = blib.mesh_from_bmesh(f"EMIT_aurora_{k}", bm)
        blib.set_mat(rib, M["aurora"])
        ray_camera_only(rib)
        kit.emit(rib)


# ------------------------------------------------------------------ trees, grass, rocks

def pine(name, x, y, h, seed):
    r = random.Random(seed)
    z0 = terrain_height(x, y) if abs(x) > NEAR or abs(y) > NEAR else 0.0
    parts = [cylinder(name + "_trunk", 0.12 * h / 8, h * 0.35, (x, y, z0 + h * 0.17), M["trunk"], verts=8, radius_top=0.08 * h / 8)]
    tiers = 5
    for k in range(tiers):
        t = k / tiers
        zb = z0 + h * (0.18 + 0.72 * t)
        rad = h * 0.26 * (1 - t * 0.78)
        ht = h * 0.28 * (1 - t * 0.35)
        bm = bmesh.new()
        segs = 14
        rim = []
        for i in range(segs):
            a = 2 * math.pi * i / segs + r.uniform(-0.1, 0.1)
            rr = rad * (1.0 if i % 2 == 0 else 0.78) * r.uniform(0.9, 1.08)
            rim.append(bm.verts.new((x + rr * math.cos(a), y + rr * math.sin(a), zb - (0.06 * h if i % 2 == 0 else 0))))
        apex = bm.verts.new((x, y, zb + ht))
        for i in range(segs):
            bm.faces.new((rim[i], rim[(i + 1) % segs], apex))
        bm.faces.new(list(reversed(rim)))
        cone = blib.mesh_from_bmesh(f"{name}_tier{k}", bm)
        blib.set_mat(cone, M["needles"] if (k + seed) % 2 else M["needles2"])
        parts.append(cone)
    for p in parts:
        kit.vc("trees", p)


def build_trees():
    spots = []
    # side groves (left and right of the lake) and the far shore line
    for k in range(7):
        spots.append((-rnd.uniform(10, 17), rnd.uniform(2, 18), rnd.uniform(8, 11)))
        spots.append((rnd.uniform(10, 17), rnd.uniform(2, 18), rnd.uniform(8, 11)))
    for k in range(22):
        x = -40 + k * 3.8 + rnd.uniform(-1, 1)
        if abs(x) < 13 and k % 2:
            continue  # open middle: the moon and the hills show between the pines
        spots.append((x, rnd.uniform(36, 44), rnd.uniform(5, 9)))
    for k in range(10):
        x = rnd.uniform(-34, 34)
        if abs(x) > 10:
            spots.append((x, rnd.uniform(46, 56), rnd.uniform(6, 10)))
    for k in range(8):
        spots.append((rnd.choice((-1, 1)) * rnd.uniform(8, 18), rnd.uniform(-14, -4), rnd.uniform(7, 10)))
    # the two big pines framing the draft (left behind the tent, right edge)
    spots += [(-8.6, 6.4, 12.5), (10.2, 7.2, 11.5), (-11.5, 1.5, 10.0)]
    for i, (x, y, h) in enumerate(spots):
        if ((x - LAKE["cx"]) / LAKE["rx"]) ** 2 + ((y - LAKE["cy"]) / LAKE["ry"]) ** 2 < 1.15:
            continue
        pine(f"pine{i}", x, y, h, i)


def grass_tufts():
    bm = bmesh.new()
    count = 0
    for _ in range(2600):
        a = rnd.uniform(0, 2 * math.pi)
        r = 1.0 + rnd.random() ** 0.7 * 8.5
        x, y = r * math.sin(a), r * math.cos(a) - 0.5
        if abs(x) > NEAR + 3 or y > 7.0:
            continue
        if any((x - bx) ** 2 + (y - by) ** 2 < 0.55 for _, (bx, by), _a in BENCHES):
            continue
        z = 0.0
        for b in range(rnd.randrange(4, 8)):
            ang = rnd.uniform(0, 2 * math.pi)
            lean = rnd.uniform(0.15, 0.55)
            h = rnd.uniform(0.09, 0.22)
            w = 0.014
            base = Vector((x + rnd.uniform(-0.04, 0.04), y + rnd.uniform(-0.04, 0.04), z))
            side = Vector((math.cos(ang), math.sin(ang), 0)) * w
            tip = base + Vector((math.sin(ang + 1.57) * lean * h, math.cos(ang + 1.57) * lean * h, h))
            v1 = bm.verts.new(base - side)
            v2 = bm.verts.new(base + side)
            v3 = bm.verts.new(tip)
            bm.faces.new((v1, v2, v3))
            count += 1
    g = blib.mesh_from_bmesh("grass", bm)
    blib.set_mat(g, M["grass_blade"])
    kit.vc("grass", g)
    print("grass blades", count)


def stones_and_bits():
    for k in range(26):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(2.2, 7.5)
        x, y = r * math.sin(a), r * math.cos(a)
        s = rnd.uniform(0.05, 0.16)
        st = sphere(f"pebble{k}", s, (x, y, s * 0.25), M["stone"], scale=(1.2, 1.0, 0.55), segments=10, rings=6, rot=(0, 0, rnd.uniform(0, 90)))
        kit.vc("stones", st)
    # foreground: bush leaves bottom left, a rock bottom right (near the camera, like the draft)
    for k in range(9):
        lf = sphere(f"bush{k}", rnd.uniform(0.2, 0.35), (-2.1 + rnd.uniform(-0.4, 0.4), -3.7 + rnd.uniform(-0.3, 0.3), rnd.uniform(0.05, 0.35)), M["bush"], scale=(1.6, 0.4, 0.9), segments=12, rings=6, rot=(rnd.uniform(-30, 30), 0, rnd.uniform(0, 180)))
        kit.vc("fore", lf)
    kit.vc("fore", sphere("rock_fore", 0.55, (2.6, -3.5, 0.0), M["rock"], scale=(1.3, 1.0, 0.6), segments=16, rings=8))
    # a stump on the left with a lantern-ish firefly jar, a short log near the left tent, a pot on the right
    kit.grp("props", cylinder("stump", 0.22, 0.38, (-4.6, 0.6, 0.19), M["bark"], verts=20))
    kit.grp("props", cylinder("stump_top", 0.2, 0.01, (-4.6, 0.6, 0.385), M["log_end"], verts=20))
    kit.grp("props", cylinder("log_short", 0.16, 0.7, (-3.6, 1.55, 0.16), M["bark"], verts=16, rot=(0, 90, 30)))
    kit.grp("props", cylinder("pot", 0.14, 0.14, (5.2, 1.0, 0.07), M["metal"], verts=20))
    kit.grp("props", cylinder("pot_lid", 0.15, 0.015, (5.2, 1.0, 0.145), M["metal"], verts=20))
    lan_x, lan_y = 5.6, 1.55
    kit.grp("props", rbox("lantern_base", (0.14, 0.14, 0.03), (lan_x, lan_y, 0.015), M["metal"], bevel=0.005))
    kit.grp("props", rbox("lantern_top", (0.14, 0.14, 0.03), (lan_x, lan_y, 0.26), M["metal"], bevel=0.005))
    glass = cylinder("EMIT_lantern", 0.05, 0.2, (lan_x, lan_y, 0.135), M["lantern"], verts=16)
    kit.emit(glass)
    L["lantern"] = (lan_x, lan_y, 0.16)
    kit.collider("stump", (0.5, 0.5), (-4.6, 0.6))


# ------------------------------------------------------------------ fire

def build_fire():
    for k in range(12):
        a = 2 * math.pi * k / 12 + rnd.uniform(-0.1, 0.1)
        s = rnd.uniform(0.11, 0.15)
        kit.vc("stones", sphere(f"ring_stone{k}", s, (0.62 * math.sin(a), 0.62 * math.cos(a), s * 0.35), M["stone"], scale=(1.3, 1.0, 0.7), segments=12, rings=6, rot=(0, 0, math.degrees(a))))
    kit.grp("props", cylinder("ash", 0.55, 0.012, (0, 0, 0.006), M["ash"], verts=32))
    # crossed logs (draft: a star of logs, ends outward), with burning cores
    for k in range(5):
        a = 2 * math.pi * k / 5 + 0.3
        d = Vector((math.sin(a), math.cos(a), 0))
        c = d * 0.32 + Vector((0, 0, 0.13))
        log = cylinder(f"firelog{k}", 0.085, 0.82, tuple(c), M["bark"], verts=16)
        log.rotation_mode = "QUATERNION"
        log.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((d * 0.97 + Vector((0, 0, -0.25))).normalized())
        kit.grp("props", log)
        endp = c + d * 0.41 + Vector((0, 0, -0.1))
        cap = cylinder(f"firelog_end{k}", 0.086, 0.01, tuple(endp), M["log_end"], verts=16)
        cap.rotation_mode = "QUATERNION"
        cap.rotation_quaternion = log.rotation_quaternion
        kit.grp("props", cap)
    bm = bmesh.new()
    for k in range(9):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0.02, 0.22)
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rnd.uniform(0.04, 0.08), matrix=__import__("mathutils").Matrix.Translation((r * math.sin(a), r * math.cos(a), 0.06)))
    emb = blib.mesh_from_bmesh("EMIT_embers", bm)
    blib.set_mat(emb, M["ember"])
    kit.emit(emb)
    # flame cards (three crossed quads); animated at runtime, camera-only in the bake
    for k in range(3):
        f = plane(f"EMIT_flame{k}", 0.62, 1.0, (0, 0, 0.62), rot=(90, 0, k * 60), mat=M["flame"])
        ray_camera_only(f)
        kit.emit(f)
    kit.collider("fire", (1.3, 1.3), (0, 0))
    kit.collider("fire_b", (1.3, 1.3), (0, 0), rot_z=45)
    kit.anchor("fire", {"pos": roomkit.bab((0, 0, 0)), "radius": 0.7, "flameMeshes": ["EMIT_flame0", "EMIT_flame1", "EMIT_flame2"],
                        "emberMesh": "EMIT_embers", "lightPos": roomkit.bab((0, 0, 0.55)), "emitter": roomkit.bab((0, 0, 0.35))})


# ------------------------------------------------------------------ benches

def bench(name, cx, cy, axis_deg):
    """Log bench: a log seat with a flat top on four stubby legs; sitters face the fire side."""
    ax = math.radians(axis_deg)
    tx, ty = math.cos(ax), math.sin(ax)  # log axis
    nx, ny = -ty, tx  # normal; flip it towards the fire
    if nx * -cx + ny * -cy < 0:
        nx, ny = -nx, -ny
    L_ = 1.45
    parts = []
    q = Vector((0, 0, 1)).rotation_difference(Vector((tx, ty, 0)))
    seat = cylinder(name + "_log", 0.19, L_, (cx, cy, 0.3), M["bark"], verts=20)
    seat.rotation_mode = "QUATERNION"
    seat.rotation_quaternion = q
    parts.append(seat)
    parts.append(rbox(name + "_top", (L_ - 0.04, 0.26, 0.02), (cx, cy, 0.455), M["wood_seat"], bevel=0.008, rot=(0, 0, axis_deg)))
    for sd in (-1, 1):
        ex, ey = cx + tx * sd * (L_ / 2 - 0.004), cy + ty * sd * (L_ / 2 - 0.004)
        cap = cylinder(f"{name}_end{sd}", 0.19, 0.01, (ex, ey, 0.3), M["log_end"], verts=20)
        cap.rotation_mode = "QUATERNION"
        cap.rotation_quaternion = q
        parts.append(cap)
        for f in (-1, 1):
            lx = cx + tx * sd * (L_ / 2 - 0.25) + nx * f * 0.1
            ly = cy + ty * sd * (L_ / 2 - 0.25) + ny * f * 0.1
            leg = cylinder(f"{name}_leg{sd}{f}", 0.055, 0.22, (lx, ly, 0.11), M["bark"], verts=10)
            leg.rotation_euler = (math.radians(-f * 10 * ny), math.radians(f * 10 * nx), 0)
            parts.append(leg)
    for p in parts:
        kit.grp("props", p)
    kit.collider(name, (L_ + 0.1, 0.5), (cx, cy), rot_z=axis_deg)
    names = []
    for k, sd in enumerate((-1, 1)):
        sx, sy = cx + tx * sd * 0.34, cy + ty * sd * 0.34
        out = sd if (tx * sd * sx + ty * sd * sy) >= 0 else -sd  # along the log, away from the fire
        appr = (sx + nx * 0.62 + tx * out * 0.35, sy + ny * 0.62 + ty * out * 0.35)  # clear of the bench box, a step outwards
        names.append(kit.seat(f"SEAT_camp_{name}_{k}", (sx + nx * 0.12, sy + ny * 0.12), (nx, ny), "log", height=0.46, approach=appr))
    return names


def build_benches():
    seats = {}
    for name, (x, y), axis in BENCHES:
        seats[name] = bench(name, x, y, axis)
    kit.anchor("benches", seats)


# ------------------------------------------------------------------ tents

def tent(name, cx, cy, rot):
    """A-frame canvas tent, door towards local -Y, flaps tied open, warm glow inside."""
    W_, D_, H_ = 2.3, 2.5, 1.75
    r = math.radians(rot)

    def P(lx, ly, lz):
        return Vector((cx + lx * math.cos(r) - ly * math.sin(r), cy + lx * math.sin(r) + ly * math.cos(r), lz))

    g = []
    bm = bmesh.new()
    # two roof panels (ground to ridge), a little sag
    nseg = 8
    for side in (-1, 1):
        rows = []
        for j in range(nseg + 1):
            t = j / nseg
            row = []
            for i in range(nseg + 1):
                u = i / nseg
                x = side * (W_ / 2) * (1 - u)
                z = H_ * u - 0.06 * math.sin(math.pi * u) * math.sin(math.pi * t)
                y = -D_ / 2 + D_ * t
                row.append(bm.verts.new(P(x, y, z)))
            rows.append(row)
        for j in range(nseg):
            for i in range(nseg):
                q = (rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])
                bm.faces.new(q if side > 0 else tuple(reversed(q)))
    # back wall triangle
    tri = [bm.verts.new(P(-W_ / 2, D_ / 2, 0)), bm.verts.new(P(W_ / 2, D_ / 2, 0)), bm.verts.new(P(0, D_ / 2, H_))]
    bm.faces.new(tri)
    shell = blib.mesh_from_bmesh(name + "_shell", bm)
    sol = shell.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.02
    blib.set_mat(shell, M["canvas"])
    shell.data.materials.append(M["canvas_in"])
    sol.material_offset = 1
    roomkit.uv_metres(shell)
    g.append(shell)
    # door flaps tied back on both sides of the opening
    for s in (-1, 1):
        bm = bmesh.new()
        a1 = bm.verts.new(P(s * W_ / 2 * 0.98, -D_ / 2 - 0.02, 0.02))
        a2 = bm.verts.new(P(s * W_ * 0.2, -D_ / 2 - 0.08, 0.05))
        a3 = bm.verts.new(P(s * 0.12, -D_ / 2 - 0.03, H_ * 0.92))
        bm.faces.new((a1, a2, a3) if s > 0 else (a3, a2, a1))
        flap = blib.mesh_from_bmesh(f"{name}_flap{s}", bm)
        flap.modifiers.new("solid", "SOLIDIFY").thickness = 0.02
        blib.set_mat(flap, M["canvas"])
        roomkit.uv_metres(flap)
        g.append(flap)
    # floor, a blanket and a pillow inside, the warm interior glow (unbaked card at the back)
    fl = plane(name + "_floor", W_ - 0.2, D_ - 0.1, tuple(P(0, 0, 0.012)), rot=(0, 0, rot), mat=M["tent_floor"])
    g.append(fl)
    g.append(rbox(name + "_blanket", (1.1, 1.3, 0.06), tuple(P(-0.25, 0.4, 0.04)), M["blanket"], bevel=0.03, rot=(0, 0, rot + 8)))
    glow = plane(f"EMIT_tent_glow_{name}", W_ * 0.7, H_ * 0.6, tuple(P(0, D_ / 2 - 0.05, H_ * 0.32)), rot=(90, 0, rot), mat=M["tent_glow"])
    if (glow.matrix_world.to_3x3() @ glow.data.polygons[0].normal).dot(P(0, -1, 0) - P(0, 0, 0)) < 0:
        for p in glow.data.polygons:
            p.flip()
    kit.emit(glow)
    # poles, guy ropes and stakes
    for s in (-1, 1):
        g.append(cylinder(f"{name}_pole{s}", 0.025, H_ + 0.12, tuple(P(0, s * (D_ / 2 + 0.02), (H_ + 0.12) / 2)), M["pole"], verts=8))
        top = P(0, s * (D_ / 2 + 0.02), H_ + 0.08)
        stake = P(0, s * (D_ / 2 + 1.1), 0.02)
        rope = cylinder(f"{name}_rope{s}", 0.006, (top - stake).length, tuple((top + stake) / 2), M["rope"], verts=6)
        rope.rotation_mode = "QUATERNION"
        rope.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(top - stake)
        g.append(rope)
        g.append(cylinder(f"{name}_stake{s}", 0.02, 0.12, tuple(stake + Vector((0, 0, 0.05))), M["pole"], verts=6))
    for o in g:
        kit.grp("tents", o)
    # fairy lights along the two front roof edges and the ridge, sagging between pins
    bulbs = bmesh.new()
    wire_pts = []
    edges = [(P(-W_ / 2, -D_ / 2 - 0.04, 0.12), P(0, -D_ / 2 - 0.04, H_ + 0.03)), (P(0, -D_ / 2 - 0.04, H_ + 0.03), P(W_ / 2, -D_ / 2 - 0.04, 0.12)),
             (P(-W_ / 2 - 0.03, -D_ / 2, 0.15), P(-W_ / 2 - 0.03, D_ / 2, 0.15))]
    for a, b in edges:
        n = int((b - a).length / 0.16)
        for i in range(n + 1):
            t = i / max(1, n)
            p = a.lerp(b, t) - Vector((0, 0, 0.05 * math.sin(math.pi * ((t * 3) % 1))))
            bmesh.ops.create_uvsphere(bulbs, u_segments=8, v_segments=5, radius=0.022, matrix=__import__("mathutils").Matrix.Translation(p))
            wire_pts.append(p)
    fairy = blib.mesh_from_bmesh(f"EMIT_fairy_{name}", bulbs)
    blib.set_mat(fairy, M["fairy"])
    kit.emit(fairy)
    kit.collider(name, (W_ + 0.2, D_ + 0.2), (cx, cy), rot_z=rot)
    L.setdefault("tents", []).append((tuple(P(0, 0.2, 0.8)), tuple(P(0, -D_ / 2 - 0.6, 0.6))))
    kit.anchor(f"tent{name}", {"pos": roomkit.bab((cx, cy, 0)), "door": roomkit.bab(tuple(P(0, -D_ / 2 - 0.4, 0)))})


# ------------------------------------------------------------------ lights + camera

def build_lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = blib.srgb("#2a3478")
    bg.inputs["Strength"].default_value = 0.55
    L["world"] = bg

    def light(name, kind, loc, color, energy, size=0.1, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name, kind)
        ld.color = blib.srgb(color)[:3]
        ld.energy = energy
        if kind == "SUN":
            ld.angle = math.radians(size)
        else:
            ld.shadow_soft_size = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = [math.radians(a) for a in rot]
        blib.link(o)
        return o

    base = [light("L_moon", "SUN", (0, 50, 30), "#9db0ff", 0.55, size=2.0, rot=(-62, 0, 180))]
    for i, (inner, front) in enumerate(L["tents"]):
        base.append(light(f"L_tent{i}", "POINT", inner, "#ffb860", 70, size=0.3))
        base.append(light(f"L_tent_front{i}", "POINT", front, "#ffc070", 14, size=0.4))
    base.append(light("L_lantern", "POINT", L["lantern"], "#ffcf7a", 14, size=0.05))
    L["base"] = base
    L["fire"] = light("L_fire", "POINT", (0, 0, 0.55), "#ff9a48", 900, size=0.35)
    L["fire2"] = light("L_fire_low", "POINT", (0, 0, 0.25), "#ff7a2a", 250, size=0.3)
    # base bake: no fire (it is the "fire" layer)
    L["fire"].data.energy = 0
    L["fire2"].data.energy = 0


def fire_layer_on():
    L["saved"] = [(o, o.data.energy) for o in L["base"]]
    for o in L["base"]:
        o.data.energy = 0.0
    L["world_saved"] = L["world"].inputs["Strength"].default_value
    L["world"].inputs["Strength"].default_value = 0.0
    L["emit_saved"] = []
    for m in bpy.data.materials:
        if m.name.startswith("EMIT_") and m.use_nodes:
            b = m.node_tree.nodes.get("Principled BSDF")
            if b:
                L["emit_saved"].append((b, b.inputs["Emission Strength"].default_value))
                b.inputs["Emission Strength"].default_value = 0.0
    L["fire"].data.energy = 900
    L["fire2"].data.energy = 250


def fire_layer_off():
    for o, e in L["saved"]:
        o.data.energy = e
    L["world"].inputs["Strength"].default_value = L["world_saved"]
    for b, s in L["emit_saved"]:
        b.inputs["Emission Strength"].default_value = s
    L["fire"].data.energy = 0
    L["fire2"].data.energy = 0


def build_camera():
    # fitted to scene-4.jpg (out/tmp fit, hfov 60): fire + four benches
    yaw, pitch, dist = math.radians(2.77), math.radians(-8.13), 7.0
    loc = (-0.36, -5.27, 2.12)
    tgt = (loc[0] + dist * math.sin(yaw) * math.cos(pitch), loc[1] + dist * math.cos(yaw) * math.cos(pitch), loc[2] + dist * math.sin(pitch))
    kit.hero_camera(loc, tgt, lens=float(arg("--lens", 31.2)))
    for x, y in ((0.0, -3.0), (-1.2, -2.8), (1.2, -2.8), (-2.4, -2.0), (2.4, -2.0), (0.0, -4.2)):
        kit.spawn(x, y)
    kit.room_bounds(-8.0, -8.0, 8.0, 6.8, 8.0)


# ------------------------------------------------------------------ main

def main():
    scene = blib.reset_scene()
    make_materials()
    build_terrain()
    build_sky()
    build_trees()
    build_benches()
    build_fire()
    for name, (x, y), rot in TENTS:
        tent(name, x, y, rot)
    stones_and_bits()
    grass_tufts()
    build_lights()
    build_camera()
    kit.light_layer("fire", fire_layer_on, fire_layer_off, size_div=2)
    scene.render.engine = "CYCLES"
    scene.view_settings.view_transform = "AgX"

    preview = arg("--preview")
    if preview:
        if arg("--fire"):
            L["fire"].data.energy = 900
            L["fire2"].data.energy = 250
        for o in kit.emissive:
            if o.name.startswith("EMIT_flame"):
                o.hide_render = True
        roomkit.render_preview(preview, samples=int(arg("--samples", 16)), w=int(arg("--w", 800)), h=int(arg("--h", 450)))
        return
    out = arg("--out", os.path.join(REPO, "frontend", "public", "world3d", "camp.glb"))
    samples = int(arg("--samples", 32))
    work = os.path.join(blib.HERE, "out", "bakes", "camp")
    os.makedirs(work, exist_ok=True)
    sizes = {"ground": 2048, "props": 2048, "tents": 1024}
    if arg("--small"):
        sizes = {k: max(128, v // 4) for k, v in sizes.items()}
    vc_groups = list(kit.vc_groups)
    job = arg("--bake-group")
    if job:
        if job == "vertex":
            # vertex colour groups carry the fire light baked in (static)
            L["fire"].data.energy = 900
            L["fire2"].data.energy = 250
            for g in vc_groups:
                o = roomkit.bake_vertex_group(g, kit.vc_groups[g], max(64, samples * 2))
                roomkit.save_vertex_colors(o, os.path.join(work, f"vc_{g}.npy"))
        else:
            roomkit.bake_atlas_group(kit, job, kit.groups[job], sizes[job], samples, work, layers=("fire",), mode="bake")
        print(f"[bake-done] {job}", flush=True)
        return
    if not arg("--bake"):
        return
    extra = ["--samples", str(samples)] + (["--small"] if arg("--small") else [])
    roomkit.run_bakes(os.path.abspath(__file__), list(sizes) + ["vertex"], extra, out_dir=work, force=bool(arg("--force")))
    for g, size in sizes.items():
        roomkit.bake_atlas_group(kit, g, kit.groups[g], size, samples, work, layers=("fire",), mode="load")
    for g in vc_groups:
        roomkit.load_vertex_group(g, kit.vc_groups[g], os.path.join(work, f"vc_{g}.npy"))
    for o in kit.emissive:
        blib.apply_all(o)
    for o in bpy.data.objects:
        if o.name == "BAKED_ground":
            o.name = "FLOOR"
    kit.write_layout(os.path.join(REPO, "frontend", "src", "world3d", "engine", "rooms", "camp.layout.js"), "tools/world3d/build_camp.py")
    roomkit.export_glb(out)


if __name__ == "__main__":
    main()
