"""Descall 3D world, phase 1: the stylized avatar, built and animated from code.

Target: docs/design/3d-world/scene-5.jpg (rounded proportions, big head and eyes,
hoodie or zip jacket, rolled jeans, sneakers). Everything here is original work:
primitive / metaball modelling, a 20 bone rig with computed skin weights, and
hand-keyed animation clips (idle, walk, run, sitDown, sit, standUp, wave, dance,
clap, laugh, jump, cheer, sitCheer).

All meshes share one material whose base colour is a small palette texture
(8 x 8 cells). Every part's UVs point at one cell, so the client recolours an
avatar by drawing a new 64 x 64 palette: one draw call per mesh, any number of
colour variants. Face morph targets: blink, mouthOpen.

  blender -b -P tools/world3d/build_character.py -- --preview out.png
  blender -b -P tools/world3d/build_character.py -- --out frontend/public/world3d/avatar.glb

Blender axes: Z up, the character faces -Y, its left side is +X.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blib  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith("--"):
            return ARGS[i + 1]
        return True
    return default


FPS = 30

# ------------------------------------------------------------------ palette
# cell index -> default colour (the client rewrites these per avatar)
CELLS = {
    "skin": 0, "top": 1, "top_dark": 2, "inner": 3, "pants": 4, "pants_cuff": 5,
    "shoe": 6, "sole": 7, "shoe_accent": 8, "hair": 9, "eye_white": 10, "iris": 11,
    "mouth": 12, "brows": 13, "acc1": 14, "acc2": 15, "highlight": 16, "sock": 17,
    "nose": 18, "lens": 19, "sleeve": 20, "sleeve_stripe": 21, "stripe": 22, "blush": 23,
    "pack": 24, "scarf": 25, "guitar": 26, "guitar_dark": 27, "metal": 28, "sole_band": 29,
}
DEFAULT_COLORS = {
    "skin": "#f2b58f", "top": "#d9dbe3", "top_dark": "#b9bcc8", "inner": "#f1e9da", "pants": "#2c3566",
    "pants_cuff": "#4a5590", "shoe": "#f3f3f3", "sole": "#e9e9ea", "shoe_accent": "#3f8a6a", "hair": "#1d2236",
    "eye_white": "#fbfbff", "iris": "#2a1c16", "mouth": "#7a2c35", "brows": "#1d2236", "acc1": "#c94a4a",
    "acc2": "#f5f5f5", "highlight": "#ffffff", "sock": "#f4f4f4", "nose": "#eda687", "lens": "#1b1b22",
    "sleeve": "#d9dbe3", "sleeve_stripe": "#d9dbe3", "stripe": "#f1e9da", "blush": "#f29a8e", "pack": "#3b4a7a",
    "scarf": "#5cc0c8", "guitar": "#d9954a", "guitar_dark": "#4a2a1a", "metal": "#c9ccd6", "sole_band": "#e9e9ea",
}

# Head group (head, face, hair, hats) is scaled about the neck: rounder, bigger head (scene-5 proportions).
HEAD_K = 1.1
HEAD_PIVOT = Vector((0.0, 0.0, 1.07))


def head_xyz(x, y, z):
    return (x * HEAD_K, y * HEAD_K, HEAD_PIVOT.z + (z - HEAD_PIVOT.z) * HEAD_K)


def cell_uv(name):
    i = CELLS[name]
    return (((i % 8) + 0.5) / 8.0, 1.0 - ((i // 8) + 0.5) / 8.0)


def palette_image():
    arr = np.zeros((64, 64, 4), np.float32)
    arr[..., 3] = 1
    for name, i in CELLS.items():
        c = blib.srgb(DEFAULT_COLORS[name])
        # store sRGB-encoded values (image colourspace is sRGB)
        h = DEFAULT_COLORS[name].lstrip("#")
        rgb = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]
        y0 = (i // 8) * 8
        x0 = (i % 8) * 8
        arr[y0:y0 + 8, x0:x0 + 8, :3] = rgb
    return blib.image_from_array("avatar_palette", arr)


MAT = None


def avatar_material():
    mat = bpy.data.materials.new("AVATAR")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = palette_image()
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.62
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
    return mat


def paint(obj, cell):
    """Point every UV of obj at one palette cell and give it the avatar material."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    u, v = cell_uv(cell)
    for l in me.uv_layers.active.data:
        l.uv = (u, v)
    blib.set_mat(obj, MAT)
    obj["cell"] = cell
    return obj


def paint_bands(obj, cell_a, cell_b, band=0.032):
    """Horizontal stripes: every polygon gets cell_a or cell_b by the height of its centre."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    ua, ub = cell_uv(cell_a), cell_uv(cell_b)
    bpy.context.view_layer.update()
    mw = obj.matrix_world
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        z = (mw @ poly.center).z
        c = ua if int(math.floor(z / band)) % 2 == 0 else ub
        for li in poly.loop_indices:
            uv[li].uv = c
    blib.set_mat(obj, MAT)
    obj["banded"] = True
    return obj


# ------------------------------------------------------------------ rig layout (rest pose)

def arm_points(side):
    s = 1 if side == "L" else -1
    shoulder = Vector((s * 0.172, 0.0, 0.975))
    a1 = math.radians(82)
    elbow = shoulder + 0.235 * Vector((s * math.cos(a1), 0.01, -math.sin(a1)))
    a2 = math.radians(84)
    wrist = elbow + 0.215 * Vector((s * math.cos(a2), -0.04, -math.sin(a2)))
    hand_end = wrist + 0.1 * Vector((s * math.cos(a2), -0.02, -math.sin(a2)))
    return shoulder, elbow, wrist, hand_end


def leg_points(side):
    s = 1 if side == "L" else -1
    hip = Vector((s * 0.088, 0.0, 0.63))
    knee = Vector((s * 0.088, -0.01, 0.35))
    ankle = Vector((s * 0.088, 0.0, 0.085))
    toe = Vector((s * 0.09, -0.1, 0.03))
    toe_end = Vector((s * 0.09, -0.16, 0.03))
    return hip, knee, ankle, toe, toe_end


BONES = {}


def build_armature():
    arm_data = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm_data)
    blib.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, roll=0.0):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        b.roll = roll
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        BONES[name] = (Vector(head), Vector(tail))
        return b

    bone("root", (0, 0, 0), (0, 0.15, 0))
    bone("hips", (0, 0, 0.63), (0, 0, 0.74), "root")
    bone("spine", (0, 0, 0.74), (0, 0, 0.88), "hips")
    bone("chest", (0, 0, 0.88), (0, 0, 1.02), "spine")
    bone("neck", (0, 0, 1.02), (0, 0, 1.09), "chest")
    bone("head", (0, 0, 1.09), (0, 0, 1.47), "neck")
    for side in ("L", "R"):
        sh, el, wr, he = arm_points(side)
        bone(f"upper_arm.{side}", sh, el, "chest")
        bone(f"forearm.{side}", el, wr, f"upper_arm.{side}")
        bone(f"hand.{side}", wr, he, f"forearm.{side}")
        hip, knee, ankle, toe, toe_end = leg_points(side)
        bone(f"thigh.{side}", hip, knee, "hips")
        bone(f"shin.{side}", knee, ankle, f"thigh.{side}")
        bone(f"foot.{side}", ankle, toe, f"shin.{side}")
        bone(f"toe.{side}", toe, toe_end, f"foot.{side}")
    # stable rolls: every bone's local X points to the character's left (+X)
    for b in eb:
        b.align_roll(Vector((0, -1, 0)) if abs(b.vector.normalized().z) > 0.7 else Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


# ------------------------------------------------------------------ modelling helpers

def seg_cylinder(name, a, b, r1, r2, cell, verts=20, segs=1):
    """Cylinder from point a to point b (segs = rings along the length)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    o = blib.cylinder(name, r1, d.length, (0, 0, 0), None, verts=verts, radius_top=r2)
    if segs > 1:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-6]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=segs - 1, use_grid_fill=True)
        bm.to_mesh(o.data)
        bm.free()
    # create_cone builds along Z centred on origin; radius1 at -Z
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = (a + b) / 2
    return paint(o, cell)


def ball(name, r, loc, cell, scale=(1, 1, 1), seg=24, rings=12, rot=(0, 0, 0)):
    return paint(blib.sphere(name, r, loc, None, scale=scale, segments=seg, rings=rings, rot=rot), cell)


def box(name, size, loc, cell, bevel=0.02, rot=(0, 0, 0), sub=1, seg=3):
    return paint(blib.rbox(name, size, loc, None, bevel=bevel, segments=seg, rot=rot, subsurf=sub), cell)


def metaball_mesh(name, elements, cell, resolution=0.012, threshold=0.6):
    """elements: list of (type, co, radius, size_xyz). Converted to a mesh."""
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = resolution
    mb.render_resolution = resolution
    mb.threshold = threshold
    for el in elements:
        kind, co, radius, size = el[:4]
        radius = radius * (1.36 if kind == "ELLIPSOID" else 1.15)
        e = mb.elements.new()
        e.type = kind
        e.co = co
        e.radius = radius
        if kind == "ELLIPSOID":
            e.size_x, e.size_y, e.size_z = size
        if len(el) > 4:
            e.rotation = Euler([math.radians(a) for a in el[4]], "XYZ").to_quaternion()
    obj = bpy.data.objects.new(name + "_mbobj", mb)
    blib.link(obj)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(ev)
    out = bpy.data.objects.new(name, me)
    blib.link(out)
    bpy.data.objects.remove(obj)
    # clean up: merge by distance + smooth shading
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bm.to_mesh(me)
    bm.free()
    blib.shade_smooth(out)
    return paint(out, cell)


# ------------------------------------------------------------------ parts

PARTS = []  # (obj, mesh_group, bone_mode)


def add(obj, group, bones):
    """bones: a bone name (rigid) or a list of bone names (distance weighted)."""
    PARTS.append((obj, group, bones))
    return obj


_FOLD_TEX = None


def folds(obj, strength):
    """Gentle cloth folds: low-frequency noise displacement (applied with the object)."""
    global _FOLD_TEX
    if _FOLD_TEX is None:
        _FOLD_TEX = bpy.data.textures.new("folds", "CLOUDS")
        _FOLD_TEX.noise_scale = 0.06
        _FOLD_TEX.noise_depth = 1
    d = obj.modifiers.new("folds", "DISPLACE")
    d.texture = _FOLD_TEX
    d.texture_coords = "GLOBAL"
    d.strength = strength
    d.mid_level = 0.5
    return obj


def build_hand(side, wr, he):
    """Relaxed hand: palm, four slightly curled fingers and a separate thumb."""
    s = 1 if side == "L" else -1
    hd = (he - wr).normalized()
    across = Vector((0, 1, 0))  # fingers line up front to back when the arm hangs
    inward = Vector((-s, 0, 0))  # palm faces the thigh
    palm_c = wr + hd * 0.042
    palm = ball(f"palm.{side}", 0.042, palm_c, "skin", scale=(0.55, 0.95, 1.0))
    palm.rotation_mode = "QUATERNION"
    palm.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(hd)
    add(palm, "body", f"hand.{side}")
    for k, off in enumerate((-0.027, -0.009, 0.009, 0.026)):
        length = (0.036, 0.04, 0.038, 0.031)[k]
        base = wr + hd * 0.07 + across * off
        mid = base + hd * length * 0.55
        tip = mid + (hd * 0.6 + inward * 0.8).normalized() * length * 0.5
        r = 0.0105 if k in (1, 2) else 0.0095
        add(seg_cylinder(f"fing{k}a.{side}", base, mid, r, r * 0.95, "skin", verts=10), "body", f"hand.{side}")
        add(seg_cylinder(f"fing{k}b.{side}", mid, tip, r * 0.95, r * 0.9, "skin", verts=10), "body", f"hand.{side}")
        add(ball(f"fing{k}m.{side}", r * 0.97, mid, "skin", seg=10, rings=6), "body", f"hand.{side}")
        add(ball(f"fing{k}t.{side}", r * 0.92, tip, "skin", seg=10, rings=6), "body", f"hand.{side}")
    tb = wr + hd * 0.03 + across * -0.03 + inward * 0.012
    tt = tb + (hd * 0.5 + across * -0.6 + inward * 0.4).normalized() * 0.04
    add(seg_cylinder(f"thumb.{side}", tb, tt, 0.012, 0.011, "skin", verts=10), "body", f"hand.{side}")
    add(ball(f"thumbt.{side}", 0.0112, tt, "skin", seg=10, rings=6), "body", f"hand.{side}")


def build_body():
    # head
    head = ball("head", 0.19, (0, 0, 1.25), "skin", scale=(1.04, 0.98, 1.0), seg=40, rings=24)
    # fuller cheeks / jaw: push lower front verts slightly out
    for v in head.data.vertices:
        z = v.co.z
        if z < 0:
            k = min(1.0, -z / 0.19)
            # soft, full jaw and cheeks
            v.co.x *= 1.0 + 0.09 * k
            v.co.y *= 1.0 + 0.05 * k
    add(head, "body", "head")
    for s in (-1, 1):
        add(ball(f"ear{s}", 0.05, (s * 0.198, 0.01, 1.232), "skin", scale=(0.5, 0.82, 1.08)), "body", "head")
        add(ball(f"ear_in{s}", 0.03, (s * 0.214, 0.0, 1.232), "nose", scale=(0.3, 0.7, 0.95)), "body", "head")
        # cheek blush (palette cell 'blush'), sunk into the face so only a soft disc shows
        add(ball(f"blush{s}", 0.04, (s * 0.112, -0.158, 1.178), "blush", scale=(1.0, 0.35, 0.72), rot=(0, 0, s * 28)), "body", "head")
    add(ball("nose", 0.027, (0, -0.184, 1.2), "nose", scale=(1.1, 0.8, 0.85)), "body", "head")
    add(seg_cylinder("neck", (0, 0, 0.96), (0, 0, 1.11), 0.058, 0.055, "skin"), "body", ["chest", "neck", "head"])
    # torso (top), hem
    torso = box("torso", (0.34, 0.23, 0.42), (0, 0.0, 0.825), "top", bevel=0.1, sub=2, seg=4)
    folds(torso, 0.006)
    add(torso, "body", ["hips", "spine", "chest"])
    add(box("hem", (0.365, 0.24, 0.05), (0, 0.0, 0.635), "top_dark", bevel=0.022, sub=1), "body", ["hips"])
    # pelvis (pants)
    add(box("pelvis", (0.31, 0.21, 0.15), (0, 0.0, 0.625), "pants", bevel=0.06, sub=1), "body", ["hips"])
    for side in ("L", "R"):
        s = 1 if side == "L" else -1
        sh, el, wr, he = arm_points(side)
        # sleeves: own palette cells so a vest look can show a striped long-sleeve shirt
        add(paint_bands(ball(f"shoulder.{side}", 0.064, sh + Vector((s * 0.004, 0, -0.012)), "top"), "sleeve", "sleeve_stripe"), "body", ["chest", f"upper_arm.{side}"])
        add(paint_bands(seg_cylinder(f"uarm.{side}", sh, el, 0.058, 0.052, "top", segs=6), "sleeve", "sleeve_stripe"), "body", ["chest", f"upper_arm.{side}", f"forearm.{side}"])
        add(paint_bands(ball(f"elbow.{side}", 0.052, el, "top"), "sleeve", "sleeve_stripe"), "body", [f"upper_arm.{side}", f"forearm.{side}"])
        add(paint_bands(seg_cylinder(f"farm.{side}", el, wr - (wr - el).normalized() * 0.03, 0.052, 0.048, "top", segs=6), "sleeve", "sleeve_stripe"), "body", [f"upper_arm.{side}", f"forearm.{side}"])
        add(seg_cylinder(f"cuff.{side}", wr - (wr - el).normalized() * 0.048, wr + (wr - el).normalized() * 0.004, 0.054, 0.054, "top_dark"), "body", f"forearm.{side}")
        build_hand(side, wr, he)
        # legs (jeans)
        hip, knee, ankle, toe, toe_end = leg_points(side)
        add(seg_cylinder(f"thigh.{side}", hip + Vector((0, 0, 0.04)), knee, 0.08, 0.068, "pants"), "body", ["hips", f"thigh.{side}", f"shin.{side}"])
        add(ball(f"knee.{side}", 0.067, knee, "pants"), "body", [f"thigh.{side}", f"shin.{side}"])
        add(seg_cylinder(f"shin.{side}", knee, Vector((knee.x, 0, 0.135)), 0.066, 0.06, "pants"), "body", [f"thigh.{side}", f"shin.{side}"])
        add(seg_cylinder(f"pcuff.{side}", Vector((knee.x, 0, 0.088)), Vector((knee.x, 0, 0.145)), 0.069, 0.071, "pants_cuff"), "body", f"shin.{side}")
        add(seg_cylinder(f"sock.{side}", Vector((knee.x, 0, 0.05)), Vector((knee.x, 0, 0.1)), 0.045, 0.047, "sock"), "body", f"shin.{side}")
        # sneaker
        x = ankle.x
        add(box(f"shoe.{side}", (0.118, 0.245, 0.09), (x, -0.04, 0.072), "shoe", bevel=0.044, sub=1), "body", [f"foot.{side}", f"toe.{side}"])
        add(box(f"sole.{side}", (0.126, 0.258, 0.034), (x, -0.04, 0.03), "sole_band", bevel=0.014, sub=1), "body", [f"foot.{side}", f"toe.{side}"])
        add(box(f"outsole.{side}", (0.124, 0.254, 0.018), (x, -0.04, 0.009), "sole", bevel=0.008, sub=1), "body", [f"foot.{side}", f"toe.{side}"])
        add(box(f"heel.{side}", (0.114, 0.07, 0.06), (x, 0.045, 0.074), "shoe_accent", bevel=0.026, sub=1), "body", f"foot.{side}")
        add(box(f"toecap.{side}", (0.1, 0.06, 0.05), (x, -0.135, 0.058), "shoe_accent", bevel=0.024, sub=1), "body", f"toe.{side}")
        for k in range(3):
            add(box(f"lace{k}.{side}", (0.06, 0.012, 0.01), (x, -0.07 + k * 0.03, 0.118 - k * 0.004), "sole_band", bevel=0.004, sub=0), "body", f"foot.{side}")


def build_outfits():
    # hoodie extras: hood, pocket, drawstrings
    hood = box("hood", (0.3, 0.13, 0.12), (0, 0.085, 1.0), "top", bevel=0.055, sub=1, rot=(-15, 0, 0))
    add(hood, "extra_hoodie", ["chest", "neck"])
    collar = blib.cylinder("hood_ring", 0.1, 0.05, (0, -0.01, 1.0), None, verts=24, radius_top=0.09)
    add(paint(collar, "top"), "extra_hoodie", ["chest", "neck"])
    add(box("pocket", (0.22, 0.03, 0.12), (0, -0.115, 0.715), "top", bevel=0.014, sub=1), "extra_hoodie", ["hips", "spine"])
    add(box("pocket_line", (0.2, 0.02, 0.006), (0, -0.124, 0.77), "top_dark", bevel=0.002, sub=0), "extra_hoodie", ["spine"])
    for s in (-1, 1):
        add(seg_cylinder(f"string{s}", (s * 0.035, -0.118, 0.98), (s * 0.04, -0.124, 0.86), 0.0055, 0.0055, "top_dark", verts=8), "extra_hoodie", ["chest"])
        add(ball(f"string_tip{s}", 0.009, (s * 0.04, -0.124, 0.855), "top_dark", scale=(1, 1, 1.6)), "extra_hoodie", ["chest"])
    # zip jacket extras: inner shirt panel, collar, zip
    add(box("shirt_panel", (0.13, 0.03, 0.38), (0, -0.108, 0.83), "inner", bevel=0.012, sub=1), "extra_jacket", ["hips", "spine", "chest"])
    add(box("shirt_neck", (0.14, 0.12, 0.04), (0, -0.04, 0.985), "inner", bevel=0.02, sub=1), "extra_jacket", ["chest"])
    for s in (-1, 1):
        add(box(f"collar{s}", (0.1, 0.045, 0.08), (s * 0.085, -0.075, 0.975), "top", bevel=0.02, sub=1, rot=(0, s * 25, s * 20)), "extra_jacket", ["chest", "neck"])
        add(box(f"zip{s}", (0.008, 0.012, 0.36), (s * 0.068, -0.118, 0.83), "top_dark", bevel=0.003, sub=0), "extra_jacket", ["hips", "spine", "chest"])
    add(box("jacket_pull", (0.012, 0.012, 0.035), (0.068, -0.126, 0.67), "acc2", bevel=0.004, sub=0), "extra_jacket", ["hips"])
    # puffer vest over a striped long-sleeve shirt (scene-5, right): quilted ridges, open front, high collar
    panel = box("vest_shirt", (0.13, 0.03, 0.38), (0, -0.108, 0.83), "inner", bevel=0.012, sub=2)
    add(paint_bands(panel, "inner", "stripe", band=0.03), "extra_vest", ["hips", "spine", "chest"])
    for k, z in enumerate((0.69, 0.77, 0.85, 0.93)):
        add(box(f"quilt{k}", (0.343, 0.236, 0.01), (0, 0.0, z), "top_dark", bevel=0.004, sub=1), "extra_vest", ["hips", "spine", "chest"])
    for s in (-1, 1):
        add(box(f"vest_collar{s}", (0.12, 0.06, 0.07), (s * 0.075, -0.05, 0.985), "top", bevel=0.026, sub=1, rot=(0, 0, s * 12)), "extra_vest", ["chest", "neck"])
        add(box(f"vest_zip{s}", (0.008, 0.012, 0.36), (s * 0.068, -0.118, 0.83), "top_dark", bevel=0.003, sub=0), "extra_vest", ["hips", "spine", "chest"])


def build_face():
    for s in (-1, 1):
        x = s * 0.074
        x = s * 0.077
        add(ball(f"eye_white{s}", 0.048, (x, -0.15, 1.252), "eye_white", scale=(1.0, 0.55, 1.2)), "face", "head")
        add(ball(f"iris{s}", 0.036, (x * 0.98, -0.175, 1.246), "iris", scale=(1.0, 0.42, 1.14)), "face", "head")
        add(ball(f"shine{s}", 0.012, (x - s * 0.006 + 0.011, -0.191, 1.268), "highlight"), "face", "head")
        add(ball(f"shine2{s}", 0.006, (x - s * 0.004 - 0.012, -0.19, 1.232), "highlight"), "face", "head")
        brow = box(f"brow{s}", (0.07, 0.02, 0.016), (s * 0.08, -0.166, 1.34), "brows", bevel=0.007, sub=1, rot=(-12, s * 3, -s * 9))
        add(brow, "face", "head")
    add(mouth_mesh(), "face", "head")


def mouth_shape(open_amount):
    n = 18
    w = 0.036 * (1 + 0.18 * open_amount)
    top, bot = [], []
    for i in range(n + 1):
        t = -1 + 2 * i / n
        x = w * t
        curve = 0.015 * t * t
        tz = curve + 0.0025 * (1 - t * t) + 0.004 * open_amount * (1 - t * t)
        bz = curve - 0.0035 * (1 - t * t) - 0.036 * open_amount * (1 - t * t) ** 0.8
        top.append((x, tz))
        bot.append((x, bz))
    return top, bot


def mouth_mesh():
    """Closed mouth outline (smile), extruded into the head. Morph 'mouthOpen' = laugh."""
    cz, cy = 1.148, -0.153
    bm = bmesh.new()
    top, bot = mouth_shape(0)
    ring = top + list(reversed(bot[1:-1]))
    front = [bm.verts.new((x, cy - 0.006 - 0.012 * (x / 0.04) ** 2 * -1, cz + z)) for x, z in ring]
    back = [bm.verts.new((x, cy + 0.012, cz + z)) for x, z in ring]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    nring = len(ring)
    for i in range(nring):
        j = (i + 1) % nring
        bm.faces.new((front[i], front[j], back[j], back[i]))
    obj = blib.mesh_from_bmesh("mouth", bm)
    # the front follows the head curvature a little
    for v in obj.data.vertices:
        v.co.y += 0.35 * v.co.x * v.co.x / 0.19
    obj["ring"] = nring
    return paint(obj, "mouth")


def swept_locks():
    C = Vector((0, 0.0, 1.27))
    R0 = 0.2
    top = C + Vector((0, 0.03, R0))
    out = []
    spec = [(-80, 28), (-55, 34), (-30, 40), (-8, 44), (15, 40), (40, 34), (65, 28), (95, 24), (-105, 22),
            (-20, 62), (20, 62), (0, 74), (140, 30), (-140, 30), (180, 34)]
    for az, el in spec:
        a, e = math.radians(az), math.radians(el)
        n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        pnt = C + n * R0
        t = (pnt - top)
        t = (t - n * t.dot(n))
        if t.length < 1e-4:
            t = Vector((0, -1, 0))
        t.normalize()
        # sweep to the character's right a little
        t = (t + Vector((-0.35, 0, 0)) - n * Vector((-0.35, 0, 0)).dot(n)).normalized()
        q = Vector((0, 0, 1)).rotation_difference(t)
        rot = [math.degrees(v) for v in q.to_euler("XYZ")]
        size = (0.85, 0.65, 2.1) if el < 60 else (0.9, 0.7, 1.8)
        out.append(("ELLIPSOID", tuple(pnt + n * 0.012), 0.062 if el < 60 else 0.07, size, tuple(rot)))
    return out


def build_hair_and_accessories():
    E = "ELLIPSOID"
    B = "BALL"
    # short swept hair (scene-5 boys): a cap plus soft locks lying on the scalp, all
    # sweeping from the crown towards the forehead and to one side, merged by the metaballs.
    spiky = [
        (E, (0, 0.02, 1.345), 0.19, (1.06, 1.03, 0.84)),
        (E, (0, 0.07, 1.24), 0.17, (1.1, 0.95, 0.9)),
    ] + swept_locks()
    add(metaball_mesh("hair_spiky", spiky, "hair"), "hair_spiky", "head")
    bun = [
        (E, (0, 0.015, 1.33), 0.2, (1.08, 1.06, 0.84)),
        (E, (0, 0.07, 1.22), 0.185, (1.12, 0.92, 1.0)),
        (E, (-0.075, -0.13, 1.39), 0.075, (1.5, 0.7, 0.8), (0, 0, -20)),
        (E, (0.075, -0.13, 1.39), 0.075, (1.5, 0.7, 0.8), (0, 0, 20)),
        (E, (-0.15, -0.06, 1.2), 0.07, (0.7, 0.8, 1.9)),
        (E, (0.15, -0.06, 1.2), 0.07, (0.7, 0.8, 1.9)),
        (E, (-0.05, -0.12, 1.4), 0.08, (1.4, 0.8, 0.7)),
        (B, (0, 0.06, 1.53), 0.095, None),
    ]
    add(metaball_mesh("hair_bun", bun, "hair"), "hair_bun", "head")
    bob = [
        (E, (0, 0.02, 1.32), 0.2, (1.08, 1.05, 0.8)),
        (E, (0, 0.07, 1.16), 0.2, (1.14, 0.94, 1.3)),
        (E, (-0.165, -0.03, 1.12), 0.09, (0.72, 1.05, 2.4)),
        (E, (0.165, -0.03, 1.12), 0.09, (0.72, 1.05, 2.4)),
        (E, (-0.07, -0.135, 1.385), 0.08, (1.5, 0.7, 0.8), (0, 0, -12)),
        (E, (0.07, -0.135, 1.385), 0.08, (1.5, 0.7, 0.8), (0, 0, 12)),
    ]
    add(metaball_mesh("hair_bob", bob, "hair"), "hair_bob", "head")
    # baseball cap
    dome = blib.sphere("cap_dome", 0.205, (0, 0.01, 1.3), None, scale=(1.04, 1.04, 0.85), segments=32, rings=16)
    me = dome.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    sol = dome.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.012
    add(paint(dome, "acc2"), "acc_cap", "head")
    front = blib.sphere("cap_front", 0.206, (0, 0.012, 1.3), None, scale=(1.045, 1.045, 0.86), segments=32, rings=16)
    bm = bmesh.new()
    bm.from_mesh(front.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.02 or v.co.y > -0.06], context="VERTS")
    bm.to_mesh(front.data)
    bm.free()
    add(paint(front, "acc1"), "acc_cap", "head")
    add(box("cap_brim", (0.24, 0.16, 0.016), (0, -0.25, 1.32), "acc1", bevel=0.007, sub=1, rot=(-8, 0, 0)), "acc_cap", "head")
    add(ball("cap_button", 0.016, (0, 0.01, 1.475), "acc1"), "acc_cap", "head")
    # glasses
    for s in (-1, 1):
        rim = bpy.data.meshes.new("rim")
        tor = bpy.data.objects.new(f"glasses_rim{s}", rim)
        blib.link(tor)
        bm = bmesh.new()
        segs, rr, tube = 28, 0.05, 0.008
        verts = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            c = Vector((math.cos(a) * rr * 1.12, 0, math.sin(a) * rr * 0.92))
            ring_v = []
            for j in range(8):
                b = 2 * math.pi * j / 8
                n = Vector((math.cos(a) * math.cos(b), math.sin(b), math.sin(a) * math.cos(b)))
                ring_v.append(bm.verts.new(c + n * tube))
            verts.append(ring_v)
        for i in range(segs):
            for j in range(8):
                bm.faces.new((verts[i][j], verts[(i + 1) % segs][j], verts[(i + 1) % segs][(j + 1) % 8], verts[i][(j + 1) % 8]))
        bm.to_mesh(rim)
        bm.free()
        tor.location = (s * 0.075, -0.197, 1.252)
        blib.shade_smooth(tor)
        add(paint(tor, "lens"), "acc_glasses", "head")
        add(seg_cylinder(f"temple{s}", (s * 0.13, -0.195, 1.262), (s * 0.19, -0.02, 1.255), 0.006, 0.006, "lens", verts=8), "acc_glasses", "head")
    add(seg_cylinder("bridge", (-0.022, -0.2, 1.262), (0.022, -0.2, 1.262), 0.006, 0.006, "lens", verts=8), "acc_glasses", "head")
    # backpack (vest look)
    add(box("pack_body", (0.27, 0.12, 0.32), (0, 0.17, 0.82), "pack", bevel=0.05, sub=1), "acc_backpack", ["spine", "chest"])
    add(box("pack_pocket", (0.19, 0.04, 0.12), (0, 0.235, 0.74), "pack", bevel=0.02, sub=1), "acc_backpack", ["spine"])
    for s in (-1, 1):
        add(box(f"strap{s}", (0.035, 0.02, 0.32), (s * 0.085, -0.122, 0.86), "pack", bevel=0.008, sub=0, rot=(-6, 0, 0)), "acc_backpack", ["spine", "chest"])
        add(box(f"strap_top{s}", (0.035, 0.26, 0.025), (s * 0.085, 0.02, 1.0), "pack", bevel=0.01, sub=0), "acc_backpack", ["chest"])
    # scarf (scene-5, middle girl)
    sc = blib.cylinder("scarf_ring", 0.098, 0.07, (0, -0.005, 1.0), None, verts=28, radius_top=0.088, bevel=0.02)
    add(paint(sc, "scarf"), "acc_scarf", ["chest", "neck"])
    add(box("scarf_tail", (0.07, 0.03, 0.17), (0.05, -0.12, 0.89), "scarf", bevel=0.014, sub=1, rot=(-8, 0, -6)), "acc_scarf", ["chest"])
    add(box("scarf_knot", (0.08, 0.05, 0.05), (0.04, -0.105, 0.975), "scarf", bevel=0.02, sub=1), "acc_scarf", ["chest"])
    build_guitar()
    # headphones
    band = []
    for i in range(17):
        a = math.pi * i / 16
        band.append(Vector((math.cos(a) * 0.215, 0.01, 1.255 + math.sin(a) * 0.235)))
    for i in range(16):
        add(seg_cylinder(f"band{i}", band[i], band[i + 1], 0.016, 0.016, "acc2", verts=10), "acc_headphones", "head")
    for s in (-1, 1):
        cup = blib.cylinder(f"cup{s}", 0.062, 0.05, (s * 0.205, 0.01, 1.235), None, verts=28, rot=(0, 90, 0), bevel=0.012)
        add(paint(cup, "acc2"), "acc_headphones", "head")
        pad = blib.cylinder(f"cupfront{s}", 0.045, 0.012, (s * 0.235, 0.01, 1.235), None, verts=24, rot=(0, 90, 0))
        add(paint(pad, "acc1"), "acc_headphones", "head")


# ------------------------------------------------------------------ skinning

def build_guitar():
    """Own acoustic guitar, held across the belly (rigid on the chest bone)."""
    parts = []
    lower = blib.sphere("gtr_lower", 0.13, (0, 0, 0), None, scale=(1.0, 0.36, 1.0), segments=32, rings=14)
    upper = blib.sphere("gtr_upper", 0.098, (0, 0, 0.14), None, scale=(1.0, 0.36, 1.0), segments=32, rings=14)
    parts += [paint(lower, "guitar"), paint(upper, "guitar")]
    hole = blib.cylinder("gtr_hole", 0.034, 0.006, (0, -0.046, 0.1), None, verts=24, rot=(90, 0, 0))
    parts.append(paint(hole, "guitar_dark"))
    parts.append(box("gtr_bridge", (0.07, 0.012, 0.014), (0, -0.047, -0.04), "guitar_dark", bevel=0.003, sub=0))
    parts.append(box("gtr_neck", (0.04, 0.025, 0.36), (0, -0.01, 0.39), "guitar_dark", bevel=0.006, sub=0))
    parts.append(box("gtr_head", (0.055, 0.02, 0.09), (0, -0.01, 0.61), "guitar_dark", bevel=0.008, sub=0))
    for k in range(3):
        for sgn in (-1, 1):
            parts.append(ball(f"gtr_peg{k}{sgn}", 0.008, (sgn * 0.035, -0.01, 0.585 + k * 0.025), "metal", seg=8, rings=4))
    for k in range(4):
        x = -0.012 + k * 0.008
        parts.append(seg_cylinder(f"gtr_str{k}", (x, -0.024, -0.04), (x, -0.024, 0.57), 0.0012, 0.0012, "metal", verts=4))
    g = blib.join(parts, "guitar_obj")
    # across the belly: neck to the character's left and up, face out
    g.rotation_euler = (math.radians(-12), math.radians(-62), math.radians(0))
    g.location = (-0.04, -0.17, 0.72)
    add(g, "acc_guitar", "chest")


def dist_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


def skin(rig):
    groups = {}
    for obj, group, bones in PARTS:
        blib.apply_all(obj)
        if bones == "head":
            for v in obj.data.vertices:
                w = obj.matrix_world @ v.co
                v.co = obj.matrix_world.inverted() @ Vector(head_xyz(w.x, w.y, w.z))
        names = [bones] if isinstance(bones, str) else list(bones)
        for n in names:
            obj.vertex_groups.new(name=n)
        mw = obj.matrix_world
        for v in obj.data.vertices:
            if len(names) == 1:
                obj.vertex_groups[names[0]].add([v.index], 1.0, "REPLACE")
                continue
            p = mw @ v.co
            ws = []
            for n in names:
                a, b = BONES[n]
                d = dist_to_segment(p, a, b)
                ws.append(1.0 / (d ** 4 + 1e-7))
            order = sorted(range(len(ws)), key=lambda k: -ws[k])[:2]
            tot = sum(ws[k] for k in order)
            for k in order:
                w = ws[k] / tot
                if w > 0.02:
                    obj.vertex_groups[names[k]].add([v.index], w, "REPLACE")
        groups.setdefault(group, []).append(obj)
    meshes = []
    for group, objs in groups.items():
        o = blib.join(objs, group) if len(objs) > 1 else objs[0]
        o.name = group
        o.data.name = group
        if group != "face":
            # budget: ~16k triangles per visible avatar (16 avatars < 300k triangles)
            dec = o.modifiers.new("decimate", "DECIMATE")
            dec.ratio = 0.45 if group in ("body",) or group.startswith("hair_") else (0.75 if group == "acc_guitar" else 0.6)
            blib.apply_all(o)
        o.parent = rig
        mod = o.modifiers.new("rig", "ARMATURE")
        mod.object = rig
        meshes.append(o)
    return meshes


def add_face_morphs(face):
    me = face.data
    face.shape_key_add(name="Basis", from_mix=False)
    blink = face.shape_key_add(name="blink", from_mix=False)
    mouth_open = face.shape_key_add(name="mouthOpen", from_mix=False)
    # blink: squash eye parts (white, iris, shine) vertically around each eye centre
    for i, v in enumerate(me.vertices):
        co = v.co
        lo, hi = head_xyz(0, 0, 1.19)[2], head_xyz(0, 0, 1.32)[2]
        if co.z > lo and co.z < hi and abs(co.x) > 0.02 and abs(co.x) < 0.15 and co.y < -0.1:
            cz = head_xyz(0, 0, 1.25)[2]
            k = 0.08
            blink.data[i].co = Vector((co.x, co.y + 0.004, cz - 0.012 + (co.z - cz) * k))
    # mouth: rebuild the outline with the open shape
    top0, bot0 = mouth_shape(0)
    top1, bot1 = mouth_shape(1)
    ring0 = top0 + list(reversed(bot0[1:-1]))
    ring1 = top1 + list(reversed(bot1[1:-1]))
    for i, v in enumerate(me.vertices):
        co = v.co
        if co.z < head_xyz(0, 0, 1.18)[2] and co.z > head_xyz(0, 0, 1.08)[2] and abs(co.x) < 0.066 and co.y < -0.1:
            # find matching outline point by x/z of the closed shape
            best, bd = None, 1e9
            for k, (x, z) in enumerate(ring0):
                hx, _, hz = head_xyz(x, 0, 1.148 + z)
                d = (hx - co.x) ** 2 + (hz - co.z) ** 2
                if d < bd:
                    bd, best = d, k
            x1, z1 = ring1[best]
            dx = (x1 - ring0[best][0]) * HEAD_K
            dz = (z1 - ring0[best][1]) * HEAD_K
            mouth_open.data[i].co = Vector((co.x + dx, co.y - 0.004 * (1 if co.y < -0.15 else 0), co.z + dz))


# ------------------------------------------------------------------ animation

def rest_rot(rig, name):
    return rig.data.bones[name].matrix_local.to_quaternion()


def q_from(deg):
    rx, ry, rz = (math.radians(a) for a in deg)
    return Euler((rx, ry, rz), "XYZ").to_quaternion()


def key_pose(rig, frame, pose, hips=(0, 0, 0)):
    """pose: bone -> (rx, ry, rz) degrees about armature-space axes (rest-aligned)."""
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        b = rest_rot(rig, pb.name)
        q = q_from(pose.get(pb.name, (0, 0, 0)))
        pb.rotation_quaternion = b.inverted() @ q @ b
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        if pb.name == "hips":
            pb.location = b.inverted() @ Vector(hips)
        else:
            pb.location = (0, 0, 0)
        pb.keyframe_insert("location", frame=frame)
        pb.scale = (1, 1, 1)
        pb.keyframe_insert("scale", frame=frame)


def make_action(rig, name, keys, interp="BEZIER"):
    """keys: list of (frame, pose_dict, hips_offset)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for frame, pose, hips in keys:
        key_pose(rig, frame, pose, hips)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.easing = "AUTO"
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, int(keys[0][0]), act)
    track.mute = True
    rig.animation_data.action = None
    return act


def mirror(p):
    """Swap .L/.R and mirror rotations across the YZ plane (negate Y and Z rotations)."""
    out = {}
    for k, (x, y, z) in p.items():
        if k.endswith(".L"):
            k2 = k[:-2] + ".R"
        elif k.endswith(".R"):
            k2 = k[:-2] + ".L"
        else:
            k2 = k
        out[k2] = (x, -y, -z)
    return out


def merge(*ps):
    out = {}
    for p in ps:
        for k, v in p.items():
            if k in out:
                out[k] = tuple(a + b for a, b in zip(out[k], v))
            else:
                out[k] = v
    return out


# arms hang a bit closer than the modelled rest (A pose 72 deg); sides relax them
ARMS_DOWN = {"upper_arm.L": (2, 4, 0), "upper_arm.R": (2, -4, 0), "forearm.L": (-12, 0, -4), "forearm.R": (-12, 0, 4),
             "hand.L": (0, 0, -6), "hand.R": (0, 0, 6)}


def side_rot(side, deg):
    """Raise an arm sideways: +deg lifts it away from the body (about the forward axis)."""
    return (0, deg if side == "L" else -deg, 0)


def build_animations(rig):
    # ---------------- idle (3 s loop): breathing, weight shift, small head motion
    idle = []
    for f, ph in ((1, 0), (23, 1), (46, 2), (68, 3), (91, 4)):
        s = math.sin(ph * math.pi / 2)
        idle.append((f, merge(ARMS_DOWN, {
            "chest": (-1.5 * s, 0, 0),
            "spine": (0.8 * s, 0, 1.5 * s),
            "head": (1.5 * s, 0, -3 * s),
            "upper_arm.L": (2 * s, -2, 0), "upper_arm.R": (-1.5 * s, 2, 0),
            "forearm.L": (-4, 0, 0), "forearm.R": (-4, 0, 0),
            "hips": (0, 0, 1.2 * s),
        }), (0, 0, -0.004 * abs(s))))
    make_action(rig, "idle", idle)

    # ---------------- walk (1.0 s cycle, ~0.95 m/s at speedRatio 1)
    def walk_pose(phase, stride=26, knee=52, arm=20, bob=0.022, lean=4):
        # phase 0..1; left foot contact at 0, right at 0.5
        p = {}
        hz = 0.0
        for side, off in (("L", 0.0), ("R", 0.5)):
            t = (phase + off) % 1.0
            if t < 0.5:  # stance: thigh goes forward -> back linearly
                u = t / 0.5
                th = -stride + 2 * stride * u
                kn = 6 + 10 * math.sin(u * math.pi)
                ft = -12 * (1 - u) + 14 * u if u > 0.15 else -12
                ft = (-12 + 26 * u) if u > 0.6 else (-4 if u > 0.15 else -12)
            else:  # swing: back -> forward with knee lift
                u = (t - 0.5) / 0.5
                th = stride - 2 * stride * (0.5 - 0.5 * math.cos(u * math.pi))
                kn = knee * math.sin(u * math.pi) ** 0.9 + 4
                ft = 18 * (1 - u) - 10 * u
            p[f"thigh.{side}"] = (th, 0, 0)
            p[f"shin.{side}"] = (kn, 0, 0)
            p[f"foot.{side}"] = (-kn * 0.35 + ft * 0.6 - th * 0.25, 0, 0)
            # arms swing opposite to the leg on the same side
            p[f"upper_arm.{side}"] = (-th * arm / stride, 0, 0)
            p[f"forearm.{side}"] = (-14 - 6 * max(0, -th / stride), 0, 0)
        hz = -bob * math.cos(phase * 4 * math.pi)
        p["hips"] = (lean, 0, 6 * math.sin(phase * 2 * math.pi))
        p["chest"] = (0, 0, -8 * math.sin(phase * 2 * math.pi))
        p["head"] = (-lean, 0, 2 * math.sin(phase * 2 * math.pi))
        return p, (0, 0, hz - 0.012)

    walk = []
    for i in range(9):
        ph = i / 8
        pose, hz = walk_pose(ph)
        walk.append((1 + ph * 30, pose, hz))
    make_action(rig, "walk", walk)

    # ---------------- run (0.6 s cycle, ~2.9 m/s)
    run = []
    for i in range(9):
        ph = i / 8
        pose, hz = walk_pose(ph, stride=40, knee=95, arm=34, bob=0.045, lean=12)
        for side in ("L", "R"):
            x, y, z = pose[f"forearm.{side}"]
            pose[f"forearm.{side}"] = (-75, 0, 0)
        run.append((1 + ph * 18, pose, (hz[0], hz[1], hz[2] - 0.03)))
    make_action(rig, "run", run)

    # ---------------- sitting
    # seated: thighs slope down to the knee so the feet rest flat on the floor, hands on the knees
    SIT = {
        "thigh.L": (-66, 0, -5), "thigh.R": (-66, 0, 5),
        "shin.L": (64, 0, 0), "shin.R": (64, 0, 0),
        "foot.L": (2, 0, 0), "foot.R": (2, 0, 0),
        "spine": (-6, 0, 0), "chest": (-4, 0, 0), "head": (6, 0, 0),
        "upper_arm.L": (-34, 4, 0), "upper_arm.R": (-34, -4, 0),
        "forearm.L": (-30, 0, -6), "forearm.R": (-30, 0, 6),
        "hand.L": (-25, 0, 0), "hand.R": (-25, 0, 0),
    }
    SIT_HIPS = (0, 0.15, -0.135)
    CROUCH = merge(SIT, {"spine": (24, 0, 0), "chest": (10, 0, 0), "head": (-12, 0, 0)})
    make_action(rig, "sitDown", [
        (1, ARMS_DOWN, (0, 0, 0)),
        (12, merge(CROUCH, {"thigh.L": (30, 0, 0), "thigh.R": (30, 0, 0), "shin.L": (-22, 0, 0), "shin.R": (-22, 0, 0)}), (0, 0.06, -0.07)),
        (22, CROUCH, (0, 0.13, -0.12)),
        (30, SIT, SIT_HIPS),
    ])
    sit = []
    for f, ph in ((1, 0), (31, 1), (61, 2)):
        s = math.sin(ph * math.pi / 2) if ph != 2 else 0
        sit.append((f, merge(SIT, {"chest": (-1.5 * s, 0, 0), "head": (1.5 * s, 0, 2 * s)}), SIT_HIPS))
    make_action(rig, "sit", sit)
    make_action(rig, "standUp", [
        (1, SIT, SIT_HIPS),
        (9, CROUCH, (0, 0.12, -0.07)),
        (18, merge(CROUCH, {"thigh.L": (40, 0, 0), "thigh.R": (40, 0, 0), "shin.L": (-30, 0, 0), "shin.R": (-30, 0, 0)}), (0, 0.04, -0.04)),
        (26, ARMS_DOWN, (0, 0, 0)),
    ])

    def strip_arms(p):
        return {k: v for k, v in p.items() if not k.startswith(("upper_arm", "forearm", "hand"))}

    SEATED_BASE = merge(strip_arms(SIT), ARMS_DOWN)

    # ---------------- wave (right hand)
    def wave_keys(base, rest, hips):
        def wave_pose(w):
            return merge(base, {
                "upper_arm.R": (-20, 0, 0), "forearm.R": (-60, 0, 0),
                "chest": (0, 0, -6), "head": (0, 4, -6),
            }, {"upper_arm.R": (0, 125, 0), "hand.R": (0, w, 0)}, {"forearm.R": (0, w * 0.6, 0)})
        keys = [(1, rest, hips)]
        for k, f in enumerate(range(9, 50, 8)):
            keys.append((f, wave_pose(22 if k % 2 == 0 else -22), hips))
        keys.append((58, rest, hips))
        return keys

    # ---------------- clap (hands meet in front of the chest, 3 claps per second)
    def clap_keys(base, rest, hips):
        open_ = merge(base, {"upper_arm.L": (-45, 0, 0), "upper_arm.R": (-45, 0, 0), "forearm.L": (-70, 0, 10), "forearm.R": (-70, 0, -10)}, {"upper_arm.L": (0, -12, 0), "upper_arm.R": (0, 12, 0)})
        shut = merge(base, {"upper_arm.L": (-45, 0, 0), "upper_arm.R": (-45, 0, 0), "forearm.L": (-70, 0, -38), "forearm.R": (-70, 0, 38)}, {"upper_arm.L": (0, -4, 0), "upper_arm.R": (0, 4, 0)})
        keys = [(1, rest, hips), (6, open_, hips)]
        f = 6
        for _ in range(5):
            keys.append((f + 3, shut, (hips[0], hips[1], hips[2] - 0.005)))
            keys.append((f + 6, open_, hips))
            f += 6
        keys.append((f + 8, rest, hips))
        return keys

    # ---------------- laugh (lean back, shake, hands to belly)
    def laugh_keys(base, rest, hips):
        belly = merge(base, {"upper_arm.L": (-25, -6, 0), "upper_arm.R": (-25, 6, 0), "forearm.L": (-80, 0, -32), "forearm.R": (-80, 0, 32)})
        keys = [(1, rest, hips)]
        for k, f in enumerate(range(7, 52, 5)):
            sgn = 1 if k % 2 == 0 else -1
            keys.append((f, merge(belly, {"spine": (-8, 0, 0), "chest": (-6 + 3 * sgn, 0, 0), "head": (-14 + 4 * sgn, 0, 3 * sgn)}), (hips[0], hips[1], hips[2] - (0.006 if sgn > 0 else 0))))
        keys.append((60, rest, hips))
        return keys

    make_action(rig, "wave", wave_keys(ARMS_DOWN, ARMS_DOWN, (0, 0, 0)))
    make_action(rig, "clap", clap_keys(ARMS_DOWN, ARMS_DOWN, (0, 0, 0)))
    make_action(rig, "laugh", laugh_keys(ARMS_DOWN, ARMS_DOWN, (0, 0, 0)))
    make_action(rig, "sitWave", wave_keys(SEATED_BASE, SIT, SIT_HIPS))
    make_action(rig, "sitClap", clap_keys(SEATED_BASE, SIT, SIT_HIPS))
    make_action(rig, "sitLaugh", laugh_keys(SEATED_BASE, SIT, SIT_HIPS))

    # ---------------- dance (hip sway + arm pumps, 2 beats per second)
    dance = []
    for k in range(9):
        f = 1 + k * 7.5
        sgn = 1 if k % 2 == 0 else -1
        dance.append((f, merge(ARMS_DOWN, {
            "hips": (0, 8 * sgn, 10 * sgn), "spine": (0, -6 * sgn, -6 * sgn), "chest": (0, -4 * sgn, -6 * sgn), "head": (0, 6 * sgn, 0),
            "thigh.L": (-12 if sgn > 0 else -2, 0, 0), "shin.L": (20 if sgn > 0 else 6, 0, 0),
            "thigh.R": (-2 if sgn > 0 else -12, 0, 0), "shin.R": (6 if sgn > 0 else 20, 0, 0),
            "upper_arm.L": (-30, 0, 0), "upper_arm.R": (-30, 0, 0),
            "forearm.L": (-95 if sgn > 0 else -40, 0, 0), "forearm.R": (-40 if sgn > 0 else -95, 0, 0),
        }, {"upper_arm.L": (0, -45 if sgn > 0 else -20, 0), "upper_arm.R": (0, 20 if sgn > 0 else 45, 0)}), (0.03 * sgn, 0, -0.03 if k % 2 == 0 else -0.005)))
    make_action(rig, "dance", dance)

    # ---------------- jump (Zipla) with arms up
    up = merge({"upper_arm.L": (0, -150, 0), "upper_arm.R": (0, 150, 0), "forearm.L": (-15, 0, 0), "forearm.R": (-15, 0, 0)})
    crouch = merge(ARMS_DOWN, {"thigh.L": (-35, 0, 0), "thigh.R": (-35, 0, 0), "shin.L": (60, 0, 0), "shin.R": (60, 0, 0), "foot.L": (-25, 0, 0), "foot.R": (-25, 0, 0), "spine": (14, 0, 0), "upper_arm.L": (30, 0, 0), "upper_arm.R": (30, 0, 0)})
    make_action(rig, "jump", [
        (1, ARMS_DOWN, (0, 0, 0)),
        (8, crouch, (0, 0, -0.1)),
        (13, merge(up, {"foot.L": (30, 0, 0), "foot.R": (30, 0, 0)}), (0, 0, 0.12)),
        (18, merge(up, {"thigh.L": (-20, 0, 0), "thigh.R": (-20, 0, 0), "shin.L": (35, 0, 0), "shin.R": (35, 0, 0)}), (0, 0, 0.26)),
        (24, merge(up, {"foot.L": (10, 0, 0), "foot.R": (10, 0, 0)}), (0, 0, 0.05)),
        (28, crouch, (0, 0, -0.08)),
        (36, ARMS_DOWN, (0, 0, 0)),
    ])

    # ---------------- cheer (arms up, fists pumping) standing and seated
    def cheer_keys(base, hips):
        keys = [(1, base, hips)]
        for k, f in enumerate(range(7, 56, 6)):
            sgn = 1 if k % 2 == 0 else -1
            keys.append((f, merge(base, {
                "upper_arm.L": (-10, -150 + 12 * sgn, 0), "upper_arm.R": (-10, 150 - 12 * sgn, 0),
                "forearm.L": (-30 - 25 * (sgn > 0), 0, 0), "forearm.R": (-30 - 25 * (sgn < 0), 0, 0),
                "head": (-10, 0, 4 * sgn), "chest": (-6, 0, 0),
            }), (hips[0], hips[1], hips[2] + (0.015 if sgn > 0 else 0))))
        keys.append((62, base, hips))
        return keys

    make_action(rig, "cheer", cheer_keys(ARMS_DOWN, (0, 0, 0)))
    make_action(rig, "sitCheer", cheer_keys(SEATED_BASE, SIT_HIPS))

    # ---------------- guitar (seated and standing): left hand on the neck, right hand strumming
    def guitar_keys(base, rest, hips):
        hold = merge(base, {
            "upper_arm.L": (-30, -18, 0), "forearm.L": (-95, 0, -30), "hand.L": (0, 0, -20),
            "upper_arm.R": (-12, 10, 0), "forearm.R": (-78, 0, 38), "hand.R": (-10, 0, 0),
            "head": (12, 0, -10), "chest": (6, 0, 0),
        })
        keys = [(1, rest, hips), (8, hold, hips)]
        f = 8
        for k in range(12):
            sgn = 1 if k % 2 == 0 else -1
            keys.append((f + 4, merge(hold, {"forearm.R": (8 * sgn, 0, 0), "head": (2 * sgn, 0, 0)}), hips))
            f += 4
        keys.append((f + 4, hold, hips))
        return keys

    make_action(rig, "guitar", guitar_keys(ARMS_DOWN, ARMS_DOWN, (0, 0, 0)))
    make_action(rig, "sitGuitar", guitar_keys(SEATED_BASE, SIT, SIT_HIPS))
    # back to the rest pose (the exporter writes the current pose as node defaults)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


# ------------------------------------------------------------------ preview + export

def setup_preview(rig, out, variants=3):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(arg("--samples", 24))
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.resolution_x = int(arg("--w", 960))
    scene.render.resolution_y = int(arg("--h", 600))
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = blib.srgb("#2a2266")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    for name, loc, energy, color in (("key", (2.0, -3.0, 3.0), 600, "#ffe8d8"), ("rim", (-2.5, 2.5, 2.5), 500, "#8a7bff"), ("fill", (-2.0, -3.0, 1.5), 220, "#b9b0ff")):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = 2.0
        ld.color = blib.srgb(color)[:3]
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        blib.link(o)
    cam = bpy.data.cameras.new("cam")
    cam.lens = 50
    co = bpy.data.objects.new("cam", cam)
    blib.link(co)
    co.location = (0, -4.0, 0.8)
    co.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = co
    floor = blib.plane("floor", 20, 20, (0, 0, 0), mat=blib.principled("floorm", "#3d2f8a", 0.5))
    pose = arg("--pose")
    if pose:
        act = bpy.data.actions.get(pose)
        rig.animation_data.action = act
        scene.frame_set(int(arg("--frame", 10)))
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)


def main():
    blib.reset_scene()
    global MAT
    MAT = avatar_material()
    rig = build_armature()
    build_body()
    build_outfits()
    build_face()
    build_hair_and_accessories()
    meshes = skin(rig)
    face = bpy.data.objects["face"]
    add_face_morphs(face)
    build_animations(rig)
    print("meshes:", [(m.name, len(m.data.polygons)) for m in meshes])
    preview = arg("--preview")
    if preview:
        show = (arg("--show") or "hair_spiky,extra_hoodie").split(",")
        for m in meshes:
            if m.name.startswith(("hair_", "extra_", "acc_")):
                m.hide_render = m.name not in show
        setup_preview(rig, preview)
        return
    out = arg("--out")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_skins=True,
        export_morph=True,
        export_morph_normal=False,
        export_def_bones=False,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )
    print("exported ->", out)


if __name__ == "__main__":
    main()
