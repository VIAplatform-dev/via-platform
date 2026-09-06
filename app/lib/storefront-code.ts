// ───────────────────────────────────────────────────────────────────────────
// A store's own JavaScript.
//
// This is what makes "build whatever I ask for" true rather than aspirational. A catalogue of
// effects can only ever contain what someone thought of in advance; a seller who wants a cursor
// that trails glitter, a size calculator, a scroll animation, a countdown in the header — anything
// — needs real code on the page, not a setting.
//
// WHY IT'S SAFE NOW AND WASN'T BEFORE. Storefronts used to be served from vyaplatform.com/s/{slug},
// the same origin a shopper signs into, where a seller's script would sit next to that shopper's
// session. They're now served from {slug}.vyasites.com — a different registrable domain, so a
// separate cookie jar, and the origin refuses VYA's admin and all but a handful of APIs
// (isRefusedOnStoreHost / isAllowedStoreApi). Checkout stays on VYA's own origin, so this code is
// never in the room when a customer types a card number.
//
// THE ONE RULE THIS FILE ENFORCES: the code goes out ONLY on the store's own origin. VYA's copy of
// the same storefront must never carry it, or the isolation that makes it safe is undone by the
// mirror. `storefrontScript` takes that decision as an argument so a caller cannot forget it.
// ───────────────────────────────────────────────────────────────────────────

/** Cap so one paste can't balloon every page of a shop. Generous — libraries are bigger than this. */
export const MAX_CODE = 100_000;

export function sanitizeCode(v: unknown): string {
 const s = typeof v === "string" ? v : "";
 return s.slice(0, MAX_CODE);
}

/**
 * The script tag for a storefront page, or "" when there shouldn't be one.
 *
 * `</script>` inside the code would end the tag early and spill the rest into the page as markup —
 * so the sequence is broken up. This is not a security filter (the code is meant to run); it's the
 * standard escape that keeps valid JavaScript from being cut in half by the HTML parser.
 */
export function storefrontScript(code: string | null | undefined, onOwnOrigin: boolean): string {
 if (!onOwnOrigin) return "";
 const js = sanitizeCode(code).trim();
 if (!js) return "";
 return js.replace(/<\/(script)/gi, "<\\/$1");
}
