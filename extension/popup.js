import { isConfigured } from "./config.js";
import { signIn, signOut, getUser } from "./lib/auth.js";
import { findSaved, saveAuction } from "./lib/db.js";
import {
  parseStorageTreasures,
  parseBid13,
  nextDataFromHtml,
  auctionIdFromUrl,
} from "./lib/parse.js";

const $ = (id) => document.getElementById(id);

const show = (id) => {
  for (const el of document.querySelectorAll("#setup, #signedout, #signedin")) {
    el.classList.toggle("hidden", el.id !== id);
  }
};
const toggle = (id, on) => $(id).classList.toggle("hidden", !on);

const fail = (e) => {
  const box = $("error");
  box.textContent = e.message || String(e);
  box.classList.remove("hidden");
};

const dollars = (c) =>
  typeof c === "number"
    ? "$" +
      (c / 100).toLocaleString("en-US", {
        minimumFractionDigits: c % 100 ? 2 : 0,
        maximumFractionDigits: 2,
      })
    : "—";

// "in 3 days", "in 4 hr" — a duration reads faster than a date when the only
// question is whether there's still time.
function closing(iso) {
  if (!iso) return "—";
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "closed";
  const hours = ms / 3.6e6;
  if (hours < 1) return `in ${Math.round(ms / 6e4)} min`;
  if (hours < 48) return `in ${Math.round(hours)} hr`;
  return `in ${Math.round(hours / 24)} days`;
}

// Look at the page in front of you. This runs only because you opened the
// popup — there is no content script sitting on these sites.
async function gather() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [hit] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["lib/extract.js"],
  });
  return hit?.result ?? null;
}

// Turn what the page gave us into a listing.
//
// StorageTreasures is a single-page app, so the data block in the document
// belongs to whichever unit the tab loaded first, not the one you are looking
// at now. When those disagree, ask the site for this page properly. That is
// one request, on a deliberate click, and only when the shortcut won't do.
async function resolve(raw) {
  if (!raw) return null;
  if (raw.problem) return { problem: raw.problem };

  if (raw.source === "bid13") return parseBid13(raw);

  const urlId = auctionIdFromUrl(raw.href);
  const stale = Boolean(urlId && raw.payloadId && urlId !== raw.payloadId);

  if (stale) {
    try {
      const html = await fetch(raw.href, { cache: "no-store", credentials: "omit" })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))));
      const fresh = nextDataFromHtml(html);
      if (fresh) return parseStorageTreasures(fresh, raw.href);
    } catch {
      // Fall through: the stale block still lists the other units at this
      // facility, so the right one is usually in there — just read a little
      // earlier than now. Better than refusing, as long as we say so.
    }
    const record = parseStorageTreasures(raw.nextData, raw.href);
    if (!record.problem) record.stale = true;
    return record;
  }

  return parseStorageTreasures(raw.nextData, raw.href);
}

let current = null; // what the page says
let saved = null;   // what we already hold, if anything

function renderListing() {
  $("name").textContent = saved?.nickname || current.auto_name || "Untitled unit";

  const rows = [
    ["Current bid", dollars(current.bid_cents)],
    ["Closes", closing(current.ends_at)],
  ];
  if (typeof current.total_bids === "number") rows.push(["Bids", String(current.total_bids)]);
  if (current.unit_size) rows.push(["Size", current.unit_size]);
  if (current.city) {
    rows.push(["Where", [current.city, current.state].filter(Boolean).join(", ")]);
  }

  $("facts").replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    $("facts").append(dt, dd);
  }

  const btn = $("save");
  btn.textContent = saved ? "Update what we hold" : "Save to watchlist";
  btn.classList.toggle("quiet", Boolean(saved));

  if (saved) {
    const first = saved.first_bid_cents;
    const now = current.bid_cents;
    const moved =
      typeof first === "number" && typeof now === "number" && now !== first;
    $("savednote").textContent = moved
      ? `On your list. ${dollars(first)} when you saved it — ${dollars(now)} now.`
      : "On your list.";
  }
  toggle("savednote", Boolean(saved));
  toggle("stalenote", Boolean(current.stale));
}

async function render() {
  $("error").classList.add("hidden");

  if (!isConfigured()) return show("setup");

  const user = await getUser();
  $("who").textContent = user?.email ?? "";
  show(user ? "signedin" : "signedout");
  if (!user) return;

  let read = null;
  try {
    read = await resolve(await gather());
  } catch (err) {
    // Injection is refused on chrome:// pages, the web store and the like.
    // Anywhere else, a failure here is worth saying out loud rather than
    // reporting as "this isn't a listing".
    read = /cannot be scripted|Extension manifest|Cannot access/i.test(err.message)
      ? null
      : { problem: err.message };
  }

  current = read?.source ? read : null;
  toggle("nolisting", !read);
  toggle("problem", Boolean(read?.problem));
  toggle("listing", Boolean(current));
  if (read?.problem) $("problemwhy").textContent = read.problem;
  if (!current) return;

  saved = await findSaved(current.source, current.external_id);
  renderListing();
}

$("save").addEventListener("click", async (e) => {
  const btn = e.target;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await saveAuction(current);
    saved = await findSaved(current.source, current.external_id);
    renderListing();
  } catch (err) {
    fail(err);
    btn.textContent = label;
  } finally {
    btn.disabled = false;
  }
});

$("signin").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    await signIn();
    await render();
  } catch (err) {
    fail(err);
  } finally {
    e.target.disabled = false;
  }
});

$("signout").addEventListener("click", async () => {
  await signOut();
  await render();
});

$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

render().catch(fail);
