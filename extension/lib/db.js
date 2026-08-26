// Everything that talks to the auctions table lives here.
//
// The publishable key identifies the project; the signed-in person's token
// identifies them. Notice that no query below filters by owner. That isn't an
// oversight — the owner rule lives in the database and applies whether or not
// the caller remembers to ask for it. A bug here can't leak anyone's list.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";
import { getSession } from "./auth.js";

const REST = `${SUPABASE_URL}/rest/v1`;

async function headers(extra = {}) {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function ok(res) {
  if (res.ok) return res;
  let detail = "";
  try {
    const body = await res.json();
    detail = body.message || body.hint || body.details || "";
  } catch {
    /* a non-JSON error body tells us nothing useful */
  }
  throw new Error(detail || `Database returned ${res.status}.`);
}

// What we already hold for this listing, if anything.
export async function findSaved(source, externalId) {
  const q = new URLSearchParams({
    source: `eq.${source}`,
    external_id: `eq.${externalId}`,
    select: "id,auto_name,nickname,bid_cents,first_bid_cents,ends_at",
    limit: "1",
  });
  const res = await ok(await fetch(`${REST}/auctions?${q}`, { headers: await headers() }));
  const rows = await res.json();
  return rows[0] ?? null;
}

// The whole watchlist, with each unit's photos alongside it.
//
// No owner filter here either, for the same reason: the database decides. The
// photos come back in one request rather than one per unit — PostgREST embeds
// them because auction_photos points at auctions.
export async function listAuctions() {
  const q = new URLSearchParams({
    select:
      "id,source,external_id,canonical_url,auto_name,nickname,facility_name,city,state," +
      "unit_size,bid_cents,first_bid_cents,total_bids,ends_at,status,enriched_at," +
      "last_refreshed_at,auction_photos(url,position)",
    order: "ends_at.asc.nullslast",
  });
  q.set("auction_photos.order", "position.asc");
  const res = await ok(await fetch(`${REST}/auctions?${q}`, { headers: await headers() }));
  return res.json();
}

// The one field a person owns. Blank clears it, which is not the same as
// leaving it alone: an empty nickname means "go back to the site's name".
export async function setNickname(id, nickname) {
  const wanted = String(nickname ?? "").trim();
  const q = new URLSearchParams({ id: `eq.${id}`, select: "id,nickname" });
  const res = await ok(
    await fetch(`${REST}/auctions?${q}`, {
      method: "PATCH",
      headers: await headers({ prefer: "return=representation" }),
      body: JSON.stringify({ nickname: wanted || null }),
    })
  );
  return (await res.json())[0] ?? null;
}

// Save, or update in place if this listing is already on the list.
//
// Only the columns we actually read off the page are sent, and that matters:
// an upsert overwrites what it is given and leaves everything else alone.
// Sending `nickname` would erase a name you had typed. Sending
// `first_bid_cents` would destroy the one number it exists to remember.
//
// `owner_id` is deliberately absent too — the database fills it from whoever
// is asking, which is one fewer thing any client can get wrong.
export async function saveAuction(record) {
  const { photos, ...row } = record;
  row.enriched_at = new Date().toISOString();
  row.last_refreshed_at = row.enriched_at;

  const q = new URLSearchParams({ on_conflict: "owner_id,source,external_id" });
  const res = await ok(
    await fetch(`${REST}/auctions?${q}`, {
      method: "POST",
      headers: await headers({
        prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify([row]),
    })
  );
  const saved = (await res.json())[0] ?? null;

  if (saved && photos?.length) await savePhotos(saved.id, photos);
  return saved;
}

// Photos are added, never removed. A listing that drops an image later
// shouldn't make us forget we ever saw it.
async function savePhotos(auctionId, urls) {
  // A site changing an image field from a URL to an object is exactly the kind
  // of change that shouldn't reach the database as a row full of "[object Object]".
  const rows = urls
    .filter((u) => typeof u === "string" && /^https?:\/\//.test(u))
    .slice(0, 24)
    .map((url, position) => ({ auction_id: auctionId, url, position }));
  if (!rows.length) return;
  const q = new URLSearchParams({ on_conflict: "auction_id,url" });
  await ok(
    await fetch(`${REST}/auction_photos?${q}`, {
      method: "POST",
      headers: await headers({ prefer: "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
    })
  );
}
