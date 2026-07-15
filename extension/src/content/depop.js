// VYA Cross-Lister — Depop adapter (content script).
// Runs on depop.com in the seller's own logged-in session and fills the "create listing" form with
// the item VYA hands it: photos, caption (+hashtags), price. Category / size / condition are left
// for the seller to confirm (Depop uses custom pickers), then they hit Publish.
//
// ⚠️ SELECTORS BELOW ARE BEST-EFFORT and MUST be verified against Depop's live sell page — Depop
//    changes its UI, so treat these as the starting point. Everything else (photo injection, React
//    value setting, message plumbing) is production-grade and reusable across marketplaces.

const SEL = {
  photoInput: 'input[type="file"][accept*="image"], input[type="file"]',
  description: 'textarea[name="description"], textarea[data-testid="description__textArea"], textarea[aria-label*="escription"]',
  price: 'input[name="price"], input[data-testid="price__input"], input[inputmode="decimal"]',
  publishedUrlAnchor: 'a[href*="/products/"]',
};

// Fetch an image URL and turn it into a File the browser will accept in a file input.
async function urlToFile(url, name) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

// Inject images into Depop's file input via a synthetic DataTransfer (the standard technique).
async function uploadPhotos(images) {
  const input = document.querySelector(SEL.photoInput);
  if (!input || !images?.length) return 0;
  const dt = new DataTransfer();
  for (let i = 0; i < images.length; i++) {
    try { dt.items.add(await urlToFile(images[i], `vya-photo-${i + 1}.jpg`)); } catch { /* skip a broken image */ }
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return dt.files.length;
}

// Set a value on a React-controlled input so React actually registers the change.
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillListing(item) {
  const filled = { photos: 0, description: false, price: false };

  filled.photos = await uploadPhotos(item.images || []);

  const desc = document.querySelector(SEL.description);
  if (desc) { setNativeValue(desc, item.body || item.title || ""); filled.description = true; }

  const price = document.querySelector(SEL.price);
  if (price && item.priceDollars != null) { setNativeValue(price, String(item.priceDollars)); filled.price = true; }

  // Stash the item id so we can attribute the published URL back to VYA once the seller publishes.
  try { sessionStorage.setItem("vya_pending_item", item.id); } catch { /* ignore */ }

  return {
    ok: filled.photos > 0 || filled.description || filled.price,
    filled,
    needsReview: true,
    note: "Filled photos, caption & price. Confirm category/size/condition and hit Publish.",
  };
}

// After the seller publishes, Depop routes to the product page — capture that URL and report it.
function watchForPublish() {
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    const m = location.href.match(/depop\.com\/products\/[^/?#]+/i);
    if (!m) return;
    let itemId = null;
    try { itemId = sessionStorage.getItem("vya_pending_item"); } catch { /* ignore */ }
    if (itemId) {
      chrome.runtime.sendMessage({ type: "PUBLISHED", platform: "depop", itemId, url: `https://www.${m[0]}` });
      try { sessionStorage.removeItem("vya_pending_item"); } catch { /* ignore */ }
    }
  }, 1500);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PING") { sendResponse({ ok: true }); return false; }
  if (msg.type === "FILL_LISTING") {
    fillListing(msg.item).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async
  }
  return false;
});

watchForPublish();

// ─────────────────────────────────────────────────────────────────────────────
// Engagement scraping (likes). Reads the like count off the seller's OWN Depop pages — a product
// page shows one item's likes; the seller's profile page shows every item's card — and reports it to
// VYA, attributed to the matching VYA item. Passive: runs whenever the seller lands on such a page.
// ⚠️ The LIKE-COUNT SELECTORS below are best-effort and MUST be verified against Depop's live DOM.
// Everything else (URL→item attribution, message plumbing, SPA-nav triggering) is production-grade.

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
  chrome.runtime.sendMessage({ type: "REPORT_STATS", platform: "depop", itemId, stats });
}
// The product slug uniquely identifies a listing; match the browsed URL to a stored listing URL by it.
const depopSlug = (u) => { const m = String(u || "").match(/depop\.com\/products\/([^/?#]+)/i); return m ? m[1].toLowerCase() : null; };
// Turn "1.2k", "34", "2,103" into a number.
function parseCount(text) {
  const m = String(text || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = (m[2] || "").toLowerCase();
  if (suf === "k") n *= 1e3; else if (suf === "m") n *= 1e6;
  return Math.round(n);
}

function readProductLikes() {
  // ✅ Verified against live Depop product DOM (2026-07): the count sits in <p data-testid="like-count">,
  // and the like button's aria-label reads "Like product. N likes for this product." — use both.
  const cnt = document.querySelector('[data-testid="like-count"]');
  if (cnt) { const n = parseCount(cnt.textContent); if (n != null) return n; }
  const btn = document.querySelector('[data-testid^="productInteraction__likeButton"]');
  if (btn) { const n = parseCount(btn.getAttribute("aria-label")); if (n != null) return n; }
  return null;
}
// Depop offers happen in DMs, not on the product page, so a per-item offer count usually isn't on
// screen — conservative: only report when a clear "N offers" appears (keeps the pipeline uniform).
function readProductOffers() {
  const m = document.body.innerText.match(/([\d,]+)\s+offers?\b/i);
  return m ? parseCount(m[1]) : null;
}
async function scrapeProductPage() {
  const slug = depopSlug(location.href);
  if (!slug) return;
  const { listings } = await getListings();
  const match = (listings || []).find((l) => l.platform === "depop" && depopSlug(l.url) === slug);
  if (!match) return; // not one of the seller's VYA-tracked items
  const stats = {};
  const likes = readProductLikes();
  if (likes != null) stats.likes = likes;
  const offers = readProductOffers();
  if (offers != null) stats.offers = offers;
  if (Object.keys(stats).length) reportStats(match.itemId, stats);
}

function readCardLikes(anchor) {
  // Best-effort: on the seller's own profile grid a card may carry the same like-count testid or the
  // like-button aria-label. (Public profiles lazy-load and hid this from verification — needs a
  // logged-in-owner check; the product-page path above is the verified/primary source.)
  const scope = anchor.closest("li, article, div") || anchor;
  const el = scope.querySelector('[data-testid="like-count"], [data-testid^="productInteraction__likeButton"], [aria-label*="likes for this product" i]');
  return el ? parseCount(el.getAttribute("aria-label") || el.textContent) : null;
}
async function scrapeShopPage() {
  const { listings, handles } = await getListings();
  const handle = (handles && handles.depop ? String(handles.depop) : "").toLowerCase().replace(/^@/, "");
  if (!handle) return;
  // Only scan the seller's OWN profile page (never other people's).
  if (!new RegExp(`depop\\.com/${handle}/?(?:$|[?#])`, "i").test(location.href)) return;
  const bySlug = new Map((listings || []).filter((l) => l.platform === "depop").map((l) => [depopSlug(l.url), l.itemId]));
  const seen = new Set();
  document.querySelectorAll('a[href*="/products/"]').forEach((a) => {
    const slug = depopSlug(a.getAttribute("href") || a.href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    const itemId = bySlug.get(slug);
    if (!itemId) return;
    const likes = readCardLikes(a);
    if (likes != null) reportStats(itemId, { likes });
  });
}

function runStatsScan() {
  scrapeProductPage().catch(() => {});
  scrapeShopPage().catch(() => {});
}
// Depop is a SPA — re-scan on navigation, after a beat so the new page's content has rendered.
let _lastScan = "";
setInterval(() => {
  if (location.href === _lastScan) return;
  _lastScan = location.href;
  setTimeout(runStatsScan, 1200);
}, 1500);
