// Runs inside the auction page itself, on demand, only when the popup is opened.
// Not a content script: nothing here executes while you browse.
//
// Returns one plain object, or null if this page isn't a listing we understand.
// Money is always in cents. Times are always ISO strings in UTC.
//
// The field locations below were read off both sites directly rather than guessed.
// If a site redesigns, this file is the only place that has to change.

(() => {
  const cents = (n) =>
    typeof n === "number" && isFinite(n) ? Math.round(n * 100) : null;

  const money = (text) => {
    // "$1,250" and "$1,250.50" both land here
    const m = String(text || "").replace(/[^0-9.]/g, "");
    return m === "" ? null : cents(parseFloat(m));
  };

  const titleize = (slug) =>
    String(slug || "")
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  // ── StorageTreasures ────────────────────────────────────────
  // A Next.js app. Everything we need is in the hydration payload,
  // which is plain JSON sitting in the HTML before any script runs.
  function storagetreasures() {
    const tag = document.getElementById("__NEXT_DATA__");
    if (!tag) return null;

    let data;
    try {
      data = JSON.parse(tag.textContent);
    } catch {
      return null;
    }

    const wanted = String(data?.props?.pageProps?.auction_id ?? "");
    const list = data?.props?.initialState?.facility?.auctions ?? [];
    // The payload carries every auction at this facility, not just this one.
    const a = list.find((x) => String(x.auction_id) === wanted) ?? null;
    if (!a) return null;

    // "2026-08-25 17:45:00", already UTC, just not marked as such.
    const utc = a.expire_date?.utc?.datetime;
    const ends_at = utc ? new Date(utc.replace(" ", "T") + "Z").toISOString() : null;

    const status = a.is_expired
      ? "ended"
      : a.status_slug === "active" || a.status_name === "Active"
        ? "active"
        : "unknown";

    return {
      source: "storagetreasures",
      external_id: String(a.auction_id),
      canonical_url: location.origin + location.pathname,
      auto_name: [a.unit_size, a.facility_name].filter(Boolean).join(" · ") || null,
      facility_name: a.facility_name ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      unit_size: a.unit_size ?? null,
      bid_cents: cents(a.current_bid?.amount),
      total_bids: typeof a.total_bids === "number" ? a.total_bids : null,
      ends_at,
      status,
      photos: a.image ? [a.image] : [],
    };
  }

  // ── Bid13 ───────────────────────────────────────────────────
  // Drupal, rendered on the server. The bid and the closing time are in
  // the markup; the photos are loaded by script afterwards, which is why
  // saving from a page you're looking at gets them and a server fetch can't.
  function bid13() {
    const bidEl = document.getElementById("high-bid-amount");
    const clock = document.querySelector(".countdown[data-expiry]");
    if (!bidEl && !clock) return null;

    // Drupal stamps the node id onto the body: page-node-311086
    const node = String(document.body.className).match(/page-node-(\d+)/);

    // /storage-auctions/wa/seattle/northgate-self-storage-seattle-wa/unit-b173
    const parts = location.pathname.split("/").filter(Boolean);
    const state = parts[1] && parts[1].length === 2 ? parts[1].toUpperCase() : null;
    const city = parts[2] ? titleize(parts[2]) : null;
    const facility = parts[3] ? titleize(parts[3]) : null;
    const unitSlug = parts[parts.length - 1] || null;

    const expiry = clock ? Number(clock.getAttribute("data-expiry")) : NaN;
    const ends_at = isFinite(expiry) && expiry > 0
      ? new Date(expiry * 1000).toISOString()
      : null;

    const heading = document.querySelector("h1");
    const unit = heading ? heading.textContent.trim() : titleize(unitSlug);

    const status = ends_at
      ? new Date(ends_at) < new Date() ? "ended" : "active"
      : "unknown";

    // Drupal serves uploads from /sites/default/files/. Anything else on the
    // page is site furniture — logos, icons, sponsor badges.
    const photos = [...document.images]
      .map((img) => img.currentSrc || img.src)
      .filter((u) => u && u.includes("/sites/default/files/"))
      .filter((u, i, all) => all.indexOf(u) === i);

    return {
      source: "bid13",
      external_id: node ? node[1] : parts.join("/"),
      canonical_url: location.origin + location.pathname,
      auto_name: [unit, facility].filter(Boolean).join(" · ") || null,
      facility_name: facility,
      city,
      state,
      unit_size: null,          // Bid13 doesn't publish one
      bid_cents: bidEl ? money(bidEl.textContent) : null,
      total_bids: null,         // Bid13 doesn't publish one either
      ends_at,
      status,
      photos,
    };
  }

  const host = location.hostname.replace(/^www\./, "");
  if (host === "storagetreasures.com") return storagetreasures();
  if (host === "bid13.com") return bid13();
  return null;
})();
