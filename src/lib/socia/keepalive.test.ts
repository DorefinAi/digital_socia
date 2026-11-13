// Unit checks for keepalive.ts (run by npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { keepaliveRequest } from "./keepalive";

test("a closing-tab write is built like the api client's: base URL, cookie, CSRF, keepalive", () => {
  const { url, init } = keepaliveRequest("http://api.test", "POST", "/drafts/d1/correction/done", "tok");
  assert.equal(url, "http://api.test/drafts/d1/correction/done");
  assert.equal(init.method, "POST");
  assert.equal(init.keepalive, true);
  assert.equal(init.credentials, "include");
  assert.deepEqual(init.headers, { "x-csrf": "tok" });
  assert.equal(init.body, undefined);
});

test("no CSRF header without a token, or on a read", () => {
  assert.deepEqual(keepaliveRequest("http://api.test", "POST", "/x", null).init.headers, {});
  assert.deepEqual(keepaliveRequest("http://api.test", "GET", "/x", "tok").init.headers, {});
});

test("a body goes as JSON (live presence's leave on a closing tab)", () => {
  const { init } = keepaliveRequest("/socia-api", "POST", "/live/leave", "tok", { clientId: "c1", draftId: "d1" });
  assert.deepEqual(init.headers, { "x-csrf": "tok", "content-type": "application/json" });
  assert.equal(init.body, JSON.stringify({ clientId: "c1", draftId: "d1" }));
  assert.equal(init.keepalive, true);
});
