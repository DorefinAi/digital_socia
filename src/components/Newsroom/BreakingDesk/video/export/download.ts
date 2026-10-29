/** File extension for an exported blob ("mp4" or "webm"). */
export function extensionFor(blob: Blob): "mp4" | "webm" {
  return blob.type.includes("webm") ? "webm" : "mp4";
}

/** Saves a blob through a temporary link. The extension is fixed to match the blob's real container. */
export function download(blob: Blob, name: string): void {
  const ext = extensionFor(blob);
  const base = name.replace(/\.(mp4|webm|mov|mkv)$/i, "").trim() || "video";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.${ext}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has picked the download up
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
