// A random id that works in every browser context — not just secure ones.
//
// `crypto.randomUUID()` exists only in a SECURE context. On https it is there; on a plain-http page
// it is undefined, and calling it throws `TypeError: crypto.randomUUID is not a function`. That is
// not a hypothetical: a hosted storefront served over http (every store domain in local
// development) threw it from the analytics tracker on mount, the throw escaped to React's error
// boundary, and VYA's CHECKOUT PAGE rendered "This page couldn't load" — a page-view id took the
// whole purchase down.
//
// So the id degrades instead of throwing: the real UUID where it exists, cryptographic randomness
// where that exists, and finally something merely unique-enough. An analytics session id has no
// security requirement — it only has to be different from the next one.

/** A UUID-shaped id, by whatever means the current context allows. */
export function randomId(): string {
 const c: Crypto | undefined = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
 if (typeof c?.randomUUID === "function") {
  try { return c.randomUUID(); } catch { /* allow-swallow: fall through to the next source below */ }
 }
 if (typeof c?.getRandomValues === "function") {
  try {
   const b = c.getRandomValues(new Uint8Array(16));
   b[6] = (b[6] & 0x0f) | 0x40; // version 4
   b[8] = (b[8] & 0x3f) | 0x80; // variant
   const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
   return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch { /* allow-swallow: fall through to the last resort below */ }
 }
 // No crypto at all. Unique enough for a page-view id, and never a reason to fail a page.
 const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
 return `${rnd()}-${rnd().slice(0, 4)}-4${rnd().slice(0, 3)}-a${rnd().slice(0, 3)}-${rnd()}${rnd().slice(0, 4)}`;
}
