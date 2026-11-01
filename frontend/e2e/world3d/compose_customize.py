#!/usr/bin/env python3
"""Phase 5 evidence images (Pillow): draft vs real-time side by side, and the tab sheet.
  python3 e2e/world3d/compose_customize.py <shotsDir> <outDir>
"""
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


def label(im, text, size=28):
    d = ImageDraw.Draw(im)
    f = font(size)
    d.rectangle([0, 0, d.textlength(text, font=f) + 28, size + 18], fill=(10, 8, 24))
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


def sheet(items, name, cols=2, w=800, h=450):
    rows = (len(items) + cols - 1) // cols
    im = Image.new("RGB", (cols * w + (cols - 1) * 8, rows * h + (rows - 1) * 8), (0, 0, 0))
    for i, (path, text) in enumerate(items):
        tile = label(Image.open(path).convert("RGB").resize((w, h)), text, 20)
        im.paste(tile, ((i % cols) * (w + 8), (i // cols) * (h + 8)))
    im.save(os.path.join(out, name), quality=90)
    print("saved", os.path.join(out, name))


S = lambda n: os.path.join(shots, n)
side_by_side(os.path.join(design, "approved-ui-5.png"), S("panel-kiyafet.png"), "Draft: approved-ui-5.png", "Descall (real-time, Kıyafet tab)", "compare-approved-ui-5.jpg")
side_by_side(os.path.join(design, "scene-5.jpg"), S("lineup-6-outfits.png"), "Draft: scene-5.jpg", "Descall: the six Kıyafet items", "compare-scene-5.jpg")
sheet([(S("panel-sac.png"), "Saç"), (S("panel-kiyafet.png"), "Kıyafet"), (S("panel-aksesuar.png"), "Aksesuar"), (S("panel-yuz.png"), "Yüz")], "tabs.jpg")
sheet([(S("purchase-confirm.png"), "Kaydet -> purchase confirmation"), (S("purchase-saved.png"), "Satın al ve kaydet -> saved"), (S("panel-rastgele.png"), "Rastgele (free + owned only)")], "purchase-flow.jpg", cols=3, w=640, h=360)
for n in ("panel-kiyafet.png", "panel-sac.png", "panel-aksesuar.png", "panel-yuz.png", "purchase-confirm.png", "purchase-saved.png", "panel-rastgele.png", "lineup-6-outfits.png"):
    Image.open(S(n)).convert("RGB").save(os.path.join(out, n.replace(".png", ".jpg")), quality=90)
