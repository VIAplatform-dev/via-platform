// Custom CSS is the storefront's styling escape hatch — but it must NEVER fight the store's THEME
// background. Otherwise a stray rule (often written by the assistant) pins a section to a hardcoded
// colour, and changing the palette leaves it stuck — the classic "why is my hero still white when my
// theme is tan" bug. So before custom CSS is rendered, we strip `background` declarations from any rule
// that targets a section/page CONTAINER. The theme background then always shows through automatically.
// Per-section backgrounds still work — they go through the section's own bg setting, not custom CSS.
// This runs at render time (both the editor and the live storefront), so it's non-destructive and needs
// no action from the seller.

// A selector that targets a whole section or the page (where a background would cover the theme).
const CONTAINER_SEL = /(^|[\s,>+~(])(html|body|\.vya-sec|\.vya-b-[\w-]+|\.vya-(?:hero|featured|split|text|image|gallery|marquee|statement|spotlight|video|newsletter|faq|announcement|custom))(\b|[\s.,:{>+~)])/i;
// Inner content classes legitimately style content (text, buttons, the hero copy box) — never their bg.
const CONTENT_SEL = /\.vya-(?:hero-inner|heading|sub|body|cta|img|round|marquee-track|faq-chev)/i;

export function stripThemeBackgroundOverrides(css: string): string {
 if (!css) return "";
 // Rewrite each innermost rule block. Rules nested inside @media are matched individually, so those
 // are handled too; the @media wrapper itself has no declarations and passes through untouched.
 return css.replace(/([^{}]+)\{([^{}]*)\}/g, (full, sel, body) => {
 if (CONTENT_SEL.test(sel) || !CONTAINER_SEL.test(sel)) return full;
 const cleaned = body
 .replace(/background(-color|-image)?\s*:[^;}]*;?/gi, "") // drop bg colour/image declarations
 .replace(/\s*;\s*;+/g, ";")
 .trim();
 return `${sel}{${cleaned}}`;
 });
}
