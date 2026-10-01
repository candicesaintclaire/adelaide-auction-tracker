// How a figure or a time is written. Shared by the popup and the web app, so
// the same bid never reads two different ways in two places.
//
// Every function here takes `now` rather than reading the clock, which is what
// makes them testable.

export const dollars = (c) =>
  typeof c === "number"
    ? "$" +
      (c / 100).toLocaleString("en-US", {
        minimumFractionDigits: c % 100 ? 2 : 0,
        maximumFractionDigits: 2,
      })
    : "—";

// "in 3 days", "in 4 hr" — a duration reads faster than a date when the only
// question is whether there is still time.
export function closing(iso, now = Date.now()) {
  const ms = iso ? new Date(iso) - now : NaN;
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "closed";
  const hours = ms / 3.6e6;
  if (hours < 1) return `in ${Math.round(ms / 6e4)} min`;
  if (hours < 48) return `in ${Math.round(hours)} hr`;
  return `in ${Math.round(hours / 24)} days`;
}

// The same span, looking backwards: how old a reading is.
export function ago(iso, now = Date.now()) {
  const ms = iso ? now - new Date(iso) : NaN;
  if (Number.isNaN(ms)) return "—";
  if (ms < 9e4) return "just now";
  const hours = ms / 3.6e6;
  if (hours < 1) return `${Math.round(ms / 6e4)} min ago`;
  if (hours < 48) return `${Math.round(hours)} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export const hasEnded = (row, now = Date.now()) =>
  row?.status === "ended" || Boolean(row?.ends_at && new Date(row.ends_at) <= now);

// Soonest to close first. A listing with no closing time can't be ranked
// against ones that have one, so it goes last rather than pretending to be
// urgent. Ended ones are shown separately, most recently closed first.
export function byClosing(rows, now = Date.now()) {
  const at = (r) => (r.ends_at ? new Date(r.ends_at).getTime() : null);
  const open = [];
  const ended = [];
  for (const row of rows ?? []) (hasEnded(row, now) ? ended : open).push(row);

  open.sort((a, b) => (at(a) ?? Infinity) - (at(b) ?? Infinity));
  ended.sort((a, b) => (at(b) ?? -Infinity) - (at(a) ?? -Infinity));
  return { open, ended };
}

// What a listing is called: what she typed, or what the site implied.
export const title = (row) => row?.nickname?.trim() || row?.auto_name || "Untitled unit";

export const SOURCE_NAMES = {
  storagetreasures: "StorageTreasures",
  bid13: "Bid13",
};

// ── the watchlist's countdown ─────────────────────────────────
//
// The web page's own wording, so the popup's "Closes" label beside closing()
// stays as it is. Inside the last hour it ticks in minutes and seconds — the
// sites publish their closing times to the second, and so do we.
export function closesText(iso, now = Date.now()) {
  const ms = iso ? new Date(iso) - now : NaN;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Closed";
  // Days are rounded, so they say so: 52 hours reads "~2 days" while sitting
  // under "This week", and the tilde keeps the two from contradicting.
  if (ms > 3.6e6) return `Closes ${closing(iso, now).replace(/^in (\d+ days)$/, "in ~$1")}`;
  const secs = Math.ceil(ms / 1000);
  return `Closes in ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

// The watchlist's headings, tightest first. Each bound is inclusive: a unit
// exactly two days out is "within 2 days", one second more is "this week".
// "2 days" rather than "48 hours", so a heading doesn't sound more exact than
// it is.
const MIN = 6e4;
const COUNTDOWN = [
  ["Closing within 10 min", 10 * MIN],
  ["Within 30 min", 30 * MIN],
  ["Within 60 min", 60 * MIN],
  ["Within 2 hours", 120 * MIN],
  ["Within 6 hours", 360 * MIN],
  ["Within 24 hours", 1440 * MIN],
  ["Within 2 days", 2880 * MIN],
  ["This week", 7 * 1440 * MIN],
  ["Later", Infinity],
];

export function countdownGroup(row, now = Date.now()) {
  if (hasEnded(row, now)) return "Ended";
  const ms = row.ends_at ? new Date(row.ends_at) - now : NaN;
  if (Number.isNaN(ms)) return "No closing time yet";
  return COUNTDOWN.find(([, bound]) => ms <= bound)[0];
}

// The whole watchlist as headed groups, top to bottom. Order within a group is
// byClosing's: soonest first, most recently ended first. Empty headings are
// left out.
const GROUP_ORDER = [...COUNTDOWN.map(([label]) => label), "No closing time yet", "Ended"];

export function byCountdown(rows, now = Date.now()) {
  const { open, ended } = byClosing(rows, now);
  const groups = new Map(GROUP_ORDER.map((label) => [label, []]));
  for (const row of [...open, ...ended]) groups.get(countdownGroup(row, now)).push(row);
  return [...groups].filter(([, list]) => list.length).map(([label, rows]) => ({ label, rows }));
}
