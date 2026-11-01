"""Descall 3D world: the robot blackjack dealer ("Krupiye bot"), built and animated from code.

Target: the robot in docs/design/3d-world/scene-2.jpg. Original design (own geometry,
rig and keyframes): white rounded helmet, slate face screen with cyan ring eyes and a
small mouth line, cyan-ringed ear pods, white torso with a dark chest panel and a Descall
blue status light, white gloved four-part hands, hovering on a ring base (no legs: it
works behind the table).

Rig (rigid parts, one bone each): root, base, spine, chest, neck, head, shoulder/upper
arm/forearm/hand/fingers/thumb per side. Morph targets on the face: blink, smile, think.
Clips (30 fps): idle (loop), dealCard, flipCard, collectCards, wave, thinking (loop).

  blender -b -P tools/world3d/build_robot_dealer.py -- --preview out.png [--pose dealCard:18]
  blender -b -P tools/world3d/build_robot_dealer.py -- --out frontend/public/world3d/robot-dealer.glb

Blender axes: Z up, the robot faces -Y, its left side is +X. Root at the floor.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Vector

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
M = {}
BONES = {}
PARTS = []  # (obj, bone)


def mats():
    M["white"] = blib.principled("robot_white", "#f1f2f6", 0.32, spec=0.5)
    M["dark"] = blib.principled("robot_dark", "#3c4150", 0.38, metal=0.45)
    M["face"] = blib.principled("robot_face", "#7f94ad", 0.22, spec=0.6)
    M["ink"] = blib.principled("robot_ink", "#16233a", 0.3)
    M["glow"] = blib.emissive("EMIT_robot_glow", "#38c6ff", 6.0)
    M["blue"] = blib.emissive("EMIT_robot_blue", "#587af6", 5.0)


def add(obj, bone, mat=None):
    if mat is not None:
        blib.set_mat(obj, mat)
    PARTS.append((obj, bone))
    return obj


def rb(name, size, loc, mat, bone, bevel=0.05, seg=4, rot=(0, 0, 0), sub=0):
    return add(blib.rbox(name, size, loc, mat, bevel=bevel, segments=seg, rot=rot, subsurf=sub), bone)


def cyl(name, r, depth, loc, mat, bone, verts=32, rot=(0, 0, 0), r2=None, bevel=0.0):
    return add(blib.cylinder(name, r, depth, loc, mat, verts=verts, rot=rot, radius_top=r2, bevel=bevel), bone)


def ball(name, r, loc, mat, bone, scale=(1, 1, 1), seg=24, rings=12):
    return add(blib.sphere(name, r, loc, mat, scale=scale, segments=seg, rings=rings), bone)


def seg_cyl(name, a, b, r1, r2, mat, bone, verts=24):
    a, b = Vector(a), Vector(b)
    d = b - a
    o = blib.cylinder(name, r1, d.length, (0, 0, 0), mat, verts=verts, radius_top=r2)
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.location = (a + b) / 2
    return add(o, bone)


# key points (rest pose: arms hang a little forward and out)
SH = {"L": Vector((0.215, -0.01, 1.235)), "R": Vector((-0.215, -0.01, 1.235))}
EL = {s: SH[s] + Vector((0.035 * (1 if s == "L" else -1), -0.03, -0.24)) for s in SH}
WR = {s: EL[s] + Vector((0.0, -0.05, -0.22)) for s in SH}
HE = {s: WR[s] + Vector((0.0, -0.02, -0.1)) for s in SH}


def armature():
    data = bpy.data.armatures.new("robot_rig")
    rig = bpy.data.objects.new("robot_rig", data)
    blib.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones

    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        BONES[name] = (Vector(head), Vector(tail))

    bone("root", (0, 0, 0), (0, 0.15, 0))
    bone("base", (0, 0, 0.3), (0, 0, 0.5), "root")
    bone("spine", (0, 0, 0.62), (0, 0, 0.92), "base")
    bone("chest", (0, 0, 0.92), (0, 0, 1.24), "spine")
    bone("neck", (0, 0, 1.26), (0, 0, 1.32), "chest")
    bone("head", (0, 0, 1.32), (0, 0, 1.68), "neck")
    for s in ("L", "R"):
        sgn = 1 if s == "L" else -1
        bone(f"shoulder.{s}", (sgn * 0.12, 0, 1.235), tuple(SH[s]), "chest")
        bone(f"upper_arm.{s}", tuple(SH[s]), tuple(EL[s]), f"shoulder.{s}")
        bone(f"forearm.{s}", tuple(EL[s]), tuple(WR[s]), f"upper_arm.{s}")
        bone(f"hand.{s}", tuple(WR[s]), tuple(HE[s]), f"forearm.{s}")
        bone(f"fingers.{s}", tuple(HE[s]), tuple(HE[s] + Vector((0, -0.02, -0.07))), f"hand.{s}")
        bone(f"thumb.{s}", tuple(WR[s] + Vector((-sgn * 0.035, -0.03, -0.03))), tuple(WR[s] + Vector((-sgn * 0.06, -0.06, -0.07))), f"hand.{s}")
    for b in eb:
        b.align_roll(Vector((0, -1, 0)) if abs(b.vector.normalized().z) > 0.7 else Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def build_body():
    # hover base: dark disc with a glowing ring, tapered skirt up to the torso
    cyl("base_disc", 0.26, 0.08, (0, 0, 0.3), M["dark"], "base", verts=48, bevel=0.03)
    ring = cyl("EMIT_base_ring", 0.245, 0.02, (0, 0, 0.255), M["glow"], "base", verts=48)
    cyl("base_skirt", 0.2, 0.36, (0, 0, 0.52), M["white"], "base", verts=40, r2=0.17, bevel=0.03)
    cyl("waist", 0.165, 0.08, (0, 0, 0.72), M["dark"], "spine", verts=40)
    # torso: rounded white shell, slightly wider at the chest
    rb("torso", (0.4, 0.3, 0.5), (0, 0, 1.0), M["white"], "chest", bevel=0.12, seg=6)
    rb("chest_panel", (0.15, 0.03, 0.17), (0, -0.155, 1.02), M["ink"], "chest", bevel=0.03, seg=3)
    rb("chest_frame", (0.18, 0.02, 0.2), (0, -0.147, 1.02), M["dark"], "chest", bevel=0.035, seg=3)
    led = cyl("EMIT_chest_led", 0.028, 0.012, (0.0, -0.172, 1.03), M["blue"], "chest", verts=24, rot=(90, 0, 0))
    led2 = ball("EMIT_chest_dot", 0.012, (0.05, -0.17, 0.97), M["glow"], "chest", seg=12, rings=6)
    cyl("neck", 0.065, 0.08, (0, 0, 1.29), M["dark"], "neck", verts=24)
    for s in ("L", "R"):
        sgn = 1 if s == "L" else -1
        ball(f"shoulder_{s}", 0.056, tuple(SH[s]), M["dark"], f"shoulder.{s}")
        cyl(f"shoulder_ring_{s}", 0.045, 0.03, tuple(SH[s] + Vector((sgn * 0.04, 0, 0))), M["dark"], f"shoulder.{s}", verts=24, rot=(0, 90, 0))
        seg_cyl(f"upper_{s}", SH[s] + (EL[s] - SH[s]) * 0.18, EL[s] - (EL[s] - SH[s]) * 0.12, 0.058, 0.052, M["white"], f"upper_arm.{s}")
        ball(f"elbow_{s}", 0.05, tuple(EL[s]), M["dark"], f"forearm.{s}")
        seg_cyl(f"fore_{s}", EL[s] + (WR[s] - EL[s]) * 0.15, WR[s] - (WR[s] - EL[s]) * 0.08, 0.052, 0.046, M["white"], f"forearm.{s}")
        cyl(f"wrist_{s}", 0.04, 0.03, tuple(WR[s]), M["dark"], f"hand.{s}", verts=20)
        # glove: palm + four-part fingers block + thumb
        rb(f"palm_{s}", (0.075, 0.07, 0.09), tuple(WR[s] + Vector((0, -0.015, -0.055))), M["white"], f"hand.{s}", bevel=0.03, seg=3)
        for k in range(3):
            fx = sgn * (-0.022 + k * 0.022)
            rb(f"finger_{s}{k}", (0.02, 0.025, 0.07), tuple(HE[s] + Vector((fx, -0.008, -0.04))), M["white"], f"fingers.{s}", bevel=0.01, seg=2)
        rb(f"thumb_{s}", (0.022, 0.022, 0.06), tuple(WR[s] + Vector((-sgn * 0.045, -0.04, -0.05))), M["white"], f"thumb.{s}", bevel=0.01, seg=2, rot=(20, sgn * 30, 0))


def build_head():
    hz = 1.5
    # helmet: rounded box, slightly squarer than a sphere, with a crown ridge
    rb("helmet", (0.43, 0.37, 0.36), (0, 0.01, hz), M["white"], "head", bevel=0.16, seg=6)
    rb("crown", (0.06, 0.26, 0.045), (0, 0.02, hz + 0.185), M["white"], "head", bevel=0.022, seg=3)
    # face screen inset
    rb("face_frame", (0.34, 0.03, 0.25), (0, -0.172, hz - 0.012), M["dark"], "head", bevel=0.085, seg=4)
    rb("face_screen", (0.315, 0.02, 0.228), (0, -0.182, hz - 0.012), M["face"], "head", bevel=0.08, seg=4)
    # ear pods: dark discs with glowing rings
    for s in ("L", "R"):
        sgn = 1 if s == "L" else -1
        cyl(f"ear_{s}", 0.085, 0.07, (sgn * 0.225, 0.0, hz), M["dark"], "head", verts=40, rot=(0, 90, 0), bevel=0.018)
        ring = bpy.data.meshes.new(f"earring_{s}")
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=False, segments=40, radius=0.058)
        bm.to_mesh(ring)
        bm.free()
        o = bpy.data.objects.new(f"EMIT_ear_ring_{s}", ring)
        blib.link(o)
        o.location = (sgn * 0.262, 0.0, hz)
        o.rotation_euler = (0, math.radians(90), 0)
        sk = o.modifiers.new("skin", "SKIN")
        for v in o.data.skin_vertices[0].data:
            v.radius = (0.011, 0.011)
        blib.apply_all(o)
        blib.shade_smooth(o)
        add(o, "head", M["glow"])
        cyl(f"ear_cap_{s}", 0.036, 0.02, (sgn * 0.262, 0.0, hz), M["face"], "head", verts=24, rot=(0, 90, 0))
    face_features(hz)


def disc(bm, center, r, segs=24, ring=None):
    """Disc (or ring with inner radius `ring`) in the XZ plane facing -Y."""
    cx, cy, cz = center
    outer = [bm.verts.new((cx + r * math.cos(2 * math.pi * i / segs), cy, cz + r * math.sin(2 * math.pi * i / segs))) for i in range(segs)]
    if ring is None:
        bm.faces.new(list(reversed(outer)))
        return
    inner = [bm.verts.new((cx + ring * math.cos(2 * math.pi * i / segs), cy, cz + ring * math.sin(2 * math.pi * i / segs))) for i in range(segs)]
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((outer[j], outer[i], inner[i], inner[j]))


def face_features(hz):
    """Glowing eye rings (EMIT) + dark pupils and mouth (ink), with morph targets."""
    y = -0.195
    eyes = [(-0.07, hz + 0.008), (0.07, hz + 0.008)]
    bm = bmesh.new()
    for x, z in eyes:
        disc(bm, (x, y, z), 0.05, 28, ring=0.032)
    rings = blib.mesh_from_bmesh("EMIT_robot_eyes", bm)
    add(rings, "head", M["glow"])
    bm = bmesh.new()
    for x, z in eyes:
        disc(bm, (x, y - 0.001, z), 0.032, 24)
    # mouth: a short arc (rest = the draft's small frown)
    pts = 9
    w, t = 0.055, 0.0075
    top, bot = [], []
    for i in range(pts):
        u = -1 + 2 * i / (pts - 1)
        zc = hz - 0.072 + 0.013 * (1 - u * u)
        top.append(bm.verts.new((u * w, y - 0.001, zc + t)))
        bot.append(bm.verts.new((u * w, y - 0.001, zc - t)))
    for i in range(pts - 1):
        bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    ink = blib.mesh_from_bmesh("robot_face_ink", bm)
    add(ink, "head", M["ink"])
    FACE["rings"], FACE["ink"], FACE["eyes"], FACE["hz"] = rings, ink, eyes, hz


FACE = {}


def face_morphs():
    hz = FACE["hz"]
    for obj in (FACE["rings"], FACE["ink"]):
        obj.shape_key_add(name="Basis", from_mix=False)
        blink = obj.shape_key_add(name="blink", from_mix=False)
        smile = obj.shape_key_add(name="smile", from_mix=False)
        think = obj.shape_key_add(name="think", from_mix=False)
        for i, v in enumerate(obj.data.vertices):
            co = v.co
            is_mouth = co.z < hz - 0.035
            if not is_mouth:
                ex = -0.07 if co.x < 0 else 0.07
                ez = hz + 0.008
                blink.data[i].co = Vector((co.x, co.y, ez + (co.z - ez) * 0.12))
                smile.data[i].co = Vector((co.x, co.y, ez + (co.z - ez) * 0.75 + 0.006))  # eyes squint up a little
                think.data[i].co = Vector((co.x + 0.012, co.y, co.z + 0.014))
            else:
                u = co.x / 0.055
                # rest arc bulges up (frown); smile flips it, think flattens and shifts it
                rest = 0.013 * (1 - u * u)
                smile.data[i].co = Vector((co.x * 1.15, co.y, co.z - 2 * rest - 0.004))
                think.data[i].co = Vector((co.x * 0.7 + 0.015, co.y, co.z - rest))


def skin(rig):
    for obj, bone in PARTS:
        blib.apply_all(obj)
        obj.vertex_groups.new(name=bone)
        obj.vertex_groups[bone].add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    # join everything but the morph meshes per material (few draw calls)
    groups = {}
    for obj, bone in PARTS:
        if obj in (FACE["rings"], FACE["ink"]):
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    meshes = []
    for name, objs in groups.items():
        o = blib.join(objs, "robot_" + name.replace("robot_", "")) if len(objs) > 1 else objs[0]
        if name.startswith("EMIT_"):
            o.name = name
        meshes.append(o)
    meshes += [FACE["rings"], FACE["ink"]]
    for o in meshes:
        o.parent = rig
        mod = o.modifiers.new("rig", "ARMATURE")
        mod.object = rig
    return meshes


# ------------------------------------------------------------------ animation

def rest_rot(rig, name):
    return rig.data.bones[name].matrix_local.to_quaternion()


def q_from(deg):
    return Euler([math.radians(a) for a in deg], "XYZ").to_quaternion()


def key_pose(rig, frame, pose, base=(0, 0, 0)):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        b = rest_rot(rig, pb.name)
        pb.rotation_quaternion = b.inverted() @ q_from(pose.get(pb.name, (0, 0, 0))) @ b
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.location = b.inverted() @ Vector(base) if pb.name == "base" else (0, 0, 0)
        pb.keyframe_insert("location", frame=frame)


def key_shapes(frame, weights):
    for obj in (FACE["rings"], FACE["ink"]):
        for kb in obj.data.shape_keys.key_blocks[1:]:
            kb.value = weights.get(kb.name, 0.0)
            kb.keyframe_insert("value", frame=frame)


def make_action(rig, name, keys, faces=None):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for frame, pose, base in keys:
        key_pose(rig, frame, pose, base)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.easing = "AUTO"
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, int(keys[0][0]), act)
    tr.mute = True
    rig.animation_data.action = None
    # face weights on the shape keys of both face meshes, as their own actions with the same name
    for obj in (FACE["rings"], FACE["ink"]):
        sk = obj.data.shape_keys
        sk.animation_data_create()
        fa = bpy.data.actions.new(name)
        fa.use_fake_user = True
        sk.animation_data.action = fa
        for frame, w in (faces or [(keys[0][0], {}), (keys[-1][0], {})]):
            for kb in sk.key_blocks[1:]:
                kb.value = w.get(kb.name, 0.0)
                kb.keyframe_insert("value", frame=frame)
        t2 = sk.animation_data.nla_tracks.new()
        t2.name = name
        t2.strips.new(name, int(keys[0][0]), fa)
        t2.mute = True
        sk.animation_data.action = None
    return act


def merge(*ps):
    out = {}
    for p in ps:
        for k, v in p.items():
            out[k] = tuple(a + b for a, b in zip(out.get(k, (0, 0, 0)), v))
    return out


REST = {}
# working pose behind the table: forearms forward over the felt
READY = {"upper_arm.L": (-24, 0, 0), "upper_arm.R": (-24, 0, 0), "forearm.L": (-48, 0, 0), "forearm.R": (-48, 0, 0),
         "hand.L": (10, 0, 0), "hand.R": (10, 0, 0), "fingers.L": (-12, 0, 0), "fingers.R": (-12, 0, 0)}


def animations(rig):
    # idle: hover bob, slow look around, hands resting ready
    idle = []
    for f, ph in ((1, 0), (23, 1), (46, 2), (68, 3), (91, 4)):
        s = math.sin(ph * math.pi / 2)
        idle.append((f, merge(READY, {"head": (2 * s, 0, 6 * s), "neck": (0, 0, 2 * s), "chest": (0, 0, 1.5 * s),
                                      "upper_arm.L": (2 * s, 0, 0), "upper_arm.R": (-2 * s, 0, 0)}), (0, 0, 0.018 * s)))
    make_action(rig, "idle", idle, faces=[(1, {}), (40, {}), (43, {"blink": 1}), (46, {}), (91, {})])
    # dealCard: right hand to the shoe (robot's right, near), pinch, slide a card to a player, back
    deal = [
        (1, READY, (0, 0, 0)),
        (8, merge(READY, {"upper_arm.R": (-8, 0, -26), "forearm.R": (-12, 0, 0), "chest": (0, 0, -10), "head": (8, 0, -14)}), (0, 0, 0.01)),
        (13, merge(READY, {"upper_arm.R": (-10, 0, -28), "forearm.R": (-14, 0, 0), "fingers.R": (-40, 0, 0), "thumb.R": (0, 0, 20), "chest": (0, 0, -10), "head": (10, 0, -14)}), (0, 0, 0.0)),
        (24, merge(READY, {"upper_arm.R": (-30, 0, 4), "forearm.R": (8, 0, 0), "hand.R": (-15, 0, 0), "fingers.R": (-40, 0, 0), "chest": (8, 0, 6), "spine": (6, 0, 0), "head": (12, 0, 4)}), (0, -0.04, -0.01)),
        (28, merge(READY, {"upper_arm.R": (-32, 0, 4), "forearm.R": (12, 0, 0), "hand.R": (-35, 0, 0), "fingers.R": (0, 0, 0), "chest": (8, 0, 6), "spine": (6, 0, 0)}), (0, -0.05, -0.01)),
        (36, READY, (0, 0, 0)),
    ]
    make_action(rig, "dealCard", deal)
    # flipCard: reach forward, turn the wrist over, set it down
    flip = [
        (1, READY, (0, 0, 0)),
        (9, merge(READY, {"upper_arm.R": (-16, 0, 8), "forearm.R": (4, 0, 0), "fingers.R": (-35, 0, 0), "head": (14, 0, 4)}), (0, -0.02, 0)),
        (17, merge(READY, {"upper_arm.R": (-20, 0, 8), "forearm.R": (-6, 0, -90), "hand.R": (-20, 0, 0), "fingers.R": (-35, 0, 0), "head": (14, 0, 4)}), (0, -0.02, 0.01)),
        (24, merge(READY, {"upper_arm.R": (-18, 0, 8), "forearm.R": (2, 0, -180), "hand.R": (-10, 0, 0), "fingers.R": (0, 0, 0), "head": (12, 0, 2)}), (0, -0.02, 0)),
        (30, READY, (0, 0, 0)),
    ]
    make_action(rig, "flipCard", flip, faces=[(1, {}), (24, {"smile": 0.6}), (30, {"smile": 0.3})])
    # collectCards: both arms reach wide over the felt, sweep in to the body
    collect = [
        (1, READY, (0, 0, 0)),
        (12, merge(READY, {"upper_arm.L": (-26, 0, 38), "upper_arm.R": (-26, 0, -38), "forearm.L": (16, 0, 0), "forearm.R": (16, 0, 0), "spine": (10, 0, 0), "head": (14, 0, 0)}), (0, -0.05, -0.02)),
        (24, merge(READY, {"upper_arm.L": (-22, 0, 8), "upper_arm.R": (-22, 0, -8), "forearm.L": (6, 0, -26), "forearm.R": (6, 0, 26), "spine": (6, 0, 0), "head": (10, 0, 0)}), (0, -0.03, -0.01)),
        (34, merge(READY, {"upper_arm.L": (-10, 0, -10), "upper_arm.R": (-10, 0, 10), "forearm.L": (-20, 0, -30), "forearm.R": (-20, 0, 30)}), (0, 0, 0)),
        (46, READY, (0, 0, 0)),
    ]
    make_action(rig, "collectCards", collect)
    # wave: right arm up, forearm waves, head tilt, smile
    wv = [(1, READY, (0, 0, 0))]
    up = {"upper_arm.R": (-20, 0, 0), "shoulder.R": (0, -10, 0), "head": (0, -8, 0)}
    for k, f in enumerate((10, 16, 22, 28, 34)):
        swing = 22 if k % 2 == 0 else -18
        wv.append((f, merge({k2: v for k2, v in READY.items() if not k2.endswith(".R")}, up, {"upper_arm.R": (-150, 30, 0), "forearm.R": (-20, 0, swing), "hand.R": (0, 0, swing * 0.5)}), (0, 0, 0.02)))
    wv.append((46, READY, (0, 0, 0)))
    make_action(rig, "wave", wv, faces=[(1, {}), (10, {"smile": 1}), (40, {"smile": 1}), (46, {})])
    # thinking: hand to the chin, head tilts, eyes look up (loop)
    think_pose = merge({k2: v for k2, v in READY.items() if not k2.endswith(".R")}, {
        "upper_arm.R": (-55, 0, 18), "forearm.R": (-118, 0, 10), "hand.R": (-20, 0, 0), "fingers.R": (-60, 0, 0),
        "upper_arm.L": (-28, 0, -20), "forearm.L": (-80, 0, -30)})
    th = []
    for f, ph in ((1, 0), (18, 1), (36, 2), (54, 3), (72, 4)):
        s = math.sin(ph * math.pi / 2)
        th.append((f, merge(think_pose, {"head": (-6 + 3 * s, -10 + 4 * s, 8 * s), "neck": (0, -3, 0)}), (0, 0, 0.012 * s)))
    make_action(rig, "thinking", th, faces=[(1, {"think": 1}), (30, {"think": 1}), (33, {"think": 1, "blink": 1}), (36, {"think": 1}), (72, {"think": 1})])


def main():
    blib.reset_scene()
    bpy.context.scene.render.fps = FPS
    mats()
    rig = armature()
    build_body()
    build_head()
    face_morphs()
    meshes = skin(rig)
    animations(rig)
    print("meshes:", [(m.name, len(m.data.polygons)) for m in meshes])
    preview = arg("--preview")
    if preview:
        clip, _, frame = (arg("--pose") or "idle:1").partition(":")
        rig.animation_data.action = bpy.data.actions[clip]
        bpy.context.scene.frame_set(int(frame or 1))
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        blib.link(cam)
        cam.location = (0.9, -2.2, 1.45)
        cam.rotation_euler = (Vector((0, 0, 1.1)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        bpy.context.scene.camera = cam
        world = bpy.data.worlds.new("w")
        bpy.context.scene.world = world
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs["Color"].default_value = blib.srgb("#6a5aa0")
        ld = bpy.data.lights.new("key", "AREA")
        ld.energy = 300
        ld.size = 2
        lo = bpy.data.objects.new("key", ld)
        lo.location = (1.5, -2, 3)
        lo.rotation_euler = (math.radians(40), 0, math.radians(30))
        blib.link(lo)
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        sc.cycles.samples = 24
        sc.cycles.use_denoising = False
        sc.render.resolution_x, sc.render.resolution_y = 600, 600
        sc.render.filepath = preview
        bpy.ops.render.render(write_still=True)
        return
    out = arg("--out", os.path.join(os.path.dirname(blib.HERE), "..", "frontend", "public", "world3d", "robot-dealer.glb"))
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out), export_format="GLB", export_animations=True, export_animation_mode="ACTIONS",
        export_nla_strips=True, export_force_sampling=True, export_frame_step=1, export_skins=True, export_morph=True,
        export_morph_normal=False, export_def_bones=False, export_yup=True, export_apply=False, export_materials="EXPORT",
        export_cameras=False, export_lights=False,
    )
    print("exported ->", out)


if __name__ == "__main__":
    main()
