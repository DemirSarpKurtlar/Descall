#!/usr/bin/env python3
"""Download the CC0 source assets used by the 3D world build scripts.

Everything listed here is CC0 (public domain): Poly Haven models and ambientCG
textures. The list must stay in sync with docs/design/3d-world/ASSETS.md.
Files land in tools/world3d/.cache/ (git ignored); the build scripts read them
from there. Run: python3 tools/world3d/fetch_assets.py
"""
import io
import json
import os
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")

POLYHAVEN_MODELS = [
    # (asset id, resolution) -> glTF + textures
    ("potted_plant_04", "1k"),  # small succulent on the TV console
    ("potted_plant_01", "1k"),  # bushy plant next to the side table
]

AMBIENTCG_TEXTURES = [
    "WoodFloor051",  # floor planks
    "Fabric030",     # sofa / armchair fabric
    "Carpet016",     # shaggy rug
    "Wood049",       # light wood for the TV console and side table
    "Plaster001",    # wall plaster
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "descall-world3d-build/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def polyhaven(asset, res):
    out = os.path.join(CACHE, "polyhaven", asset)
    os.makedirs(out, exist_ok=True)
    info = json.loads(fetch(f"https://api.polyhaven.com/info/{asset}"))
    files = json.loads(fetch(f"https://api.polyhaven.com/files/{asset}"))
    g = files["gltf"][res]["gltf"]
    target = os.path.join(out, os.path.basename(g["url"]))
    if not os.path.exists(target):
        with open(target, "wb") as f:
            f.write(fetch(g["url"]))
        for rel, meta in g["include"].items():
            p = os.path.join(out, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "wb") as f:
                f.write(fetch(meta["url"]))
    with open(os.path.join(out, "LICENSE.json"), "w") as f:
        json.dump({
            "source": f"https://polyhaven.com/a/{asset}",
            "license": "CC0 1.0 (https://polyhaven.com/license)",
            "authors": info.get("authors"),
            "name": info.get("name"),
        }, f, indent=2)
    print("polyhaven", asset, "ok")


def ambientcg(asset):
    out = os.path.join(CACHE, "ambientcg", asset)
    if os.path.isdir(out) and os.listdir(out):
        print("ambientcg", asset, "cached")
        return
    os.makedirs(out, exist_ok=True)
    data = fetch(f"https://ambientcg.com/get?file={asset}_1K-JPG.zip")
    keep = ("_Color", "_NormalGL", "_Roughness", "_AmbientOcclusion")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            if name.lower().endswith((".jpg", ".png")) and any(k in name for k in keep):
                with open(os.path.join(out, os.path.basename(name)), "wb") as f:
                    f.write(z.read(name))
    with open(os.path.join(out, "LICENSE.json"), "w") as f:
        json.dump({
            "source": f"https://ambientcg.com/view?id={asset}",
            "license": "CC0 1.0 (https://docs.ambientcg.com/license/)",
        }, f, indent=2)
    print("ambientcg", asset, "ok")


def main():
    os.makedirs(CACHE, exist_ok=True)
    for asset, res in POLYHAVEN_MODELS:
        polyhaven(asset, res)
    for asset in AMBIENTCG_TEXTURES:
        ambientcg(asset)


if __name__ == "__main__":
    sys.exit(main())
