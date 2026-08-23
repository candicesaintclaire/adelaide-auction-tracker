const alarmPrefix = "auction-close-";
const badgeTickAlarm = "auction-badge-tick";

function badgeText(nextWhen) {
  const remaining = nextWhen - Date.now();
  if (remaining <= 0) return "NOW";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

async function updateCountdownBadge() {
  const { nextReminderAt } = await chrome.storage.local.get("nextReminderAt");
  if (!nextReminderAt || nextReminderAt <= Date.now()) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  await chrome.action.setBadgeText({ text: badgeText(nextReminderAt) });
  await chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "sync-reminders") return;
  const { entries, defaultReminderMinutes } = message;
  chrome.alarms.getAll().then(async alarms => {
    await Promise.all(alarms.filter(alarm => alarm.name.startsWith(alarmPrefix)).map(alarm => chrome.alarms.clear(alarm.name)));
    let nextReminderAt = null;
    for (const entry of entries || []) {
      if (!entry.reminderEnabled || !entry.endAt) continue;
      const lead = entry.reminderOffsetMinutes ?? defaultReminderMinutes ?? 60;
      const when = new Date(entry.endAt).getTime() - lead * 60_000;
      if (Number.isFinite(when) && when > Date.now()) {
        await chrome.alarms.create(`${alarmPrefix}${entry.entryId}`, { when });
        nextReminderAt = nextReminderAt === null ? when : Math.min(nextReminderAt, when);
      }
    }
    await chrome.storage.local.set({ nextReminderAt });
    await chrome.alarms.create(badgeTickAlarm, { periodInMinutes: 1 });
    await updateCountdownBadge();
    sendResponse?.({ nextReminderAt });
  });
  return true;
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === badgeTickAlarm) return updateCountdownBadge();
  if (!alarm.name.startsWith(alarmPrefix)) return;
  const entryId = alarm.name.slice(alarmPrefix.length);
  await chrome.notifications.create(`auction-watchlist-${entryId}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "Auction Watchlist reminder",
    message: "A saved auction is approaching its scheduled close time. Open your watchlist to review it.",
    priority: 2,
  });
  const alarms = await chrome.alarms.getAll();
  const next = alarms.filter(item => item.name.startsWith(alarmPrefix)).map(item => item.scheduledTime).filter((when) => when > Date.now()).sort((a, b) => a - b)[0] ?? null;
  await chrome.storage.local.set({ nextReminderAt: next });
  await updateCountdownBadge();
});
