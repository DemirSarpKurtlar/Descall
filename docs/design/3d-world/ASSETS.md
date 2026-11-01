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

The other three rooms, the robot dealer and the game pieces (phase 2 rooms):

```
python3 tools/world3d/fetch_assets.py
python3 tools/world3d/gen_room_textures.py     # own procedural art for the rooms (+ dev screen demo)
blender -b -P tools/world3d/build_cinema.py -- --bake --samples 32
blender -b -P tools/world3d/build_game_room.py -- --bake --samples 28
blender -b -P tools/world3d/build_camp.py -- --bake --samples 28
blender -b -P tools/world3d/build_robot_dealer.py -- --out frontend/public/world3d/robot-dealer.glb
blender -b -P tools/world3d/build_game_pieces.py -- --outdir frontend/public/world3d
node tools/world3d/optimize_glb.mjs frontend/public/world3d/{cinema,game-room,camp,robot-dealer,okey,cards,tavla,chess}.glb
```

Each room bake runs one Blender process per atlas group (resumable: `tools/world3d/out/bakes/<room>/`),
then assembles the GLB and writes `frontend/src/world3d/engine/rooms/<room>.layout.js`
(colliders, seats, spawn points, floors, hero camera, anchors). Cameras were fitted to the
drafts with `tools/world3d/solve_camera.py` (point correspondences, numpy).

## Shipped files

| File | What | Made from | License |
| --- | --- | --- | --- |
| `frontend/public/world3d/living-room.glb` | Living room ("Oturma odası"), geometry + baked lighting atlases (WebP) | `tools/world3d/build_living_room.py` (own modelling and lighting), the CC0 materials and plants below, own procedural textures | Descall (own work) + CC0 inputs |
| `frontend/public/world3d/avatar.glb` | Stylized avatar: meshes, 20 bone rig, 18 animation clips, face morphs, palette texture | `tools/world3d/build_character.py`, 100 % own work (no external meshes or motion data) | Descall (own work) |
| `frontend/public/world3d/cinema.glb` | Cinema ("Sinema"): tiered seats, stage, separate unbaked screen mesh (SCREEN_main), baked atlases + a baked "screen" light layer | `tools/world3d/build_cinema.py` (own modelling and lighting), CC0 materials and the CC0 plant below, own procedural textures | Descall (own work) + CC0 inputs |
| `frontend/public/world3d/game-room.glb` | Game room ("Oyun odası"): four game tables, chairs, bookcase, shelves, pendants, baked | `tools/world3d/build_game_room.py`, CC0 materials below, own box-cover art | Descall (own work) + CC0 inputs |
| `frontend/public/world3d/camp.glb` | Camp ("Kamp"): terrain, lake, pines, tents, log benches, fire ring; atlases + vertex-colour bakes + a baked "fire" light layer; sky, moon, aurora, lake as own emissive textures | `tools/world3d/build_camp.py`, CC0 materials below, own textures | Descall (own work) + CC0 inputs |
| `frontend/public/world3d/robot-dealer.glb` | Robot blackjack dealer: rig, morphs (blink, smile, think), clips idle / dealCard / flipCard / collectCards / wave / thinking | `tools/world3d/build_robot_dealer.py`, 100 % own work | Descall (own work) |
| `frontend/public/world3d/okey.glb`, `cards.glb`, `tavla.glb`, `chess.glb` | Game pieces: one okey tile mesh + face atlas (106-tile set), okey rack, one card mesh + atlas (52 faces, Descall card back, two score cards), tavla board / checkers / die, chess board + six lathed piece shapes | `tools/world3d/build_game_pieces.py`, atlases from `gen_room_textures.py` (Inter font) | Descall (own work); Inter: SIL OFL 1.1 |
| `dist/world3d/engine/*.js` (built) | Babylon.js runtime + world engine | `@babylonjs/core`, `@babylonjs/loaders` 9.33.1 | Apache-2.0 (Babylon.js), Descall code |

## External sources (all CC0 1.0)

| Asset | Source | Author | License | Used for |
| --- | --- | --- | --- | --- |
| Potted Plant 01 | https://polyhaven.com/a/potted_plant_01 | Rico Cilliers | CC0 1.0 (https://polyhaven.com/license) | Bushy plant at the front left |
| Potted Plant 04 | https://polyhaven.com/a/potted_plant_04 | James Ray Cock | CC0 1.0 | Small succulents on the TV console and the floor |
| WoodFloor051 | https://ambientcg.com/view?id=WoodFloor051 | ambientCG (Lennart Demes) | CC0 1.0 (https://docs.ambientcg.com/license/) | Floor planks (tinted, baked) |
| Fabric030 | https://ambientcg.com/view?id=Fabric030 | ambientCG | CC0 1.0 | Sofa and armchair fabric |
| Carpet016 | https://ambientcg.com/view?id=Carpet016 | ambientCG | CC0 1.0 | Shaggy rug |
| Wood049 | https://ambientcg.com/view?id=Wood049 | ambientCG | CC0 1.0 | TV console, side table |
| Plaster001 | https://ambientcg.com/view?id=Plaster001 | ambientCG | CC0 1.0 | Wall plaster |
| Carpet012 | https://ambientcg.com/view?id=Carpet012 | ambientCG | CC0 1.0 | Cinema carpet (detail only, recoloured), game room rug |
| Fabric023 | https://ambientcg.com/view?id=Fabric023 | ambientCG | CC0 1.0 | Cinema velvet seats and pouf, game table felt (detail only) |
| WoodFloor040 | https://ambientcg.com/view?id=WoodFloor040 | ambientCG | CC0 1.0 | Game room planks |
| Grass004 | https://ambientcg.com/view?id=Grass004 | ambientCG | CC0 1.0 | Camp ground |
| Bark014 | https://ambientcg.com/view?id=Bark014 | ambientCG | CC0 1.0 | Camp logs, benches, stump |
| Fabric030 (again) | see above | ambientCG | CC0 1.0 | Game room chair upholstery, camp tent canvas |
| Wood049 (again) | see above | ambientCG | CC0 1.0 | Cinema arm caps, game tables, bookcase, shelves |
| Potted Plant 01 (again) | see above | Rico Cilliers | CC0 1.0 | Cinema plant behind the last row |
| Inter | https://rsms.me/inter/ (npm `@fontsource/inter`) | Rasmus Andersson | SIL OFL 1.1 | Okey tile numbers, card indices, box-cover titles, screen standby text (rendered into textures; the font file is not shipped) |

`fetch_assets.py` writes a `LICENSE.json` next to every download with the source URL,
author and license as reported by the Poly Haven / ambientCG APIs at download time.

## Own procedural art

- Night skyline (two layers), abstract wall print, lava lamp wax: `tools/world3d/gen_textures.py` (Pillow, random seeds fixed).
- All furniture (L sofa + second sofa, bean bag, coffee table, TV + console with slatted doors, table lamp, globe lamp on its stand, lava lamp, fruit bowl, cup, books, framed print, curtains, window frame) and the two large banana-leaf plants (procedural leaves, stems and pots): `build_living_room.py`.
- Characters (round head with blush, glossy eyes, four-finger hands), hair styles (metaball swept locks, bun, long bob), outfits (hoodie, open zip jacket over a tee, puffer vest over a striped long-sleeve shirt, sweater), accessories (cap, round glasses, headphones, scarf, backpack, acoustic guitar), rig and every animation clip: `build_character.py`.

Rooms (phase 2), all drawn by `tools/world3d/gen_room_textures.py` (Pillow + numpy, fixed seeds):

- Cinema: ceiling tiles, wall panels, the screen's standby picture (the Descall mark cut out of
  `frontend/public/brand/descall-logo.png`). Dev only, not shipped: `frontend/src/world3d/dev/screen-demo.jpg`,
  an own flat illustration standing in for a shared screen in the evidence renders.
- Game room: 16 board-game box covers with made-up titles and 16 book / box spine colours; the okey
  tile atlas (numbers in Inter, false okey = the Descall mark in green); the card atlas (indices in Inter,
  suits drawn from primitives, own geometric court figures, the Descall card back, two dot "score cards"
  standing in for the draft's dotted cards: points only, no chips anywhere); tavla board, dice, chess board.
- Camp: night sky with stars, aurora ribbons, moon, lake with the moon's streak and ripples, flame card,
  log end grain.
- All room furniture, props, pines, grass, tents, fairy lights, the fire and the robot dealer: geometry
  written in the build scripts.

## Rules for later phases

- Only CC0 or own work. Before adding a file, add its row here (source URL, author, license) and to `fetch_assets.py`.
- quaternius.com packs are CC0 but must be checked file by file (licence text inside the download) before use.
- No Mixamo (raw file redistribution is not allowed), no Micup / Fluxer material of any kind.
