// ───────────────────────────────────────────────────────────────────────────
// Site effects — the motion a storefront can wear.
//
// Why these are a CATALOGUE and not "let the seller paste JavaScript":
// storefronts are served from vyaplatform.com/s/{handle}, the same origin as the marketplace a
// shopper signs into. Script injected there runs with that origin's cookies and storage, so one
// seller's "glitter cursor" would be able to read another shopper's session. The sandboxed iframe
// in add_html_section exists for exactly this reason, and it's also why a cursor trail can't live
// in one: an effect that follows the pointer across the page has to BE the page.
//
// So the effects ship as OUR code, and a store turns one on. The seller gets the thing they
// actually asked for; nobody gets a script tag. The list grows by adding to it here.
//
// Pure and dependency-free, so the assistant's tool, the settings panel and the renderer all agree
// on what exists.
// ───────────────────────────────────────────────────────────────────────────

export type CursorEffect = "none" | "glitter" | "sparkle" | "trail" | "ring";

export type SiteEffects = {
 cursor: CursorEffect;
 /** Effect colour. Null follows the store's accent, which is right nearly always. */
 cursorColor: string | null;
};

export const DEFAULT_EFFECTS: SiteEffects = { cursor: "none", cursorColor: null };

export const CURSOR_EFFECTS: { value: CursorEffect; label: string; description: string }[] = [
 { value: "none", label: "None", description: "The plain cursor." },
 { value: "glitter", label: "Glitter trail", description: "Specks that fall and fade behind the pointer." },
 { value: "sparkle", label: "Sparkle", description: "Four-point stars that twinkle out where the pointer goes." },
 { value: "trail", label: "Comet", description: "A smooth tail that follows the pointer and catches up." },
 { value: "ring", label: "Ring", description: "A soft circle that trails the pointer — quiet, not cute." },
];

const CURSORS = CURSOR_EFFECTS.map((e) => e.value);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Fold a stored blob onto the defaults. An unknown effect is "none", never a crash. */
export function resolveEffects(stored?: Partial<SiteEffects> | null): SiteEffects {
 const s = stored || {};
 return {
  cursor: CURSORS.includes(s.cursor as CursorEffect) ? (s.cursor as CursorEffect) : DEFAULT_EFFECTS.cursor,
  cursorColor: typeof s.cursorColor === "string" && HEX.test(s.cursorColor.trim()) ? s.cursorColor.trim() : null,
 };
}

/** Does this store want anything drawn at all? Lets the renderer skip mounting the client component. */
export const hasEffects = (e: SiteEffects): boolean => e.cursor !== "none";
