#!/usr/bin/env python3
"""Procedural textures for the living room (Descall, own work, no external art).

  skyline_far.png   night sky + distant lit skyline (opaque)
  skyline_near.png  closer towers with lit windows (alpha cut-out)
  art.png           abstract wall print
  lava.png          lava lamp wax gradient
Run: python3 tools/world3d/gen_textures.py  (writes tools/world3d/.cache/gen/)
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, ".cache", "gen")


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def sky(w, h):
    top, mid, low = hexc("#070a24"), hexc("#141a52"), hexc("#3a3a8a")
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = lerp(top, mid, t / 0.6) if t < 0.6 else lerp(mid, low, (t - 0.6) / 0.4)
        for x in range(w):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)
    for _ in range(140):
        x, y = rnd.randrange(w), rnd.randrange(int(h * 0.45))
        b = rnd.randrange(120, 230)
        d.point((x, y), fill=(b, b, min(255, b + 20)))
    return img


def tower(d, rnd, x0, y0, x1, y1, body, lit_ratio, warm=True, win=(7, 9), gap=(5, 7)):
    d.rectangle([x0, y0, x1, y1], fill=body)
    ww, wh = win
    gx, gy = gap
    yy = y0 + 10
    while yy + wh < y1 - 4:
        xx = x0 + 6
        row_on = rnd.random() < 0.85
        while xx + ww < x1 - 4:
            if row_on and rnd.random() < lit_ratio:
                if warm:
                    c = rnd.choice([hexc("#ffd890"), hexc("#ffe2a8"), hexc("#ffc977"), hexc("#fff0c8")])
                else:
                    c = rnd.choice([hexc("#bcd2ff"), hexc("#9fb6ff"), hexc("#e6ecff")])
                d.rectangle([xx, yy, xx + ww, yy + wh], fill=c)
            else:
                d.rectangle([xx, yy, xx + ww, yy + wh], fill=lerp(body, (0, 0, 0), 0.25))
            xx += ww + gx
        yy += wh + gy


def skyline_far(w=2048, h=1024):
    rnd = random.Random(42)
    img = sky(w, h)
    d = ImageDraw.Draw(img)
    # distant haze band
    for i in range(80):
        y = int(h * 0.7) + i
        a = 1 - i / 80
        c = lerp(hexc("#3a3a8a"), hexc("#5b4aa8"), a * 0.5)
        d.line([(0, y), (w, y)], fill=c)
    # far skyline, small windows
    x = 0
    while x < w:
        bw = rnd.randrange(50, 140)
        top = int(h * rnd.uniform(0.38, 0.66))
        body = lerp(hexc("#161c48"), hexc("#222a62"), rnd.random())
        tower(d, rnd, x, top, x + bw, h, body, 0.42, warm=rnd.random() < 0.8, win=(4, 6), gap=(4, 5))
        x += bw + rnd.randrange(2, 14)
    # central tall tower with a blue beacon (like the draft)
    cx = int(w * 0.52)
    tower(d, rnd, cx - 58, int(h * 0.18), cx + 58, h, hexc("#1a2158"), 0.5, warm=True, win=(6, 8), gap=(5, 6))
    d.polygon([(cx - 58, int(h * 0.18)), (cx, int(h * 0.10)), (cx + 58, int(h * 0.18))], fill=hexc("#1a2158"))
    d.line([(cx, int(h * 0.10)), (cx, int(h * 0.04))], fill=hexc("#28307a"), width=4)
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - 26, int(h * 0.04) - 26, cx + 26, int(h * 0.04) + 26], fill=hexc("#3f7dff"))
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    arr = np.asarray(img).astype(np.float32) + np.asarray(glow).astype(np.float32) * 0.9
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - 6, int(h * 0.04) - 6, cx + 6, int(h * 0.04) + 6], fill=hexc("#cfe0ff"))
    # a few street lights glow near the bottom
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for _ in range(18):
        gx = rnd.randrange(w)
        gy = int(h * rnd.uniform(0.86, 0.97))
        gd.ellipse([gx - 10, gy - 10, gx + 10, gy + 10], fill=hexc("#ffcc80"))
    glow = glow.filter(ImageFilter.GaussianBlur(9))
    arr = np.asarray(img).astype(np.float32) + np.asarray(glow).astype(np.float32) * 0.7
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def skyline_near(w=2048, h=1024):
    rnd = random.Random(1234)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    spots = [(0.02, 0.10, 0.30), (0.12, 0.09, 0.44), (0.26, 0.11, 0.36), (0.66, 0.10, 0.40), (0.78, 0.12, 0.30), (0.90, 0.10, 0.46)]
    for (fx, fw, ftop) in spots:
        x0 = int(w * fx)
        x1 = int(w * (fx + fw))
        top = int(h * ftop)
        body = lerp(hexc("#0f1438"), hexc("#191f4c"), rnd.random())
        tmp = Image.new("RGB", (x1 - x0 + 1, h - top + 1), body)
        td = ImageDraw.Draw(tmp)
        tower(td, rnd, 0, 0, x1 - x0, h - top, body, 0.55, warm=True, win=(9, 12), gap=(7, 9))
        img.paste(tmp, (x0, top))
        if rnd.random() < 0.5:
            d.rectangle([x0 + (x1 - x0) // 2 - 3, top - 40, x0 + (x1 - x0) // 2 + 3, top], fill=body + (255,))
            d.ellipse([x0 + (x1 - x0) // 2 - 5, top - 46, x0 + (x1 - x0) // 2 + 5, top - 36], fill=(255, 80, 90, 255))
    return img


def art(w=512, h=640):
    img = Image.new("RGB", (w, h), hexc("#f1e3dc"))
    d = ImageDraw.Draw(img)
    d.ellipse([60, 260, 300, 500], fill=hexc("#e58b7b"))
    d.ellipse([220, 180, 440, 400], fill=hexc("#c75b6a"))
    d.rectangle([0, 520, w, h], fill=hexc("#e9cfc4"))
    d.ellipse([300, 380, 420, 500], fill=hexc("#f2b49a"))
    return img.filter(ImageFilter.GaussianBlur(1.2))


def lava(w=128, h=512):
    arr = np.zeros((h, w, 3), np.float32)
    top, bot = np.array(hexc("#ffb6f2"), np.float32), np.array(hexc("#b02ed8"), np.float32)
    for y in range(h):
        t = y / (h - 1)
        arr[y, :, :] = top * (1 - t) + bot * t
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    rnd = random.Random(3)
    for _ in range(7):
        cy = rnd.randrange(40, h - 40)
        r = rnd.randrange(14, 30)
        cx = rnd.randrange(30, w - 30)
        d.ellipse([cx - r, cy - r * 1.3, cx + r, cy + r * 1.3], fill=hexc("#ff7ad9"))
    return img.filter(ImageFilter.GaussianBlur(6))


def main():
    os.makedirs(OUT, exist_ok=True)
    skyline_far().save(os.path.join(OUT, "skyline_far.png"))
    skyline_near().save(os.path.join(OUT, "skyline_near.png"))
    art().save(os.path.join(OUT, "art.png"))
    lava().save(os.path.join(OUT, "lava.png"))
    print("textures ->", OUT)


if __name__ == "__main__":
    main()
