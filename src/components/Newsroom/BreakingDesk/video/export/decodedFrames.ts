// Fast export frames: instead of seeking a <video> element for every frame (~30 ms each, so export ran at about
// real time), decode every visible video once, in order, with WebCodecs (mediabunny VideoSampleSink). The export
// knows every frame time up front, so the source timestamps each video needs are planned before encoding starts
// and fed to samplesAtTimestamps, which decodes each packet at most once.
//
// renderFrame still does all the drawing: it gets a view of the MediaPool whose frame()/frameSize() return the
// decoded frame for the decoded assets; every other call goes to the real pool. An asset that can't be decoded this
// way (codec, container, a fetch error) falls back to the pool's exact seek for that asset only.
import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink, type InputVideoTrack, type VideoSample } from "mediabunny";
import { sourceTime, type Asset, type Project } from "../model";
import { collectLayers, newLayerList } from "../render/layers";
import type { MediaPool } from "../render/mediaPool";
import type { FrameDriver } from "./types";

/** A hair past the frame time so float rounding never picks the previous source frame */
const EPS = 1e-4;

interface Decoded {
  input: Input;
  track: InputVideoTrack;
  first: number;
  last: number;
  /** Clockwise degrees from the file metadata (phone footage); VideoFrames are drawn unrotated, so we rotate */
  rotation: number;
}

interface Stream {
  gen: AsyncGenerator<VideoSample | null, void, unknown>;
  current: VideoSample | null;
  /** Reused upright copy of the current frame, only for rotated sources */
  upright: OffscreenCanvas | null;
}

const keyOf = (assetId: string, voice: number) => `${assetId}#${voice}`;

async function openAsset(asset: Asset): Promise<Decoded | null> {
  let input: Input | null = null;
  try {
    const source = asset.url.startsWith("blob:") ? new BlobSource(await (await fetch(asset.url)).blob()) : new UrlSource(asset.url);
    input = new Input({ source, formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error("not decodable");
    const [first, end] = await Promise.all([track.getFirstTimestamp(), track.computeDuration()]);
    return { input, track, first, last: Math.max(first, end - 0.001), rotation: track.rotation };
  } catch {
    input?.dispose();
    return null;
  }
}

/** Draws a coded-orientation frame into `out` (display size) turned clockwise by `rotation` degrees. */
function drawUpright(out: OffscreenCanvas, src: CanvasImageSource, rotation: number): OffscreenCanvas {
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  const W = out.width;
  const H = out.height;
  const sideways = rotation % 180 !== 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2, H / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const w = sideways ? H : W;
  const h = sideways ? W : H;
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return out;
}

export async function createDecodedFrames(project: Project, pool: MediaPool, fps: number, framesTotal: number): Promise<FrameDriver<MediaPool>> {
  const layers = newLayerList();
  const videoAssets = new Map<string, Asset>();
  for (const a of project.assets) if (a.kind === "video") videoAssets.set(a.id, a);

  // 1. Plan: which (asset, voice) shows on which frame, at which source time
  const plan = new Map<string, number[]>();
  const used = new Set<string>();
  for (let i = 0; i < framesTotal; i++) {
    const list = collectLayers(project, i / fps, layers);
    for (let j = 0; j < list.count; j++) {
      const { clip, voice } = list.items[j];
      if (clip.type !== "media" || !videoAssets.has(clip.assetId)) continue;
      const key = keyOf(clip.assetId, voice);
      let times = plan.get(key);
      if (!times) plan.set(key, (times = []));
      times.push(sourceTime(clip, i / fps));
      used.add(clip.assetId);
    }
  }

  // 2. Open every used video once (in parallel); failures fall back to element seeking
  const decoded = new Map<string, Decoded>();
  await Promise.all(
    [...used].map(async (id) => {
      const d = await openAsset(videoAssets.get(id)!);
      if (d) decoded.set(id, d);
    }),
  );

  // 3. One sample stream per (asset, voice)
  const streams = new Map<string, Stream>();
  for (const [key, times] of plan) {
    const d = decoded.get(key.slice(0, key.lastIndexOf("#")));
    if (!d) continue;
    const clamped = times.map((s) => Math.min(Math.max(s + EPS, d.first), d.last));
    streams.set(key, {
      gen: new VideoSampleSink(d.track).samplesAtTimestamps(clamped),
      current: null,
      upright: d.rotation ? new OffscreenCanvas(d.track.displayWidth, d.track.displayHeight) : null,
    });
  }

  // 4. The pool view renderFrame draws from
  const view = Object.create(pool) as MediaPool;
  view.frame = (id: string, voice = 0) => {
    const s = streams.get(keyOf(id, voice));
    if (!s) return pool.frame(id, voice);
    if (!s.current) return null;
    // Must be drawn in this same task (mediabunny may close its internal VideoFrame on the next microtask)
    const src = s.current.toCanvasImageSource();
    if (!s.upright) return src;
    return drawUpright(s.upright, src, decoded.get(id)!.rotation);
  };
  view.frameSize = (id: string) => {
    const d = decoded.get(id);
    return d ? { width: d.track.displayWidth, height: d.track.displayHeight } : pool.frameSize(id);
  };

  const pulls: Promise<void>[] = [];
  const advance = async (t: number) => {
    pulls.length = 0;
    const list = collectLayers(project, t, layers);
    for (let j = 0; j < list.count; j++) {
      const { clip, voice } = list.items[j];
      if (clip.type !== "media" || !videoAssets.has(clip.assetId)) continue;
      const s = streams.get(keyOf(clip.assetId, voice));
      if (s) {
        pulls.push(
          s.gen.next().then((r) => {
            // The previous sample was already snapshotted by the encoder (CanvasSource.add is synchronous)
            s.current?.close();
            s.current = r.done ? null : r.value;
          }),
        );
      } else {
        pulls.push(pool.seekVideo(clip.assetId, sourceTime(clip, t), voice));
      }
    }
    await Promise.all(pulls);
  };

  const dispose = async () => {
    await Promise.all(
      [...streams.values()].map(async (s) => {
        s.current?.close();
        s.current = null;
        if (s.upright) s.upright.width = s.upright.height = 1;
        await s.gen.return(undefined).catch(() => {});
      }),
    );
    for (const d of decoded.values()) d.input.dispose();
  };

  return {
    pool: view,
    advance,
    dispose,
    info: { decoded: [...decoded.keys()], fallback: [...used].filter((id) => !decoded.has(id)) },
  };
}
