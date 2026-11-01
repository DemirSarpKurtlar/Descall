#!/usr/bin/env python3
"""Builds the comparison images for the 3D world evidence (Pillow).
  python3 e2e/world3d/compose_evidence.py <shotsDir> <outDir>
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

shots, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
design = os.path.normpath(os.path.join(here, "..", "..", "..", "docs", "design", "3d-world"))
os.makedirs(out, exist_ok=True)


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def label(im, text):
    d = ImageDraw.Draw(im)
    f = font(28)
    d.rectangle([0, 0, d.textlength(text, font=f) + 28, 46], fill=(10, 8, 24))
    d.text((14, 8), text, fill=(240, 240, 255), font=f)
    return im


def side_by_side(a, b, la, lb, name, w=1600, h=900):
    A = label(Image.open(a).convert("RGB").resize((w, h)), la)
    B = label(Image.open(b).convert("RGB").resize((w, h)), lb)
    im = Image.new("RGB", (w * 2 + 12, h), (0, 0, 0))
    im.paste(A, (0, 0))
    im.paste(B, (w + 12, 0))
    im.save(os.path.join(out, name), quality=90)
    print("saved", os.path.join(out, name))


def copy(src, name):
    if os.path.exists(src):
        Image.open(src).convert("RGB").save(os.path.join(out, name))
        print("saved", os.path.join(out, name))


copy(os.path.join(shots, "hero-1600x900.png"), "world-hero-1600x900.png")
copy(os.path.join(shots, "overlay-1600x900.png"), "world-overlay-ui-1600x900.png")
if os.path.exists(os.path.join(shots, "hero-1600x900.png")):
    side_by_side(os.path.join(design, "scene-3.jpg"), os.path.join(shots, "hero-1600x900.png"), "Draft: scene-3.jpg", "Descall real-time (Babylon.js)", "compare-scene-3.jpg")
if os.path.exists(os.path.join(shots, "overlay-1600x900.png")):
    side_by_side(os.path.join(design, "approved-ui-3.png"), os.path.join(shots, "overlay-1600x900.png"), "Draft: approved-ui-3.png", "Descall real-time + overlay", "compare-approved-ui-3.jpg")
if os.path.exists(os.path.join(shots, "lineup.png")):
    side_by_side(os.path.join(design, "scene-5.jpg"), os.path.join(shots, "lineup.png"), "Draft: scene-5.jpg", "Descall avatars (real-time)", "compare-scene-5-characters.jpg")
if os.path.exists(os.path.join(shots, "closeup.png")):
    a = Image.open(os.path.join(design, "scene-5.jpg")).convert("RGB")
    a = a.crop((0, 60, 800, 510)).resize((1600, 900))
    side_by_side_tmp = os.path.join(out, "_tmp_crop.png")
    a.save(side_by_side_tmp)
    side_by_side(side_by_side_tmp, os.path.join(shots, "closeup.png"), "Draft: scene-5.jpg (crop)", "Descall avatar close-up", "compare-character-closeup.jpg")
    os.remove(side_by_side_tmp)

frames = sorted(glob.glob(os.path.join(shots, "walk-*.png")))
if frames:
    fr = [Image.open(f).convert("RGB").resize((800, 450)) for f in frames]
    fr[0].save(os.path.join(out, "walk-and-sit.webp"), save_all=True, append_images=fr[1:], duration=66, loop=0, quality=80)
    print("saved", os.path.join(out, "walk-and-sit.webp"))
    fdir = os.path.join(out, "walk-frames")
    os.makedirs(fdir, exist_ok=True)
    for f, im in zip(frames, fr):
        im.save(os.path.join(fdir, os.path.basename(f).replace(".png", ".jpg")), quality=85)
    pick = fr[:: max(1, len(fr) // 12)][:12]
    sheet = Image.new("RGB", (4 * 400, 3 * 225))
    for i, im in enumerate(pick):
        sheet.paste(im.resize((400, 225)), ((i % 4) * 400, (i // 4) * 225))
    sheet.save(os.path.join(out, "walk-and-sit-contact-sheet.jpg"), quality=88)
    print("saved", os.path.join(out, "walk-and-sit-contact-sheet.jpg"))

# rooms (capture.cjs room mode): the draft next to the real-time render from its hero angle
for draft, shot, name, label in (
    ("scene-1.jpg", "room-cinema.png", "compare-scene-1.jpg", "Descall real-time: Sinema (screen share demo)"),
    ("scene-1.jpg", "room-cinema-dark.png", "compare-scene-1-screen-off.jpg", "Descall real-time: Sinema, screen idle"),
    ("scene-2.jpg", "room-game-room.png", "compare-scene-2.jpg", "Descall real-time: Oyun odasi"),
    ("scene-4.jpg", "room-camp.png", "compare-scene-4.jpg", "Descall real-time: Kamp"),
):
    if os.path.exists(os.path.join(shots, shot)):
        side_by_side(os.path.join(design, draft), os.path.join(shots, shot), f"Draft: {draft}", label, name)
