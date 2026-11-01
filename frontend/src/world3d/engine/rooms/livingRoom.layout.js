// Read out of living-room.glb with the phase 1 parser (dev harness: capture.cjs layout, ROOM=living-room).
// Babylon world space. One fix against phase 1: the sofa2 collider angle sign (the old parser mirrored rotated boxes).
export default {
 "id": "living-room",
 "bounds": {
  "minX": -6.800296,
  "maxX": 0.000296,
  "minY": -0.000134,
  "maxY": 3.000134,
  "minZ": -6.6,
  "maxZ": 1.6
 },
 "colliders": [
  {
   "name": "sofa",
   "cx": -2.55,
   "cz": -5.95,
   "hx": 1.5,
   "hz": 0.490051,
   "angle": -3.141593
  },
  {
   "name": "sofa2",
   "cx": -4.75,
   "cz": -1.75,
   "hx": 1.05,
   "hz": 0.489927,
   "angle": 0.523599
  },
  {
   "name": "table",
   "cx": -3.15,
   "cz": -3.85,
   "hx": 0.675,
   "hz": 0.409981,
   "angle": -3.141593
  },
  {
   "name": "beanbag",
   "cx": -1.55,
   "cz": -1.75,
   "hx": 0.575,
   "hz": 0.575,
   "angle": -3.141593
  },
  {
   "name": "console",
   "cx": -6.56,
   "cz": -3.9,
   "hx": 0.250026,
   "hz": 1.15,
   "angle": -3.141593
  },
  {
   "name": "side",
   "cx": -6.5,
   "cz": -2.45,
   "hx": 0.224989,
   "hz": 0.224989,
   "angle": -3.141593
  },
  {
   "name": "plant_corner",
   "cx": -5.55,
   "cz": -6.1,
   "hx": 0.300027,
   "hz": 0.300027,
   "angle": -3.141593
  },
  {
   "name": "plant_left",
   "cx": -0.45,
   "cz": -4.75,
   "hx": 0.300027,
   "hz": 0.300027,
   "angle": -3.141593
  },
  {
   "name": "plant_front",
   "cx": -0.35,
   "cz": -0.2,
   "hx": 0.250038,
   "hz": 0.250038,
   "angle": -3.141593
  }
 ],
 "seats": [
  {
   "name": "SEAT_beanbag_0",
   "type": "beanbag",
   "pos": [
    -1.58,
    0,
    -1.72
   ],
   "yaw": -2.391474,
   "height": 0.44
  },
  {
   "name": "SEAT_sofa2_0",
   "type": "sofa",
   "pos": [
    -5.04074,
    0,
    -2.056423
   ],
   "yaw": 2.617994,
   "height": 0.47
  },
  {
   "name": "SEAT_sofa2_1",
   "type": "sofa",
   "pos": [
    -4.33926,
    0,
    -1.651423
   ],
   "yaw": 2.617994,
   "height": 0.47
  },
  {
   "name": "SEAT_sofa_0",
   "type": "sofa",
   "pos": [
    -1.71,
    0,
    -5.83
   ],
   "yaw": 0,
   "height": 0.47
  },
  {
   "name": "SEAT_sofa_1",
   "type": "sofa",
   "pos": [
    -2.55,
    0,
    -5.83
   ],
   "yaw": 0,
   "height": 0.47
  },
  {
   "name": "SEAT_sofa_2",
   "type": "sofa",
   "pos": [
    -3.39,
    0,
    -5.83
   ],
   "yaw": 0,
   "height": 0.47
  }
 ],
 "spawns": [
  [
   -2.4,
   0,
   -2.9
  ],
  [
   -3.9,
   0,
   -2.3
  ],
  [
   -1.9,
   0,
   -3.1
  ],
  [
   -4.5,
   0,
   -2.9
  ]
 ],
 "floors": [],
 "hero": {
  "pos": [
   -2.3,
   1.62,
   0.4
  ],
  "target": [
   -4.15,
   0.58,
   -5
  ],
  "fov": 1.211
 },
 "anchors": {}
};
