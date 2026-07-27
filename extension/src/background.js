// VYA Cross-Lister — background service worker.
// Bridges the popup ⇄ VYA backend ⇄ the Depop content script. All requests to VYA carry the
// seller's own vyaplatform.com session cookie (credentials: "include" + host_permissions), so the
// seller only ever acts as themselves — on both VYA and Depop.

const VYA = "https://vyaplatform.com";
// Each marketplace's "create listing" page. Add a key here + a content-script adapter to support more.
const CREATE_URL = {
  depop: "https://www.depop.com/products/create/",
  vestiaire: "https://www.vestiairecollective.com/sell/",
  poshmark: "https://poshmark.com/create-listing",
};

async function fetchQueue(platform = "depop") {
  const res = await fetch(`${VYA}/api/extension/queue?platform=${encodeURIComponent(platform)}`, { credentials: "include" });
  if (res.status === 401) throw new Error("401");
  if (!res.ok) throw new Error(`queue ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function reportResult(itemId, status, url, platform = "depop") {
  try {
    await fetch(`${VYA}/api/extension/report`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, platform, status, url: url || null }),
    });
  } catch { /* best effort — the seller can re-sync later */ }
}

// Open a fresh "create listing" tab on the target marketplace, wait for its content script to be
// ready, hand it the item to fill, and relay the result. Semi-automated: we fill photos/caption/
// price, then the seller reviews the marketplace-specific pickers and hits Publish (safer + dodges
// the bot-detection that auto-submit trips). The content script reports the final URL on publish.
async function listItem(platform, item) {
  const url = CREATE_URL[platform];
  if (!url) return { ok: false, error: `Unsupported marketplace: ${platform}` };
  const tab = await chrome.tabs.create({ url, active: true });
  const ready = await waitForContentScript(tab.id, 15000);
  if (!ready) return { ok: false, error: `${platform} page didn't load in time — try again.` };
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "FILL_LISTING", item });
    if (res?.ok) await reportResult(item.id, "pending", null, platform);
    return res || { ok: false, error: `no response from ${platform} page` };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// ── engagement stats ──────────────────────────────────────────────────────────
// The content scripts read like/offer counts off the seller's OWN marketplace pages and send them
// here; we forward to VYA, which folds them into the cross-listing dashboard's roll-up. Same session
// cookie, same act-as-yourself model as listing — we're just reading what the seller already sees.

// Map of marketplace listing URLs → VYA item ids (+ the seller's handle per platform), so a content
// script can attribute a scraped count to the right item and find the seller's shop page to scan.
async function fetchListings() {
  const res = await fetch(`${VYA}/api/extension/listings`, { credentials: "include" });
  if (res.status === 401) throw new Error("401");
  if (!res.ok) throw new Error(`listings ${res.status}`);
  return res.json(); // { ok, listings:[{itemId, platform, url}], handles:{platform:handle} }
}

// Report scraped engagement for one item on one platform. Fire-and-forget.
async function reportStats(itemId, platform, stats) {
  try {
    await fetch(`${VYA}/api/extension/report`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, platform, stats }),
    });
    return true;
  } catch { return false; }
}

// Seller's own shop/closet URL per platform — visiting it lets a content script scan every listing's
// like count in one page load (far better than opening each listing).
function shopUrl(platform, handle) {
  const h = encodeURIComponent(handle);
  if (platform === "depop") return `https://www.depop.com/${h}/`;
  if (platform === "vestiaire") return `https://www.vestiairecollective.com/profile/${h}/`;
  if (platform === "poshmark") return `https://poshmark.com/closet/${h}`;
  return null;
}

// Open the seller's shop page so its content script scrapes like counts on load.
async function syncStats(platform) {
  const data = await fetchListings().catch(() => null);
  const handle = data?.handles?.[platform];
  const url = handle ? shopUrl(platform, handle) : null;
  if (!url) return { ok: false, error: `Connect your ${platform} handle in VYA first.` };
  await chrome.tabs.create({ url, active: true });
  return { ok: true };
}

// Ping the content script until it answers (it may still be booting on document_idle).
async function waitForContentScript(tabId, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const pong = await chrome.tabs.sendMessage(tabId, { type: "PING" });
      if (pong?.ok) return true;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "GET_QUEUE") {
    fetchQueue(msg.platform || "depop").then((items) => sendResponse({ ok: true, items })).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true; // async
  }
  if (msg.type === "LIST_ITEM") {
    listItem(msg.platform || "depop", msg.item).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "PUBLISHED") {
    // Sent by a content script once the seller publishes and we can read the live listing URL. This
    // records the URL, which for no-API channels is also what unlocks stat attribution for the item.
    reportResult(msg.itemId, "listed", msg.url, msg.platform || "depop");
    return false;
  }
  if (msg.type === "GET_LISTINGS") {
    fetchListings().then((d) => sendResponse({ ok: true, ...d })).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "REPORT_STATS") {
    reportStats(msg.itemId, msg.platform, msg.stats).then((ok) => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "SYNC_STATS") {
    syncStats(msg.platform).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  return false;
});
