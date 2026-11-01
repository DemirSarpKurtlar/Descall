"""Descall 3D world: game pieces for the game room (own geometry, own atlases).

  okey.glb   one tile mesh (TILE) + atlas: 4 colours x 1..13 (x2 in a set) + false okey,
             and the wooden rack (RACK, two rows of 15 slots)
  cards.glb  one card mesh (CARD) + atlas: 52 faces, the Descall back, two score cards
             (points only), and a face-down deck block (DECK)
  tavla.glb  open backgammon board (TAVLA_board), checkers (TAVLA_checker_light/dark), a die
  chess.glb  board (CHESS_board) and the six piece shapes, light and dark (CHESS_<piece>_<side>)

One mesh per piece kind; the runtime (frontend/src/world3d/engine/pieces.js) shifts a
tile's / card's face UVs to its atlas cell, so 106 tiles or 52 cards share one mesh and
one material. Geometry facts the runtime needs (sizes, rack slots, tavla points, chess
squares) are written to frontend/src/world3d/engine/pieces.layout.js.
Atlases: tools/world3d/gen_room_textures.py (Inter, OFL, from @fontsource/inter).

  blender -b -P tools/world3d/build_game_pieces.py -- --outdir frontend/public/world3d
  blender -b -P tools/world3d/build_game_pieces.py -- --preview out.png

Blender axes: Z up. Pieces are modelled at the table origin; the runtime places them.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blib  # noqa: E402
import roomkit  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith("--"):
            return ARGS[i + 1]
        return True
    return default


GEN = os.path.join(blib.CACHE, "gen", "rooms")
ACG = os.path.join(blib.CACHE, "ambientcg")
REPO = os.path.normpath(os.path.join(blib.HERE, "..", ".."))

TILE = {"w": 0.034, "h": 0.05, "t": 0.016}
OKEY_GRID = (8, 7)
RACK = {"length": 0.62, "slots": 15, "pitch": 0.0375, "rows": [{"y": -0.012, "z": 0.012, "tilt": 12.0}, {"y": 0.03, "z": 0.05, "tilt": 12.0}]}
CARD = {"w": 0.07, "h": 0.098, "t": 0.0012}
CARD_GRID = (10, 7)
TAVLA = {"w": 0.64, "d": 0.42, "frame": 0.03}
CHECKER = {"r": 0.022, "h": 0.009}
DIE = 0.017
CHESS = {"size": 0.44, "margin": 0.0275, "h": 0.03}
LAYOUT = {}


def image_mat(name, path, rough=0.5, metal=0.0, non_color=False):
    m = blib.principled(name, "#ffffff", rough, metal=metal)
    nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(t.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    return m


def cell_rect(idx, grid):
    cols, rows = grid
    c, r = idx % cols, idx // cols
    # Blender UV origin is bottom left; the atlas row 0 is the top
    return c / cols, 1 - (r + 1) / rows, 1 / cols, 1 / rows


def box_uv(obj, face_fn):
    """face_fn(normal, local_co) -> (u, v) per loop."""
    me = obj.data
    uv = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    for p in me.polygons:
        for li in p.loop_indices:
            uv.data[li].uv = face_fn(p.normal, me.vertices[me.loops[li].vertex_index].co)


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def export(path, objs):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                              export_materials="EXPORT", export_image_format="WEBP", export_image_quality=88,
                              export_image_webp_fallback=False, export_animations=False, export_cameras=False, export_lights=False)
    print("exported ->", path)


# ------------------------------------------------------------------ okey

def build_okey(outdir):
    clear_scene()
    atlas = image_mat("okey_tile", os.path.join(GEN, "okey_atlas.png"), rough=0.35)
    w, h, t = TILE["w"], TILE["h"], TILE["t"]
    tile = blib.rbox("TILE", (w, t, h), (0, 0, h / 2), atlas, bevel=0.004, segments=3)
    blib.apply_all(tile)
    u0, v0, du, dv = cell_rect(0, OKEY_GRID)
    bu, bv, _, _ = cell_rect(53, OKEY_GRID)

    def fn(n, co):
        if n.y < -0.8:  # face (towards -Y, the player)
            uu = (co.x + w / 2) / w
            vv = co.z / h
            return (u0 + du * (0.03 + 0.94 * uu), v0 + dv * (0.03 + 0.94 * vv))
        return (bu + du * 0.5, bv + dv * 0.5)
    box_uv(tile, fn)
    # rack: base board, two ledges, back board (wood)
    wood = blib.principled("okey_rack", "#b8743e", 0.5)
    L = RACK["length"]
    parts = [
        # the player sits on -Y (the tiles' face side); the tall back board is on +Y
        blib.rbox("rack_base", (L, 0.11, 0.012), (0, 0.01, 0.006), wood, bevel=0.004, segments=2),
        blib.rbox("rack_lip", (L, 0.012, 0.022), (0, -0.04, 0.011), wood, bevel=0.004, segments=2),
        blib.rbox("rack_step", (L, 0.05, 0.05), (0, 0.04, 0.025), wood, bevel=0.006, segments=2),
        blib.rbox("rack_back", (L, 0.012, 0.09), (0, 0.064, 0.05), wood, bevel=0.004, segments=2, rot=(10, 0, 0)),
    ]
    for p in parts:
        roomkit.uv_metres(p, scale=4)
    rack = blib.join(parts, "RACK")
    LAYOUT["okey"] = {
        "tile": TILE, "grid": {"cols": OKEY_GRID[0], "rows": OKEY_GRID[1]}, "cells": {"falseOkey": 52, "blank": 53},
        "colors": ["red", "black", "blue", "yellow"],
        "faceCell": 0,
        "rack": {**RACK, "note": "rows y / z are Blender local (Babylon local z = -y): the player sits on +z (Babylon) of the rack; row 0 front/low, row 1 back/high; slot k at x = (k - 7) * pitch; tiles lean back by tilt degrees"},
    }
    export(os.path.join(outdir, "okey.glb"), [tile, rack])


# ------------------------------------------------------------------ cards

def build_cards(outdir):
    clear_scene()
    atlas = image_mat("card_face", os.path.join(GEN, "cards_atlas.png"), rough=0.45)
    w, h, t = CARD["w"], CARD["h"], CARD["t"]
    card = blib.rbox("CARD", (w, h, t), (0, 0, t / 2), atlas, bevel=0.0006, segments=1)
    blib.apply_all(card)
    # rounded corners: trim the corner verts in plan (cheap: a bevel on the vertical edges)
    bm = bmesh.new()
    bm.from_mesh(card.data)
    edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > t * 0.5]
    bmesh.ops.bevel(bm, geom=edges, offset=0.006, segments=3, affect="EDGES")
    bm.to_mesh(card.data)
    bm.free()
    fu, fv, du, dv = cell_rect(0, CARD_GRID)
    bku, bkv, _, _ = cell_rect(52, CARD_GRID)
    blu, blv, _, _ = cell_rect(55, CARD_GRID)

    def fn(n, co):
        uu = (co.x + w / 2) / w
        vv = (co.y + h / 2) / h
        if n.z > 0.8:
            return (fu + du * uu, fv + dv * vv)
        if n.z < -0.8:  # back: mirrored so it reads right when the card is turned over
            return (bku + du * (1 - uu), bkv + dv * vv)
        return (blu + du * 0.5, blv + dv * 0.5)
    box_uv(card, fn)
    deck = blib.rbox("DECK", (w, h, 0.03), (0, 0, 0.015), atlas, bevel=0.003, segments=2)
    blib.apply_all(deck)

    def fn2(n, co):
        uu = (co.x + w / 2) / w
        vv = (co.y + h / 2) / h
        if n.z > 0.8:
            return (bku + du * uu, bkv + dv * vv)
        return (blu + du * 0.5, blv + dv * (0.2 + 0.6 * ((co.z / 0.03 * 9) % 1)))
    box_uv(deck, fn2)
    LAYOUT["cards"] = {"card": CARD, "grid": {"cols": CARD_GRID[0], "rows": CARD_GRID[1]},
                       "cells": {"back": 52, "score": [53, 54], "blank": 55},
                       "suits": ["spade", "heart", "diamond", "club"], "ranks": ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"],
                       "faceCell": 0, "deckHeight": 0.03}
    export(os.path.join(outdir, "cards.glb"), [card, deck])


# ------------------------------------------------------------------ tavla

def build_tavla(outdir):
    clear_scene()
    board_tex = image_mat("tavla_board", os.path.join(GEN, "tavla_board.png"), rough=0.5)
    wood = blib.principled("tavla_wood", "#8a5530", 0.45)
    W_, D_, F = TAVLA["w"], TAVLA["d"], TAVLA["frame"]
    floor = blib.rbox("tavla_floor", (W_, D_, 0.012), (0, 0, 0.006), board_tex, bevel=0.002, segments=1)
    blib.apply_all(floor)

    def fn(n, co):
        if n.z > 0.8:
            return ((co.x + W_ / 2) / W_, (co.y + D_ / 2) / D_)
        return (0.01, 0.01)
    box_uv(floor, fn)
    rails = [
        blib.rbox("tavla_rail_n", (W_ + 0.02, F * 0.6, F), (0, D_ / 2 + F * 0.3 - 0.004, F / 2), wood, bevel=0.005, segments=2),
        blib.rbox("tavla_rail_s", (W_ + 0.02, F * 0.6, F), (0, -D_ / 2 - F * 0.3 + 0.004, F / 2), wood, bevel=0.005, segments=2),
        blib.rbox("tavla_rail_w", (F * 0.6, D_, F), (-W_ / 2 - F * 0.3 + 0.004, 0, F / 2), wood, bevel=0.005, segments=2),
        blib.rbox("tavla_rail_e", (F * 0.6, D_, F), (W_ / 2 + F * 0.3 - 0.004, 0, F / 2), wood, bevel=0.005, segments=2),
        blib.rbox("tavla_hinge", (0.04, D_, F * 0.8), (0, 0, F * 0.4), wood, bevel=0.005, segments=2),
    ]
    for r in rails:
        roomkit.uv_metres(r, scale=3)
    board = blib.join([floor] + rails, "TAVLA_board")
    light = blib.principled("tavla_light", "#f2ece0", 0.3)
    dark = blib.principled("tavla_dark", "#3b2726", 0.3)
    ch = []
    for name, mat in (("TAVLA_checker_light", light), ("TAVLA_checker_dark", dark)):
        c = blib.cylinder(name, CHECKER["r"], CHECKER["h"], (0, 0, CHECKER["h"] / 2), mat, verts=32, bevel=0.002)
        ring = blib.cylinder(name + "_ring", CHECKER["r"] * 0.62, 0.0008, (0, 0, CHECKER["h"] + 0.0004), mat, verts=32)
        ch.append(blib.join([c, ring], name))
    dmat = image_mat("die", os.path.join(GEN, "dice_atlas.png"), rough=0.3)
    die = blib.rbox("TAVLA_die", (DIE, DIE, DIE), (0, 0, DIE / 2), dmat, bevel=0.003, segments=2)
    blib.apply_all(die)
    # faces: +z 1, -z 6, +x 3, -x 4, +y 2, -y 5 (opposite faces sum to 7)

    def fn_die(n, co):
        ax = max(range(3), key=lambda k: abs(n[k]))
        num = {(2, 1): 1, (2, -1): 6, (0, 1): 3, (0, -1): 4, (1, 1): 2, (1, -1): 5}[(ax, 1 if n[ax] > 0 else -1)]
        a, b = [k for k in range(3) if k != ax]
        uu = (co[a] + DIE / 2) / DIE
        vv = (co[b] + DIE / 2) / DIE if b != 2 else co[b] / DIE
        cu, cv = ((num - 1) % 3) / 3, 1 - ((num - 1) // 3 + 1) / 2
        return (cu + uu / 3, cv + vv / 2)
    box_uv(die, fn_die)
    # points: 1..24 counter-clockwise from the bottom right (white home board), Babylon local (x, z)
    m_x = W_ / 2 - 0.034 * W_ / 0.64
    bar = 0.04
    half = (W_ - 2 * (0.034 * W_ / 0.64) - bar) / 2
    pw = half / 6
    pts = []
    for k in range(24):
        if k < 12:  # bottom row, right to left
            col = k
            x = m_x - pw * (col + 0.5) - (bar if col >= 6 else 0)
            y = -D_ / 2 + 0.03
            dirn = 1
        else:
            col = 23 - k
            x = m_x - pw * (col + 0.5) - (bar if col >= 6 else 0)
            y = D_ / 2 - 0.03
            dirn = -1
        pts.append({"point": k + 1, "base": roomkit.bab((x, y, 0.012)), "stack": [0, 0, round(-dirn * CHECKER["r"] * 2.02, 4)]})
    LAYOUT["tavla"] = {"board": {"w": W_, "d": D_, "surfaceY": 0.012}, "checker": CHECKER, "die": DIE,
                       "dieFaces": "+y 1, -y 6, -x 3, +x 4, -z 2, +z 5 (Babylon local)", "points": pts,
                       "bar": roomkit.bab((0, 0, 0.012)), "start": {"light": {"24": 2, "13": 5, "8": 3, "6": 5}, "dark": {"1": 2, "12": 5, "17": 3, "19": 5}}}
    export(os.path.join(outdir, "tavla.glb"), [board] + ch + [die])


# ------------------------------------------------------------------ chess

def lathe(name, profile, mat, segs=28):
    """profile: [(r, z)] from the bottom centre to the top centre."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(segs):
            i2 = (i + 1) % segs
            bm.faces.new((rings[j][i], rings[j][i2], rings[j + 1][i2], rings[j + 1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    obj = blib.mesh_from_bmesh(name, bm)
    blib.set_mat(obj, mat)
    blib.shade_smooth(obj)
    return obj


def base_profile(r0=0.016, h0=0.006):
    return [(0.0001, 0), (r0, 0), (r0, h0 * 0.5), (r0 * 0.92, h0), (r0 * 0.7, h0 * 1.4)]


def chess_piece(kind, side, mat):
    s = 1.0
    if kind == "pawn":
        prof = base_profile(0.0145) + [(0.007, 0.018), (0.0065, 0.026), (0.01, 0.029), (0.004, 0.031)]
        body = lathe("p", prof, mat)
        head = blib.sphere("ph", 0.0085, (0, 0, 0.037), mat, segments=20, rings=10)
        return blib.join([body, head], f"CHESS_pawn_{side}")
    if kind == "rook":
        prof = base_profile(0.016) + [(0.011, 0.02), (0.0105, 0.038), (0.0135, 0.04), (0.0135, 0.05), (0.0001, 0.05)]
        body = lathe("r", prof, mat)
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4
            body = blib.join([body, blib.rbox(f"rc{k}", (0.008, 0.008, 0.007), (0.009 * math.cos(a), 0.009 * math.sin(a), 0.0535), mat, bevel=0.0015, segments=1)], "r")
        body.name = f"CHESS_rook_{side}"
        return body
    if kind == "bishop":
        prof = base_profile(0.0155) + [(0.007, 0.022), (0.0065, 0.036), (0.0105, 0.039), (0.006, 0.041)]
        body = lathe("b", prof, mat)
        head = blib.sphere("bh", 0.0095, (0, 0, 0.05), mat, scale=(1, 1, 1.35), segments=20, rings=10)
        tip = blib.sphere("bt", 0.0035, (0, 0, 0.066), mat, segments=12, rings=6)
        return blib.join([body, head, tip], f"CHESS_bishop_{side}")
    if kind == "queen":
        prof = base_profile(0.0165) + [(0.0075, 0.026), (0.007, 0.046), (0.0125, 0.052), (0.0105, 0.058), (0.0001, 0.059)]
        body = lathe("q", prof, mat)
        parts = [body, blib.sphere("qt", 0.0045, (0, 0, 0.064), mat, segments=12, rings=6)]
        for k in range(8):
            a = k * math.pi / 4
            parts.append(blib.sphere(f"qb{k}", 0.0026, (0.011 * math.cos(a), 0.011 * math.sin(a), 0.058), mat, segments=8, rings=4))
        return blib.join(parts, f"CHESS_queen_{side}")
    if kind == "king":
        prof = base_profile(0.017) + [(0.008, 0.028), (0.0075, 0.05), (0.0125, 0.056), (0.011, 0.064), (0.0001, 0.065)]
        body = lathe("k", prof, mat)
        cross = [blib.rbox("kc1", (0.0045, 0.0045, 0.018), (0, 0, 0.073), mat, bevel=0.001, segments=1),
                 blib.rbox("kc2", (0.013, 0.0045, 0.0045), (0, 0, 0.075), mat, bevel=0.001, segments=1)]
        return blib.join([body] + cross, f"CHESS_king_{side}")
    # knight: lathe base + an extruded horse-head profile (own drawing)
    base = lathe("n", base_profile(0.016) + [(0.011, 0.014), (0.0001, 0.015)], mat)
    outline = [(-0.008, 0.013), (0.009, 0.013), (0.01, 0.03), (0.006, 0.042), (0.012, 0.05), (0.016, 0.055), (0.015, 0.062),
               (0.004, 0.066), (-0.004, 0.064), (-0.01, 0.055), (-0.011, 0.04), (-0.009, 0.026)]
    bm = bmesh.new()
    vs = [bm.verts.new((x, -0.006, z)) for x, z in outline]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += 0.012
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    head = blib.mesh_from_bmesh("nh", bm)
    blib.set_mat(head, mat)
    bv = head.modifiers.new("bevel", "BEVEL")
    bv.width = 0.002
    bv.segments = 2
    blib.apply_all(head)
    eye = blib.sphere("ne", 0.0018, (0.008, -0.0062, 0.056), mat, segments=8, rings=4)
    eye2 = blib.sphere("ne2", 0.0018, (0.008, 0.0062, 0.056), mat, segments=8, rings=4)
    return blib.join([base, head, eye, eye2], f"CHESS_knight_{side}")


def build_chess(outdir):
    clear_scene()
    btex = image_mat("chess_board", os.path.join(GEN, "chess_board.png"), rough=0.4)
    S_, H_ = CHESS["size"], CHESS["h"]
    board = blib.rbox("CHESS_board", (S_, S_, H_), (0, 0, H_ / 2), btex, bevel=0.004, segments=2)
    blib.apply_all(board)

    def fn(n, co):
        if n.z > 0.8:
            return ((co.x + S_ / 2) / S_, (co.y + S_ / 2) / S_)
        return (0.02, 0.5)
    box_uv(board, fn)
    light = blib.principled("chess_light", "#f0e6d4", 0.28)
    dark = blib.principled("chess_dark", "#33282a", 0.28)
    pieces = [board]
    for side, mat in (("light", light), ("dark", dark)):
        for kind in ("pawn", "rook", "knight", "bishop", "queen", "king"):
            p = chess_piece(kind, side, mat)
            if kind == "knight" and side == "dark":
                p.rotation_euler = (0, 0, math.pi)
                blib.apply_all(p)
            pieces.append(p)
    sq = (S_ - 2 * CHESS["margin"]) / 8
    LAYOUT["chess"] = {"board": {"size": S_, "surfaceY": H_, "square": round(sq, 5)},
                       "square": "file a..h along +x of the board's local frame from the light player's view; local x = (file - 3.5) * square, z = (rank - 4.5) * square",
                       "start": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"}
    export(os.path.join(outdir, "chess.glb"), pieces)


def preview(path):
    """All pieces on one table top, for a quick look."""
    clear_scene()
    outdir = os.path.join(blib.HERE, "out", "pieces")
    for fn in ("okey.glb", "cards.glb", "tavla.glb", "chess.glb"):
        bpy.ops.import_scene.gltf(filepath=os.path.join(outdir, fn))
    by = {o.name: o for o in bpy.data.objects}
    places = {"TILE": (-0.35, -0.12, 0), "RACK": (-0.35, 0.0, 0), "CARD": (-0.1, -0.15, 0), "DECK": (0.0, -0.15, 0),
              "TAVLA_board": (0.25, 0.25, 0), "CHESS_board": (-0.25, 0.4, 0)}
    for n, o in by.items():
        if o.type != "MESH":
            continue
        p = places.get(n)
        if p is None and n.startswith("CHESS_"):
            kinds = ["pawn", "rook", "knight", "bishop", "queen", "king"]
            k = next(i for i, kk in enumerate(kinds) if kk in n)
            p = (-0.38 + k * 0.052, 0.25 + (0.05 if "dark" in n else 0), 0.03)
        if p is None and n.startswith("TAVLA_"):
            p = (0.12 + (0.05 if "dark" in n else 0) + (0.1 if "die" in n else 0), -0.05, 0.012)
        if p:
            o.location = (o.location.x + p[0], o.location.z * 0 + p[1], p[2]) if False else Vector(p)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    blib.link(cam)
    cam.location = (0, -0.9, 0.75)
    cam.rotation_euler = (Vector((0, 0.1, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = blib.srgb("#3aa476")
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.2
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 900, 600
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    blib.reset_scene()
    if arg("--preview"):
        preview(arg("--preview"))
        return
    outdir = arg("--outdir", os.path.join(REPO, "frontend", "public", "world3d"))
    build_okey(outdir)
    build_cards(outdir)
    build_tavla(outdir)
    build_chess(outdir)
    out = os.path.join(REPO, "frontend", "src", "world3d", "engine", "pieces.layout.js")
    with open(out, "w") as f:
        f.write("// Generated by tools/world3d/build_game_pieces.py. Do not edit: change the build script and rebuild.\n")
        f.write("// Sizes in metres; positions in each piece's local Babylon frame (y up).\n")
        f.write("export default " + json.dumps(LAYOUT, indent=1) + ";\n")
    print("layout ->", out)


if __name__ == "__main__":
    main()
