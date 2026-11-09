// Starting and reset passwords that an admin sets for someone else.
// The minimum matches the server (apps/api/src/routes/admin.ts PASSWORD_MIN) and POST /me/password.

export const PASSWORD_MIN = 12;
export const GENERATED_LENGTH = 16;

// No look-alikes: 0/O/o, 1/l/I/i, and symbols that read badly when shared aloud or in a chat
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?-+=";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** A uniform random index below `n`, by rejection sampling (no modulo bias). */
function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

const pick = (set: string) => set[randomIndex(set.length)];

/** A strong random password with at least one of each character kind. Never stored or logged by the caller. */
export function generatePassword(length = GENERATED_LENGTH): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher-Yates, so the guaranteed kinds are not always in front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** The inline message for a password field, or null when it is fine. */
export function passwordProblem(value: string): string | null {
  if (!value) return "Set a password, or press Generate.";
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters (${value.length} so far).`;
  if (value.length > 200) return "Use 200 characters or fewer.";
  return null;
}
