/**
 * Get a seller's own newsletter popup out of the way before a comparison screenshot.
 *
 * The side-by-side shots exist so a person can SEE the difference between her site and ours. On
 * several stores her live site opens a newsletter modal a few seconds after load — "Join the Chill
 * list" over the hero — so half the comparison was a picture of a popup. Ours never shows one,
 * because a captured page has no popup app running, which makes every one of those pairs look like
 * a difference we caused.
 *
 * This changes the PICTURE only. Every number the parity check reports — products, prices, headings,
 * nav — is read from the DOM before this runs and is unaffected by hiding anything.
 *
 * Deliberately blunt: press Escape, click a close control if there is one, and hide what is left.
 * Trying to recognise each popup app by name is a list that would never be finished.
 */

/** Run inside the page. Returns how many overlays it had to hide. */
export const DISMISS_OVERLAYS = `(() => {
 const vw = innerWidth, vh = innerHeight;
 const big = (el) => {
  const r = el.getBoundingClientRect();
  return r.width * r.height > vw * vh * 0.10 && r.width > 200 && r.height > 120;
 };
 const shown = (el) => {
  const s = getComputedStyle(el);
  return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
 };
 // A header or nav that happens to be sticky is not a popup, and hiding it would remove the very
 // thing several checks are looking at.
 const chrome = (el) => !!el.closest("header, nav, [role='banner'], [role='navigation'], [class*='header' i]");
 const candidates = () => [...document.querySelectorAll("body *")].filter((el) => {
  const s = getComputedStyle(el);
  if (s.position !== "fixed" && s.position !== "absolute") return false;
  if (Number(s.zIndex || 0) < 10 && s.position !== "fixed") return false;
  return shown(el) && big(el) && !chrome(el) && !el.id.startsWith("vya-");
 });

 let hidden = 0;
 for (const el of candidates()) {
  // Her own close button first — it is what a shopper would press, and it lets the page's own
  // code tidy up after itself (a cookie so it does not immediately reopen).
  const close = el.querySelector('[aria-label*="close" i],[class*="close" i],button[title*="close" i]');
  if (close) { try { close.click(); } catch {} }
 }
 // Whatever survives being asked politely.
 for (const el of candidates()) {
  el.style.setProperty("display", "none", "important");
  hidden++;
 }
 return hidden;
})()`;
