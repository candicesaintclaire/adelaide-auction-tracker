// The formatters are shared by the popup and the web app, so a change here
// changes both. They take `now` rather than reading the clock, which is the
// only reason any of this can be checked.

import test from "node:test";
import assert from "node:assert/strict";
import {
  dollars, closing, ago, hasEnded, byClosing, title,
  closesText, countdownGroup, byCountdown,
} from "../lib/format.js";

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

// ── the watchlist's countdown ─────────────────────────────────

const m = (min) => at(min / 60);
const s = (sec) => at(sec / 3600);

test("the last hour counts down in minutes and seconds, as the sites' own clocks do", () => {
  assert.equal(closesText(s(512), T), "Closes in 8:32");
  assert.equal(closesText(s(3599), T), "Closes in 59:59");
  assert.equal(closesText(s(1), T), "Closes in 0:01");
  assert.equal(closesText(s(65), T), "Closes in 1:05", "seconds always take two digits");
});

test("beyond the hour it reads as the popup does, after the word Closes", () => {
  assert.equal(closesText(s(3600), T), "Closes in 60:00",
    "exactly an hour is still inside it: 60:00, not a jump to '1 hr'");
  assert.equal(closesText(at(3), T), "Closes in 3 hr");
  assert.equal(closesText(at(72), T), "Closes in 3 days");
});

test("a closed unit says so, and a unit with no closing time says nothing", () => {
  assert.equal(closesText(at(-1), T), "Closed");
  assert.equal(closesText(at(0), T), "Closed", "the closing second itself is closed");
  assert.equal(closesText(null, T), "");
  assert.equal(closesText("not a date", T), "");
});

test("each unit sits under the tightest heading it fits, edges included", () => {
  const group = (ends_at) => countdownGroup({ status: "active", ends_at }, T);
  assert.equal(group(s(1)), "Closing within 10 min");
  assert.equal(group(m(10)), "Closing within 10 min", "exactly 10 min is within 10 min");
  assert.equal(group(s(601)), "Within 30 min");
  assert.equal(group(m(30)), "Within 30 min");
  assert.equal(group(m(31)), "Within 60 min");
  assert.equal(group(m(60)), "Within 60 min");
  assert.equal(group(m(61)), "Within 2 hours");
  assert.equal(group(at(2)), "Within 2 hours");
  assert.equal(group(at(5)), "Within 6 hours");
  assert.equal(group(at(6)), "Within 6 hours");
  assert.equal(group(at(7)), "Within 24 hours");
  assert.equal(group(at(24)), "Within 24 hours");
  assert.equal(group(at(25)), "Within 2 days");
  assert.equal(group(at(48)), "Within 2 days", "exactly 2 days is within 2 days");
  assert.equal(group(s(48 * 3600 + 1)), "This week", "one second past 2 days is this week");
  assert.equal(group(at(7 * 24)), "This week");
  assert.equal(group(s(7 * 24 * 3600 + 1)), "Later");
  assert.equal(group(at(30 * 24)), "Later");
});

test("ended and undated units have headings of their own", () => {
  assert.equal(countdownGroup({ status: "active", ends_at: at(-1) }, T), "Ended");
  assert.equal(countdownGroup({ status: "ended", ends_at: at(5) }, T), "Ended", "the site saying so wins");
  assert.equal(countdownGroup({ status: "unknown", ends_at: null }, T), "No closing time yet");
  assert.equal(countdownGroup({ status: "active", ends_at: "not a date" }, T), "No closing time yet");
});

test("the watchlist reads top to bottom: soonest heading first, empty headings left out", () => {
  const rows = [
    { id: "later", ends_at: at(10 * 24) },
    { id: "gone", ends_at: at(-3) },
    { id: "undated", ends_at: null },
    { id: "five-min", ends_at: m(5) },
    { id: "two-min", ends_at: m(2) },
    { id: "gone-earlier", ends_at: at(-20) },
    { id: "four-days", ends_at: at(4 * 24) },
  ];
  const groups = byCountdown(rows, T).map((g) => [g.label, g.rows.map((r) => r.id)]);
  assert.deepEqual(groups, [
    ["Closing within 10 min", ["two-min", "five-min"]],
    ["This week", ["four-days"]],
    ["Later", ["later"]],
    ["No closing time yet", ["undated"]],
    ["Ended", ["gone", "gone-earlier"]],
  ]);
});

test("byCountdown copes with nothing at all", () => {
  assert.deepEqual(byCountdown([], T), []);
  assert.deepEqual(byCountdown(undefined, T), []);
});
