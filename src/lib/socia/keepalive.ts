// A request the browser finishes even after the page is gone (client.ts sendKeepalive). Pure and free of the
// client's runtime, so it is unit-checked (keepalive.test.ts).

const WRITES = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * A body-less keepalive request built like every other call in client.ts: the API's base URL, the session
 * cookie, and X-CSRF on a write.
 */
export function keepaliveRequest(base: string, method: string, path: string, csrf: string | null): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {};
  if (WRITES.has(method) && csrf) headers["x-csrf"] = csrf;
  return { url: `${base}${path}`, init: { method, headers, credentials: "include", cache: "no-store", keepalive: true } };
}
