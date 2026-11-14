// "BHANWAR (Rajsamand)": the reporter exactly as the file name has it, with the story's district. Shown on the desk
// rows and the editor's feed panel. "" when the file named no reporter.

const clean = (s: string | null | undefined) => (s ?? "").trim();

export function reporterWithDistrict(reporter: string | null | undefined, district: string | null | undefined): string {
  const who = clean(reporter);
  if (!who) return "";
  const where = clean(district);
  return where && where.toLowerCase() !== "none" ? `${who} (${where})` : who;
}

/** "Rajsamand · रेलमगरा": district and town, whichever are there */
export function placeLine(district: string | null | undefined, town: string | null | undefined): string {
  return [clean(district), clean(town)].filter(Boolean).join(" · ");
}
