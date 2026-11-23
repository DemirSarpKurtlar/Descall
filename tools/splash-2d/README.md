# Splash 2D (3.7.34)

Source of the splash videos in `frontend/public/brand/splash/`, `frontend/electron/splash/` and the iOS
`SplashVideo-*` asset catalog entries. `flat2d.py` is the Konsept 2 splash animation (`v2.py` `s1v2`)
with the same springs, morph, ribbon unspool, dot and flatten timing, but no perspective tilt,
contact/drop shadow, emboss shading, refraction or specular highlight (flat 2D).

    python3 frames.py            # RGBA frames -> /workspace/splash-2d/frames/{oneshot,loop}
    # then encode: 1290x2796 60 fps mp4 on F4F4F6 (light) / 1E2029 (dark) for iOS,
    # 320x320 30 fps vp9 with alpha (webm) and 1E2029 mp4 for web + Electron.

Reduced motion is unchanged: web/Electron show the static tile, iOS shows the last (flat) frame.

## Web / Electron at high resolution (Nov 2026)

The 320 px web videos were the whole 1000 px canvas scaled down (tile = 44% of the frame), so the
web tile was ~72 CSS px and blurry. `web_hd.py` renders only the centre 600 source px (tile 440 px =
73.3% of the frame, the ratio `index.html` and `electron/splash.html` size the video by) on a finer
grid, natively at 720 px, with real alpha and edge colour bleed:

    python3 -I web_hd.py 720 /tmp/frames
    # loop: rotate so it starts at t = 3.2 s (the flat tile = the one-shot's last frame),
    # then frames 0..191: one-shot -> loop and loop -> loop are both seamless.
    mkdir /tmp/frames/loopr; j=0; for i in $(seq 192 263) $(seq 0 191); do
      ln -sf ../loop/$(printf %04d $i).png /tmp/frames/loopr/$(printf %04d $j).png; j=$((j+1)); done
    # WebM, VP9 + alpha (Chromium, Firefox, Electron)
    ffmpeg -framerate 60 -i /tmp/frames/<oneshot|loopr>/%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p \
      -crf 36 -b:v 0 -deadline good -cpu-used 1 -row-mt 1 -g 600 -an descall-splash-<oneshot|loop>.webm
    # MP4, H.264 on the web splash colour #1B1D26 (Safari / iOS browsers, clipped to the tile)
    ffmpeg -f lavfi -i color=c=0x1B1D26:s=720x720:r=60 -framerate 60 -i /tmp/frames/<...>/%04d.png \
      -filter_complex "[0][1]overlay=shortest=1,format=yuv420p" -c:v libx264 -profile:v high \
      -preset veryslow -tune animation -crf 20 -colorspace bt709 -color_primaries bt709 \
      -color_trc bt709 -color_range tv -movflags +faststart -an descall-splash-<...>.mp4

Copy the WebMs to both `frontend/public/brand/splash/` and `frontend/electron/splash/` (the Electron
selftest requires identical files). The iOS `SplashVideo-*` assets are not produced by this script.
