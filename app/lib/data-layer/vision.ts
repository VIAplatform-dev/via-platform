// ───────────────────────────────────────────────────────────────────────────
// Data Layer: item vision identification.
//
// Sends a seller's photo(s) to Claude and gets back structured attributes
// (brand, item type, era, condition, colour). We then run those through the
// SAME canonical inference (inferBrandFromTitle / inferCategoryFromTitle /
// inferEra) used to build the events log, so a scan maps onto the exact same
// market_metrics segments the demand search uses. No SDK: plain fetch.
//
// Guiding rule (same as the rest of the data layer): never guess. The prompt
// tells the model to return null for brand/era/condition when it isn't sure.
// ───────────────────────────────────────────────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// Haiku is cheap (~½¢/photo) and plenty for attribute extraction.
const MODEL = process.env.VISION_MODEL || "claude-haiku-4-5-20251001";

export type ItemIdentification = {
 brand: string | null;
 brandConfidence: "high" | "medium" | "low";
 itemType: string | null;
 category: string | null;
 era: string | null;
 condition: string | null;
 color: string | null;
 summary: string;
};

export type VisionImage = { mediaType: string; data: string }; // base64 (no data: prefix)

const PROMPT = `You are an expert authenticator and buyer for a vintage & secondhand designer fashion marketplace. Identify the item in the photo(s) for a reseller deciding whether to source it.

Be CONSERVATIVE and never guess:
- brand: the designer/label ONLY if you can identify it from a visible logo, hardware, monogram, tag, or an unmistakable signature style. If you cannot tell, return null. A wrong brand misleads the seller. Null is better than a guess.
- brandConfidence: "high" only with a clear logo/tag; "medium" for a strong style signal; "low" otherwise.
- itemType: the specific piece, e.g. "mesh top", "saddle bag", "slip dress", "kitten heels".
- category: a broad category, e.g. "tops", "bags", "dresses", "shoes", "lingerie".
- era: the decade if the style clearly indicates it (e.g. "90s", "Y2K", "70s"); else null.
- condition: only if visible: "Excellent", "Very Good", "Good", or "Fair" based on visible wear/flaws; else null.
- color: the dominant colour.
- summary: one short human sentence, e.g. "Black 90s Roberto Cavalli mesh top".

Call the report_item tool with your findings.`;

const TOOL = {
 name: "report_item",
 description: "Report the identified attributes of the fashion item.",
 input_schema: {
 type: "object",
 properties: {
 brand: { type: ["string", "null"], description: "Designer/label, or null if not confidently identifiable" },
 brandConfidence: { type: "string", enum: ["high", "medium", "low"] },
 itemType: { type: ["string", "null"] },
 category: { type: ["string", "null"] },
 era: { type: ["string", "null"] },
 condition: { type: ["string", "null"], enum: ["Excellent", "Very Good", "Good", "Fair", null] },
 color: { type: ["string", "null"] },
 summary: { type: "string" },
 },
 required: ["brandConfidence", "summary"],
 },
} as const;

export function isVisionConfigured(): boolean {
 return !!process.env.ANTHROPIC_API_KEY;
}

// Builds the colour prompt. When we know WHAT the listing is selling (from its
// title), we tell the model so it colours the right garment. A model often wears
// other clothing (e.g. a black cardigan over a tan skirt) that would otherwise
// dominate a whole-image colour read and mislabel the item.
function colorPrompt(itemHint?: string | null): string {
 const focus = itemHint && itemHint.trim()
 ? `This listing is selling: "${itemHint.trim()}". Identify the dominant colour of THAT specific item. A model may be wearing other garments alongside it. Focus ONLY on the item being sold and ignore the model's other clothing, the background, and any props.`
 : `Identify the single dominant colour of the MAIN garment/bag/shoe in this product photo, ignoring the background and any model.`;
 return `${focus} Reply with just one common colour word (e.g. black, navy, burgundy, cream, charcoal). If you genuinely can't tell, reply exactly: unknown.`;
}

// Lean colour-only read for the product colour backfill. Takes a public image URL
// (no fetch/encode), tiny output → cheapest possible call. `itemHint` (the listing
// title) tells the model which item to colour. Returns the raw colour text (caller
// normalizes via normalizeColor); null on no answer / "unknown".
export async function identifyColor(imageUrl: string, itemHint?: string | null): Promise<string | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
 if (!imageUrl) return null;

 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: {
 "x-api-key": apiKey,
 "anthropic-version": "2023-06-01",
 "content-type": "application/json",
 },
 body: JSON.stringify({
 model: MODEL,
 max_tokens: 16,
 messages: [
  {
  role: "user",
  content: [
   { type: "image", source: { type: "url", url: imageUrl } },
   { type: "text", text: colorPrompt(itemHint) },
  ],
  },
 ],
 }),
 });

 if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 const text = data.content?.find((c) => c.type === "text")?.text?.trim().toLowerCase() ?? "";
 if (!text || text === "unknown") return null;
 return text;
}

// Lean category-only read for the category QA. Deliberately does NOT take the
// listing title: we want an INDEPENDENT read of what the photo shows, so it can
// be compared against the title-inferred category to catch mislabels (e.g. a
// "Bracelet Bag" the title-keyword logic filed under jewelry). Returns the raw
// category word (caller maps via normalizeCategory); null on no answer.
const CATEGORY_WORDS = [
 "tops", "dresses", "skirts", "pants", "shorts", "jumpsuits", "sweaters",
 "coats & jackets", "jeans", "bags", "shoes", "jewelry", "accessories",
 "lingerie", "swimwear",
];

export async function identifyCategory(imageUrl: string): Promise<string | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
 if (!imageUrl) return null;

 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: {
 "x-api-key": apiKey,
 "anthropic-version": "2023-06-01",
 "content-type": "application/json",
 },
 body: JSON.stringify({
 model: MODEL,
 max_tokens: 16,
 messages: [
  {
  role: "user",
  content: [
   { type: "image", source: { type: "url", url: imageUrl } },
   { type: "text", text: `What broad fashion category is the MAIN item being sold in this product photo? Ignore any model's other clothing, the background, and props. Reply with exactly one of: ${CATEGORY_WORDS.join(", ")}. If you genuinely can't tell, reply exactly: unknown.` },
  ],
  },
 ],
 }),
 });

 if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 const text = data.content?.find((c) => c.type === "text")?.text?.trim().toLowerCase() ?? "";
 if (!text || text === "unknown") return null;
 return text;
}

// Verification pass for the category QA. Given the broad GROUP a product is filed
// under, asks a stronger model to confirm whether the MAIN item in the photo
// actually belongs to that group. Returns "match" | "mismatch" | null (unsure).
// Run only on Stage-1 candidates so the strong-model cost stays tiny. This is
// what drives the false-positive rate down (cheap Haiku flags, strong model
// confirms before we report). Defaults to Opus for accuracy.
const VERIFY_MODEL = process.env.VISION_VERIFY_MODEL || "claude-opus-4-8";

export async function confirmCategoryGroup(imageUrl: string, groupPhrase: string): Promise<"match" | "mismatch" | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
 if (!imageUrl) return null;

 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: {
 "x-api-key": apiKey,
 "anthropic-version": "2023-06-01",
 "content-type": "application/json",
 },
 body: JSON.stringify({
 model: VERIFY_MODEL,
 max_tokens: 8,
 messages: [
  {
  role: "user",
  content: [
   { type: "image", source: { type: "url", url: imageUrl } },
   { type: "text", text: `This product is listed under "${groupPhrase}". Look ONLY at the main item being sold. Ignore any model's other clothing, the background, and props. Does that item genuinely belong to "${groupPhrase}"? Answer with exactly one word: YES or NO.` },
  ],
  },
 ],
 }),
 });

 if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
 const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
 const text = data.content?.find((c) => c.type === "text")?.text?.trim().toLowerCase() ?? "";
 if (text.startsWith("yes")) return "match";
 if (text.startsWith("no")) return "mismatch";
 return null;
}

export async function identifyItem(images: VisionImage[]): Promise<ItemIdentification> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
 if (images.length === 0) throw new Error("No images provided");

 const content = [
 ...images.slice(0, 4).map((img) => ({
 type: "image" as const,
 source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
 })),
 { type: "text" as const, text: PROMPT },
 ];

 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: {
 "x-api-key": apiKey,
 "anthropic-version": "2023-06-01",
 "content-type": "application/json",
 },
 body: JSON.stringify({
 model: MODEL,
 max_tokens: 500,
 tools: [TOOL],
 tool_choice: { type: "tool", name: "report_item" },
 messages: [{ role: "user", content }],
 }),
 });

 if (!res.ok) {
 throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
 }
 const data = (await res.json()) as { content?: Array<{ type: string; input?: Record<string, unknown> }> };
 const toolUse = data.content?.find((c) => c.type === "tool_use");
 if (!toolUse?.input) throw new Error("No structured output from vision model");
 const i = toolUse.input;
 return {
 brand: (i.brand as string) ?? null,
 brandConfidence: (i.brandConfidence as "high" | "medium" | "low") ?? "low",
 itemType: (i.itemType as string) ?? null,
 category: (i.category as string) ?? null,
 era: (i.era as string) ?? null,
 condition: (i.condition as string) ?? null,
 color: (i.color as string) ?? null,
 summary: (i.summary as string) ?? "Item",
 };
}
