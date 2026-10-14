/** Renders an on-screen report to an A4 PDF, page by page, and downloads it. */
export async function exportElementToPdf(el: HTMLElement, opts: { fileName: string; title: string; subtitle: string; background: string }) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    backgroundColor: opts.background,
    cacheBust: true,
    // A blank pixel stands in for any picture the host will not let us read
    imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    filter: (node) => !(node instanceof HTMLElement && node.dataset.pdfHide === "true"),
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const headerH = 16;
  const contentW = pageW - margin * 2;
  const mmPerPx = contentW / img.width;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(opts.title, margin, margin + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(opts.subtitle, margin, margin + 11);

  let y = 0;
  let page = 0;
  while (y < img.height) {
    const top = page === 0 ? margin + headerH : margin;
    const slicePx = Math.floor((pageH - top - margin) / mmPerPx);
    const h = Math.min(slicePx, img.height - y);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
    if (page > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, top, contentW, h * mmPerPx);
    y += h;
    page += 1;
  }
  pdf.save(opts.fileName);
}

/** Lakh / crore formatting, as the desk reads numbers. */
export function formatIndian(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-IN");
}
