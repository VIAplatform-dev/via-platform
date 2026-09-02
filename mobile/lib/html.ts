// Store descriptions arrive as HTML, because that is what the stores' own platforms store.
//
// Shopify's rich-text editor writes `<p style="white-space:pre-wrap;" data-rte-preserve-empty="true">`
// around every line. Rendered as plain text — which is what a <Text> does — that markup IS the
// description, and the actual words are lost in it. This turns it back into paragraphs.

const BLOCK = /<\/(p|div|li|h[1-6]|br)\s*>|<br\s*\/?>/gi;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

/** HTML (or plain text) in, readable paragraphs out. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    // Close-tags become line breaks first, so paragraph structure survives tag removal.
    .replace(BLOCK, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&[#a-z0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    // Collapse the runs of blank lines the block replacement leaves behind.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
