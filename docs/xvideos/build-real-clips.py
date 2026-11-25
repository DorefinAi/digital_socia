"""Build src/features/xvideos/data/xClipsReal.json from the First India X video sample (21 Nov 2026).

Usage:
    python -I docs/xvideos/build-real-clips.py "<path to firstindia_videos_2026-11-21>"

Reads the folder's dataset.jsonl and transcripts/<post_id>.srt (both outside the repo) and writes one entry per post
to src/features/xvideos/data/xClipsReal.json, which the X Clips demo desk reads (src/features/xvideos/data/xVideosData.ts). The videos, frames and
contact sheets themselves are NOT written here: they are copied by hand into the gitignored
public/xvideos-demo/real/<post_id>.mp4 and public/xvideos-demo/real-frames/<post_id>_{first,mid,last,sheet}.jpg.

Transcripts are machine-made (Whisper) and capped at MAX_LINES lines per clip so the JSON stays small.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

MAX_LINES = 40
# Cues shorter than this (seconds or characters) are merged into the next one
SHORT_S = 2.5
SHORT_CHARS = 25
# A merged line never grows past this many characters
MAX_LINE_CHARS = 240

RAJASTHAN_BRAND = "#RajasthanWithFirstIndia"
INDIA_BRAND = "#FirstIndiaNews"
FIN_VIDEO = "#FINVideo"

# Places seen in the sample's titles and location tags; the last one named in the title's tail is the clip's place
KNOWN_PLACES = [
    "Jaipur", "Jodhpur", "Ajmer", "Alwar", "Kota", "Tonk", "Jhunjhunu", "Jhalawar", "Bansur", "Patna", "Vaishali",
    "Bihar", "Haryana", "Punjab", "Rajasthan",
]

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "features" / "xvideos" / "data" / "xClipsReal.json"

TIME = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)")
# "Bansur Cylinder Blast: …" / "Accident: …": an English topic prefix before a colon
PREFIX = re.compile(r"^([A-Za-z][A-Za-z ]{2,40}):\s")


def seconds(stamp: str) -> float:
    h, m, s, ms = (int(x) for x in TIME.match(stamp.strip()).groups())
    return h * 3600 + m * 60 + s + ms / 1000


def parse_srt(path: Path) -> list[dict]:
    """[{at, end, text}] from an SRT file"""
    cues = []
    for block in re.split(r"\r?\n\s*\r?\n", path.read_text(encoding="utf-8").strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        stamp = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if stamp is None:
            continue
        start, end = lines[stamp].split("-->")
        text = " ".join(lines[stamp + 1 :]).strip()
        if text:
            cues.append({"at": seconds(start), "end": seconds(end), "text": text})
    return cues


def merge(cues: list[dict], short_s: float, short_chars: int) -> list[dict]:
    out: list[dict] = []
    pending: dict | None = None
    for c in cues:
        if pending and len(pending["text"]) + len(c["text"]) >= MAX_LINE_CHARS:
            out.append(pending)
            pending = None
        if pending:
            c = {"at": pending["at"], "end": c["end"], "text": f"{pending['text']} {c['text']}"}
            pending = None
        short = (c["end"] - c["at"]) < short_s or len(c["text"]) < short_chars
        if short and len(c["text"]) < MAX_LINE_CHARS:
            pending = c
        else:
            out.append(c)
    if pending:
        if out and len(out[-1]["text"]) + len(pending["text"]) < MAX_LINE_CHARS:
            out[-1] = {"at": out[-1]["at"], "end": pending["end"], "text": f"{out[-1]['text']} {pending['text']}"}
        else:
            out.append(pending)
    return out


def transcript_lines(path: Path) -> list[dict]:
    if not path.exists():
        return []
    lines = merge(parse_srt(path), SHORT_S, SHORT_CHARS)
    # Long clips: merge harder (pairs of lines) until the list fits, then cap it
    for _ in range(4):
        if len(lines) <= MAX_LINES:
            break
        lines = merge(lines, 9.0, 140)
    return [{"at": round(l["at"], 1), "text": l["text"]} for l in lines[:MAX_LINES]]


def split_title(title: str) -> tuple[str, list[str]]:
    parts = [p.strip() for p in re.split(r"\s+[|।]\s+", title)]
    return parts[0], parts[1:]


def channel_label(tail: list[str]) -> str | None:
    """'Tonk News' / 'Jodhpur | Rajasthan News' / 'Rajasthan News', or None when the title ends otherwise"""
    if not tail or not tail[-1].endswith("News"):
        return None
    if tail[-1] == "Rajasthan News" and len(tail) >= 2:
        return f"{tail[-2]} | Rajasthan News"
    return tail[-1]


def place_of(tail: list[str], location_tag: str, region: str) -> str:
    named = [p for seg in tail for p in KNOWN_PLACES if re.search(rf"\b{p}\b", seg)]
    # The most specific: a city before "Rajasthan" ("Jodhpur | Rajasthan News" -> Jodhpur)
    for p in named:
        if p != "Rajasthan":
            return p
    if named:
        return named[0]
    tag = re.sub(r"\s+", " ", location_tag or "").strip()
    for p in KNOWN_PLACES:
        if re.search(rf"\b{p}\b", tag):
            return p
    return "Rajasthan" if region == "rajasthan" else "India"


def build(folder: Path) -> list[dict]:
    rows = [json.loads(l) for l in (folder / "dataset.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    rows.sort(key=lambda r: (r["posted_ist"], r["post_id"]))
    out = []
    for r in rows:
        pid = r["post_id"]
        tags = r["hashtags"].split()
        region = "india" if INDIA_BRAND in tags else "rajasthan"
        _, tail = split_title(r["title"])
        prefix = PREFIX.match(r["title"])
        dur = float(r["duration_s"])
        out.append(
            {
                "id": pid,
                "fileName": f"{pid}.mp4",
                "src": f"/xvideos-demo/real/{pid}.mp4",
                "poster": f"/xvideos-demo/real-frames/{pid}_mid.jpg",
                "sheet": f"/xvideos-demo/real-frames/{pid}_sheet.jpg",
                "durationS": round(dur, 2),
                "sizeMb": r["size_mb"],
                "width": r["width"],
                "height": r["height"],
                "orientation": r["orientation"],
                "postedIst": r["posted_ist"],
                "place": place_of(tail, r.get("location_tag", ""), region),
                "region": region,
                "brandTag": INDIA_BRAND if region == "india" else RAJASTHAN_BRAND,
                "channelLabel": channel_label(tail),
                "prefix": f"{prefix.group(1)}:" if prefix else None,
                "postedTitle": r["title"],
                "postedCaption": re.sub(r"\s*https://t\.co/\S+\s*$", "", r["caption"]).strip(),
                "hashtags": tags,
                "mentions": r["mentions"].split(),
                "postUrl": r["post_url"],
                "views": r["views"],
                "likes": r["likes"],
                "cutTimes": [round(t, 1) for t in r.get("cut_times_s", [])],
                "speechRatio": r.get("speech_ratio"),
                "transcript": transcript_lines(folder / "transcripts" / f"{pid}.srt"),
                # What the frame grabs show; the text on them is read in the backend phase (OCR)
                "frames": [
                    {"where": "first", "at": 0.5, "src": f"/xvideos-demo/real-frames/{pid}_first.jpg", "text": ""},
                    {"where": "mid", "at": round(dur / 2, 1), "src": f"/xvideos-demo/real-frames/{pid}_mid.jpg", "text": ""},
                    {"where": "last", "at": round(max(dur - 1, 0), 1), "src": f"/xvideos-demo/real-frames/{pid}_last.jpg", "text": ""},
                ],
            }
        )
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    clips = build(Path(sys.argv[1]))
    OUT.write_text(json.dumps(clips, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    lines = sum(len(c["transcript"]) for c in clips)
    print(f"{len(clips)} clips, {lines} transcript lines -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
