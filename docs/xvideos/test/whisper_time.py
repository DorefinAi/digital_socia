"""Step 5 of the clip test (BACKEND-PLAN.md §8): Hindi speech to text on a folder of clips, timed on the GPU.

Usage:
    python -I docs/xvideos/test/whisper_time.py <clips dir> <out dir> [model]

Writes <out dir>/<clip id>.json (segments with times) and <out dir>/whisper_times.json (per clip: video length,
time to load, time to transcribe, speed). The model is loaded once; the first clip is also run twice so the warm-up
cost is reported apart from the steady speed.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from faster_whisper import BatchedInferencePipeline, WhisperModel


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def audio(path: Path) -> np.ndarray:
    """16 kHz mono float audio through ffmpeg (the installed PyAV does not match faster-whisper's decoder)"""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        capture_output=True, check=True,
    )
    return np.frombuffer(out.stdout, dtype=np.float32)


def transcribe(model: BatchedInferencePipeline, path: Path) -> tuple[list[dict], float]:
    """Timed from the file, so the audio decode counts too.

    Batched, in 8 s chunks: Hindi in Devanagari costs many tokens, so one-at-a-time decoding left the GPU half idle
    (112 s for a 3 min 16 s clip), and 30 s batched chunks ran past Whisper's token cap and dropped ~40% of the words.
    8 s chunks keep every word and took 5.8 s for the same clip (24 Nov 2026, RTX 4090).
    """
    t0 = time.perf_counter()
    segments, _info = model.transcribe(audio(path), language="hi", batch_size=16, beam_size=1, chunk_length=8)
    rows = [{"at": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segments]
    return rows, time.perf_counter() - t0


def main() -> None:
    clips_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    model_name = sys.argv[3] if len(sys.argv) > 3 else "large-v3"
    out_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()
    model = BatchedInferencePipeline(model=WhisperModel(model_name, device="cuda", compute_type="float16"))
    load_s = time.perf_counter() - t0
    print(f"model {model_name} loaded in {load_s:.1f} s", flush=True)

    clips = sorted(clips_dir.glob("*.mp4"))
    if not clips:
        sys.exit(f"no .mp4 files in {clips_dir}")
    _, warm_s = transcribe(model, clips[0])
    print(f"warm-up run on {clips[0].name}: {warm_s:.1f} s", flush=True)

    results = []
    for clip in clips:
        length = duration(clip)
        if length < 1:
            print(f"{clip.stem}  skipped: {length:.2f} s of video", flush=True)
            continue
        rows, took = transcribe(model, clip)
        (out_dir / f"{clip.stem}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        results.append({"id": clip.stem, "video_s": round(length, 1), "took_s": round(took, 2),
                        "speed_x": round(length / took, 1), "lines": len(rows)})
        print(f"{clip.stem}  {length:6.1f} s video  {took:5.1f} s  {length / took:5.1f}x  {len(rows)} lines", flush=True)

    total_video = sum(r["video_s"] for r in results)
    total_took = sum(r["took_s"] for r in results)
    summary = {"model": model_name, "load_s": round(load_s, 1), "warmup_s": round(warm_s, 1),
               "clips": len(results), "video_s": round(total_video, 1), "took_s": round(total_took, 1),
               "speed_x": round(total_video / total_took, 1),
               "slowest_per_2min_s": round(max(r["took_s"] / r["video_s"] * 120 for r in results), 1),
               "per_clip": results}
    (out_dir / "whisper_times.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "per_clip"}), flush=True)


if __name__ == "__main__":
    main()
