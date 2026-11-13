// One switch for the whole app: real backend (default) or the old in-browser demo data.
// Both values are inlined at build time (NEXT_PUBLIC_), so a change needs a rebuild/restart.

const rawUrl = process.env.NEXT_PUBLIC_SOCIA_API_URL || "http://localhost:8200";

/** Base URL of the Socia API, without a trailing slash. Used for REST and file links. */
export const SOCIA_API_URL = rawUrl.replace(/\/+$/, "");

/** True when the desk should run on the demo data in src/data instead of the backend. */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

/** Screens poll at these rates. With live presence connected (live.tsx), a queue event also refreshes the desk at once. */
export const POLL_MS = { queue: 5000, counts: 10000, posts: 15000, cardRender: 1500, cardTemplate: 60000 } as const;

/** The claim lease is 5 minutes; the backend asks for a heartbeat every 60 s. */
export const HEARTBEAT_MS = 60_000;
