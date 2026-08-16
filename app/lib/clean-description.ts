// Imported product descriptions arrive as raw store HTML (Shopify body_html / Squarespace),
// e.g. "<p>…prose…</p><ul><li>100% Viscose</li><li>Bust 33''</li>…</ul>". Turn that into clean
// plain text — one line per paragraph / list item, entities decoded, tags stripped, blank lines
// collapsed — so it reads well in the inventory editor (a plain textarea) and renders cleanly on
// the storefront (which uses whitespace-pre-wrap). Text that's already plain passes through.
export function cleanDescription(html: string | null | undefined): string | null {
 if (!html) return null;
 if (!/[<&]/.test(html)) return html.trim() || null; // already plain

 // Decode entities twice (handles double-encoded "&amp;lt;p&amp;gt;" from some exports).
 let s = html;
 for (let i = 0; i < 2; i++) {
 s = s
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
  .replace(/&nbsp;/gi, " ").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
 }

 // Block-level tags become line breaks (so each bullet / paragraph lands on its own line),
 // then strip every remaining tag.
 s = s
 .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
 .replace(/<br\s*\/?>/gi, "\n")
 .replace(/<[^>]+>/g, " ");

 return (
 s
  .replace(/[ \t]+/g, " ") // collapse runs of spaces/tabs
  .replace(/[ \t]*\n[ \t]*/g, "\n") // trim each line's edges (drops "Size " trailing space)
  .replace(/\n{2,}/g, "\n") // no blank-line gaps
  .trim() || null
 );
}
