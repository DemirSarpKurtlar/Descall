#!/usr/bin/env python3
"""Procedural textures for the cinema, game room and camp (Descall, own work).

Everything is drawn here with Pillow + numpy (fixed seeds), plus the Descall mark
cut out of frontend/public/brand/descall-logo.png and the Inter font (OFL) from
frontend/node_modules/@fontsource/inter.
Run: python3 tools/world3d/gen_room_textures.py   (writes tools/world3d/.cache/gen/rooms/)
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, ".cache", "gen", "rooms")
FONT_DIR = os.path.join(REPO, "frontend", "node_modules", "@fontsource", "inter", "files")
DEV_OUT = os.path.join(REPO, "frontend", "src", "world3d", "dev")


def inter(size, weight=700):
    for w in (weight, 700, 600, 800):
        p = os.path.join(FONT_DIR, f"inter-latin-{w}-normal.woff")
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    raise SystemExit("Inter not found: run npm ci in frontend/ (needs @fontsource/inter)")


def hexc(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + ((a,) if a is not None else ())


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def vgrad(w, h, stops):
    """stops: [(t, '#hex'), ...] top to bottom."""
    arr = np.zeros((h, w, 3), np.float32)
    ts = [s[0] for s in stops]
    cs = [np.array(hexc(s[1], None), np.float32) for s in stops]
    for y in range(h):
        t = y / max(1, h - 1)
        k = 0
        while k < len(ts) - 2 and t > ts[k + 1]:
            k += 1
        u = 0 if ts[k + 1] == ts[k] else min(1, max(0, (t - ts[k]) / (ts[k + 1] - ts[k])))
        arr[y, :, :] = cs[k] * (1 - u) + cs[k + 1] * u
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGB")


def descall_mark(size):
    """The Descall mark (blue part of the app logo) as an L mask."""
    src = Image.open(os.path.join(REPO, "frontend", "public", "brand", "descall-logo.png")).convert("RGBA")
    a = np.asarray(src).astype(np.float32)
    blue = (a[..., 2] - a[..., 0] - 45.0) / 105.0
    mask = np.clip(blue, 0, 1) * (a[..., 3] / 255.0)
    m = Image.fromarray((mask * 255).astype(np.uint8), "L")
    bbox = m.getbbox()
    m = m.crop(bbox)
    s = size / max(m.size)
    return m.resize((max(1, int(m.size[0] * s)), max(1, int(m.size[1] * s))), Image.LANCZOS)


def rrect(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


# ------------------------------------------------------------------ cinema

def cinema_ceiling():
    """Acoustic ceiling tiles, 4 x 4 per texture (0.6 m tiles at 2.4 m repeat)."""
    w = 1024
    rnd = np.random.default_rng(11)
    base = np.full((w, w, 3), hexc("#8e8e8e", None), np.float32)
    base += rnd.normal(0, 6, (w, w, 1))
    img = Image.fromarray(base.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    step = w // 4
    for i in range(5):
        d.line([(i * step, 0), (i * step, w)], fill=hexc("#c6c6c6", None), width=5)
        d.line([(0, i * step), (w, i * step)], fill=hexc("#c6c6c6", None), width=5)
    # pinhole perforation
    for ty in range(4):
        for tx in range(4):
            r = random.Random(ty * 7 + tx)
            for _ in range(160):
                x = tx * step + r.randrange(12, step - 12)
                y = ty * step + r.randrange(12, step - 12)
                d.point((x, y), fill=hexc("#747474", None))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(os.path.join(OUT, "cinema_ceiling.png"))


def cinema_wall():
    """Wall panels: vertical acoustic panels with soft seams (1.2 m panels, 2.4 m repeat)."""
    w, h = 1024, 512
    rnd = np.random.default_rng(5)
    base = np.full((h, w, 3), hexc("#a4a4a4", None), np.float32)
    base += rnd.normal(0, 5, (h, w, 1))
    for x in range(w):
        u = (x % (w // 2)) / (w // 2)
        shade = 1 - 0.06 * (math.exp(-((u - 0.0) / 0.012) ** 2) + math.exp(-((u - 1.0) / 0.012) ** 2))
        base[:, x, :] *= shade
    Image.fromarray(base.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, "cinema_wall.png"))


def cinema_standby():
    """Screen when nobody shares: deep indigo, the Descall mark, very dim."""
    w, h = 1280, 720
    img = vgrad(w, h, [(0, "#0b0d2a"), (1, "#14123a")])
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * 0.3, h * 0.15, w * 0.7, h * 0.85], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.composite(Image.new("RGB", (w, h), hexc("#2a2f7a", None)), img, glow)
    m = descall_mark(220)
    img.paste(Image.new("RGB", m.size, hexc("#587AF6", None)), ((w - m.size[0]) // 2, int(h * 0.30)), m)
    d = ImageDraw.Draw(img)
    f = inter(46, 700)
    t = "Descall"
    d.text(((w - d.textlength(t, font=f)) / 2, int(h * 0.66)), t, font=f, fill=hexc("#c8d2ff", None))
    img.save(os.path.join(OUT, "cinema_standby.png"))


def cinema_demo(path):
    """Dev-only stand-in for a shared screen: a bright cartoon playground game (own drawing)."""
    S = 2
    w, h = 1280 * S, 720 * S
    img = vgrad(w, h, [(0, "#7fd7f7"), (0.45, "#c8f0ff"), (1, "#c8f0ff")])
    d = ImageDraw.Draw(img)
    rnd = random.Random(3)
    # clouds
    for cx, cy, s in ((0.78, 0.2, 1.0), (0.35, 0.12, 0.7), (0.6, 0.3, 0.6)):
        for k in range(5):
            r = 60 * s * S * (1 + 0.3 * math.sin(k * 2.1))
            x = cx * w + (k - 2) * 55 * s * S
            y = cy * h + (abs(k - 2) * 12) * S
            d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=(255, 255, 255))
    # far hills + trees
    d.ellipse([-0.2 * w, 0.32 * h, 0.6 * w, 0.75 * h], fill=hexc("#7ccf8a", None))
    d.ellipse([0.4 * w, 0.30 * h, 1.3 * w, 0.78 * h], fill=hexc("#8bd896", None))
    for i in range(9):
        x = (0.05 + i * 0.11) * w
        y = 0.43 * h + rnd.randrange(-10, 10) * S
        r = rnd.randrange(34, 52) * S
        d.ellipse([x - r, y - r, x + r, y + r], fill=hexc(rnd.choice(["#3fae6a", "#4fbf74", "#2f9b62"]), None))
    # ground with perspective court
    d.polygon([(0, 0.5 * h), (w, 0.5 * h), (w, h), (0, h)], fill=hexc("#f2c9a0", None))
    d.polygon([(0.38 * w, 0.5 * h), (0.62 * w, 0.5 * h), (1.05 * w, h), (-0.05 * w, h)], fill=hexc("#f7dcb8", None))
    d.polygon([(0, 0.82 * h), (0.25 * w, 0.66 * h), (0.3 * w, 0.66 * h), (0.12 * w, h), (0, h)], fill=hexc("#7fd38a", None))
    d.polygon([(w, 0.8 * h), (0.78 * w, 0.66 * h), (0.72 * w, 0.66 * h), (0.9 * w, h), (w, h)], fill=hexc("#7fd38a", None))
    # buildings, left (pink) and right (red), in perspective
    def building(x0, x1, top, base, col, roof, door):
        d.polygon([(x0, top[0]), (x1, top[1]), (x1, base[1]), (x0, base[0])], fill=hexc(col, None))
        d.polygon([(x0, top[0] - 40 * S), (x1, top[1] - 26 * S), (x1, top[1]), (x0, top[0])], fill=hexc(roof, None))
        dx0, dx1 = x0 + (x1 - x0) * 0.25, x0 + (x1 - x0) * 0.6
        d.rectangle([dx0, (top[0] + base[0]) / 2 + 20 * S, dx1, base[0] - 4 * S], fill=hexc(door, None))
        for k in range(6):
            yy = (top[0] + base[0]) / 2 + 30 * S + k * 16 * S
            d.line([(dx0, yy), (dx1, yy)], fill=hexc("#5e5aa8", None), width=3 * S)
    building(0.0, 0.33 * w, (0.25 * h, 0.33 * h), (0.66 * h, 0.58 * h), "#e98bb0", "#d4648f", "#7470c4")
    building(0.68 * w, w, (0.36 * h, 0.27 * h), (0.6 * h, 0.66 * h), "#ef6f73", "#c94e5c", "#6b5bb0")
    d.polygon([(0.58 * w, 0.22 * h), (0.62 * w, 0.12 * h), (0.66 * w, 0.22 * h)], fill=hexc("#f08aa0", None))
    d.rectangle([0.59 * w, 0.22 * h, 0.65 * w, 0.45 * h], fill=hexc("#f6a3b5", None))
    # bushes / props
    for x, y, c in ((0.08, 0.63, "#f59bd0"), (0.14, 0.62, "#f6c25a"), (0.88, 0.62, "#f6c25a"), (0.36, 0.56, "#56c4a0")):
        r = 30 * S
        d.ellipse([x * w - r, y * h - r, x * w + r, y * h + r], fill=hexc(c, None))
    # characters
    def kid(x, y, s, shirt, pants, hair, arm=1):
        x, y = x * w, y * h
        u = 46 * S * s
        d.ellipse([x - u * 0.6, y + u * 3.2, x + u * 0.6, y + u * 3.5], fill=(0, 0, 0, 60))
        d.rounded_rectangle([x - u * 0.5, y + u * 1.9, x - u * 0.1, y + u * 3.25], radius=u * 0.15, fill=hexc(pants, None))
        d.rounded_rectangle([x + u * 0.1, y + u * 1.9, x + u * 0.5, y + u * 3.25], radius=u * 0.15, fill=hexc(pants, None))
        d.rounded_rectangle([x - u * 0.62, y + u * 0.75, x + u * 0.62, y + u * 2.1], radius=u * 0.3, fill=hexc(shirt, None))
        d.line([(x + u * 0.55, y + u * 1.0), (x + u * 1.15, y + u * (0.55 if arm else 1.5))], fill=hexc(shirt, None), width=int(u * 0.32))
        d.line([(x - u * 0.55, y + u * 1.0), (x - u * 1.0, y + u * 1.6)], fill=hexc(shirt, None), width=int(u * 0.32))
        d.ellipse([x - u * 0.6, y - u * 0.4, x + u * 0.6, y + u * 0.85], fill=hexc("#f2c3a0", None))
        d.pieslice([x - u * 0.66, y - u * 0.5, x + u * 0.66, y + u * 0.7], 180, 360, fill=hexc(hair, None))
        d.ellipse([x - u * 0.25, y + u * 0.12, x - u * 0.12, y + u * 0.3], fill=(40, 30, 50))
        d.ellipse([x + u * 0.12, y + u * 0.12, x + u * 0.25, y + u * 0.3], fill=(40, 30, 50))
    kid(0.30, 0.48, 1.0, "#4aa3e8", "#7a3fa0", "#e07a3a", 0)
    kid(0.53, 0.43, 1.2, "#ef5a6a", "#3b3f8f", "#7a4a2a", 1)
    kid(0.75, 0.47, 0.95, "#4ac4d8", "#c4405a", "#c8402a", 1)
    d.ellipse([0.52 * w, 0.24 * h, 0.535 * w, 0.265 * h], fill=hexc("#ff6b5a", None))
    # HUD
    def panel(x0, y0, x1, y1):
        rrect(d, [x0 * w, y0 * h, x1 * w, y1 * h], 16 * S, fill=hexc("#3b2f6a", None), outline=hexc("#a99cff", None), width=4 * S)
    panel(0.03, 0.04, 0.27, 0.11)
    d.ellipse([0.035 * w, 0.045 * h, 0.075 * w, 0.105 * h], fill=hexc("#7fe0a0", None))
    panel(0.79, 0.04, 0.97, 0.11)
    panel(0.03, 0.74, 0.25, 0.94)
    for k, c in enumerate(("#ffffff", "#ff9ec5", "#ffffff")):
        d.rounded_rectangle([0.05 * w, (0.78 + k * 0.05) * h, (0.2 - k * 0.03) * w, (0.8 + k * 0.05) * h], radius=6 * S, fill=hexc(c, None))
    rrect(d, [0.8 * w, 0.82 * h, 0.98 * w, 0.95 * h], 30 * S, fill=hexc("#9b7fe8", None))
    d.rounded_rectangle([0.83 * w, 0.87 * h, 0.95 * w, 0.89 * h], radius=6 * S, fill=hexc("#7ad8ff", None))
    img = img.resize((1280, 720), Image.LANCZOS)
    img.save(path, quality=88)


# ------------------------------------------------------------------ game room

GAME_TITLES = ["KULE", "ADA", "YOL", "KALE", "PERI", "MAVI", "UZAY", "ORMAN", "HAZINE", "ROTA", "SIRA", "DENIZ", "BULUT", "KOVAN", "YILDIZ", "LABIRENT"]


def game_covers():
    """8 x 4 cells of 256 px: 16 board-game box covers, then 16 book / box spine colours."""
    cw = 256
    img = Image.new("RGB", (cw * 8, cw * 4), (0, 0, 0))
    d = ImageDraw.Draw(img)
    rnd = random.Random(17)
    pal = ["#f2a640", "#e8566a", "#4fb0c6", "#7a6cf0", "#f6d25a", "#5cc08a", "#f28ab0", "#3f6fd8", "#ff8a5a", "#9b6ad8", "#46b3a0", "#e9c46a", "#ef6f6c", "#64a6f0", "#c2d36a", "#f0a3c8"]
    for k in range(16):
        x0, y0 = (k % 8) * cw, (k // 8) * cw
        bg = hexc(pal[k], None)
        d.rectangle([x0, y0, x0 + cw, y0 + cw], fill=bg)
        acc = hexc(pal[(k + 5) % 16], None)
        acc2 = hexc(pal[(k + 9) % 16], None)
        style = k % 4
        if style == 0:
            for i in range(5):
                r = rnd.randrange(20, 60)
                cx, cy = x0 + rnd.randrange(40, cw - 40), y0 + rnd.randrange(80, cw - 40)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=acc if i % 2 else acc2)
        elif style == 1:
            for i in range(6):
                d.rectangle([x0 + 20 + i * 36, y0 + 90 + (i % 2) * 30, x0 + 46 + i * 36, y0 + 220], fill=acc if i % 2 else acc2)
        elif style == 2:
            d.polygon([(x0 + 30, y0 + 230), (x0 + 128, y0 + 70), (x0 + 226, y0 + 230)], fill=acc)
            d.ellipse([x0 + 150, y0 + 70, x0 + 210, y0 + 130], fill=acc2)
        else:
            for i in range(4):
                for j in range(4):
                    if (i + j) % 2 == 0:
                        d.rectangle([x0 + 40 + i * 44, y0 + 70 + j * 40, x0 + 82 + i * 44, y0 + 108 + j * 40], fill=acc)
        d.rectangle([x0, y0, x0 + cw, y0 + 56], fill=tuple(int(c * 0.8) for c in bg))
        f = inter(34, 800)
        t = GAME_TITLES[k]
        d.text((x0 + (cw - d.textlength(t, font=f)) / 2, y0 + 8), t, font=f, fill=(255, 255, 255))
        d.rectangle([x0 + 2, y0 + 2, x0 + cw - 3, y0 + cw - 3], outline=tuple(min(255, c + 40) for c in bg), width=4)
    spines = ["#e9e2d6", "#7b8fd0", "#d68aa0", "#4a5a9a", "#f2c45a", "#5ab08a", "#c25a5a", "#8a6ad0", "#f0f0f0", "#3a8ab0", "#e8a070", "#6a4a8a", "#d0d070", "#4a9a6a", "#f08a8a", "#2a3a6a"]
    for k in range(16):
        x0, y0 = (k % 8) * cw, (2 + k // 8) * cw
        c = hexc(spines[k], None)
        d.rectangle([x0, y0, x0 + cw, y0 + cw], fill=c)
        dark = tuple(int(v * 0.7) for v in c)
        d.rectangle([x0, y0 + 30, x0 + cw, y0 + 44], fill=dark)
        d.rectangle([x0, y0 + cw - 50, x0 + cw, y0 + cw - 36], fill=dark)
    img.save(os.path.join(OUT, "game_covers.png"))


# ------------------------------------------------------------------ game pieces

OKEY_COLORS = ["#d12f3a", "#1f2230", "#2357d1", "#e29a12"]  # red, black, blue, yellow
OKEY_GRID = (8, 7)  # columns, rows; cell index = colour * 13 + (number - 1); 52 false okey; 53 blank
CARD_GRID = (10, 7)  # cell index = suit * 13 + (rank - 1); 52 back; 53, 54 score cards; 55 blank
SUITS = ["spade", "heart", "diamond", "club"]


def okey_atlas():
    cw, ch = 128, 192
    cols, rows = OKEY_GRID
    S = 2
    img = Image.new("RGB", (cols * cw * S, rows * ch * S), hexc("#f6efe1", None))
    d = ImageDraw.Draw(img)
    f = inter(108 * S, 800)
    for idx in range(54):
        x0, y0 = (idx % cols) * cw * S, (idx // cols) * ch * S
        bg = hexc("#f7f0e3", None)
        d.rectangle([x0, y0, x0 + cw * S, y0 + ch * S], fill=bg)
        # soft inner bevel line
        d.rounded_rectangle([x0 + 6 * S, y0 + 6 * S, x0 + cw * S - 6 * S, y0 + ch * S - 6 * S], radius=14 * S, outline=hexc("#e6dcc8", None), width=3 * S)
        if idx < 52:
            c = hexc(OKEY_COLORS[idx // 13], None)
            t = str(idx % 13 + 1)
            tw = d.textlength(t, font=f)
            sz = 108 if len(t) == 1 else 86
            ff = inter(sz * S, 800)
            tw = d.textlength(t, font=ff)
            d.text((x0 + (cw * S - tw) / 2, y0 + 18 * S), t, font=ff, fill=c)
            r = 13 * S
            cx, cy = x0 + cw * S / 2, y0 + 150 * S
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=c, width=5 * S)
        elif idx == 52:
            # false okey ("sahte okey"): the Descall mark in green
            m = descall_mark(96 * S)
            img.paste(Image.new("RGB", m.size, hexc("#2f8a52", None)), (int(x0 + (cw * S - m.size[0]) / 2), int(y0 + (ch * S - m.size[1]) / 2)), m)
    img = img.resize((cols * cw, rows * ch), Image.LANCZOS)
    img.save(os.path.join(OUT, "okey_atlas.png"))


def suit_shape(d, kind, cx, cy, s, fill):
    """Suit symbols drawn from primitives (no font glyphs). s = half size."""
    if kind == "heart":
        r = s * 0.52
        d.ellipse([cx - s, cy - s * 0.75, cx - s + 2 * r, cy - s * 0.75 + 2 * r], fill=fill)
        d.ellipse([cx + s - 2 * r, cy - s * 0.75, cx + s, cy - s * 0.75 + 2 * r], fill=fill)
        d.polygon([(cx - s * 0.98, cy - s * 0.12), (cx + s * 0.98, cy - s * 0.12), (cx, cy + s)], fill=fill)
    elif kind == "diamond":
        d.polygon([(cx, cy - s), (cx + s * 0.75, cy), (cx, cy + s), (cx - s * 0.75, cy)], fill=fill)
    elif kind == "spade":
        r = s * 0.5
        d.polygon([(cx, cy - s), (cx + s * 0.98, cy + s * 0.2), (cx - s * 0.98, cy + s * 0.2)], fill=fill)
        d.ellipse([cx - s, cy - s * 0.2, cx - s + 2 * r, cy - s * 0.2 + 2 * r], fill=fill)
        d.ellipse([cx + s - 2 * r, cy - s * 0.2, cx + s, cy - s * 0.2 + 2 * r], fill=fill)
        d.polygon([(cx, cy + s * 0.2), (cx + s * 0.35, cy + s), (cx - s * 0.35, cy + s)], fill=fill)
    else:  # club
        r = s * 0.42
        for ox, oy in ((0, -s * 0.48), (-s * 0.5, s * 0.08), (s * 0.5, s * 0.08)):
            d.ellipse([cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r], fill=fill)
        d.polygon([(cx, cy), (cx + s * 0.35, cy + s), (cx - s * 0.35, cy + s)], fill=fill)


PIPS = {
    1: [(0.5, 0.5)], 2: [(0.5, 0.2), (0.5, 0.8)], 3: [(0.5, 0.2), (0.5, 0.5), (0.5, 0.8)],
    4: [(0.3, 0.2), (0.7, 0.2), (0.3, 0.8), (0.7, 0.8)], 5: [(0.3, 0.2), (0.7, 0.2), (0.5, 0.5), (0.3, 0.8), (0.7, 0.8)],
    6: [(0.3, 0.2), (0.7, 0.2), (0.3, 0.5), (0.7, 0.5), (0.3, 0.8), (0.7, 0.8)],
    7: [(0.3, 0.2), (0.7, 0.2), (0.5, 0.35), (0.3, 0.5), (0.7, 0.5), (0.3, 0.8), (0.7, 0.8)],
    8: [(0.3, 0.2), (0.7, 0.2), (0.5, 0.35), (0.3, 0.5), (0.7, 0.5), (0.5, 0.65), (0.3, 0.8), (0.7, 0.8)],
    9: [(0.3, 0.18), (0.7, 0.18), (0.3, 0.39), (0.7, 0.39), (0.5, 0.5), (0.3, 0.61), (0.7, 0.61), (0.3, 0.82), (0.7, 0.82)],
    10: [(0.3, 0.18), (0.7, 0.18), (0.5, 0.29), (0.3, 0.39), (0.7, 0.39), (0.3, 0.61), (0.7, 0.61), (0.5, 0.71), (0.3, 0.82), (0.7, 0.82)],
}
RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]


def face_figure(d, x0, y0, w, h, rank, col, S, suit="diamond"):
    """Original geometric court figure (J / Q / K) in the Descall palette."""
    robe = {"J": "#587af6", "Q": "#d6457a", "K": "#7a52d6"}[rank]
    cx = x0 + w / 2
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=10 * S, fill=hexc("#f3ecff", None), outline=hexc(robe, None), width=3 * S)
    # robe (trapezoid), shoulders, head, crown / cap
    d.polygon([(cx - w * 0.36, y0 + h * 0.95), (cx + w * 0.36, y0 + h * 0.95), (cx + w * 0.22, y0 + h * 0.5), (cx - w * 0.22, y0 + h * 0.5)], fill=hexc(robe, None))
    d.polygon([(cx - w * 0.1, y0 + h * 0.5), (cx + w * 0.1, y0 + h * 0.5), (cx, y0 + h * 0.75)], fill=hexc("#f2c94c", None))
    hr = w * 0.15
    d.ellipse([cx - hr, y0 + h * 0.24, cx + hr, y0 + h * 0.24 + 2 * hr], fill=hexc("#f6c9a8", None))
    if rank == "J":
        d.pieslice([cx - hr * 1.2, y0 + h * 0.17, cx + hr * 1.2, y0 + h * 0.39], 180, 360, fill=hexc("#2f3d8a", None))
    else:
        top = y0 + h * 0.08
        base = y0 + h * 0.27
        pts = [(cx - hr * 1.1, base), (cx - hr * 1.1, top + h * 0.06), (cx - hr * 0.55, top + h * 0.11), (cx, top), (cx + hr * 0.55, top + h * 0.11), (cx + hr * 1.1, top + h * 0.06), (cx + hr * 1.1, base)]
        d.polygon(pts, fill=hexc("#f2c94c", None))
        d.ellipse([cx - 5 * S, top + h * 0.03, cx + 5 * S, top + h * 0.03 + 10 * S], fill=hexc("#ffffff", None))
    suit_shape(d, suit, x0 + w * 0.82, y0 + h * 0.12, 9 * S, col)


def cards_atlas():
    cw, ch = 200, 280
    cols, rows = CARD_GRID
    S = 2
    W_, H_ = cols * cw * S, rows * ch * S
    img = Image.new("RGB", (W_, H_), (255, 255, 255))
    d = ImageDraw.Draw(img)
    red, black = hexc("#d22d3c", None), hexc("#1d2030", None)
    for idx in range(56):
        x0, y0 = (idx % cols) * cw * S, (idx // cols) * ch * S
        w, h = cw * S, ch * S
        if idx < 52:
            suit = SUITS[idx // 13]
            rank = RANKS[idx % 13]
            col = red if suit in ("heart", "diamond") else black
            d.rectangle([x0, y0, x0 + w, y0 + h], fill=hexc("#fbfaf7", None))
            f = inter(38 * S if rank != "10" else 32 * S, 800)
            d.text((x0 + 14 * S, y0 + 10 * S), rank, font=f, fill=col)
            suit_shape(d, suit, x0 + 14 * S + 13 * S, y0 + 66 * S, 11 * S, col)
            # bottom-right index, upside down
            tmp = Image.new("RGBA", (70 * S, 90 * S), (0, 0, 0, 0))
            td = ImageDraw.Draw(tmp)
            td.text((4 * S, 0), rank, font=f, fill=col + (255,))
            suit_shape(td, suit, 4 * S + 13 * S, 56 * S, 11 * S, col + (255,))
            tmp = tmp.rotate(180)
            img.paste(tmp, (x0 + w - 70 * S - 10 * S, y0 + h - 90 * S - 6 * S), tmp)
            ix0, iy0, iw, ih = x0 + 46 * S, y0 + 34 * S, w - 92 * S, h - 68 * S
            if rank in ("J", "Q", "K"):
                face_figure(d, ix0, iy0, iw, ih, rank, col, S, suit)
                fl = inter(30 * S, 800)
                d.text((ix0 + 8 * S, iy0 + 4 * S), rank, font=fl, fill=col)
            else:
                n = 1 if rank == "A" else int(rank)
                ps = (34 if n == 1 else 15) * S
                for px, py in PIPS[n]:
                    suit_shape(d, suit, ix0 + px * iw, iy0 + py * ih, ps, col)
        elif idx == 52:
            # Descall back: deep indigo, blue lattice, the mark in a ring, white border (drawn on its own tile)
            tile = Image.new("RGB", (w, h), (255, 255, 255))
            td = ImageDraw.Draw(tile)
            inner = Image.new("RGB", (w - 20 * S, h - 20 * S), hexc("#22205e", None))
            idr = ImageDraw.Draw(inner)
            iw_, ih_ = inner.size
            step = 22 * S
            for k in range(-14, 26):
                xa = k * step
                idr.line([(xa, 0), (xa + ih_, ih_)], fill=hexc("#33318a", None), width=3 * S)
                idr.line([(xa + ih_, 0), (xa, ih_)], fill=hexc("#33318a", None), width=3 * S)
            mask = Image.new("L", inner.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, iw_ - 1, ih_ - 1], radius=12 * S, fill=255)
            tile.paste(inner, (10 * S, 10 * S), mask)
            td.rounded_rectangle([10 * S, 10 * S, w - 10 * S, h - 10 * S], radius=12 * S, outline=hexc("#587af6", None), width=4 * S)
            cx, cy, R = w / 2, h / 2, 62 * S
            td.ellipse([cx - R, cy - R, cx + R, cy + R], fill=hexc("#22205e", None), outline=hexc("#587af6", None), width=4 * S)
            m = descall_mark(88 * S)
            tile.paste(Image.new("RGB", m.size, hexc("#7f9cff", None)), (int(cx - m.size[0] / 2), int(cy - m.size[1] / 2)), m)
            img.paste(tile, (x0, y0))
        elif idx in (53, 54):
            # score cards (points counters, no money): dots in the draft's colours
            d.rectangle([x0, y0, x0 + w, y0 + h], fill=hexc("#fbfaf7", None))
            d.rounded_rectangle([x0 + 12 * S, y0 + 12 * S, x0 + w - 12 * S, y0 + h - 12 * S], radius=12 * S, outline=hexc("#e6e0ef", None), width=3 * S)
            cols_ = ["#ef5b4f", "#ef5b4f", "#f08a3c"] if idx == 53 else ["#f2cf3a", "#f2cf3a", "#5cc08a"]
            if idx == 54:
                d.ellipse([x0 + 40 * S, y0 + 40 * S, x0 + w - 40 * S, y0 + h - 40 * S], fill=hexc("#cfeaff", None))
            for k, (px, py) in enumerate(PIPS[5]):
                r = 20 * S
                d.ellipse([x0 + px * w - r, y0 + py * h - r, x0 + px * w + r, y0 + py * h + r], fill=hexc(cols_[k % 3], None))
        else:
            d.rectangle([x0, y0, x0 + w, y0 + h], fill=hexc("#fbfaf7", None))
    img = img.resize((cols * cw, rows * ch), Image.LANCZOS)
    img.save(os.path.join(OUT, "cards_atlas.png"))


def tavla_board():
    """Open backgammon board seen from above: wood frame, 24 points, centre bar (1024 x 640)."""
    S = 2
    w, h = 1024 * S, 640 * S
    img = Image.new("RGB", (w, h), hexc("#8a5530", None))
    d = ImageDraw.Draw(img)
    rnd = random.Random(4)
    for k in range(400):
        y = rnd.randrange(h)
        d.line([(0, y), (w, y + rnd.randrange(-6, 6))], fill=hexc(rnd.choice(["#7d4b2a", "#93603a", "#875230"]), None), width=S)
    m = 34 * S
    bar = 40 * S
    half = (w - 2 * m - bar) / 2
    for side in (0, 1):
        x0 = m + side * (half + bar)
        d.rectangle([x0, m, x0 + half, h - m], fill=hexc("#f1e3c4", None))
        pw = half / 6
        for k in range(6):
            for top in (True, False):
                c = hexc("#c4523a", None) if (k + (0 if top else 1)) % 2 == 0 else hexc("#2f6b52", None)
                px = x0 + k * pw
                if top:
                    d.polygon([(px + 3 * S, m), (px + pw - 3 * S, m), (px + pw / 2, m + (h - 2 * m) * 0.42)], fill=c)
                else:
                    d.polygon([(px + 3 * S, h - m), (px + pw - 3 * S, h - m), (px + pw / 2, h - m - (h - 2 * m) * 0.42)], fill=c)
    d.rectangle([m + half, m, m + half + bar, h - m], fill=hexc("#6e4026", None))
    img.resize((1024, 640), Image.LANCZOS).save(os.path.join(OUT, "tavla_board.png"))


def dice_atlas():
    """3 x 2 cells: faces 1..6 (white, dark pips)."""
    S = 2
    c = 128 * S
    img = Image.new("RGB", (3 * c, 2 * c), hexc("#f7f4ee", None))
    d = ImageDraw.Draw(img)
    pos = {1: [(0.5, 0.5)], 2: [(0.27, 0.27), (0.73, 0.73)], 3: [(0.27, 0.27), (0.5, 0.5), (0.73, 0.73)],
           4: [(0.27, 0.27), (0.73, 0.27), (0.27, 0.73), (0.73, 0.73)], 5: [(0.27, 0.27), (0.73, 0.27), (0.5, 0.5), (0.27, 0.73), (0.73, 0.73)],
           6: [(0.27, 0.25), (0.73, 0.25), (0.27, 0.5), (0.73, 0.5), (0.27, 0.75), (0.73, 0.75)]}
    for n in range(1, 7):
        x0, y0 = ((n - 1) % 3) * c, ((n - 1) // 3) * c
        for px, py in pos[n]:
            r = 13 * S
            d.ellipse([x0 + px * c - r, y0 + py * c - r, x0 + px * c + r, y0 + py * c + r], fill=hexc("#c8303a", None) if n == 1 else hexc("#1d2030", None))
    img.resize((3 * 128, 2 * 128), Image.LANCZOS).save(os.path.join(OUT, "dice_atlas.png"))


def chess_board():
    S = 2
    n = 512 * S
    img = Image.new("RGB", (n, n), hexc("#6b4026", None))
    d = ImageDraw.Draw(img)
    m = 32 * S
    q = (n - 2 * m) / 8
    for i in range(8):
        for j in range(8):
            c = hexc("#efd9b0", None) if (i + j) % 2 == 0 else hexc("#9a6238", None)
            d.rectangle([m + i * q, m + j * q, m + (i + 1) * q, m + (j + 1) * q], fill=c)
    d.rectangle([m - 3 * S, m - 3 * S, n - m + 3 * S, n - m + 3 * S], outline=hexc("#3a2214", None), width=3 * S)
    img.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "chess_board.png"))


# ------------------------------------------------------------------ camp

def camp_sky():
    """Equirect-ish sky band for the dome (u around, v up): night gradient + stars (2048 x 1024)."""
    w, h = 2048, 1024
    img = vgrad(w, h, [(0, "#0a0f2e"), (0.42, "#16205a"), (0.5, "#2a2f74"), (0.53, "#3a3a84"), (1, "#141638")])
    arr = np.asarray(img).astype(np.float32)
    rnd = np.random.default_rng(9)
    n = 2200
    xs, ys = rnd.integers(0, w, n), rnd.integers(0, int(h * 0.5), n)
    br = rnd.uniform(90, 255, n) * (1 - ys / (h * 0.55)) ** 0.5
    for x, y, b in zip(xs, ys, br):
        arr[y, x] = np.maximum(arr[y, x], [b, b, min(255, b * 1.08)])
        if b > 215:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                arr[(y + dy) % h, (x + dx) % w] = np.maximum(arr[(y + dy) % h, (x + dx) % w], [b * 0.45] * 3)
    Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, "camp_sky.png"))


def camp_aurora():
    """Aurora curtain (u along the ribbon, v up): soft vertical rays, green low, violet high. Black = clear (additive)."""
    w, h = 1024, 256
    rnd = np.random.default_rng(3)
    u = np.linspace(0, 1, w)[None, :]
    v = np.linspace(1, 0, h)[:, None]  # 1 at the top row
    rays = np.zeros((1, w))
    for _ in range(40):
        c, s, a = rnd.uniform(0, 1), rnd.uniform(0.004, 0.03), rnd.uniform(0.3, 1.0)
        rays += a * np.exp(-((u - c) / s) ** 2)
    rays = 0.35 + 0.65 * np.clip(rays / rays.max(), 0, 1)
    env = np.sin(np.pi * np.clip(u, 0, 1)) ** 0.6
    lower = np.exp(-((v - 0.18) / 0.12) ** 2) * (v > 0.05)
    body = np.clip((v - 0.05) / 0.2, 0, 1) * np.exp(-((v - 0.45) / 0.35) ** 2)
    green = np.array([60, 230, 170], np.float32)
    violet = np.array([170, 90, 255], np.float32)
    mixv = np.clip((v - 0.25) / 0.45, 0, 1)[..., None]
    col = green * (1 - mixv) + violet * mixv
    inten = (0.6 * body + 0.9 * lower) * rays * env
    arr = col * inten[..., None]
    Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, "camp_aurora.png"))


def camp_moon():
    s = 512
    rnd = random.Random(12)
    img = Image.new("RGB", (s, s), (0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([16, 16, s - 16, s - 16], fill=(238, 238, 228))
    for _ in range(26):
        r = rnd.randrange(10, 60)
        x, y = rnd.randrange(60, s - 60), rnd.randrange(60, s - 60)
        if (x - s / 2) ** 2 + (y - s / 2) ** 2 > (s / 2 - 40 - r) ** 2:
            continue
        g = rnd.randrange(196, 222)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(g, g, g - 6))
    img = img.filter(ImageFilter.GaussianBlur(3))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse([16, 16, s - 16, s - 16], fill=255)
    out = Image.new("RGB", (s, s), (0, 0, 0))
    out.paste(img, (0, 0), mask.filter(ImageFilter.GaussianBlur(1.5)))
    out.save(os.path.join(OUT, "camp_moon.png"))


def camp_lake():
    """Lake surface as seen from the camp (u across, v away): dark blue, moon streak, ripples."""
    w, h = 1024, 1024
    rnd = np.random.default_rng(5)
    v = np.linspace(0, 1, h)[:, None]  # 0 near shore, 1 far
    u = np.linspace(0, 1, w)[None, :]
    base = np.array([18, 26, 70], np.float32) * (0.75 + 0.5 * v[..., None]) + np.array([10, 10, 30]) * (1 - v[..., None])
    streak_w = 0.04 + 0.1 * (1 - v)
    streak = np.exp(-((u - 0.52) / streak_w) ** 2)
    ripples = np.zeros((h, w))
    for _ in range(900):
        y = int(rnd.uniform(0, 1) ** 0.7 * (h - 1))
        x = rnd.uniform(0, 1)
        L = rnd.uniform(0.01, 0.06) * (1.2 - y / h)
        a = rnd.uniform(0.4, 1.0)
        xs = np.clip(((np.arange(w) / w) - x) / L, -1, 1)
        ripples[y:y + 2, :] += a * (np.abs(xs) < 1) * (1 - xs ** 2)
    ripples = np.clip(ripples, 0, 1)
    moonlit = streak * (0.25 + 0.95 * ripples)
    arr = base + moonlit[..., None] * np.array([190, 200, 255]) + (ripples * 0.12)[..., None] * np.array([90, 100, 170])
    Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, "camp_lake.png"))


def camp_flame():
    """Flame card (u across, v up): white-yellow core, orange body, red tips; black = clear (additive)."""
    w, h = 256, 512
    u = np.linspace(-1, 1, w)[None, :]
    v = np.linspace(1, 0, h)[:, None]
    width = 0.95 * (1 - v) ** 0.55 * (0.35 + 0.65 * np.clip(v * 3, 0, 1))
    shape = np.clip(1 - (np.abs(u) / np.maximum(width, 1e-3)) ** 2, 0, 1) * np.clip(1 - v * 1.02, 0, 1) ** 0.4
    core = np.clip(1 - (np.abs(u) / np.maximum(width * 0.45, 1e-3)) ** 2, 0, 1) * np.clip(1 - v * 1.6, 0, 1)
    col = np.zeros((h, w, 3), np.float32)
    col += shape[..., None] * np.array([255, 110, 30]) * (0.6 + 0.4 * (1 - v[..., None]))
    col += core[..., None] * np.array([255, 230, 150])
    col *= np.clip(1.4 - v * 0.9, 0, 1)[..., None]
    Image.fromarray(col.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, "camp_flame.png"))


def log_end():
    s = 256
    img = Image.new("RGB", (s, s), hexc("#c8925a", None))
    d = ImageDraw.Draw(img)
    for k in range(14, 0, -1):
        r = k * s / 30
        c = hexc("#b07a46", None) if k % 2 else hexc("#d4a066", None)
        d.ellipse([s / 2 - r, s / 2 - r * 0.96, s / 2 + r, s / 2 + r * 0.96], fill=c)
    d.ellipse([4, 4, s - 4, s - 4], outline=hexc("#6a4022", None), width=14)
    img.filter(ImageFilter.GaussianBlur(1.2)).save(os.path.join(OUT, "log_end.png"))


# ------------------------------------------------------------------ main

def main():
    os.makedirs(OUT, exist_ok=True)
    cinema_ceiling()
    cinema_wall()
    cinema_standby()
    cinema_demo(os.path.join(DEV_OUT, "screen-demo.jpg"))
    descall_mark(512).save(os.path.join(OUT, "descall_mark.png"))
    game_covers()
    okey_atlas()
    cards_atlas()
    tavla_board()
    dice_atlas()
    chess_board()
    camp_sky()
    camp_aurora()
    camp_moon()
    camp_lake()
    camp_flame()
    log_end()
    print("textures ->", OUT)


if __name__ == "__main__":
    main()
