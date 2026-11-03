# Splash 2D (3.7.34)

Source of the splash videos in `frontend/public/brand/splash/`, `frontend/electron/splash/` and the iOS
`SplashVideo-*` asset catalog entries. `flat2d.py` is the Konsept 2 splash animation (`v2.py` `s1v2`)
with the same springs, morph, ribbon unspool, dot and flatten timing, but no perspective tilt,
contact/drop shadow, emboss shading, refraction or specular highlight (flat 2D).

    python3 frames.py            # RGBA frames -> /workspace/splash-2d/frames/{oneshot,loop}
    # then encode: 1290x2796 60 fps mp4 on F4F4F6 (light) / 1E2029 (dark) for iOS,
    # 320x320 30 fps vp9 with alpha (webm) and 1E2029 mp4 for web + Electron.

Reduced motion is unchanged: web/Electron show the static tile, iOS shows the last (flat) frame.
