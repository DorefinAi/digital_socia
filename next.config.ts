import type { NextConfig } from "next";

// Optional same-origin proxy to the Socia API. Set SOCIA_PROXY_TARGET (server-only, e.g.
// http://localhost:8200) and NEXT_PUBLIC_SOCIA_API_URL=/socia-api to call the API through this app,
// which avoids CORS when the desk runs on an origin the API does not list. Unset: no rewrite.
const proxyTarget = process.env.SOCIA_PROXY_TARGET?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Lets a second dev server run beside another one on this folder (Next allows one per build dir)
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async rewrites() {
    return proxyTarget ? [{ source: "/socia-api/:path*", destination: `${proxyTarget}/:path*` }] : [];
  },
};

export default nextConfig;
