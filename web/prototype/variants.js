// PROTOTYPE — throwaway. Lives on branch prototype/watchlist-ui, never main.
//
// Three structurally different watchlists, each answering "what matters most
// when she opens this?" differently. Variant A is today's page, rendered by
// app.js itself, so it is the baseline rather than a copy of it.
//
//   B  Countdown — time is the point: grouped by how long is left.
//   C  Gallery   — the unit is the point: photo first, figures on top of it.
//   D  Ledger    — comparison is the point: one line each, sortable columns.
//
// Read-only on purpose. Renaming stays on A; the question here is layout.

import { dollars, closing, byClosing, hasEnded, title, SOURCE_NAMES } from "../../extension/lib/format.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const link = (row, className, text) => {
  const a = el("a", className, text);
  a.href = row.canonical_url;
  a.target = "_blank";
  a.rel = "noreferrer noopener";
  return a;
};

const soon = (row, now) => {
  const ms = row.ends_at ? new Date(row.ends_at) - now : NaN;
  return ms > 0 && ms < 12 * 3.6e6;
};

const place = (row) => [row.city, row.state].filter(Boolean).join(", ");

function photo(row, className) {
  const box = link(row, className);
  const url = row.auction_photos?.[0]?.url;
  const blank = () => { box.classList.add("blank"); box.textContent = "no photo"; };
  if (!url) { blank(); return box; }
  const img = el("img");
  img.src = url; img.loading = "lazy"; img.alt = "";
  img.addEventListener("error", () => { img.remove(); blank(); });
  box.append(img);
  return box;
}

// What moved, or "no bids" — the same honesty rules as the real page.
function bidNote(row) {
  const first = row.first_bid_cents;
  if (typeof first === "number" && typeof row.bid_cents === "number" && first !== row.bid_cents) {
    return { text: `was ${dollars(first)}`, up: row.bid_cents > first };
  }
  if (row.total_bids === 0) return { text: "no bids", up: false };
  return null;
}

// ── B · Countdown ────────────────────────────────────────────

const BUCKETS = [
  ["Closing in the next 12 hours", (h) => h < 12],
  ["Within two days", (h) => h < 48],
  ["This week", (h) => h < 24 * 7],
  ["Later", () => true],
];

export function VariantB(rows, now) {
  const root = el("div", "pv-countdown");
  const { open, ended } = byClosing(rows, now);
  const groups = new Map(BUCKETS.map(([label]) => [label, []]));
  const undated = [];
  for (const row of open) {
    if (!row.ends_at) { undated.push(row); continue; }
    const hours = (new Date(row.ends_at) - now) / 3.6e6;
    groups.get(BUCKETS.find(([, test]) => test(hours))[0]).push(row);
  }

  const item = (row) => {
    const li = el("li", "pv-cd-item");
    if (hasEnded(row, now)) li.classList.add("gone");
    const left = el("div", "pv-cd-left", row.ends_at ? closing(row.ends_at, now).replace(/^in /, "") : "—");
    if (soon(row, now)) left.classList.add("soon");
    const mid = el("div", "pv-cd-mid");
    mid.append(link(row, "pv-name", title(row)),
      el("p", "pv-meta", [SOURCE_NAMES[row.source], row.unit_size, place(row)].filter(Boolean).join(" · ")));
    const right = el("div", "pv-cd-right");
    right.append(el("span", "pv-bid", dollars(row.bid_cents)));
    const note = bidNote(row);
    if (note) right.append(el("span", "pv-note" + (note.up ? " up" : ""), note.text));
    li.append(left, mid, right);
    return li;
  };

  const section = (label, list, extra) => {
    if (!list.length) return;
    const h = el("h2", "pv-cd-head", label);
    if (extra) h.append(el("span", "pv-cd-extra", extra));
    const ul = el("ul", "pv-cd-list");
    ul.append(...list.map(item));
    root.append(h, ul);
  };

  for (const [label, list] of groups) section(label, list);
  section("No closing time yet", undated, "Coming Soon, or not published");
  section("Ended", ended);
  return root;
}

// ── C · Gallery ──────────────────────────────────────────────

export function VariantC(rows, now) {
  const root = el("div", "pv-gallery");
  const { open, ended } = byClosing(rows, now);

  const card = (row) => {
    const li = el("li", "pv-card");
    if (hasEnded(row, now)) li.classList.add("gone");
    const frame = el("div", "pv-frame");
    frame.append(photo(row, "pv-photo"));
    const time = el("span", "pv-badge pv-time", hasEnded(row, now) ? "ended" : closing(row.ends_at, now));
    if (soon(row, now)) time.classList.add("soon");
    const bid = el("span", "pv-badge pv-bidbadge", dollars(row.bid_cents));
    const count = row.auction_photos?.length ?? 0;
    frame.append(time, bid);
    if (count > 1) frame.append(el("span", "pv-badge pv-count", `${count} photos`));
    const body = el("div", "pv-card-body");
    body.append(link(row, "pv-name", title(row)),
      el("p", "pv-meta", [row.unit_size, SOURCE_NAMES[row.source]].filter(Boolean).join(" · ")),
      el("p", "pv-meta", place(row)));
    const note = bidNote(row);
    if (note) body.append(el("p", "pv-note" + (note.up ? " up" : ""), note.text));
    li.append(frame, body);
    return li;
  };

  const grid = (list) => { const ul = el("ul", "pv-grid"); ul.append(...list.map(card)); return ul; };
  root.append(grid(open));
  if (ended.length) root.append(el("h2", null, "Ended"), grid(ended));
  return root;
}

// ── D · Ledger ───────────────────────────────────────────────

const COLUMNS = [
  { key: "name", label: "Unit", value: (r) => title(r).toLowerCase() },
  { key: "site", label: "Site", value: (r) => r.source, cls: "pv-hide-narrow" },
  { key: "size", label: "Size", value: (r) => sizeArea(r.unit_size) },
  { key: "bid", label: "Bid", value: (r) => r.bid_cents ?? -1, num: true },
  { key: "ends", label: "Closes", value: (r) => (r.ends_at ? new Date(r.ends_at).getTime() : Infinity), num: true },
];

// "10x15" sorts as 150 sq ft, not as text.
function sizeArea(s) {
  const m = /(\d+)\s*x\s*(\d+)/i.exec(s ?? "");
  return m ? m[1] * m[2] : -1;
}

let ledgerSort = { key: "ends", dir: 1 };

export function VariantD(rows, now, rerender) {
  const root = el("div", "pv-ledger");
  const col = COLUMNS.find((c) => c.key === ledgerSort.key);
  const sorted = (list) =>
    [...list].sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * ledgerSort.dir;
    });
  const { open, ended } = byClosing(rows, now);

  const table = el("table", "pv-table");
  const head = el("tr");
  for (const c of COLUMNS) {
    const th = el("th", [c.cls, c.num && "num"].filter(Boolean).join(" ") || null);
    const b = el("button", "pv-sort", c.label + (c.key === ledgerSort.key ? (ledgerSort.dir > 0 ? " ↑" : " ↓") : ""));
    b.addEventListener("click", () => {
      ledgerSort = { key: c.key, dir: c.key === ledgerSort.key ? -ledgerSort.dir : 1 };
      rerender();
    });
    th.append(b);
    head.append(th);
  }
  table.append(el("thead"));
  table.tHead.append(head);

  const body = el("tbody");
  const line = (row) => {
    const tr = el("tr");
    if (hasEnded(row, now)) tr.classList.add("gone");
    const name = el("td", "pv-td-name");
    name.append(link(row, "pv-name", title(row)));
    const note = bidNote(row);
    const bid = el("td", "num");
    bid.append(el("span", "pv-bid", dollars(row.bid_cents)));
    if (note) bid.append(el("span", "pv-note" + (note.up ? " up" : ""), note.text));
    const ends = el("td", "num pv-when", hasEnded(row, now) ? "ended" : closing(row.ends_at, now));
    if (soon(row, now)) ends.classList.add("soon");
    tr.append(name,
      el("td", "pv-hide-narrow pv-site", row.source === "bid13" ? "Bid13" : "ST"),
      el("td", "pv-size", row.unit_size ?? "—"), bid, ends);
    return tr;
  };
  body.append(...sorted(open).map(line));
  if (ended.length) {
    const sep = el("tr", "pv-sep");
    const td = el("td", null, "Ended");
    td.colSpan = COLUMNS.length;
    sep.append(td);
    body.append(sep, ...sorted(ended).map(line));
  }
  table.append(body);

  const total = open.reduce((s, r) => s + (r.bid_cents ?? 0), 0);
  const foot = el("p", "pv-foot",
    `${open.length} open · ${dollars(total)} in current bids across them · click a column to sort`);
  root.append(table, foot);
  return root;
}

export const VARIANTS = [
  { key: "A", name: "Today's list" },
  { key: "B", name: "Countdown", render: VariantB },
  { key: "C", name: "Gallery", render: VariantC },
  { key: "D", name: "Ledger", render: VariantD },
];
