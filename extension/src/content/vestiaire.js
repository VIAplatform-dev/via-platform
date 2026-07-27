// VYA Cross-Lister — Vestiaire Collective adapter (content script).
// Runs on vestiairecollective.com in the seller's own logged-in session and pre-fills the "sell an
// item" / deposit form with what VYA hands it: photos, description, price. Vestiaire's deposit is a
// multi-step wizard with custom pickers for brand / category / condition, so those stay for the
// seller to confirm through the wizard — then they submit.
//
// ⚠️ SELECTORS BELOW ARE BEST-EFFORT and MUST be verified against Vestiaire's live sell DOM (it
//    changes its UI). Everything else — photo injection, React value-setting, publish-watch, message
//    plumbing — is production-grade and shared verbatim with the Depop adapter.

const SEL = {
  photoInput: 'input[type="file"][accept*="image"], input[type="file"]',
  description: 'textarea[name="description"], textarea[id*="description" i], textarea[aria-label*="escription" i], textarea',
  price: 'input[name="price"], input[id*="price" i], input[data-testid*="price" i], input[inputmode="decimal"], input[type="number"]',
};

console.log("[VYA] Cross-Lister content script loaded on", location.href);

// Wait for an element to appear (the sell wizard renders fields a beat after navigation).
function waitFor(selector, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const hit = document.querySelector(selector);
    if (hit) return resolve(hit);
    const start = Date.now();
    const iv = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - start > timeoutMs) { clearInterval(iv); resolve(el || null); }
    }, 300);
  });
}

// Fetch an image URL and turn it into a File the browser will accept in a file input.
async function urlToFile(url, name) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  } catch (e) {
    console.warn("[VYA] image fetch failed (CORS?):", url, e && e.message);
    throw e;
  }
}

// Inject images into the file input via a synthetic DataTransfer (the standard technique).
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
  console.log("[VYA] fillListing start", { images: (item.images || []).length, hasBody: !!item.body, price: item.priceDollars });

  const photoInput = await waitFor(SEL.photoInput, 12000);
  console.log("[VYA] photo input found:", !!photoInput);
  filled.photos = await uploadPhotos(item.images || []);
  console.log("[VYA] photos injected:", filled.photos);

  const desc = await waitFor(SEL.description, 4000);
  console.log("[VYA] description field found:", !!desc);
  if (desc) { setNativeValue(desc, item.body || item.title || ""); filled.description = true; }

  const price = await waitFor(SEL.price, 2000);
  console.log("[VYA] price field found:", !!price);
  if (price && item.priceDollars != null) { setNativeValue(price, String(item.priceDollars)); filled.price = true; }

  console.log("[VYA] fill result:", filled);

  // Stash the item id so we can attribute the published URL back to VYA once the seller submits.
  try { sessionStorage.setItem("vya_pending_item", item.id); } catch { /* ignore */ }

  return {
    ok: filled.photos > 0 || filled.description || filled.price,
    filled,
    needsReview: true,
    note: "Filled photos, description & price. Confirm brand / category / condition in the wizard, then submit.",
  };
}

// A published Vestiaire item page ends in "-<id>.shtml" — capture that as the live listing URL.
function watchForPublish() {
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    const m = location.href.match(/vestiairecollective\.com\/[^\s]*-(\d+)\.shtml/i);
    if (!m) return;
    let itemId = null;
    try { itemId = sessionStorage.getItem("vya_pending_item"); } catch { /* ignore */ }
    if (itemId) {
      chrome.runtime.sendMessage({ type: "PUBLISHED", platform: "vestiaire", itemId, url: location.href.split(/[?#]/)[0] });
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
// Engagement scraping (likes / wishlist count). Reads the count off the seller's OWN product pages
// and reports it to VYA, attributed to the matching VYA item. Passive: runs on navigation.
// ⚠️ The LIKE-COUNT SELECTORS are best-effort and MUST be verified against Vestiaire's live DOM.

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
  chrome.runtime.sendMessage({ type: "REPORT_STATS", platform: "vestiaire", itemId, stats });
}
// The numeric id at the end of "…-<id>.shtml" uniquely identifies a listing.
const vcId = (u) => { const m = String(u || "").match(/-(\d+)\.shtml/i); return m ? m[1] : null; };
function parseCount(text) {
  const m = String(text || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([km])?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const suf = (m[2] || "").toLowerCase();
  if (suf === "k") n *= 1e3; else if (suf === "m") n *= 1e6;
  return Math.round(n);
}
function readProductLikes() {
  // Best-effort: Vestiaire shows a wishlist/heart count near the product actions.
  const el = document.querySelector('[data-testid*="like" i], [data-testid*="wishlist" i], [aria-label*="like" i], [aria-label*="wishlist" i]');
  if (el) { const n = parseCount(el.getAttribute("aria-label") || el.textContent); if (n != null) return n; }
  const m = document.body.innerText.match(/([\d,.]+[km]?)\s+(?:likes?|wishlist)/i);
  return m ? parseCount(m[1]) : null;
}
async function scrapeProductPage() {
  const id = vcId(location.href);
  if (!id) return;
  const { listings } = await getListings();
  const match = (listings || []).find((l) => l.platform === "vestiaire" && vcId(l.url) === id);
  if (!match) return; // not one of the seller's VYA-tracked items
  const likes = readProductLikes();
  if (likes != null) reportStats(match.itemId, { likes });
}

let _lastScan = "";
setInterval(() => {
  if (location.href === _lastScan) return;
  _lastScan = location.href;
  setTimeout(() => { scrapeProductPage().catch(() => {}); }, 1200);
}, 1500);
