import type { NextConfig } from "next";

// Optional same-origin proxy to the Socia API. Set SOCIA_PROXY_TARGET (server-only, e.g.
// http://localhost:8200) and NEXT_PUBLIC_SOCIA_API_URL=/socia-api to call the API through this app,
// which avoids CORS when the desk runs on an origin the API does not list. Unset: no rewrite.
const proxyTarget = process.env.SOCIA_PROXY_TARGET?.replace(/\/+$/, "");

// Only the API paths this desk calls (src/lib/socia/api.ts, apiFileUrl/fileUrl links) are forwarded. Never
// /owner (the owner console's server-to-server API), /socket.io (the desk polls), /healthz or anything new:
// a path the desk starts calling must be added here.
const PROXIED_PREFIXES = ["auth", "me", "drafts", "handles", "card-templates", "trends", "x", "posts", "jobs", "ingest", "admin", "dev-files", "search", "live"];

// Sent on every response. The CSP is deliberately partial: a full one (script/style/img/connect/media/worker
// sources) would have to allow Next's inline scripts, emotion's injected styles, blob:/data: card and video
// work and the signed storage hosts card images come from, so it only carries the directives that cannot
// break the app.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets a second dev server run beside another one on this folder (Next allows one per build dir)
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Pages are prerendered and Next sends them with `s-maxage=31536000`: a proxy or CDN in front could keep
  // last week's HTML (pointing at last week's scripts) for a year. `no-cache` makes every cache ask first; an
  // unchanged page is a cheap 304 by ETag. /_next/static is hashed and stays immutable; the API proxy keeps its own.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/((?!_next/static|_next/image|socia-api).*)", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      // The live stream (text/event-stream) must reach the browser event by event. Next's gzip (`compress`, on by
      // default) skips any response whose Cache-Control has `no-transform`; the API sends
      // "private, no-store, no-transform" itself, which replaces this on the proxied response, so this only
      // counts if it ever stops. X-Accel-Buffering: no keeps an nginx-style proxy in front from buffering it.
      { source: "/socia-api/live/stream", headers: [{ key: "Cache-Control", value: "private, no-store, no-transform" }, { key: "X-Accel-Buffering", value: "no" }] },
    ];
  },
  async rewrites() {
    if (!proxyTarget) return [];
    return PROXIED_PREFIXES.flatMap((p) => [
      { source: `/socia-api/${p}`, destination: `${proxyTarget}/${p}` },
      { source: `/socia-api/${p}/:path*`, destination: `${proxyTarget}/${p}/:path*` },
    ]);
  },
};

export default nextConfig;
