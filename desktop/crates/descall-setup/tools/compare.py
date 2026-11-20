"""Side-by-side draft vs build comparisons for Descall Setup.

usage: python3 tools/compare.py <render-out> <draft-dir> <dest-dir>
For each state: <dest>/<state>-compare.png = draft PNG | built PNG (same 1500 ms timing),
and a frozen diff row (animations paused at t=0 in both) with a heatmap and mismatch score.
"""
import sys, os
from PIL import Image, ImageChops, ImageDraw, ImageFont

out, draft, dest = sys.argv[1:4]
os.makedirs(dest, exist_ok=True)
STATES = ["welcome", "progress", "migration", "done", "error", "update"]
try:
    FONT = ImageFont.truetype("/usr/share/fonts/opentype/inter/Inter-SemiBold.otf", 34)
except OSError:
    FONT = ImageFont.load_default()


def label(img, text):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 64], fill=(11, 13, 22))
    d.text((24, 14), text, fill=(235, 238, 255), font=FONT)


def score(a, b):
    if a.size != b.size:
        return None, None
    diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L")
    hist = diff.histogram()
    total = a.width * a.height
    bad = sum(hist[24:])  # pixels off by more than ~10 %
    heat = diff.point(lambda v: min(255, v * 4)).convert("RGB")
    heat = ImageChops.multiply(heat, Image.new("RGB", heat.size, (255, 80, 120)))
    return bad / total, heat


summary = []
for st in STATES:
    a = Image.open(os.path.join(draft, st + ".png")).convert("RGB")
    b = Image.open(os.path.join(out, "pairs", st + "-built.png")).convert("RGB")
    fa = Image.open(os.path.join(out, "frozen", st + "-draft.png")).convert("RGB")
    fb = Image.open(os.path.join(out, "frozen", st + "-built.png")).convert("RGB")
    s, heat = score(fa, fb)
    w, h = a.width, a.height
    rows = 2 if heat is not None else 1
    canvas = Image.new("RGB", (w * 2 + 24, (h + 64) * rows + 24 * (rows - 1)), (11, 13, 22))
    for i, (img, txt) in enumerate([(a, f"Draft B · {st}"), (b, f"Built · {st}")]):
        tile = Image.new("RGB", (w, h + 64), (11, 13, 22))
        tile.paste(img.resize((w, h)) if img.size != (w, h) else img, (0, 64))
        label(tile, txt)
        canvas.paste(tile, (i * (w + 24), 0))
    if heat is not None:
        tile = Image.new("RGB", (w, h + 64), (11, 13, 22))
        tile.paste(Image.blend(fb, heat, 0.75), (0, 64))
        label(tile, f"Frozen diff · {s * 100:.2f}% of pixels differ by >10%")
        canvas.paste(tile, (0, h + 64 + 24))
        tile2 = Image.new("RGB", (w, h + 64), (11, 13, 22))
        tile2.paste(fb, (0, 64))
        label(tile2, "Built, frozen at t=0 (same frame as the draft diff)")
        canvas.paste(tile2, (w + 24, h + 64 + 24))
    canvas.save(os.path.join(dest, st + "-compare.png"), optimize=True)
    summary.append((st, s, a.size, b.size))
for st, s, sa, sb in summary:
    print(f"{st:10s} draft {sa} built {sb} frozen-mismatch {('%.3f%%' % (s * 100)) if s is not None else 'size differs'}")
