/* eslint-disable @typescript-eslint/no-explicit-any */
// One-click "build my storefront with VYA" for sellers with no existing site.
// Claude designs a complete boutique storefront — template, colors, fonts, homepage
// sections, and About / FAQ / Shipping pages — from the store's products + brand.
import { getStorefrontBySlug, setStorefrontTheme, upsertStorefront } from "./storefront-db";
import { getListingsByStore } from "./listings-db";
import { STOREFRONT_TEMPLATES, getTemplate, templateShopBlocks, templatePages, HEADING_FONTS, BODY_FONTS } from "./storefront-templates";
import { sanitizeBlocks, sanitizePages } from "./storefront-blocks";
import { stores } from "./stores";
import type { StorefrontTheme } from "./store-import";
import { AI_MODELS } from "./ai-models";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.storefront;
const HEX = /^#[0-9a-fA-F]{6}$/;

async function anthropic(body: any): Promise<any> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
 const res = await fetch(ANTHROPIC_URL, { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) });
 if (!res.ok) throw new Error(`anthropic ${res.status}`);
 return res.json();
}

export function isGenerateConfigured(): boolean {
 return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateStarterStorefront(slug: string): Promise<{ ok: boolean; blocks: number; pages: number; error?: string }> {
 const sf = await getStorefrontBySlug(slug);
 const store = stores.find((s) => s.slug === slug);
 const storeName = sf?.theme?.storeName || store?.name || slug.replace(/-/g, " ");
 const listings = await getListingsByStore(slug, true).catch(() => []);
 const products = listings.slice(0, 24).map((l) => ({ title: l.title, price: l.price, category: l.category, desc: (l.description || "").slice(0, 120) }));

 const sys = "You are a world-class boutique storefront designer for VYA, a curated vintage-fashion platform. You design complete, tasteful storefronts and write real, evocative copy — never placeholders. Output STRICT JSON only, no markdown.";
 const prompt = `Design a complete storefront for "${storeName}", a curated vintage / secondhand fashion store.
${products.length ? `Their products (${products.length} shown):\n${JSON.stringify(products)}` : "They haven't added products yet — write copy that suits a vintage boutique."}

Return ONLY a JSON object (no markdown fences) shaped exactly like:
{
 "template": one of ${JSON.stringify(STOREFRONT_TEMPLATES.map((t) => t.id))},
 "colors": { "bg": "#hex", "text": "#hex", "accent": "#hex" },
 "fonts": { "heading": one of ${JSON.stringify(HEADING_FONTS)}, "body": one of ${JSON.stringify(BODY_FONTS)} },
 "blocks": [ ordered homepage sections ],
 "pages": [ { "title": "About", "blocks": [...] }, { "title": "FAQ", "blocks": [...] }, { "title": "Shipping & Returns", "blocks": [...] } ]
}
A block is { "type": ..., "props": {...}, "style"?: { "bg": "accent" | "dark" | "#hex" } }. Block types + props:
- announcement { text } — a thin top bar (e.g. a shipping or new-arrivals note)
- hero { heading, subtext, cta } — the opening banner
- featured { heading } — a grid of the store's products (auto-filled; just give a heading)
- text { heading, body } — a copy section (the store's story, etc.)
- newsletter { heading, subtext } — email signup
Homepage order: announcement, hero, featured, an about/story text section (use style.bg "dark" or "accent" for contrast), then newsletter. Write copy SPECIFIC to ${storeName} and vintage fashion — warm, editorial, not generic. For pages, write genuine About / FAQ / Shipping & Returns copy as text blocks. Choose colors + fonts that feel boutique and match the vibe.`;

 let gen: any;
 try {
 const r = await anthropic({ model: MODEL, max_tokens: 4000, system: sys, messages: [{ role: "user", content: prompt }] });
 const text = (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
 const m = text.match(/\{[\s\S]*\}/);
 gen = JSON.parse(m ? m[0] : text);
 } catch {
 return { ok: false, blocks: 0, pages: 0, error: "Generation failed — please try again." };
 }

 const template = getTemplate(String(gen.template)) || STOREFRONT_TEMPLATES[0];
 const hex = (c: any, fb: string) => (typeof c === "string" && HEX.test(c) ? c : fb);
 const colors = { bg: hex(gen.colors?.bg, template.colors.bg), text: hex(gen.colors?.text, template.colors.text), accent: hex(gen.colors?.accent, template.colors.accent) };
 const fonts = { heading: HEADING_FONTS.includes(gen.fonts?.heading) ? gen.fonts.heading : template.fonts.heading, body: BODY_FONTS.includes(gen.fonts?.body) ? gen.fonts.body : template.fonts.body };
 const blocks = sanitizeBlocks(gen.blocks);
 const pages = sanitizePages(gen.pages);
 if (!blocks.length) return { ok: false, blocks: 0, pages: 0, error: "Generation produced nothing — please try again." };

 // A fresh generation is a CLEAN slate — don't carry over a previous import's
 // logo / nav / cloned sections / hero image (that's how Ascensio's logo lingered).
 await upsertStorefront(slug, { handle: sf?.handle || slug, enabled: sf?.enabled ?? false, tagline: sf?.tagline ?? null, accentColor: colors.accent, heroImage: null, about: sf?.about ?? null });
 // The model writes the home page and the content pages; the template supplies the structural
 // decisions it has no business inventing — corner style, header arrangement, catalogue density, and
 // the Shop page's intro. Without these a generated store lands on the platform defaults and every
 // generation looks the same regardless of which template the model picked.
 const theme: StorefrontTheme = {
  template: template.id,
  colors,
  fonts,
  radius: template.radius,
  headerLayout: template.headerLayout,
  shopGrid: { ...template.grid },
  productLayout: template.productLayout,
  blocks,
  shopBlocks: templateShopBlocks(template.id),
  extraPages: pages.length ? pages : templatePages(template.id),
 };
 await setStorefrontTheme(slug, theme);
 return { ok: true, blocks: blocks.length, pages: pages.length };
}
