// VYA Cross-Lister — Poshmark adapter (content script).
// Two jobs on poshmark.com, in the seller's own logged-in session:
//   1. Fill the "create listing" form from a VYA item (photos, title, description, price), then the
//      seller confirms category/size/brand and hits Publish. On publish we capture the new listing
//      URL and report it — which is ALSO what unlocks stat attribution for Poshmark.
//   2. Read the like count off the seller's own listing/closet pages and report it to VYA.
//
// ⚠️ Poshmark's sell-form + like-count selectors are best-effort and MUST be verified against the
//    seller's live (logged-in) DOM — the public listing page shows a Like button but no count, so
//    the count location needs a logged-in-owner pass. The plumbing around them is production-grade.

// ── listing fill ──────────────────────────────────────────────────────────────
const SEL = {
  photoInput: 'input[type="file"][accept*="image"], input[type="file"]',
  title: 'input[data-vv-name="title"], input[name="title"], input[placeholder*="title" i]',
  description: 'textarea[data-vv-name="description"], textarea[placeholder*="describe" i], textarea',
  price: 'input[data-vv-name="listing_price"], input[name="price"], input[placeholder*="price" i]',
};

async function urlToFile(url, name) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
async function uploadPhotos(images) {
  const input = document.querySelector(SEL.photoInput);
  if (!input || !images?.length) return 0;
  const dt = new DataTransfer();
  for (let i = 0; i < images.length; i++) {
    try { dt.items.add(await urlToFile(images[i], `vya-photo-${i + 1}.jpg`)); } catch { /* skip broken */ }
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return dt.files.length;
}
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value); else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
async function fillListing(item) {
  const filled = { photos: 0, title: false, description: false, price: false };
  filled.photos = await uploadPhotos(item.images || []);
  const title = document.querySelector(SEL.title);
  if (title) { setNativeValue(title, item.title || ""); filled.title = true; }
  const desc = document.querySelector(SEL.description);
  if (desc) { setNativeValue(desc, item.body || item.title || ""); filled.description = true; }
  const price = document.querySelector(SEL.price);
  if (price && item.priceDollars != null) { setNativeValue(price, String(item.priceDollars)); filled.price = true; }
  try { sessionStorage.setItem("vya_pending_item", item.id); } catch { /* ignore */ }
  return {
    ok: filled.photos > 0 || filled.title || filled.description || filled.price,
    filled,
    needsReview: true,
    note: "Filled photos, title, description & price. Confirm category/size/brand and hit List.",
  };
}
// After the seller publishes, Poshmark routes to /listing/<slug>-<id> — capture + report it.
function watchForPublish() {
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    const m = location.href.match(/poshmark\.com\/listing\/[^/?#]+/i);
    if (!m) return;
    let itemId = null;
    try { itemId = sessionStorage.getItem("vya_pending_item"); } catch { /* ignore */ }
    if (itemId) {
      chrome.runtime.sendMessage({ type: "PUBLISHED", platform: "poshmark", itemId, url: `https://${m[0]}` });
      try { sessionStorage.removeItem("vya_pending_item"); } catch { /* ignore */ }
    }
  }, 1500);
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PING") { sendResponse({ ok: true }); return false; }
  if (msg.type === "FILL_LISTING") {
    fillListing(msg.item).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true;
  }
  return false;
});
watchForPublish();

// ── engagement scraping (likes + best-effort offers) ────────────────────────────
let _listings = null;
function getListings() {
  if (_listings) return Promise.resolve(_listings);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_LISTINGS" }, (r) => {
      _listings = r && r.ok ? r : { listings: [], handles: {} };
      resolve(_listings);
    });
  });
}
function reportStats(itemId, stats) {
  chrome.runtime.sendMessage({ type: "REPORT_STATS", platform: "poshmark", itemId, stats });
}
// Poshmark listing URLs look like /listing/<slug>-<24hexid>; the trailing id is the stable key.
const poshId = (u) => { const m = String(u || "").match(/poshmark\.com\/listing\/[^/?#]*?([a-f0-9]{20,})/i); return m ? m[1].toLowerCase() : null; };
function parseCount(text) {
  const m = String(text || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = (m[2] || "").toLowerCase();
  if (suf === "k") n *= 1e3; else if (suf === "m") n *= 1e6;
  return Math.round(n);
}

// The public listing shows a Like button (div[data-et-name="like"]) with no count; the seller's own
// view carries the number nearby / in a "N likes" string. Best-effort — verify on the owner's DOM.
function readListingLikes() {
  const near = document.querySelector('[data-et-name="like"]');
  if (near) {
    const scope = near.closest("div") || near;
    const n = parseCount(scope.textContent);
    if (n != null && n > 0) return n;
  }
  const m = document.body.innerText.match(/([\d,]+)\s+likes?\b/i);
  return m ? parseCount(m[1]) : null;
}
// Best-effort per-listing offer signal (Poshmark surfaces offer activity to the seller on their own
// listing). Left conservative — reports only when a clear count is present.
function readListingOffers() {
  const m = document.body.innerText.match(/([\d,]+)\s+offers?\b/i);
  return m ? parseCount(m[1]) : null;
}
async function scrapeListingPage() {
  const id = poshId(location.href);
  if (!id) return;
  const { listings } = await getListings();
  const match = (listings || []).find((l) => l.platform === "poshmark" && poshId(l.url) === id);
  if (!match) return; // no stored Poshmark URL for this item yet → can't attribute
  const stats = {};
  const likes = readListingLikes();
  if (likes != null) stats.likes = likes;
  const offers = readListingOffers();
  if (offers != null) stats.offers = offers;
  if (Object.keys(stats).length) reportStats(match.itemId, stats);
}

function readCardLikes(anchor) {
  const scope = anchor.closest("[class*='tile' i], li, article, div") || anchor;
  const el = scope.querySelector('[class*="like" i] [class*="count" i], [aria-label*="like" i]');
  return el ? parseCount(el.getAttribute("aria-label") || el.textContent) : null;
}
async function scrapeClosetPage() {
  const { listings, handles } = await getListings();
  const handle = (handles && handles.poshmark ? String(handles.poshmark) : "").toLowerCase().replace(/^@/, "");
  if (!handle) return;
  if (!new RegExp(`poshmark\\.com/closet/${handle}\\b`, "i").test(location.href)) return;
  const byId = new Map((listings || []).filter((l) => l.platform === "poshmark").map((l) => [poshId(l.url), l.itemId]));
  const seen = new Set();
  document.querySelectorAll('a[href*="/listing/"]').forEach((a) => {
    const id = poshId(a.getAttribute("href") || a.href);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const itemId = byId.get(id);
    if (!itemId) return;
    const likes = readCardLikes(a);
    if (likes != null) reportStats(itemId, { likes });
  });
}

function runStatsScan() {
  scrapeListingPage().catch(() => {});
  scrapeClosetPage().catch(() => {});
}
// Poshmark is a SPA — re-scan on navigation, after a beat for render.
let _lastScan = "";
setInterval(() => {
  if (location.href === _lastScan) return;
  _lastScan = location.href;
  setTimeout(runStatsScan, 1200);
}, 1500);
