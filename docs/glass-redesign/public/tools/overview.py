# Contact sheet: each frame = desktop first viewport + mobile first viewport, labelled. → overview.png
import glob, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = "/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf"
names = sorted({os.path.basename(p).rsplit("-", 1)[0] for p in glob.glob(f"{D}/*-desktop.png") + glob.glob(f"{D}/*-mobile.png")})
DW, DH = 480, 300; MW, MH = 139, 300; GAP = 14; CW = DW + GAP + MW; CH = DH + 44
COLS = 5; PAD = 56; HEAD = 150
rows = (len(names) + COLS - 1) // COLS
W = PAD * 2 + COLS * CW + (COLS - 1) * 36; H = HEAD + rows * (CH + 36) + PAD
img = Image.new("RGB", (W, H), (13, 14, 19))
sw, sh = W // 16, H // 16
bg = Image.new("RGB", (sw, sh), (13, 14, 19)); dr = ImageDraw.Draw(bg)
for (x, y, r, c) in [(0.05, 0.03, 60, (52, 70, 150)), (0.95, 0.3, 70, (70, 52, 150)), (0.3, 0.92, 75, (40, 54, 125))]:
    dr.ellipse((x * sw - r, y * sh - r, x * sw + r, y * sh + r), fill=c)
img = bg.filter(ImageFilter.GaussianBlur(40)).resize((W, H), Image.BICUBIC)
d = ImageDraw.Draw(img)
f1 = ImageFont.truetype(FONT, 44); f1.set_variation_by_axes([32, 750]) if hasattr(f1, "set_variation_by_axes") else None
f2 = ImageFont.truetype(FONT, 22); f3 = ImageFont.truetype(FONT, 19)
logo = Image.open(f"{D}/assets/brand/descall-icon.png").convert("RGBA").resize((64, 64))
img.paste(logo, (PAD, 44), logo)
d.text((PAD + 84, 44), "Descall — Public site · Liquid Glass", font=f1, fill=(245, 247, 255))
d.text((PAD + 86, 100), f"{len(names)} frames · desktop 1440 + mobile 390 · dark · © 2026 Demir Sarp Kurtlar", font=f2, fill=(170, 178, 205))
def crop(path, w, h, vw):
    if not os.path.exists(path): return None
    im = Image.open(path).convert("RGB"); s = im.width / vw
    vh = int(vw * h / w)
    im = im.crop((0, 0, im.width, min(im.height, int(vh * s))))
    return im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
def rounded(im, r):
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255); return m
for i, n in enumerate(names):
    cx = PAD + (i % COLS) * (CW + 36); cy = HEAD + (i // COLS) * (CH + 36)
    dimg = crop(f"{D}/{n}-desktop.png", DW, DH, 1440); mimg = crop(f"{D}/{n}-mobile.png", MW, MH, 390)
    if dimg: img.paste(dimg, (cx, cy), rounded(dimg, 14))
    if mimg: img.paste(mimg, (cx + DW + GAP if dimg else cx, cy), rounded(mimg, 16))
    d.text((cx + 2, cy + DH + 12), n, font=f3, fill=(225, 230, 250))
img.save(f"{D}/overview.png", optimize=True)
print("overview", img.size, len(names))
