"""Descall 3D world: the game room ("Oyun odası"), built from code.

Target: docs/design/3d-world/scene-2.jpg. The draft looks diagonally into the room's
back-left corner: blue panelled left wall with a long shelf, purple back wall with a
bookcase of board games and floating shelves, brass pendant lamps, warm planks, a
purple rug. Tables:
  * blackjack ("Masa 2", front, green felt): 5 player chairs + the robot dealer
    (robot-dealer.glb, its own rigged GLB) — the draft's five players round the robot;
  * okey ("Masa 1", back left, green felt): 4 chairs, rack + tile anchors;
  * tavla (back right, sand felt, where the draft shows a board on the table): 2 chairs;
  * chess (front right, outside the hero view: the draft has no free table): 2 chairs.
Game pieces are separate GLBs (build_game_pieces.py); this room only has their anchors.
Points only: no chips, stakes or prizes anywhere.

  blender -b -P tools/world3d/build_game_room.py -- --preview out.png [--samples 16]
  blender -b -P tools/world3d/build_game_room.py -- --bake --samples 40 --out frontend/public/world3d/game-room.glb

Blender axes: Z up. Room interior x 0..9.6, y 0..11.1 (back wall at y = 11.1: blue left of
x = 2.9, purple right of it), z 0..3.0. Camera fitted to the draft's table ellipse
(out/tmp fit, hfov 55): (4.6, 0.91, 2.06), yaw 2.2, pitch -15.3.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

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


W, D, H = 9.6, 11.1, 3.0
SPLIT = 2.9  # back wall: blue left of x = SPLIT, purple right of it
ACG = os.path.join(blib.CACHE, "ambientcg")
GEN = os.path.join(blib.CACHE, "gen", "rooms")
REPO = os.path.normpath(os.path.join(blib.HERE, "..", ".."))

TABLE_H = 0.76
BJ = {"c": (4.6, 4.6), "r": 1.28, "dealer_phi": -150.0}  # blackjack; phi 0 points at the camera, + to its left
OKEY = {"c": (1.55, 8.9), "r": 0.92}
TAVLA = {"c": (7.87, 8.6), "r": 0.95}
CHESS = {"c": (8.5, 1.7), "r": 0.6}

kit = roomkit.Kit("game-room")
M = {}
LIGHTS = {}
CAM = {}


def V(x, y, z=0.0):
    return Vector((x, y, z))


# ------------------------------------------------------------------ materials

def make_materials():
    M["floor"] = roomkit.textured_gray("floor", os.path.join(ACG, "WoodFloor040"), "WoodFloor040", tint="#c48e74", rough=0.5, scale=0.5, normal_strength=0.4, detail=0.85)
    M["wall_blue"] = principled("wall_blue", "#3f6fa0", 0.9)
    M["wall_blue_dark"] = principled("wall_blue_dark", "#33618f", 0.85)
    M["wall_purple"] = principled("wall_purple", "#6a5cae", 0.9)
    M["ceiling"] = principled("ceiling", "#4a4272", 0.95)
    M["trim"] = principled("trim", "#2c5585", 0.6)
    M["wood"] = roomkit.textured_gray("wood", os.path.join(ACG, "Wood049"), "Wood049", tint="#b4734c", rough=0.5, scale=1.2, detail=0.5)
    M["wood_dark"] = roomkit.textured_gray("wood_dark", os.path.join(ACG, "Wood049"), "Wood049", tint="#7a4a32", rough=0.5, scale=1.2, detail=0.5)
    M["felt"] = roomkit.textured_gray("felt", os.path.join(ACG, "Fabric023"), "Fabric023", tint="#3aa476", rough=1.0, scale=4.0, normal_strength=0.2, detail=0.25)
    M["felt_sand"] = roomkit.textured_gray("felt_sand", os.path.join(ACG, "Fabric023"), "Fabric023", tint="#d8b494", rough=1.0, scale=4.0, normal_strength=0.2, detail=0.25)
    M["chair"] = roomkit.textured_gray("chair", os.path.join(ACG, "Fabric030"), "Fabric030", tint="#e0907a", rough=0.95, scale=3.0, normal_strength=0.3, detail=0.3)
    M["chair_slate"] = roomkit.textured_gray("chair_slate", os.path.join(ACG, "Fabric030"), "Fabric030", tint="#55607e", rough=0.95, scale=3.0, normal_strength=0.3, detail=0.3)
    M["rug"] = roomkit.textured_gray("rug", os.path.join(ACG, "Carpet012"), "Carpet012", tint="#7a5cb4", rough=1.0, scale=1.5, detail=0.4)
    M["rug_border"] = roomkit.textured_gray("rug_border", os.path.join(ACG, "Carpet012"), "Carpet012", tint="#5c4494", rough=1.0, scale=1.5, detail=0.4)
    M["brass"] = principled("brass", "#c9a46a", 0.35, metal=0.75)
    M["cord"] = principled("cord", "#2a2630", 0.6)
    M["pot_white"] = principled("pot_white", "#ece6f2", 0.55)
    M["pot_lav"] = principled("pot_lav", "#c9b8e6", 0.55)
    M["pot_terra"] = principled("pot_terra", "#c8704e", 0.7)
    M["soil"] = principled("soil", "#3a2a22", 1.0)
    M["leaf"] = principled("leaf", "#3f8a48", 0.55)
    M["leaf2"] = principled("leaf2", "#56a052", 0.55)
    M["stem"] = principled("stem", "#5f8f45", 0.7)
    M["ceramic"] = principled("ceramic", "#f0e8ee", 0.4)
    M["vase_pink"] = principled("vase_pink", "#e48aa8", 0.4)
    M["figurine"] = principled("figurine", "#6a5a4a", 0.5, metal=0.2)
    M["frame"] = principled("frame", "#d8c8b0", 0.6)
    M["window_glow"] = blib.emissive("EMIT_window", "#9ec8ff", 1.6)
    covers = bpy.data.images.load(os.path.join(GEN, "game_covers.png"))
    M["covers"] = principled("covers", "#ffffff", 0.7)
    t = M["covers"].node_tree.nodes.new("ShaderNodeTexImage")
    t.image = covers
    M["covers"].node_tree.links.new(t.outputs["Color"], M["covers"].node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    M["lamp_in"] = blib.emissive("EMIT_lamp", "#ffd9a0", 8.0)
    M["bulb"] = blib.emissive("EMIT_bulb", "#ffe4c0", 7.0)


# ------------------------------------------------------------------ shell

def build_shell():
    fl = plane("FLOOR", W, D, (W / 2, D / 2, 0), mat=M["floor"])
    roomkit.uv_metres(fl)
    kit.grp("floor", fl)
    ce = plane("ceiling", W, D, (W / 2, D / 2, H), rot=(180, 0, 0), mat=M["ceiling"])
    kit.grp("shell", ce)
    t = 0.15
    # back wall (y = D): blue panelled section on the left, purple on the right, a pier between
    kit.grp("shell", rbox("wall_back_blue", (SPLIT + t, t, H), ((SPLIT - t) / 2, D + t / 2, H / 2), M["wall_blue"], bevel=0))
    kit.grp("shell", rbox("wall_back_purple", (W - SPLIT + t, t, H), ((W + SPLIT + t) / 2, D + t / 2, H / 2), M["wall_purple"], bevel=0))
    for k in range(int(SPLIT / 0.16)):
        x = 0.08 + k * 0.16
        kit.grp("shell", rbox(f"wainscot{k}", (0.15, 0.03, 1.05), (x, D - 0.015, 0.525), M["wall_blue_dark"], bevel=0.008, segments=2))
    kit.grp("shell", rbox("rail", (SPLIT, 0.05, 0.05), (SPLIT / 2, D - 0.025, 1.08), M["trim"], bevel=0.01))
    kit.grp("shell", rbox("pier", (0.45, 0.32, H), (SPLIT, D - 0.16, H / 2), M["wall_blue"], bevel=0.01))
    # side walls (left blue with wainscot, right purple) and the wall behind the camera
    kit.grp("shell", rbox("wall_left", (t, D + 2 * t, H), (-t / 2, D / 2, H / 2), M["wall_blue"], bevel=0))
    for k in range(int(D / 0.16)):
        kit.grp("shell", rbox(f"wainscotL{k}", (0.03, 0.15, 1.05), (0.015, 0.08 + k * 0.16, 0.525), M["wall_blue_dark"], bevel=0.008, segments=2))
    kit.grp("shell", rbox("railL", (0.05, D, 0.05), (0.025, D / 2, 1.08), M["trim"], bevel=0.01))
    kit.grp("shell", rbox("wall_right", (t, D + 2 * t, H), (W + t / 2, D / 2, H / 2), M["wall_purple"], bevel=0))
    kit.grp("shell", rbox("wall_front", (W + 2 * t, t, H), (W / 2, -t / 2, H / 2), M["wall_purple"], bevel=0))
    for name, size, loc in (("skirt_back", (W - SPLIT, 0.025, 0.1), ((W + SPLIT) / 2, D - 0.012, 0.05)), ("skirt_right", (0.025, D, 0.1), (W - 0.012, D / 2, 0.05))):
        kit.grp("shell", rbox(name, size, loc, M["wood_dark"], bevel=0.004))
    # window high on the blue wall (the draft's light rectangle top left)
    kit.grp("shell", rbox("window_frame", (1.3, 0.08, 0.8), (0.75, D - 0.05, 2.5), M["frame"], bevel=0.01))
    win = plane("EMIT_window", 1.18, 0.68, (0.75, D - 0.095, 2.5), rot=(90, 0, 0), mat=M["window_glow"])
    if (win.matrix_world.to_3x3() @ win.data.polygons[0].normal).y > 0:
        for pg in win.data.polygons:
            pg.flip()
    kit.emit(win)
    # purple rug between the tables (draft: purple patch behind the blackjack table)
    kit.grp("rug", rbox("rug", (3.0, 2.0, 0.02), (4.4, 9.6, 0.01), M["rug"], bevel=0.008, segments=2, rot=(0, 0, -6)))
    kit.grp("rug", rbox("rug_border", (3.2, 2.2, 0.012), (4.4, 9.6, 0.006), M["rug_border"], bevel=0.004, rot=(0, 0, -6)))
    kit.room_bounds(0, 0, W, D, H)


# ------------------------------------------------------------------ furniture

def round_table(prefix, c, r, felt, rim_w=0.1):
    x, y = c
    g = []
    g.append(cylinder(prefix + "_rim", r, 0.07, (x, y, TABLE_H - 0.035), M["wood"], verts=72, bevel=0.025))
    g.append(cylinder(prefix + "_felt", r - rim_w, 0.012, (x, y, TABLE_H + 0.002), felt, verts=72))
    g.append(cylinder(prefix + "_apron", r - 0.08, 0.1, (x, y, TABLE_H - 0.11), M["wood_dark"], verts=64))
    g.append(cylinder(prefix + "_column", 0.12, TABLE_H - 0.2, (x, y, (TABLE_H - 0.2) / 2 + 0.06), M["wood_dark"], verts=32, radius_top=0.09))
    g.append(cylinder(prefix + "_foot", 0.45, 0.07, (x, y, 0.035), M["wood_dark"], verts=48, radius_top=0.36, bevel=0.015))
    for o in g:
        kit.grp("furniture", o)
    kit.collider(prefix, (2 * r * 0.92, 2 * r * 0.92), c)
    kit.collider(prefix + "_b", (2 * r * 0.92, 2 * r * 0.92), c, rot_z=45)


def chair(prefix, x, y, facing_deg, mat):
    """Upholstered chair with a rounded back, facing direction facing_deg (0 = +Y)."""
    rz = facing_deg
    a = math.radians(rz)
    fx, fy = -math.sin(a), math.cos(a)

    def P(lx, ly, z):
        # local: +y = forward (towards the table)
        return (x + lx * math.cos(a) - ly * math.sin(a), y + lx * math.sin(a) + ly * math.cos(a), z)

    g = []
    g.append(rbox(prefix + "_seat", (0.5, 0.48, 0.1), P(0, 0, 0.44), mat, bevel=0.04, segments=3, rot=(0, 0, rz)))
    g.append(rbox(prefix + "_back", (0.5, 0.08, 0.5), P(0, -0.24, 0.74), mat, bevel=0.035, segments=3, rot=(-8, 0, rz)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = cylinder(f"{prefix}_leg{sx}{sy}", 0.02, 0.42, P(sx * 0.2, sy * 0.19, 0.2), M["wood"], verts=10)
            leg.rotation_euler = (math.radians(sy * 4), math.radians(-sx * 4), 0)
            g.append(leg)
    for o in g:
        kit.grp("chairs", o)
    return g


def table_seats(table, prefix, phis, chair_mat, kind, dist=None, skip=()):
    cx, cy = table["c"]
    r = table["r"]
    cam_dir = Vector(CAM["pos"][:2]) - Vector((cx, cy))
    base = math.degrees(math.atan2(cam_dir.x, cam_dir.y))  # phi 0 -> towards the camera
    names = []
    for k, phi in enumerate(phis):
        ang = math.radians(base + phi)
        d = Vector((math.sin(ang), math.cos(ang)))
        seat_d = r + (dist if dist is not None else 0.36)
        sx, sy = cx + d.x * seat_d, cy + d.y * seat_d
        facing = -d  # towards the centre
        face_deg = math.degrees(math.atan2(-facing.x, facing.y))
        if k not in skip:
            chair(f"{prefix}_chair{k}", sx, sy, face_deg, chair_mat)
        root = (sx + facing.x * 0.13, sy + facing.y * 0.13)
        side = Vector((facing.y, -facing.x))
        appr = pick_approach(sx, sy, facing, side)
        names.append(kit.seat(f"SEAT_{prefix}_{k}", root, (facing.x, facing.y), kind, height=0.47, approach=appr,
                              extra={"table": prefix}))
    return names, base


def pick_approach(sx, sy, facing, side):
    """First walkable spot next to a chair: behind-left, behind-right, left, right."""
    tables = [(BJ["c"], BJ["r"]), (OKEY["c"], OKEY["r"]), (TAVLA["c"], TAVLA["r"]), (CHESS["c"], CHESS["r"])]
    for back, sd in ((0.35, 1), (0.35, -1), (0.0, 1), (0.0, -1), (-0.15, 1), (-0.15, -1), (0.6, 0)):
        x = sx - facing.x * back + side.x * 0.5 * sd
        y = sy - facing.y * back + side.y * 0.5 * sd
        if not (0.32 < x < W - 0.32 and 0.32 < y < D - 0.32):
            continue
        # table colliders: two squares of half size 0.92 r (an octagon); keep the avatar (0.24) clear
        if any(math.hypot(x - c[0], y - c[1]) < r * 0.92 / math.cos(math.pi / 8) + 0.3 for c, r in tables):
            continue
        return (x, y)
    raise SystemExit(f"no walkable approach for the chair at {sx:.2f}, {sy:.2f}")


def bookcase(x, y, w=1.3, h=2.05, depth=0.38):
    """Wooden bookcase against the back wall: open shelves of board games over a cabinet."""
    g = []
    g.append(rbox("bc_side_l", (0.04, depth, h), (x - w / 2 + 0.02, y, h / 2), M["wood"], bevel=0.008))
    g.append(rbox("bc_side_r", (0.04, depth, h), (x + w / 2 - 0.02, y, h / 2), M["wood"], bevel=0.008))
    g.append(rbox("bc_top", (w, depth + 0.02, 0.04), (x, y, h), M["wood"], bevel=0.008))
    g.append(rbox("bc_back", (w, 0.02, h), (x, y + depth / 2 - 0.01, h / 2), M["wood_dark"], bevel=0))
    g.append(rbox("bc_cab", (w - 0.04, depth, 0.62), (x, y, 0.31), M["wood"], bevel=0.01))
    for k in (-1, 1):
        g.append(rbox(f"bc_door{k}", (w / 2 - 0.05, 0.02, 0.54), (x + k * w / 4, y - depth / 2 - 0.005, 0.33), M["wood"], bevel=0.008))
        g.append(rbox(f"bc_knob{k}", (0.02, 0.03, 0.12), (x + k * 0.05, y - depth / 2 - 0.025, 0.42), M["wood_dark"], bevel=0.006))
    rnd = random.Random(21)
    for si, z in enumerate((0.64, 1.1, 1.56)):
        g.append(rbox(f"bc_shelf{si}", (w - 0.06, depth - 0.02, 0.03), (x, y, z), M["wood"], bevel=0.006))
        xx = x - w / 2 + 0.08
        while xx < x + w / 2 - 0.12:
            if rnd.random() < 0.55:
                # board-game box standing on its side, cover to the room
                bw, bh = rnd.uniform(0.18, 0.28), rnd.uniform(0.26, 0.36)
                g.append(game_box(f"bc_box{si}_{len(g)}", (xx + bw / 2, y - depth / 2 + 0.06, z + 0.015 + bh / 2), (bw, 0.05, bh), rnd.randrange(16), rot=(rnd.uniform(-6, 6), 0, 0)))
                xx += bw + 0.02
            else:
                n = rnd.randrange(3, 6)
                for b in range(n):
                    bh = rnd.uniform(0.2, 0.3)
                    g.append(game_box(f"bc_book{si}_{len(g)}", (xx + 0.02, y - depth / 2 + 0.12, z + 0.015 + bh / 2), (0.035, 0.18, bh), rnd.randrange(16, 32)))
                    xx += 0.04
                xx += 0.03
    for o in g:
        kit.grp("props", o)
    kit.collider("bookcase", (w, depth + 0.05), (x, y))


def game_box(name, loc, size, cell, rot=(0, 0, 0)):
    """Box (or book) whose front face shows cell `cell` of game_covers.png (8 x 4 cells)."""
    o = rbox(name, size, loc, M["covers"], bevel=0.006, segments=1, rot=rot)
    blib.apply_all(o)
    me = o.data
    uv = me.uv_layers.new(name="UVMap")
    cx, cy = cell % 8, cell // 8
    u0, v0 = cx / 8, 1 - (cy + 1) / 4
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    xs = [p.x for p in bb]
    zs = [p.z for p in bb]
    ys = [p.y for p in bb]
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if n.y < -0.7:  # front face (towards -Y, the room)
                u = (co.x - min(xs)) / max(1e-4, max(xs) - min(xs))
                v = (co.z - min(zs)) / max(1e-4, max(zs) - min(zs))
                uv.data[li].uv = (u0 + 0.06 / 8 + u * 0.88 / 8, v0 + 0.06 / 4 + v * 0.88 / 4)
            else:  # sides / spine: a strip of the cover's edge colour
                uv.data[li].uv = (u0 + 0.02 / 8, v0 + (0.5 + 0.4 * (co.z - min(zs)) / max(1e-4, max(zs) - min(zs)) - 0.2) / 4)
    return o


def wall_shelves():
    """Two floating shelves on the purple wall (right of the bookcase) with games and books."""
    rnd = random.Random(8)
    g = []
    for si, (z, x0, x1) in enumerate(((1.55, 5.9, 9.3), (2.1, 6.1, 9.2))):
        g.append(rbox(f"ws_board{si}", (x1 - x0, 0.26, 0.04), ((x0 + x1) / 2, D - 0.13, z), M["wood"], bevel=0.008))
        for bx in (x0 + 0.25, x1 - 0.25):
            g.append(rbox(f"ws_bracket{si}_{bx:.1f}", (0.04, 0.2, 0.2), (bx, D - 0.11, z - 0.11), M["wood"], bevel=0.008, rot=(0, 0, 0)))
        xx = x0 + 0.1
        while xx < x1 - 0.15:
            r = rnd.random()
            if r < 0.5:
                bw, bh = rnd.uniform(0.2, 0.26), rnd.uniform(0.28, 0.34)
                g.append(game_box(f"ws_box{si}_{len(g)}", (xx + bw / 2, D - 0.2, z + 0.02 + bh / 2), (bw, 0.06, bh), rnd.randrange(16), rot=(-4, 0, 0)))
                xx += bw + 0.04
            elif r < 0.85:
                for b in range(rnd.randrange(3, 7)):
                    bh = rnd.uniform(0.22, 0.3)
                    g.append(game_box(f"ws_book{si}_{len(g)}", (xx + 0.02, D - 0.14, z + 0.02 + bh / 2), (0.035, 0.2, bh), rnd.randrange(16, 32)))
                    xx += 0.04
                xx += 0.05
            else:
                g.append(sphere(f"ws_fig{si}_{len(g)}", 0.06, (xx + 0.08, D - 0.15, z + 0.1), M["figurine"], scale=(1, 1, 1.3), segments=16, rings=10))
                g.append(cylinder(f"ws_figb{si}_{len(g)}", 0.05, 0.05, (xx + 0.08, D - 0.15, z + 0.045), M["figurine"], verts=16))
                xx += 0.2
    for o in g:
        kit.grp("props", o)


def left_shelf():
    """The long shelf on the blue part of the back wall: small plants, a pencil cup, vases."""
    y = D - 0.13
    g = [rbox("ls_board", (2.5, 0.26, 0.05), (1.35, y, 1.45), M["wood"], bevel=0.01)]
    items = [(0.35, "succulent"), (0.75, "cup"), (1.5, "vase"), (1.75, "bottle"), (2.45, "succulent")]
    for x, kind in items:
        if kind == "succulent":
            g.append(cylinder(f"ls_pot{x}", 0.07, 0.11, (x, y, 1.53), M["pot_white"], verts=24, radius_top=0.08))
            for k in range(7):
                a = k * 2 * math.pi / 7
                g.append(sphere(f"ls_leaf{x}_{k}", 0.05, (x + 0.04 * math.cos(a), y + 0.04 * math.sin(a), 1.63), M["leaf2"], scale=(0.5, 0.5, 1.3), segments=10, rings=6, rot=(math.degrees(0.4 * math.sin(a)), math.degrees(0.4 * math.cos(a)), 0)))
        elif kind == "cup":
            g.append(cylinder(f"ls_cup{x}", 0.05, 0.12, (x, y, 1.535), M["pot_terra"], verts=20))
            for k in range(3):
                pen = cylinder(f"ls_pen{x}_{k}", 0.006, 0.18, (x + 0.015 * k, y - 0.01 * k, 1.63), M["vase_pink"], verts=6)
                pen.rotation_euler = (math.radians(8 * (k - 1)), math.radians(6), 0)
                g.append(pen)
        elif kind == "vase":
            g.append(cylinder(f"ls_vase{x}", 0.04, 0.2, (x, y, 1.575), M["vase_pink"], verts=20, radius_top=0.025))
        else:
            g.append(cylinder(f"ls_bottle{x}", 0.035, 0.14, (x, y, 1.545), M["ceramic"], verts=16, radius_top=0.02))
    for o in g:
        kit.grp("props", o)


def pendant(name, x, y, z_bottom, radius, kind="dome"):
    g = []
    if kind == "dome":
        shade = cylinder(name + "_shade", radius, radius * 0.5, (x, y, z_bottom + radius * 0.25), M["brass"], verts=48, radius_top=radius * 0.28, cap=False)
        sol = shade.modifiers.new("solid", "SOLIDIFY")
        sol.thickness = 0.012
        g.append(shade)
        g.append(cylinder(name + "_cap", radius * 0.3, 0.08, (x, y, z_bottom + radius * 0.5 + 0.04), M["brass"], verts=24, radius_top=0.05))
        diff = cylinder("EMIT_" + name, radius * 0.92, 0.01, (x, y, z_bottom + 0.03), M["lamp_in"], verts=48)
        kit.emit(diff)
        top = z_bottom + radius * 0.5 + 0.08
    else:
        b = sphere("EMIT_" + name, radius, (x, y, z_bottom + radius), M["bulb"], segments=32, rings=16)
        kit.emit(b)
        top = z_bottom + 2 * radius
    g.append(cylinder(name + "_cord", 0.006, H - top, (x, y, (H + top) / 2), M["cord"], verts=8))
    g.append(cylinder(name + "_rose", 0.06, 0.03, (x, y, H - 0.015), M["brass"], verts=20))
    for o in g:
        kit.grp("props", o)
    return (x, y, z_bottom)


def leaf_plant(name, loc, height, pot_mat, leaves=11, seed=5):
    """Broad-leaf plant (own geometry): tapered pot, stems, wide oval leaves."""
    rnd = random.Random(seed)
    x0, y0, z0 = loc
    g = []
    pot_h = 0.45
    g.append(cylinder(name + "_pot", 0.22, pot_h, (x0, y0, z0 + pot_h / 2), pot_mat, verts=40, radius_top=0.27, bevel=0.012))
    g.append(cylinder(name + "_soil", 0.25, 0.02, (x0, y0, z0 + pot_h - 0.03), M["soil"], verts=32))
    for i in range(leaves):
        az = i * 2.4 + rnd.uniform(-0.2, 0.2)
        tilt = rnd.uniform(0.15, 0.7)
        L = height * rnd.uniform(0.45, 0.85)
        base = V(x0, y0, z0 + pot_h - 0.02)
        d = Vector((math.sin(tilt) * math.cos(az), math.sin(tilt) * math.sin(az), math.cos(tilt)))
        tip = base + d * L
        st = cylinder(f"{name}_stem{i}", 0.01, (tip - base).length, (0, 0, 0), M["stem"], verts=8)
        st.rotation_mode = "QUATERNION"
        st.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
        st.location = (base + tip) / 2
        g.append(st)
        g.append(broad_leaf(f"{name}_leaf{i}", tip, d, height * rnd.uniform(0.28, 0.36), rnd))
    for o in g:
        kit.grp("props", o)
    kit.collider(name, (0.6, 0.6), (x0, y0))


def broad_leaf(name, origin, direction, L, rnd):
    bm = bmesh.new()
    nu, nv = 10, 5
    W_ = L * 0.45
    rows = []
    for i in range(nu + 1):
        u = i / nu
        half = W_ / 2 * math.sin(math.pi * min(1.0, u)) ** 0.8
        row = []
        for j in range(nv):
            v = -1 + 2 * j / (nv - 1)
            row.append(bm.verts.new((v * half, u * L, -0.25 * L * u * u + abs(v) * half * 0.3)))
        rows.append(row)
    for i in range(nu):
        for j in range(nv - 1):
            bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    obj = blib.mesh_from_bmesh(name, bm)
    horiz = Vector((direction.x, direction.y, 0))
    if horiz.length < 1e-4:
        horiz = Vector((1, 0, 0))
    horiz.normalize()
    pitch = rnd.uniform(0.4, 1.0)
    fwd = (horiz * math.cos(pitch) + Vector((0, 0, math.sin(pitch)))).normalized()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(fwd)
    obj.location = origin
    blib.set_mat(obj, M["leaf"] if rnd.random() < 0.6 else M["leaf2"])
    sol = obj.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.004
    blib.shade_smooth(obj)
    return obj


def build_furniture():
    # tables
    round_table("bj", BJ["c"], BJ["r"], M["felt"])
    round_table("okey", OKEY["c"], OKEY["r"], M["felt"])
    round_table("tavla", TAVLA["c"], TAVLA["r"], M["felt_sand"])
    round_table("chess", CHESS["c"], CHESS["r"], M["wood"])
    # okey table: centre mat (the draft's square in the middle)
    kit.grp("furniture", rbox("okey_mat", (0.42, 0.42, 0.006), (OKEY["c"][0], OKEY["c"][1], TABLE_H + 0.01), M["felt_sand"], bevel=0.002, rot=(0, 0, 30)))
    # seats: blackjack 5 players (phi 90, 30, -30, -90, -150) + dealer (150)
    bj_phis = [150.0, 90.0, 30.0, -30.0, -90.0]
    bj_names, bj_base = table_seats(BJ, "bj", bj_phis, M["chair_slate"], "chair")
    okey_names, okey_base = table_seats(OKEY, "okey", [-135.0, -45.0, 45.0, 135.0], M["chair"], "chair", dist=0.3)
    tavla_names, tavla_base = table_seats(TAVLA, "tavla", [-60.0, 120.0], M["chair"], "chair", dist=0.3)
    chess_names, chess_base = table_seats(CHESS, "chess", [90.0, -90.0], M["chair"], "chair", dist=0.28)
    # extra chairs round the tavla table like the draft (spectators, no seat anchor)
    cx, cy = TAVLA["c"]
    for k, phi in enumerate((30.0, -150.0)):
        ang = math.radians(tavla_base + phi)
        d = Vector((math.sin(ang), math.cos(ang)))
        chair(f"tavla_extra{k}", cx + d.x * (TAVLA["r"] + 0.3), cy + d.y * (TAVLA["r"] + 0.3), math.degrees(math.atan2(d.x, -d.y)), M["chair"])
    anchors_tables(bj_names, bj_base, okey_names, okey_base, tavla_names, tavla_base, chess_names, chess_base)
    # back wall
    bookcase(4.9, D - 0.2)
    wall_shelves()
    left_shelf()
    leaf_plant("plant", (3.75, D - 0.5, 0), 1.6, M["pot_lav"], leaves=12)
    # pendants (z = bottom of the shade)
    LIGHTS["pendants"] = [
        pendant("lamp_bj", BJ["c"][0], BJ["c"][1] + 0.1, 1.92, 0.46),
        pendant("lamp_okey", OKEY["c"][0], OKEY["c"][1], 1.98, 0.36),
        pendant("lamp_tavla", TAVLA["c"][0], TAVLA["c"][1], 1.98, 0.38),
        pendant("lamp_chess", CHESS["c"][0], CHESS["c"][1], 2.0, 0.3),
    ]
    LIGHTS["globe"] = pendant("globe", 2.35, 9.7, 1.95, 0.14, kind="globe")


def ring(c, r, phi_deg, base, z=TABLE_H + 0.01):
    a = math.radians(base + phi_deg)
    return (c[0] + math.sin(a) * r, c[1] + math.cos(a) * r, z)


def facing_yaw(frm, to):
    return roomkit.bab_yaw(to[0] - frm[0], to[1] - frm[1])


def anchors_tables(bj_names, bj_base, okey_names, okey_base, tavla_names, tavla_base, chess_names, chess_base):
    """Table anchors in Babylon space: where dealt cards, racks, tiles and boards go."""
    c, r = BJ["c"], BJ["r"]
    dealer = ring(c, r + 0.42, BJ["dealer_phi"], bj_base, 0.0)
    kit.anchor("dealer", {"pos": roomkit.bab(dealer), "yaw": facing_yaw(dealer, c), "glb": "robot-dealer.glb", "table": "bj"})
    tables = []
    tables.append({
        "id": "bj", "game": "blackjack", "label": "Masa 2", "center": roomkit.bab((c[0], c[1], TABLE_H)), "radius": r,
        "surfaceY": TABLE_H + 0.008, "seats": bj_names, "dealer": "dealer",
        "spots": {
            "dealerCards": {"pos": roomkit.bab(ring(c, r - 0.42, BJ["dealer_phi"], bj_base)), "yaw": facing_yaw(ring(c, 1, BJ["dealer_phi"], bj_base), c)},
            "shoe": {"pos": roomkit.bab(ring(c, r - 0.3, BJ["dealer_phi"] - 28, bj_base)), "yaw": facing_yaw(ring(c, 1, BJ["dealer_phi"], bj_base), c)},
            "discard": {"pos": roomkit.bab(ring(c, r - 0.3, BJ["dealer_phi"] + 28, bj_base)), "yaw": facing_yaw(ring(c, 1, BJ["dealer_phi"], bj_base), c)},
            "players": [{"seat": n, "cards": roomkit.bab(ring(c, r - 0.36, phi, bj_base)), "score": roomkit.bab(ring(c, r - 0.62, phi, bj_base)), "yaw": facing_yaw(ring(c, 1, phi, bj_base), c)}
                        for n, phi in zip(bj_names, (-150.0, -90.0, -30.0, 30.0, 90.0))],
            "scoreCards": roomkit.bab((c[0] - 0.05, c[1] + 0.05, TABLE_H + 0.01)),
        },
    })
    c, r = OKEY["c"], OKEY["r"]
    racks = []
    for n, phi in zip(okey_names, (-135.0, -45.0, 45.0, 135.0)):
        p = ring(c, r - 0.2, phi, okey_base)
        racks.append({"seat": n, "pos": roomkit.bab(p), "yaw": facing_yaw(p, c) + math.pi, "discard": roomkit.bab(ring(c, r - 0.42, phi - 32, okey_base))})
    tables.append({
        "id": "okey", "game": "okey", "label": "Masa 1", "center": roomkit.bab((c[0], c[1], TABLE_H)), "radius": r,
        "surfaceY": TABLE_H + 0.008, "seats": okey_names,
        "racks": racks,
        "tiles": {"drawPile": roomkit.bab((c[0], c[1], TABLE_H + 0.01)), "indicator": roomkit.bab(ring(c, 0.16, 0, okey_base)), "rackRows": 2, "rackSlots": 15},
    })
    c, r = TAVLA["c"], TAVLA["r"]
    tables.append({"id": "tavla", "game": "tavla", "center": roomkit.bab((c[0], c[1], TABLE_H)), "radius": r, "surfaceY": TABLE_H + 0.008,
                   "seats": tavla_names, "board": {"pos": roomkit.bab((c[0], c[1], TABLE_H + 0.008)), "yaw": facing_yaw(ring(c, 1, -60.0, tavla_base), c)}})
    c, r = CHESS["c"], CHESS["r"]
    tables.append({"id": "chess", "game": "chess", "center": roomkit.bab((c[0], c[1], TABLE_H)), "radius": r, "surfaceY": TABLE_H + 0.008,
                   "seats": chess_names, "board": {"pos": roomkit.bab((c[0], c[1], TABLE_H + 0.008)), "yaw": facing_yaw(ring(c, 1, 90.0, chess_base), c)}})
    kit.anchor("tables", tables)


# ------------------------------------------------------------------ lights + camera

def build_lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = blib.srgb("#40366e")
    bg.inputs["Strength"].default_value = 0.45

    def light(name, kind, loc, color, energy, size=0.1, rot=(0, 0, 0), spot=None):
        ld = bpy.data.lights.new(name, kind)
        ld.color = blib.srgb(color)[:3]
        ld.energy = energy
        if kind == "AREA":
            ld.shape = "RECTANGLE"
            ld.size, ld.size_y = size
        else:
            ld.shadow_soft_size = size
        if spot:
            ld.spot_size = math.radians(spot)
            ld.spot_blend = 0.6
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = [math.radians(a) for a in rot]
        blib.link(o)
        return o

    for i, (x, y, zb) in enumerate(LIGHTS["pendants"]):
        light(f"L_pend{i}", "SPOT", (x, y, zb + 0.05), "#ffcf8a", 260 if i == 0 else 170, size=0.25, spot=110)
        light(f"L_pend_up{i}", "POINT", (x, y, zb + 0.25), "#ffd7a0", 25, size=0.2)
    gx, gy, gz = LIGHTS["globe"]
    light("L_globe", "POINT", (gx, gy, gz + 0.13), "#ffd9b0", 40, size=0.13)
    # cool / violet room fill (the draft's blue-violet walls)
    light("L_fill_ceiling", "AREA", (W / 2, D / 2, H - 0.05), "#a89cff", 420, size=(W - 1, D - 1))
    light("L_fill_cam", "AREA", (4.6, 0.3, 2.6), "#ffc8d8", 220, size=(3.0, 1.2), rot=(70, 0, 0))
    light("L_window", "AREA", (0.75, D - 0.3, 2.5), "#9ec8ff", 60, size=(1.1, 0.7), rot=(-90, 0, 0))


def build_camera():
    # fitted to scene-2.jpg: the blackjack table's ellipse (hfov 55, see the module docstring)
    tx, ty = BJ["c"]
    pos = (tx + float(arg("--cx", 0.0)), ty - 3.692 + float(arg("--cy", 0.0)), 2.058 + float(arg("--cz", 0.0)))
    yaw, pitch = math.radians(2.23 + float(arg("--cyaw", 0.0))), math.radians(-15.31 + float(arg("--cpitch", 0.0)))
    d = 4.0
    aim = (pos[0] + d * math.sin(yaw) * math.cos(pitch), pos[1] + d * math.cos(yaw) * math.cos(pitch), pos[2] + d * math.sin(pitch))
    CAM["pos"] = pos
    CAM["aim"] = aim
    kit.hero_camera(pos, aim, lens=float(arg("--lens", 34.6)))
    for x, y in ((4.0, 1.6), (5.2, 1.6), (3.2, 2.4), (6.2, 2.4), (2.4, 1.4), (6.9, 1.2)):
        kit.spawn(x, y)


# ------------------------------------------------------------------ main

def main():
    scene = blib.reset_scene()
    make_materials()
    build_shell()
    build_camera()
    build_furniture()
    build_lights()
    scene.render.engine = "CYCLES"
    scene.view_settings.view_transform = "AgX"

    preview = arg("--preview")
    if preview:
        roomkit.render_preview(preview, samples=int(arg("--samples", 16)), w=int(arg("--w", 800)), h=int(arg("--h", 450)))
        return
    out = arg("--out", os.path.join(REPO, "frontend", "public", "world3d", "game-room.glb"))
    samples = int(arg("--samples", 40))
    work = os.path.join(blib.HERE, "out", "bakes", "game-room")
    os.makedirs(work, exist_ok=True)
    sizes = {"floor": 2048, "shell": 2048, "furniture": 2048, "chairs": 1024, "props": 2048, "rug": 512}
    if arg("--small"):
        sizes = {k: max(128, v // 4) for k, v in sizes.items()}
    job = arg("--bake-group")
    if job:
        roomkit.bake_atlas_group(kit, job, kit.groups[job], sizes[job], samples, work, mode="bake")
        print(f"[bake-done] {job}", flush=True)
        return
    if not arg("--bake"):
        return
    extra = ["--samples", str(samples)] + (["--small"] if arg("--small") else [])
    roomkit.run_bakes(os.path.abspath(__file__), list(sizes), extra, out_dir=work, force=bool(arg("--force")))
    for g, size in sizes.items():
        roomkit.bake_atlas_group(kit, g, kit.groups[g], size, samples, work, mode="load")
    for o in kit.emissive:
        blib.apply_all(o)
    for o in bpy.data.objects:
        if o.name == "BAKED_floor":
            o.name = "FLOOR"
    kit.write_layout(os.path.join(REPO, "frontend", "src", "world3d", "engine", "rooms", "gameRoom.layout.js"), "tools/world3d/build_game_room.py")
    roomkit.export_glb(out)


if __name__ == "__main__":
    main()
