// Structural check of an exported MP4: top-level box order (ftyp first, moov before mdat = fast start) and which
// sample entries it carries (avc1 / mp4a). Used by the export harness and safe to call on any blob.

export interface Mp4Report {
  /** First box is "ftyp" */
  ftyp: boolean;
  majorBrand: string | null;
  /** Top-level box types in file order */
  boxes: string[];
  /** moov comes before mdat (plays before fully downloaded) */
  fastStart: boolean;
  hasAvc1: boolean;
  hasMp4a: boolean;
  /** True when every check passes */
  ok: boolean;
}

const fourcc = (v: DataView, at: number) =>
  String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

function contains(bytes: Uint8Array, tag: string, from: number, to: number): boolean {
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => tag.charCodeAt(i));
  for (let i = from; i < to - 3; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return true;
  }
  return false;
}

export async function inspectMp4(blob: Blob): Promise<Mp4Report> {
  const buf = await blob.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const boxes: string[] = [];
  let moov: [number, number] | null = null;
  let pos = 0;
  while (pos + 8 <= buf.byteLength && boxes.length < 64) {
    let size = view.getUint32(pos);
    const type = fourcc(view, pos + 4);
    if (size === 1 && pos + 16 <= buf.byteLength) size = Number(view.getBigUint64(pos + 8));
    else if (size === 0) size = buf.byteLength - pos;
    if (size < 8) break;
    boxes.push(type);
    if (type === "moov") moov = [pos, Math.min(pos + size, buf.byteLength)];
    pos += size;
  }
  const ftyp = boxes[0] === "ftyp";
  const majorBrand = ftyp && buf.byteLength >= 12 ? fourcc(view, 8) : null;
  const moovAt = boxes.indexOf("moov");
  const mdatAt = boxes.indexOf("mdat");
  const fastStart = moovAt >= 0 && mdatAt >= 0 && moovAt < mdatAt;
  // Sample entries live in moov > trak > mdia > minf > stbl > stsd
  const hasAvc1 = moov ? contains(bytes, "avc1", moov[0], moov[1]) : false;
  const hasMp4a = moov ? contains(bytes, "mp4a", moov[0], moov[1]) : false;
  return { ftyp, majorBrand, boxes, fastStart, hasAvc1, hasMp4a, ok: ftyp && fastStart && hasAvc1 && hasMp4a };
}
