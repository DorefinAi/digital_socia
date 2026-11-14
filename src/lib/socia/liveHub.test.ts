// Unit checks (npm test) for the tab's live stream (liveHub.ts): reconnecting after a stream that had worked (N3),
// `replaced` (N5), the startup probe (?probe=1), and one console line per run of failures (M13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveHub, LIVE_RETRY_MS, REST_MS, SOURCE_CLOSED, restDelay, type EventSourceLike, type HubDeps } from "./liveHub";
import type { Clock } from "./liveCore";

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  return { clock, advance };
}

class FakeSource implements EventSourceLike {
  readyState = 0;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, (e: { data?: unknown }) => void>();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(name: string, listener: (e: { data?: unknown }) => void) {
    this.listeners.set(name, listener);
  }
  close() {
    this.closed = true;
    this.readyState = SOURCE_CLOSED;
  }
  emit(name: string, data: unknown) {
    this.readyState = 1;
    this.listeners.get(name)?.({ data: JSON.stringify(data) });
  }
  /** The browser lost the stream and is retrying it */
  drop() {
    this.readyState = 0;
    this.onerror?.({} as Event);
  }
  /** The browser gave up on it (a 502 on reconnect, a refused first try) */
  fail() {
    this.readyState = SOURCE_CLOSED;
    this.onerror?.({} as Event);
  }
}

function setup(over: Partial<HubDeps> = {}) {
  const { clock, advance } = fakeClock();
  const sources: FakeSource[] = [];
  const probes: string[] = [];
  const logs: string[] = [];
  let visible = true;
  let probeStatus = 200;
  const hub = new LiveHub(
    {
      streamUrl: (probe) => `/socia-api/live/stream?platform=x${probe ? "&probe=1" : ""}`,
      createSource: (url) => {
        const s = new FakeSource(url);
        sources.push(s);
        return s;
      },
      probe: async (url) => {
        probes.push(url);
        return probeStatus;
      },
      visible: () => visible,
      log: (line) => logs.push(line),
      clock,
      ...over,
    },
    ["hello", "replaced", "presence.list"],
    (h, name, payload) => h.tell(name, payload),
  );
  const unsubscribe = hub.subscribe(() => undefined);
  const last = () => sources[sources.length - 1];
  return {
    hub,
    sources,
    probes,
    logs,
    advance,
    last,
    unsubscribe,
    setVisible: (v: boolean) => void (visible = v),
    setProbe: (s: number) => void (probeStatus = s),
  };
}

test("restDelay: 2, 4, 8, 16, 30 s for a stream that had worked, then 5 min; never-live streams always 5 min", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((n) => restDelay(true, n)), [2000, 4000, 8000, 16000, 30000, REST_MS, REST_MS]);
  assert.equal(restDelay(false, 0), REST_MS);
});

test("N3: a live stream reconnecting into a 502 comes back within 30 s", async () => {
  const h = setup();
  h.last().emit("hello", { clientId: "c1" });
  assert.equal(h.hub.status, "live");
  h.last().drop(); // the stream went; the browser retries
  assert.equal(h.hub.status, "dropped");
  h.last().fail(); // its retry got a 502: the browser gives up
  await tick();
  assert.equal(h.probes.length, 0, "no startup probe for a stream that had worked");
  const opened = h.sources.length;
  let waited = 0;
  // Each try fails again (still 502) until the server is back
  for (const gap of LIVE_RETRY_MS.slice(0, 3)) {
    h.advance(gap);
    waited += gap;
    assert.equal(h.sources.length, opened + LIVE_RETRY_MS.indexOf(gap) + 1, `tried again after ${gap / 1000} s`);
    if (gap !== LIVE_RETRY_MS[2]) h.last().fail();
  }
  h.last().emit("hello", { clientId: "c2" });
  assert.equal(h.hub.status, "live");
  assert.ok(waited <= 30_000, `back after ${waited} ms`);
  // Worked again: the next drop starts over at 2 s
  h.last().fail();
  const n = h.sources.length;
  h.advance(2000);
  assert.equal(h.sources.length, n + 1);
});

test("N3: after 2, 4, 8, 16 and 30 s the live stream tries every 5 minutes", () => {
  const h = setup();
  h.last().emit("hello", { clientId: "c1" });
  h.last().fail();
  for (const gap of LIVE_RETRY_MS) {
    h.advance(gap);
    h.last().fail();
  }
  const n = h.sources.length;
  h.advance(REST_MS - 1);
  assert.equal(h.sources.length, n, "nothing before 5 minutes");
  h.advance(1);
  assert.equal(h.sources.length, n + 1);
});

test("a stream that was never live: the startup probe uses ?probe=1, then rests 5 minutes", async () => {
  const h = setup();
  h.setProbe(502);
  h.last().fail();
  await tick();
  await tick();
  assert.deepEqual(h.probes, ["/socia-api/live/stream?platform=x&probe=1"]);
  assert.equal(h.sources[0].url, "/socia-api/live/stream?platform=x", "the stream itself never carries probe");
  const n = h.sources.length;
  h.advance(30_000);
  assert.equal(h.sources.length, n, "no quick retries");
  h.advance(REST_MS);
  assert.equal(h.sources.length, n + 1);
});

test("404 on the probe: live presence stops for the session, without a console line", async () => {
  const h = setup();
  h.setProbe(404);
  h.last().fail();
  await tick();
  await tick();
  h.advance(REST_MS * 3);
  assert.equal(h.sources.length, 1);
  assert.equal(h.hub.status, "off");
  assert.deepEqual(h.logs, []);
});

test("M13: other failures log one line, then stay quiet until a stream works again", async () => {
  const h = setup();
  h.setProbe(500);
  h.last().fail();
  await tick();
  await tick();
  assert.equal(h.logs.length, 1);
  assert.match(h.logs[0], /HTTP 500/);
  h.advance(REST_MS);
  h.last().fail();
  h.advance(REST_MS);
  h.last().fail();
  assert.equal(h.logs.length, 1, "quiet while it keeps failing");
  h.advance(REST_MS);
  h.last().emit("hello", { clientId: "c1" });
  h.last().drop();
  assert.equal(h.logs.length, 2, "worked, then failed: one more line");
});

test("N5: replaced in a visible tab connects once more; replaced again, it stays off", () => {
  const h = setup();
  h.last().emit("hello", { clientId: "c1" });
  h.last().emit("replaced", {});
  assert.equal(h.sources.length, 2, "connected again at once");
  assert.ok(h.sources[0].closed);
  h.last().emit("hello", { clientId: "c2" });
  assert.equal(h.hub.status, "live");
  h.last().emit("replaced", {});
  h.advance(REST_MS * 2);
  h.hub.wake();
  assert.equal(h.sources.length, 2);
  assert.equal(h.hub.status, "off");
});

test("N5: replaced in a hidden tab waits until the tab is shown, then connects once", () => {
  const h = setup();
  h.last().emit("hello", { clientId: "c1" });
  h.setVisible(false);
  h.last().emit("replaced", {});
  assert.equal(h.sources.length, 1);
  h.hub.wake();
  assert.equal(h.sources.length, 1, "still hidden");
  h.setVisible(true);
  h.hub.wake();
  assert.equal(h.sources.length, 2);
});
