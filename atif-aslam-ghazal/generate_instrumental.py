#!/usr/bin/env python3
"""Soft instrumental preview for 'Teri Yaad Ke Saaye' — ghazal ballad mood."""

import math
import wave
import struct
from pathlib import Path

import numpy as np

SR = 44100
BPM = 68
BEAT = 60.0 / BPM


def env(n, attack=0.05, release=0.25):
    e = np.ones(n, dtype=np.float64)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    if a < n:
        e[:a] = np.linspace(0, 1, a)
    else:
        e[:] = np.linspace(0, 1, n)
        return e
    if r < n:
        e[-r:] = np.linspace(1, 0, r)
    return e


def tone(freq, dur, vol=0.2, attack=0.05, release=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # soft piano-ish: fundamental + quiet harmonics
    wave_ = (
        1.0 * np.sin(2 * math.pi * freq * t)
        + 0.35 * np.sin(2 * math.pi * freq * 2 * t)
        + 0.15 * np.sin(2 * math.pi * freq * 3 * t)
        + 0.08 * np.sin(2 * math.pi * freq * 4 * t)
    )
    # gentle vibrato
    vib = 1 + 0.004 * np.sin(2 * math.pi * 5.2 * t)
    wave_ *= vib
    return (wave_ * env(n, attack, release) * vol).astype(np.float64)


def drone(freq, dur, vol=0.06):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tanpura-like: root + fifth + octave shimmer
    wave_ = (
        np.sin(2 * math.pi * freq * t)
        + 0.5 * np.sin(2 * math.pi * freq * 1.5 * t)
        + 0.35 * np.sin(2 * math.pi * freq * 2 * t)
        + 0.12 * np.sin(2 * math.pi * (freq * 2.01) * t)
    )
    fade = env(n, attack=1.5, release=2.0)
    return (wave_ * fade * vol).astype(np.float64)


# A natural minor / soft Yaman-ish scale (A3 base)
A3 = 220.0
notes = {
    "A": A3,
    "B": A3 * 9 / 8,
    "C": A3 * 6 / 5,
    "D": A3 * 4 / 3,
    "E": A3 * 3 / 2,
    "F": A3 * 8 / 5,
    "G": A3 * 9 / 5,
    "A4": A3 * 2,
    "B4": A3 * 2 * 9 / 8,
    "C4": A3 * 2 * 6 / 5,
    "E4": A3 * 2 * 3 / 2,
    "rest": 0.0,
}

# Melody phrases suggesting the matla mood (slow, longing)
# each: (note, beats, volume)
phrases = [
    # phrase 1 — "Dil mein chhupi..."
    [("E", 1.5, 0.18), ("F", 0.5, 0.16), ("G", 1.0, 0.17), ("A4", 2.0, 0.20),
     ("G", 1.0, 0.16), ("F", 1.0, 0.15), ("E", 2.0, 0.18)],
    # phrase 2
    [("D", 1.0, 0.16), ("E", 1.0, 0.17), ("F", 1.5, 0.18), ("E", 0.5, 0.15),
     ("D", 1.0, 0.15), ("C", 1.0, 0.14), ("B", 1.0, 0.13), ("A", 2.0, 0.16)],
    # phrase 3 — higher, emotional
    [("A4", 1.5, 0.20), ("B4", 0.5, 0.18), ("C4", 2.0, 0.22),
     ("B4", 1.0, 0.18), ("A4", 1.0, 0.17), ("G", 2.0, 0.16)],
    # phrase 4 — resolve
    [("E", 1.0, 0.16), ("F", 1.0, 0.15), ("E", 1.0, 0.15), ("D", 1.0, 0.14),
     ("C", 1.5, 0.13), ("B", 0.5, 0.12), ("A", 3.0, 0.15)],
]

parts = []
# intro drone alone
intro_len = 4 * BEAT
parts.append(drone(A3, intro_len + 2, vol=0.07))

cursor = intro_len
melody_tracks = []
total_beats = 4  # intro

for phrase in phrases:
    # small breath between phrases
    cursor += 0.5 * BEAT
    total_beats += 0.5
    for name, beats, vol in phrase:
        dur = beats * BEAT
        total_beats += beats
        if name == "rest" or notes[name] == 0:
            cursor += dur
            continue
        # octave down soft harmony
        mel = tone(notes[name], dur, vol=vol, attack=0.03, release=min(0.4, dur * 0.35))
        harm = tone(notes[name] / 2, dur, vol=vol * 0.35, attack=0.05, release=min(0.5, dur * 0.4))
        melody_tracks.append((cursor, mel + harm))
        cursor += dur

# pad under whole piece
total_dur = cursor + 3.0
pad = drone(A3, total_dur, vol=0.055)
pad += drone(A3 * 1.5, total_dur, vol=0.025)

mix = pad.copy()
# place intro silence already in pad; add melody
for start, clip in melody_tracks:
    i0 = int(start * SR)
    i1 = i0 + len(clip)
    if i1 > len(mix):
        mix = np.pad(mix, (0, i1 - len(mix)))
    mix[i0:i1] += clip[: len(mix) - i0]

# soft reverb-ish tail via decaying echoes
echo = np.zeros_like(mix)
delay = int(0.28 * SR)
atten = 0.28
for k in range(1, 5):
    d = delay * k
    if d < len(mix):
        echo[d:] += mix[:-d] * (atten ** k)
mix = mix + echo

# normalize
peak = np.max(np.abs(mix)) or 1.0
mix = mix / peak * 0.85

out_dir = Path(__file__).resolve().parent
out_path = out_dir / "Teri_Yaad_Ke_Saaye_instrumental.wav"
artifact = Path("/opt/cursor/artifacts/Teri_Yaad_Ke_Saaye_instrumental.wav")

def write_wav(path: Path, data: np.ndarray):
    pcm = np.clip(data, -1, 1)
    pcm_i16 = (pcm * 32767).astype(np.int16)
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm_i16.tobytes())

write_wav(out_path, mix)
write_wav(artifact, mix)
print(f"Wrote {out_path} ({len(mix)/SR:.1f}s)")
print(f"Wrote {artifact}")
