"""Shared kit for the 3D world room build scripts (Descall, own work).

Used by build_cinema.py, build_game_room.py and build_camp.py (the living room keeps
its own phase 1 pipeline in build_living_room.py so its shipped GLB stays as it is).

What it adds over phase 1:
  * Light-separated bakes. Each atlas group is baked as albedo, irradiance and
    emission. Only the irradiance is denoised (edge-avoiding a-trous filter guided by
    baked world position and normal, so texture detail stays sharp), then
    recombined: final = albedo * denoise(irradiance) + emission.
  * Light layers. A layer (cinema screen, camp fire) is baked on its own with every
    other light off. The runtime adds it on top of the base atlas through the
    material's emissive slot, scaled by a live level (screen brightness, fire flicker).
  * Vertex colour bakes for dense small geometry (grass, needles): no atlas memory.
  * Room data. Colliders, seats, spawn points, floors, the hero camera and any anchor
    are written as a JS module in Babylon world space next to the engine code
    (frontend/src/world3d/engine/rooms/<id>.layout.js), so the client never parses
    helper nodes out of the GLB.

Axes: Blender is Z up. Babylon (after the glTF loader's handedness flip) is
x = -blenderX, y = blenderZ, z = -blenderY.
"""
import json
import math
import os

import bpy
import numpy as np
from mathutils import Vector

import blib

EXPOSURE = 1.25


def bab(p):
    """Blender point -> Babylon world point."""
    return [round(-p[0], 4), round(p[2], 4), round(-p[1], 4)]


def bab_yaw(dx, dy):
    """Facing direction in Blender XY -> Babylon yaw (atan2(x, z) of the Babylon direction)."""
    return round(math.atan2(-dx, -dy), 4)


class Kit:
    def __init__(self, room_id):
        self.room_id = room_id
        self.groups = {}       # atlas groups: name -> [objects]
        self.vc_groups = {}    # vertex colour groups: name -> [objects]
        self.emissive = []     # exported unbaked (HDR emissive, runtime driven)
        self.colliders = []
        self.seats = []
        self.spawns = []
        self.floors = []
        self.anchors = {}
        self.bounds = None
        self.hero = None
        self.layers = {}       # name -> {"on": fn, "off": fn, "size_div": int}
        self.layer_maps = {}   # group -> [layer names]

    # ------------------------------------------------------------ registry
    def grp(self, name, obj):
        self.groups.setdefault(name, []).append(obj)
        return obj

    def vc(self, name, obj):
        self.vc_groups.setdefault(name, []).append(obj)
        return obj

    def emit(self, obj):
        self.emissive.append(obj)
        return obj

    def collider(self, name, size, loc, rot_z=0.0):
        """Floor-plane box: size (x, y) metres, centre (x, y) in Blender, rotation about Z (deg)."""
        self.colliders.append({"name": name, "size": (size[0], size[1]), "loc": (loc[0], loc[1]), "rot": rot_z})

    def seat(self, name, root, facing, kind, height=0.46, ground=0.0, approach=None, extra=None):
        """root: where the avatar's feet stand when seated (Blender x, y);
        facing: direction (dx, dy) the seated avatar looks at; ground: floor height there."""
        self.seats.append({"name": name, "root": (root[0], root[1], ground), "facing": facing, "type": kind,
                           "height": height, "approach": approach, "extra": extra or {}})
        return name

    def spawn(self, x, y, ground=0.0):
        self.spawns.append((x, y, ground))

    def floor(self, x0, y0, x1, y1, z):
        """Walkable raised area (axis aligned, Blender XY) at height z."""
        self.floors.append((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1), z))

    def room_bounds(self, x0, y0, x1, y1, height):
        self.bounds = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1), height)

    def anchor(self, key, value):
        self.anchors[key] = value

    def light_layer(self, name, on, off, size_div=2):
        self.layers[name] = {"on": on, "off": off, "size_div": size_div}

    # ------------------------------------------------------------ camera
    def hero_camera(self, loc, target, lens=26.0, sensor=36.0, name="hero"):
        cam_data = bpy.data.cameras.new(name)
        cam_data.lens = lens
        cam_data.sensor_width = sensor
        cam_data.sensor_fit = "HORIZONTAL"
        cam = bpy.data.objects.new(name, cam_data)
        blib.link(cam)
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.camera = cam
        self.hero = {"pos": bab(loc), "target": bab(target), "fov": round(2 * math.atan(sensor / 2 / lens), 4)}
        return cam

    # ------------------------------------------------------------ layout
    def layout(self):
        out = {"id": self.room_id}
        if self.bounds:
            x0, y0, x1, y1, h = self.bounds
            out["bounds"] = {"minX": round(-x1, 4), "maxX": round(-x0, 4), "minY": 0, "maxY": h,
                             "minZ": round(-y1, 4), "maxZ": round(-y0, 4)}
        cols = []
        for c in self.colliders:
            rz = math.radians(c["rot"])
            # box local x axis in Babylon xz: (-cos, -sin) -> collision.js angle
            ang = math.atan2(-math.sin(rz), -math.cos(rz))
            cols.append({"name": c["name"], "cx": round(-c["loc"][0], 4), "cz": round(-c["loc"][1], 4),
                         "hx": round(c["size"][0] / 2, 4), "hz": round(c["size"][1] / 2, 4), "angle": round(ang, 4)})
        out["colliders"] = cols
        seats = []
        for s in sorted(self.seats, key=lambda s: s["name"]):
            row = {"name": s["name"], "type": s["type"], "pos": bab(s["root"]),
                   "yaw": bab_yaw(*s["facing"]), "height": s["height"]}
            if s["approach"] is not None:
                ax, ay = s["approach"]
                row["approach"] = [round(-ax, 4), round(-ay, 4)]
            if s["extra"]:
                row.update(s["extra"])
            seats.append(row)
        out["seats"] = seats
        out["spawns"] = [bab(p) for p in self.spawns]
        out["floors"] = [{"minX": round(-x1, 4), "maxX": round(-x0, 4), "minZ": round(-y1, 4), "maxZ": round(-y0, 4), "y": z}
                         for (x0, y0, x1, y1, z) in self.floors]
        out["hero"] = self.hero
        out["anchors"] = self.anchors
        return out

    def write_layout(self, path, source):
        data = self.layout()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w") as f:
            f.write(f"// Generated by {source}. Do not edit: change the build script and rebuild.\n")
            f.write("// Babylon world space: metres, Y up (x = -blenderX, y = blenderZ, z = -blenderY).\n")
            f.write("export default ")
            f.write(json.dumps(data, indent=1))
            f.write(";\n")
        print("layout ->", path)


# ------------------------------------------------------------------ materials

def textured_gray(name, tex_dir, prefix, tint="#ffffff", rough=0.8, scale=1.0, normal_strength=0.5, rotate=0.0, detail=0.6):
    """ambientCG set used for detail only: the colour map is turned to grey and multiplied
    by `tint`, so the draft's colour comes from the tint (detail = contrast of the texture)."""
    mat = blib.principled(name, tint, rough)
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    mapping.inputs["Rotation"].default_value = (0, 0, rotate)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    def img(kind, non_color=False):
        for f in sorted(os.listdir(tex_dir)):
            if f.startswith(prefix) and kind in f:
                node = nt.nodes.new("ShaderNodeTexImage")
                node.image = bpy.data.images.load(os.path.join(tex_dir, f), check_existing=True)
                if non_color:
                    node.image.colorspace_settings.name = "Non-Color"
                nt.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
                return node
        return None

    col = img("_Color")
    if col:
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(col.outputs["Color"], bw.inputs["Color"])
        # normalise around the texture's mid grey: v = 1 + detail * (lum / mean - 1)
        arr = np.asarray(col.image.pixels[:], np.float32).reshape(-1, 4)[:, :3]
        mean = float((arr * [0.2126, 0.7152, 0.0722]).sum(axis=1).mean()) or 0.5
        m1 = nt.nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY_ADD"
        m1.inputs[1].default_value = detail / mean
        m1.inputs[2].default_value = 1.0 - detail
        nt.links.new(bw.outputs["Val"], m1.inputs[0])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = blib.srgb(tint)
        comb = nt.nodes.new("ShaderNodeCombineColor")
        for k in range(3):
            nt.links.new(m1.outputs[0], comb.inputs[k])
        nt.links.new(comb.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    rgh = img("_Roughness", True)
    if rgh:
        nt.links.new(rgh.outputs["Color"], bsdf.inputs["Roughness"])
    nrm = img("_NormalGL", True)
    if nrm:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ------------------------------------------------------------------ UV helpers

def uv_metres(obj, scale=1.0):
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
                uv[li].uv = (co.y * scale, co.z * scale)
            elif ax == 1:
                uv[li].uv = (co.x * scale, co.z * scale)
            else:
                uv[li].uv = (co.x * scale, co.y * scale)


def uv_box_fit(obj):
    """UVs that span 0..1 over the object's largest planar face set (screens, posters)."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")


# ------------------------------------------------------------------ bake

def _select_only(obj):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _cycles(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 1
    scene.cycles.transmission_bounces = 2
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.sample_clamp_indirect = 8.0
    scene.render.threads_mode = "FIXED"
    scene.render.threads = int(os.environ.get("BAKE_THREADS", "3"))


def _bake(kind, img, samples, direct=False, indirect=False, color=False, margin=8, target="IMAGE_TEXTURES"):
    scene = bpy.context.scene
    _cycles(samples)
    b = scene.render.bake
    b.target = target
    b.margin = margin
    b.margin_type = "EXTEND"
    b.use_pass_direct = direct
    b.use_pass_indirect = indirect
    b.use_pass_color = color
    b.use_pass_diffuse = True
    b.use_pass_glossy = False
    b.use_pass_transmission = True
    b.use_pass_emit = True
    b.normal_space = "OBJECT"
    bpy.ops.object.bake(type=kind)
    if img is None:
        return None
    w, h = img.size
    arr = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4)


def new_float_image(name, size):
    img = bpy.data.images.new(name, width=size, height=size, alpha=True, float_buffer=True)
    img.pixels.foreach_set(np.zeros(size * size * 4, np.float32))
    return img


def lightmap_uv(obj, margin=0.004):
    me = obj.data
    uv = me.uv_layers.new(name="bake")
    me.uv_layers.active = uv
    _select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=margin * 1.5, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def _attach_target(mats, img, uv_name, orig_uv):
    for m in mats:
        nt = m.node_tree
        old = nt.nodes.get("__bake__")
        if old:
            nt.nodes.remove(old)
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "__bake__"
        uvn = nt.nodes.get("__bake_uv__") or nt.nodes.new("ShaderNodeUVMap")
        uvn.name = "__bake_uv__"
        uvn.uv_map = uv_name
        nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
        nt.nodes.active = n
        for tn in nt.nodes:
            if tn.type == "TEX_IMAGE" and tn.name != "__bake__" and not tn.inputs["Vector"].is_linked and orig_uv:
                u2 = nt.nodes.new("ShaderNodeUVMap")
                u2.uv_map = orig_uv
                nt.links.new(u2.outputs["UV"], tn.inputs["Vector"])


def _guide_material(kind):
    """Emission shader that outputs world position or normal (baked through EMIT)."""
    name = "__guide_" + kind
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nt.links.new(geo.outputs["Position" if kind == "pos" else "Normal"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def denoise_irradiance(E, P, N, mask, passes=5, sigma_p=0.06, sigma_n=24.0, sigma_l=0.35):
    """Edge-avoiding a-trous wavelet filter (5x5 B3 spline taps, step 1,2,4,8,16).
    E: irradiance HxWx3, P: world position, N: normal, mask: valid texels."""
    k = np.array([1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16], np.float32)
    E = E * mask[..., None]
    m = mask.astype(np.float32)
    lum = lambda a: a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722  # noqa: E731
    for it in range(passes):
        step = 1 << it
        acc = np.zeros_like(E)
        wsum = np.zeros(E.shape[:2], np.float32)
        l0 = lum(E)
        for j in range(5):
            dy = (j - 2) * step
            for i in range(5):
                dx = (i - 2) * step
                sE = np.roll(E, (dy, dx), (0, 1))
                sP = np.roll(P, (dy, dx), (0, 1))
                sN = np.roll(N, (dy, dx), (0, 1))
                sm = np.roll(m, (dy, dx), (0, 1))
                dp = ((sP - P) ** 2).sum(axis=2)
                wp = np.exp(-dp / (2 * (sigma_p * (1 + 0.5 * it)) ** 2))
                wn = np.clip((sN * N).sum(axis=2), 0, 1) ** sigma_n
                dl = np.abs(lum(sE) - l0)
                wl = np.exp(-dl / (sigma_l * (l0 + 0.02) * (2 ** (it * 0.5)) + 1e-4))
                w = k[i] * k[j] * sm * wp * wn * wl
                acc += sE * w[..., None]
                wsum += w
        E = np.where(wsum[..., None] > 1e-8, acc / np.maximum(wsum[..., None], 1e-8), E)
    return E


def encode_display(x):
    """Linear radiance -> display-referred linear 0..1 with a soft shoulder (the client tone-maps)."""
    x = np.clip(x * EXPOSURE, 0, None)
    knee = 0.75
    hi = x > knee
    x[hi] = knee + (1 - knee) * (1 - np.exp(-(x[hi] - knee) / (1 - knee)))
    return x


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def save_rgb(arr, path, linear_display=True):
    s = to_srgb(encode_display(arr)) if linear_display else to_srgb(arr)
    h, w = s.shape[:2]
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = s
    img = bpy.data.images.new("save_" + os.path.basename(path), width=w, height=h, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def dilate(arr, mask, iters=6):
    """Push valid texels outward over empty ones (mip-safe borders)."""
    a = arr.copy()
    m = mask.astype(np.float32)
    for _ in range(iters):
        acc = np.zeros_like(a)
        cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(a * m[..., None], (dy, dx), (0, 1))
            cnt += np.roll(m, (dy, dx), (0, 1))
        grow = (m == 0) & (cnt > 0)
        a[grow] = acc[grow] / cnt[grow][..., None]
        m = np.where(grow, 1.0, m)
    return a


def strip_bottom(obj, tol=0.02):
    """Delete downward faces that sit on the object's lowest level (never seen, saves atlas)."""
    import bmesh
    if obj.get("keep_bottom"):
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    mw = obj.matrix_world
    zs = [(mw @ v.co).z for v in bm.verts]
    if not zs:
        bm.free()
        return
    zmin = min(zs)
    if zmin > 1.2:  # hanging / ceiling parts: their undersides are seen
        bm.free()
        return
    kill = []
    for f in bm.faces:
        n = (mw.to_3x3() @ f.normal)
        if n.z < -0.97 and (mw @ f.calc_center_median()).z < zmin + tol:
            kill.append(f)
    if kill and len(kill) < len(bm.faces):
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(obj.data)
    bm.free()


def _save_uv(me, path):
    arr = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers["bake"].data.foreach_get("uv", arr)
    np.save(path, arr)


def _load_uv(me, path):
    arr = np.load(path)
    if arr.size != len(me.loops) * 2:
        raise SystemExit(f"{path}: lightmap UVs do not match the mesh ({arr.size // 2} vs {len(me.loops)} loops): rebake")
    me.uv_layers["bake"].data.foreach_set("uv", arr)


def bake_atlas_group(kit, name, objs, size, samples, out_dir, layers=(), material_name=None, mode="bake"):
    """One atlas group. mode "bake": bake and write bake_<name>*.png + its lightmap UVs
    (run in its own Blender process, see run_bakes); mode "load": rebuild the group and
    its baked material from those files. Returns the joined object (material BAKED_<name>)."""
    objs = [o for o in objs if o.type == "MESH"]
    for o in objs:
        blib.apply_all(o)
        strip_bottom(o)
    joined = blib.join(objs, "BAKED_" + name) if len(objs) > 1 else objs[0]
    joined.name = "BAKED_" + name
    me = joined.data
    orig_uv = me.uv_layers[0].name if me.uv_layers else None
    lightmap_uv(joined)
    uv_path = os.path.join(out_dir, f"uv_{name}.npy")
    path = os.path.join(out_dir, f"bake_{name}.png")
    layer_paths = {ln: os.path.join(out_dir, f"bake_{name}_{ln}.png") for ln in layers}
    if mode == "bake":
        _save_uv(me, uv_path)
        _bake_group_maps(kit, name, joined, size, samples, path, layer_paths, orig_uv)
        return joined
    _load_uv(me, uv_path)
    # replace materials by one baked material
    out_img = bpy.data.images.load(path)
    bm = bpy.data.materials.new(material_name or ("BAKED_" + name))
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
    if layer_paths:
        # first layer rides in the emissive slot (the runtime sets its colour / level)
        lname, lp = next(iter(layer_paths.items()))
        li = bpy.data.images.load(lp)
        t2 = nt.nodes.new("ShaderNodeTexImage")
        t2.image = li
        nt.links.new(uvn.outputs["UV"], t2.inputs["Vector"])
        nt.links.new(t2.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
        bm["descall_layer"] = lname
    me.materials.clear()
    me.materials.append(bm)
    for l in list(me.uv_layers):
        if l.name != "bake":
            me.uv_layers.remove(l)
    return joined


def _bake_group_maps(kit, name, joined, size, samples, path, layer_paths, orig_uv):
    me = joined.data
    _select_only(joined)
    mats = [m for m in me.materials if m]
    img = new_float_image("bake_" + name, size)
    _attach_target(mats, img, "bake", orig_uv)
    print(f"[bake] {name}: {len(me.polygons)} faces, {size}px, {samples} spp", flush=True)
    A = _bake("DIFFUSE", img, max(4, samples // 8), color=True)
    mask = A[..., 3] > 0.5
    A = A[..., :3]
    E = _bake("DIFFUSE", img, samples, direct=True, indirect=True)[..., :3]
    Em = _bake("EMIT", img, 1)[..., :3]
    N = _bake("NORMAL", img, 1)[..., :3] * 2 - 1
    N = N / np.maximum(np.linalg.norm(N, axis=2, keepdims=True), 1e-6)
    # world position guide: emission material swap (one extra scene sync)
    saved = [sl.material for sl in joined.material_slots]
    g = _guide_material("pos")
    _attach_target([g], img, "bake", None)
    for sl in joined.material_slots:
        sl.material = g
    P = _bake("EMIT", img, 1)[..., :3]
    for sl, m in zip(joined.material_slots, saved):
        sl.material = m
    En = denoise_irradiance(E, P, N, mask)
    final = dilate(A * En + Em, mask)
    save_rgb(final, path)
    for lname, lp in layer_paths.items():
        L = kit.layers[lname]
        lsize = max(256, size // L["size_div"])
        limg = new_float_image(f"bake_{name}_{lname}", lsize)
        _attach_target(mats, limg, "bake", orig_uv)
        L["on"]()
        print(f"[bake] {name} layer {lname}: {lsize}px", flush=True)
        El = _bake("DIFFUSE", limg, max(16, samples // 2), direct=True, indirect=True)[..., :3]
        L["off"]()
        sy = size // lsize
        Pl, Nl, Al, ml = P[::sy, ::sy], N[::sy, ::sy], A[::sy, ::sy], mask[::sy, ::sy]
        El = denoise_irradiance(El, Pl, Nl, ml, passes=4)
        save_rgb(dilate(Al * El, ml), lp)
        bpy.data.images.remove(limg)
    bpy.data.images.remove(img)


def bake_own_uv(obj, size, samples, out_dir, mode="bake"):
    """A CC0 model (alpha cut-out leaves) baked into its own UVs, one image per material.
    Keeps the source alpha; colour becomes the baked radiance."""
    blib.apply_all(obj)
    me = obj.data
    mats = [m for m in me.materials if m]
    paths = {m.name: os.path.join(out_dir, f"bake_{obj.name}_{m.name}.png".replace(" ", "_")) for m in mats}
    if mode == "bake":
        imgs = []
        for m in mats:
            img = new_float_image(f"bake_{obj.name}_{m.name}", size)
            nt = m.node_tree
            n = nt.nodes.new("ShaderNodeTexImage")
            n.image = img
            n.name = "__bake__"
            nt.nodes.active = n
            imgs.append((m, img))
        _select_only(obj)
        print(f"[bake] own-uv {obj.name}: {len(me.polygons)} faces", flush=True)
        _bake("COMBINED", None, samples, direct=True, indirect=True, color=True)
        for m, img in imgs:
            arr = np.empty(size * size * 4, np.float32)
            img.pixels.foreach_get(arr)
            arr = arr.reshape(size, size, 4)
            save_rgb(dilate(arr[..., :3], arr[..., 3] > 0.5, iters=4), paths[m.name])
            bpy.data.images.remove(img)
        return obj
    for m in mats:
        out = bpy.data.images.load(paths[m.name])
        nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = out
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        for lk in list(bsdf.inputs["Normal"].links):
            nt.links.remove(lk)
        bsdf.inputs["Roughness"].default_value = 1.0
        for nn in list(nt.nodes):
            if nn.type == "TEX_IMAGE" and nn is not t and not any(lk.to_socket.name == "Alpha" for lk in nn.outputs["Alpha"].links):
                nt.nodes.remove(nn)
        m.name = "BAKED_" + m.name
    return obj


def run_bakes(script, jobs, extra_args=(), out_dir=None, force=False, retries=2):
    """Bake each job (group name) in its own Blender process: Blender 4.0's Cycles/Embree
    can crash after many scene re-syncs in one process. A job is skipped when its
    marker file exists (resumable); --force rebakes."""
    import subprocess
    for job in jobs:
        marker = os.path.join(out_dir, f"done_{job}") if out_dir else None
        if marker and os.path.exists(marker) and not force:
            print(f"[bake] {job}: cached", flush=True)
            continue
        for attempt in range(retries + 1):
            cmd = [bpy.app.binary_path, "-b", "--factory-startup", "-P", script, "--", "--bake-group", job, *extra_args]
            print("[bake] run", job, "attempt", attempt + 1, flush=True)
            r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            ok = r.returncode == 0 and f"[bake-done] {job}" in r.stdout
            for line in r.stdout.splitlines():
                if line.startswith("[bake") or "Error" in line or "Traceback" in line:
                    print("   ", line, flush=True)
            if ok:
                if marker:
                    open(marker, "w").write("ok")
                break
        else:
            raise SystemExit(f"bake job {job} failed {retries + 1} times")


def _join_vc(name, objs):
    objs = [o for o in objs if o.type == "MESH"]
    for o in objs:
        blib.apply_all(o)
    joined = blib.join(objs, "BAKED_vc_" + name) if len(objs) > 1 else objs[0]
    joined.name = "BAKED_vc_" + name
    return joined


def _vc_finish(joined, name, attr):
    me = joined.data
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find("bakecol")
    bm = bpy.data.materials.new("BAKED_vc_" + name)
    bm.use_nodes = True
    nt = bm.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "bakecol"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    me.materials.clear()
    me.materials.append(bm)
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    return joined


def bake_vertex_group(name, objs, samples):
    """Bake lighting into vertex colours (COLOR_0, display-referred linear)."""
    joined = _join_vc(name, objs)
    me = joined.data
    attr = me.color_attributes.new("bakecol", "FLOAT_COLOR", "POINT")
    me.color_attributes.active_color = attr
    _select_only(joined)
    print(f"[bake] vc {name}: {len(me.vertices)} verts", flush=True)
    _bake("COMBINED", None, samples, direct=True, indirect=True, color=True, target="VERTEX_COLORS")
    n = len(me.vertices)
    arr = np.empty(n * 4, np.float32)
    attr.data.foreach_get("color", arr)
    arr = arr.reshape(n, 4)
    arr[:, :3] = encode_display(arr[:, :3])
    arr[:, 3] = 1.0
    attr.data.foreach_set("color", arr.ravel())
    return _vc_finish(joined, name, attr)


def save_vertex_colors(obj, path):
    me = obj.data
    attr = me.color_attributes["bakecol"]
    arr = np.empty(len(me.vertices) * 4, np.float32)
    attr.data.foreach_get("color", arr)
    np.save(path, arr)


def load_vertex_group(name, objs, path):
    joined = _join_vc(name, objs)
    me = joined.data
    arr = np.load(path)
    if arr.size != len(me.vertices) * 4:
        raise SystemExit(f"{path}: vertex colours do not match ({arr.size // 4} vs {len(me.vertices)}): rebake")
    attr = me.color_attributes.new("bakecol", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", arr)
    return _vc_finish(joined, name, attr)


def export_glb(out, quality=84):
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    for o in list(bpy.data.objects):
        if o.type in ("LIGHT", "CAMERA", "EMPTY") or o.hide_render:
            bpy.data.objects.remove(o)
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
        export_colors=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=quality,
        export_image_webp_fallback=False,
        export_animations=False,
    )
    print("exported ->", out)


def render_preview(path, samples=16, w=800, h=450):
    scene = bpy.context.scene
    _cycles(samples)
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.filepath = path
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    bpy.ops.render.render(write_still=True)
    print("preview ->", path)
