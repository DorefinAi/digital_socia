// Fetch wrapper for the Socia API: cookie session, X-CSRF on every write, JSON errors as ApiError.

import { SOCIA_API_URL } from "./config";

/** An error answer from the API. `code` is the contract's `error` field; `data` holds the extra fields. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly data: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True for a network failure (API down, CORS refused), as opposed to an answer from the API. */
export const isOffline = (err: unknown) => err instanceof ApiError && err.code === "offline";

// The CSRF token lives in memory only; after a reload it comes back from GET /me.
let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

type SignedOutListener = () => void;
const signedOutListeners = new Set<SignedOutListener>();
/** Called when any request finds the session gone, so the app can return to sign-in. */
export function onSignedOut(listener: SignedOutListener): () => void {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  // A Blob goes up as raw bytes with its own type (the card PNG); anything else as JSON
  const raw = typeof Blob !== "undefined" && body instanceof Blob;
  if (body !== undefined) headers["content-type"] = raw ? (body as Blob).type : "application/json";
  if (MUTATING.has(method) && csrfToken) headers["x-csrf"] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`${SOCIA_API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: body === undefined ? undefined : raw ? (body as Blob) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the Socia server. Check that it is running, then try again.");
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  let isJson = false;
  if (text) {
    try {
      json = JSON.parse(text);
      isJson = true;
    } catch {
      json = { message: text };
    }
  }
  // A gateway error, or a non-JSON 5xx from the /socia-api proxy, means the API itself is not answering
  if ((res.status >= 500 && !isJson) || res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiError(0, "offline", "Can't reach the Socia server. Check that it is running, then try again.");
  }
  if (!res.ok) {
    const { error, message, ...data } = json as { error?: string; message?: string };
    throw new ApiError(res.status, error ?? "server", message ?? `The server answered ${res.status}.`, data);
  }
  return json as T;
}

/**
 * One request with the two recoveries every screen needs: a stale CSRF token is refreshed from /me
 * and the request retried once; a lost session tells the listeners so the app can sign in again.
 */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await send<T>(method, path, body);
  } catch (err) {
    if (err instanceof ApiError && err.code === "csrf" && path !== "/me") {
      const me = await send<{ csrfToken: string }>("GET", "/me");
      setCsrfToken(me.csrfToken);
      return send<T>(method, path, body);
    }
    if (err instanceof ApiError && err.code === "signed_out" && path !== "/me") {
      signedOutListeners.forEach((l) => l());
    }
    throw err;
  }
}
