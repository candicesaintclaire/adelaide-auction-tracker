// Deciding which reading to trust: the data block already in the tab, or the
// page fetched again.
//
// This is orchestration rather than parsing, and it lived inside popup.js
// where no test could reach it — which is how it came to mishandle arriving at
// a unit from a search page. It takes a fetcher instead of calling fetch
// itself, so it can be checked without a network or a browser.

import {
  parseStorageTreasures,
  parseBid13,
  nextDataFromHtml,
  auctionIdFromUrl,
} from "./parse.js";

export async function resolveListing(raw, fetchText) {
  if (!raw) return null;
  if (raw.problem) return { problem: raw.problem };

  // Bid13 serves ordinary pages, so the document always belongs to the URL.
  if (raw.source === "bid13") return parseBid13(raw);

  const urlId = auctionIdFromUrl(raw.href);
  const fromPage = () => parseStorageTreasures(raw.nextData, raw.href);

  // The block describes whichever page this tab loaded FIRST. When that was
  // another listing, its id gives it away. When it was a search or a facility
  // page there is no `pageProps.auction_id` at all — nothing to compare, so
  // the mismatch is invisible here and only shows up as a failed read.
  const mismatched = Boolean(urlId && raw.payloadId && urlId !== raw.payloadId);

  if (!mismatched) {
    const read = fromPage();
    if (!read.problem || !urlId) return read;
  }
  if (!urlId) return fromPage();

  // Ask the site for this page properly. One request, on a deliberate click,
  // and only once what the tab already holds has been found wanting.
  try {
    const fresh = nextDataFromHtml(await fetchText(raw.href));
    if (fresh) {
      const record = parseStorageTreasures(fresh, raw.href);
      if (!record.problem) return record;
    }
  } catch {
    // Fall through: the block still lists the other units at this facility,
    // so the right one is often in there — just read a little earlier than
    // now. Better than refusing, as long as we say so.
  }

  const fallback = fromPage();
  if (!fallback.problem) fallback.stale = true;
  return fallback;
}
