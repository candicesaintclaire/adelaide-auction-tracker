// Choosing which reading to trust. This decision used to live inside popup.js,
// where nothing could reach it, and it was wrong: it could only notice a stale
// data block when the tab's first page was itself a listing.
//
// The fetcher is injected, so none of this touches a network.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveListing } from "../lib/resolve.js";

const unit = (id, over = {}) => ({
  auction_id: id,
  type_name: "Lien Unit",
  status_name: "Active",
  status_slug: "active",
  is_expired: false,
  unit_size: "5 x 10",
  facility_name: "U-Haul of South Auburn",
  city: "Auburn",
  state: "WA",
  current_bid: { amount: 30, formatted: "$30" },
  total_bids: "3",
  expire_date: { utc: { datetime: "2026-08-28 18:00:00" } },
  image: { image_path_large: "https://media.example.com/large.jpg" },
  ...over,
});

// A listing page: pageProps carries the unit's own id.
const listingPayload = (pagePropsId, units) =>
  JSON.stringify({
    props: {
      pageProps: { auction_id: pagePropsId, user_ip: "0.0.0.0", facility_id: "126641" },
      initialState: { facility: { auctions: units } },
    },
  });

// A search page. Note what is missing: no auction_id in pageProps, and no
// auctions anywhere. This is what the tab holds when you arrive at a unit by
// clicking through from a search, and it is the shape that broke things.
const searchPayload = JSON.stringify({
  props: {
    pageProps: { user_ip: "0.0.0.0" },
    initialState: {
      live_auctions: { auctions: [], total_records: 0, search: "auburn" },
      facility: { auctions: [] },
    },
  },
  page: "/online-storage-auctions",
});

const at = (id) => `https://www.storagetreasures.com/auctions/wa/auburn/${id}`;
const never = () => { throw new Error("should not have asked the site"); };
const serves = (payload) => async () =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${payload}</script></body></html>`;

test("a page that already describes this unit is read without asking the site", async () => {
  const raw = { source: "storagetreasures", href: at("6549886"), payloadId: "6549886",
                nextData: listingPayload("6549886", [unit("6549886")]) };
  const r = await resolveListing(raw, never);
  assert.equal(r.external_id, "6549886");
  assert.equal(r.stale, undefined);
});

// The bug. Arriving from a search page leaves a block with no auction_id in it
// at all, so there is no id to compare and nothing looked stale — Adelaide
// read the search page's data, found no auctions, and refused to save a unit
// whose page was perfectly fine.
test("arriving from a search page asks the site rather than giving up", async () => {
  const raw = { source: "storagetreasures", href: at("6549886"),
                payloadId: null, nextData: searchPayload };
  const r = await resolveListing(raw, serves(listingPayload("6549886", [unit("6549886")])));
  assert.equal(r.problem, undefined, "refused a listing that was there all along");
  assert.equal(r.external_id, "6549886");
  assert.equal(r.bid_cents, 3000);
});

test("arriving from another listing still asks the site, as it always did", async () => {
  const raw = { source: "storagetreasures", href: at("6549886"), payloadId: "6624381",
                nextData: listingPayload("6624381", [unit("6624381")]) };
  const r = await resolveListing(raw, serves(listingPayload("6549886", [unit("6549886")])));
  assert.equal(r.external_id, "6549886");
});

test("when the site cannot be reached, say what the block knows and mark it", async () => {
  // The first page's block happens to list this facility's other units, and
  // the one we want is among them — just read earlier than now.
  const raw = { source: "storagetreasures", href: at("6549886"), payloadId: "6624381",
                nextData: listingPayload("6624381", [unit("6624381"), unit("6549886")]) };
  const r = await resolveListing(raw, async () => { throw new Error("offline"); });
  assert.equal(r.external_id, "6549886");
  assert.equal(r.stale, true, "a reading from before now must announce itself");
});

test("a refusal survives when neither the block nor the site has the unit", async () => {
  const raw = { source: "storagetreasures", href: at("6549886"),
                payloadId: null, nextData: searchPayload };
  const r = await resolveListing(raw, serves(searchPayload));
  assert.ok(r.problem);
  assert.match(r.problem, /no auctions at all/i);
  assert.match(r.problem, /opened first/i, "must name the real cause, not blame the listing");
  assert.equal(r.stale, undefined);
});

test("Bid13 is never re-fetched: its pages belong to their own URL", async () => {
  const r = await resolveListing(
    { source: "bid13", href: "https://bid13.com/storage-auctions/wa/seattle/x/unit-323-6",
      bodyClass: "page-node-311757", bidText: "$10", expiry: "1787853600", heading: "Unit 323" },
    never
  );
  assert.equal(r.source, "bid13");
  assert.equal(r.bid_cents, 1000);
});

test("nothing to read, and a problem already found, both pass straight through", async () => {
  assert.equal(await resolveListing(null, never), null);
  assert.deepEqual(await resolveListing({ problem: "no data block" }, never), { problem: "no data block" });
});

test("a URL naming no unit is not worth a request", async () => {
  const raw = { source: "storagetreasures",
                href: "https://www.storagetreasures.com/auctions/wa/auburn/",
                payloadId: null, nextData: listingPayload(null, [unit("6549886")]) };
  const r = await resolveListing(raw, never);
  assert.equal(r.external_id, "6549886", "the only auction present is used when no id is named");
});
