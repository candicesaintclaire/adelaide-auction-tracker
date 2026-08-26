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
  bid13Photos,
  bid13Details,
  bid13Place,
  bid13NodeId,
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
//
// Read off a live listing on 26 August 2026 — Unit A05 at Self Storage of
// Tacoma, with no bids on it yet. Every value below is the site's, including
// the bare "page-node-" that sits in the class list beside the real one and
// the video poster mixed in among the photographs.
const IMAGES = [
  "https://uccdn.bid13.com/images/thumbnail_v2.png", // the video's poster, not a unit photo
  "https://uccdn.bid13.com/thumbs/2026/08/19/ZZY2d4SWsgC9tVlZOzP6zZP8SEKn4WaMNJuiXVf3Scs_440x250.webp",
  "https://uccdn.bid13.com/thumbs/2026/08/19/pXKuffD8SySrf5H6NkjrU3BT54j86Y1Z7BhsVlVYLQV_440x250.webp",
  "https://uccdn.bid13.com/thumbs/2026/08/19/MmEJGQL6dyOscBWsbp9nynwIzjjxj1pTLdvOCzKEEDB_440x250.webp",
];

const b13 = {
  href: "https://bid13.com/storage-auctions/wa/tacoma/self-storage-tacoma-east-44th/unit-a05-3",
  bodyClass:
    "html not-front not-logged-in page-node page-node- page-node-309691 node-type-product " +
    "uc-product-node i18n-en section-storage-auctions user-role-anon ucAuction-processed",
  bidText: "$25",
  bidArea: "STARTING BID $25 NO BIDS YET TIME LEFT 01 DAYS : 01 HRS : 15 MIN : 06 SEC AUCTION INFO Unit Type: Lien",
  expiry: "1787853600",
  heading: "Unit A05",
  facilityLine: "Self Storage of Tacoma - East 44th , Tacoma, WA",
  details: [
    "Unit Type: Lien Tag Number: 386742 Unit Size: 5x5 Deposit: $100 Cleanout Time: 2 Days Location: Tacoma, WA",
  ],
  images: IMAGES,
};

test("bid13: reads bid, close time, id and place", () => {
  const r = parseBid13(b13);
  assert.equal(r.external_id, "309691");
  assert.equal(r.bid_cents, 2500);
  assert.equal(r.ends_at, "2026-08-27T18:00:00.000Z");
  assert.equal(r.city, "Tacoma");
  assert.equal(r.state, "WA");
  assert.equal(r.status, "active");
});

// The bug: the id was picked out of the class list inside extract.js, where
// no test could reach it. "page-node-" with nothing after it comes first.
test("bid13: the empty page-node- class doesn't win over the real one", () => {
  assert.equal(bid13NodeId(b13.bodyClass), "309691");
  assert.equal(bid13NodeId("page-node page-node-"), null);
  assert.equal(bid13NodeId(undefined), null);
});

// The bug that mattered: photos were filtered on /sites/default/files/, a path
// bid13.com does not serve from, so every saved listing had none — and the
// filtering lived inside the page, where nothing could fail.
test("bid13: unit photos come off the CDN; site furniture doesn't", () => {
  const r = parseBid13(b13);
  assert.equal(r.photos.length, 3, "the /thumbs/ images are the unit's");
  assert.ok(!r.photos.some((u) => u.includes("/images/")), "the video poster is not a photo of the unit");
  for (const p of r.photos) assert.match(p, /^https:\/\/uccdn\.bid13\.com\/thumbs\//);
});

test("bid13: photo selection is about the path, not the order", () => {
  assert.deepEqual(bid13Photos([]), []);
  assert.deepEqual(bid13Photos(undefined), []);
  assert.deepEqual(bid13Photos(["not a url", null, 7]), []);
  // Duplicates are one photo; Drupal's own upload path still counts.
  assert.deepEqual(
    bid13Photos([
      "https://bid13.com/sites/default/files/a.jpg",
      "https://bid13.com/sites/default/files/a.jpg",
    ]),
    ["https://bid13.com/sites/default/files/a.jpg"]
  );
  // A host that merely ends in the same letters is not the CDN.
  assert.deepEqual(bid13Photos(["https://notuccdn.bid13.com.evil.test/thumbs/a.webp"]), []);
});

// "Bid13 doesn't publish one" was written into the code as a fact. It does.
test("bid13: unit size and type come out of the auction info block", () => {
  const r = parseBid13(b13);
  assert.equal(r.unit_size, "5x5");
});

test("bid13: the info block reads the same whether it's one element or many", () => {
  const asOne = bid13Details(b13.details);
  const asMany = bid13Details([
    "Unit Type: Lien",
    "Tag Number: 386742",
    "Unit Size: 5x5",
    "Deposit: $100",
    "Location: Tacoma, WA",
  ]);
  assert.equal(asOne["unit size"], "5x5");
  assert.equal(asOne["unit type"], "Lien");
  assert.equal(asOne["location"], "Tacoma, WA", "a value containing a comma stays whole");
  assert.deepEqual(asMany["unit size"], asOne["unit size"]);
  assert.deepEqual(asMany["unit type"], asOne["unit type"]);
  assert.deepEqual(bid13Details(undefined), {});
});

// Same rule as StorageTreasures, and the same trap: "Non-Lien" contains "lien".
test("bid13: a lien unit carries no label; anything else keeps its type", () => {
  const lien = parseBid13(b13);
  assert.doesNotMatch(lien.auto_name, /lien/i);
  const manager = parseBid13({ ...b13, details: ["Unit Type: Non-Lien / Manager Special"] });
  assert.match(manager.auto_name, /Manager Special$/);
});

test("bid13: the facility's real name beats the one in the URL", () => {
  const r = parseBid13(b13);
  assert.equal(r.facility_name, "Self Storage of Tacoma - East 44th");
  assert.equal(r.auto_name, "Unit A05 · Self Storage of Tacoma - East 44th");
});

test("bid13: the place line is read right-to-left, so commas survive", () => {
  assert.deepEqual(bid13Place("Self Storage of Tacoma - East 44th , Tacoma, WA"), {
    facility_name: "Self Storage of Tacoma - East 44th",
    city: "Tacoma",
    state: "WA",
  });
  // A facility whose own name contains a comma keeps it.
  assert.equal(bid13Place("Smith, Jones & Co Storage, Kent, WA").facility_name, "Smith, Jones & Co Storage");
  // Nothing usable in, nothing invented out.
  assert.deepEqual(bid13Place("Just A Name"), {});
  assert.deepEqual(bid13Place(null), {});
});

test("bid13: without that line, the URL still gives a usable place", () => {
  const r = parseBid13({ ...b13, facilityLine: null });
  assert.equal(r.facility_name, "Self Storage Tacoma East 44th");
  assert.equal(r.city, "Tacoma");
  assert.equal(r.state, "WA");
});

// A starting price with nobody on it is not a bid of that size.
test("bid13: no bids yet is zero bids, not an unknown number", () => {
  assert.equal(parseBid13(b13).total_bids, 0);
});

// Unit C95 at the same facility, an hour later: bid up to $141 by someone.
// The label flips, and a second phrase appears that no synthetic fixture would
// have contained.
const C95 = {
  ...b13,
  href: "https://bid13.com/storage-auctions/wa/tacoma/self-storage-tacoma-east-44th/unit-c95-3",
  bodyClass: b13.bodyClass.replace("309691", "309696"),
  bidText: "$141",
  bidArea:
    "CURRENT BID $141 HIGH BIDDER D*****D TIME LEFT 01 DAYS : 01 HRS : 11 MIN : 13 SEC " +
    "AUCTION INFO Unit Type: Lien Tag Number: 386740 Uni",
  heading: "Unit C95",
  details: ["Unit Type: Lien Tag Number: 386740 Unit Size: 5x5 Deposit: $100 Location: Tacoma, WA"],
};

test("bid13: a real high bid reads as one", () => {
  const r = parseBid13(C95);
  assert.equal(r.external_id, "309696");
  assert.equal(r.bid_cents, 14100);
  assert.equal(r.auto_name, "Unit C95 · Self Storage of Tacoma - East 44th");
});

// "HIGH BIDDER D*****D" is not a bid count, and "BIDDER" begins with "BID" —
// the same shape as "Non-Lien" containing "lien". Neither page checked prints
// a count, so unknown is the honest answer here; zero would be a lie.
test("bid13: the high bidder's name is not mistaken for a bid count", () => {
  assert.equal(parseBid13(C95).total_bids, null);
  assert.notEqual(parseBid13(C95).total_bids, 0, "someone has bid — zero would be wrong");
});

// Kept as a provision, not an observation: no Bid13 page seen so far prints a
// count. If one ever does, it is believed rather than ignored.
test("bid13: a count is believed if the page ever prints one", () => {
  assert.equal(parseBid13({ ...b13, bidArea: "CURRENT BID $40 7 BIDS TIME LEFT" }).total_bids, 7);
  assert.equal(parseBid13({ ...b13, bidArea: "CURRENT BID $40 TIME LEFT" }).total_bids, null);
  assert.equal(parseBid13({ ...b13, bidArea: null }).total_bids, null);
});

test("bid13: a page without a bid or clock is reported", () => {
  assert.ok(parseBid13({ href: b13.href }).problem);
});

test("bid13: query strings and anchors stay out of the saved URL", () => {
  assert.equal(parseBid13({ ...b13, href: b13.href + "?ref=x#photos" }).canonical_url, b13.href);
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
