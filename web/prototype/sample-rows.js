// PROTOTYPE — throwaway. Lives on branch prototype/watchlist-ui, never main.
//
// Made-up watchlist rows in the exact shape listAuctions() returns, so the
// variants can be judged before real sign-in works on the web (#3, #4).
// Closing times are relative to now so the list never goes stale. Each row is
// one of the awkward cases the real page already has to cope with.

const H = 3.6e6;

// Stand-in "photos": flat tinted panels with a door outline. No real site's
// images are fetched.
const photo = (tint) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 250">` +
      `<rect width="440" height="250" fill="${tint}"/>` +
      `<rect x="120" y="40" width="200" height="210" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="6"/>` +
      `<g stroke="#fff" stroke-opacity=".3" stroke-width="4">` +
      [70, 100, 130, 160, 190, 220].map((y) => `<line x1="126" x2="314" y1="${y}" y2="${y}"/>`).join("") +
      `</g><text x="16" y="236" font-family="sans-serif" font-size="18" fill="#fff" fill-opacity=".7">sample photo</text></svg>`,
  );

const ST = "storagetreasures";
const B13 = "bid13";

export function sampleRows(now = Date.now()) {
  const at = (hours) => new Date(now + hours * H).toISOString();
  const batch = at(52); // two Bid13 units at one facility closing together
  return [
    {
      // Crosses from "Within 30 min" into "Closing within 10 min" 20 s after loading.
      id: "t1", source: B13, nickname: null, auto_name: "Stor-N-Lock — 5x5",
      facility_name: "Stor-N-Lock", city: "Glendale", state: "AZ", unit_size: "5x5",
      bid_cents: 1500, first_bid_cents: 1000, total_bids: null, ends_at: at(620 / 3600), status: "active",
      auction_photos: [{ url: photo("#4f6a7a") }],
    },
    {
      id: "t2", source: ST, nickname: "Last-minute one", auto_name: "CubeSmart — 5x10",
      facility_name: "CubeSmart", city: "Gilbert", state: "AZ", unit_size: "5x10",
      bid_cents: 6000, first_bid_cents: 3000, total_bids: 6, ends_at: at(2 / 60), status: "active",
      auction_photos: [{ url: photo("#7a4f5e") }],
    },
    {
      id: "t3", source: ST, nickname: null, auto_name: "Public Storage — 10x10",
      facility_name: "Public Storage", city: "Mesa", state: "AZ", unit_size: "10x10",
      bid_cents: 9000, first_bid_cents: 9000, total_bids: 3, ends_at: at(45 / 60), status: "active",
      auction_photos: [{ url: photo("#5e7a4f") }],
    },
    {
      id: "t4", source: B13, nickname: null, auto_name: "Storage King USA — 10x10",
      facility_name: "Storage King USA", city: "Tempe", state: "AZ", unit_size: "10x10",
      bid_cents: 100, first_bid_cents: 100, total_bids: 0, ends_at: at(5), status: "active",
      auction_photos: [],
    },
    {
      id: "s1", source: ST, nickname: "Blue couch unit", auto_name: "SecureSpace Self Stora… — 10x10",
      facility_name: "SecureSpace Self Stora…", city: "Phoenix", state: "AZ", unit_size: "10x10",
      bid_cents: 12500, first_bid_cents: 8000, total_bids: 4, ends_at: at(3), status: "active",
      auction_photos: [{ url: photo("#7a6a58") }],
    },
    {
      id: "s2", source: ST, nickname: null, auto_name: "Extra Space Storage — 5x10",
      facility_name: "Extra Space Storage", city: "Mesa", state: "AZ", unit_size: "5x10",
      bid_cents: 2500, first_bid_cents: 2500, total_bids: 1, ends_at: at(20), status: "active",
      auction_photos: [{ url: photo("#56707a") }],
    },
    {
      id: "s3", source: B13, nickname: null, auto_name: "Storage King USA — 5x5",
      facility_name: "Storage King USA", city: "Tempe", state: "AZ", unit_size: "5x5",
      bid_cents: 100, first_bid_cents: 100, total_bids: 0, ends_at: batch, status: "active",
      auction_photos: [{ url: photo("#6d5f7a") }, { url: photo("#5f7a66") }],
    },
    {
      id: "s4", source: B13, nickname: "Tools, maybe", auto_name: "Storage King USA — 10x15",
      facility_name: "Storage King USA", city: "Tempe", state: "AZ", unit_size: "10x15",
      bid_cents: 4500, first_bid_cents: 4500, total_bids: null, ends_at: batch, status: "active",
      auction_photos: [{ url: photo("#7a5a4f") }],
    },
    {
      // A photo the site has since removed: the frame must not break.
      id: "s5", source: ST, nickname: null, auto_name: "Public Storage — 10x20",
      facility_name: "Public Storage", city: "Chandler", state: "AZ", unit_size: "10x20",
      bid_cents: 31000, first_bid_cents: 22000, total_bids: 9, ends_at: at(5 * 24), status: "active",
      auction_photos: [{ url: "https://example.invalid/gone.jpg" }],
    },
    {
      id: "s6", source: ST, nickname: null, auto_name: "CubeSmart — 10x10",
      facility_name: "CubeSmart", city: "Gilbert", state: "AZ", unit_size: "10x10",
      bid_cents: 5000, first_bid_cents: 5000, total_bids: 2, ends_at: at(9 * 24), status: "active",
      auction_photos: [],
    },
    {
      // "Coming Soon": saved with status unknown, no bid, no closing time.
      id: "s7", source: ST, nickname: null, auto_name: "Life Storage — 5x10",
      facility_name: "Life Storage", city: "Scottsdale", state: "AZ", unit_size: "5x10",
      bid_cents: null, first_bid_cents: null, total_bids: null, ends_at: null, status: "unknown",
      auction_photos: [{ url: photo("#5a6b7a") }],
    },
    {
      id: "s8", source: ST, nickname: "The one with the bikes", auto_name: "SecureSpace Self Stora… — 10x15",
      facility_name: "SecureSpace Self Stora…", city: "Phoenix", state: "AZ", unit_size: "10x15",
      bid_cents: 41000, first_bid_cents: 20000, total_bids: 14, ends_at: at(-26), status: "ended",
      auction_photos: [{ url: photo("#7a7058") }],
    },
    {
      id: "s9", source: B13, nickname: null, auto_name: "Stor-N-Lock — 5x10",
      facility_name: "Stor-N-Lock", city: "Glendale", state: "AZ", unit_size: "5x10",
      bid_cents: 7500, first_bid_cents: 7500, total_bids: null, ends_at: at(-4 * 24), status: "ended",
      auction_photos: [],
    },
  ].map((r) => ({ external_id: r.id, canonical_url: `https://www.${r.source}.com/`, ...r }));
}
