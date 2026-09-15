// Imported product descriptions arrive as raw store HTML (Shopify body_html / Squarespace),
// e.g. "<p>…prose…</p><ul><li>100% Viscose</li><li>Bust 33''</li>…</ul>". Turn that into clean
// plain text: one line per paragraph / list item, entities decoded, tags stripped, so it reads well
// in the inventory editor (a plain textarea) and renders cleanly on the storefront (which uses
// whitespace-pre-wrap). Text that's already plain passes through.
//
// PARAGRAPH GAPS ARE KEPT, BULLET GAPS ARE NOT. This used to close every blank line, which read
// well for a spec list (a gap between every bullet is noise) and wrongly for the shops that write to
// a template: one seller's listings run an opening paragraph, then a block of Era/Material/
// Condition/Fit, then measurements, each group separated on her own site by a blank line. Flattening
// those into one unbroken column is not what she wrote. So the two cases are told apart by the tag
// they came from: the end of a paragraph or heading is a gap, the end of a list item is a new line.
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

 // WHAT I DECIDED vs WHAT THE SOURCE HAPPENED TO CONTAIN. Exported HTML is pretty-printed, so
 // there is a newline between every `</li>` and the next `<li>` that means nothing. Read as text it
 // is indistinguishable from a blank line the seller actually wrote, which is what made closing
 // every gap look like the only safe option. So the breaks THIS function decides on are marked with
 // characters that cannot occur in the source, every scrap of the source's own whitespace is then
 // flattened, and only at the end do the marks become real line breaks.
 const PARA = "\u0001"; // the end of a paragraph: a blank line
 const LINE = "\u0002"; // the end of a list item or a <br>: the next line
 s = s
 .replace(/<\/(p|div|h[1-6]|blockquote|section)\s*>/gi, PARA)
 .replace(/<\/(li|tr)\s*>/gi, LINE)
 .replace(/<br\s*\/?>/gi, LINE)
 .replace(/<[^>]+>/g, " ");

 return (
 s
  .replace(/\s+/g, " ")                    // every newline and indent the source came with, gone
  .replace(/ *[\u0001\u0002]+ */g, (m) => (m.includes(PARA) ? PARA : LINE)) // trim around the marks
  .replace(/\u0001/g, "\n\n")
  .replace(/\u0002/g, "\n")
  .trim() || null
 );
}
