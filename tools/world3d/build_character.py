"""Descall 3D world, phase 1: the stylized avatar, built and animated from code.

Target: docs/design/3d-world/scene-5.jpg (rounded proportions, big head and eyes,
hoodie or zip jacket, rolled jeans, sneakers). Everything here is original work:
primitive / metaball modelling, a 20 bone rig with computed skin weights, and
hand-keyed animation clips (idle, walk, run, sitDown, sit, standUp, wave, dance,
clap, laugh, jump, cheer, sitCheer).

All meshes share one material whose base colour is a small palette texture
(8 x 8 cells, plus three stripe strips in row 7). Every part's UVs point at one
cell, so the client recolours an avatar by drawing a new 64 x 64 palette.

Phase 5 ("Karakterini oluştur"): every catalog item is its own mesh group, named
by its catalog id (backend/lib/world3d/cosmetics.js): body, hair_* (six styles,
each with a *_hat variant worn under a cap or beanie), top_* (six outfits),
acc_* (six accessories + the guitar prop) and face_* (six faces, each with its own
blink / mouthOpen morphs). All share one skin, so the client merges the visible
body / hair / top / accessory groups into one skinned mesh (one draw call) and
shows one face mesh (frontend/src/world3d/engine/avatars.js applyLook).

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
    # phase 5 (customisation): trims, patches, faces, hair ties
    "trim": 30, "trim_stripe": 31, "patch": 32, "teeth": 33, "freckle": 34, "acc_dark": 35,
    "hair_tie": 36, "coat_dark": 37, "lash": 38, "torso_stripe": 39, "hair_hi": 40, "tongue": 41, "cuff": 42,
}
DEFAULT_COLORS = {
    "skin": "#f2b58f", "top": "#d9dbe3", "top_dark": "#b9bcc8", "inner": "#f1e9da", "pants": "#2c3566",
    "pants_cuff": "#4a5590", "shoe": "#f3f3f3", "sole": "#e9e9ea", "shoe_accent": "#3f8a6a", "hair": "#1d2236",
    "eye_white": "#fbfbff", "iris": "#2a1c16", "mouth": "#7a2c35", "brows": "#1d2236", "acc1": "#c94a4a",
    "acc2": "#f5f5f5", "highlight": "#ffffff", "sock": "#f4f4f4", "nose": "#eda687", "lens": "#1b1b22",
    "sleeve": "#d9dbe3", "sleeve_stripe": "#d9dbe3", "stripe": "#f1e9da", "blush": "#f29a8e", "pack": "#3b4a7a",
    "scarf": "#5cc0c8", "guitar": "#d9954a", "guitar_dark": "#4a2a1a", "metal": "#c9ccd6", "sole_band": "#e9e9ea",
    "trim": "#f1ece4", "trim_stripe": "#b23a3a", "patch": "#f1ece4", "teeth": "#fbfaf7", "freckle": "#c97a5c",
    "acc_dark": "#8f2f35", "hair_tie": "#e2556b", "coat_dark": "#1f7d76", "lash": "#1b1420", "torso_stripe": "#d9dbe3",
    "hair_hi": "#3a4160", "tongue": "#e0707a", "cuff": "#b9bcc8",
}

# Row 7 of the palette (y 56..63) holds three horizontal colour strips, two pixels tall each.
# Striped cloth maps U to the height of the vertex, so the stripes are crisp texels at any
# mesh density (no jagged polygon bands) and the client recolours them like any cell.
STRIP_Y = {"torso": 57, "sleeve": 59, "shirt": 61}
STRIP_PAIRS = {"torso": ("top", "torso_stripe"), "sleeve": ("sleeve", "sleeve_stripe"), "shirt": ("inner", "stripe")}
STRIP_Z0, STRIP_Z1 = 0.5, 1.06
STRIP_PERIOD_PX = 8  # 4 px of each colour: a 3.5 cm stripe

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
    for strip, y in STRIP_Y.items():
        a, b = (DEFAULT_COLORS[c].lstrip("#") for c in STRIP_PAIRS[strip])
        ca = [int(a[k:k + 2], 16) / 255 for k in (0, 2, 4)]
        cb = [int(b[k:k + 2], 16) / 255 for k in (0, 2, 4)]
        for x in range(64):
            arr[y - 1:y + 1, x, :3] = ca if (x // (STRIP_PERIOD_PX // 2)) % 2 == 0 else cb
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


def paint_strip(obj, strip):
    """Stripes through the palette strips: U follows the height of every vertex (see STRIP_Y)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    bpy.context.view_layer.update()
    mw = obj.matrix_world
    v = 1.0 - STRIP_Y[strip] / 64.0
    uv = me.uv_layers.active.data
    for loop in me.loops:
        z = (mw @ me.vertices[loop.vertex_index].co).z
        u = (z - STRIP_Z0) / (STRIP_Z1 - STRIP_Z0)
        uv[loop.index].uv = (min(0.996, max(0.004, u)), v)
    blib.set_mat(obj, MAT)
    obj["strip"] = strip
    return obj


def restripe(obj):
    """Subdivision, bevels, cloth folds and decimation all bend interpolated UVs: once the
    mesh is final, every loop that points at a stripe strip gets U from its height again,
    so stripes stay straight and evenly spaced."""
    me = obj.data
    if not me.uv_layers:
        return
    vs = {round(1.0 - y / 64.0, 4): y for y in STRIP_Y.values()}
    mw = obj.matrix_world
    uv = me.uv_layers.active.data
    for loop in me.loops:
        v = round(uv[loop.index].uv[1], 4)
        if v not in vs:
            continue
        z = (mw @ me.vertices[loop.vertex_index].co).z
        u = (z - STRIP_Z0) / (STRIP_Z1 - STRIP_Z0)
        uv[loop.index].uv = (min(0.996, max(0.004, u)), uv[loop.index].uv[1])


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




def ball(name, r, loc, cell, scale=(1, 1, 1), seg=None, rings=None, rot=(0, 0, 0)):
    # tiny parts (snaps, shines, freckles) do not need 24 x 12 spheres: smaller GLB, same look
    if seg is None:
        seg = 10 if r < 0.012 else (16 if r < 0.026 else 24)
    if rings is None:
        rings = max(6, seg // 2)
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
    torso = paint_strip(box("torso", (0.34, 0.23, 0.42), (0, 0.0, 0.825), "top", bevel=0.1, sub=2, seg=4), "torso")
    folds(torso, 0.006)
    add(torso, "body", ["hips", "spine", "chest"])
    add(box("hem", (0.365, 0.24, 0.05), (0, 0.0, 0.635), "top_dark", bevel=0.022, sub=1), "body", ["hips"])
    # pelvis (pants)
    add(box("pelvis", (0.31, 0.21, 0.15), (0, 0.0, 0.625), "pants", bevel=0.06, sub=1), "body", ["hips"])
    for side in ("L", "R"):
        s = 1 if side == "L" else -1
        sh, el, wr, he = arm_points(side)
        # sleeves: own palette cells so a vest look can show a striped long-sleeve shirt
        add(paint_strip(ball(f"shoulder.{side}", 0.064, sh + Vector((s * 0.004, 0, -0.012)), "top"), "sleeve"), "body", ["chest", f"upper_arm.{side}"])
        add(paint_strip(seg_cylinder(f"uarm.{side}", sh, el, 0.058, 0.052, "top", segs=6), "sleeve"), "body", ["chest", f"upper_arm.{side}", f"forearm.{side}"])
        add(paint_strip(ball(f"elbow.{side}", 0.052, el, "top"), "sleeve"), "body", [f"upper_arm.{side}", f"forearm.{side}"])
        add(paint_strip(seg_cylinder(f"farm.{side}", el, wr - (wr - el).normalized() * 0.03, 0.052, 0.048, "top", segs=6), "sleeve"), "body", [f"upper_arm.{side}", f"forearm.{side}"])
        add(seg_cylinder(f"cuff.{side}", wr - (wr - el).normalized() * 0.048, wr + (wr - el).normalized() * 0.004, 0.054, 0.054, "cuff"), "body", f"forearm.{side}")
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


def ring(name, r_xy, z, height, cell, center=(0.0, 0.0), verts=32, thickness=0.012, scale_y=1.0, bevel=0.0):
    """Open band around the body (collar, hem, cuff stripe): a short tube with real thickness."""
    o = blib.cylinder(name, r_xy, height, (center[0], center[1], z), None, verts=verts, cap=False)
    o.scale = (1.0, scale_y, 1.0)
    sol = o.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 0
    if bevel:
        bv = o.modifiers.new("bevel", "BEVEL")
        bv.width = bevel
        bv.segments = 2
    return paint(o, cell)


def arm_band(name, side, t0, t1, r, cell):
    """Band around the forearm between fractions t0..t1 from elbow to wrist."""
    sh, el, wr, he = arm_points(side)
    return seg_cylinder(name, el + (wr - el) * t0, el + (wr - el) * t1, r, r, cell, verts=20)


def open_front(group, inner="inner", zip_cell="top_dark", pull=True):
    """Open jacket front: the tee between two zip tapes and its neckline."""
    add(box(f"{group}_shirt", (0.13, 0.03, 0.38), (0, -0.108, 0.83), inner, bevel=0.012, sub=1), group, ["hips", "spine", "chest"])
    add(box(f"{group}_tee_neck", (0.14, 0.12, 0.04), (0, -0.04, 0.985), inner, bevel=0.02, sub=1), group, ["chest"])
    for s in (-1, 1):
        add(box(f"{group}_zip{s}", (0.008, 0.012, 0.36), (s * 0.068, -0.118, 0.83), zip_cell, bevel=0.003, sub=0), group, ["hips", "spine", "chest"])
    if pull:
        add(box(f"{group}_pull", (0.012, 0.012, 0.035), (0.068, -0.126, 0.67), "metal", bevel=0.004, sub=0), group, ["hips"])


def letter_d(group, cx, cz, y, h, cell):
    """The varsity chest letter: a 'D' (Descall) from a stem and a half ring."""
    x0 = cx - h * 0.28
    add(box(f"{group}_d_stem", (0.011, 0.008, h), (x0, y, cz), cell, bevel=0.003, sub=0), group, ["chest"])
    bm = bmesh.new()
    segs, tube, rr = 14, 0.0055, h * 0.5 - 0.004
    rings = []
    for i in range(segs + 1):
        a = -math.pi / 2 + math.pi * i / segs
        c = Vector((x0 + math.cos(a) * rr * 1.1, y, cz + math.sin(a) * rr))
        ring_v = []
        for j in range(6):
            bb = 2 * math.pi * j / 6
            n = Vector((math.cos(a) * math.cos(bb), math.sin(bb), math.sin(a) * math.cos(bb)))
            ring_v.append(bm.verts.new(c + n * tube))
        rings.append(ring_v)
    for i in range(segs):
        for j in range(6):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % 6], rings[i][(j + 1) % 6]))
    o = blib.mesh_from_bmesh(f"{group}_d_bowl", bm)
    blib.shade_smooth(o)
    add(paint(o, cell), group, ["chest"])


def hood_back(group, cell, scale=1.0, z=1.0):
    hood = box(f"{group}_hood", (0.3 * scale, 0.13 * scale, 0.12 * scale), (0, 0.085 + (scale - 1) * 0.05, z), cell, bevel=0.055, sub=1, rot=(-15, 0, 0))
    add(hood, group, ["chest", "neck"])
    rim = blib.cylinder(f"{group}_hood_ring", 0.1, 0.05, (0, -0.01, z), None, verts=24, radius_top=0.09)
    add(paint(rim, cell), group, ["chest", "neck"])


def quilt_ridge(name, z, a=0.176, b=0.121, p=2.7, tube=0.0095, gap=0.072):
    """Puffer vest seam: a soft tube that follows the torso's rounded-box section
    (superellipse) all the way round, open at the front between the zips."""
    pts = []
    n = 72
    for i in range(n + 1):
        th = -math.pi / 2 + 2 * math.pi * i / n  # starts at the front (-Y)
        c, s = math.cos(th), math.sin(th)
        x = a * math.copysign(abs(c) ** (2 / p), c)
        y = b * math.copysign(abs(s) ** (2 / p), s)
        if y < 0 and abs(x) < gap:
            continue
        pts.append(Vector((x, y, z)))
    # keep one open arc: rotate the list so it starts at the right zip and ends at the left
    k = max(range(len(pts)), key=lambda i: (pts[i] - pts[i - 1]).length)
    pts = pts[k:] + pts[:k]
    bm = bmesh.new()
    rings = []
    for i, pnt in enumerate(pts):
        nxt = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        t = nxt.normalized()
        side = t.cross(Vector((0, 0, 1))).normalized()
        ring_v = []
        for j in range(8):
            ang = 2 * math.pi * j / 8
            ring_v.append(bm.verts.new(pnt + side * (math.cos(ang) * tube * 1.15) + Vector((0, 0, math.sin(ang) * tube))))
        rings.append(ring_v)
    for i in range(len(rings) - 1):
        for j in range(8):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % 8], rings[i][(j + 1) % 8]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    o = blib.mesh_from_bmesh(name, bm)
    blib.shade_smooth(o)
    return paint(o, "top_dark")


def build_outfits():
    """Kiyafet items, one mesh group each (approved-ui-5.png): top_hoodie, top_bomber,
    top_varsity, top_vest, top_raincoat, top_striped. Torso and sleeves live in the body
    mesh; an item adds its own parts and the client sets the palette (sleeve, cuff and
    stripe colours) from the catalog (frontend/src/world3d/engine/look.js)."""
    # Kapusonlu: hood, kangaroo pocket with soft side openings, drawstrings
    g = "top_hoodie"
    hood_back(g, "top")
    add(box("pocket", (0.22, 0.03, 0.12), (0, -0.115, 0.715), "top", bevel=0.014, sub=1), g, ["hips", "spine"])
    add(box("pocket_line", (0.2, 0.02, 0.006), (0, -0.124, 0.77), "top_dark", bevel=0.002, sub=0), g, ["spine"])
    for s in (-1, 1):
        add(seg_cylinder(f"string{s}", (s * 0.035, -0.118, 0.98), (s * 0.04, -0.124, 0.86), 0.0055, 0.0055, "top_dark", verts=8), g, ["chest"])
        add(ball(f"string_tip{s}", 0.009, (s * 0.04, -0.124, 0.855), "top_dark", scale=(1, 1, 1.6)), g, ["chest"])

    # Bomber: open zip front over a tee, ribbed collar and hem, utility pocket on the left sleeve
    g = "top_bomber"
    open_front(g)
    add(ring("bomber_collar", 0.103, 1.0, 0.05, "trim", center=(0, -0.012), thickness=0.016, scale_y=0.95, bevel=0.004), g, ["chest", "neck"])
    add(box("bomber_hem", (0.372, 0.248, 0.06), (0, 0.0, 0.645), "trim", bevel=0.026, sub=1), g, ["hips"])
    for k in range(9):
        x = -0.16 + k * 0.04
        if abs(x) < 0.07:
            continue
        add(box(f"bomber_rib{k}", (0.006, 0.01, 0.05), (x, -0.124, 0.645), "top_dark", bevel=0.002, sub=0), g, ["hips"])
    sh, el, wr, he = arm_points("L")
    pc = sh + (el - sh) * 0.45 + Vector((0.052, -0.004, 0))
    add(box("bomber_pocket", (0.012, 0.06, 0.07), pc, "top_dark", bevel=0.005, sub=1, rot=(0, -8, 0)), g, ["upper_arm.L"])
    add(box("bomber_pocket_zip", (0.014, 0.05, 0.005), pc + Vector((0.002, 0, 0.026)), "metal", bevel=0.002, sub=0, rot=(0, -8, 0)), g, ["upper_arm.L"])
    add(ball("bomber_badge", 0.018, (-0.105, -0.122, 0.93), "patch", scale=(1, 0.3, 1)), g, ["chest"])

    # Kolej ceket (varsity): open front with snaps, striped rib trims, chest letter
    g = "top_varsity"
    open_front(g, pull=False)
    add(ring("var_collar", 0.103, 1.0, 0.052, "trim", center=(0, -0.012), thickness=0.016, scale_y=0.95, bevel=0.004), g, ["chest", "neck"])
    add(ring("var_collar_stripe", 0.108, 0.99, 0.01, "trim_stripe", center=(0, -0.012), thickness=0.008, scale_y=0.95), g, ["chest", "neck"])
    add(box("var_hem", (0.372, 0.248, 0.062), (0, 0.0, 0.645), "trim", bevel=0.026, sub=1), g, ["hips"])
    for k, z in enumerate((0.635, 0.656)):
        add(box(f"var_hem_stripe{k}", (0.378, 0.252, 0.008), (0, 0.0, z), "trim_stripe", bevel=0.003, sub=1), g, ["hips"])
    for side in ("L", "R"):
        for k, t in enumerate((0.78, 0.84)):
            add(arm_band(f"var_cuff_stripe{k}.{side}", side, t, t + 0.025, 0.0565, "trim_stripe"), g, [f"forearm.{side}"])
    for s in (-1, 1):
        for k, z in enumerate((0.7, 0.78, 0.86, 0.94)):
            add(ball(f"var_snap{s}{k}", 0.0085, (s * 0.083, -0.122, z), "metal", scale=(1, 0.45, 1)), g, ["spine", "chest"] if z > 0.8 else ["hips", "spine"])
    add(box("var_patch", (0.075, 0.012, 0.075), (-0.095, -0.118, 0.9), "patch", bevel=0.012, sub=1), g, ["chest"])
    letter_d(g, -0.095, 0.9, -0.126, 0.05, "trim_stripe")

    # Yelek: puffer vest over a long-sleeve shirt, quilted ridges, high collar, puffy armholes
    g = "top_vest"
    panel = box("vest_shirt", (0.13, 0.03, 0.38), (0, -0.108, 0.83), "inner", bevel=0.012, sub=2)
    add(paint_strip(panel, "shirt"), g, ["hips", "spine", "chest"])
    for k, z in enumerate((0.69, 0.77, 0.85, 0.93)):
        add(quilt_ridge(f"quilt{k}", z), g, ["hips", "spine", "chest"])
    for s in (-1, 1):
        add(box(f"vest_collar{s}", (0.12, 0.06, 0.07), (s * 0.075, -0.05, 0.985), "top", bevel=0.026, sub=1, rot=(0, 0, s * 12)), g, ["chest", "neck"])
        add(box(f"vest_zip{s}", (0.008, 0.012, 0.36), (s * 0.068, -0.118, 0.83), "top_dark", bevel=0.003, sub=0), g, ["hips", "spine", "chest"])
    add(box("vest_pull", (0.012, 0.012, 0.035), (0.068, -0.126, 0.67), "metal", bevel=0.004, sub=0), g, ["hips"])

    # Yagmurluk (raincoat): closed placket with snaps, hood down, flap pockets, long skirt
    g = "top_raincoat"
    hood_back(g, "top", scale=1.12, z=1.005)
    add(ring("rain_collar", 0.104, 1.0, 0.06, "top", center=(0, -0.008), thickness=0.016, scale_y=0.96, bevel=0.005), g, ["chest", "neck"])
    add(box("rain_placket", (0.034, 0.016, 0.5), (0, -0.12, 0.74), "coat_dark", bevel=0.006, sub=1), g, ["hips", "spine", "chest"])
    for k, z in enumerate((0.54, 0.65, 0.76, 0.87, 0.96)):
        add(ball(f"rain_snap{k}", 0.009, (0, -0.13, z), "metal", scale=(1, 0.5, 1)), g, ["hips"] if z < 0.62 else (["hips", "spine"] if z < 0.82 else ["spine", "chest"]))
    skirt = blib.cylinder("rain_skirt", 0.205, 0.22, (0, 0.0, 0.565), None, verts=40, radius_top=0.182, cap=False)
    skirt.scale = (1.0, 0.72, 1.0)
    bm = bmesh.new()
    bm.from_mesh(skirt.data)
    edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-6]
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=5, use_grid_fill=False)
    bm.to_mesh(skirt.data)
    bm.free()
    sol = skirt.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.012
    sol.offset = 0
    add(paint(skirt, "top"), g, ["hips", "thigh.L", "thigh.R"])
    add(ring("rain_hem", 0.208, 0.462, 0.022, "coat_dark", thickness=0.016, scale_y=0.72), g, ["hips", "thigh.L", "thigh.R"])
    for s in (-1, 1):
        add(box(f"rain_flap{s}", (0.09, 0.02, 0.03), (s * 0.1, -0.135, 0.6), "coat_dark", bevel=0.008, sub=1, rot=(-6, 0, 0)), g, ["hips"])
        add(box(f"rain_pocket{s}", (0.085, 0.012, 0.09), (s * 0.1, -0.128, 0.555), "top", bevel=0.01, sub=1), g, ["hips"])

    # Cizgili: striped long-sleeve tee (the stripes are the palette strip), ribbed crew neck
    g = "top_striped"
    add(ring("striped_neck", 0.098, 1.0, 0.035, "top_dark", center=(0, -0.012), thickness=0.012, scale_y=0.95, bevel=0.003), g, ["chest", "neck"])
    add(box("striped_hem", (0.358, 0.238, 0.03), (0, 0.0, 0.64), "top_dark", bevel=0.012, sub=1), g, ["hips"])


# ------------------------------------------------------------------ faces (Yuz items)
# Each face item is a full face mesh with its own blink / mouthOpen morphs (one draw call).
FACES = {
    "face_classic": {"brow": "soft", "mouth": "smile"},
    "face_lashes": {"brow": "arch", "mouth": "smile", "lashes": True},
    "face_bold": {"brow": "bold", "mouth": "smile"},
    "face_sleepy": {"brow": "flat", "mouth": "small", "lid": True},
    "face_grin": {"brow": "raised", "mouth": "grin"},
    "face_freckles": {"brow": "soft", "mouth": "smile", "freckles": True},
}
MOUTH_CZ, MOUTH_CY = 1.148, -0.153


def tag(obj, name):
    """Morph tag: vertex group '_blink' / '_mouth' marks the parts a morph may move."""
    vg = obj.vertex_groups.new(name=f"_{name}")
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    return obj


def head_surface_y(x, z, lift=0.0):
    """Front surface of the (unscaled) head at x, z: the sphere with the fuller jaw of build_body."""
    k = max(0.0, min(1.0, (1.25 - z) / 0.19))
    rx = 0.19 * 1.04 * (1 + 0.09 * k)
    ry = 0.19 * 0.98 * (1 + 0.05 * k)
    q = 1 - (x / rx) ** 2 - ((z - 1.25) / 0.19) ** 2
    return -ry * math.sqrt(max(0.0, q)) - lift


def brow_arc(name, s, x0, x1, z0, lift, r0, r1, group, steps=7):
    pts = []
    for i in range(steps):
        u = i / (steps - 1)
        x = s * (x0 + (x1 - x0) * u)
        z = z0 + lift * math.sin(math.pi * (0.15 + 0.75 * u)) - 0.006 * u
        pts.append(Vector((x, head_surface_y(x, z, 0.004), z)))
    for i in range(steps - 1):
        r = r0 + (r1 - r0) * (i / (steps - 2))
        add(seg_cylinder(f"{name}{i}", pts[i], pts[i + 1], r, r * 0.92, "brows", verts=10), group, "head")
        add(ball(f"{name}j{i}", r * 0.98, pts[i + 1], "brows", seg=10, rings=6), group, "head")
    add(ball(f"{name}j0", r0 * 0.98, pts[0], "brows", seg=10, rings=6), group, "head")


def build_brows(group, style):
    for s in (-1, 1):
        if style == "soft":
            add(box(f"{group}_brow{s}", (0.07, 0.02, 0.016), (s * 0.08, -0.166, 1.34), "brows", bevel=0.007, sub=1, rot=(-12, s * 3, -s * 9)), group, "head")
        elif style == "arch":
            brow_arc(f"{group}_brow{s}_", s, 0.048, 0.115, 1.33, 0.016, 0.0072, 0.0042, group)
        elif style == "bold":
            add(box(f"{group}_brow{s}", (0.084, 0.026, 0.026), (s * 0.079, -0.163, 1.336), "brows", bevel=0.011, sub=1, rot=(-12, 0, -s * 4)), group, "head")
        elif style == "flat":
            add(box(f"{group}_brow{s}", (0.068, 0.018, 0.014), (s * 0.08, -0.166, 1.347), "brows", bevel=0.006, sub=1, rot=(-12, 0, s * 4)), group, "head")
        elif style == "raised":
            add(box(f"{group}_brow{s}", (0.066, 0.02, 0.016), (s * 0.08, -0.164, 1.356), "brows", bevel=0.007, sub=1, rot=(-12, s * 3, -s * 15)), group, "head")


def build_eyes(group, lashes=False, lid=False):
    for s in (-1, 1):
        x = s * 0.077
        add(tag(ball(f"{group}_eye_white{s}", 0.048, (x, -0.15, 1.252), "eye_white", scale=(1.0, 0.55, 1.2)), "blink"), group, "head")
        add(tag(ball(f"{group}_iris{s}", 0.036, (x * 0.98, -0.175, 1.246), "iris", scale=(1.0, 0.42, 1.14)), "blink"), group, "head")
        add(tag(ball(f"{group}_shine{s}", 0.012, (x - s * 0.006 + 0.011, -0.191, 1.268), "highlight"), "blink"), group, "head")
        add(tag(ball(f"{group}_shine2{s}", 0.006, (x - s * 0.004 - 0.012, -0.19, 1.232), "highlight"), "blink"), group, "head")
        if lashes:
            # three lashes flicking out of the upper outer rim (scene-5, the girl with the bun)
            for k, ang in enumerate((28, 48, 68)):
                a = math.radians(ang)
                base = Vector((x + s * 0.046 * math.cos(a), -0.163 - 0.006 * math.sin(a), 1.252 + 0.057 * math.sin(a)))
                tip = base + Vector((s * math.cos(a) * 0.9, -0.35, math.sin(a) * 0.7 + 0.25)).normalized() * (0.02 - k * 0.002)
                add(tag(seg_cylinder(f"{group}_lash{s}{k}", base, tip, 0.0042, 0.0012, "lash", verts=8), "blink"), group, "head")
            # a soft upper lash line on the rim
            for k in range(6):
                a0 = math.radians(25 + k * 22)
                a1 = math.radians(25 + (k + 1) * 22)
                p0 = Vector((x + s * 0.049 * math.cos(a0), -0.158 - 0.012 * math.sin(a0), 1.252 + 0.058 * math.sin(a0)))
                p1 = Vector((x + s * 0.049 * math.cos(a1), -0.158 - 0.012 * math.sin(a1), 1.252 + 0.058 * math.sin(a1)))
                add(tag(seg_cylinder(f"{group}_lashline{s}{k}", p0, p1, 0.0036, 0.0036, "lash", verts=8), "blink"), group, "head")
        if lid:
            # relaxed upper lid: a skin cap over the top of the eye with a dark rim line
            cut = 0.014
            lid_obj = blib.sphere(f"{group}_lid{s}", 0.05, (x, -0.149, 1.252), None, scale=(1.03, 0.6, 1.22), segments=28, rings=16)
            bm = bmesh.new()
            bm.from_mesh(lid_obj.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z * 1.22 < cut], context="VERTS")
            bm.to_mesh(lid_obj.data)
            bm.free()
            add(paint(lid_obj, "skin"), group, "head")
            c = 0.05 * 1.22
            f = math.sqrt(max(0.0, 1 - (cut / c) ** 2))
            pts = []
            for k in range(13):
                ph = math.radians(-10 + k * 200 / 12)
                pts.append(Vector((x + 0.05 * 1.03 * f * math.cos(ph) * 1.01, -0.149 - 0.05 * 0.6 * f * math.sin(ph) - 0.0015, 1.252 + cut)))
            for k in range(12):
                add(seg_cylinder(f"{group}_lidline{s}{k}", pts[k], pts[k + 1], 0.0032, 0.0032, "lash", verts=8), group, "head")


def mouth_shape(open_amount, style="smile"):
    n = 18
    if style == "grin":
        o = 0.42 + 0.58 * open_amount
        w, curve_k = 0.043 * (1 + 0.12 * o), 0.017
    elif style == "small":
        o = open_amount
        w, curve_k = 0.028 * (1 + 0.18 * o), 0.011
    else:
        o = open_amount
        w, curve_k = 0.036 * (1 + 0.18 * o), 0.015
    top, bot = [], []
    for i in range(n + 1):
        t = -1 + 2 * i / n
        x = w * t
        curve = curve_k * t * t
        tz = curve + 0.0025 * (1 - t * t) + 0.004 * o * (1 - t * t)
        bz = curve - 0.0035 * (1 - t * t) - 0.036 * o * (1 - t * t) ** 0.8
        top.append((x, tz))
        bot.append((x, bz))
    return top, bot


def curve_front(v):
    """The mouth front follows the head curvature a little."""
    v.co.y += 0.35 * v.co.x * v.co.x / 0.19


def mouth_mesh(name, style="smile"):
    """Mouth outline, extruded into the head. Morph 'mouthOpen' (talking, laughing)."""
    cz, cy = MOUTH_CZ, MOUTH_CY
    bm = bmesh.new()
    top, bot = mouth_shape(0, style)
    ring_pts = top + list(reversed(bot[1:-1]))
    front = [bm.verts.new((x, cy - 0.006 + 0.012 * (x / 0.04) ** 2, cz + z)) for x, z in ring_pts]
    back = [bm.verts.new((x, cy + 0.012, cz + z)) for x, z in ring_pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    nring = len(ring_pts)
    for i in range(nring):
        j = (i + 1) % nring
        bm.faces.new((front[i], front[j], back[j], back[i]))
    obj = blib.mesh_from_bmesh(name, bm)
    for v in obj.data.vertices:
        curve_front(v)
    obj["ring"] = nring
    return paint(obj, "mouth")


def strip_band(name, pts_top, pts_bot, y_front, depth, cell):
    """Flat band between two polylines (x, z), facing -Y, with a little depth."""
    bm = bmesh.new()
    ft = [bm.verts.new((x, y_front + 0.012 * (x / 0.04) ** 2, z)) for x, z in pts_top]
    fb = [bm.verts.new((x, y_front + 0.012 * (x / 0.04) ** 2, z)) for x, z in pts_bot]
    bt = [bm.verts.new((x, y_front + depth, z)) for x, z in pts_top]
    bb = [bm.verts.new((x, y_front + depth, z)) for x, z in pts_bot]
    for i in range(len(pts_top) - 1):
        bm.faces.new((ft[i], ft[i + 1], fb[i + 1], fb[i]))
        bm.faces.new((bt[i + 1], bt[i], bb[i], bb[i + 1]))
    obj = blib.mesh_from_bmesh(name, bm)
    for v in obj.data.vertices:
        curve_front(v)
    return paint(obj, cell)


def build_mouth(group, style):
    add(tag(mouth_mesh(f"{group}_mouth", style), "mouth"), group, "head")
    if style != "grin":
        return
    top, bot = mouth_shape(0, style)
    cz, cy = MOUTH_CZ, MOUTH_CY
    sel = range(4, 15)
    # upper teeth just under the lip, tongue resting on the lower lip
    tt = [(top[i][0] * 0.96, cz + top[i][1] - 0.0012) for i in sel]
    tb = [(top[i][0] * 0.96, cz + top[i][1] - 0.0075 * (1 - ((i - 9) / 6.0) ** 2) - 0.0016) for i in sel]
    add(tag(strip_band(f"{group}_teeth", tt, tb, cy - 0.0068, 0.006, "teeth"), "mouth"), group, "head")
    mid_b = cz + bot[9][1]
    tongue = ball(f"{group}_tongue", 0.016, (0, cy - 0.0062, mid_b + 0.0058), "tongue", scale=(1.0, 0.25, 0.36), seg=20, rings=10)
    add(tag(tongue, "mouth"), group, "head")


def build_freckles(group):
    spots = [(0.095, 1.206), (0.112, 1.196), (0.128, 1.205), (0.104, 1.186), (0.12, 1.183), (0.088, 1.192), (0.136, 1.19)]
    for s in (-1, 1):
        for k, (x, z) in enumerate(spots):
            xx = s * x
            add(ball(f"{group}_frk{s}{k}", 0.0052 - 0.0006 * (k % 3), (xx, head_surface_y(xx, z, -0.0015), z), "freckle", scale=(1, 0.45, 1), seg=10, rings=6), group, "head")
    for k, x in enumerate((-0.016, 0.0, 0.017)):
        add(ball(f"{group}_frkn{k}", 0.0042, (x, -0.198, 1.212 + (0.004 if k == 1 else 0)), "freckle", scale=(1, 0.45, 1), seg=10, rings=6), group, "head")


def build_faces():
    for group, spec in FACES.items():
        build_eyes(group, lashes=spec.get("lashes", False), lid=spec.get("lid", False))
        build_brows(group, spec["brow"])
        build_mouth(group, spec["mouth"])
        if spec.get("freckles"):
            build_freckles(group)


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


def fringe_locks():
    """Forehead fringe for the tousled style (scene-5, second from the right)."""
    C = Vector((0, 0.0, 1.27))
    out = []
    for az, el, tilt in ((-38, 26, 18), (-15, 24, 10), (8, 25, -4), (30, 27, -14)):
        a, e = math.radians(az), math.radians(el)
        n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        pnt = C + n * 0.205
        t = Vector((math.sin(math.radians(tilt)) * 0.6, -0.25, -1.0))
        t = (t - n * t.dot(n)).normalized()
        q = Vector((0, 0, 1)).rotation_difference(t)
        out.append(("ELLIPSOID", tuple(pnt + n * 0.006 + t * 0.02), 0.05, (0.85, 0.6, 1.9), tuple(math.degrees(v) for v in q.to_euler("XYZ"))))
    # extra crown volume, standing up a little
    for az, el in ((-20, 70), (25, 66), (160, 55), (-150, 52)):
        a, e = math.radians(az), math.radians(el)
        n = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        out.append(("ELLIPSOID", tuple(C + n * 0.215), 0.07, (1.0, 0.8, 1.5), (0, 0, az)))
    return out


def curls():
    """Curly crown: balls on a Fibonacci sphere, the forehead and ears left free."""
    C = Vector((0, 0.02, 1.28))
    out = []
    n_pts = 86
    for i in range(n_pts):
        zf = 1 - 2 * (i + 0.5) / n_pts
        r = math.sqrt(1 - zf * zf)
        ph = i * math.pi * (3 - math.sqrt(5))
        n = Vector((math.cos(ph) * r, math.sin(ph) * r, zf))
        if n.z < -0.12:
            continue
        if n.y < -0.5 and n.z < 0.42:
            continue
        rad = 0.043 + 0.008 * ((i * 7) % 3) / 2
        out.append(("BALL", tuple(C + n * 0.208), rad, None))
    # a few curls falling on the forehead
    for x, z in ((-0.07, 1.385), (0.0, 1.4), (0.075, 1.38)):
        out.append(("BALL", (x, -0.155, z), 0.04, None))
    return out


HAIR_STYLES = ("hair_swept", "hair_fringe", "hair_bob", "hair_bun", "hair_ponytail", "hair_curly")


def hat_variant(src, name):
    """Hair worn under a cap or beanie: the crown is pulled inside the hat and cut away,
    the sides, fringe ends and tails stay. One extra small mesh per style."""
    me = src.data.copy()
    obj = bpy.data.objects.new(name, me)
    blib.link(obj)
    a = 0.205 * 1.04 * 0.97
    c = 0.205 * 0.85
    for v in me.vertices:
        z = v.co.z
        w = min(1.0, max(0.0, (z - 1.235) / 0.06))
        if w <= 0:
            continue
        w = w * w * (3 - 2 * w)
        dx, dy = v.co.x, v.co.y - 0.01
        r = math.hypot(dx, dy)
        lim = a * math.sqrt(max(0.05, 1 - (max(0.0, z - 1.3) / c) ** 2))
        if r > lim:
            k = (lim + (r - lim) * (1 - w)) / r
            v.co.x = dx * k
            v.co.y = 0.01 + dy * k
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > 1.33], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    blib.shade_smooth(obj)
    return paint(obj, "hair")


def build_hair():
    """Sac items: six styles (scene-5 + the draft's look) and their under-a-hat variants."""
    E = "ELLIPSOID"
    B = "BALL"
    meshes = {}
    # short swept hair (scene-5 boys): a cap plus soft locks lying on the scalp, all
    # sweeping from the crown towards the forehead and to one side, merged by the metaballs.
    swept = [
        (E, (0, 0.02, 1.345), 0.19, (1.06, 1.03, 0.84)),
        (E, (0, 0.07, 1.24), 0.17, (1.1, 0.95, 0.9)),
    ] + swept_locks()
    meshes["hair_swept"] = metaball_mesh("hair_swept", swept, "hair")
    fringe = [
        (E, (0, 0.02, 1.35), 0.195, (1.07, 1.04, 0.86)),
        (E, (0, 0.07, 1.24), 0.172, (1.1, 0.95, 0.92)),
    ] + swept_locks() + fringe_locks()
    meshes["hair_fringe"] = metaball_mesh("hair_fringe", fringe, "hair")
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
    meshes["hair_bun"] = metaball_mesh("hair_bun", bun, "hair")
    bob = [
        (E, (0, 0.02, 1.32), 0.2, (1.08, 1.05, 0.8)),
        (E, (0, 0.07, 1.16), 0.2, (1.14, 0.94, 1.3)),
        (E, (-0.165, -0.03, 1.12), 0.09, (0.72, 1.05, 2.4)),
        (E, (0.165, -0.03, 1.12), 0.09, (0.72, 1.05, 2.4)),
        (E, (-0.07, -0.135, 1.385), 0.08, (1.5, 0.7, 0.8), (0, 0, -12)),
        (E, (0.07, -0.135, 1.385), 0.08, (1.5, 0.7, 0.8), (0, 0, 12)),
    ]
    meshes["hair_bob"] = metaball_mesh("hair_bob", bob, "hair")
    pony = [
        (E, (0, 0.025, 1.335), 0.19, (1.05, 1.04, 0.82)),
        (E, (0, 0.08, 1.23), 0.165, (1.08, 0.95, 0.9)),
        (E, (-0.06, -0.13, 1.39), 0.075, (1.6, 0.7, 0.75), (0, 0, -15)),
        (E, (0.085, -0.122, 1.372), 0.068, (1.4, 0.7, 0.75), (0, 0, 24)),
        (E, (-0.15, -0.05, 1.24), 0.058, (0.6, 0.8, 1.6)),
        (E, (0.15, -0.05, 1.24), 0.058, (0.6, 0.8, 1.6)),
        (B, (0, 0.2, 1.33), 0.05, None),
        (E, (0, 0.238, 1.285), 0.062, (0.9, 0.9, 1.4), (24, 0, 0)),
        (E, (0, 0.262, 1.2), 0.068, (0.95, 0.9, 1.6), (10, 0, 0)),
        (E, (0, 0.268, 1.105), 0.058, (0.9, 0.85, 1.6), (-4, 0, 0)),
        (E, (0, 0.255, 1.03), 0.042, (0.8, 0.8, 1.4), (-16, 0, 0)),
    ]
    meshes["hair_ponytail"] = metaball_mesh("hair_ponytail", pony, "hair")
    meshes["hair_curly"] = metaball_mesh("hair_curly", [
        (E, (0, 0.02, 1.33), 0.185, (1.05, 1.03, 0.82)),
        (E, (0, 0.07, 1.23), 0.168, (1.09, 0.95, 0.9)),
    ] + curls(), "hair", resolution=0.0105)
    for name in HAIR_STYLES:
        src = meshes[name]
        hat = hat_variant(src, f"{name}_hat")
        add(src, name, "head")
        add(hat, f"{name}_hat", "head")
    # ponytail tie (same group as the tail, so still one mesh)
    tie = blib.cylinder("pony_tie", 0.034, 0.02, (0, 0.214, 1.318), None, verts=24, rot=(-58, 0, 0), bevel=0.006)
    add(paint(tie, "hair_tie"), "hair_ponytail", "head")
    tie2 = blib.cylinder("pony_tie_hat", 0.034, 0.02, (0, 0.214, 1.318), None, verts=24, rot=(-58, 0, 0), bevel=0.006)
    add(paint(tie2, "hair_tie"), "hair_ponytail_hat", "head")


def knit(obj, ribs, depth):
    """Knit ribbing: a radial ripple around the Z axis."""
    for v in obj.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        r = math.hypot(v.co.x, v.co.y)
        if r < 1e-5:
            continue
        k = 1 + depth * math.cos(ribs * a) / max(r, 0.05)
        v.co.x *= k
        v.co.y *= k


def build_beanie():
    g = "acc_beanie"
    dome = blib.sphere("beanie_dome", 0.214, (0, 0.012, 1.3), None, scale=(1.03, 1.03, 0.98), segments=48, rings=20)
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context="VERTS")
    bm.to_mesh(dome.data)
    bm.free()
    knit(dome, 24, 0.0016)
    sol = dome.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.01
    add(paint(dome, "acc1"), g, "head")
    cuff = blib.cylinder("beanie_cuff", 0.226, 0.066, (0, 0.012, 1.298), None, verts=72, cap=False)
    knit(cuff, 36, 0.0022)
    sol = cuff.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.018
    sol.offset = 0
    bv = cuff.modifiers.new("bevel", "BEVEL")
    bv.width = 0.006
    bv.segments = 2
    add(paint(cuff, "acc_dark"), g, "head")
    pom = ball("beanie_pom", 0.058, (0, 0.012, 1.53), "acc2", seg=24, rings=14)
    folds(pom, 0.014)
    add(pom, g, "head")


def build_hair_and_accessories():
    build_hair()
    build_beanie()
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
        if not group.startswith("face_"):
            # budget: ~16k triangles per visible avatar (16 avatars < 300k triangles)
            dec = o.modifiers.new("decimate", "DECIMATE")
            dec.ratio = 0.3 if group.startswith("hair_curly") or group.endswith("_hat") else (0.45 if group in ("body",) or group.startswith("hair_") else (0.75 if group == "acc_guitar" else 0.6))
            blib.apply_all(o)
        restripe(o)
        o.parent = rig
        mod = o.modifiers.new("rig", "ARMATURE")
        mod.object = rig
        meshes.append(o)
    return meshes


def add_face_morphs(face, style):
    """blink squashes the tagged eye parts, mouthOpen rebuilds the tagged mouth parts
    with the open outline. Untagged parts (lids, freckles, brows) never move."""
    me = face.data
    gb = face.vertex_groups.get("_blink")
    gm = face.vertex_groups.get("_mouth")

    def member(v, g):
        return g is not None and any(e.group == g.index for e in v.groups)

    face.shape_key_add(name="Basis", from_mix=False)
    blink = face.shape_key_add(name="blink", from_mix=False)
    mouth_open = face.shape_key_add(name="mouthOpen", from_mix=False)
    cz = head_xyz(0, 0, 1.25)[2]
    top0, bot0 = mouth_shape(0, style)
    top1, bot1 = mouth_shape(1, style)
    ring0 = top0 + list(reversed(bot0[1:-1]))
    ring1 = top1 + list(reversed(bot1[1:-1]))
    ring0_h = [head_xyz(x, 0, MOUTH_CZ + z) for x, z in ring0]
    for i, v in enumerate(me.vertices):
        co = v.co
        if member(v, gb):
            blink.data[i].co = Vector((co.x, co.y + 0.004, cz - 0.012 + (co.z - cz) * 0.08))
        elif member(v, gm):
            best, bd = 0, 1e9
            for k, (hx, _, hz) in enumerate(ring0_h):
                d = (hx - co.x) ** 2 + (hz - co.z) ** 2
                if d < bd:
                    bd, best = d, k
            dx = (ring1[best][0] - ring0[best][0]) * HEAD_K
            dz = (ring1[best][1] - ring0[best][1]) * HEAD_K
            mouth_open.data[i].co = Vector((co.x + dx, co.y - 0.004 * (1 if co.y < -0.15 else 0), co.z + dz))
    for g in (gb, gm):
        if g is not None:
            face.vertex_groups.remove(g)


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
    build_faces()
    build_hair_and_accessories()
    meshes = skin(rig)
    for name, spec in FACES.items():
        add_face_morphs(bpy.data.objects[name], spec["mouth"])
    build_animations(rig)
    print("meshes:", [(m.name, len(m.data.polygons)) for m in meshes])
    preview = arg("--preview")
    if preview:
        show = (arg("--show") or "hair_swept,top_hoodie,face_classic").split(",")
        for m in meshes:
            if m.name.startswith(("hair_", "top_", "acc_", "face_")):
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
