// The formatters are shared by the popup and the web app, so a change here
// changes both. They take `now` rather than reading the clock, which is the
// only reason any of this can be checked.

import test from "node:test";
import assert from "node:assert/strict";
import { dollars, closing, ago, hasEnded, byClosing, title } from "../lib/format.js";

const T = Date.parse("2026-08-26T12:00:00Z");
const at = (h) => new Date(T + h * 3.6e6).toISOString();

test("money reads as money, and nothing reads as a dash", () => {
  assert.equal(dollars(2500), "$25");
  assert.equal(dollars(14100), "$141");
  assert.equal(dollars(125050), "$1,250.50");
  assert.equal(dollars(0), "$0", "zero is a bid, not a missing one");
  assert.equal(dollars(null), "—");
  assert.equal(dollars(undefined), "—");
});

test("closing reads as a duration, because that is the question being asked", () => {
  assert.equal(closing(at(0.5), T), "in 30 min");
  assert.equal(closing(at(25), T), "in 25 hr");
  assert.equal(closing(at(72), T), "in 3 days");
  assert.equal(closing(at(-1), T), "closed");
  assert.equal(closing(null, T), "—");
  assert.equal(closing("not a date", T), "—");
});

test("ago is the same span, looking backwards", () => {
  assert.equal(ago(at(-0.01), T), "just now");
  assert.equal(ago(at(-3), T), "3 hr ago");
  assert.equal(ago(at(-72), T), "3 days ago");
  assert.equal(ago(null, T), "—");
});

test("ended means the site said so, or the clock did", () => {
  assert.equal(hasEnded({ status: "ended", ends_at: at(5) }, T), true);
  assert.equal(hasEnded({ status: "active", ends_at: at(-1) }, T), true, "the clock wins");
  assert.equal(hasEnded({ status: "active", ends_at: at(1) }, T), false);
  assert.equal(hasEnded({ status: "unknown", ends_at: null }, T), false);
});

test("soonest to close first; no closing time is last, not urgent", () => {
  const rows = [
    { id: "far", ends_at: at(48) },
    { id: "unknown", ends_at: null },
    { id: "soon", ends_at: at(2) },
    { id: "done", ends_at: at(-3) },
    { id: "done-earlier", ends_at: at(-20) },
  ];
  const { open, ended } = byClosing(rows, T);
  assert.deepEqual(open.map((r) => r.id), ["soon", "far", "unknown"]);
  assert.deepEqual(ended.map((r) => r.id), ["done", "done-earlier"], "most recently closed first");
});

test("byClosing copes with nothing at all", () => {
  assert.deepEqual(byClosing([], T), { open: [], ended: [] });
  assert.deepEqual(byClosing(undefined, T), { open: [], ended: [] });
});

test("a nickname wins, but only if it says something", () => {
  assert.equal(title({ nickname: "The bike one", auto_name: "Unit A05" }), "The bike one");
  assert.equal(title({ nickname: "   ", auto_name: "Unit A05" }), "Unit A05");
  assert.equal(title({ nickname: null, auto_name: "Unit A05" }), "Unit A05");
  assert.equal(title({}), "Untitled unit");
});
