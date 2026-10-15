"""
Builds the player kart in Blender and exports public/gltf/kart/kart.glb.

    blender --background --factory-startup --python art/blender/build_kart.py -- [--render]

All coordinates below are authored in three.js space (Y up, forward -Z, origin on
the ground under the seat) and converted to Blender space by `v()`. The node names
are a runtime contract: KartFeelSystem shakes `Body`, yaws `WheelSteer-F*`, rolls
`WheelSpin-*` using the `radius` extra; CameraModeSystem hides `Driver`. The
cockpit anchors (steering hub at 0, 0.62, -0.28; dash binnacle; seat) must stay
put because the steering-wheel/dashboard entities and the XR head pose use them.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GLB_PATH = os.path.join(ROOT, "public", "gltf", "kart", "kart.glb")
BLEND_PATH = os.path.join(ROOT, "art", "blender", "kart.blend")
RENDER = "--render" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)


def v(x, y, z):
    return Vector((x, -z, y))


# ---------------------------------------------------------------- materials

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_color, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    rgb = [srgb_to_linear(((hex_color >> s) & 0xFF) / 255) for s in (16, 8, 0)]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


ORANGE = material("Orange", 0xF07A1A, 0.45, 0.05)
CREAM = material("Cream", 0xF4F1EA, 0.5)
DARK = material("Carbon", 0x23262B, 0.7)
TIRE = material("Tire", 0x1B1B1D, 0.9)
STEEL = material("Steel", 0xB8BCC2, 0.35, 0.6)
SEAT = material("Seat", 0x2B3440, 0.85)
SUIT = material("Suit", 0x2F6FD6, 0.7)
VISOR = material("Visor", 0x14181F, 0.15, 0.4)


# ---------------------------------------------------------------- hierarchy

def empty(name, parent=None, pos=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = v(*pos)
    return obj


def finish(obj, mat, parent, bevel=0.0):
    obj.data.materials.append(mat)
    obj.parent = parent
    if bevel > 0:
        mod = obj.modifiers.new("Chamfer", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(30)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def mesh_from(name, verts, faces):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bverts = [bm.verts.new(p) for p in verts]
    for f in faces:
        bm.faces.new([bverts[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


HEX_FACES = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]


def hexa(name, corners, mat, parent, bevel=0.012):
    """Eight three.js-space corners: bottom (-x-z, +x-z, +x+z, -x+z) then top in the same order."""
    return finish(mesh_from(name, [v(*c) for c in corners], HEX_FACES), mat, parent, bevel)


def loft(name, back, front, mat, parent, bevel=0.012):
    """Box lofted along Z between two cross-sections (half_x, y_bottom, y_top, z)."""
    bx, by0, by1, bz = back
    fx, fy0, fy1, fz = front
    corners = [
        (-fx, fy0, fz), (fx, fy0, fz), (bx, by0, bz), (-bx, by0, bz),
        (-fx, fy1, fz), (fx, fy1, fz), (bx, by1, bz), (-bx, by1, bz),
    ]
    return hexa(name, corners, mat, parent, bevel)


def box(name, center, size, mat, parent, bevel=0.012):
    cx, cy, cz = center
    hx, hy, hz = (s / 2 for s in size)
    obj = loft(name, (hx, cy - hy, cy + hy, hz), (hx, cy - hy, cy + hy, -hz), mat, parent, bevel)
    obj.location.x += cx
    obj.location.y += -cz
    return obj


def shift_x(obj, dx):
    obj.location.x += dx
    return obj


def cyl_between(name, a, b, radius, mat, parent, verts=8):
    pa, pb = v(*a), v(*b)
    axis = pb - pa
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=axis.length)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis.normalized())
    obj.location = (pa + pb) / 2
    return finish(obj, mat, parent)


def axle_cyl(name, x_center, radius, depth, mat, parent, verts=16, bevel=0.0):
    """Cylinder whose axis runs along three.js X, centered at (x_center, 0, 0) of parent."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth)
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (0, math.radians(90), 0)
    obj.location = (x_center, 0, 0)
    return finish(obj, mat, parent, bevel)


# ---------------------------------------------------------------- build

kart = empty("Kart")
body = empty("Body", kart)

# Floor pan and cockpit tub (open: low side walls with the bucket seat between them).
box("FloorPan", (0, 0.1, -0.2), (0.86, 0.05, 2.0), DARK, body)
loft("TubFront", (0.34, 0.12, 0.42, -0.15), (0.28, 0.12, 0.40, -0.78), ORANGE, body)
for side in (-1, 1):
    shift_x(box(f"CockpitWall{side}", (0, 0.27, 0.2), (0.09, 0.3, 0.7), ORANGE, body), side * 0.3)
    shift_x(box(f"CockpitRim{side}", (0, 0.43, 0.2), (0.11, 0.03, 0.72), CREAM, body), side * 0.3)
box("CockpitRimFront", (0, 0.43, -0.16), (0.7, 0.03, 0.08), CREAM, body)

# Wedge nose dropping onto the front wing, with a cream racing stripe on top.
loft("Nose", (0.28, 0.12, 0.40, -0.78), (0.11, 0.12, 0.22, -1.56), ORANGE, body)
loft("NoseStripe", (0.08, 0.395, 0.415, -0.8), (0.04, 0.215, 0.232, -1.52), CREAM, body, 0)

# Front wing: carbon main plane, orange flap, cream endplates.
box("FrontWing", (0, 0.11, -1.58), (1.56, 0.035, 0.3), DARK, body)
hexa(
    "FrontFlap",
    [(-0.78, 0.13, -1.62), (0.78, 0.13, -1.62), (0.78, 0.18, -1.46), (-0.78, 0.18, -1.46),
     (-0.78, 0.155, -1.62), (0.78, 0.155, -1.62), (0.78, 0.215, -1.46), (-0.78, 0.215, -1.46)],
    ORANGE, body,
)
for side in (-1, 1):
    shift_x(box(f"FrontEndplate{side}", (0, 0.16, -1.57), (0.03, 0.17, 0.38), CREAM, body), side * 0.79)

# Sidepods with dark intakes; go-kart nerf bars outboard of them.
for side in (-1, 1):
    pod = loft(f"Sidepod{side}", (0.12, 0.12, 0.38, -0.06), (0.12, 0.12, 0.3, -0.7), ORANGE, body)
    shift_x(pod, side * 0.48)
    shift_x(box(f"Intake{side}", (0, 0.22, -0.71), (0.18, 0.14, 0.03), DARK, body, 0), side * 0.48)
    shift_x(loft(f"PodStripe{side}", (0.125, 0.38, 0.4, -0.08), (0.125, 0.3, 0.32, -0.68), CREAM, body, 0), side * 0.48)
    x = side * 0.7
    cyl_between(f"NerfBar{side}", (x, 0.2, -0.72), (x, 0.2, -0.02), 0.028, STEEL, body)
    cyl_between(f"NerfStrutF{side}", (x, 0.2, -0.66), (side * 0.6, 0.16, -0.66), 0.022, STEEL, body)
    cyl_between(f"NerfStrutR{side}", (x, 0.2, -0.08), (side * 0.6, 0.16, -0.08), 0.022, STEEL, body)

# Front bumper hoop ahead of the wing.
cyl_between("FrontBumper", (-0.55, 0.15, -1.82), (0.55, 0.15, -1.82), 0.03, STEEL, body)
for side in (-1, 1):
    cyl_between(f"FrontBumperStrut{side}", (side * 0.55, 0.15, -1.82), (side * 0.3, 0.13, -1.6), 0.025, STEEL, body)

# Suspension wishbones (sprung side ends at the hub; the wheels ride on Kart).
for side in (-1, 1):
    for y0, y1 in ((0.2, 0.22), (0.32, 0.34)):
        cyl_between(f"FrontArm{side}{y0}", (side * 0.22, y1, -0.98), (side * 0.62, y0 + 0.06, -1.05), 0.016, DARK, body, 6)
        cyl_between(f"RearArm{side}{y0}", (side * 0.26, y1 + 0.02, 0.36), (side * 0.64, y0 + 0.16, 0.42), 0.016, DARK, body, 6)

# Dash cowl, steering column and data-display binnacle (positions are runtime anchors).
loft("DashCowl", (0.24, 0.4, 0.5, -0.5), (0.2, 0.4, 0.46, -0.98), ORANGE, body)
cyl_between("SteeringColumn", (0, 0.341, -0.9), (0, 0.619, -0.28), 0.035, DARK, body)
cyl_between("SteeringHub", (0, 0.583, -0.346), (0, 0.617, -0.274), 0.06, DARK, body, 10)
tilt = math.radians(-15)
binnacle = box("Binnacle", (0, 0, 0), (0.31, 0.15, 0.03), DARK, body, 0.006)
binnacle.location = v(0, 0.753, -0.746)
binnacle.rotation_euler = (tilt, 0, 0)
hood = box("BinnacleHood", (0, 0, 0), (0.31, 0.012, 0.07), DARK, body, 0)
hood.location = v(0, 0.838, -0.73)
hood.rotation_euler = (tilt, 0, 0)
cyl_between("BinnacleStalk", (0, 0.4, -0.765), (0, 0.7, -0.765), 0.02, DARK, body)

# Bucket seat with bolsters and headrest.
box("SeatBase", (0, 0.31, 0.2), (0.5, 0.1, 0.45), SEAT, body)
seat_back = box("SeatBack", (0, 0, 0), (0.5, 0.55, 0.08), SEAT, body)
seat_back.location = v(0, 0.58, 0.45)
seat_back.rotation_euler = (-0.22, 0, 0)
headrest = box("Headrest", (0, 0, 0), (0.3, 0.16, 0.08), SEAT, body)
headrest.location = v(0, 0.92, 0.52)
headrest.rotation_euler = (-0.22, 0, 0)
for side in (-1, 1):
    bolster = box(f"Bolster{side}", (0, 0, 0), (0.07, 0.3, 0.42), SEAT, body)
    bolster.location = v(side * 0.27, 0.45, 0.25)
    bolster.rotation_euler = (0, 0, side * 0.12)

# F1 engine cover and airbox behind the seat, exposed go-kart engine block under it.
loft("EngineCover", (0.13, 0.28, 0.5, 1.02), (0.22, 0.28, 0.82, 0.52), ORANGE, body)
loft("CoverStripe", (0.045, 0.5, 0.515, 1.0), (0.06, 0.82, 0.835, 0.56), CREAM, body, 0)
box("Airbox", (0, 0.77, 0.535), (0.16, 0.1, 0.04), DARK, body, 0.006)
box("EngineBlock", (0, 0.22, 0.76), (0.52, 0.2, 0.42), STEEL, body)
for side in (-1, 1):
    cyl_between(f"Exhaust{side}", (side * 0.07, 0.4, 0.9), (side * 0.07, 0.42, 1.12), 0.04, STEEL, body)

# Rear wing on a single pylon.
cyl_between("WingPylon", (0, 0.45, 0.96), (0, 0.94, 1.0), 0.03, DARK, body)
box("RearWing", (0, 0.95, 1.02), (1.12, 0.04, 0.28), ORANGE, body)
hexa(
    "RearFlap",
    [(-0.56, 1.0, 0.92), (0.56, 1.0, 0.92), (0.56, 1.04, 1.04), (-0.56, 1.04, 1.04),
     (-0.56, 1.03, 0.92), (0.56, 1.03, 0.92), (0.56, 1.075, 1.04), (-0.56, 1.075, 1.04)],
    DARK, body,
)
for side in (-1, 1):
    shift_x(box(f"RearEndplate{side}", (0, 0.92, 1.0), (0.03, 0.36, 0.42), CREAM, body), side * 0.575)

# Rear bumper behind the tyres.
cyl_between("RearBumper", (-0.8, 0.24, 1.14), (0.8, 0.24, 1.14), 0.035, STEEL, body)
for side in (-1, 1):
    cyl_between(f"RearBumperStrut{side}", (side * 0.8, 0.24, 1.14), (side * 0.3, 0.2, 0.9), 0.028, STEEL, body)

# Driver figure (hidden in cockpit / XR by CameraModeSystem).
driver = empty("Driver", body)
torso = box("Torso", (0, 0, 0), (0.4, 0.42, 0.26), SUIT, driver)
torso.location = v(0, 0.6, 0.3)
torso.rotation_euler = (-0.2, 0, 0)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.17, location=v(0, 0.98, 0.26))
helmet = finish(bpy.context.active_object, CREAM, driver)
helmet.name = "Helmet"
box("Visor", (0, 0.99, 0.12), (0.24, 0.08, 0.05), VISOR, driver, 0)
box("HelmetStripe", (0, 1.11, 0.26), (0.08, 0.04, 0.3), ORANGE, driver, 0)
for side in (-1, 1):
    arm = box(f"Arm{side}", (0, 0, 0), (0.09, 0.09, 0.5), SUIT, driver)
    arm.location = v(side * 0.17, 0.66, 0.02)
    arm.rotation_euler = (-0.45, 0, side * 0.18)
    leg = box(f"Leg{side}", (0, 0, 0), (0.12, 0.12, 0.55), SUIT, driver)
    leg.location = v(side * 0.12, 0.38, -0.25)
    leg.rotation_euler = (-0.1, 0, 0)

# Comically big slick wheels; rears bigger and fatter. Orange compound stripe on the
# sidewall and orange spokes over cream rims so rotation reads at speed.
WHEELS = [
    ("FL", -0.76, -1.05, 0.28, 0.26),
    ("FR", 0.76, -1.05, 0.28, 0.26),
    ("RL", -0.84, 0.42, 0.38, 0.38),
    ("RR", 0.84, 0.42, 0.38, 0.38),
]
for wid, x, z, r, w in WHEELS:
    side = 1 if x > 0 else -1
    steer = empty(f"WheelSteer-{wid}", kart, (x, r, z))
    spin = empty(f"WheelSpin-{wid}", steer)
    spin["radius"] = r
    axle_cyl(f"Tire-{wid}", 0, r, w, TIRE, spin, 18, bevel=r * 0.16)
    axle_cyl(f"Stripe-{wid}", 0, r * 0.8, w + 0.004, ORANGE, spin, 18)
    axle_cyl(f"Sidewall-{wid}", 0, r * 0.73, w + 0.008, TIRE, spin, 18)
    axle_cyl(f"Rim-{wid}", 0, r * 0.58, w + 0.012, CREAM, spin, 12)
    face = side * (w / 2 + 0.01)
    axle_cyl(f"Hub-{wid}", face, 0.075, 0.03, ORANGE, spin, 8)
    for i in range(3):
        spoke = box(f"Spoke-{wid}{i}", (0, 0, 0), (0.014, r * 1.1, 0.04), ORANGE, spin, 0)
        spoke.location = (face, 0, 0)
        spoke.rotation_euler = (math.radians(60 * i), 0, 0)


# ---------------------------------------------------------------- bake + merge

def apply_modifiers_and_merge():
    groups = {}
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        groups.setdefault((obj.parent.name, obj.data.materials[0].name), []).append(obj)
    for (parent_name, mat_name), objs in groups.items():
        target = objs[0]
        if len(objs) > 1:
            with bpy.context.temp_override(
                active_object=target,
                selected_editable_objects=objs,
                selected_objects=objs,
            ):
                bpy.ops.object.join()
        target.name = f"{parent_name}-{mat_name}"
        target.data.name = target.name


apply_modifiers_and_merge()

os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    export_extras=True,
    export_yup=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
)
print(f"[kart] exported {GLB_PATH} ({os.path.getsize(GLB_PATH)} bytes)")


# ---------------------------------------------------------------- previews + .blend

scene = bpy.context.scene
world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.7, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = world

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
scene.collection.objects.link(sun)

bpy.ops.mesh.primitive_plane_add(size=30)
ground = bpy.context.active_object
ground.name = "PreviewGround"
ground.data.materials.append(material("Ground", 0x8A9099, 0.9))

cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
cam.data.lens = 50
scene.collection.objects.link(cam)
scene.camera = cam


def look_at(eye, target):
    cam.location = v(*eye)
    cam.rotation_euler = (v(*target) - v(*eye)).to_track_quat("-Z", "Y").to_euler()


bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print(f"[kart] saved {BLEND_PATH}")

if RENDER:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 640
    out = "/tmp/agent-browser"
    os.makedirs(out, exist_ok=True)
    for name, eye, target in (
        ("hero", (-3.2, 1.6, -3.4), (0, 0.4, -0.2)),
        ("side", (-4.6, 0.9, -0.3), (0, 0.45, -0.3)),
        ("rear", (2.6, 1.8, 3.4), (0, 0.45, 0)),
        ("cockpit", (0, 1.45, 1.1), (0, 0.5, -1.2)),
    ):
        look_at(eye, target)
        scene.render.filepath = f"{out}/kart-blender-{name}.png"
        bpy.ops.render.render(write_still=True)
        print(f"[kart] rendered {scene.render.filepath}")
