import { AI_MODELS } from "./ai-models";
import { STOREFRONT_TEMPLATES, getTemplate } from "./storefront-templates";

// Powers the landing-page "Describe it → build my store" trial. Turns a one-sentence shop
// description into a storefront PREVIEW: an AI-written name + tagline and one of VYA's REAL
// storefront templates (so the look matches what a seller actually gets). It does NOT pull
// products from the live catalog — a prospective seller's preview shouldn't show other stores'
// real inventory; the storefront renders empty product slots until they add their own. Read-only.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.voice; // fast/cheap (Haiku) — the trial should feel instant

export type StorePreview = {
 storeName: string;
 tagline: string;
 template: string; // the chosen storefront-template id
 palette: { bg: string; name: string; accent: string };
};

const TEMPLATE_IDS = STOREFRONT_TEMPLATES.map((t) => t.id);
const DEFAULT_TEMPLATE = getTemplate("elegant") || STOREFRONT_TEMPLATES[0];

async function anthropic(body: unknown): Promise<string | null> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) return null;
 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify(body),
 }).catch(() => null);
 if (!res || !res.ok) return null;
 const j = await res.json().catch(() => null);
 /* eslint-disable @typescript-eslint/no-explicit-any */
 return (j?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("") || null;
}

// If the seller stated a store name in their description, honour it verbatim — don't invent one.
// Handles "The Vintage Guild — …", "Name: …", 'called "X"', and quoted names.
function extractStatedName(desc: string): string | null {
 const s = desc.trim();
 let m = s.match(/^["'“]?([A-Z][^—–:|]{1,38}?)["'”]?\s*[—–:|]\s/);
 if (m && m[1].trim().length >= 2) return m[1].trim();
 m = s.match(/\b(?:called|named)\s+["'“]?([A-Z][\w'&]*(?:\s+[A-Z&][\w'&]*){0,3})/);
 if (m) return m[1].trim();
 m = s.match(/["“]([A-Z][^"”]{1,38})["”]/);
 if (m) return m[1].trim();
 return null;
}

function fallbackName(desc: string): string {
 const cap = desc.match(/\b([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/);
 if (cap) return cap[1];
 const words = desc.split(/\s+/).filter((w) => w.length > 3).slice(0, 2);
 return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "Your Store";
}

export async function generateStorePreview(description: string): Promise<StorePreview> {
 const desc = description.trim().slice(0, 600);

 const sys =
 "You design boutique storefront identities for VYA, a curated vintage-fashion platform. Given a seller's one-line shop description, invent a tasteful identity and pick the best-fitting VYA template. Output STRICT JSON only, no markdown.";
 const prompt = `Shop description: "${desc}"

VYA templates (pick the ONE whose mood best fits):
${STOREFRONT_TEMPLATES.map((t) => `- "${t.id}": ${t.description}`).join("\n")}

Return ONLY this JSON (no fences):
{
 "storeName": if the description already states a shop name (e.g. text before an em-dash, a quoted name, or "called X"), use THAT name EXACTLY. Only invent one if none is given,
 "tagline": a short 3-6 word tagline that reflects the description,
 "template": one of ${JSON.stringify(TEMPLATE_IDS)}
}
Match the template to the vibe. Make the name and tagline specific and true to the description.`;

 let ai: { storeName?: string; tagline?: string; template?: string } = {};
 const raw = await anthropic({ model: MODEL, max_tokens: 300, system: sys, messages: [{ role: "user", content: prompt }] });
 if (raw) {
 try { const m = raw.match(/\{[\s\S]*\}/); ai = JSON.parse(m ? m[0] : raw); } catch { /* fall through */ }
 }

 // A name the seller explicitly wrote wins over anything the model invented.
 const stated = extractStatedName(desc);
 const storeName = stated
 || ((typeof ai.storeName === "string" && ai.storeName.trim()) ? ai.storeName.trim().slice(0, 40) : fallbackName(desc));
 const tagline = (typeof ai.tagline === "string" && ai.tagline.trim()) ? ai.tagline.trim().slice(0, 60) : "Curated vintage · worldwide";

 // Real template → real palette (so the preview looks like a store a seller would actually get).
 const tpl = getTemplate(String(ai.template)) || DEFAULT_TEMPLATE;
 const palette = { bg: tpl.colors.bg, name: tpl.colors.text, accent: tpl.colors.accent };

 return { storeName, tagline, template: tpl.id, palette };
}
