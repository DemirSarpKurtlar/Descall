"""Small Blender helpers shared by the 3D world build scripts (Descall, own work).

Blender 4.0, run in background mode: blender -b -P <script> -- [args]
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def srgb(hex_or_tuple):
    """'#rrggbb' or (r,g,b) in sRGB 0..1 -> linear RGBA tuple for Blender colors."""
    if isinstance(hex_or_tuple, str):
        h = hex_or_tuple.lstrip("#")
        c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    else:
        c = list(hex_or_tuple)

    def lin(v):
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (lin(c[0]), lin(c[1]), lin(c[2]), 1.0)


# ---------------------------------------------------------------- materials

def principled(name, color="#ffffff", rough=0.6, metal=0.0, spec=0.3, emission=None, strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = srgb(color) if isinstance(color, (str, tuple)) and len(color) != 4 else color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = spec
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = srgb(emission)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


def textured(name, tex_dir, prefix, tint="#ffffff", rough=0.7, scale=1.0, normal_strength=0.6, rotate=0.0):
    """Principled material from an ambientCG texture set (Color / NormalGL / Roughness)."""
    mat = principled(name, tint, rough)
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    mapping.inputs["Rotation"].default_value = (0, 0, rotate)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    def img(kind, non_color=False):
        for f in os.listdir(tex_dir):
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
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(col.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = srgb(tint)
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


def emissive(name, color, strength=1.0, image=None):
    """Pure emission material (exported as glTF emissive; the client draws it unlit, HDR)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    bsdf.inputs["Emission Color"].default_value = srgb(color)
    bsdf.inputs["Emission Strength"].default_value = strength
    bsdf.inputs["Roughness"].default_value = 1.0
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    mat["descall_emissive"] = float(strength)
    return mat


def set_mat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------- geometry

def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_from_bmesh(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    return link(obj)


def rbox(name, size, loc, mat=None, bevel=0.03, segments=4, rot=(0, 0, 0), subsurf=0):
    """Rounded box: size (x,y,z) metres centred at loc."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    obj = mesh_from_bmesh(name, bm)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    if bevel > 0:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = min(bevel, min(size) * 0.49)
        m.segments = segments
        m.limit_method = "NONE"
        m.harden_normals = False
    if subsurf:
        s = obj.modifiers.new("subsurf", "SUBSURF")
        s.levels = subsurf
        s.render_levels = subsurf
    if mat:
        set_mat(obj, mat)
    shade_smooth(obj)
    return obj


def cylinder(name, radius, depth, loc, mat=None, verts=32, rot=(0, 0, 0), radius_top=None, bevel=0.0, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=cap,
        cap_tris=False,
        segments=verts,
        radius1=radius,
        radius2=radius if radius_top is None else radius_top,
        depth=depth,
    )
    obj = mesh_from_bmesh(name, bm)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    if bevel > 0:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 3
        m.limit_method = "ANGLE"
    if mat:
        set_mat(obj, mat)
    shade_smooth(obj)
    return obj


def sphere(name, radius, loc, mat=None, scale=(1, 1, 1), segments=32, rings=16, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    obj = mesh_from_bmesh(name, bm)
    obj.location = loc
    obj.scale = scale
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    if mat:
        set_mat(obj, mat)
    shade_smooth(obj)
    return obj


def plane(name, w, h, loc, rot=(0, 0, 0), mat=None):
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * h, 0))
    obj = mesh_from_bmesh(name, bm)
    obj.location = loc
    obj.rotation_euler = Euler([math.radians(a) for a in rot])
    if mat:
        set_mat(obj, mat)
    return obj


def shade_smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    try:
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(50)
    except AttributeError:
        pass


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:
            obj.modifiers.remove(m)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def empty(name, loc, extras=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.location = loc
    for k, v in (extras or {}).items():
        e[k] = v
    return link(e)


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


# ---------------------------------------------------------------- images

def image_from_array(name, arr, srgb_space=True, alpha=True):
    """arr: float32 HxWx4 (0..1, top row first)."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=alpha)
    flipped = np.ascontiguousarray(arr[::-1]).astype(np.float32)
    img.pixels.foreach_set(flipped.ravel())
    if not srgb_space:
        img.colorspace_settings.name = "Non-Color"
    img.pack()
    return img


def save_png(img, path):
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
