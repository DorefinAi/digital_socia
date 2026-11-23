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
| 2 | **Editor: line 1 from speech** (`2-editor-title-from-speech.png`) | The clip plays where the card sits today, with the video's own controls, back 10 s / play / forward 10 s on the picture, and "Open in Video Studio" (no trim bar: a cut is made in the studio). The left panel's **Said in clip** tab is a timed Hindi transcript: click to jump, ★ puts the line on line 1 of the tweet. Names heard show as chips. The Tweet panel adds a **channel label** choice (`\| Rajasthan News` sets the brand tag, as the composer does now). **#FINVideo** is always on. |
| 3 | **Editor: line 1 from the screen** (`3-editor-title-from-screen.png`) | *Removed 24 Nov 2026:* the **On screen** tab (frame grabs with the text read from them). The screen text now only feeds the suggestion. Still here: **Start with** chips (`VIDEO:`, `Viral Video:`, `Jaipur Fire:`) match the desk's existing video styles. Add hashtag searches the same directory as the breaking desk. |
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
4. **Video editor shell** (screens 2-3): top bar with claim, player with on-video controls, the Clips tree and Said in clip tabs, the right-hand composer, and side panels that resize and fold as in the X post maker (`ResizablePanels`).
5. **Transcript panel**: timed lines, follows playback, click to seek, ★ to use, chips for names heard.
6. **Clips panel**: the share's folder tree (day, shift folder, file as named on the share). The On-screen panel was removed.
7. **Title composer**: editable title, channel-label picker, prefix chips, other title options, and a source chip showing where the title came from.
8. **Hashtag block**: locked brand tags, toggleable suggestions, verified handles, and add/search from the directory.
9. **Checks**: format, length and size against X's limits; a clip X will not take is cut or converted in Video Studio.
10. **Post-by-hand dialog** (screen 4) with undo, plus the Posted and Skipped lists.
11. **Keyboard**: J/K next and previous clip (in the tree's order), L or Space play, U uses the current line, Esc back to the desk. The bindings follow `video/keymap.ts`.
12. **Tests**: unit tests in the existing `node --test` list (title building, tag block, limit checks).

**Out of this UI pass** (the backend phase): reading the real clips folder, speech-to-text, on-screen text recognition, saving drafts to the server, and X API video upload.

## What the real posts look like (21 Nov sample)

26 video posts @1stIndiaNews put on X between 13:36 and 16:15 IST on 21 Nov 2026 (pulled to a local folder outside the repo; `docs/xvideos/build-real-clips.py` turns it into `src/data/xClipsReal.json`, which the demo desk now runs on). The videos and frames are local copies in the gitignored `public/xvideos-demo/real/` and `public/xvideos-demo/real-frames/`.

- **Caption:** `<title>` + blank line + `<hashtags> <mentions> <t.co link>`.
- **Title:** mostly `<Hindi/Hinglish headline> | <Place> News` ("… | Tonk News", "… | Haryana News"); 4 use `<headline> | <City> | Rajasthan News`; a few end on a topic segment (`| Khelo Rajasthan Youth Games | Rajasthan`) or have no place (2). English proper nouns are mixed in (PM Narendra Modi, SMS Hospital). Some start with a topic prefix: `Accident:`, `Bansur Cylinder Blast:`, `Panchayat Election Result:`, `JDA Action`.
- **Hashtags:** `#FINVideo` on 26/26. The brand tag usually comes first, then `#FINVideo`: `#RajasthanWithFirstIndia #FINVideo` for Rajasthan stories (18; 2 more have the two swapped), `#FirstIndiaNews #FINVideo` for stories from outside Rajasthan (6: Haryana, Punjab, Patna/Bihar, ISRO). Then `#RajasthanNews` (13) and topic, people and place tags. Then the @mentions (@ashokgehlot51, @INCRajasthan, @RajGovOfficial, @narendramodi, @Jaipur_Airport, @CP_Jodhpur…).
- **Video:** 25/26 are 1280x720 cuts of the TV broadcast (median 93 s, 28 s to 11 min, 5–96 MB); 1 is a 1080x1920 vertical digital short (2124064378488229888, ISRO) with word captions and no TV template.
- **On screen:** the red headline bar and the BREAKING NEWS box each rotate through 3–4 lines of the story. The posted title is a rewrite that merges those lines with context, not a copy of one of them.
- **Length:** 2 captions are longer than 280 characters even counted plainly (319 and 330, the two Bansur posts), so the account can post long text. The desk still holds the post to 280; see question 6.

What the desk does with this now: the helpers in `xvTitle.ts` put the brand tag first and #FINVideo second, pick #FirstIndiaNews for stories from outside Rajasthan, and read both label styles. The label chips are "<Place> News", "<City> | Rajasthan News", "Rajasthan News" and "none". The real posts are kept in `xClipsReal.json` for comparison; the editor no longer shows them (a new clip has no post yet).

## Open questions for the owner

1. The clips folder: what is its exact path and how are its folders laid out? Is it the same share as the breaking files? (The mockups use a made-up `LIVE_CLIPS` path.)
2. ~~What X length limit does @1stIndiaNews have: 2:20, or longer as a verified organisation?~~ **Closed: longer than 2:20.** On 21 Nov the account posted clips of 3:16, 3:37, 4:03, 4:39, 6:07, 6:20 and 11:01. The desk's limit is one constant, `X_VIDEO_MAX_SECONDS` in `xvTitle.ts`, set to 10 min for now (the 11-min clip still asks for a trim). Confirm the account's exact limit before the backend phase.
3. Is the trim needed on the desk itself, or is "Open in Video Studio" enough?
4. Is one title per clip enough, or can one clip make two posts?
5. Who may post videos: the same X desk role, or a new `video` permission?
6. The account posted captions over 280 characters (319 and 330 on 21 Nov). Should the desk allow long posts for videos, or keep them to 280 so they read in full on the timeline?
