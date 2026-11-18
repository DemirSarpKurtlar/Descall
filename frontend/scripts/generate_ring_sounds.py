#!/usr/bin/env python3
"""
Generate the default call rings: public/sounds/outgoing-call.mp3 (ringback,
what the caller hears while the other side rings) and incoming-call.mp3.

Polish 3.9.x (calls-01): the old files were a 2.000 s slice of an echoing
chime, cut in the middle of the last echo and looped back to back, so every
cycle was chopped and restarted on its loudest note. Each file is now ONE
full ring cycle: the phrase with its whole decay, then a rest, ending in
digital silence. Looped (audioManager plays it as a gapless Web Audio loop)
it sounds like a real ring cadence: ring, pause, ring.

  python3 scripts/generate_ring_sounds.py      (needs numpy + ffmpeg)

The cycle lengths here must match RING_CYCLE_S in src/lib/ringLoop.js
(checked by src/lib/ringLoop.selftest.mjs).
"""

from __future__ import annotations

import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 48000
OUT = Path(__file__).resolve().parents[1] / "public" / "sounds"

# Same note palette as the old Descall chimes (Hz).
LOW, MID, HIGH, TOP = 500.0, 560.0, 740.0, 660.0


def bell(freq: float, dur: float, decay: float, gain: float = 1.0) -> np.ndarray:
    """Soft mallet bell: 6 ms attack, exponential decay, gentle overtones."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    env = np.exp(-t / decay)
    attack = np.minimum(1.0, t / 0.006)
    # Release the last 40 ms to exact zero (no click at the note end).
    rel_n = int(SR * 0.04)
    env[-rel_n:] *= np.linspace(1.0, 0.0, rel_n)
    tone = (
        np.sin(2 * np.pi * freq * t)
        + 0.22 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t / (decay * 0.5))
        + 0.07 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t / (decay * 0.3))
    )
    return gain * tone * env * attack


def place(buf: np.ndarray, sig: np.ndarray, at_s: float) -> None:
    i = int(SR * at_s)
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def normalize(buf: np.ndarray, peak_db: float) -> np.ndarray:
    peak = float(np.max(np.abs(buf))) or 1.0
    return buf * (10 ** (peak_db / 20) / peak)


def ringback() -> np.ndarray:
    """4.0 s cycle: a three-note rising chime (about 1.5 s with its decay), then rest."""
    cycle = np.zeros(int(SR * 4.0))
    place(cycle, bell(LOW, 0.9, 0.22), 0.00)
    place(cycle, bell(HIGH, 0.9, 0.22, 0.9), 0.16)
    place(cycle, bell(MID, 1.2, 0.30, 0.85), 0.34)
    # One soft echo of the phrase, finished well inside the cycle.
    echo = np.zeros_like(cycle)
    place(echo, bell(LOW, 0.7, 0.18, 0.25), 0.62)
    place(echo, bell(HIGH, 0.7, 0.18, 0.22), 0.78)
    place(echo, bell(MID, 0.8, 0.22, 0.2), 0.96)
    return normalize(cycle + echo, -4.0)


def ringtone() -> np.ndarray:
    """3.0 s cycle: the incoming four-note phrase twice (about 1.9 s), then rest."""
    cycle = np.zeros(int(SR * 3.0))
    notes = [(440.0, 0.00), (HIGH, 0.10), (580.0, 0.22), (TOP, 0.34)]
    for rep, gain in ((0.0, 1.0), (0.62, 0.8)):
        for freq, at in notes:
            place(cycle, bell(freq, 0.9, 0.2, gain), rep + at)
    return normalize(cycle, -2.0)


def write_mp3(samples: np.ndarray, path: Path) -> None:
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "ring.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "128k", str(path)],
            check=True,
        )


def main() -> None:
    for name, samples in (("outgoing-call.mp3", ringback()), ("incoming-call.mp3", ringtone())):
        tail = samples[-int(SR * 0.3):]
        assert np.max(np.abs(tail)) == 0.0, f"{name}: the cycle must end in silence"
        write_mp3(samples, OUT / name)
        print(f"wrote {OUT / name} ({len(samples) / SR:.2f} s)")


if __name__ == "__main__":
    main()
