# Web / Electron splash videos at any resolution (Nov 2026, "splash is blurry and small").
# Renders the same flat2d.s1flat animation as frames.py, but only the centre 600 source px
# (the square the web videos always used: tile 440 px = 73.3% of the frame) and on a finer
# grid, so the vector shapes are sampled natively at SIZE px instead of being upscaled.
#
#   python3 web_hd.py 720 /tmp/out      # -> /tmp/out/{oneshot,loop}/NNNN.png (RGBA, 60 fps)
#
# Then encode (see README): VP9 + alpha WebM and an opaque H.264 MP4 on #1B1D26.
import os, sys, types
import numpy as np
from PIL import Image
from multiprocessing import Pool

sys.modules.setdefault('scipy', types.ModuleType('scipy'))          # anim.py only needs it for s2
_nd = types.ModuleType('scipy.ndimage'); _nd.gaussian_filter = None
sys.modules.setdefault('scipy.ndimage', _nd)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anim, flat2d  # noqa: E402

SRC = 600                                      # centre crop of the 1000 px source canvas
SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 720
ROOT = sys.argv[2] if len(sys.argv) > 2 else './frames-hd'
F = SIZE / SRC
FPS = 60


def setup():
    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    x0 = (xs - SIZE / 2 + 0.5) / F
    y0 = (ys - SIZE / 2 + 0.5) / F
    cov = lambda d: np.clip(0.5 - d * F, 0, 1)   # anti-aliasing width = one OUTPUT pixel
    for m in (anim, flat2d):
        m.X0, m.Y0, m.cov = x0, y0, cov
    anim.C = flat2d.C = SIZE                       # canvas() and the flat2d body size
    # anim.flat() takes X0/Y0 as default arguments bound at import time: rebind them.
    anim.flat.__defaults__ = (x0, y0, 1.0, 1.0)


def ease(x):
    x = min(max(x, 0), 1)
    return x * x * x * (x * (6 * x - 15) + 10)


def params(kind, i):                               # identical to frames.py
    t = i / FPS
    if kind == 'oneshot' or t < 3.2:
        return t, None
    tau = (t - 3.2) / 1.2
    return 2.05 * (1 - ease(tau)), 1 - ease(tau / 0.5)


def bleed(col, known, steps=8):
    # Transparent pixels carry the colour of the nearest visible edge instead of black,
    # so the 4:2:0 chroma and the codec do not pull a dark fringe into anti-aliased edges.
    col = col.copy()
    known = known.copy()
    for _ in range(steps):
        acc = np.zeros_like(col)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(col, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        grow = (~known) & (cnt > 0)
        col[grow] = acc[grow] / cnt[grow][:, None]
        known |= grow
    if known.any():
        col[~known] = col[known].mean(0)
    return col


def render(job):
    kind, i = job
    ts, fl = params(kind, i)
    out = []
    for bg in (np.zeros(3), np.ones(3)):
        anim.BG = bg
        out.append(np.clip(flat2d.s1flat(ts, fl), 0, 1))
    b, w = out
    a = np.clip(1 - (w - b).mean(-1), 0, 1)
    col = np.where(a[..., None] > 1e-4, b / np.maximum(a[..., None], 1e-4), 0)
    rgba = np.dstack([bleed(np.clip(col, 0, 1), a > 1e-4), a])
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(f'{ROOT}/{kind}/{i:04d}.png')


setup()

if __name__ == '__main__':
    only = sys.argv[3] if len(sys.argv) > 3 else None
    jobs = [('oneshot', i) for i in range(int(3.8 * FPS))] + [('loop', i) for i in range(int(4.4 * FPS))]
    if only:
        jobs = [j for j in jobs if f'{j[0]}:{j[1]}' in only.split(',')]
    for k in ('oneshot', 'loop'):
        os.makedirs(f'{ROOT}/{k}', exist_ok=True)
    with Pool(os.cpu_count() or 4) as p:
        p.map(render, jobs, chunksize=4)
    print('ok', SIZE, len(jobs))
