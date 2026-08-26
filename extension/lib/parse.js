// Turning a page's raw material into a listing.
//
// Nothing in this file touches the DOM, the network, or any chrome API. It
// takes text and objects and returns a record. That is deliberate: this is
// the part that keeps being subtly wrong, so it needs to be the part that can
// be run and checked without a browser. See test/parse.test.mjs.
//
// Money is always in cents. Times are always ISO strings in UTC.

export const cents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export const money = (text) => {
  const digits = String(text ?? "").replace(/[^0-9.]/g, "");
  return digits === "" ? null : cents(parseFloat(digits));
};

export const titleize = (slug) =>
  String(slug ?? "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export function nextDataFromHtml(html) {
  const m = String(html ?? "").match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  return m ? m[1] : null;
}

// /auctions/wa/auburn/6624381 → "6624381"
export function auctionIdFromUrl(href) {
  let path;
  try {
    path = new URL(href).pathname;
  } catch {
    return null;
  }
  const m = path.match(/(\d{4,})\/?$/);
  return m ? m[1] : null;
}

// Every object anywhere in the payload that carries an auction_id.
//
// The depth cap is a guard against pathological nesting, not a filter: the
// units sit about five levels down, so 30 leaves room for a redesign to move
// them without this quietly finding nothing. `seen` can't matter for JSON,
// which has no cycles and no shared references — it's there so that handing
// this a live object later can't hang it.
function candidates(root) {
  const found = [];
  const seen = new Set();
  (function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 30 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (node.auction_id !== undefined && node.auction_id !== null) found.push(node);
    for (const key in node) walk(node[key], depth + 1);
  })(root, 0);
  return found;
}

// ── StorageTreasures ──────────────────────────────────────────
//
// The URL is the authority on which unit you are looking at — not
// pageProps.auction_id, which describes whichever page the tab loaded first
// and is never rewritten when the app navigates between units.
export function parseStorageTreasures(nextDataText, href) {
  let data;
  try {
    data = JSON.parse(nextDataText);
  } catch {
    return { problem: "The page's data block wasn't readable." };
  }

  const urlId = auctionIdFromUrl(href);
  const payloadId =
    data?.props?.pageProps?.auction_id != null
      ? String(data.props.pageProps.auction_id)
      : null;

  const found = candidates(data);

  // Several things mention an auction_id without being an auction — the
  // routing block, for one, and it comes first in the walk. An auction also
  // has a bid, a date, a status or a size.
  const rich = found.filter(
    (x) =>
      x.current_bid !== undefined ||
      x.expire_date !== undefined ||
      x.status_name !== undefined ||
      x.unit_size !== undefined
  );
  const pool = rich.length ? rich : found;

  // The single-auction fallback only applies when the URL names no id at all.
  // With an id in hand, "the only auction here" is not good enough — it may
  // be a different unit entirely.
  const a = urlId
    ? (pool.find((x) => String(x.auction_id) === urlId) ?? null)
    : (pool.find((x) => String(x.auction_id) === payloadId) ??
       (pool.length === 1 ? pool[0] : null));

  if (!a) {
    const stalePayload = Boolean(urlId && payloadId && urlId !== payloadId);
    return {
      problem:
        (found.length
          ? `This page's data describes ${pool.length} unit(s), none of them ${urlId ?? "this one"}.`
          : "No auction data on this page.") +
        (stalePayload
          ? " You reached this unit by clicking through the site, and it kept the first page's data. Reloading the page fixes it."
          : ""),
      stalePayload,
    };
  }

  const utc = a.expire_date?.utc?.datetime;
  const ends_at = utc ? new Date(utc.replace(" ", "T") + "Z").toISOString() : null;

  const status = a.is_expired
    ? "ended"
    : a.status_slug === "active" || a.status_name === "Active"
      ? "active"
      : "unknown";

  // Types read "Lien Unit" and "Non-Lien Unit / Manager Special". Test the
  // start of the string — asking whether "lien" appears anywhere marks every
  // non-lien unit as a lien unit. Keep the useful half of the label.
  const type = String(a.type_name ?? "").trim();
  const kind = type && !/^lien\b/i.test(type) ? type.split("/").pop().trim() : null;

  // StorageTreasures truncates long facility names in its own data and on its
  // own page. Keep the ellipsis so a clipped name doesn't read as a typo.
  const facility_name = a.facility_name
    ? String(a.facility_name).replace(/\.{3}$/, "…")
    : null;

  // `image` is an object, not a URL.
  const img = a.image;
  const photo =
    typeof img === "string" ? img : (img?.image_path_large || img?.image_path || null);

  return {
    source: "storagetreasures",
    external_id: String(a.auction_id),
    canonical_url: href.split("?")[0].split("#")[0],
    auto_name:
      [a.unit_size, facility_name, kind].filter(Boolean).join(" · ") || null,
    facility_name,
    city: a.city ?? null,
    state: a.state ?? null,
    unit_size: a.unit_size ?? null,
    // Counts and amounts arrive as strings as often as numbers.
    bid_cents: cents(a.current_bid?.amount),
    total_bids: Number.isFinite(Number(a.total_bids)) ? Number(a.total_bids) : null,
    ends_at,
    status,
    photos: photo ? [photo] : [],
  };
}

// ── Bid13 ─────────────────────────────────────────────────────
//
// Drupal, rendered on the server, with ordinary page loads — so what is in
// the document always belongs to the URL in the address bar. The gathering
// happens in extract.js; this only interprets it.

// Drupal stamps the node id onto <body>: page-node-309691. The class list
// also carries a bare "page-node-" with nothing after it, which is why the
// digits are required rather than optional.
export const bid13NodeId = (bodyClass) =>
  String(bodyClass ?? "").match(/page-node-(\d+)/)?.[1] ?? null;

// Which of a page's images are photographs of the unit.
//
// Bid13 serves uploaded media from its own CDN, uccdn.bid13.com, under
// /thumbs/. Everything under /images/ on that host is furniture — the video
// placeholder, badges. Drupal's own upload path is still accepted because a
// site that once used it may use it again.
export function bid13Photos(urls) {
  const isPhoto = (u) => {
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.pathname.includes("/sites/default/files/")) return true;
    return (
      /(^|\.)uccdn\.bid13\.com$/.test(parsed.hostname) &&
      !parsed.pathname.startsWith("/images/")
    );
  };
  return [...new Set((urls ?? []).filter((u) => typeof u === "string" && isPhoto(u)))];
}

// The AUCTION INFO block, whether it arrives as one element or as one per
// field. Splitting on the labels themselves handles both without this having
// to know which shape today's markup uses.
const BID13_LABELS =
  /(?=Unit Type|Tag Number|Unit Size|Deposit|Cleanout Time|Location|Phone)/;

export function bid13Details(chunks) {
  const out = {};
  for (const chunk of [].concat(chunks ?? [])) {
    for (const piece of String(chunk).split(BID13_LABELS)) {
      const m = piece.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*([\s\S]+?)\s*$/);
      if (m) out[m[1].toLowerCase()] = m[2].replace(/\s+/g, " ").trim();
    }
  }
  return out;
}

// "Self Storage of Tacoma - East 44th , Tacoma, WA" — the line under the unit
// name. The URL slug gives "Self Storage Tacoma East 44th": close, but not the
// name the place actually goes by. Read right-to-left, so a facility name
// containing a comma stays intact.
export function bid13Place(line) {
  const parts = String(line ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return {};
  const state = /^[A-Za-z]{2}$/.test(parts[parts.length - 1])
    ? parts[parts.length - 1].toUpperCase()
    : null;
  const city = state ? parts[parts.length - 2] : parts[parts.length - 1];
  const name = parts.slice(0, state ? -2 : -1).join(", ").trim();
  return { facility_name: name || null, city: city || null, state };
}

export function parseBid13(g) {
  if (!g?.bidText && !g?.expiry) {
    return { problem: "This looks like a listing, but the bid and clock weren't where Adelaide expects." };
  }

  const parts = (() => {
    try {
      return new URL(g.href).pathname.split("/").filter(Boolean);
    } catch {
      return [];
    }
  })();

  // The page's own words win; the URL is the fallback when the line is absent.
  const place = bid13Place(g.facilityLine);
  const facility = place.facility_name ?? (parts[3] ? titleize(parts[3]) : null);
  const city = place.city ?? (parts[2] ? titleize(parts[2]) : null);
  const state = place.state ?? (parts[1]?.length === 2 ? parts[1].toUpperCase() : null);

  const expiry = Number(g.expiry);
  const ends_at =
    Number.isFinite(expiry) && expiry > 0 ? new Date(expiry * 1000).toISOString() : null;

  const unit = g.heading?.trim() || titleize(parts[parts.length - 1]);

  const detail = bid13Details(g.details);

  // Same rule as StorageTreasures: a lien unit is the ordinary case and gets
  // no label; anything else keeps the useful half of its type.
  const type = detail["unit type"] ?? "";
  const kind = type && !/^lien\b/i.test(type) ? type.split("/").pop().trim() : null;

  // Bid13 publishes no running bid count, but it does say outright when there
  // are none — and "no bids yet, opens at $25" is a different thing from "bid
  // up to $25". Anything it does print is believed.
  const area = String(g.bidArea ?? "");
  const counted = area.match(/(\d+)\s+bids?\b/i);
  const total_bids = counted ? Number(counted[1]) : /no bids? yet/i.test(area) ? 0 : null;

  return {
    source: "bid13",
    external_id: bid13NodeId(g.bodyClass) ?? parts.join("/"),
    canonical_url: g.href.split("?")[0].split("#")[0],
    auto_name: [unit, facility, kind].filter(Boolean).join(" · ") || null,
    facility_name: facility,
    city,
    state,
    unit_size: detail["unit size"] ?? null,
    bid_cents: money(g.bidText),
    total_bids,
    ends_at,
    status: ends_at ? (new Date(ends_at) < new Date() ? "ended" : "active") : "unknown",
    photos: bid13Photos(g.images),
  };
}
