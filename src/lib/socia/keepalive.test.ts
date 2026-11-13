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
