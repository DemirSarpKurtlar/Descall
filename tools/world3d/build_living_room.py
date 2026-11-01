"""Descall 3D world, phase 1: the living room ("Oturma odası"), built from code.

Target: docs/design/3d-world/scene-3.jpg. Own geometry (rounded boxes, cylinders,
spheres) + CC0 materials (ambientCG) + CC0 plants (Poly Haven) + procedural
textures (gen_textures.py). Lighting is baked with Cycles into per-group atlases
(diffuse direct + indirect + emission), so the client draws static geometry
unlit; lamps, lava lamp and the city stay emissive (HDR, they bloom).

  blender -b -P tools/world3d/build_living_room.py -- --preview out.png
  blender -b -P tools/world3d/build_living_room.py -- --bake --samples 96 --out frontend/public/world3d/living-room.glb

Coordinates (Blender, Z up): x to the TV wall, y to the window wall.
Room interior x 0..7.2, y 0..6.6, z 0..3.0.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blib  # noqa: E402
from blib import cylinder, empty, plane, principled, rbox, sphere, srgb, textured  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith("--"):
            return ARGS[i + 1]
        return True
    return default


RW, RD, RH = 6.8, 6.6, 3.0
Y0 = -1.6  # front wall (behind the hero camera)
ACG = os.path.join(blib.CACHE, "ambientcg")
PH = os.path.join(blib.CACHE, "polyhaven")
GEN = os.path.join(blib.CACHE, "gen")

GROUPS = {}  # group name -> [objects]
EMISSIVE = []  # objects exported unbaked (HDR emissive)
COLLIDERS = []


def grp(name, obj):
    GROUPS.setdefault(name, []).append(obj)
    return obj


def collider(name, size, loc, rot_z=0.0):
    o = rbox("COL_" + name, size, loc, bevel=0, rot=(0, 0, rot_z))
    o.display_type = "WIRE"
    o.hide_render = True
    COLLIDERS.append(o)
    return o


# ------------------------------------------------------------------ materials

def make_materials():
    M = {}
    M["floor"] = textured("floor", os.path.join(ACG, "WoodFloor051"), "WoodFloor051", tint="#c39a7c", rough=0.45, scale=0.55)
    M["wall"] = textured("wall", os.path.join(ACG, "Plaster001"), "Plaster001", tint="#ead8e8", rough=0.9, scale=0.35, normal_strength=0.25)
    M["wall_window"] = textured("wall_window", os.path.join(ACG, "Plaster001"), "Plaster001", tint="#cfc0e0", rough=0.9, scale=0.35, normal_strength=0.25)
    M["ceiling"] = principled("ceiling", "#b6a6cf", 0.95)
    M["base"] = principled("baseboard", "#d8cce6", 0.6)
    M["frame"] = principled("window_frame", "#2a2c46", 0.5, metal=0.2)
    M["curtain"] = principled("curtain", "#6f6585", 0.95)
    M["rod"] = principled("rod", "#2a2a30", 0.35, metal=0.8)
    M["sofa"] = textured("sofa", os.path.join(ACG, "Fabric030"), "Fabric030", tint="#e2dfe8", rough=0.95, scale=2.2, normal_strength=0.5)
    M["sofa2"] = textured("sofa2", os.path.join(ACG, "Fabric030"), "Fabric030", tint="#a6b2dc", rough=0.95, scale=2.2, normal_strength=0.5)
    M["pillow_teal"] = principled("pillow_teal", "#7fb8b4", 0.9)
    M["pillow_pink"] = principled("pillow_pink", "#f0a3a6", 0.9)
    M["blanket"] = principled("blanket", "#f7e4dc", 0.95)
    M["leg_dark"] = principled("leg_dark", "#26222e", 0.5, metal=0.3)
    M["table_top"] = principled("table_top", "#2f2a3a", 0.45)
    M["table_leg"] = principled("table_leg", "#1d1a24", 0.5, metal=0.3)
    M["rug"] = textured("rug", os.path.join(ACG, "Carpet016"), "Carpet016", tint="#f1dcd8", rough=1.0, scale=1.6, normal_strength=0.9)
    M["beanbag"] = principled("beanbag", "#e0559c", 0.85)
    M["wood"] = textured("wood", os.path.join(ACG, "Wood049"), "Wood049", tint="#e7c7a6", rough=0.6, scale=0.8, rotate=math.pi / 2)
    M["wood_dark"] = principled("wood_slat", "#b38d6c", 0.6)
    M["tv_body"] = principled("tv_body", "#121218", 0.35, metal=0.4)
    M["tv_screen"] = principled("tv_screen", "#0d1020", 0.12, spec=0.6)
    M["ceramic"] = principled("ceramic", "#f2eef2", 0.35)
    M["metal"] = principled("metal", "#3a3640", 0.35, metal=0.8)
    M["orange"] = principled("orange", "#f39a2a", 0.5)
    M["apple"] = principled("apple", "#d93a3a", 0.4)
    M["lemon"] = principled("lemon", "#f2cf3a", 0.5)
    M["book1"] = principled("book1", "#e9e2d6", 0.8)
    M["book2"] = principled("book2", "#7b8fd0", 0.8)
    M["book3"] = principled("book3", "#d68aa0", 0.8)
    M["pot_white"] = principled("pot_white", "#ece6ee", 0.6)
    M["pot_terra"] = principled("pot_terra", "#b7684a", 0.8)
    M["speaker"] = principled("speaker", "#2b2a31", 0.6)
    art = bpy.data.images.load(os.path.join(GEN, "art.png"))
    M["art"] = principled("art", "#ffffff", 0.8)
    nt = M["art"].node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = art
    nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    M["art_frame"] = principled("art_frame", "#f5efe9", 0.6)
    # Emissive (HDR, unbaked)
    M["shade"] = blib.emissive("EMIT_shade", "#ffcf8f", 6.0)
    M["globe"] = blib.emissive("EMIT_globe", "#ffe2b8", 7.0)
    lava = bpy.data.images.load(os.path.join(GEN, "lava.png"))
    M["lava"] = blib.emissive("EMIT_lava", "#ffffff", 4.0, image=lava)
    far = bpy.data.images.load(os.path.join(GEN, "skyline_far.png"))
    M["sky_far"] = blib.emissive("EMIT_sky_far", "#ffffff", 1.0, image=far)
    near = bpy.data.images.load(os.path.join(GEN, "skyline_near.png"))
    M["sky_near"] = blib.emissive("EMIT_sky_near", "#ffffff", 1.15, image=near)
    nt = M["sky_near"].node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = [n for n in nt.nodes if n.type == "TEX_IMAGE"][0]
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    M["sky_near"].blend_method = "CLIP"
    return M


# ------------------------------------------------------------------ room shell

def build_shell(M):
    # floor (UVs in metres so the plank texture keeps scale)
    fl = plane("FLOOR", RW, RD - Y0, (RW / 2, (RD + Y0) / 2, 0), mat=M["floor"])
    uv_metres(fl)
    grp("floor", fl)
    ce = plane("ceiling", RW, RD - Y0, (RW / 2, (RD + Y0) / 2, RH), rot=(180, 0, 0), mat=M["ceiling"])
    grp("shell", ce)
    t = 0.12
    # right wall (TV wall) at x = RW, faces -x
    rw = rbox("wall_right", (t, RD - Y0 + 2 * t, RH), (RW + t / 2, (RD + Y0) / 2, RH / 2), M["wall"], bevel=0)
    uv_metres(rw)
    grp("shell", rw)
    # left wall
    lw = rbox("wall_left", (t, RD - Y0 + 2 * t, RH), (-t / 2, (RD + Y0) / 2, RH / 2), M["wall_window"], bevel=0)
    uv_metres(lw)
    grp("shell", lw)
    # front wall (behind the hero camera) with a door frame
    fw = rbox("wall_front", (RW, t, RH), (RW / 2, Y0 - t / 2, RH / 2), M["wall"], bevel=0)
    uv_metres(fw)
    grp("shell", fw)
    door = rbox("door", (0.95, 0.05, 2.1), (1.6, Y0 + 0.03, 1.05), M["base"], bevel=0.01)
    grp("shell", door)
    # window wall at y = RD with a big opening x 0.25..4.75, z 0.5..2.9
    wx0, wx1, wz0, wz1 = 0.25, 4.75, 0.5, 2.9
    y = RD + t / 2
    pieces = [
        ("wall_back_low", (wx1 - 0, t, wz0), ((wx1) / 2, y, wz0 / 2)),
        ("wall_back_top", (wx1, t, RH - wz1), (wx1 / 2, y, (RH + wz1) / 2)),
        ("wall_back_left", (wx0, t, wz1 - wz0), (wx0 / 2, y, (wz0 + wz1) / 2)),
        ("wall_back_right", (RW - wx1, t, RH), ((wx1 + RW) / 2, y, RH / 2)),
    ]
    for name, size, loc in pieces:
        o = rbox(name, size, loc, M["wall_window"], bevel=0)
        uv_metres(o)
        grp("shell", o)
    # window frame and mullions
    fy = RD + 0.02
    ft = 0.07
    frame_parts = [
        ((wx1 - wx0 + ft, 0.14, ft), ((wx0 + wx1) / 2, fy, wz0)),
        ((wx1 - wx0 + ft, 0.14, ft), ((wx0 + wx1) / 2, fy, wz1)),
        ((ft, 0.14, wz1 - wz0), (wx0, fy, (wz0 + wz1) / 2)),
        ((ft, 0.14, wz1 - wz0), (wx1, fy, (wz0 + wz1) / 2)),
        ((0.05, 0.1, wz1 - wz0), (1.2, fy, (wz0 + wz1) / 2)),
        ((0.05, 0.1, wz1 - wz0), (3.85, fy, (wz0 + wz1) / 2)),
        ((wx1 - wx0, 0.1, 0.05), ((wx0 + wx1) / 2, fy, 2.45)),
    ]
    for i, (size, loc) in enumerate(frame_parts):
        grp("shell", rbox(f"window_frame_{i}", size, loc, M["frame"], bevel=0.008, segments=2))
    # sill
    grp("shell", rbox("sill", (wx1 - wx0 + 0.2, 0.26, 0.04), ((wx0 + wx1) / 2, RD - 0.06, wz0 - 0.02), M["base"], bevel=0.01))
    # baseboards
    bb = 0.09
    grp("shell", rbox("base_r", (0.02, RD - Y0, bb), (RW - 0.01, (RD + Y0) / 2, bb / 2), M["base"], bevel=0.004))
    grp("shell", rbox("base_l", (0.02, RD - Y0, bb), (0.01, (RD + Y0) / 2, bb / 2), M["base"], bevel=0.004))
    grp("shell", rbox("base_b", (RW, 0.02, bb), (RW / 2, RD - 0.01, bb / 2), M["base"], bevel=0.004))
    grp("shell", rbox("base_f", (RW, 0.02, bb), (RW / 2, Y0 + 0.01, bb / 2), M["base"], bevel=0.004))
    # curtains (pleated) + rod
    grp("shell", cylinder("rod", 0.018, 5.9, (2.85, RD - 0.16, 2.97), M["rod"], verts=16, rot=(0, 90, 0)))
    grp("shell", curtain("curtain_r", 4.68, 5.5, RD - 0.17, 0.02, 2.95, M["curtain"]))
    grp("shell", curtain("curtain_l", -0.05, 0.42, RD - 0.17, 0.02, 2.95, M["curtain"]))
    # outside: two skyline layers behind the glass
    far = plane("EMIT_sky_far", 30, 15, (2.5, RD + 22, 3.0), rot=(90, 0, 0), mat=M["sky_far"])
    EMISSIVE.append(far)
    near = plane("EMIT_sky_near", 24, 12, (2.5, RD + 15, 0.6), rot=(90, 0, 0), mat=M["sky_near"])
    EMISSIVE.append(near)
    # picture frame on the TV wall near the camera side
    grp("furniture", rbox("art_frame", (0.04, 0.78, 0.98), (RW - 0.03, 0.55, 1.85), M["art_frame"], bevel=0.01))
    art = plane("art", 0.64, 0.84, (RW - 0.055, 0.55, 1.85), rot=(90, 0, -90), mat=M["art"])
    grp("furniture", art)
    # room collider (interior box) for the client: keeps avatars and camera inside
    roomc = rbox("ROOM_BOUNDS", (RW, RD - Y0, RH), (RW / 2, (RD + Y0) / 2, RH / 2), bevel=0)
    roomc.hide_render = True
    COLLIDERS.append(roomc)


def curtain(name, x0, x1, y, z0, z1, mat, pleats=None):
    """A pleated curtain as a sine-wave strip (own geometry)."""
    import bmesh
    w = x1 - x0
    n = pleats or max(6, int(w / 0.09))
    seg_x = n * 6
    seg_z = 12
    bm = bmesh.new()
    verts = []
    for j in range(seg_z + 1):
        z = z0 + (z1 - z0) * j / seg_z
        row = []
        for i in range(seg_x + 1):
            u = i / seg_x
            x = x0 + w * u
            amp = 0.045 * (0.85 + 0.15 * (1 - j / seg_z))
            yy = y + amp * math.sin(u * n * 2 * math.pi)
            row.append(bm.verts.new((x, yy, z)))
        verts.append(row)
    for j in range(seg_z):
        for i in range(seg_x):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    obj = blib.mesh_from_bmesh(name, bm)
    sol = obj.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.015
    blib.set_mat(obj, mat)
    blib.shade_smooth(obj)
    return obj


def uv_metres(obj):
    """Planar UVs in metres (cube projection) so tiling textures keep a real scale."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    mw = obj.matrix_world
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                uv[li].uv = (co.y, co.z)
            elif ax == 1:
                uv[li].uv = (co.x, co.z)
            else:
                uv[li].uv = (co.x, co.y)


# ------------------------------------------------------------------ furniture

def sofa(prefix, center, rot_z, length, mat, seats, pillow_mats=(), depth=0.98):
    """Rounded modern sofa facing local -y. Returns objects; adds seats + collider."""
    objs = []
    cx, cy = center
    arm_w = 0.24
    inner = length - 2 * arm_w
    rz = math.radians(rot_z)
    cos, sin = math.cos(rz), math.sin(rz)

    def P(lx, ly, lz):
        return (cx + lx * cos - ly * sin, cy + lx * sin + ly * cos, lz)

    objs.append(rbox(prefix + "_base", (length, depth, 0.26), P(0, 0, 0.21), mat, bevel=0.06, segments=5, rot=(0, 0, rot_z)))
    objs.append(rbox(prefix + "_back", (length, 0.26, 0.5), P(0, depth / 2 - 0.13, 0.58), mat, bevel=0.11, segments=6, rot=(0, 0, rot_z)))
    for s in (-1, 1):
        objs.append(rbox(f"{prefix}_arm{s}", (arm_w, depth, 0.36), P(s * (length / 2 - arm_w / 2), 0, 0.46), mat, bevel=0.1, segments=6, rot=(0, 0, rot_z)))
    cw = inner / seats
    for i in range(seats):
        lx = -inner / 2 + cw * (i + 0.5)
        objs.append(rbox(f"{prefix}_seat{i}", (cw - 0.02, depth - 0.3, 0.16), P(lx, -0.1, 0.42), mat, bevel=0.07, segments=6, rot=(0, 0, rot_z)))
        objs.append(rbox(f"{prefix}_backc{i}", (cw - 0.04, 0.2, 0.42), P(lx, depth / 2 - 0.3, 0.7), mat, bevel=0.09, segments=6, rot=(-12, 0, rot_z)))
        seat = P(lx, -0.12, 0.47)
        look = P(lx, -1.2, 0.47)
        empty(f"SEAT_{prefix}_{i}", seat)
        empty(f"SEAT_{prefix}_{i}_look", look)
    for s in (-1, 1):
        for f in (-1, 1):
            objs.append(cylinder(f"{prefix}_leg{s}{f}", 0.025, 0.08, P(s * (length / 2 - 0.12), f * (depth / 2 - 0.12), 0.04), M["leg_dark"], verts=12))
    for k, pm in enumerate(pillow_mats):
        side = 1 if k == 0 else -1
        objs.append(rbox(f"{prefix}_pillow{k}", (0.46, 0.16, 0.42), P(side * (inner / 2 - 0.3), depth / 2 - 0.42, 0.72), pm, bevel=0.12, segments=6, rot=(-14, 0, rot_z + side * 8)))
    c = collider(prefix, (length, depth, 0.9), P(0, 0, 0.45), rot_z)
    return objs


def build_furniture(M):
    # main sofa against the window
    for o in sofa("sofa", (2.55, 5.95), 0, 3.0, M["sofa"], 3, pillow_mats=(M["pillow_teal"],)):
        grp("furniture", o)
    # second sofa, foreground right, facing the window-left corner (the draft's guitar seat)
    for o in sofa("sofa2", (4.75, 1.75), -150, 2.1, M["sofa2"], 2, pillow_mats=(M["pillow_pink"],)):
        grp("furniture", o)
    grp("furniture", rbox("sofa2_blanket", (0.7, 0.5, 0.06), (5.25, 1.15, 0.62), M["blanket"], bevel=0.03, rot=(8, 0, -150)))

    # coffee table
    tx, ty = 3.15, 3.85
    grp("furniture", rbox("table_top", (1.35, 0.82, 0.06), (tx, ty, 0.42), M["table_top"], bevel=0.02, segments=3))
    grp("furniture", rbox("table_shelf", (1.2, 0.7, 0.03), (tx, ty, 0.12), M["table_top"], bevel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            grp("furniture", rbox(f"table_leg{sx}{sy}", (0.045, 0.045, 0.4), (tx + sx * 0.6, ty + sy * 0.34, 0.2), M["table_leg"], bevel=0.008))
    collider("table", (1.35, 0.82, 0.45), (tx, ty, 0.22))

    # rug
    rug = rbox("rug", (2.9, 2.1, 0.025), (3.2, 3.75, 0.0125), M["rug"], bevel=0.01, segments=2)
    uv_metres(rug)
    grp("furniture", rug)

    # bean bag (pink), foreground left
    bb = sphere("beanbag", 0.55, (1.25, 2.35, 0.32), M["beanbag"], scale=(1.05, 1.0, 0.62), segments=48, rings=24)
    dent = sphere("beanbag_top", 0.38, (1.3, 2.5, 0.62), M["beanbag"], scale=(1.0, 0.9, 0.35), segments=32, rings=16)
    grp("furniture", bb)
    grp("furniture", dent)
    empty("SEAT_beanbag_0", (1.28, 2.32, 0.42))
    empty("SEAT_beanbag_0_look", (2.1, 3.2, 0.42))
    collider("beanbag", (1.1, 1.1, 0.6), (1.25, 2.35, 0.3))

    # TV console on the right wall
    cx, cy0, cy1 = RW - 0.24, 2.75, 5.05
    cl = cy1 - cy0
    cyc = (cy0 + cy1) / 2
    grp("furniture", rbox("console_body", (0.46, cl, 0.5), (cx, cyc, 0.42), M["wood"], bevel=0.015, segments=3))
    for sy in (-1, 1):
        for sx in (-1, 1):
            grp("furniture", rbox(f"console_leg{sx}{sy}", (0.035, 0.035, 0.18), (cx + sx * 0.17, cyc + sy * (cl / 2 - 0.08), 0.09), M["wood"], bevel=0.005, rot=(sx * 6, sy * 6, 0)))
    # slatted doors at both ends, open shelf in the middle
    for end in (-1, 1):
        dc = cyc + end * (cl / 2 - 0.42)
        for k in range(14):
            yy = dc - 0.38 + k * 0.055
            grp("furniture", rbox(f"console_slat{end}_{k}", (0.02, 0.04, 0.42), (cx - 0.235, yy, 0.42), M["wood_dark"], bevel=0.004, segments=2))
    grp("furniture", rbox("console_shelf_back", (0.02, 0.62, 0.42), (cx + 0.15, cyc, 0.42), M["wood_dark"], bevel=0))
    for k, (bm, h) in enumerate(((M["book1"], 0.22), (M["book2"], 0.2), (M["book3"], 0.24), (M["book1"], 0.19))):
        grp("furniture", rbox(f"book{k}", (0.24, 0.035, h), (cx - 0.02, cyc - 0.12 + k * 0.045, 0.2 + h / 2), bm, bevel=0.004))
    grp("furniture", rbox("game_console", (0.28, 0.32, 0.05), (cx - 0.02, cyc + 0.15, 0.22), M["speaker"], bevel=0.01))
    collider("console", (0.5, cl, 0.7), (cx, cyc, 0.35))
    # TV on the console (feet)
    tvy, tvz = cyc + 0.05, 1.38
    grp("props", rbox("tv_body", (0.06, 1.68, 0.98), (cx + 0.02, tvy, tvz), M["tv_body"], bevel=0.008, segments=2))
    screen = plane("tv_screen", 1.62, 0.92, (cx - 0.012, tvy, tvz), rot=(90, 0, -90), mat=M["tv_screen"])
    grp("props", screen)
    for s in (-1, 1):
        grp("props", rbox(f"tv_foot{s}", (0.22, 0.04, 0.03), (cx, tvy + s * 0.6, 0.69), M["tv_body"], bevel=0.008, rot=(0, -25 * s, 0)))
        grp("props", rbox(f"tv_post{s}", (0.03, 0.03, 0.2), (cx + 0.02, tvy + s * 0.6, 0.79), M["tv_body"], bevel=0.005))
    # speaker / candle at the right end
    grp("props", rbox("speaker", (0.12, 0.12, 0.16), (cx - 0.05, cy0 + 0.25, 0.75), M["speaker"], bevel=0.02))
    # table lamp on the console, left end
    ly = cy1 - 0.25
    grp("props", cylinder("lamp1_base", 0.07, 0.04, (cx - 0.02, ly, 0.69), M["metal"]))
    grp("props", cylinder("lamp1_stem", 0.012, 0.42, (cx - 0.02, ly, 0.9), M["metal"], verts=12))
    shade = cylinder("EMIT_lamp1_shade", 0.2, 0.3, (cx - 0.02, ly, 1.22), M["shade"], verts=40, radius_top=0.19, cap=True)
    EMISSIVE.append(shade)
    # side table + globe lamp right of the console
    sx_, sy_ = RW - 0.32, 2.2
    grp("furniture", cylinder("side_top", 0.26, 0.04, (sx_, sy_, 0.56), M["wood"], verts=40, bevel=0.01))
    grp("furniture", cylinder("side_leg", 0.035, 0.54, (sx_, sy_, 0.28), M["wood"], verts=16))
    grp("furniture", cylinder("side_foot", 0.18, 0.02, (sx_, sy_, 0.01), M["wood"], verts=32))
    grp("props", cylinder("globe_base", 0.08, 0.16, (sx_, sy_, 0.66), M["metal"], verts=24, radius_top=0.035))
    globe = sphere("EMIT_globe", 0.19, (sx_, sy_, 0.92), M["globe"], segments=40, rings=20)
    EMISSIVE.append(globe)
    collider("side", (0.55, 0.55, 0.6), (sx_, sy_, 0.3))

    # on the coffee table: lava lamp, fruit bowl, tea cup
    lx, ly2 = tx + 0.42, ty - 0.05
    grp("props", cylinder("lava_base", 0.075, 0.12, (lx, ly2, 0.51), M["metal"], verts=32, radius_top=0.05))
    lava = cylinder("EMIT_lava", 0.05, 0.26, (lx, ly2, 0.7), M["lava"], verts=32, radius_top=0.03)
    lava.modifiers.new("ss", "SUBSURF").levels = 1
    EMISSIVE.append(lava)
    grp("props", cylinder("lava_cap", 0.032, 0.05, (lx, ly2, 0.855), M["metal"], verts=24, radius_top=0.02))
    bowl = sphere("bowl", 0.17, (tx, ty + 0.02, 0.5), M["ceramic"], scale=(1, 1, 0.32), segments=40, rings=16)
    grp("props", bowl)
    fruits = [((-0.06, 0.02), 0.045, "orange"), ((0.05, 0.03), 0.045, "lemon"), ((0.0, -0.06), 0.047, "orange"), ((0.08, -0.05), 0.04, "apple"), ((-0.09, -0.06), 0.04, "apple")]
    for k, ((dx, dy), r, m) in enumerate(fruits):
        grp("props", sphere(f"fruit{k}", r, (tx + dx, ty + 0.02 + dy, 0.54), M[m], segments=20, rings=10))
    grp("props", cylinder("saucer", 0.075, 0.012, (tx - 0.42, ty + 0.12, 0.456), M["ceramic"], verts=32))
    grp("props", cylinder("cup", 0.045, 0.07, (tx - 0.42, ty + 0.12, 0.497), M["ceramic"], verts=32, radius_top=0.05))


def import_plant(asset, name, loc, height, rot_z=0, pot_mat=None, decimate=0.25):
    path_dir = os.path.join(PH, asset)
    gltf = [f for f in os.listdir(path_dir) if f.endswith(".gltf")][0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(path_dir, gltf))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        o.select_set(False)
    for o in new:
        if o.type != "MESH":
            # keep transforms on children
            pass
    # bake parent transforms into meshes
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    obj = blib.join(meshes, name) if len(meshes) > 1 else meshes[0]
    obj.name = name
    blib.apply_all(obj)
    if decimate < 1:
        d = obj.modifiers.new("dec", "DECIMATE")
        d.ratio = decimate
        blib.apply_all(obj)
    # normalise size and place on the floor
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    zmin = min(v.z for v in bb)
    zmax = max(v.z for v in bb)
    s = height / max(1e-3, zmax - zmin)
    obj.scale = (s, s, s)
    blib.apply_all(obj)
    bb = [Vector(c) for c in obj.bound_box]
    cxm = sum(v.x for v in bb) / 8
    cym = sum(v.y for v in bb) / 8
    zmin = min(v.z for v in bb)
    for v in obj.data.vertices:
        v.co.x -= cxm
        v.co.y -= cym
        v.co.z -= zmin
    obj.location = loc
    obj.rotation_euler = (0, 0, math.radians(rot_z))
    if pot_mat is not None:
        for i, m in enumerate(obj.data.materials):
            if m and m.name.lower().endswith("_pot"):
                obj.data.materials[i] = pot_mat
    return obj


def build_plants(M):
    plants = [
        import_plant("potted_plant_02", "plant_corner", (5.55, 6.1, 0), 1.75, rot_z=200, pot_mat=M["pot_white"]),
        import_plant("potted_plant_02", "plant_left", (0.45, 4.75, 0), 1.85, rot_z=40),
        import_plant("potted_plant_01", "plant_front", (0.35, 0.2, 0), 1.0, rot_z=10),
        import_plant("potted_plant_04", "plant_console", (RW - 0.26, 4.7, 0.67), 0.24, rot_z=0, decimate=0.5),
        import_plant("potted_plant_04", "plant_floor_r", (RW - 0.35, 2.55, 0), 0.4, rot_z=60, decimate=0.5),
    ]
    for p in plants:
        grp("plants", p)
    collider("plant_corner", (0.6, 0.6, 1.0), (5.55, 6.1, 0.5))
    collider("plant_left", (0.6, 0.6, 1.0), (0.45, 4.75, 0.5))
    collider("plant_front", (0.5, 0.5, 1.0), (0.35, 0.2, 0.5))


# ------------------------------------------------------------------ lights + camera

def build_lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = srgb("#2c2752")
    bg.inputs["Strength"].default_value = 0.8

    def light(name, kind, loc, color, energy, size=0.1, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name, kind)
        ld.color = srgb(color)[:3]
        ld.energy = energy
        if kind == "AREA":
            ld.shape = "RECTANGLE"
            ld.size = size[0]
            ld.size_y = size[1]
        elif kind in ("POINT", "SPOT"):
            ld.shadow_soft_size = size
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = [math.radians(a) for a in rot]
        blib.link(o)
        return o

    # window: cool night light coming in
    light("L_window", "AREA", (2.5, RD - 0.25, 1.7), "#6f78ff", 220, size=(4.4, 2.4), rot=(90, 0, 0))
    # room fill: violet skylight from above
    light("L_fill", "AREA", (3.6, 3.3, RH - 0.05), "#cdbcff", 430, size=(5.5, 4.5))
    light("L_fill_front", "AREA", (3.4, -1.2, 2.2), "#d9c4ff", 160, size=(4.0, 1.5), rot=(-80, 0, 0))
    # lamps
    light("L_lamp1", "POINT", (RW - 0.26, 4.8, 1.2), "#ffb066", 420, size=0.12)
    light("L_globe", "POINT", (RW - 0.32, 2.2, 0.92), "#ffc58a", 420, size=0.16)
    light("L_lava", "POINT", (3.57, 3.8, 0.72), "#ff5fd2", 28, size=0.05)
    # warm wash on the TV wall (the draft's pink/peach glow)
    light("L_wall_warm", "AREA", (RW - 0.6, 2.4, 2.6), "#ffb0bc", 130, size=(0.6, 2.5), rot=(0, -60, 0))


def build_camera():
    # The draft's camera: inside the front-left area, looking at the window/TV corner.
    cam_data = bpy.data.cameras.new("hero")
    cam_data.lens = 26
    cam_data.sensor_width = 36
    cam = bpy.data.objects.new("hero", cam_data)
    blib.link(cam)
    cam.location = (2.3, -0.15, 1.5)
    target = Vector((4.25, 5.0, 0.82))
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    empty("CAM_hero", tuple(cam.location))
    empty("CAM_hero_target", tuple(target))
    empty("SPAWN_0", (2.4, 2.9, 0))
    empty("SPAWN_1", (3.9, 2.3, 0))
    empty("SPAWN_2", (1.9, 3.1, 0))
    empty("SPAWN_3", (4.5, 2.9, 0))
    return cam


# ------------------------------------------------------------------ bake

def finalize_mesh(o):
    blib.apply_all(o)


def bake_group(name, objs, size, samples, out_dir, margin=6):
    objs = [o for o in objs if o.type == "MESH"]
    for o in objs:
        finalize_mesh(o)
    joined = blib.join(objs, "BAKED_" + name)
    me = joined.data
    # fresh lightmap UVs
    uv = me.uv_layers.new(name="bake")
    me.uv_layers.active = uv
    for o in bpy.context.selected_objects:
        o.select_set(False)
    joined.select_set(True)
    bpy.context.view_layer.objects.active = joined
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new("bake_" + name, width=size, height=size, alpha=False, float_buffer=True)
    # every material gets an active image node pointing at the bake image (and UV 'bake')
    mats = [m for m in me.materials if m]
    for m in mats:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "__bake__"
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "bake"
        nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
        nt.nodes.active = n
        # texture nodes for the material keep using the original UV map explicitly
        for tn in nt.nodes:
            if tn.type == "TEX_IMAGE" and tn.name != "__bake__" and not tn.inputs["Vector"].is_linked:
                u2 = nt.nodes.new("ShaderNodeUVMap")
                u2.uv_map = me.uv_layers[0].name
                nt.links.new(u2.outputs["UV"], tn.inputs["Vector"])
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.device = "CPU"
    scene.render.bake.margin = margin
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_diffuse = True
    scene.render.bake.use_pass_glossy = False
    scene.render.bake.use_pass_transmission = True
    scene.render.bake.use_pass_emit = True
    print(f"[bake] {name}: {len(me.polygons)} faces, {size}px, {samples} spp", flush=True)
    bpy.ops.object.bake(type="COMBINED")
    arr = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(arr)
    arr = arr.reshape(size, size, 4)[..., :3]
    arr = denoise(arr)
    path = os.path.join(out_dir, f"bake_{name}.png")
    save_display(arr, path)
    # swap materials for one baked material that the exporter writes as base colour
    out_img = bpy.data.images.load(path)
    bm = bpy.data.materials.new("BAKED_" + name)
    bm.use_nodes = True
    nt = bm.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = out_img
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "bake"
    nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    me.materials.clear()
    me.materials.append(bm)
    # keep only the bake UV for export
    for l in list(me.uv_layers):
        if l.name != "bake":
            me.uv_layers.remove(l)
    return joined


EXPOSURE = 1.45


def save_display(arr, path):
    """Linear radiance -> sRGB 8-bit with a soft shoulder (the client tone-maps on top)."""
    x = np.clip(arr * EXPOSURE, 0, None)
    knee = 0.75
    hi = x > knee
    x[hi] = knee + (1 - knee) * (1 - np.exp(-(x[hi] - knee) / (1 - knee)))
    s = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    s = np.clip(s, 0, 1)
    h, w = s.shape[:2]
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = s
    img = bpy.data.images.new("save_" + os.path.basename(path), width=w, height=h, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


def denoise(arr, radius=2):
    """Edge-aware box blur that ignores empty texels (keeps island borders clean)."""
    mask = (arr.sum(axis=2) > 1e-6).astype(np.float32)
    acc = np.zeros_like(arr)
    wsum = np.zeros(arr.shape[:2], np.float32)
    lum = arr.mean(axis=2)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            sh = np.roll(np.roll(arr, dy, 0), dx, 1)
            sm = np.roll(np.roll(mask, dy, 0), dx, 1)
            sl = np.roll(np.roll(lum, dy, 0), dx, 1)
            w = sm * np.exp(-((sl - lum) ** 2) / (2 * (0.08 + 0.25 * lum) ** 2)) * math.exp(-(dx * dx + dy * dy) / (2 * radius * radius))
            acc += sh * w[..., None]
            wsum += w
    out = np.where(wsum[..., None] > 0, acc / np.maximum(wsum[..., None], 1e-6), arr)
    return out


def bake_plant(obj, size, samples, out_dir):
    """Bake a Poly Haven plant into its own UVs (per material image)."""
    finalize_mesh(obj)
    me = obj.data
    scene = bpy.context.scene
    imgs = []
    for m in [m for m in me.materials if m]:
        img = bpy.data.images.new(f"bake_{obj.name}_{m.name}", width=size, height=size, alpha=False, float_buffer=True)
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "__bake__"
        nt.nodes.active = n
        imgs.append((m, img))
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene.cycles.samples = samples
    print(f"[bake] plant {obj.name}: {len(me.polygons)} faces", flush=True)
    bpy.ops.object.bake(type="COMBINED")
    for m, img in imgs:
        arr = np.empty(size * size * 4, np.float32)
        img.pixels.foreach_get(arr)
        arr = denoise(arr.reshape(size, size, 4)[..., :3], radius=1)
        path = os.path.join(out_dir, f"bake_{obj.name}_{m.name}.png".replace(" ", "_"))
        save_display(arr, path)
        out = bpy.data.images.load(path)
        nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        # keep alpha from the source diffuse (leaf cut-outs), replace colour with the bake
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = out
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        for l in list(bsdf.inputs["Normal"].links):
            nt.links.remove(l)
        bsdf.inputs["Roughness"].default_value = 1.0
        for nn in list(nt.nodes):
            if nn.type == "TEX_IMAGE" and nn not in (t,) and not any(lk.to_socket.name == "Alpha" for lk in nn.outputs["Alpha"].links):
                if nn.name == "__bake__" or not nn.outputs["Alpha"].links:
                    nt.nodes.remove(nn)
        m.name = "BAKED_" + m.name


def main():
    scene = blib.reset_scene()
    global M
    M = make_materials()
    build_shell(M)
    build_furniture(M)
    build_plants(M)
    build_lights()
    build_camera()
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.view_settings.view_transform = "AgX" if "AgX" in [i.name for i in type(scene.view_settings).bl_rna.properties["view_transform"].enum_items] else "Filmic"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.3

    preview = arg("--preview")
    if preview:
        scene.cycles.samples = int(arg("--samples", 24))
        scene.cycles.use_denoising = False
        scene.render.resolution_x = int(arg("--w", 800))
        scene.render.resolution_y = int(arg("--h", 450))
        scene.render.filepath = preview
        bpy.ops.render.render(write_still=True)
        print("preview ->", preview)
        return

    if arg("--bake"):
        out = arg("--out")
        samples = int(arg("--samples", 64))
        work = os.path.join(blib.HERE, "out", "bakes")
        os.makedirs(work, exist_ok=True)
        sizes = {"floor": 2048, "shell": 2048, "furniture": 2048, "props": 1024}
        baked = []
        for g in ("floor", "shell", "furniture", "props"):
            baked.append(bake_group(g, GROUPS[g], int(arg("--size", sizes[g])) if arg("--size") else sizes[g], samples, work))
        for p in GROUPS["plants"]:
            bake_plant(p, 1024, max(16, samples // 2), work)
        # the floor mesh keeps its name for click-to-move picking
        for o in baked:
            if o.name == "BAKED_floor":
                o.name = "FLOOR"
        for o in EMISSIVE:
            finalize_mesh(o)
        export(out)


def export(out):
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    for o in bpy.data.objects:
        if o.type == "LIGHT" or o.type == "CAMERA":
            o.select_set(False)
    # colliders: export as plain boxes without materials (client hides them)
    for c in COLLIDERS:
        c.hide_render = False
        c.data.materials.clear()
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=84,
        export_image_webp_fallback=False,
        export_animations=False,
    )
    print("exported ->", out)


if __name__ == "__main__":
    main()
