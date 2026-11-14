"""Turkish voiceover lines with Chatterbox Multilingual (Resemble AI, MIT licence).

Reads one line per row from the script file, synthesises each line as its own WAV
(line_01.wav, ...) so a video edit can time captions exactly, and writes
lines.json with each line's text and duration. Uses the model's built-in default
voice (shipped with the MIT-licensed weights); no voice cloning.
Usage: python tts_chatterbox.py <script.txt> <out_dir>
"""
import json
import sys
from pathlib import Path

import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
lines = [l.strip() for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]

model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
meta = []
for i, text in enumerate(lines, 1):
    wav = model.generate(text, language_id="tr", exaggeration=0.65, cfg_weight=0.4, temperature=0.8)
    path = out / f"line_{i:02d}.wav"
    ta.save(str(path), wav, model.sr)
    meta.append({"i": i, "text": text, "file": path.name, "seconds": round(wav.shape[-1] / model.sr, 3)})
    print(f"{path.name}: {meta[-1]['seconds']}s  {text}", flush=True)
(out / "lines.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
