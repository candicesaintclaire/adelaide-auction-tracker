import { isConfigured } from "./config.js";
import { signIn, signOut, getUser } from "./lib/auth.js";
import { findSaved, saveAuction } from "./lib/db.js";
import { dollars, closing, title } from "./lib/format.js";
import { resolveListing } from "./lib/resolve.js";

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

// Asking the site for a page properly, when what the tab holds won't do.
// The deciding is in lib/resolve.js, where it can be tested; this is only the
// half that needs a network.
const fetchText = (url) =>
  fetch(url, { cache: "no-store", credentials: "omit" }).then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))
  );

let current = null; // what the page says
let saved = null;   // what we already hold, if anything

function renderListing() {
  $("name").textContent = title({ ...current, nickname: saved?.nickname });

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
    read = await resolveListing(await gather(), fetchText);
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
