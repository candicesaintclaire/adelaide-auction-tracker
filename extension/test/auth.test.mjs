// Only the part of signing in that can be checked without a browser: reading
// the session Supabase puts on the URL fragment. The rest is Chrome's window
// or the browser's redirect, and belongs to platform.js.

import test from "node:test";
import assert from "node:assert/strict";
import { sessionFromFragment } from "../lib/auth.js";
import { platform, webPlatform } from "../lib/platform.js";

const T = 1_700_000_000_000;

test("outside an extension, the web adapter is the one chosen", () => {
  assert.equal(platform, webPlatform);
  assert.equal(platform.name, "web");
});

test("the session comes off the fragment, from a URL or a bare hash", () => {
  const fragment = "access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer";
  const expected = { access_token: "abc", refresh_token: "def", expires_at: T + 3600_000 };

  assert.deepEqual(sessionFromFragment(`https://example.test/#${fragment}`, T), expected);
  assert.deepEqual(sessionFromFragment(`#${fragment}`, T), expected);
  assert.deepEqual(sessionFromFragment(fragment, T), expected);
});

test("expires_in is trusted when present and assumed when not", () => {
  assert.equal(
    sessionFromFragment("access_token=a&refresh_token=b", T).expires_at,
    T + 3600_000
  );
  assert.equal(
    sessionFromFragment("access_token=a&refresh_token=b&expires_in=60", T).expires_at,
    T + 60_000
  );
});

test("no session on the fragment is null, not an error", () => {
  assert.equal(sessionFromFragment("", T), null);
  assert.equal(sessionFromFragment(null, T), null);
  assert.equal(sessionFromFragment("#", T), null);
  assert.equal(sessionFromFragment("https://example.test/", T), null);
  // Half a session is no session: both tokens or nothing.
  assert.equal(sessionFromFragment("access_token=a", T), null);
  assert.equal(sessionFromFragment("refresh_token=b", T), null);
});

test("a refusal from Google is raised, and says what it said", () => {
  assert.throws(
    () => sessionFromFragment("#error=access_denied&error_description=You%20said%20no", T),
    /You said no/
  );
  assert.throws(() => sessionFromFragment("#error=access_denied", T), /access_denied/);
});
