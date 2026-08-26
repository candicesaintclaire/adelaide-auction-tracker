// The watchlist, as an ordinary web page.
//
// Everything below the surface is the extension's: same auth, same database
// module, same formatting. What differs is that a page cannot read an auction
// site — the browser forbids it — so nothing here re-reads anything. It shows
// what was saved, and says so.

import { isConfigured } from "../extension/config.js";
import { signIn, signOut, getUser, adoptRedirect } from "../extension/lib/auth.js";
import { listAuctions, setNickname } from "../extension/lib/db.js";
import {
  dollars,
  closing,
  byClosing,
  hasEnded,
  title,
  SOURCE_NAMES,
} from "../extension/lib/format.js";

const $ = (id) => document.getElementById(id);

const show = (id) => {
  for (const el of document.querySelectorAll("#setup, #signedout, #signedin")) {
    el.hidden = el.id !== id;
  }
};

const fail = (e) => {
  $("error").textContent = e?.message || String(e);
  $("error").hidden = false;
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// ── one saved unit ────────────────────────────────────────────

function thumbnail(row) {
  const url = row.auction_photos?.[0]?.url;
  const link = el("a", "thumb");
  link.href = row.canonical_url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  if (!url) {
    link.classList.add("blank");
    link.textContent = "no photo";
    return link;
  }
  const img = el("img");
  img.src = url;
  img.loading = "lazy";
  img.alt = "";
  // A photo the site has since removed shouldn't leave a broken frame.
  img.addEventListener("error", () => {
    link.classList.add("blank");
    link.textContent = "no photo";
    img.remove();
  });
  link.append(img);
  return link;
}

function figures(row, now) {
  const box = el("div", "figures");
  box.append(el("span", "bid", dollars(row.bid_cents)));

  // What it was when saved, when that is a different number. Nothing re-reads
  // yet, so this stays quiet until the refresh lands — which is the honest
  // state of things rather than an omission.
  const first = row.first_bid_cents;
  if (typeof first === "number" && typeof row.bid_cents === "number" && first !== row.bid_cents) {
    const was = el("span", "was", `was ${dollars(first)}`);
    if (row.bid_cents > first) was.classList.add("up");
    box.append(was);
  } else if (row.total_bids === 0) {
    box.append(el("span", "was", "no bids"));
  }

  const when = el("span", "when", closing(row.ends_at, now));
  const ms = row.ends_at ? new Date(row.ends_at) - now : NaN;
  if (ms > 0 && ms < 12 * 3.6e6) when.classList.add("soon");
  box.append(when);
  return box;
}

function rowEl(row, now) {
  const li = el("li", "row");
  li.dataset.id = row.id;
  if (hasEnded(row, now)) li.classList.add("gone");

  const main = el("div", "main");
  const name = el("a", "name", title(row));
  name.href = row.canonical_url;
  name.target = "_blank";
  name.rel = "noreferrer noopener";

  const meta = [
    SOURCE_NAMES[row.source] ?? row.source,
    row.unit_size,
    [row.city, row.state].filter(Boolean).join(", ") || null,
  ].filter(Boolean);

  main.append(name, el("p", "meta", meta.join(" · ")));

  const tools = el("div", "tools");
  const rename = el("button", "rename", row.nickname ? "Rename" : "Give it a name");
  rename.addEventListener("click", () => startRename(li, row));
  tools.append(rename);

  li.append(thumbnail(row), main, figures(row, now), tools);
  return li;
}

// ── nicknames ─────────────────────────────────────────────────
//
// The one field a person owns. db.js has always refused to overwrite it on a
// save; this is the first thing that offers to set it.

function startRename(li, row) {
  const main = li.querySelector(".main");
  const name = main.querySelector(".name");
  if (!name) return;                       // already editing

  const input = el("input", "nameedit");
  input.value = row.nickname ?? "";
  input.placeholder = row.auto_name ?? "A name for this unit";
  input.setAttribute("aria-label", "Name for this unit");
  name.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const restore = (text) => {
    const back = el("a", "name", text);
    back.href = row.canonical_url;
    back.target = "_blank";
    back.rel = "noreferrer noopener";
    input.replaceWith(back);
  };

  const commit = async () => {
    if (settled) return;
    settled = true;
    const wanted = input.value.trim();
    if (wanted === (row.nickname ?? "")) return restore(title(row));

    input.disabled = true;
    try {
      const updated = await setNickname(row.id, wanted);
      row.nickname = updated?.nickname ?? null;
      // Blank means "go back to the site's name", not "no name at all".
      restore(title(row));
      li.querySelector(".rename").textContent = row.nickname ? "Rename" : "Give it a name";
    } catch (err) {
      restore(title(row));
      fail(err);
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { settled = true; restore(title(row)); }
  });
  input.addEventListener("blur", commit);
}

// ── the page ──────────────────────────────────────────────────

async function renderList() {
  $("loading").hidden = false;
  $("reload").disabled = true;
  try {
    const rows = await listAuctions();
    const now = Date.now();
    const { open, ended } = byClosing(rows, now);

    $("open").replaceChildren(...open.map((r) => rowEl(r, now)));
    $("ended").replaceChildren(...ended.map((r) => rowEl(r, now)));
    $("endedhead").hidden = ended.length === 0;
    $("empty").hidden = rows.length > 0;
    $("error").hidden = true;
  } catch (err) {
    fail(err);
  } finally {
    $("loading").hidden = true;
    $("reload").disabled = false;
  }
}

async function render() {
  if (!isConfigured()) return show("setup");

  const user = await getUser();
  $("who").textContent = user?.email ?? "";
  $("reload").hidden = !user;
  show(user ? "signedin" : "signedout");
  if (user) await renderList();
}

$("signin").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    await signIn();          // navigates away; nothing after this runs
  } catch (err) {
    fail(err);
    e.target.disabled = false;
  }
});

$("signout").addEventListener("click", async () => {
  await signOut();
  await render();
});

$("reload").addEventListener("click", renderList);

// Coming back from Google, the session is on the fragment. Take it before
// anything asks whether we are signed in — and take it off the address bar
// whether it worked or not.
adoptRedirect()
  .catch(fail)
  .then(render)
  .catch(fail);

// Offline shell only. Nothing runs in the background, here as anywhere else.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* an app that will not cache is still an app that works */
    });
  });
}
