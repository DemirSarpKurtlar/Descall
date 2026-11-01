#!/usr/bin/env python3
"""Recover a draft's camera from point correspondences (numpy Levenberg-Marquardt).

Each draft (1600 x 900) is matched by measuring where known room features land in the
image (screen corners, table centres, ...). Unknowns: camera position, yaw, pitch,
roll and horizontal FOV; any of them can be fixed. Prints a Blender camera (location,
a look-at target 10 m ahead, lens for a 36 mm sensor) and the per-point residuals.

  python3 tools/world3d/solve_camera.py cinema
Blender axes: Z up; yaw 0 looks toward +Y, positive yaw turns toward +X.
"""
import math
import sys

import numpy as np

W, H = 1600, 900

# room -> (points [(name, (x, y, z), (u, v))], initial guess, fixed params)
CASES = {
    # screen corners of scene-1.jpg (bright area), screen 4.8 x 2.7 at y = 12.48, x 1.6..6.4, z 1.15..3.85
    "cinema": ([
        ("screen TL", (1.6, 12.48, 3.85), (439, 139)),
        ("screen TR", (6.4, 12.48, 3.85), (912, 166)),
        ("screen BL", (1.6, 12.48, 1.15), (440, 412)),
        ("screen BR", (6.4, 12.48, 1.15), (911, 399)),
        # depth vanishing point: the left-wall neon and the right wall / ceiling edge meet at (670, 201)
        ("vp depth", (4.0, 1e5, 2.0), (670, 201)),
        ("vp depth 2", (4.0, 1e5, 2.0), (670, 201)),
    ], dict(x=3.5, y=3.5, z=2.2, yaw=5, pitch=-3, roll=0, hfov=79), {"roll": 0.0}),
}


def project(params, pts):
    x, y, z, yaw, pitch, roll, hfov = params
    yaw, pitch, roll, hfov = (math.radians(a) for a in (yaw, pitch, roll, hfov))
    f = np.array([math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)])
    r = np.cross(f, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    r2 = r * math.cos(roll) + u * math.sin(roll)
    u2 = u * math.cos(roll) - r * math.sin(roll)
    fp = (W / 2) / math.tan(hfov / 2)
    d = np.asarray(pts, float) - np.array([x, y, z])
    xc, yc, zc = d @ r2, d @ u2, d @ f
    return np.stack([W / 2 + fp * xc / zc, H / 2 - fp * yc / zc], axis=1)


KEYS = ["x", "y", "z", "yaw", "pitch", "roll", "hfov"]


def solve(points, guess, fixed, iters=200):
    P3 = [p[1] for p in points]
    UV = np.array([p[2] for p in points], float)
    free = [k for k in KEYS if k not in fixed]
    full = {**guess, **fixed}

    def residual(vec):
        prm = dict(full)
        prm.update(dict(zip(free, vec)))
        return (project([prm[k] for k in KEYS], P3) - UV).ravel()

    v = np.array([full[k] for k in free], float)
    lam = 1e-2
    r = residual(v)
    for _ in range(iters):
        J = np.zeros((r.size, v.size))
        for i in range(v.size):
            dv = np.zeros_like(v)
            dv[i] = 1e-4 * max(1.0, abs(v[i]))
            J[:, i] = (residual(v + dv) - r) / dv[i]
        A = J.T @ J
        g = J.T @ r
        step = np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-9), -g)
        r2 = residual(v + step)
        if (r2 ** 2).sum() < (r ** 2).sum():
            v, r = v + step, r2
            lam *= 0.5
        else:
            lam *= 4
        if np.abs(step).max() < 1e-7:
            break
    prm = dict(full)
    prm.update(dict(zip(free, v)))
    return prm, r.reshape(-1, 2)


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "cinema"
    points, guess, fixed = CASES[name]
    prm, res = solve(points, guess, fixed)
    yaw, pitch = math.radians(prm["yaw"]), math.radians(prm["pitch"])
    loc = np.array([prm["x"], prm["y"], prm["z"]])
    tgt = loc + 10 * np.array([math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)])
    lens = 18.0 / math.tan(math.radians(prm["hfov"]) / 2)
    print({k: round(v, 3) for k, v in prm.items()})
    print("blender camera loc", tuple(round(a, 3) for a in loc), "target", tuple(round(a, 3) for a in tgt), "lens", round(lens, 2))
    for (n, _, uv), e in zip(points, res):
        print(f"  {n:14s} draft {uv} residual {e.round(1)}")


def ray(prm, u, v):
    """World ray (origin, direction) through draft pixel (u, v)."""
    yaw, pitch, roll, hfov = (math.radians(prm[k]) for k in ("yaw", "pitch", "roll", "hfov"))
    f = np.array([math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)])
    r = np.cross(f, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    up = np.cross(r, f)
    r2 = r * math.cos(roll) + up * math.sin(roll)
    u2 = up * math.cos(roll) - r * math.sin(roll)
    fp = (W / 2) / math.tan(hfov / 2)
    d = f + r2 * ((u - W / 2) / fp) + u2 * (-(v - H / 2) / fp)
    return np.array([prm["x"], prm["y"], prm["z"]]), d / np.linalg.norm(d)


def hit_plane(prm, u, v, axis, value):
    """Intersect the ray through (u, v) with the plane <axis> = value (axis 0/1/2 = x/y/z)."""
    o, d = ray(prm, u, v)
    t = (value - o[axis]) / d[axis]
    return o + d * t


if __name__ == "__main__":
    main()
