/* eslint-disable @typescript-eslint/no-explicit-any */
// VYA Sidekick — a conversational assistant for sellers. It's Claude with tool-use,
// where the "tools" are thin wrappers around operations we already have. Every tool
// runs scoped to ONE store slug (resolved from the seller's session by the route), so
// the Sidekick can only ever act on that seller's own store.
import { getStorefrontBySlug, setStorefrontTheme, upsertStorefront } from "./storefront-db";
import { getTemplate, STOREFRONT_TEMPLATES, HEADING_FONTS, BODY_FONTS } from "./storefront-templates";
import { makeBlock, sanitizeBlocks, sanitizePages, pageSlugify, BLOCK_TYPE_IDS } from "./storefront-blocks";
import { getListingsByStore, updateListing } from "./listings-db";
import { listCapturePaths, getCapturePage, updateCapturePageHtml, setSiteCss } from "./site-capture-db";
import { list } from "@vercel/blob";
import type { StorefrontTheme } from "./store-import";
import { AI_MODELS } from "./ai-models";
import { getMemories, addMemory, forgetMemory } from "./assistant-memory-db";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = AI_MODELS.assistant;
const HEX = /^#[0-9a-fA-F]{6}$/;

export type AssistantMessage = { role: "user" | "assistant"; content: any };
export type AssistantAction = { name: string; ok: boolean };

export function isAssistantConfigured(): boolean {
 return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function anthropic(body: any): Promise<any> {
 const apiKey = process.env.ANTHROPIC_API_KEY;
 if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
 const res = await fetch(ANTHROPIC_URL, {
 method: "POST",
 headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
 body: JSON.stringify(body),
 });
 if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
 return res.json();
}

const templateIds = STOREFRONT_TEMPLATES.map((t) => t.id);

const TOOLS = [
 { name: "get_storefront", description: "Read the store's current storefront: design (template, colors, fonts), handle, tagline, hero image, and whether it's live.", input_schema: { type: "object", properties: {} } },
 { name: "update_storefront_design", description: "Change the storefront look. Provide any of: a starter template id, colors (hex like #1a1a1a), fonts. Confirm with the seller before calling this.", input_schema: { type: "object", properties: { template: { type: "string", enum: templateIds }, colors: { type: "object", properties: { bg: { type: "string" }, text: { type: "string" }, accent: { type: "string" } } }, fonts: { type: "object", properties: { heading: { type: "string", enum: HEADING_FONTS }, body: { type: "string", enum: BODY_FONTS } } } } } },
 { name: "style_storefront", description: "Apply raw custom CSS to the block-based storefront, layered over the theme site-wide — for ANY styling or layout change the section fields can't do: repositioning, alignment, spacing, sizing, per-element colors, borders, hover effects, etc. This is how you fulfill open-ended design requests. Pass the FULL CSS to set (it REPLACES the previous custom CSS — include everything you want kept); pass empty css to clear. Target these stable classes the storefront outputs: each section is `.vya-sec` + `.vya-<type>` (`.vya-hero`, `.vya-featured`, `.vya-text`, `.vya-newsletter`, `.vya-announcement`, `.vya-image`, `.vya-gallery`, `.vya-video`) + `.vya-b-<id>` to target ONE section by id (from list_sections). Inside a section: `.vya-heading` (heading), `.vya-sub` (subtext), `.vya-body` (text body), `.vya-cta` (button), `.vya-img` (image), and `.vya-hero-inner` (the hero's content box — change its flex to move content). Example — move the hero heading to the bottom-left: `.vya-hero .vya-hero-inner{align-items:flex-start;justify-content:flex-end;text-align:left}`. State the change and confirm before calling.", input_schema: { type: "object", properties: { css: { type: "string" } }, required: ["css"] } },
 { name: "list_photos", description: "List the photo URLs in the store's media library.", input_schema: { type: "object", properties: {} } },
 { name: "set_hero_photo", description: "Set the storefront hero banner image to a URL (usually from the library). Confirm first.", input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
 { name: "list_inventory", description: "List the store's listings: id, title, price, status, and whether it has a description.", input_schema: { type: "object", properties: { activeOnly: { type: "boolean" } } } },
 { name: "write_description", description: "Write a polished, SEO-friendly description for a vintage item. Returns text only — does not save it.", input_schema: { type: "object", properties: { title: { type: "string" }, details: { type: "string" } }, required: ["title"] } },
 { name: "update_listing", description: "Update a listing's title, price (in USD), and/or description, by id. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, priceUsd: { type: "number" }, description: { type: "string" } }, required: ["id"] } },
 { name: "list_sections", description: "List the home page's sections in order (id, type, props). The storefront home page is built from these stackable sections.", input_schema: { type: "object", properties: {} } },
 { name: "add_section", description: "Add a section to the home page. type is one of: announcement (props: text), hero (props: heading, subtext, cta, image), featured (props: heading — a grid of the store's products), text (props: heading, body), image (props: image, caption), gallery (props: images — newline-separated URLs), video (props: url — a YouTube, Vimeo, or .mp4 link; optional caption), newsletter (props: heading, subtext). Optionally set style.bg to 'accent', 'dark', or a #hex to give the section a colored background. position is the 0-based index to insert at (defaults to the end). Confirm first.", input_schema: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, position: { type: "number" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } },
 { name: "update_section", description: "Update a section by id — merge new props and/or set style.bg ('accent', 'dark', or a #hex, or empty to reset to default). Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["id"] } },
 { name: "remove_section", description: "Remove a section by id. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
 { name: "move_section", description: "Move a section up or down by id. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } }, required: ["id", "direction"] } },
 { name: "list_pages", description: "List the storefront's pages — the home page plus any extra pages (About, FAQ, etc.) with slug, title, and section count.", input_schema: { type: "object", properties: {} } },
 { name: "create_page", description: "Create a new storefront page (e.g. About, FAQ, Shipping & Returns). Provide a title and optionally initial blocks (same types/props/style as set_layout). It's linked in the nav automatically. Write real copy. Confirm first.", input_schema: { type: "object", properties: { title: { type: "string" }, blocks: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } } }, required: ["title"] } },
 { name: "set_page_layout", description: "Replace all sections on a page (by slug) with a new set of blocks. Use slug 'shop' to edit the SHOP page's intro content — sections (heading, text, image, gallery, etc.) shown ABOVE the store's auto product grid; the products list themselves below automatically, so don't add a products/featured section there. For any other slug it's an extra page (About, FAQ…). Confirm first.", input_schema: { type: "object", properties: { slug: { type: "string" }, blocks: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } } }, required: ["slug", "blocks"] } },
 { name: "delete_page", description: "Delete an extra page by slug. Confirm first.", input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
 { name: "list_captured_pages", description: "List the pages of the seller's CAPTURED site (their real existing site, hosted on VYA) by path. Only relevant if they brought their own site over rather than building from sections.", input_schema: { type: "object", properties: {} } },
 { name: "edit_captured_page", description: "Edit copy on one page of the captured site: replace every occurrence of `find` with `replace` in that page's HTML (path from list_captured_pages). Use for wording changes, fixing a typo, updating a banner/announcement. `find` must be exact visible text. Confirm first.", input_schema: { type: "object", properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["path", "find", "replace"] } },
 { name: "style_captured_site", description: "Apply site-wide custom CSS to the captured site — injected over the original styles on every page, for color/font/spacing/button tweaks. Pass the full CSS to set (replaces any previous custom CSS); pass empty css to clear. Confirm first.", input_schema: { type: "object", properties: { css: { type: "string" } }, required: ["css"] } },
 { name: "set_layout", description: "Replace the ENTIRE home page with a full set of sections at once — use this to build or rebuild a whole storefront in one go. Provide blocks as an ordered array of { type, props, style? }. Types + props: announcement {text}; hero {heading, subtext, cta, image}; featured {heading}; text {heading, body}; image {image, caption}; gallery {images: newline-separated URLs}; video {url: a YouTube/Vimeo/.mp4 link, caption}; newsletter {heading, subtext}. Optionally give a section style.bg ('accent', 'dark', or a #hex) for contrast — e.g. a dark about section. Write real, tailored copy for this seller — don't leave placeholders. Confirm before calling.", input_schema: { type: "object", properties: { blocks: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } } }, required: ["blocks"] } },
 { name: "remember_fact", description: "Save a durable fact about this seller or store to long-term memory — a preference, brand-voice note, a decision, a recurring detail — anything worth recalling in future conversations (e.g. 'Prefers minimal, editorial storefronts', 'Brand voice is playful and irreverent', 'Ships only within the US', 'Focuses on 90s designer denim'). Do this whenever the seller tells you something about themselves or their store that should persist. One clear, self-contained fact per call. No need to confirm — just remember and mention it briefly.", input_schema: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] } },
 { name: "forget_fact", description: "Remove saved memories matching a phrase (case-insensitive substring). Use when the seller says something changed or asks you to forget it.", input_schema: { type: "object", properties: { match: { type: "string" } }, required: ["match"] } },
 { name: "list_memory", description: "List everything currently in long-term memory for this store.", input_schema: { type: "object", properties: {} } },
];

async function loadTheme(slug: string): Promise<StorefrontTheme> {
 const sf = (await getStorefrontBySlug(slug)) ?? (await upsertStorefront(slug, { handle: slug, enabled: false, tagline: "", accentColor: "#5D0F17", heroImage: "", about: "" }));
 return { ...(sf.theme ?? {}) };
}

async function runTool(slug: string, name: string, input: any): Promise<any> {
 switch (name) {
 case "get_storefront": {
 const sf = await getStorefrontBySlug(slug);
 return { template: sf?.theme?.template ?? null, colors: sf?.theme?.colors ?? null, fonts: sf?.theme?.fonts ?? null, customCss: sf?.theme?.customCss ?? null, handle: sf?.handle ?? null, tagline: sf?.tagline ?? null, heroImage: sf?.heroImage ?? null, live: !!sf?.enabled, templatesAvailable: templateIds };
 }
 case "style_storefront": {
 const css = String(input.css ?? "").slice(0, 20000);
 const theme = await loadTheme(slug);
 theme.customCss = css;
 await setStorefrontTheme(slug, theme);
 return { ok: true, applied: css.trim() ? `${css.length} chars of CSS` : "cleared" };
 }
 case "update_storefront_design": {
 const sf = (await getStorefrontBySlug(slug)) ?? (await upsertStorefront(slug, { handle: slug, enabled: false, tagline: "", accentColor: "#5D0F17", heroImage: "", about: "" }));
 const theme: StorefrontTheme = { ...(sf.theme ?? {}) };
 if (input.template) { const t = getTemplate(String(input.template)); if (t) { theme.template = t.id; theme.colors = { ...t.colors }; theme.fonts = { ...t.fonts }; } }
 if (input.colors) { const c = input.colors; theme.colors = { bg: HEX.test(c.bg) ? c.bg : theme.colors?.bg || "#FFFDF8", text: HEX.test(c.text) ? c.text : theme.colors?.text || "#1a1a1a", accent: HEX.test(c.accent) ? c.accent : theme.colors?.accent || "#5D0F17" }; }
 if (input.fonts) { const f = input.fonts; theme.fonts = { heading: HEADING_FONTS.includes(f.heading) ? f.heading : theme.fonts?.heading || "Playfair Display", body: BODY_FONTS.includes(f.body) ? f.body : theme.fonts?.body || "Inter" }; }
 await setStorefrontTheme(slug, theme);
 return { ok: true, applied: { template: theme.template, colors: theme.colors, fonts: theme.fonts } };
 }
 case "list_photos": {
 const { blobs } = await list({ prefix: `assets/${slug}/` });
 return { photos: blobs.map((b) => b.url) };
 }
 case "set_hero_photo": {
 const sf = await getStorefrontBySlug(slug);
 await upsertStorefront(slug, { handle: sf?.handle || slug, enabled: !!sf?.enabled, tagline: sf?.tagline || "", accentColor: sf?.accentColor || "#5D0F17", heroImage: String(input.url || ""), about: sf?.about || "" });
 return { ok: true, heroImage: input.url };
 }
 case "list_inventory": {
 const items = await getListingsByStore(slug, !!input.activeOnly);
 return { count: items.length, items: items.slice(0, 40).map((l) => ({ id: l.id, title: l.title, priceUsd: l.price, status: l.status, hasDescription: !!l.description })) };
 }
 case "write_description": {
 const r = await anthropic({ model: MODEL, max_tokens: 400, system: "You write concise, evocative, SEO-aware product descriptions for curated vintage fashion. 2–3 sentences, no hype, no emojis. Note era, material, and how to style it where you can infer it.", messages: [{ role: "user", content: `Write a description for: ${input.title}${input.details ? `\nDetails: ${input.details}` : ""}` }] });
 const text = (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
 return { description: text };
 }
 case "update_listing": {
 const items = await getListingsByStore(slug, false);
 const cur = items.find((l) => l.id === String(input.id));
 if (!cur) return { error: "No listing with that id." };
 const li = { title: input.title ?? cur.title, price: input.priceUsd != null ? Number(input.priceUsd) : cur.price, currency: cur.currency, images: cur.images, size: cur.size, description: input.description ?? cur.description, category: cur.category, tags: cur.tags, status: cur.status };
 const updated = await updateListing(String(input.id), slug, li);
 return updated ? { ok: true, id: updated.id, title: updated.title, priceUsd: updated.price } : { error: "Update failed." };
 }
 case "list_captured_pages": {
 const paths = await listCapturePaths(slug).catch(() => []);
 return { hasCapturedSite: paths.length > 0, count: paths.length, pages: paths.slice(0, 80) };
 }
 case "edit_captured_page": {
 const path = String(input.path || "");
 const find = String(input.find ?? "");
 const replace = String(input.replace ?? "");
 if (!path || !find) return { error: "path and find are required." };
 const html = await getCapturePage(slug, path).catch(() => null);
 if (html == null) return { error: "No captured page at that path — use list_captured_pages." };
 if (!html.includes(find)) return { error: "That exact text wasn't found on the page." };
 const replaced = html.split(find).length - 1;
 const ok = await updateCapturePageHtml(slug, path, html.split(find).join(replace));
 return ok ? { ok: true, path, replaced } : { error: "Couldn't save the edit." };
 }
 case "style_captured_site": {
 const css = String(input.css ?? "").slice(0, 20000);
 await setSiteCss(slug, css);
 return { ok: true, applied: css.trim() ? `${css.length} chars of CSS` : "cleared" };
 }
 case "list_sections": {
 const sf = await getStorefrontBySlug(slug);
 const blocks = sanitizeBlocks(sf?.theme?.blocks ?? []);
 return { sections: blocks.map((b, i) => ({ index: i, id: b.id, type: b.type, props: b.props })), addableTypes: BLOCK_TYPE_IDS };
 }
 case "add_section": {
 const theme = await loadTheme(slug);
 const blocks = sanitizeBlocks(theme.blocks ?? []);
 const block = makeBlock(input.type, typeof input.props === "object" && input.props ? input.props : {});
 if (input.style && typeof input.style === "object") block.style = input.style;
 const pos = Number.isInteger(input.position) ? Math.max(0, Math.min(blocks.length, Number(input.position))) : blocks.length;
 blocks.splice(pos, 0, block);
 theme.blocks = sanitizeBlocks(blocks);
 await setStorefrontTheme(slug, theme);
 return { ok: true, added: block, count: theme.blocks.length };
 }
 case "update_section": {
 const theme = await loadTheme(slug);
 const blocks = sanitizeBlocks(theme.blocks ?? []);
 const b = blocks.find((x) => x.id === input.id);
 if (!b) return { error: "No section with that id." };
 if (input.props && typeof input.props === "object") b.props = { ...b.props, ...input.props };
 if (input.style && typeof input.style === "object") b.style = input.style.bg ? { bg: String(input.style.bg) } : undefined;
 theme.blocks = sanitizeBlocks(blocks);
 await setStorefrontTheme(slug, theme);
 return { ok: true, section: b };
 }
 case "remove_section": {
 const theme = await loadTheme(slug);
 const blocks = sanitizeBlocks(theme.blocks ?? []);
 const next = blocks.filter((x) => x.id !== input.id);
 if (next.length === blocks.length) return { error: "No section with that id." };
 theme.blocks = next;
 await setStorefrontTheme(slug, theme);
 return { ok: true, count: next.length };
 }
 case "move_section": {
 const theme = await loadTheme(slug);
 const blocks = sanitizeBlocks(theme.blocks ?? []);
 const idx = blocks.findIndex((x) => x.id === input.id);
 if (idx < 0) return { error: "No section with that id." };
 const to = input.direction === "up" ? idx - 1 : idx + 1;
 if (to < 0 || to >= blocks.length) return { ok: true, note: "Already at the edge." };
 [blocks[idx], blocks[to]] = [blocks[to], blocks[idx]];
 theme.blocks = blocks;
 await setStorefrontTheme(slug, theme);
 return { ok: true, order: blocks.map((b) => b.type) };
 }
 case "set_layout": {
 const theme = await loadTheme(slug);
 const incoming = Array.isArray(input.blocks) ? input.blocks.map((b: any) => ({ id: "", type: b.type, props: typeof b.props === "object" && b.props ? b.props : {}, style: b.style })) : [];
 theme.blocks = sanitizeBlocks(incoming);
 await setStorefrontTheme(slug, theme);
 return { ok: true, count: theme.blocks.length, order: theme.blocks.map((b) => b.type) };
 }
 case "list_pages": {
 const sf = await getStorefrontBySlug(slug);
 const pages = sanitizePages(sf?.theme?.extraPages ?? []);
 return { home: { sections: sanitizeBlocks(sf?.theme?.blocks ?? []).length }, shop: { introSections: sanitizeBlocks(sf?.theme?.shopBlocks ?? []).length, note: "The Shop page auto-lists products; set_page_layout with slug 'shop' edits the intro content shown above the grid." }, pages: pages.map((p) => ({ slug: p.slug, title: p.title, sections: p.blocks.length })) };
 }
 case "create_page": {
 const theme = await loadTheme(slug);
 const pages = sanitizePages(theme.extraPages ?? []);
 const incoming = Array.isArray(input.blocks) ? input.blocks.map((b: any) => ({ id: "", type: b.type, props: typeof b.props === "object" && b.props ? b.props : {}, style: b.style })) : [];
 pages.push({ slug: pageSlugify(input.title || "page"), title: String(input.title || "Page").slice(0, 60), blocks: sanitizeBlocks(incoming) });
 theme.extraPages = sanitizePages(pages);
 await setStorefrontTheme(slug, theme);
 const created = theme.extraPages[theme.extraPages.length - 1];
 return { ok: true, page: { slug: created.slug, title: created.title, sections: created.blocks.length } };
 }
 case "set_page_layout": {
 const theme = await loadTheme(slug);
 const incoming = Array.isArray(input.blocks) ? input.blocks.map((b: any) => ({ id: "", type: b.type, props: typeof b.props === "object" && b.props ? b.props : {}, style: b.style })) : [];
 // "shop" is the built-in catalogue page: its blocks are intro content shown ABOVE the auto product grid.
 if (input.slug === "shop") {
 theme.shopBlocks = sanitizeBlocks(incoming);
 await setStorefrontTheme(slug, theme);
 return { ok: true, slug: "shop", sections: theme.shopBlocks.length };
 }
 const pages = sanitizePages(theme.extraPages ?? []);
 const pg = pages.find((p) => p.slug === input.slug);
 if (!pg) return { error: "No page with that slug." };
 pg.blocks = sanitizeBlocks(incoming);
 theme.extraPages = pages;
 await setStorefrontTheme(slug, theme);
 return { ok: true, slug: pg.slug, sections: pg.blocks.length };
 }
 case "delete_page": {
 const theme = await loadTheme(slug);
 const pages = sanitizePages(theme.extraPages ?? []);
 const next = pages.filter((p) => p.slug !== input.slug);
 if (next.length === pages.length) return { error: "No page with that slug." };
 theme.extraPages = next;
 await setStorefrontTheme(slug, theme);
 return { ok: true, remaining: next.map((p) => p.slug) };
 }
 case "remember_fact": {
 const fact = String(input.fact ?? "").trim();
 const saved = await addMemory(slug, fact);
 return saved ? { ok: true, remembered: fact } : { ok: true, note: "Already knew that (or nothing to save)." };
 }
 case "forget_fact": {
 const removed = await forgetMemory(slug, String(input.match ?? ""));
 return { ok: true, forgot: removed };
 }
 case "list_memory": {
 const memory = await getMemories(slug);
 return { memory, count: memory.length };
 }
 default:
 return { error: "Unknown tool." };
 }
}

const SYSTEM = `You are VYA Sidekick, a warm, sharp assistant inside the VYA seller portal. VYA is a hosted storefront platform for vintage and secondhand fashion sellers. You help sellers run and customize their store through conversation.

You can:
- Change the storefront design — starter template, colors, fonts, and the hero photo.
- Build the storefront page out of sections (blocks) — add, edit, reorder, and remove an announcement bar, hero banner, featured-products grid, text, image, gallery, or newsletter. This is how you "build" the page when a seller asks for things like "add a sale banner" or "put an about section at the bottom." Give a section a colored background with style.bg ('accent', 'dark', or a #hex).
- Create and manage additional pages (About, FAQ, Shipping & Returns, etc.) with create_page / list_pages / set_page_layout / delete_page. Extra pages are built from the same sections and are linked in the nav automatically.
- Help with listings — list inventory, write and improve product descriptions, and edit titles, prices, and descriptions.
- Remember across conversations — when the seller shares a preference, their brand voice, or a decision worth keeping, save it with remember_fact so you recall it next time. Everything you already remember is given to you at the start of each chat; use it and don't re-ask.

You can also answer questions, not just take actions — resale and vintage expertise, pricing and merchandising, marketing and growth, business advice, or general questions even outside VYA. Be genuinely useful and never refuse a question just because it's off-topic.

When a seller asks you to build or change part of their page, prefer the section tools (add_section / update_section / move_section / remove_section). Check the current layout with list_sections first when it helps.

For any OPEN-ENDED design or layout request that the section fields don't cover — repositioning an element, alignment, spacing, sizing, custom colors, borders, hover effects, "move the heading to the bottom left", "make the buttons rounded", "add more space above the products", etc. — use style_storefront to write real CSS targeting the .vya-* classes. Never say you "can't" make a design change: if it's expressible in CSS, do it with style_storefront. It replaces the whole custom-CSS block, so when adding to existing styling, read the current CSS with get_storefront first and include it. Confirm the change in one line before applying.

When a seller asks you to build or redesign their WHOLE storefront ("build me a storefront", "design my homepage", "make me a store for X"), do it in one move: first call update_storefront_design to set a fitting template/colors/fonts, then call set_layout with a complete page — usually a hero, a featured-products grid, a short about/text section, and a newsletter. Write real, specific copy in their voice (use their store name and what they sell); never leave placeholder text. Briefly preview the plan and confirm before applying.

Rules:
- For READ actions (get_storefront, list_photos, list_inventory, write_description, list_sections) just do it, no need to ask.
- For any CHANGE (update_storefront_design, style_storefront, set_hero_photo, update_listing, add_section, update_section, remove_section, move_section) first state in one short line exactly what you'll change, and ask the seller to confirm. Only call the write tool AFTER they confirm in their next message.
- Be concise and friendly — prefer doing over explaining. After a change, confirm what changed in one line.
- You only ever take ACTIONS on THIS seller's own store. For an action you genuinely can't perform yet (e.g. orders, shipping, payouts), say it's on the way — but still answer the underlying question if you can.`;

export async function runAssistant(slug: string, messages: AssistantMessage[], context?: { page?: string }): Promise<{ reply: string; actions: AssistantAction[] }> {
 // Inject long-term memory so the Sidekick "remembers" the seller across conversations.
 const memories = await getMemories(slug).catch(() => []);
 const memText = memories.length
 ? `\n\nLong-term memory — what you already know about this seller & store from past conversations (use it; don't ask again for things listed here):\n${memories.map((m) => `- ${m}`).join("\n")}`
 : "";
 const sys = SYSTEM + memText + (context?.page ? `\n\nThe seller is currently on the "${context.page}" page of the portal.` : "");
 const convo: AssistantMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
 const actions: AssistantAction[] = [];

 for (let i = 0; i < 8; i++) {
 const res = await anthropic({ model: MODEL, max_tokens: 1024, system: sys, tools: TOOLS, messages: convo });
 convo.push({ role: "assistant", content: res.content });

 if (res.stop_reason === "tool_use") {
 const results: any[] = [];
 for (const block of res.content || []) {
 if (block.type === "tool_use") {
 const out = await runTool(slug, block.name, block.input).catch((e: any) => ({ error: String(e?.message || e) }));
 actions.push({ name: block.name, ok: !out?.error });
 results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out).slice(0, 4000) });
 }
 }
 convo.push({ role: "user", content: results });
 continue;
 }

 const text = (res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
 return { reply: text || "(done)", actions };
 }
 return { reply: "That took more steps than expected — mind rephrasing?", actions };
}
