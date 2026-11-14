"""Trim TTS voiceover lines to the words actually spoken.

Chatterbox sometimes repeats a short line ("Lobide tabi, lobide tabi") or adds a tail
of babble after the sentence. faster-whisper (MIT) transcribes each line with word
timestamps; the clip is cut from the first word to the end of the script's word count
(+180 ms), faded and loudness-normalised (-16 LUFS). Writes the trimmed WAVs, a
lines.json with the new durations and transcript.txt to check by eye.
Usage: python voiceover_trim.py <tts_out_dir> <clean_out_dir>
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
model = WhisperModel("small", device="cpu", compute_type="int8")


def pcm16k(path):
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


lines = json.loads((src / "lines.json").read_text(encoding="utf-8"))
result, report = [], []
for line in lines:
    wav = src / line["file"]
    segments, _ = model.transcribe(pcm16k(wav), language="tr", beam_size=5, word_timestamps=True)
    words = [w for s in segments for w in s.words]
    if not words:
        raise SystemExit(f"{line['file']}: no speech recognised")
    n = len(line["text"].split())
    keep = words[:n] if len(words) > n + 1 else words
    start = max(0.0, keep[0].start - 0.08)
    dur = keep[-1].end + 0.18 - start
    subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-loglevel", "error", "-i", str(wav), "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
         "-af", f"afade=t=in:d=0.03,afade=t=out:st={max(0.0, dur - 0.08):.3f}:d=0.08,loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", "48000", str(out / line["file"])],
        check=True,
    )
    heard = "".join(w.word for w in keep).strip()
    result.append({**line, "seconds": round(dur, 2), "heard": heard})
    report.append(f"{line['file']}  {dur:.2f}s\n  script: {line['text']}\n  heard:  {heard}")
    print(report[-1], flush=True)
(out / "lines.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
(out / "transcript.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
