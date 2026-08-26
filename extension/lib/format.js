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
