"""Descall 3D world: the cinema ("Sinema"), built from code.

Target: docs/design/3d-world/scene-1.jpg (hero angle from the back, above the last row).
Own geometry + CC0 materials (ambientCG) + a CC0 plant (Poly Haven) + own procedural
textures (gen_room_textures.py). Lighting is baked with Cycles (roomkit.py):
  * base atlases: the room with the screen dark (downlights, neon, aisle LEDs,
    sconces, popcorn machine, projector);
  * "screen" light layer: only the screen as an emitter. The client adds it on top of
    the base, tinted and scaled by what the screen shows (live screen share in phase 3).
The screen itself (SCREEN_main / EMIT_screen) stays unbaked: a separate emissive mesh
with 0..1 UVs over its 16:9 face, ready for a VideoTexture.

  blender -b -P tools/world3d/build_cinema.py -- --preview out.png [--samples 16]
  blender -b -P tools/world3d/build_cinema.py -- --bake --samples 48 --out frontend/public/world3d/cinema.glb

Blender axes: Z up, the audience looks toward +Y (the screen wall), +X is their right.
Room interior x 0..8.0, y 0..12.6, z 0..4.2. Tiered floor: 0 / 0.3 / 0.6 / 0.9 m.
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
from blib import cylinder, plane, principled, rbox, sphere, textured  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in ARGS:
        i = ARGS.index(name)
        if i + 1 < len(ARGS) and not ARGS[i + 1].startswith("--"):
            return ARGS[i + 1]
        return True
    return default


W, D, H = 8.4, 12.6, 4.2
ACG = os.path.join(blib.CACHE, "ambientcg")
PH = os.path.join(blib.CACHE, "polyhaven")
GEN = os.path.join(blib.CACHE, "gen", "rooms")
REPO = os.path.normpath(os.path.join(blib.HERE, "..", ".."))

# tiers: (y0, y1, z). The audience faces +y; each tier holds one row of seats + legroom.
TIERS = [(7.3, 11.4, 0.0), (5.85, 7.3, 0.3), (4.4, 5.85, 0.6), (0.0, 4.4, 0.9)]
ROWS = [(7.8, 0.0, "front"), (6.35, 0.3, "mid"), (4.9, 0.6, "back")]  # seat centre y, ground z
SEAT_X = [1.0, 2.1, 4.25, 5.35, 6.45, 7.55]  # 2 | aisle | 4
LEFT, RIGHT = SEAT_X[:2], SEAT_X[2:]
AISLE = (2.62, 3.73)
SCREEN = {"cx": 4.2, "w": 4.8, "h": 2.7, "z0": 1.15, "y": 12.48}

kit = roomkit.Kit("cinema")
M = {}
LIGHTS = {}


def ray_camera_only(obj):
    for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(obj, attr, False)


# ------------------------------------------------------------------ materials

def make_materials():
    M["carpet"] = roomkit.textured_gray("carpet", os.path.join(ACG, "Carpet012"), "Carpet012", tint="#4a3c8e", rough=1.0, scale=1.4, normal_strength=0.8)
    M["wall"] = principled("wall", "#4a4aa8", 0.95)
    nt = M["wall"].node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(GEN, "cinema_wall.png"))
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = blib.srgb("#5c4396")
    nt.links.new(mix.outputs[2], nt.nodes["Principled BSDF"].inputs["Base Color"])
    M["wall_front"] = principled("wall_front", "#24275e", 0.95)
    M["ceiling"] = principled("ceiling", "#ffffff", 0.95)
    nt = M["ceiling"].node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(GEN, "cinema_ceiling.png"))
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = blib.srgb("#3a3570")
    nt.links.new(mix.outputs[2], nt.nodes["Principled BSDF"].inputs["Base Color"])
    M["velvet"] = roomkit.textured_gray("velvet", os.path.join(ACG, "Fabric023"), "Fabric023", tint="#8a3cb8", rough=1.0, scale=3.0, normal_strength=0.35)
    M["velvet_dark"] = roomkit.textured_gray("velvet_dark", os.path.join(ACG, "Fabric023"), "Fabric023", tint="#5f2a86", rough=1.0, scale=3.0, normal_strength=0.35)
    M["wood_cap"] = textured("wood_cap", os.path.join(ACG, "Wood049"), "Wood049", tint="#8a5a3c", rough=0.45, scale=2.0)
    M["brass"] = principled("brass", "#c8a060", 0.35, metal=0.7)
    M["stage"] = principled("stage", "#1d2050", 0.8)
    M["stage_top"] = roomkit.textured_gray("stage_top", os.path.join(ACG, "Carpet012"), "Carpet012", tint="#262a6e", rough=1.0, scale=1.4)
    M["bezel"] = principled("bezel", "#0c0d18", 0.55)
    M["speaker"] = principled("speaker", "#16161e", 0.55)
    M["grille"] = principled("grille", "#0a0a10", 0.9)
    M["metal_dark"] = principled("metal_dark", "#2a2a34", 0.4, metal=0.6)
    M["popcorn_red"] = principled("popcorn_red", "#d84a5c", 0.45)
    M["popcorn_redd"] = principled("popcorn_redd", "#a83246", 0.5)
    M["popcorn_yellow"] = principled("popcorn_yellow", "#f2c43a", 0.4)
    M["popcorn_trim"] = principled("popcorn_trim", "#9a8cc8", 0.4, metal=0.4)
    M["popcorn"] = principled("popcorn", "#f4d9a0", 0.7)
    M["popcorn2"] = principled("popcorn2", "#e8b86a", 0.7)
    M["knob_purple"] = principled("knob_purple", "#5d4ab0", 0.35)
    M["pouf"] = roomkit.textured_gray("pouf", os.path.join(ACG, "Fabric023"), "Fabric023", tint="#7a36a8", rough=1.0, scale=3.0, normal_strength=0.35)
    M["pot"] = principled("pot", "#2a2650", 0.6)
    M["door"] = principled("door", "#232458", 0.7)
    # emissive (unbaked, HDR at runtime)
    M["neon"] = blib.emissive("EMIT_neon", "#3f7bff", 14.0)
    M["led_warm"] = blib.emissive("EMIT_aisle", "#ffb24a", 5.0)
    M["downlight"] = blib.emissive("EMIT_downlight", "#ffe0b8", 9.0)
    M["bulb"] = blib.emissive("EMIT_popcorn_bulb", "#fff0c0", 9.0)
    M["sign"] = blib.emissive("EMIT_popcorn_sign", "#ffd040", 3.5)
    M["pink"] = blib.emissive("EMIT_pouf_ring", "#ff5aa8", 9.0)
    M["led_blue"] = blib.emissive("EMIT_speaker_led", "#5aa0ff", 6.0)
    M["lens"] = blib.emissive("EMIT_projector_lens", "#9ad8ff", 18.0)
    M["sconce"] = blib.emissive("EMIT_sconce", "#ffc890", 2.0)
    standby = bpy.data.images.load(os.path.join(GEN, "cinema_standby.png"))
    M["screen"] = blib.emissive("EMIT_screen", "#ffffff", 0.0, image=standby)
    M["beam"] = blib.emissive("EMIT_beam", "#7fc8ff", 1.0)


# ------------------------------------------------------------------ shell

def build_shell():
    # stepped floor: each tier is a slab (top + riser) so the bake gets clean edges
    for i, (y0, y1, z) in enumerate(TIERS):
        if z == 0:
            fl = plane("floor_t0", W, y1 - y0 + (D - y1), (W / 2, (y0 + D) / 2, 0), mat=M["carpet"])
            roomkit.uv_metres(fl)
            kit.grp("floor", fl)
            continue
        # only the visible faces: the tier top and its riser (no hidden sides: atlas texels go where they are seen)
        top = plane(f"tier{i}_top", W, y1 - y0, (W / 2, (y0 + y1) / 2, z), mat=M["carpet"])
        roomkit.uv_metres(top)
        kit.grp("floor", top)
        zprev = TIERS[i - 1][2]
        riser = plane(f"tier{i}_riser", W, z - zprev, (W / 2, y1, (z + zprev) / 2), rot=(-90, 0, 0), mat=M["carpet"])
        roomkit.uv_metres(riser)
        kit.grp("floor", riser)
        # brass nosing + warm LED strip along the tier edge (the draft's gold step line)
        kit.grp("floor", rbox(f"nosing{i}", (W - 0.02, 0.05, 0.03), (W / 2, y1 - 0.02, z - 0.012), M["brass"], bevel=0.008, segments=2))
        led = rbox(f"EMIT_aisle_led{i}", (W - 0.1, 0.012, 0.012), (W / 2, y1 + 0.003, z - 0.045), M["led_warm"], bevel=0)
        kit.emit(led)
        # aisle step lights in the riser (both aisles)
        for ax in ((AISLE[0] + AISLE[1]) / 2,):
            sl = rbox(f"EMIT_aisle_step{i}_{ax:.0f}", (0.16, 0.012, 0.035), (ax, y1 + 0.004, z * 0.45), M["led_warm"], bevel=0)
            kit.emit(sl)
        kit.floor(0, y0, W, y1, z)
    ce = plane("ceiling", W, D, (W / 2, D / 2, H), rot=(180, 0, 0), mat=M["ceiling"])
    roomkit.uv_metres(ce, scale=1 / 2.4)
    kit.grp("shell", ce)
    t = 0.15
    for name, size, loc, mat in (
        ("wall_left", (t, D + 2 * t, H), (-t / 2, D / 2, H / 2), M["wall"]),
        ("wall_right", (t, D + 2 * t, H), (W + t / 2, D / 2, H / 2), M["wall"]),
        ("wall_front", (W, t, H), (W / 2, D + t / 2, H / 2), M["wall_front"]),
        ("wall_back", (W, t, H), (W / 2, -t / 2, H / 2), M["wall"]),
    ):
        o = rbox(name, size, loc, mat, bevel=0)
        roomkit.uv_metres(o, scale=1 / 2.4)
        kit.grp("shell", o)
    # skirting
    kit.grp("shell", rbox("skirt_l", (0.025, D, 0.08), (0.012, D / 2, 0.04), M["stage"], bevel=0.004))
    kit.grp("shell", rbox("skirt_r", (0.025, D, 0.08), (W - 0.012, D / 2, 0.04), M["stage"], bevel=0.004))
    # back door (behind the hero camera)
    kit.grp("shell", rbox("door", (1.1, 0.06, 2.2), (2.0, 0.03, 0.9 + 1.1), M["door"], bevel=0.01))
    # stage
    kit.grp("furniture", rbox("stage", (5.4, 1.0, 0.52), (SCREEN["cx"], 12.1, 0.26), M["stage"], bevel=0.02, segments=2))
    st = rbox("stage_top", (5.36, 0.96, 0.01), (SCREEN["cx"], 12.1, 0.525), M["stage_top"], bevel=0)
    roomkit.uv_metres(st)
    kit.grp("furniture", st)
    kit.collider("stage", (5.4, 1.0), (SCREEN["cx"], 12.1))
    # screen: bezel + separate emissive face
    s = SCREEN
    zc = s["z0"] + s["h"] / 2
    kit.grp("furniture", rbox("screen_bezel", (s["w"] + 0.26, 0.1, s["h"] + 0.26), (s["cx"], D - 0.05, zc), M["bezel"], bevel=0.015, segments=2))
    scr = plane("SCREEN_main", s["w"], s["h"], (s["cx"], s["y"] - 0.003, zc), rot=(90, 0, 0), mat=M["screen"])
    # plane() lies in XY with UV 0..1; rotated 90 about X it faces -Y (the audience):
    # u grows to +X (audience right), v grows to +Z (up). Check the mapping explicitly.
    me = scr.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co  # local: x -> world x, y -> world z
            uv[li].uv = (co.x / s["w"] + 0.5, co.y / s["h"] + 0.5)
    # rotation 90 about X makes the normal +... flip to face the audience (-Y)
    if (scr.matrix_world.to_3x3() @ me.polygons[0].normal).y > 0:
        for p in me.polygons:
            p.flip()
    kit.emit(scr)
    kit.anchor("screen", {
        "mesh": "SCREEN_main", "material": "EMIT_screen",
        "center": roomkit.bab((s["cx"], s["y"] - 0.003, zc)), "width": s["w"], "height": s["h"], "aspect": "16:9",
        "normal": [0, 0, -1],
        "uv": "u 0..1 left to right and v 0..1 bottom to top as seen from the seats (glTF stores v flipped: use invertY=false on a VideoTexture)",
    })


# ------------------------------------------------------------------ seats

def armchair(prefix, x, y, z):
    """Big velvet recliner (the draft's chunky cinema seats) facing +Y, wooden arm caps.
    Outer width 1.04 m, back top ~1.0 m (a seated avatar's shoulders, as in the draft),
    seat cushion top 0.47 m above the tier."""
    parts = []
    parts.append(rbox(prefix + "_base", (1.02, 0.86, 0.3), (x, y - 0.03, z + 0.15), M["velvet_dark"], bevel=0.06, segments=3))
    parts.append(rbox(prefix + "_cushion", (0.72, 0.74, 0.18), (x, y + 0.03, z + 0.38), M["velvet"], bevel=0.08, segments=3))
    parts.append(rbox(prefix + "_back", (0.98, 0.3, 0.7), (x, y - 0.38, z + 0.65), M["velvet"], bevel=0.14, segments=4, rot=(-8, 0, 0)))
    parts.append(rbox(prefix + "_backpad", (0.7, 0.12, 0.46), (x, y - 0.24, z + 0.68), M["velvet"], bevel=0.06, segments=3, rot=(-8, 0, 0)))
    parts.append(rbox(prefix + "_backroll", (0.94, 0.3, 0.22), (x, y - 0.41, z + 0.92), M["velvet"], bevel=0.1, segments=4, rot=(-8, 0, 0)))
    for sd in (-1, 1):
        parts.append(rbox(f"{prefix}_arm{sd}", (0.16, 0.84, 0.36), (x + sd * 0.43, y - 0.04, z + 0.46), M["velvet"], bevel=0.07, segments=3))
        parts.append(rbox(f"{prefix}_cap{sd}", (0.15, 0.56, 0.04), (x + sd * 0.43, y + 0.1, z + 0.655), M["wood_cap"], bevel=0.016, segments=3))
        parts.append(rbox(f"{prefix}_capfront{sd}", (0.15, 0.04, 0.2), (x + sd * 0.43, y + 0.385, z + 0.55), M["wood_cap"], bevel=0.014, segments=3))
    return parts


def build_seats():
    rows = []
    for ri, (yc, z, rname) in enumerate(ROWS):
        names = []
        for si, x in enumerate(SEAT_X):
            prefix = f"seat_{rname}_{si}"
            for p in armchair(prefix, x, yc, z):
                kit.grp("seats", p)
            n = kit.seat(f"SEAT_cinema_{ri}_{si}", (x, yc + 0.1), (0, 1), "cinema", height=0.47, ground=z,
                         approach=(x, yc + 0.7), extra={"row": ri, "col": si})
            names.append(n)
        rows.append(names)
        kit.collider(f"row{ri}_left", (LEFT[-1] - LEFT[0] + 1.06, 0.84), ((LEFT[0] + LEFT[-1]) / 2, yc - 0.08))
        kit.collider(f"row{ri}_right", (RIGHT[-1] - RIGHT[0] + 1.06, 0.84), ((RIGHT[0] + RIGHT[-1]) / 2, yc - 0.08))
    kit.anchor("seatRows", rows)


# ------------------------------------------------------------------ props

def speaker(name, loc, rot_z, size=(0.42, 0.34, 0.66), hang=False):
    x, y, z = loc
    rz = math.radians(rot_z)
    fx, fy = -math.sin(rz), math.cos(rz)  # local +Y (front) in world
    parts = [rbox(name + "_box", size, loc, M["speaker"], bevel=0.03, segments=3, rot=(0, 0, rot_z))]
    parts.append(rbox(name + "_grille", (size[0] - 0.06, 0.01, size[2] - 0.08), (x + fx * size[1] / 2, y + fy * size[1] / 2, z), M["grille"], bevel=0.005, rot=(0, 0, rot_z)))
    led = sphere(f"EMIT_{name}_led", 0.012, (x + fx * (size[1] / 2 + 0.008), y + fy * (size[1] / 2 + 0.008), z - size[2] / 2 + 0.07), M["led_blue"], segments=12, rings=6)
    kit.emit(led)
    if hang:
        parts.append(cylinder(name + "_rod", 0.012, H - (z + size[2] / 2), (x, y, (H + z + size[2] / 2) / 2), M["metal_dark"], verts=10))
    else:
        parts.append(rbox(name + "_bracket", (0.06, 0.18, 0.06), (x - fx * (size[1] / 2 + 0.06), y - fy * (size[1] / 2 + 0.06), z + 0.1), M["metal_dark"], bevel=0.01, rot=(0, 0, rot_z)))
    for p in parts:
        kit.grp("props", p)


def popcorn_machine(x, y, z=0.0):
    rnd = random.Random(4)
    g = []
    w, d = 0.86, 0.64
    # cart cabinet
    g.append(rbox("pop_cab", (w, d, 0.78), (x, y, z + 0.47), M["popcorn_red"], bevel=0.03, segments=3))
    g.append(rbox("pop_door", (0.5, 0.02, 0.42), (x + 0.04 * 0, y + d / 2 + 0.005, z + 0.42), M["popcorn_redd"], bevel=0.012))
    g.append(rbox("pop_handle", (0.24, 0.03, 0.035), (x, y + d / 2 + 0.03, z + 0.56), M["popcorn_trim"], bevel=0.012))
    g.append(rbox("pop_trim_low", (w + 0.02, d + 0.02, 0.05), (x, y, z + 0.1), M["popcorn_trim"], bevel=0.015))
    g.append(rbox("pop_trim_mid", (w + 0.03, d + 0.03, 0.05), (x, y, z + 0.86), M["popcorn_trim"], bevel=0.015))
    for k, (kx, mat) in enumerate(((-0.16, M["knob_purple"]), (0.16, M["popcorn_yellow"]))):
        g.append(cylinder(f"pop_knob{k}", 0.05, 0.04, (x + kx, y + d / 2 + 0.02, z + 0.74), mat, verts=24, rot=(90, 0, 0), bevel=0.01))
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.append(sphere(f"pop_wheel{sx}{sy}", 0.045, (x + sx * (w / 2 - 0.08), y + sy * (d / 2 - 0.08), z + 0.045), M["popcorn_redd"], segments=16, rings=8))
    # glass case frame + popcorn
    zc0, zc1 = z + 0.9, z + 1.72
    for sx in (-1, 1):
        for sy in (-1, 1):
            g.append(rbox(f"pop_post{sx}{sy}", (0.035, 0.035, zc1 - zc0), (x + sx * (w / 2 - 0.02), y + sy * (d / 2 - 0.02), (zc0 + zc1) / 2), M["popcorn_trim"], bevel=0.008))
    for k in range(70):
        px = x + rnd.uniform(-w / 2 + 0.06, w / 2 - 0.06)
        py = y + rnd.uniform(-d / 2 + 0.06, d / 2 - 0.06)
        pz = zc0 + 0.03 + rnd.uniform(0, 0.17) * (1 - abs(px - x) / w)
        g.append(sphere(f"pop_corn{k}", rnd.uniform(0.028, 0.04), (px, py, pz), M["popcorn"] if rnd.random() < 0.6 else M["popcorn2"], scale=(1, rnd.uniform(0.8, 1.1), rnd.uniform(0.75, 1.0)), segments=10, rings=6, rot=(rnd.uniform(0, 90), rnd.uniform(0, 90), 0)))
    g.append(rbox("pop_kettle", (0.2, 0.2, 0.14), (x + 0.12, y - 0.05, zc1 - 0.16), M["metal_dark"], bevel=0.05))
    # roof
    g.append(rbox("pop_roof", (w + 0.1, d + 0.1, 0.1), (x, y, zc1 + 0.05), M["popcorn_red"], bevel=0.035, segments=3))
    g.append(rbox("pop_roof_top", (w - 0.04, d - 0.04, 0.12), (x, y, zc1 + 0.15), M["popcorn_red"], bevel=0.05, segments=4))
    g.append(rbox("pop_sign", (w - 0.1, 0.04, 0.12), (x, y + d / 2 + 0.02, zc1 + 0.18), M["popcorn_yellow"], bevel=0.02))
    for k in range(3):
        b = sphere(f"EMIT_pop_dot{k}", 0.045, (x - 0.15 + k * 0.15, y + d / 2 + 0.045, zc1 + 0.18), M["sign"], scale=(1.2, 0.5, 0.75), segments=16, rings=8)
        kit.emit(b)
    for k in range(4):
        b = sphere(f"EMIT_pop_bulb{k}", 0.022, (x - 0.24 + k * 0.16, y + d / 2 - 0.03, zc1 - 0.03), M["bulb"], segments=12, rings=6)
        kit.emit(b)
    for o in g:
        kit.grp("props", o)
    kit.collider("popcorn", (w + 0.1, d + 0.1), (x, y))
    kit.anchor("popcorn", {"pos": roomkit.bab((x, y, z))})
    LIGHTS["popcorn"] = ((x, y, zc1 - 0.15), (x, y + d / 2 + 0.3, z + 1.2))


def projector(x, y, z, target):
    g = [rbox("proj_body", (0.3, 0.38, 0.2), (x, y, z), M["speaker"], bevel=0.03, segments=3, rot=(0, 0, 18))]
    g.append(cylinder("proj_rod", 0.012, H - z - 0.1, (x, y, (H + z + 0.1) / 2), M["metal_dark"], verts=10))
    g.append(rbox("proj_mount", (0.2, 0.06, 0.04), (x, y, z + 0.12), M["metal_dark"], bevel=0.008))
    for o in g:
        kit.grp("props", o)
    tgt = Vector(target)
    lens_pos = Vector((x, y, z))
    dirv = (tgt - lens_pos).normalized()
    lp = lens_pos + dirv * 0.2
    lens = cylinder("EMIT_projector_lens", 0.045, 0.03, tuple(lp), M["lens"], verts=24)
    lens.rotation_mode = "QUATERNION"
    lens.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(dirv)
    kit.emit(lens)
    beam = make_beam(lp, tgt, 1.15, 0.65)
    kit.emit(beam)
    kit.anchor("projector", {"pos": roomkit.bab(tuple(lp)), "beamMesh": "EMIT_beam", "lensMesh": "EMIT_projector_lens"})
    LIGHTS["projector"] = tuple(lp)


def make_beam(a, b, w_end, h_end, segs=24, rings=10):
    """Light cone from the lens to a w x h ellipse at the screen. Vertex colour = intensity
    (bright at the lens, fading to the screen, soft at the rim); drawn additively at runtime."""
    a, b = Vector(a), Vector(b)
    axis = (b - a)
    L = axis.length
    fwd = axis.normalized()
    up = Vector((0, 0, 1))
    right = fwd.cross(up).normalized()
    up2 = right.cross(fwd).normalized()
    bm = bmesh.new()
    col = bm.loops.layers.color.new("beam")
    rows = []
    for j in range(rings + 1):
        t = j / rings
        r0 = 0.035
        rw = r0 + (w_end / 2 - r0) * t
        rh = r0 + (h_end / 2 - r0) * t
        row = []
        for i in range(segs):
            ang = 2 * math.pi * i / segs
            p = a + fwd * (L * t) + right * (math.cos(ang) * rw) + up2 * (math.sin(ang) * rh)
            row.append(bm.verts.new(p))
        rows.append(row)
    for j in range(rings):
        for i in range(segs):
            f = bm.faces.new((rows[j][i], rows[j][(i + 1) % segs], rows[j + 1][(i + 1) % segs], rows[j + 1][i]))
    for f in bm.faces:
        for loop in f.loops:
            p = loop.vert.co
            t = min(1.0, max(0.0, (p - a).dot(fwd) / L))
            k = (1 - t) ** 1.6 * 0.85 + 0.15 * (1 - t)
            loop[col] = (k, k, k, 1)
    obj = blib.mesh_from_bmesh("EMIT_beam", bm)
    blib.set_mat(obj, M["beam"])
    ray_camera_only(obj)
    obj.hide_render = False
    return obj


def neon_tube():
    """Blue neon along the left wall: horizontal run under the ceiling, rounded corner, down."""
    x = 0.05
    y0, y1, z_top, z_bot, r = 1.2, 10.0, 3.72, 1.95, 0.42
    pts = []
    for k in range(20):
        pts.append((y0 + (y1 - y0) * k / 19, z_top))
    for k in range(1, 12):
        a = math.pi / 2 * k / 11
        pts.append((y1 + r * math.sin(a), z_top - r + r * math.cos(a)))
    for k in range(1, 12):
        pts.append((y1 + r, z_top - r - (z_top - r - z_bot) * k / 11))
    curve = bpy.data.curves.new("neon", "CURVE")
    curve.dimensions = "3D"
    sp = curve.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, (yy, zz) in enumerate(pts):
        sp.points[i].co = (x, yy, zz, 1)
    curve.bevel_depth = 0.022
    curve.bevel_resolution = 3
    obj = bpy.data.objects.new("EMIT_neon", curve)
    blib.link(obj)
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    obj.name = "EMIT_neon"
    blib.set_mat(obj, M["neon"])
    kit.emit(obj)
    # mounting channel
    kit.grp("props", rbox("neon_channel", (0.02, y1 - y0, 0.05), (0.012, (y0 + y1) / 2, z_top), M["metal_dark"], bevel=0.005))


def downlights():
    pos = []
    for y in (4.6, 7.9, 10.9):
        for x in (2.1, 5.9):
            pos.append((x, y))
    for i, (x, y) in enumerate(pos):
        kit.grp("shell", cylinder(f"downlight_ring{i}", 0.09, 0.02, (x, y, H - 0.008), M["brass"], verts=28))
        d = cylinder(f"EMIT_downlight{i}", 0.065, 0.01, (x, y, H - 0.016), M["downlight"], verts=28)
        kit.emit(d)
    LIGHTS["downlights"] = pos


def sconces():
    out = []
    for x, sgn in ((0.0, 1), (W, -1)):
        for y in (7.2, 9.8):
            if x == 0.0 and y > 9:
                continue  # the neon runs down there
            cx = x + sgn * 0.07
            kit.grp("props", rbox(f"sconce_{x:.0f}_{y:.0f}", (0.1, 0.22, 0.13), (cx, y, 2.2), M["metal_dark"], bevel=0.04, segments=3))
            for dz, nm in ((0.085, "up"), (-0.085, "dn")):
                e = rbox(f"EMIT_sconce_{x:.0f}_{y:.0f}_{nm}", (0.06, 0.17, 0.01), (cx, y, 2.2 + dz * 0.8), M["sconce"], bevel=0)
                kit.emit(e)
            out.append((cx + sgn * 0.05, y, 2.2))
    LIGHTS["sconces"] = out


def pouf(x, y, z):
    kit.grp("props", cylinder("pouf", 0.25, 0.4, (x, y, z + 0.2), M["pouf"], verts=40, bevel=0.06))
    ring = bpy.data.meshes.new("ring")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=48, radius=0.2)
    bm.to_mesh(ring)
    bm.free()
    o = bpy.data.objects.new("EMIT_pouf_ring", ring)
    blib.link(o)
    o.location = (x, y, z + 0.405)
    sol = o.modifiers.new("skin", "SKIN")
    for v in o.data.skin_vertices[0].data:
        v.radius = (0.012, 0.012)
    blib.apply_all(o)
    blib.set_mat(o, M["pink"])
    blib.shade_smooth(o)
    kit.emit(o)
    kit.collider("pouf", (0.52, 0.52), (x, y))
    LIGHTS["pouf"] = (x, y, z + 0.5)


def subwoofer(x, y):
    kit.grp("props", rbox("sub_box", (0.62, 0.55, 0.72), (x, y, 0.36), M["speaker"], bevel=0.03, segments=3))
    kit.grp("props", cylinder("sub_cone", 0.2, 0.02, (x, y + 0.28, 0.4), M["grille"], verts=32, rot=(90, 0, 0)))
    kit.collider("subwoofer", (0.62, 0.55), (x, y))


def import_plant(asset, name, loc, height, rot_z=0, decimate=0.3):
    path_dir = os.path.join(PH, asset)
    gltf = [f for f in os.listdir(path_dir) if f.endswith(".gltf")][0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(path_dir, gltf))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
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
        dm = obj.modifiers.new("dec", "DECIMATE")
        dm.ratio = decimate
        blib.apply_all(obj)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    s = height / max(1e-3, max(v.z for v in bb) - min(v.z for v in bb))
    obj.scale = (s, s, s)
    blib.apply_all(obj)
    bb = [Vector(c) for c in obj.bound_box]
    cx = sum(v.x for v in bb) / 8
    cy = sum(v.y for v in bb) / 8
    zmin = min(v.z for v in bb)
    for v in obj.data.vertices:
        v.co.x -= cx
        v.co.y -= cy
        v.co.z -= zmin
    obj.location = loc
    obj.rotation_euler = (0, 0, math.radians(rot_z))
    return obj


def build_props():
    popcorn_machine(0.47, 9.45)
    subwoofer(0.75, 11.25)
    speaker("spk_front_l", (0.95, D - 0.27, 3.25), 0, size=(0.56, 0.4, 0.82))
    speaker("spk_front_r", (W - 0.95, D - 0.27, 3.25), 0, size=(0.56, 0.4, 0.82))
    speaker("spk_left", (0.26, 8.0, 3.45), -90 + 14, size=(0.44, 0.36, 0.7))
    speaker("spk_right", (W - 0.3, 5.5, 3.5), 90 - 18, size=(0.46, 0.38, 0.74), hang=True)
    projector(W - 0.32, 8.1, 3.1, (SCREEN["cx"] + 1.35, SCREEN["y"], SCREEN["z0"] + SCREEN["h"] * 0.62))
    neon_tube()
    downlights()
    sconces()
    pouf(0.42, 8.55, 0.0)
    plant = import_plant("potted_plant_01", "plant_back", (1.25, 2.3, 0.9), 1.25, rot_z=30, decimate=0.12)
    kit.grp("plants", plant)
    kit.collider("plant", (0.55, 0.55), (1.25, 2.3))


# ------------------------------------------------------------------ lights + camera

def build_lights():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = blib.srgb("#3a2a68")
    bg.inputs["Strength"].default_value = 0.35
    LIGHTS["world"] = bg

    def light(name, kind, loc, color, energy, size=0.1, rot=(0, 0, 0), spot=None):
        ld = bpy.data.lights.new(name, kind)
        ld.color = blib.srgb(color)[:3]
        ld.energy = energy
        if kind == "AREA":
            ld.shape = "RECTANGLE"
            ld.size, ld.size_y = size
        elif kind in ("POINT", "SPOT"):
            ld.shadow_soft_size = size
        if spot:
            ld.spot_size = math.radians(spot)
            ld.spot_blend = 0.8
        o = bpy.data.objects.new(name, ld)
        o.location = loc
        o.rotation_euler = [math.radians(a) for a in rot]
        blib.link(o)
        return o

    base = []
    # violet fill from the back of the room and under the ceiling (keeps the seat backs readable)
    base.append(light("L_back_fill", "AREA", (W / 2, 0.6, 3.6), "#d4a4ff", 280, size=(6.4, 1.2), rot=(62, 0, 0)))
    base.append(light("L_ceiling_fill", "AREA", (W / 2, 7.5, H - 0.05), "#ac8ef0", 260, size=(6.8, 8.0)))
    # front: cool wash on the screen wall + stage (the draft's indigo front)
    base.append(light("L_front_wash", "AREA", (W / 2, 10.2, 3.9), "#7c5eff", 220, size=(6.4, 1.0), rot=(35, 0, 0)))
    for i, (x, y) in enumerate(LIGHTS["downlights"]):
        base.append(light(f"L_down{i}", "SPOT", (x, y, H - 0.04), "#ffd6a8", 70, size=0.06, spot=80))
    for i, p in enumerate(LIGHTS["sconces"]):
        base.append(light(f"L_sconce{i}", "POINT", p, "#ffb27a", 22, size=0.08))
    pc, pf = LIGHTS["popcorn"]
    base.append(light("L_popcorn_in", "POINT", pc, "#ffd27a", 30, size=0.1))
    base.append(light("L_popcorn_front", "POINT", pf, "#ff9a7a", 18, size=0.3))
    base.append(light("L_pouf", "POINT", LIGHTS["pouf"], "#ff5aa8", 8, size=0.15))
    base.append(light("L_projector", "POINT", LIGHTS["projector"], "#7fc8ff", 12, size=0.1))
    base.append(light("L_neon", "AREA", (0.12, 7.3, 3.55), "#3f6bff", 80, size=(7.2, 0.3), rot=(0, -90, 0)))
    LIGHTS["base"] = base


def screen_layer_on():
    """Only the screen lights the room (white, reference strength)."""
    LIGHTS["saved"] = [(o, o.data.energy) for o in LIGHTS["base"]]
    for o in LIGHTS["base"]:
        o.data.energy = 0.0
    LIGHTS["world_saved"] = LIGHTS["world"].inputs["Strength"].default_value
    LIGHTS["world"].inputs["Strength"].default_value = 0.0
    LIGHTS["emit_saved"] = []
    for m in bpy.data.materials:
        if m.name.startswith("EMIT_") and m.use_nodes:
            b = m.node_tree.nodes.get("Principled BSDF")
            if b:
                LIGHTS["emit_saved"].append((b, b.inputs["Emission Strength"].default_value))
                b.inputs["Emission Strength"].default_value = 0.0
    sb = M["screen"].node_tree.nodes["Principled BSDF"]
    for n in M["screen"].node_tree.nodes:
        if n.type == "TEX_IMAGE":
            for lk in list(n.outputs["Color"].links):
                M["screen"].node_tree.links.remove(lk)
    sb.inputs["Emission Color"].default_value = (1, 1, 1, 1)
    sb.inputs["Emission Strength"].default_value = 3.0


def screen_layer_off():
    for o, e in LIGHTS["saved"]:
        o.data.energy = e
    LIGHTS["world"].inputs["Strength"].default_value = LIGHTS["world_saved"]
    for b, s in LIGHTS["emit_saved"]:
        b.inputs["Emission Strength"].default_value = s
    sb = M["screen"].node_tree.nodes["Principled BSDF"]
    sb.inputs["Emission Strength"].default_value = 0.0


def build_camera():
    # solved from scene-1.jpg (tools/world3d/solve_camera.py cinema, hfov 72): x 3.91 y 0.89 z 3.32, yaw 6.6, pitch -12.7
    yaw, pitch, dist = math.radians(6.58), math.radians(-12.72), 7.0
    loc = (4.11, 0.89, 3.32)
    tgt = (loc[0] + dist * math.sin(yaw) * math.cos(pitch), loc[1] + dist * math.cos(yaw) * math.cos(pitch), loc[2] + dist * math.sin(pitch))
    kit.hero_camera(loc, tgt, lens=float(arg("--lens", 24.8)))
    for x, y in ((3.6, 3.4), (4.6, 3.0), (2.8, 2.6), (5.4, 3.6), (3.8, 2.2), (5.0, 2.0)):
        kit.spawn(x, y, 0.9)
    kit.room_bounds(0, 0, W, D, H)


# ------------------------------------------------------------------ main

def main():
    scene = blib.reset_scene()
    make_materials()
    build_shell()
    build_seats()
    build_props()
    build_lights()
    build_camera()
    kit.light_layer("screen", screen_layer_on, screen_layer_off, size_div=2)
    scene.render.engine = "CYCLES"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = float(arg("--exposure", 0.0))

    preview = arg("--preview")
    if preview:
        if arg("--screen-on"):
            sb = M["screen"].node_tree.nodes["Principled BSDF"]
            sb.inputs["Emission Strength"].default_value = 2.5
        roomkit.render_preview(preview, samples=int(arg("--samples", 16)), w=int(arg("--w", 800)), h=int(arg("--h", 450)))
        return

    out = arg("--out", os.path.join(REPO, "frontend", "public", "world3d", "cinema.glb"))
    samples = int(arg("--samples", 48))
    work = os.path.join(blib.HERE, "out", "bakes", "cinema")
    os.makedirs(work, exist_ok=True)
    sizes = {"floor": 2048, "shell": 2048, "seats": 2048, "furniture": 1024, "props": 1024}
    if arg("--small"):
        sizes = {k: v // 4 for k, v in sizes.items()}
    job = arg("--bake-group")
    if job:
        # one bake job in this process (run_bakes starts one Blender per job)
        if job == "plants":
            for p in kit.groups.get("plants", []):
                roomkit.bake_own_uv(p, 512, max(16, samples // 2), work, mode="bake")
        else:
            roomkit.bake_atlas_group(kit, job, kit.groups[job], sizes[job], samples, work, layers=("screen",), mode="bake")
        print(f"[bake-done] {job}", flush=True)
        return
    if not arg("--bake"):
        return
    extra = ["--samples", str(samples)] + (["--small"] if arg("--small") else [])
    roomkit.run_bakes(os.path.abspath(__file__), list(sizes) + ["plants"], extra, out_dir=work, force=bool(arg("--force")))
    for g, size in sizes.items():
        roomkit.bake_atlas_group(kit, g, kit.groups[g], size, samples, work, layers=("screen",), mode="load")
    for p in kit.groups.get("plants", []):
        roomkit.bake_own_uv(p, 512, samples, work, mode="load")
    for o in kit.emissive:
        blib.apply_all(o)
    # export the screen with its standby image at unit strength (the runtime drives the level)
    M["screen"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.0
    for o in bpy.data.objects:
        if o.name == "BAKED_floor":
            o.name = "FLOOR"
    kit.write_layout(os.path.join(REPO, "frontend", "src", "world3d", "engine", "rooms", "cinema.layout.js"), "tools/world3d/build_cinema.py")
    roomkit.export_glb(out)


if __name__ == "__main__":
    main()
