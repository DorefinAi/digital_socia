# X Videos: UI scope (branch `xvideos`)

Draft for review, 21 Nov 2026. UI first; the backend (clip folder reader, speech-to-text, on-screen text) is designed later.

## The desk's flow today (by hand)

1. A live clip lands in the clips folder.
2. Someone watches it and writes a title from **what is said** in the clip or **what is shown** on screen (the super, ticker or name strap).
3. They add the hashtags: the fixed ones (`#FINVideo`, `#RajasthanWithFirstIndia` or `#FirstIndiaNews`), then place, people and topic tags, and handles.
4. They post it on X with the video attached.

## The screens (v2: matched to the live X desk)

Mockups: `docs/xvideos/mockups.html`. PNGs are in `docs/xvideos/shots/` and are made by `shots.mjs` (Playwright). Screenshots of the live desk (fin.sociaai.in, 21 Nov) are in `docs/xvideos/reference/`.

The video desk keeps the live X desk's frame so the desk needs nothing new to learn. The **Post Draft** list becomes **Video Draft**. The editor keeps its dark top bar (← Desk, Prev (K), Next (J), See on X, Copy, Copy & Mark Posted), the left rail and panel, the centre stage, and the **Tweet** panel with checkbox hashtags and mentions and Reject / Save draft / Schedule. Roboto with Noto Sans Devanagari, a #f8f9fa page, black 8px buttons.

| # | Screen | What it does |
|---|---|---|
| 1 | **Video Draft list** (`1-video-queue.png`) | A new **X Videos** item under Post Studio. The rows are Post Draft's (time dot, age, badge, district, file, bold headline, reject icon, Open), with a clip thumbnail and its length added. A grey **Suggested** headline is the system's guess from the clip; "Reading the clip… 45%" shows while it is read. A clip over X's limit carries an orange chip, like "No district, check". The usual stat cards, New/Rejected tabs, All/Live/Clips chips, Search, date and Filters. |
| 2 | **Editor: line 1 from speech** (`2-editor-title-from-speech.png`) | The clip plays where the card sits today, with a trim bar (yellow handles, I/O keys) and "Open in Video Studio". The left panel's **Said in clip** tab is a timed Hindi transcript: click to jump, ★ puts the line on line 1 of the tweet. Names heard show as chips. The Tweet panel adds a **channel label** choice (`\| Rajasthan News` sets the brand tag, as the composer does now). **#FINVideo** is always on. |
| 3 | **Editor: line 1 from the screen** (`3-editor-title-from-screen.png`) | **On screen** tab: frame grabs with the text read from the super or ticker, and a cyan box showing where it was read. **Start with** chips (`VIDEO:`, `Viral Video:`, `Jaipur Fire:`) match the desk's existing video styles. Add hashtag searches the same directory as the breaking desk. |
| 4 | **Copy & Mark Posted, video** (`4-post-by-hand.png`) | The same button and 5-minute undo as today. A video post adds one step: the tweet is copied, the video saved, then **Open X**. The X API upload can replace steps 2 and 3 in a later phase. |

## What the current code already gives us (reuse, don't rebuild)

| Need | Existing piece |
|---|---|
| Video player, trim, supers, export to MP4 | **Video Studio**: `src/components/Newsroom/BreakingDesk/video/` (`VideoStudio.tsx`, timeline, `export/exportMp4.ts`, `verifyMp4.ts`), opened full-window by `panels/StudioLauncher.tsx` → `StudioModal`. Dev route `/video-studio`. "Open in Video Studio" on screens 2-3 opens this. |
| Clip length, size, has-audio | `video/panels/probe.ts`, `video/audio/decode.ts` (mediabunny 1.61.4) |
| X preview and X's weighted counter | `phase1/XPostPreview.tsx`, `socialText.countChars` |
| Queue rows, paging, source status, badges | `phase1/Phase1Queue.tsx`, `ListPager.tsx`, `SourceStatus.tsx`, `badges.tsx` |
| Hashtag and handle suggestions and search | `tagSearch.ts`, `suggestionGroups.ts` (+ backend `packages/core/src/breaking/post-tags.ts`: `isVideoHeadline`, `videoLabelBrand`) |
| Claim lease, heartbeat, live presence | `live/LiveDesk.tsx`, `live/takeoverClaim.ts`, `lib/socia/live*` |
| Copy & Mark Posted with undo | `phase1/Phase1Editor.tsx`, `UndoToast.tsx` |
| Nav entry | `leftNavigation/aiContentPlatforms.tsx` |

## UI scope of work (frontend only, on mock data first)

1. **Route and nav**: `/ai-content/x-videos`. The nav item appears only behind a flag, so nobody on the live desk sees it.
2. **Mock data**: about 8 clips in `src/data`, each with a transcript, on-screen text, suggestions and states. It runs on `NEXT_PUBLIC_USE_MOCKS=true`.
3. **Video queue** (screen 1): cards, tabs, filters, search, folder status, the "reading" and "over limit" states, empty and error states.
4. **Video editor shell** (screens 2-3): top bar with claim, player with trim range and markers, the two source tabs, and the right-hand composer.
5. **Transcript panel**: timed lines, follows playback, click to seek, ★ to use, chips for names heard.
6. **On-screen panel**: frame grabs with text boxes, ★ to use.
7. **Title composer**: editable title, channel-label picker, prefix chips, other title options, and a source chip showing where the title came from.
8. **Hashtag block**: locked brand tags, toggleable suggestions, verified handles, and add/search from the directory.
9. **Checks**: format, length and size against X's limits, with a "trim needed" path.
10. **Post-by-hand dialog** (screen 4) with undo, plus the Posted and Skipped lists.
11. **Keyboard**: J/K/L for playback, I/O to set start and end, a key to use the current line. The bindings follow `video/keymap.ts`.
12. **Tests**: unit tests in the existing `node --test` list (title building, tag block, limit checks).

**Out of this UI pass** (the backend phase): reading the real clips folder, speech-to-text, on-screen text recognition, saving drafts to the server, and X API video upload.

## Open questions for the owner

1. The clips folder: what is its exact path and how are its folders laid out? Is it the same share as the breaking files? (The mockups use a made-up `LIVE_CLIPS` path.)
2. What X length limit does @1stIndiaNews have: 2:20, or longer as a verified organisation? The trim rule depends on it.
3. Is the trim needed on the desk itself, or is "Open in Video Studio" enough?
4. Is one title per clip enough, or can one clip make two posts?
5. Who may post videos: the same X desk role, or a new `video` permission?
