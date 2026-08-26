// Runs inside the auction page itself, on demand, only when the popup is opened.
// Not a content script: nothing here executes while you browse.
//
// Returns one of three things:
//   null                  — not a site we know
//   { problem: "..." }    — our site, but the page didn't give up its numbers
//   { source, ... }       — a listing, ready to save
//
// Money is always in cents. Times are always ISO strings in UTC.

(() => {
  const cents = (n) =>
    typeof n === "number" && isFinite(n) ? Math.round(n * 100) : null;

  const money = (text) => {
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
  // A Next.js app: the whole page state is JSON in the HTML before any
  // script runs. There are at least four kinds of listing — lien units,
  // manager's specials, private-seller units, charity units — and they do
  // not all sit in the same place in that JSON.
  //
  // So don't navigate to where the auction was last seen. Search the payload
  // for it. An auction is any object carrying an auction_id; the one we want
  // is the one whose id matches the page we're on. That holds for every kind
  // of listing, including kinds that don't exist yet.
  function storagetreasures() {
    const tag = document.getElementById("__NEXT_DATA__");
    if (!tag) return { problem: "This page didn't include the data block Adelaide reads." };

    let data;
    try {
      data = JSON.parse(tag.textContent);
    } catch {
      return { problem: "The page's data block wasn't readable." };
    }

    // The id is in the URL: /auctions/wa/vancouver/6562985
    const fromUrl = (location.pathname.match(/(\d{4,})\/?$/) || [])[1] ?? null;
    const wanted = String(data?.props?.pageProps?.auction_id ?? fromUrl ?? "");

    const found = [];
    const seen = new Set();
    (function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 12 || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (node.auction_id !== undefined && node.auction_id !== null) found.push(node);
      for (const key in node) walk(node[key], depth + 1);
    })(data, 0);

    // Several things in the payload mention an auction_id without being an
    // auction — the routing block, for one. Keep only objects that also carry
    // something an auction actually has.
    const rich = found.filter(
      (x) =>
        x.current_bid !== undefined ||
        x.expire_date !== undefined ||
        x.status_name !== undefined ||
        x.unit_size !== undefined
    );
    const pool = rich.length ? rich : found;

    // Prefer the id the URL names. If the payload describes exactly one
    // auction, that's the one we're looking at, whatever it calls itself.
    const a =
      pool.find((x) => String(x.auction_id) === wanted) ??
      (pool.length === 1 ? pool[0] : null);

    if (!a) {
      return {
        problem: found.length
          ? `Found ${found.length} auction records but none matching ${wanted || "this URL"}.`
          : "No auction data on this page.",
      };
    }

    // "2026-08-25 17:45:00", already UTC, just not marked as such.
    const utc = a.expire_date?.utc?.datetime;
    const ends_at = utc ? new Date(utc.replace(" ", "T") + "Z").toISOString() : null;

    const status = a.is_expired
      ? "ended"
      : a.status_slug === "active" || a.status_name === "Active"
        ? "active"
        : "unknown";

    // Anything that isn't a plain lien unit is a different proposition and
    // should say so on the list. The types read "Lien Unit" and
    // "Non-Lien Unit / Manager Special" — so test the start of the string,
    // not whether "lien" appears in it, or every non-lien unit looks like one.
    // Keep the useful half: "Manager Special", not the whole mouthful.
    const type = String(a.type_name ?? "").trim();
    const kind = type && !/^lien\b/i.test(type) ? type.split("/").pop().trim() : null;

    // StorageTreasures truncates long facility names in its own data, and in
    // its own page. Keep the ellipsis so a clipped name doesn't read as a typo.
    const facility_name = a.facility_name
      ? String(a.facility_name).replace(/\.{3}$/, "…")
      : null;

    // `image` is an object, not a URL. Take the largest it offers.
    const img = a.image;
    const photo =
      typeof img === "string"
        ? img
        : img?.image_path_large || img?.image_path || null;

    // Counts arrive as strings: "2", not 2.
    const bids = Number(a.total_bids);

    return {
      source: "storagetreasures",
      external_id: String(a.auction_id),
      canonical_url: location.origin + location.pathname,
      auto_name:
        [a.unit_size, facility_name, kind].filter(Boolean).join(" · ") ||
        document.title.split("|")[0].trim() ||
        null,
      facility_name,
      city: a.city ?? null,
      state: a.state ?? null,
      unit_size: a.unit_size ?? null,
      bid_cents: cents(Number(a.current_bid?.amount)),
      total_bids: Number.isFinite(bids) ? bids : null,
      ends_at,
      status,
      photos: photo ? [photo] : [],
    };
  }

  // ── Bid13 ───────────────────────────────────────────────────
  // Drupal, rendered on the server. The bid and the closing time are in the
  // markup; the photos arrive by script afterwards, which is why saving from
  // a page you're looking at gets them and a server fetch can't.
  function bid13() {
    const bidEl = document.getElementById("high-bid-amount");
    const clock = document.querySelector(".countdown[data-expiry]");
    if (!bidEl && !clock) {
      return /\/storage-auctions\//.test(location.pathname)
        ? { problem: "This looks like a listing, but the bid and clock weren't where Adelaide expects." }
        : null;
    }

    // Drupal stamps the node id onto the body: page-node-311086
    const node = String(document.body.className).match(/page-node-(\d+)/);

    // /storage-auctions/wa/seattle/northgate-self-storage-seattle-wa/unit-b173
    const parts = location.pathname.split("/").filter(Boolean);
    const state = parts[1] && parts[1].length === 2 ? parts[1].toUpperCase() : null;
    const city = parts[2] ? titleize(parts[2]) : null;
    const facility = parts[3] ? titleize(parts[3]) : null;
    const unitSlug = parts[parts.length - 1] || null;

    const expiry = clock ? Number(clock.getAttribute("data-expiry")) : NaN;
    const ends_at =
      isFinite(expiry) && expiry > 0 ? new Date(expiry * 1000).toISOString() : null;

    const heading = document.querySelector("h1");
    const unit = heading ? heading.textContent.trim() : titleize(unitSlug);

    const status = ends_at
      ? new Date(ends_at) < new Date() ? "ended" : "active"
      : "unknown";

    // Drupal serves uploads from /sites/default/files/. Everything else on
    // the page is furniture — logos, icons, badges.
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
      total_bids: null,         // nor a bid count
      ends_at,
      status,
      photos,
    };
  }

  const host = location.hostname.replace(/^www\./, "");
  if (host === "storagetreasures.com") {
    // Only listing URLs, not search results or facility pages.
    return /\/auctions\//.test(location.pathname) ? storagetreasures() : null;
  }
  if (host === "bid13.com") return bid13();
  return null;
})();
