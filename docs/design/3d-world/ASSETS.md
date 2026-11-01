# 3D world: asset sources and licenses

Every file shipped in `frontend/public/world3d/` is either Descall's own work or built
from CC0 (public domain) sources. Nothing comes from Micup / Fluxer (AGPL), Mixamo,
Sketchfab, paid stores or any asset with attribution or share-alike terms.

Rebuild everything from the repository:

```
python3 tools/world3d/fetch_assets.py          # downloads the CC0 sources below into tools/world3d/.cache/
python3 tools/world3d/gen_textures.py          # own procedural textures (skyline, wall print, lava lamp)
blender -b -P tools/world3d/build_living_room.py -- --bake --samples 48 --out frontend/public/world3d/living-room.glb
blender -b -P tools/world3d/build_character.py -- --out frontend/public/world3d/avatar.glb
(cd tools/world3d && npm ci) && node tools/world3d/optimize_glb.mjs frontend/public/world3d/*.glb
```

Blender 4.0.2 (Ubuntu package) with Cycles on the CPU was used for phase 1.

## Shipped files

| File | What | Made from | License |
| --- | --- | --- | --- |
| `frontend/public/world3d/living-room.glb` | Living room ("Oturma odası"), geometry + baked lighting atlases (WebP) | `tools/world3d/build_living_room.py` (own modelling and lighting), the CC0 materials and plants below, own procedural textures | Descall (own work) + CC0 inputs |
| `frontend/public/world3d/avatar.glb` | Stylized avatar: meshes, 20 bone rig, 16 animation clips, face morphs, palette texture | `tools/world3d/build_character.py`, 100 % own work (no external meshes or motion data) | Descall (own work) |
| `dist/world3d/engine/*.js` (built) | Babylon.js runtime + world engine | `@babylonjs/core`, `@babylonjs/loaders` 9.33.1 | Apache-2.0 (Babylon.js), Descall code |

## External sources (all CC0 1.0)

| Asset | Source | Author | License | Used for |
| --- | --- | --- | --- | --- |
| Potted Plant 02 | https://polyhaven.com/a/potted_plant_02 | Rico Cilliers | CC0 1.0 (https://polyhaven.com/license) | Large plants in the window corner and on the left (decimated, pot recoloured, lighting baked) |
| Potted Plant 01 | https://polyhaven.com/a/potted_plant_01 | Rico Cilliers | CC0 1.0 | Bushy plant at the front left |
| Potted Plant 04 | https://polyhaven.com/a/potted_plant_04 | James Ray Cock | CC0 1.0 | Small succulents on the TV console and the floor |
| WoodFloor051 | https://ambientcg.com/view?id=WoodFloor051 | ambientCG (Lennart Demes) | CC0 1.0 (https://docs.ambientcg.com/license/) | Floor planks (tinted, baked) |
| Fabric030 | https://ambientcg.com/view?id=Fabric030 | ambientCG | CC0 1.0 | Sofa and armchair fabric |
| Carpet016 | https://ambientcg.com/view?id=Carpet016 | ambientCG | CC0 1.0 | Shaggy rug |
| Wood049 | https://ambientcg.com/view?id=Wood049 | ambientCG | CC0 1.0 | TV console, side table |
| Plaster001 | https://ambientcg.com/view?id=Plaster001 | ambientCG | CC0 1.0 | Wall plaster |

`fetch_assets.py` writes a `LICENSE.json` next to every download with the source URL,
author and license as reported by the Poly Haven / ambientCG APIs at download time.

## Own procedural art

- Night skyline (two layers), abstract wall print, lava lamp wax: `tools/world3d/gen_textures.py` (Pillow, random seeds fixed).
- All furniture (L sofa + second sofa, bean bag, coffee table, TV + console with slatted doors, lamps, globe lamp, lava lamp, fruit bowl, cup, books, curtains, window frame): primitives and bevels in `build_living_room.py`.
- Characters, hair styles (metaballs), outfits (hoodie, zip jacket), accessories (cap, glasses, headphones), rig and every animation clip: `build_character.py`.

## Rules for later phases

- Only CC0 or own work. Before adding a file, add its row here (source URL, author, license) and to `fetch_assets.py`.
- quaternius.com packs are CC0 but must be checked file by file (licence text inside the download) before use.
- No Mixamo (raw file redistribution is not allowed), no Micup / Fluxer material of any kind.
