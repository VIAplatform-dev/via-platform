// Re-tags an item's category from its cover photo + title, choosing from the canonical
// taxonomy in item-tags.ts. Used by the inventory "Tag with AI" action to clean up items
// whose category is free text, wrong, or missing.
//
// Deliberately narrow: it picks ONE slug from a fixed list, or says "unknown". It never
// invents a category — an unrecognised item is left alone rather than guessed at, because
// a wrong tag is worse than an untagged one (it hides the item under the wrong filter).

import { AI_MODELS } from "./ai-models";
import { recordAnthropic } from "./cost-tracker";
import {
 CATEGORY_GROUPS, categoryTagLabel, isCanonicalCategory, type CategorySlug,
} from "./item-tags";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.categorize;

// The full taxonomy, grouped, as the model sees it — slug first so it answers with a slug.
const TAXONOMY = CATEGORY_GROUPS
 .map((g) => `${g.label}:\n${g.slugs.map((s) => `  ${s} — ${categoryTagLabel(s)}`).join("\n")}`)
 .join("\n");

const SYSTEM = `You categorise second-hand fashion items for a vintage marketplace.

Reply with EXACTLY ONE slug from this list, and nothing else — no punctuation, no explanation:

${TAXONOMY}

Rules:
- Pick the MOST SPECIFIC slug that fits. If it's a cowboy boot, answer "boots", not "shoes". If it's a tote, answer "totes", not "bags". The generic slugs (shoes, bags, accessories, other-clothing) are for items that genuinely don't fit a specific one.
- Categorise the MAIN item being sold. Ignore what a model is wearing alongside it, the background, and props.
- If the photo and title disagree, trust the photo.
- If you genuinely cannot tell, reply exactly: unknown`;

export type CategorizeResult = { id: string; slug: CategorySlug | null };

/** One item → one slug (or null when the model can't tell / the call fails). */
export async function categorizeItem(item: { id: string; title: string; imageUrl?: string | null }): Promise<CategorizeResult> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

 const content: Array<Record<string, unknown>> = [];
 if (item.imageUrl) content.push({ type: "image", source: { type: "url", url: item.imageUrl } });
 content.push({ type: "text", text: `Title: ${item.title || "(untitled)"}\n\nWhich slug?` });

 try {
  const res = await fetch(ANTHROPIC_URL, {
   method: "POST",
   headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
   body: JSON.stringify({
    model: MODEL,
    max_tokens: 16,
    system: SYSTEM,
    messages: [{ role: "user", content }],
   }),
  });
  if (!res.ok) return { id: item.id, slug: null };
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  await recordAnthropic(MODEL, "categorize", data).catch(() => {});
  const answer = (data.content?.find((c) => c.type === "text")?.text ?? "").trim().toLowerCase();
  // Only a verbatim slug counts — anything else (including "unknown") leaves the item alone.
  return { id: item.id, slug: isCanonicalCategory(answer) ? answer : null };
 } catch {
  return { id: item.id, slug: null };
 }
}

/** Categorise a batch, a few at a time so a big sweep doesn't hammer the API. */
export async function categorizeItems(
 items: Array<{ id: string; title: string; imageUrl?: string | null }>,
 concurrency = 4,
): Promise<CategorizeResult[]> {
 const out: CategorizeResult[] = [];
 const queue = items.slice();
 await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
   while (queue.length) {
    const next = queue.shift();
    if (next) out.push(await categorizeItem(next));
   }
  }),
 );
 return out;
}
