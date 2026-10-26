#!/usr/bin/env python3
"""Black-flash detector for jank.perf.cjs --frames screencasts.

For every frame: mean luminance and the fraction of near-black pixels
(Y < 14). A flash is a frame whose near-black fraction rises at least
FLASH_DELTA above BOTH the previous and the next stable frames (a dip that
recovers), or a frame that is almost fully black after the first paint.

Usage: flicker.py <frames-root> [--json out.json]
  frames-root/<device>/<scenario>/f0000.jpg ...
"""
import json, os, sys
import numpy as np
from PIL import Image

FLASH_DELTA = 0.12
BLACK_Y = 14


def stats(path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return float(y.mean()), float((y < BLACK_Y).mean())


def analyse(dirpath):
    files = sorted(f for f in os.listdir(dirpath) if f.endswith((".jpg", ".png")))
    rows = [(f, *stats(os.path.join(dirpath, f))) for f in files]
    flashes = []
    painted = False
    for i, (f, lum, blk) in enumerate(rows):
        if blk < 0.9:
            painted = True
        if not painted or i == 0 or i == len(rows) - 1:
            continue
        prev_blk = rows[i - 1][2]
        next_blk = rows[i + 1][2]
        if (blk - prev_blk >= FLASH_DELTA and blk - next_blk >= FLASH_DELTA) or blk > 0.9:
            flashes.append({"frame": f, "black": round(blk, 3), "prev": round(prev_blk, 3), "next": round(next_blk, 3)})
    return {"frames": len(rows), "maxBlackAfterPaint": round(max([r[2] for r in rows if r[2] < 0.9] or [0]), 3),
            "flashes": flashes, "series": [[r[0], round(r[1], 1), round(r[2], 3)] for r in rows]}


def main():
    root = sys.argv[1]
    out = {}
    for dev in sorted(os.listdir(root)):
        for scen in sorted(os.listdir(os.path.join(root, dev))):
            d = os.path.join(root, dev, scen)
            if not os.path.isdir(d):
                continue
            r = analyse(d)
            out[f"{dev}/{scen}"] = r
            print(f"{dev:8s} {scen:12s} frames={r['frames']:4d} flashes={len(r['flashes'])} maxBlackAfterPaint={r['maxBlackAfterPaint']}"
                  + (f"  {r['flashes'][:4]}" if r["flashes"] else ""))
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w") as fh:
            json.dump(out, fh)


if __name__ == "__main__":
    main()
