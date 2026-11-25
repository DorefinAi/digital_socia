# X Clips: backend plan (to build later)

Status: **plan only, nothing is built.** The frontend (`/ai-content/x-videos`, behind `NEXT_PUBLIC_XVIDEOS`) runs on mock data in
`src/data/xVideosData.ts`. This file is the contract the backend has to meet so that the mock can be swapped for the API without changing
the UI. How a post is built, and why, is in CONTENT-ANALYSIS.md.

Ground rule: the live desk (fin.sociaai.in, `frontend` on main, port 3006) and its API are never slowed down or changed by this work.

---

## 0. Where the clips come from (checked 24 Nov 2026)

The desk's video exports land on the office share, one folder per day and a shift folder inside it:

```
\\10.1.1.20\fin_data\EXPORT FOR YOUTUBE\2026\NOVEMBER 2026\
  23-11-2026\
    Convert Morning\   Convert 11 am to\   Convert 3 pm to\   Convert PHH\   Unconvert lk soni\
```

- Readable from this machine without a login. **The backend only reads it.** The desk renames files by hand, so nothing may write,
  move or rename there.
- **The desk already marks X clips in the file name:** `x...` (any number of dots, upper or lower case) = picked for X, `x...done...` =
  posted on X. 122 of 503 videos over 21–23 Nov were marked. The watcher takes only `x...` files that are not `done`.
- Names and folders are not consistent: the shift folder names change every day ("Convert morning to-------", "3 pm convert",
  "Convert 3 pm to--", "convert morning"), and a file is the full YouTube title, a place ("jodhpur(0).mp4") or a nickname ("cs.mp4").
  So the desk shows the clips as the share's own folder tree, and the backend sends the path as it is (`folder`, `shareName` in §4),
  never a cleaned-up guess.
- The name changes when the desk marks a clip posted (`x...` → `x...done...`), so a clip is known by its folder, size and modified
  time, not by its name. A rename updates the row; it is not a new clip.
- Files: `.mp4` news clips (489 in 3 days, 3 MB–1.5 GB, typically 48 MB; X-marked ones typically 26 MB, at most 330 MB), `.mpg` show
  masters (14, up to 38 GB; skip), and editor side files `.ese2` / `.ewc2`, `.png` thumbnails, `.txt` captions (skip).
- A file is still being written while its size changes; wait until it holds still (two checks a few seconds apart) before reading.
  0-byte files are skipped. A `.mp4` over 512 MB (about 1 in 25) is over X's upload limit and needs a trim or re-encode before posting.

---

## 1. Pieces

```
clips folder ──► worker: clip watcher ──► GPU media service ──► composer ──► Postgres ◄──► API ◄──► X Clips desk ──► X
                 (apps/worker)            (Python, 4090)        (packages/core)                     (frontend)      by hand now,
                                          speech + screen text                                                        API later
                                                                    ▲                                    │
                                                                    └──────── learn on post ─────────────┘
```

| Piece | Lives in | New or reused | Job |
|---|---|---|---|
| Clip watcher | `apps/worker` | Extends `providers/footage.ts` | Watches the share (§0) for new `x...` files, probes them (duration, size, shape), makes a draft row in state `reading`, queues it |
| GPU media service | New, Python, on this machine | New | Speech to text (faster-whisper, already installed) and reading the screen layers from frames |
| Composer | `packages/core/src/clips/` | New, reuses the breaking rules | Turns speech + screen text into headline, suffix, hashtags, mentions |
| Places / handles / tags | `packages/core/src/breaking/` | **Reused as is** | `places.ts`, `handles.ts`, `post-tags.ts` (video format B, `#FINVideo`), `learn.ts` |
| Storage | `packages/db` | New tables | Drafts, screen lines, transcript |
| API | `apps/api` | New routes | What the desk reads and writes (§4) |
| Desk | `frontend` | **Built** (mock) | Already done on branch `xvideos` |

---

## 2. Steps for one clip

| # | Step | Input → output | Notes |
|---|---|---|---|
| 1 | Probe | file → duration, size, width/height, orientation | ffprobe. Instant. |
| 2 | Scene cuts | file → cut times, first story frame | Skip the studio-anchor opening. Already done for the 26 in the dataset. |
| 3 | Frames | file → 1 frame every 2 s (the headline bar rotates every ~10 s) | Only the story part |
| 4 | Screen text | frames → text of each layer, deduplicated, with the time it was first seen | Layers: **headline bar, BREAKING box, place slug, name strip, reporter card**. The footer and watermark are masked out. Fixed screen areas for TV cuts. |
| 5 | Speech | audio → Hindi transcript with times | faster-whisper on the GPU, `language="hi"`, VAD on |
| 6 | Lead line | bar lines + first 30 s of speech → which bar line is the lead | The line the anchor reads first (CONTENT-ANALYSIS §2.3) |
| 7 | Compose | everything → suggested post | §3 |
| 8 | Save | → draft in state `new` | Shows on the desk |

Vertical / digital clips (no bar, no slug): steps 4 and 6 give nothing, and the headline comes from speech alone. The desk already marks
these.

---

## 3. Composer rules

| Part | Rule | Emit or suggest |
|---|---|---|
| Place | Place slug → `PlaceBook` (Hindi→English, districts and towns). Outside Rajasthan → the state, except a big city (Patna). | Emit when the slug is read. Suggest when it comes only from speech. |
| Suffix | `\| <City> News` (default, owner can switch to `\| <City> \| Rajasthan News`), `\| <State> News`, `\| Rajasthan News` | Emit |
| Headline | Way B by default: lead bar line + `, ` + the next bar line that adds a fact. Way C when a name strip is on screen. Names in English. | **Suggest**. The editor edits. |
| Topic prefix | Only if the desk has used it on this story before (`Bansur Cylinder Blast:`) | Suggest |
| Brand tag | Rajasthan place → `#RajasthanWithFirstIndia`, else `#FirstIndiaNews` | Emit |
| `#FINVideo` | Always, second | Emit |
| Place tag | `#<City>` / `#<City>News` (`post-tags.ts`) | Emit |
| `#RajasthanNews` | Rajasthan stories | Suggest (13/26) |
| People / event / beat tags | Name strip and the hashtag library (`learn.ts` rules) | Suggest |
| Mentions | `handles.ts`: crime → district police only, politics → leader + party, reporter card → reporter last | Police: emit. Others: suggest. |

A repeat of an ongoing story (same place + same key words within 24 h) starts from the last posted clip's tags.

---

## 4. API contract (what the frontend needs)

All under the existing API auth. The shapes follow `XvClip` in `src/data/xVideosData.ts`. Field names stay the same so the mock swap is
a fetch change only.

| Method and path | Does | Returns |
|---|---|---|
| `GET /clips?status=new\|posted\|rejected&since=` | The list | `XvClip[]` (without the full transcript) |
| `GET /clips/:id` | One clip, everything | `XvClip` |
| `GET /clips/:id/file` | The video (range requests) | mp4 |
| `PATCH /clips/:id` | Save the editor's draft (headline, tags on/off, typed tags, mentions, trim) | `XvClip` |
| `POST /clips/:id/hold` · `DELETE /clips/:id/hold` | "Rohit is editing" lock, expires after 10 min | `{heldBy, until}` |
| `POST /clips/:id/posted` `{text, postUrl?}` | Copy & Mark Posted. Starts the 5-minute undo. Triggers learning **after** the 5 minutes. | `XvClip` |
| `POST /clips/:id/undo` | Undo within 5 min | `XvClip` |
| `POST /clips/:id/reject` `{reason}` · `POST /clips/:id/restore` | Reject / restore | `XvClip` |
| `GET /clips/events` (SSE) | Reading progress, new clips, holds by others | events |

Fields the backend fills, by frontend name:

| `XvClip` field | Filled from |
|---|---|
| `fileName, src, poster, duration, size, width, height, kind, receivedAt` | Steps 1–2 |
| `folder` (path parts under the month folder: `["23-11-2026", "Convert 3 pm to"]`), `shareName` (the name on the share, X mark included) | The watcher, as found on the share (§0) |
| `readingProgress` | Steps 3–5 (0–100 while `reading`) |
| `transcript[]` (`at, text, highlight?, worth?`) | Step 5. `highlight` = the lead line's words. |
| `screenText[]` (`at, text, box, kind`) | Step 4. `kind` needs **two more values**: `slug`, `name` (see §7). |
| `frames[]`, `contactSheet`, `cutTimes` | Steps 2–3 |
| `district, region, channelLabel, prefixes` | Composer: place, brand |
| `suggestedHeadline` | Composer |
| `hashtags[]`, `mentions[]` (`value, on`) | Composer. `on` = emit, off = suggest. |
| `status, heldBy, postedAt, postedText, rejectedReason` | Desk actions |

---

## 5. Tables (outline)

- `clip` — share folder and name (as found, updated on rename), size and modified time (its identity), probe data, status (`reading`, `new`, `posted`, `rejected`, `failed`), timestamps, `held_by`, `held_until`.
- `clip_screen_line` — clip, layer (`bar`, `breaking`, `slug`, `name`, `reporter`), text, first seen at, last seen at, box.
- `clip_transcript_line` — clip, at, text.
- `clip_draft` — clip, headline, suffix, tags (value, on, source), mentions, trim, edited by, edited at.
- `clip_post` — clip, posted text, posted by, posted at, X url, undone at.

Learning writes into the **existing** hashtag and handle library, so the breaking desk and the video desk learn from each other.

---

## 6. Load and isolation

| Item | Plan |
|---|---|
| Volume | Measured on the 26 clips: about **10 clips an hour**, 67 min of video over 2 h 40 min |
| Where the heavy work runs | The GPU media service only. One clip at a time, a second one when the queue is long. Low process priority. |
| Speed | Speech **measured** (24 Nov 2026, §9): 5.8 s for a 3 min 16 s clip in 8 s chunks, so about 4 s for a 2-min clip. Screen text and headline are estimates, about 30–55 s more. Target: under 1 min for a 2-min clip. |
| GPU memory | RTX 4090, 23 GB. Whisper about 4 GB + Qwen2.5-VL 7B about 7 GB. A third model (Qwen3 14B, about 10 GB) does not fit beside them with room to spare, so the vision model also writes the headline. |
| Live desk | Separate process and queue. The API only reads and writes rows. A backlog makes clips wait in `reading`; it never slows the desk. |
| Failure | A clip that fails goes to `failed` with the reason and shows on the desk with an empty draft. The editor can still post it by hand. |
| Posting | Copy & Mark Posted is one row write. The editor uploads the video on X. A later step uploads the video through the X API (chunked upload, network-bound, not compute). |

---

## 7. Frontend changes when the backend lands

Small. The UI stays as built:

1. `xVideosData.ts` mock → `fetch` from §4. Same type.
2. `XvScreenText.kind`: add `slug` (place) and `name` (name strip / reporter). The desk has no On screen tab any more (removed 24 Nov
   2026): screen text feeds the composer (place, names, the suggested headline) without being shown as its own list.
3. The place chip shows where the place came from (slug or speech).
4. Live reading progress through SSE instead of the fixed "Reading 45%".
5. The Clips panel tree is already built on `folder` + `shareName`; the demo fills them with made-up folders and names in the share's
   style.

---

## 8. Before building: the test

Run steps 3–7 on the 26 clips and compare with what the desk posted:

| Measure | Pass |
|---|---|
| Place suffix right | ≥ 24/26 |
| Brand tag + `#FINVideo` right | 26/26 |
| Police mention right on crime clips | all |
| Suggested headline uses the same bar lines as the posted one | ≥ 18/26 |
| Time per clip on the 4090 | under 1 min for a 2-min clip |

If the headline score is low, the fallback is to show the editor the bar lines as one-click chips and let them build the headline.
Those chips would need a new spot in the editor (the On screen tab was removed on 24 Nov 2026).

## 9. Measured and decided, 24 Nov 2026

**Speech (Whisper large-v3, faster-whisper 1.2.1, float16, RTX 4090).** The 3 min 16 s "Budget Files" clip:

| Setting | Time | Text kept |
|---|---|---|
| One segment at a time, beam 5 | 112 s | 2,469 characters |
| Batched 16, 30 s chunks | 4–5 s | about 1,500 (Hindi runs past Whisper's token cap per chunk, the rest is cut) |
| **Batched 16, 8 s chunks, beam 1 (chosen)** | **5.8 s** | 2,465, and it kept a stretch the slow run skipped |

Hindi in Devanagari costs many tokens, so one-at-a-time decoding left the GPU half idle. The words are right; spelling follows
the sound ("अशोग गहलोत", "गोशना"), so names should come from the screen text, the speech gives the context.
Script: `docs/xvideos/test/whisper_time.py`.

Setup notes for the media service:
- The installed PyAV does not match faster-whisper's decoder: audio is decoded with ffmpeg to 16 kHz mono float instead.
- ctranslate2 needs cuBLAS 12 (`cublas64_12.dll`); the test borrowed the copy in Ollama's `lib/ollama/cuda_v12`. The service should
  ship its own (`nvidia-cublas-cu12`) rather than depend on Ollama's folder.

**Models (proposed, the vision model is not downloaded yet).**

| Job | Model |
|---|---|
| Speech | Whisper large-v3, batched as above |
| Screen text **and** headline | Qwen2.5-VL 7B. One model for both, so the GPU holds two models, not three |
| Fixed parts (suffix, brand tag, `#FINVideo`, place tag, police) | Rules in code (§3), never the model |

**Training on the desk's past posts.** The share holds 506 X-marked clips from Aug–Nov 2026, 359 of them marked done (posted):
Aug 45, Sep 89, Oct 0 (empty), Nov 225. File names do not carry the posted title ("jc sir", "JPR", "udrrr"), so each clip is
matched to its post on X by day and video length. Each pair (frames + transcript → posted headline) is a training example. A LoRA
on Qwen2.5-VL 7B fits the RTX 4090 (about 1–3 h); about 50 clips are held back to score it against what the desk posted. Needs
the full model weights (about 16 GB) and the training tools (about 3–4 GB): not downloaded yet.

## 10. Headline architecture (proposed 25 Nov 2026)

Built the way the breaking headline was built: **pure rules in `packages/core` decide, a worker stage runs them, every draft
records which tables made it, and the desk's posts teach it.** The model is one more source of candidates behind the same
check; it never writes the post on its own.

```
 GPU media service (Python)            packages/core/src/clips/                          apps/worker  stage "clip-compose"
 ─────────────────────────             ──────────────────────────────────────            ───────────────────────────────
 bar lines + times      ─┐            1 evidence.ts   one ClipEvidence (lines, slug,      loads ClipEvidence + dictionaries,
 place slug, name strip  ├─ evidence ─►               names, numbers, transcript)        calls composeClip, saves clip_draft
 transcript (Whisper)   ─┘            2 candidates    rules: Way B / Way C  ──┐           with compose_version, logs
                                        (HeadlineSource)  model: few-shot ────┤           proposals (emit / suggest)
 /headline (Qwen2.5-VL) ◄── examples ─┘                   later: LoRA ────────┤
                                      3 check.ts      grounded? fits 280? ◄───┘                      │
                                      4 composeClip   best + 2 alternates, then the                  ▼
                                                      FIXED parts through the breaking   desk edits / posts ──► learn
                                                      composer (places, handles, tags)   (evidence, suggested, posted)
```

### 10.1 The parts

| # | Part | Where | Job |
|---|---|---|---|
| 1 | `ClipEvidence` | `core/clips/evidence.ts` | One plain object per clip: bar lines (text, first seen, how long on screen), the lead line (§2 step 6), place slug, name strips, reporter card, transcript with times. Names and numbers are pulled out of it once (`facts`). Built from the media service's JSON; nothing below reads frames or audio. |
| 2 | Headline sources | `core/clips/headline/` | `HeadlineSource` interface, like `rewrite/`'s `Rewriter` (`createRewriter(mode)`): `candidates(evidence, examples) → Candidate[]`. **`rules`**: Way B (lead bar line + `, ` + the next bar line that adds a fact), Way C (name strip + bar line), speech-only for vertical clips. **`model`**: the media service's `/headline`, Qwen2.5-VL with 5 of the desk's past posts as examples (§10.3). `HEADLINE_MODE=rules\|model\|both`. |
| 3 | Check | `core/clips/check.ts` | Every candidate, rules or model, passes the same gate: **grounded** (each name, number and place in it is in the evidence; the model invents nothing), **fits** (headline + suffix + tags ≤ 280 weighted, `xLen` / `fit.ts`), **not a bar line copied whole** when a better join exists, Hindi/English per the desk's rule (Q2). A candidate that fails is dropped, with the reason logged. |
| 4 | `composeClip` | `core/clips/compose.ts` | Ranks the passing candidates (model first when it passed, else rules), keeps the best and 2 alternates for the desk. The **fixed parts are not new code**: the clip goes into `composeBreaking` as a breaking story (headline = chosen line, district = slug's place, `points` = the other bar lines), so places, the `\| <City> News` suffix (`isVideoHeadline` format B), `#FINVideo`, brand tag, police and leader handles come out exactly as on the breaking desk. |
| 5 | Stage `clip-compose` | `apps/worker/src/stages/` | Same shape as `stages/compose.ts`: `nextStoryIsolated`-style pick, the shared `Dictionaries`, `compose_version` = dictionary versions + headline source + model version, `recordProposal` for each emitted / suggested part. |
| 6 | Learn | `db` + `core/clips/learn.ts` | On Mark posted: the breaking `learn.ts` runs on the tags and handles as it does today; the clip adds one `clip_example` row (evidence, suggested headline, posted headline, edit distance). These rows are the examples for §10.3 and the LoRA set. |

### 10.2 Why this shape

- **The model can be wrong without the post being wrong.** It only offers a line; the grounding check throws out an invented name
  or number, and the rules line is always there as the fallback. With the model off (GPU busy, service down) the desk still gets
  a Way B headline.
- **One set of place/handle/tag rules for both desks.** A fix on the breaking desk (a district alias, a police handle) is a fix
  here too.
- **Measurable.** Every draft stores which source won and what the desk posted, so "model vs rules" is a number per week, not a
  feeling (the §8 score, ≥ 18/26, is the first one).

### 10.3 Getting good headlines from the first run, in three steps

| Step | What | Needs | When it is on |
|---|---|---|---|
| H1 | Rules only (Way B / C) | Nothing new | From the first build |
| H2 | Model with examples: for each clip, the 5 most alike posted clips (same place, shared names/words) go in the prompt with their posted headline. The desk's style comes from its own posts, no training. | Qwen2.5-VL 7B download (~16 GB) | When it beats H1 on the 50 held-back clips |
| H3 | LoRA on the 359 posted clips (§9), then H2's examples on top | Training tools (~3–4 GB), 1–3 h on the 4090 | When it beats H2 on the same 50 |

The 50 held-back clips are never examples nor training data. Each step is switched on only by its score, and `HEADLINE_MODE`
switches back without a deploy.

## 11. Open questions

- Q1–Q3 in CONTENT-ANALYSIS.md: suffix default, English names, captions over 280 characters.
- Q4. ~~The clips folder~~ Answered: `\\10.1.1.20\fin_data\EXPORT FOR YOUTUBE`, read only (§0).
- Q5. Screen text: fixed-area OCR (needs PaddleOCR installed, fast) or a local vision model reading the frame (slower, handles new
  layouts). The test in §8 decides.
- Q6. Direct posting through the X API: when, and which account permission?
