(() => {
  const blocked = new Set(["account", "admin", "login", "logout", "register", "search", "user"]);
  const source = location.hostname === "bid13.com" ? "bid13" : location.hostname === "www.storagetreasures.com" ? "storagetreasures" : null;
  const segments = location.pathname.split("/").filter(Boolean).map(part => part.toLowerCase());
  const isCandidate = Boolean(source && segments.length && !segments.some(part => blocked.has(part)));

  function bodyText() {
    return (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 20_000);
  }
  function money(pattern) {
    const match = bodyText().match(pattern);
    if (!match) return undefined;
    const parsed = Number.parseFloat(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
  }
  function labeled(pattern) {
    return bodyText().match(pattern)?.[1]?.replace(/\s+/g, " ").trim() || undefined;
  }
  function capture() {
    if (!isCandidate) return undefined;
    const text = bodyText();
    const imageUrl = document.querySelector('meta[property="og:image"]')?.getAttribute("content")
      || [...document.images].map(image => image.currentSrc || image.src).find(url => /^https?:\/\//i.test(url));
    const exactEnd = document.querySelector("time[datetime], [data-end-time], [data-end-at]")?.getAttribute("datetime")
      || document.querySelector("[data-end-time], [data-end-at]")?.getAttribute("data-end-time")
      || document.querySelector("[data-end-at]")?.getAttribute("data-end-at");
    return {
      title: document.title,
      facilityName: labeled(/(?:facility|storage\s+facility)\s*:\s*([^|;]+)/i),
      unitLabel: labeled(/(?:unit|auction)\s*(?:number|#|label)?\s*:\s*([^|;]+)/i),
      unitSize: labeled(/(?:unit\s+size|size)\s*:\s*([^|;]+)/i),
      locationLabel: labeled(/location\s*:\s*([^|;]+)/i),
      currentBidCents: money(/current\s+(?:high\s+)?bid\s*[:$]?\s*\$?([\d,.]+)/i),
      bidLabel: /starting\s+bid/i.test(text) && !/current\s+(?:high\s+)?bid/i.test(text) ? "starting" : "current",
      cleaningDepositCents: money(/(?:cleaning\s+|refund\s+)?deposit\s*[:$]?\s*\$?([\d,.]+)/i),
      endTimeRaw: labeled(/(?:auction\s+)?(?:ends?|closing)\s*(?:date|time)?\s*:\s*([^|;]+)/i),
      endAt: exactEnd,
      imageUrl,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "auction-page") return;
    sendResponse({ source, isCandidate, url: location.href, title: document.title, imageUrl: capture()?.imageUrl, capture: capture() });
  });
})();
