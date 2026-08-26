const $ = selector => document.querySelector(selector);
let config;
let activePage;
let watchlistEntries = [];

async function getConfig() { return chrome.storage.sync.get(["apiBase", "extensionToken"]); }
function apiUrl(path) { return `${config.apiBase.replace(/\/$/, "")}${path}`; }
async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), { ...options, headers: { "Authorization": `Bearer ${config.extensionToken}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The watchlist connection could not complete.");
  return body;
}
function status(message) { $("#status").textContent = message; }
function label(entry) { return entry.customName || entry.unitLabel || "Saved auction"; }
function renderRecent(entries) {
  $("#recent").classList.remove("hidden");
  $("#recent-list").replaceChildren(...entries.slice(0, 3).map(entry => {
    const item = document.createElement("div"); item.className = "row";
    item.innerHTML = `<div><div class="row-title">${label(entry)}</div><div class="row-subtitle">${entry.facilityName || entry.locationLabel || "Details awaiting enrichment"}</div></div><span class="tag">${entry.source === "bid13" ? "Bid13" : "StorageTreasures"}</span>`;
    return item;
  }));
}
function updateCurrentPageState() {
  const saved = activePage?.url && watchlistEntries.find(entry => entry.canonicalUrl === activePage.url);
  if (saved) { $("#save").textContent = "Refresh saved auction"; $("#save").dataset.entryId = String(saved.entryId); }
  else { $("#save").textContent = "Save to watchlist"; delete $("#save").dataset.entryId; }
}

async function syncAlarms(entries, defaultReminderMinutes) { chrome.runtime.sendMessage({ type: "sync-reminders", entries, defaultReminderMinutes }); }
async function loadRecent(triggerRefresh) {
  if (triggerRefresh) await api("/api/extension/refresh", { method: "POST", body: "{}" });
  const data = await api("/api/extension/recent");
  watchlistEntries = data.reminderEntries || data.entries;
  renderRecent(data.entries);
  updateCurrentPageState();
  await chrome.storage.local.set({ recentCache: { entries: data.entries, allEntries: watchlistEntries, defaultReminderMinutes: data.defaultReminderMinutes, savedAt: Date.now() } });
  await syncAlarms(data.reminderEntries || data.entries, data.defaultReminderMinutes);
}

async function initialize() {
  config = await getConfig();
  if (!config.apiBase || !config.extensionToken) { $("#connection").classList.remove("hidden"); return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) activePage = await chrome.tabs.sendMessage(tab.id, { type: "auction-page" }).catch(() => null);
  if (activePage?.isCandidate) { $("#page").classList.remove("hidden"); $("#page-title").textContent = activePage.title || "Public auction listing"; $("#page-source").textContent = activePage.source === "bid13" ? "Bid13 public listing" : "StorageTreasures public listing"; }
  const { recentCache } = await chrome.storage.local.get("recentCache");
  if (recentCache?.entries) { watchlistEntries = recentCache.allEntries || recentCache.entries; renderRecent(recentCache.entries); updateCurrentPageState(); status(`Showing saved data from ${new Date(recentCache.savedAt).toLocaleTimeString()}.`); }
  const permission = await chrome.notifications.getPermissionLevel();
  $("#notification-state").textContent = permission === "granted" ? "Close-time alerts are allowed in Chrome." : "Chrome alerts are disabled; enable notifications in your browser settings.";
  // Opening the popup is an explicit user action. It may request one refresh;
  // background.js never calls this function or the marketplace refresh endpoint.
  try { await loadRecent(true); status("Ready."); } catch (error) { status(error.message); }
}

$("#settings").onclick = () => chrome.runtime.openOptionsPage();
$("#connect").onclick = () => chrome.runtime.openOptionsPage();
$("#open-dashboard").onclick = () => config?.apiBase && chrome.tabs.create({ url: config.apiBase });
$("#refresh").onclick = async () => { status("Refreshing your saved links…"); await chrome.storage.local.set({ refreshProgress: "refreshing" }); try { await loadRecent(true); status("Refresh requested."); } catch (error) { status(error.message); } finally { await chrome.storage.local.set({ refreshProgress: "idle", lastRefreshAt: Date.now() }); } };
$("#save").onclick = async () => { if (!activePage?.url) return; $("#save").disabled = true; const entryId = Number($("#save").dataset.entryId); status(entryId ? "Requesting an update…" : "Saving auction…"); try { if (entryId) { await api("/api/extension/save", { method: "POST", body: JSON.stringify({ url: activePage.url, captured: activePage.capture }) }); status("Captured page data for this saved auction."); } else { await api("/api/extension/save", { method: "POST", body: JSON.stringify({ url: activePage.url, captured: activePage.capture }) }); status("Auction and visible page details saved."); } await loadRecent(false); } catch (error) { status(error.message); } finally { $("#save").disabled = false; } };
initialize();
