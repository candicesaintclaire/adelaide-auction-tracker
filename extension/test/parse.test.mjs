// Run with:  npm test     (or: node --test)
//
// The fixtures below use the real shapes, read off live pages rather than
// imagined: ids and bid counts arrive as strings, `image` is an object, the
// types read "Lien Unit" and "Non-Lien Unit / Manager Special", and long
// facility names come pre-truncated by the site itself.

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseStorageTreasures,
  parseBid13,
  nextDataFromHtml,
  auctionIdFromUrl,
  cents,
  money,
} from "../lib/parse.js";

const unit = (id, over = {}) => ({
  auction_id: id,
  type_name: "Lien Unit",
  status_name: "Active",
  status_slug: "active",
  is_expired: false,
  unit_size: "10 x 7",
  facility_name: "SecureSpace Self Stora...",
  city: "Auburn",
  state: "WA",
  current_bid: { amount: 20, formatted: "$20" },
  total_bids: "2",
  expire_date: { utc: { datetime: "2026-08-26 18:05:00" } },
  image: {
    main: true,
    image_path: "https://media.example.com/thumb.jpg",
    image_path_large: "https://media.example.com/large.jpg",
  },
  ...over,
});

// A whole page payload. Note that pageProps carries an auction_id too —
// it is a pointer, not an auction, and it comes first in any walk.
const payload = (pagePropsId, units) =>
  JSON.stringify({
    props: {
      pageProps: { auction_id: pagePropsId, user_ip: "0.0.0.0", facility_id: "126641" },
      initialState: { facility: { auctions: units } },
    },
  });

const MANAGER = unit("6624381", { type_name: "Non-Lien Unit / Manager Special" });
const LIEN = unit("6595680", {
  current_bid: { amount: 0, formatted: "$0" },
  total_bids: "0",
  expire_date: { utc: { datetime: "2026-08-27 17:00:00" } },
});
const FACILITY = [unit("6621986", { type_name: "Non-Lien Unit / Manager Special" }), MANAGER, LIEN, unit("6595745")];

const at = (id) => `https://www.storagetreasures.com/auctions/wa/auburn/${id}`;

test("reads the unit the URL names", () => {
  const r = parseStorageTreasures(payload("6624381", FACILITY), at("6624381"));
  assert.equal(r.external_id, "6624381");
  assert.equal(r.bid_cents, 2000);
  assert.equal(r.total_bids, 2);
  assert.equal(r.unit_size, "10 x 7");
  assert.equal(r.status, "active");
  assert.equal(r.ends_at, "2026-08-26T18:05:00.000Z");
});

// The bug: StorageTreasures is a single-page app, so after navigating from
// one unit to another the data block still describes the FIRST one. Every
// unit visited after the first read as the first.
test("a stale data block does not win over the URL", () => {
  const stale = payload("6624381", FACILITY); // tab first loaded the manager's special
  const r = parseStorageTreasures(stale, at("6595680")); // but we're looking at the lien unit
  assert.equal(r.external_id, "6595680");
  assert.equal(r.bid_cents, 0);
  assert.equal(r.total_bids, 0);
});

test("the routing block is not mistaken for an auction", () => {
  // pageProps.auction_id is "6624381" and appears before any real auction.
  const r = parseStorageTreasures(payload("6624381", FACILITY), at("6624381"));
  assert.ok(r.unit_size, "picked a pointer instead of a record");
  assert.equal(r.problem, undefined);
});

test("refuses rather than guessing when the URL's unit isn't in the payload", () => {
  const r = parseStorageTreasures(payload("6624381", [MANAGER]), at("9999999"));
  assert.ok(r.problem, "should not fall back to the only auction present");
  assert.equal(r.external_id, undefined);
});

test("a lone auction is used only when the URL names no id", () => {
  const r = parseStorageTreasures(payload(null, [MANAGER]), "https://www.storagetreasures.com/auctions/wa/auburn/");
  assert.equal(r.external_id, "6624381");
});

test("non-lien units keep their type; lien units don't carry a label", () => {
  const m = parseStorageTreasures(payload("6624381", FACILITY), at("6624381"));
  const l = parseStorageTreasures(payload("6624381", FACILITY), at("6595680"));
  assert.match(m.auto_name, /Manager Special$/);
  assert.doesNotMatch(l.auto_name, /Lien/i, '"Non-Lien" contains "lien" — the test must anchor');
});

test("zero is a bid, not a missing bid", () => {
  const r = parseStorageTreasures(payload("6595680", FACILITY), at("6595680"));
  assert.equal(r.bid_cents, 0);
  assert.equal(r.total_bids, 0);
  assert.notEqual(r.bid_cents, null);
});

test("photos come out as URLs, never as the image object", () => {
  const r = parseStorageTreasures(payload("6624381", FACILITY), at("6624381"));
  assert.deepEqual(r.photos, ["https://media.example.com/large.jpg"]);
  for (const p of r.photos) assert.equal(typeof p, "string");
});

test("truncated facility names read as clipped, not broken", () => {
  const r = parseStorageTreasures(payload("6624381", FACILITY), at("6624381"));
  assert.equal(r.facility_name, "SecureSpace Self Stora…");
});

test("finds the unit even if the site moves it deeper in the payload", () => {
  // Written as a cycle test first, which was nonsense: this takes JSON text,
  // and JSON has no cycles. The real risk is a redesign nesting things further.
  const buried = JSON.stringify({
    props: {
      pageProps: { auction_id: "6624381" },
      initialState: { a: { b: { c: { d: { e: { facility: { auctions: FACILITY } } } } } } },
    },
  });
  assert.equal(parseStorageTreasures(buried, at("6595680")).external_id, "6595680");
});

test("an unreadable data block is reported, not thrown", () => {
  assert.ok(parseStorageTreasures("{not json", at("6624381")).problem);
});

test("query strings and anchors stay out of the saved URL", () => {
  const r = parseStorageTreasures(payload("6624381", FACILITY), at("6624381") + "?utm_source=x#photos");
  assert.equal(r.canonical_url, at("6624381"));
});

// ── Bid13 ────────────────────────────────────────────────────
const b13 = {
  href: "https://bid13.com/storage-auctions/wa/seattle/northgate-self-storage-seattle-wa/unit-b173",
  nodeId: "311086",
  bidText: "$5",
  expiry: "1787933400",
  heading: "Unit B173",
  photos: ["https://bid13.com/sites/default/files/a.jpg"],
};

test("bid13: reads bid, close time, id and place", () => {
  const r = parseBid13(b13);
  assert.equal(r.external_id, "311086");
  assert.equal(r.bid_cents, 500);
  assert.equal(r.ends_at, new Date(1787933400 * 1000).toISOString());
  assert.equal(r.city, "Seattle");
  assert.equal(r.state, "WA");
  assert.equal(r.auto_name, "Unit B173 · Northgate Self Storage Seattle Wa");
  assert.equal(r.total_bids, null, "Bid13 doesn't publish a bid count");
});

test("bid13: a page without a bid or clock is reported", () => {
  assert.ok(parseBid13({ href: b13.href }).problem);
});

// ── helpers ──────────────────────────────────────────────────
test("money and cents cope with strings, commas and nothing", () => {
  assert.equal(money("$1,250"), 125000);
  assert.equal(money("$0"), 0);
  assert.equal(money(""), null);
  assert.equal(cents("20"), 2000);
  assert.equal(cents(undefined), null);
});

test("ids come off URLs, and only real ones", () => {
  assert.equal(auctionIdFromUrl(at("6624381")), "6624381");
  assert.equal(auctionIdFromUrl("https://www.storagetreasures.com/auctions/wa/auburn/"), null);
  assert.equal(auctionIdFromUrl("not a url"), null);
});

test("the data block is found in a real page's HTML", () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"a":1}</script></body></html>`;
  assert.equal(nextDataFromHtml(html), '{"a":1}');
  assert.equal(nextDataFromHtml("<html></html>"), null);
});
