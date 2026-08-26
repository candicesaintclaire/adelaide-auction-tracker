import { isConfigured } from "./config.js";
import { signIn, signOut, getUser } from "./lib/auth.js";
import { findSaved, saveAuction } from "./lib/db.js";

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
  typeof c === "number" ? "$" + (c / 100).toLocaleString("en-US", {
    minimumFractionDigits: c % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }) : "—";

// "in 3 days", "in 4 hours", "closed" — a duration reads faster than a date
// when the only question is whether there's still time.
function closing(iso) {
  if (!iso) return "—";
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "closed";
  const hours = ms / 3.6e6;
  if (hours < 1) return `in ${Math.round(ms / 6e4)} min`;
  if (hours < 48) return `in ${Math.round(hours)} hr`;
  return `in ${Math.round(hours / 24)} days`;
}

// Read the page the person is actually looking at. This runs only because
// they opened the popup — there is no content script sitting on these sites.
async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const [hit] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/extract.js"],
    });
    return hit?.result ?? null;
  } catch {
    // Injection is refused on chrome:// pages, the web store, and the like.
    return null;
  }
}

let current = null;   // what the page says
let saved = null;     // what we already hold, if anything

function renderListing() {
  $("name").textContent = saved?.nickname || current.auto_name || "Untitled unit";

  const rows = [
    ["Current bid", dollars(current.bid_cents)],
    ["Closes", closing(current.ends_at)],
  ];
  if (current.unit_size) rows.push(["Size", current.unit_size]);
  if (current.city) rows.push(["Where", [current.city, current.state].filter(Boolean).join(", ")]);

  $("facts").innerHTML = "";
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
    const moved = typeof first === "number" && typeof now === "number" && now !== first;
    $("savednote").textContent = moved
      ? `On your list. ${dollars(first)} when you saved it — ${dollars(now)} now.`
      : "On your list.";
  }
  toggle("savednote", Boolean(saved));
}

async function render() {
  $("error").classList.add("hidden");

  if (!isConfigured()) return show("setup");

  const user = await getUser();
  $("who").textContent = user?.email ?? "";
  show(user ? "signedin" : "signedout");
  if (!user) return;

  const read = await readActiveTab();
  const unreadable = read?.problem ?? null;
  current = read?.source ? read : null;

  toggle("nolisting", !read);
  toggle("problem", Boolean(unreadable));
  toggle("listing", Boolean(current));
  if (unreadable) $("problemwhy").textContent = unreadable;
  if (!current) return;

  saved = await findSaved(current.source, current.external_id);
  renderListing();
}

$("save").addEventListener("click", async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await saveAuction(current);
    saved = await findSaved(current.source, current.external_id);
    renderListing();
  } catch (err) {
    fail(err);
    btn.textContent = "Save to watchlist";
  } finally {
    btn.disabled = false;
  }
});

$("signin").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try { await signIn(); await render(); }
  catch (err) { fail(err); }
  finally { e.target.disabled = false; }
});

$("signout").addEventListener("click", async () => {
  await signOut();
  await render();
});

$("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

render().catch(fail);
