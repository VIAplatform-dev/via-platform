// VYA Cross-Lister — Vestiaire Collective adapter (content script).
// Vestiaire's deposit is a MULTI-STEP wizard spanning two URLs + five SPA routes:
//   /sell-clothes-online/               step 1 — universe (radio) · category (<select>) · brand (autocomplete)
//   submit-an-item.shtml#/informations  subcategory · material · color · pattern (autocompletes) · size (<select>)
//   submit-an-item.shtml#/photos        photo upload (#file_upload, ≥3 photos)
//   submit-an-item.shtml#/description   textarea#description
//   submit-an-item.shtml#/price         price
// The item is stashed in sessionStorage so it survives the step-1 → submit-an-item navigation, and a
// watcher fills whichever recognized fields are on screen as the seller advances. The seller confirms
// each screen, adds anything VYA doesn't know, and submits — we never auto-submit.
//
// ⚠️ Later-step selectors are mapped from Vestiaire's live DOM (2026-07) but its UI changes — verify
//    on a real listing. Brand/material/color autocompletes are confirmed to accept programmatic input.

console.log("[VYA] Cross-Lister content script loaded on", location.href);

// ── low-level helpers ──
function waitFor(selector, timeoutMs = 10000) {
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

// Set a value on a React-controlled input/select so React registers the change.
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

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

async function injectPhotosInto(input, images) {
  if (!input || !images || !images.length) return 0;
  const dt = new DataTransfer();
  for (let i = 0; i < images.length; i++) {
    try { dt.items.add(await urlToFile(images[i], `vya-photo-${i + 1}.jpg`)); } catch { /* skip broken image */ }
  }
  if (!dt.files.length) return 0;
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return dt.files.length;
}

// Type into a Vestiaire autocomplete, wait for the result options, click the best text match.
async function fillVCAutocomplete(input, query, matchText) {
  if (!input || !query) return false;
  input.focus();
  setNativeValue(input, query);
  const want = String(matchText || query).toLowerCase().trim();
  const start = Date.now();
  while (Date.now() - start < 4000) {
    const opts = [...document.querySelectorAll('button[class*="option" i], [role="option"], [class*="autocomplete" i] li, [class*="suggestion" i] button, [class*="search"][class*="options" i] button')]
      .filter((o) => (o.textContent || "").trim());
    const exact = opts.find((o) => (o.textContent || "").trim().toLowerCase() === want);
    const partial = opts.find((o) => (o.textContent || "").trim().toLowerCase().includes(want));
    const pick = exact || partial;
    if (pick) { pick.click(); return true; }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// Common designer abbreviations → the brand name Vestiaire indexes.
const BRAND_ALIASES = {
  "ysl": "Saint Laurent", "slp": "Saint Laurent", "lv": "Louis Vuitton", "cdg": "Comme des Garcons",
  "apc": "A.P.C.", "mmm": "Maison Margiela", "margiela": "Maison Margiela", "bbr": "Burberry", "dg": "Dolce & Gabbana",
};
function canonicalBrand(b) { const k = String(b || "").toLowerCase().trim(); return BRAND_ALIASES[k] || b; }

function setSelectByText(sel, text) {
  if (!sel || !text) return false;
  const t = String(text).toLowerCase();
  const opt = [...sel.options].find((o) => o.textContent.trim().toLowerCase() === t)
    || [...sel.options].find((o) => o.textContent.trim().toLowerCase().includes(t));
  if (!opt) return false;
  setNativeValue(sel, opt.value);
  return true;
}

// Vestiaire's category is granular (Boots/Trainers/Sandals…), while VYA's is generic ("Shoes").
// Match a Vestiaire option whose label appears in the item's TITLE (or category) — "…Suede Boots" → Boots.
function pickCategory(sel, item) {
  if (!sel) return null;
  const hay = ((item.title || "") + " " + (item.category || "")).toLowerCase();
  const opts = [...sel.options].filter((o) => o.value && !/^(choose|select)/i.test(o.textContent.trim()));
  let opt = opts.find((o) => hay.includes(o.textContent.trim().toLowerCase()));
  if (!opt) opt = opts.find((o) => { const s = o.textContent.trim().toLowerCase().replace(/s$/, ""); return s.length > 2 && hay.includes(s); });
  if (!opt && item.category) opt = opts.find((o) => o.textContent.trim().toLowerCase().includes(String(item.category).toLowerCase()));
  if (opt) { setNativeValue(sel, opt.value); return opt.textContent.trim(); }
  return null;
}

// ── item stash (survives the step-1 → submit-an-item navigation) ──
const ITEM_KEY = "vya_vc_item";
function stashItem(it) { try { sessionStorage.setItem(ITEM_KEY, JSON.stringify({ item: it, at: Date.now() })); } catch { /* ignore */ } }
function loadStashedItem() {
  try {
    const o = JSON.parse(sessionStorage.getItem(ITEM_KEY) || "null");
    if (!o) return null;
    if (Date.now() - o.at > 45 * 60 * 1000) { sessionStorage.removeItem(ITEM_KEY); return null; } // expire stale drafts
    return o.item;
  } catch { return null; }
}
function clearStash() { try { sessionStorage.removeItem(ITEM_KEY); sessionStorage.removeItem("vya_pending_item"); } catch { /* ignore */ } }

// ── per-step fillers ──
function pickUniverse(item) {
  const t = ((item.category || "") + " " + (item.title || "")).toLowerCase();
  const men = /\bmen'?s\b|menswear|\bmale\b/.test(t) && !/women/.test(t);
  const radio = document.querySelector(men ? "#Menswear-1" : "#Womenswear-0") || document.querySelector('input[name="universe"]');
  if (radio && !radio.checked) { radio.click(); return true; }
  return !!radio;
}

async function fillStep1(item) {
  // The landing may need a "Sell now" click to reveal step 1.
  if (!document.querySelector("#depositForm__form__brands-input")) {
    const sellNow = [...document.querySelectorAll("a,button")].find((b) => /^sell (now|an item)$/i.test((b.textContent || "").trim()));
    if (sellNow) { sellNow.click(); await waitFor("#depositForm__form__brands-input", 6000); }
  }
  pickUniverse(item);
  const catOk = pickCategory(document.querySelector("select"), item);
  let brandOk = false;
  if (item.brand) { const b = canonicalBrand(item.brand); brandOk = await fillVCAutocomplete(document.querySelector("#depositForm__form__brands-input"), b, b); }
  console.log("[VYA] VC step 1:", { universe: true, category: catOk, brand: brandOk });
}

// Map a VYA condition (canonical OR freeform, e.g. "Great") to Vestiaire's exact condition label.
function vcConditionLabel(cond) {
  const c = String(cond || "").toLowerCase();
  if (/nwt|bnwt|nib|deadstock|dead ?stock|new with tag/.test(c)) return "Never worn, with tag";
  if (/like ?new|never worn|unworn/.test(c)) return "Never worn";
  if (/excellent|great|very good|mint|pristine|flawless/.test(c)) return "Very good condition";
  if (/\bgood\b|gently/.test(c)) return "Good condition";
  if (/fair|poor|worn|distress/.test(c)) return "Fair condition";
  return null;
}

// Condition — a custom #condition dropdown (div[role=button] → styles_dropDownItem__title items).
async function fillCondition(item) {
  if (!item.condition) return false;
  const want = vcConditionLabel(item.condition);
  if (!want) return false;
  const box = document.querySelector("#condition");
  if (!box) return false;
  if (/never worn|good condition|fair condition/i.test((box.textContent || "").trim())) return true; // already set
  box.click();
  let opt = null;
  const start = Date.now();
  while (Date.now() - start < 3000) {
    opt = [...document.querySelectorAll('span.styles_dropDownItem__title, [class*="dropDownItem" i]')]
      .find((el) => (el.textContent || "").trim().toLowerCase() === want.toLowerCase());
    if (opt) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!opt) return false;
  (opt.closest('li,button,[role="option"],div') || opt).click();
  return true;
}

// Size — set the unit select to US (VYA sizes are US), then pick the #size option whose text matches.
async function fillSize(item) {
  if (!item.size) return false;
  const sizeSel = document.querySelector("#size");
  if (sizeSel && sizeSel.selectedIndex > 0 && !/choose/i.test(sizeSel.options[sizeSel.selectedIndex].textContent)) return true; // already set
  const unit = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /^US$/i.test(o.textContent.trim())));
  if (unit) { const us = [...unit.options].find((o) => /^US$/i.test(o.textContent.trim())); if (us) setNativeValue(unit, us.value); }
  const sel = await waitFor("#size", 3000);
  if (!sel) return false;
  const want = String(item.size).trim().toLowerCase();
  let opt = null;
  const start = Date.now();
  while (Date.now() - start < 3000) {
    opt = [...sel.options].find((o) => o.textContent.trim().toLowerCase() === want)
      || [...sel.options].find((o) => o.textContent.trim().toLowerCase().replace(/\.0$/, "") === want);
    if (opt) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!opt) return false;
  setNativeValue(sel, opt.value);
  return true;
}

async function fillInformations(item) {
  let n = 0;
  if (item.material && await fillVCAutocomplete(document.querySelector("#material"), item.material, item.material)) n++;
  if (item.color && await fillVCAutocomplete(document.querySelector("#color"), item.color, item.color)) n++;
  if (await fillCondition(item)) n++;
  if (await fillSize(item)) n++;
  // subcategory / pattern stay for the seller (VYA has no equivalent).
  console.log("[VYA] VC informations filled:", n);
}

async function fillPhotosStep(item) {
  const input = await waitFor("#file_upload, input[type=\"file\"][accept*=\"image\"]", 8000);
  const n = await injectPhotosInto(input, item.images || []);
  console.log("[VYA] VC photos injected:", n);
}

async function fillDescriptionStep(item) {
  const ta = await waitFor('textarea#description, textarea[placeholder*="item details" i], textarea', 6000);
  if (ta) { setNativeValue(ta, item.body || item.title || ""); console.log("[VYA] VC description filled"); }
}

async function fillPriceStep(item) {
  // #priceField is the real price input — NOT a generic number field (measurements like heel height
  // are also type=number and must never be touched).
  const price = await waitFor('#priceField, input[name*="price" i]', 6000);
  if (price && item.priceDollars != null) { setNativeValue(price, String(item.priceDollars)); console.log("[VYA] VC price filled"); }
}

// Auto-advance: after filling a step, click the wizard's "Continue"/"Next" IF it's enabled — never
// the final "Post"/"Submit" (the seller presses that). If it's disabled, a required field is still
// empty, so we pause and let the seller fill it, then they click Continue and we pick up again.
function maybeAdvance() {
  const btn = [...document.querySelectorAll("button, a")].find((b) =>
    /^(continue|next)$/i.test((b.textContent || "").trim()) && !b.disabled && b.offsetParent !== null);
  if (btn) { console.log("[VYA] VC auto-advancing →", (btn.textContent || "").trim()); btn.click(); return true; }
  console.log("[VYA] VC paused — finish the required field(s) on this screen and it continues.");
  return false;
}

// Route → filler dispatch, then try to advance.
async function fillCurrentStep() {
  const item = loadStashedItem();
  if (!item) return;
  const url = location.href, hash = location.hash;
  try {
    if (/sell-clothes-online/.test(url)) await fillStep1(item);
    else if (/submit-an-item/.test(url)) {
      if (/photos/.test(hash)) await fillPhotosStep(item);
      else if (/description/.test(hash)) await fillDescriptionStep(item);
      else if (/price/.test(hash)) await fillPriceStep(item);
      else if (/seller/.test(hash)) { /* address — nothing to fill, just advance */ }
      else await fillInformations(item); // #/informations (default landing route)
    }
    await new Promise((r) => setTimeout(r, 1000)); // let the fields register + Continue enable
    maybeAdvance();
  } catch (e) { console.warn("[VYA] VC step fill error", e && e.message); }
}

// Re-fill as the seller advances through the wizard (route changes + lazy renders).
let _vcLastUrl = "";
setInterval(() => {
  if (location.href === _vcLastUrl) return;
  _vcLastUrl = location.href;
  if (loadStashedItem()) setTimeout(() => fillCurrentStep().catch(() => {}), 900);
}, 700);
window.addEventListener("hashchange", () => { if (loadStashedItem()) setTimeout(() => fillCurrentStep().catch(() => {}), 900); });

// On content-script (re)load, if a fill is in progress, fill the current step.
if (loadStashedItem()) setTimeout(() => fillCurrentStep().catch(() => {}), 1200);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PING") { sendResponse({ ok: true }); return false; }
  if (msg.type === "FILL_LISTING") {
    stashItem(msg.item);
    try { sessionStorage.setItem("vya_pending_item", msg.item.id); } catch { /* ignore */ }
    fillCurrentStep()
      .then(() => sendResponse({ ok: true, needsReview: true, note: "Filling Vestiaire step-by-step — confirm each screen (universe, brand, category, photos, description, price are auto-filled where VYA has them) and hit Continue. Add anything missing, then submit." }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async
  }
  return false;
});

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
      clearStash();
    }
  }, 1500);
}
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
  if (!match) return;
  const likes = readProductLikes();
  if (likes != null) reportStats(match.itemId, { likes });
}

let _lastScan = "";
setInterval(() => {
  if (location.href === _lastScan) return;
  _lastScan = location.href;
  setTimeout(() => { scrapeProductPage().catch(() => {}); }, 1200);
}, 1500);
