/* eslint-disable @typescript-eslint/no-explicit-any */
// VYA Sidekick — a conversational assistant for sellers. It's Claude with tool-use,
// where the "tools" are thin wrappers around operations we already have. Every tool
// runs scoped to ONE store slug (resolved from the seller's session by the route), so
// the Sidekick can only ever act on that seller's own store.
import { getStorefrontBySlug, setStorefrontTheme, upsertStorefront, revertStorefrontTheme } from "./storefront-db";
import { getTemplate, STOREFRONT_TEMPLATES, HEADING_FONTS, BODY_FONTS } from "./storefront-templates";
import { resolveEffects, type SiteEffects } from "./storefront-effects";
import { storePublicOrigin } from "./plan-b/store-host";
import { sanitizeCode } from "./storefront-code";

/** Where a shopper actually reaches this store: its own domain, else its own origin, else VYA's
 *  internal path. One definition, so no caller has to assemble a URL out of a handle. */
function storefrontUrl(customDomain: string | null | undefined, slug: string, handle: string | null | undefined): string {
 if (customDomain) return `https://${customDomain}`;
 return storePublicOrigin(slug) ?? `https://vyaplatform.com/s/${handle || slug}`;
}
import { makeBlock, sanitizeBlocks, sanitizePages, pageSlugify, BLOCK_TYPE_IDS } from "./storefront-blocks";
import { checkCustomHtml } from "./custom-html-guard";
import { listCapturePaths, getCapturePage, updateCapturePageHtml, setSiteCss } from "./site-capture-db";
import { list } from "@vercel/blob";
import type { StorefrontTheme } from "./store-import";
import { AI_MODELS } from "./ai-models";
import { getMemories, addMemory, forgetMemory } from "./assistant-memory-db";
import { getStoreEmailBrand, getStorefrontEmailBrand, sanitizeBrand, sendStoreCampaign } from "./email";
import { setEmailBrandOverrides, revertEmailBrand, resolveStoreSender } from "./email-settings-db";
import { getStoreAnalytics } from "./store-analytics-db";
import { listSellerOrders, updateOrderStatus, markOrderShipped, getOrderDetail } from "./db/orders";
import { getSellerBySlug } from "./db/sellers";
import { addExpense, listExpenses, expenseTotals, categoryLabel, isExpenseCategory } from "./expenses-db";
// ── The live commerce ("items") model — the real inventory the seller sees, scoped by sellerId. ──
import { listSellerItems, createItem, updateItem, publishItem, publishItems, removeItem, removeItems, markSold, relistItem, getItem, ensurePublishAtColumn } from "./db/inventory";
import { listCollections, getOrCreateCollection, setItemCollections, getItemCollectionIds } from "./db/collections";
import { listCustomerProfiles, addCustomer, setEmailSubscribed, addCustomerTag, removeCustomerTag, setCustomerNote, listCustomerTags } from "./store-customers-db";
import { listDiscounts, addDiscount, updateDiscount, deleteDiscount } from "./store-discounts-db";
import { getConversationsByStore, getConversationForStore, getMessages, addMessage, markStoreRead } from "./messaging-db";
import { listOffersByStore, getOfferForStore, respondToOffer, countPendingForStore } from "./offers-db";
import { getInboxSettings, updateInboxSettings } from "./storefront-settings-db";
import { getAutomations, setBuiltinEnabled, addCustomAutomation, setCustomEnabled, removeCustomAutomation, BUILTIN_AUTOMATIONS, CUSTOM_TRIGGERS } from "./automations-db";
import { getPlatformAccounts, upsertPlatformAccount, removePlatformAccount, createCrossListingsForItem, syncItemToApiPlatforms, delistEverywhere, getCrossListBoard, PLATFORMS } from "./cross-listing-db";
import { getConsignmentSummary, getConsignmentSettings, upsertConsignmentSettings, listConsignors, getConsignor, createConsignor, updateConsignor, deleteConsignor, getSplitRules, setSplitRules } from "./consignment-db";
// One email-tool connection, covering Klaviyo and Mailchimp. See esp-db.ts / esp-client.ts.
import { getEspConnection, disconnectEsp } from "./esp-db";
import { getStoreIgConnection, setStoreIgAutoPost, disconnectStoreIg, publishItemStory, igAppConfigured } from "./instagram-publish";
import { deliverCampaign, recordSentCampaign, createScheduledCampaign, listCampaigns, cancelScheduledCampaign } from "./store-campaigns-db";
import { getRefundPolicy, setRefundPolicy } from "./store-policy-db";
import { syncPayoutSchedule } from "./payout-schedule";
import { getShippingSettings, setShippingSettings } from "./store-shipping-db";
import { getStoreBrief, saveStoreBrief } from "./store-brief-db";
import { getStoreProfile, updateStoreProfile } from "./store-profile-db";
import { getPromoCode, setPromoCode } from "./store-marketing-db";
import { getMinMarkupBps, setMinMarkupBps } from "./store-pricing-db";
import { getSellerPayments } from "./seller-payments-db";
import { getStorePlan, isStorePro } from "./store-plans-db";
import { getConnection } from "./store-connections-db";
import { getStoreWhitespace, getTopColors } from "./data-layer/market-metrics-db";
import { getSourceNow } from "./data-layer/source-now-db";
import { getStoreDemandIntelligence } from "./demand-db";
import { getBrandHeatIndex } from "./brand-heat-db";

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

// Fonts the email renderer can load (serif display faces for headings, sans for body).
const EMAIL_HEADING_FONTS = ["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces", "EB Garamond", "Lora", "DM Serif Display", "Libre Baskerville", "Prata", "Spectral"];
const EMAIL_BODY_FONTS = ["Inter", "Work Sans", "DM Sans", "Nunito Sans", "Mulish", "Karla", "Lato"];

const TOOLS = [
 { name: "get_storefront", description: "Read the store's current storefront: design (template, colors, fonts), handle, tagline, hero image, and whether it's live.", input_schema: { type: "object", properties: {} } },
 { name: "update_storefront_design", description: "Change the storefront look. Provide any of: a starter template id, colors (hex like #1a1a1a), fonts. Confirm with the seller before calling this.", input_schema: { type: "object", properties: { template: { type: "string", enum: templateIds }, colors: { type: "object", properties: { bg: { type: "string" }, text: { type: "string" }, accent: { type: "string" } } }, fonts: { type: "object", properties: { heading: { type: "string", enum: HEADING_FONTS }, body: { type: "string", enum: BODY_FONTS } } } } } },
 { name: "style_storefront", description: "Apply raw custom CSS to the block-based storefront, layered over the theme site-wide — for ANY styling or layout change the section fields can't do: repositioning, alignment, spacing, sizing, per-element colors, borders, hover effects, etc. This is how you fulfill open-ended design requests. Pass the FULL CSS to set (it REPLACES the previous custom CSS — include everything you want kept); pass empty css to clear. Target these stable classes the storefront outputs: each section is `.vya-sec` + `.vya-<type>` (`.vya-hero`, `.vya-featured`, `.vya-text`, `.vya-newsletter`, `.vya-announcement`, `.vya-image`, `.vya-gallery`, `.vya-video`) + `.vya-b-<id>` to target ONE section by id (from list_sections). Inside a section: `.vya-heading` (heading), `.vya-sub` (subtext), `.vya-body` (text body), `.vya-cta` (button), `.vya-img` (image), and `.vya-hero-inner` (the hero's content box — change its flex to move content). Example — move the hero heading to the bottom-left: `.vya-hero .vya-hero-inner{align-items:flex-start;justify-content:flex-end;text-align:left}`. State the change and confirm before calling.", input_schema: { type: "object", properties: { css: { type: "string" } }, required: ["css"] } },
 { name: "write_storefront_code", description: "Write real JavaScript that runs on every page of the seller's storefront — THE tool for anything the sections, styles and settings can't express. A cursor that trails glitter only while moving, a scroll animation, a size calculator, a sticky bar, a countdown in the header, a confetti burst on add-to-cart: write it and it runs. Plain browser JS on the live DOM, with the store's own markup to work with (sections are .vya-sec + .vya-<type>, buttons .vya-cta, images .vya-img). Pass the FULL script — it REPLACES whatever was there, so include everything you want kept; pass an empty string to clear it. This runs ONLY on the store's own domain, never on VYA's copy, which is what makes it safe — so tell the seller to look at the URL you get back from get_storefront, not a vyaplatform.com link. Write complete working code, no placeholders, and guard for elements that may not exist on every page. Respect prefers-reduced-motion for anything that animates. State in one line what it will do, and confirm before calling.", input_schema: { type: "object", properties: { js: { type: "string" } }, required: ["js"] } },
 { name: "set_site_effects", description: "Turn on a pointer effect across the whole storefront — the answer to 'can my cursor leave glitter', 'add sparkles', 'make the cursor trail'. cursor: 'glitter' (specks that fall and fade), 'sparkle' (four-point stars that twinkle out), 'trail' (a dot that chases the pointer), 'ring' (a quiet circle), or 'none' to switch it off. Optional colour as a #hex — leave it out to use the store's accent. These are one-line presets, drawn by VYA's own code. They are NOT the limit of what's possible: for anything they don't cover — sparkles only while the pointer moves, a different shape, a burst on click, any behaviour at all — use write_storefront_code and write it properly. Never tell a seller an effect can't behave the way they asked because these presets don't do it. Say what you'll turn on and confirm first.", input_schema: { type: "object", properties: { cursor: { type: "string", enum: ["none", "glitter", "sparkle", "trail", "ring"] }, color: { type: "string", description: "hex like #FF66CC; omit to follow the store's accent" } }, required: ["cursor"] } },
 { name: "list_photos", description: "List the photo URLs in the store's media library.", input_schema: { type: "object", properties: {} } },
 { name: "set_hero_photo", description: "Set the storefront hero banner image to a URL (usually from the library). Confirm first.", input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
 { name: "list_inventory", description: "List the store's listings: id, title, price, status, and whether it has a description.", input_schema: { type: "object", properties: { activeOnly: { type: "boolean" } } } },
 { name: "write_description", description: "Write a polished, SEO-friendly description for a vintage item. Returns text only — does not save it.", input_schema: { type: "object", properties: { title: { type: "string" }, details: { type: "string" } }, required: ["title"] } },
 { name: "update_listing", description: "Update a listing's fields by id — any of title, price (USD), description, brand, size, category, condition, and status ('draft' or 'active'). Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, priceUsd: { type: "number" }, description: { type: "string" }, brand: { type: "string" }, size: { type: "string" }, category: { type: "string" }, condition: { type: "string" }, status: { type: "string", enum: ["draft", "active"] } }, required: ["id"] } },
 { name: "list_sections", description: "List the home page's sections in order (id, type, props). The storefront home page is built from these stackable sections.", input_schema: { type: "object", properties: {} } },
 { name: "add_section", description: "Add a section to the home page. type is one of: announcement (props: text), hero (props: heading, subtext, cta, image), featured (props: heading — a grid of the store's products), split (props: heading, body, cta, image, imageSide 'left'/'right' — a photo beside text, the editorial workhorse), text (props: heading, body), image (props: image, caption), gallery (props: images — newline-separated URLs), marquee (props: items — the designers/brands you carry, one per line; scrolls across), statement (props: quote, attribution — one big statement, pair with style.bg 'dark' or 'accent'), spotlight (props: heading, subtext, price, cta, image — feature one hero piece), video (props: url — a YouTube, Vimeo, or .mp4 link; optional caption), newsletter (props: heading, subtext). Optionally set style.bg to 'accent', 'dark', or a #hex to give the section a colored background. position is the 0-based index to insert at (defaults to the end). style is optional visual overrides: bg ('accent'/'dark'/#hex), textColor (#hex), align ('left'/'center'/'right'), headingSize ('sm'/'md'/'lg'/'xl'), space ('sm'/'md'/'lg'/'xl'). Confirm first.", input_schema: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, position: { type: "number" }, style: { type: "object", properties: { bg: { type: "string" }, textColor: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] }, headingSize: { type: "string", enum: ["sm", "md", "lg", "xl"] }, space: { type: "string", enum: ["sm", "md", "lg", "xl"] } } } }, required: ["type"] } },
 { name: "update_section", description: "Update a section by id — merge new props and/or visual style. style fields (all optional, all merge): bg ('accent', 'dark', a #hex, or empty to reset), textColor (#hex), align ('left'/'center'/'right'), headingSize ('sm'/'md'/'lg'/'xl'), space (extra breathing room: 'sm'/'md'/'lg'/'xl'). Use these for requests like 'make the heading bigger', 'left-align this', 'more space around it', 'white text'. To revise a custom (HTML) section, pass props.html with the full new markup. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" }, textColor: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] }, headingSize: { type: "string", enum: ["sm", "md", "lg", "xl"] }, space: { type: "string", enum: ["sm", "md", "lg", "xl"] } } } }, required: ["id"] } },
 { name: "remove_section", description: "Remove a section by id. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
 { name: "move_section", description: "Move a section up or down by id. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } }, required: ["id", "direction"] } },
 { name: "list_pages", description: "List the storefront's pages — the home page plus any extra pages (About, FAQ, etc.) with slug, title, and section count.", input_schema: { type: "object", properties: {} } },
 { name: "create_page", description: "Create a new storefront page (e.g. About, FAQ, Shipping & Returns). Provide a title and optionally initial blocks (same types/props/style as set_layout). It's linked in the nav automatically. Write real copy. Confirm first.", input_schema: { type: "object", properties: { title: { type: "string" }, blocks: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } } }, required: ["title"] } },
 { name: "set_page_layout", description: "Replace all sections on a page (by slug) with a new set of blocks. Use slug 'shop' to edit the SHOP page's intro content — sections (heading, text, image, gallery, etc.) shown ABOVE the store's auto product grid; the products list themselves below automatically, so don't add a products/featured section there. For any other slug it's an extra page (About, FAQ…). Confirm first.", input_schema: { type: "object", properties: { slug: { type: "string" }, blocks: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } } }, required: ["slug", "blocks"] } },
 { name: "delete_page", description: "Delete an extra page by slug. Confirm first.", input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] } },
 { name: "get_email_design", description: "Read the store's current marketing-email design — the look EVERY campaign and automation email sends with: colours (accent/background/text), heading & body fonts, logo, button label + shape, footer note, alignment, and whether the top colour bar shows. Also returns the storefront brand it can snap back to.", input_schema: { type: "object", properties: {} } },
 { name: "get_business_snapshot", description: "Read a live snapshot of the store's performance so you can answer questions about sales, revenue, traffic, inventory, and top products/brands. Returns revenue, orders, AOV, views, favourites, inventory counts, top brands/categories, recent sales, customers/buyers — for the last N days (default 30). Use this for any 'how am I doing', 'what's my revenue', 'what's selling', 'how much traffic' question.", input_schema: { type: "object", properties: { days: { type: "number", description: "look-back window in days (default 30; omit for 30)" } } } },
 { name: "get_orders", description: "List the store's recent orders (sales): order number, item, amount, status (paid/shipped/delivered/refunded), buyer email, and date. Use for order questions — 'what did I sell', 'any orders to ship', 'my last order', order lookups.", input_schema: { type: "object", properties: { limit: { type: "number", description: "how many recent orders (default 20, max 50)" } } } },
 { name: "get_customers", description: "List the store's customers with order count, total spent, subscription status, location, last-order date, and their tags. Use for 'who are my top customers', 'how many subscribers', VIP/repeat-buyer analysis. Pass tag to list only one segment (e.g. everyone tagged 'vip').", input_schema: { type: "object", properties: { limit: { type: "number", description: "how many customers (default 30, max 100), sorted by spend" }, tag: { type: "string", description: "filter to only customers carrying this tag/segment" } } } },
 { name: "revert_last_change", description: "Undo the LAST change you made — to the storefront design OR the email design. Pass target 'storefront' or 'email'. Use it the moment a seller says 'undo', 'revert', 'go back', or 'I don't like that'. Do it immediately, no confirmation needed. One level of undo (calling it again redoes the change).", input_schema: { type: "object", properties: { target: { type: "string", enum: ["storefront", "email"] } }, required: ["target"] } },
 { name: "update_email_design", description: "Change how the store's marketing emails look (applies to every campaign + automation at once). Pass ONLY the fields to change — everything else is kept. This is how you redesign the email or translate an inspiration email a seller likes into their own brand: pull the palette, type and mood from what they describe or upload, then set it here. Set reset:true to discard the custom design and go back to matching their storefront. State what you'll change in one line and confirm before calling.", input_schema: { type: "object", properties: { accent: { type: "string", description: "hex like #1a1a1a — button, links & top bar" }, background: { type: "string", description: "hex — the email card background (try a soft cream/off-white or a dark tone)" }, text: { type: "string", description: "hex — body text colour" }, headingFont: { type: "string", enum: EMAIL_HEADING_FONTS }, bodyFont: { type: "string", enum: EMAIL_BODY_FONTS }, logo: { type: "string", description: "logo image URL, or empty string to show the store name as a wordmark instead" }, buttonLabel: { type: "string", description: "CTA button text, e.g. 'Shop the drop'" }, footerText: { type: "string", description: "the small footer note; use {store} for the store name" }, buttonStyle: { type: "string", enum: ["rounded", "pill", "square"] }, headerAlign: { type: "string", enum: ["center", "left"] }, showAccentBar: { type: "boolean", description: "the thin colour bar across the very top" }, layout: { type: "string", enum: ["classic", "minimal", "editorial", "bold"], description: "the overall STRUCTURE, not just colours — this is how you REDESIGN the email, not just recolor it. classic = card on soft grey, rounded, accent bar; minimal = flat full-bleed, no card, airy, a hairline under the header; editorial = thin-bordered card + outlined button, a magazine frame; bold = the whole card is the accent colour with reversed light text, high-impact. Combine with colours/fonts/button for a total redesign." }, reset: { type: "boolean", description: "discard the custom design and revert to the storefront brand" } } } },
 { name: "list_captured_pages", description: "List the pages of the seller's CAPTURED site (their real existing site, hosted on VYA) by path. Only relevant if they brought their own site over rather than building from sections.", input_schema: { type: "object", properties: {} } },
 { name: "edit_captured_page", description: "Edit copy on one page of the captured site: replace every occurrence of `find` with `replace` in that page's HTML (path from list_captured_pages). Use for wording changes, fixing a typo, updating a banner/announcement. `find` must be exact visible text. Confirm first.", input_schema: { type: "object", properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["path", "find", "replace"] } },
 { name: "style_captured_site", description: "Apply site-wide custom CSS to the captured site — injected over the original styles on every page, for color/font/spacing/button tweaks. Pass the full CSS to set (replaces any previous custom CSS); pass empty css to clear. Confirm first.", input_schema: { type: "object", properties: { css: { type: "string" } }, required: ["css"] } },
 { name: "set_layout", description: "Replace the ENTIRE home page with a full set of sections at once — use this to build or rebuild a whole storefront in one go. Provide blocks as an ordered array of { type, props, style? }. Types + props: announcement {text}; hero {heading, subtext, cta, image}; featured {heading}; collections {heading, items: one category per line as 'Label | image URL' (image optional) — the shop-by-category tile grid every good store has}; testimonials {heading, items: one review per line as 'Quote | Name' — social proof}; countdown {heading, subtext, date: an ISO/datetime like '2026-09-01T18:00', cta, ctaHref} — a live drop countdown; blog {heading, items: one post per line as 'Title | excerpt | image URL | link'} — a journal/lookbook row; split {heading, body, cta, image, imageSide 'left'/'right'}; columns {heading, cols '2'/'3'/'4', items: one column per line as 'Heading | Text | image URL | button label | button link'} — flexible side-by-side content (values, how-it-works, feature rows); text {heading, body}; image {image, caption}; gallery {images: newline-separated URLs}; marquee {items: designers/brands one per line}; statement {quote, attribution}; spotlight {heading, subtext, price, cta, image}; video {url: a YouTube/Vimeo/.mp4 link, caption}; newsletter {heading, subtext}; contact {heading, subtext, email} — a real name/email/message contact form; faq {heading, q0, a0, q1, a1, …} — a real click-to-expand accordion (use this for FAQs / any Q&A list, NOT custom html); custom {html: raw HTML for anything the other types can't express}. Optionally give a section style.bg ('accent', 'dark', or a #hex) for contrast — e.g. a dark about section. Write real, tailored copy for this seller — don't leave placeholders. Confirm before calling.", input_schema: { type: "object", properties: { blocks: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: BLOCK_TYPE_IDS }, props: { type: "object" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["type"] } } }, required: ["blocks"] } },
 { name: "add_html_section", description: "Build ANY section the fixed types can't express — this is how you say YES to literally any component request instead of declining. Two modes:\n• STATIC (html only, optionally css): rendered inline in the page, indexable, inherits the store's styles. Best for tabs, comparison/size tables, pricing grids, timelines, testimonials, bespoke layouts. (For an FAQ or any expandable accordion, use the built-in 'faq' section type instead — not this.) Any expand/collapse UI here MUST use native <details><summary> (works on click, no JS). Inline html is limited to safe markup (no scripts/iframes/forms).\n• INTERACTIVE (also pass js): the html+css+js run together inside a secure SANDBOXED iframe, fully isolated from the store (the code can't read cookies, the DOM, or any customer data). Use this for anything dynamic that CSS can't do: countdown timers, size/price calculators, quizzes, product filters, canvas/JS animations, live previews, mortgage-style widgets — anything. You can load libraries and use fetch inside it. The store's colors/fonts are exposed as CSS vars (--bg, --text, --accent, --heading, --body).\nWrite complete, real code (no placeholders); give elements class names so you can also style them with style_storefront (static mode) — for interactive mode put styling in the css field. page: 'home' (default), 'shop' (intro above the product grid), or an extra page's slug. position: 0-based insert index (default end). Confirm first.", input_schema: { type: "object", properties: { html: { type: "string" }, css: { type: "string" }, js: { type: "string" }, page: { type: "string" }, position: { type: "number" }, style: { type: "object", properties: { bg: { type: "string" } } } }, required: ["html"] } },
 { name: "remember_fact", description: "Save a durable fact about this seller or store to long-term memory — a preference, brand-voice note, a decision, a recurring detail — anything worth recalling in future conversations (e.g. 'Prefers minimal, editorial storefronts', 'Brand voice is playful and irreverent', 'Ships only within the US', 'Focuses on 90s designer denim'). Do this whenever the seller tells you something about themselves or their store that should persist. One clear, self-contained fact per call. No need to confirm — just remember and mention it briefly.", input_schema: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] } },
 { name: "forget_fact", description: "Remove saved memories matching a phrase (case-insensitive substring). Use when the seller says something changed or asks you to forget it.", input_schema: { type: "object", properties: { match: { type: "string" } }, required: ["match"] } },
 { name: "list_memory", description: "List everything currently in long-term memory for this store.", input_schema: { type: "object", properties: {} } },
 // ══════════ INVENTORY — the live product catalogue (create / publish / schedule / lifecycle) ══════════
 { name: "create_listing", description: "Create a NEW product listing. title required; optionally priceUsd, description, brand, size, category, condition, era, material, images (array of URLs). Created as a DRAFT by default — set publish:true to go live now, or scheduleAt (ISO date/time ≥1 min in the future) to auto-publish it then (a scheduled drop). Confirm first.", input_schema: { type: "object", properties: { title: { type: "string" }, priceUsd: { type: "number" }, description: { type: "string" }, brand: { type: "string" }, size: { type: "string" }, category: { type: "string" }, condition: { type: "string" }, era: { type: "string" }, material: { type: "string" }, images: { type: "array", items: { type: "string" } }, publish: { type: "boolean" }, scheduleAt: { type: "string" } }, required: ["title"] } },
 { name: "manage_listing", description: "Change a listing's lifecycle by id (from list_inventory). action: 'publish' (draft→live), 'unpublish' (live→draft), 'mark_sold', 'relist' (undo a sale), or 'archive' (remove/delist). For bulk, pass ids (array) with action 'publish' or 'archive'. Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["publish", "unpublish", "mark_sold", "relist", "archive"] }, id: { type: "string" }, ids: { type: "array", items: { type: "string" } } }, required: ["action"] } },
 // ══════════ MERCHANDISING — collections & discounts ══════════
 { name: "list_collections", description: "List the store's product collections (id, title, item count).", input_schema: { type: "object", properties: {} } },
 { name: "manage_collection", description: "Organize products into collections. action: 'create' (a new collection named title), 'assign' (add item itemId to the collection title, creating it if needed), or 'unassign' (remove itemId from title). Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["create", "assign", "unassign"] }, title: { type: "string" }, itemId: { type: "string" } }, required: ["action", "title"] } },
 { name: "list_discounts", description: "List the store's discount codes — type, value, active/auto-apply state, redemptions.", input_schema: { type: "object", properties: {} } },
 { name: "manage_discount", description: "Manage discount codes. action: 'create' (code + value, with kind 'percent' or 'fixed' where fixed value is in USD, optional label), 'enable'/'disable' (by id), 'autoapply_on'/'autoapply_off' (by id), 'delete' (by id). Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["create", "enable", "disable", "autoapply_on", "autoapply_off", "delete"] }, code: { type: "string" }, label: { type: "string" }, kind: { type: "string", enum: ["percent", "fixed"] }, value: { type: "number" }, id: { type: "number" } }, required: ["action"] } },
 // ══════════ ORDERS ══════════
 { name: "update_order", description: "Update an order by id (the id from get_orders). action 'mark_shipped' (marks shipped + notifies the buyer) or 'set_status' with status 'paid'/'shipped'/'delivered'. Refunds and buying labels move money / are irreversible — you have NO tool for those; for those, walk the seller to the order in the Orders tab. Confirm first.", input_schema: { type: "object", properties: { id: { type: "string" }, action: { type: "string", enum: ["mark_shipped", "set_status"] }, status: { type: "string", enum: ["paid", "shipped", "delivered"] } }, required: ["id", "action"] } },
 // ══════════ INBOX & OFFERS ══════════
 { name: "get_inbox", description: "Read buyer messages. No id → lists threads (id, buyer, last message, unread). With conversationId → the full thread. Use for 'any new messages', reading a buyer's question.", input_schema: { type: "object", properties: { conversationId: { type: "number" } } } },
 { name: "reply_message", description: "Post a reply in a buyer conversation thread (conversationId from get_inbox), written as the store. Draft it, show the seller, and confirm before sending.", input_schema: { type: "object", properties: { conversationId: { type: "number" }, body: { type: "string" } }, required: ["conversationId", "body"] } },
 { name: "get_offers", description: "List price offers buyers made (item, list price, current offer, status, whose turn). Use for 'any offers'.", input_schema: { type: "object", properties: {} } },
 { name: "respond_offer", description: "Respond to a buyer's offer by id (from get_offers). action 'accept', 'decline', or 'counter' with counterUsd (your counter price in USD). Confirm the number first.", input_schema: { type: "object", properties: { id: { type: "number" }, action: { type: "string", enum: ["accept", "decline", "counter"] }, counterUsd: { type: "number" } }, required: ["id", "action"] } },
 // ══════════ MARKETING — automations & campaigns ══════════
 { name: "get_automations", description: "List email automations — built-in flows (welcome, abandoned cart…) with on/off state, plus custom ones. Use to see or explain what's automated.", input_schema: { type: "object", properties: {} } },
 { name: "manage_automation", description: "Manage automations. action: 'toggle_builtin' (key + enabled), 'add_custom' (name, trigger, subject, body), 'toggle_custom' (id + enabled), 'remove_custom' (id). Check get_automations first for keys/triggers. Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["toggle_builtin", "add_custom", "toggle_custom", "remove_custom"] }, key: { type: "string" }, id: { type: "number" }, enabled: { type: "boolean" }, name: { type: "string" }, trigger: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["action"] } },
 { name: "send_campaign", description: "Send OR schedule a marketing email campaign in the store's saved email design. Provide subject and body (markdown). Pass segment to target only subscribers with that tag (e.g. 'vip'); omit for all subscribers. Pass scheduleAt (ISO time ≥1 min ahead) to QUEUE it to auto-send later instead of now — no test needed for a schedule, but show the seller the plan and confirm. For an immediate send: ALWAYS default to test:true first (goes only to the store's own inbox to preview); only send for real (test:false) after they've seen a test AND explicitly confirm. A real send is irreversible and reaches real customers.", input_schema: { type: "object", properties: { subject: { type: "string" }, body: { type: "string" }, link: { type: "string" }, segment: { type: "string" }, scheduleAt: { type: "string" }, test: { type: "boolean" } }, required: ["subject", "body"] } },
 { name: "list_campaigns", description: "List the store's email campaigns — upcoming scheduled ones and past sent ones (subject, status, when, recipient count). Use for 'what have I sent', 'anything scheduled'.", input_schema: { type: "object", properties: {} } },
 { name: "cancel_campaign", description: "Cancel an upcoming SCHEDULED campaign by id (from list_campaigns) before it sends. Confirm first.", input_schema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
 // ══════════ CROSS-LISTING (other marketplaces) ══════════
 { name: "get_crosslisting", description: "Show the cross-listing board — which marketplaces are connected and where items are listed.", input_schema: { type: "object", properties: {} } },
 { name: "manage_crosslisting", description: "Manage other-marketplace listing. action: 'connect' (platform + handle, optional autoList), 'disconnect' (platform), 'list_item' (itemId — push to connected API channels), 'delist' (itemId — remove everywhere, e.g. after it sold). Channels needing OAuth login (eBay/Etsy) are connected in the Cross-listing tab — walk the seller there for those. Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["connect", "disconnect", "list_item", "delist"] }, platform: { type: "string" }, handle: { type: "string" }, autoList: { type: "boolean" }, itemId: { type: "string" } }, required: ["action"] } },
 // ══════════ CONSIGNMENT ══════════
 { name: "get_consignment", description: "Read the consignment setup — settings, default split, split rules, consignors and their balances.", input_schema: { type: "object", properties: {} } },
 { name: "manage_consignment", description: "Manage consignment. action: 'add_consignor' (name, optional email, phone, splitPct = consignor's %), 'update_consignor' (id + any of name/email/phone/splitPct), 'remove_consignor' (id), 'set_default_split' (splitPct), or 'update_settings' (pass a settings object — holdDays, payoutCycle, etc.). Recording a payout moves money — no tool for that; walk the seller to the Consignment tab. Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["add_consignor", "update_consignor", "remove_consignor", "set_default_split", "update_settings"] }, id: { type: "number" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, splitPct: { type: "number" }, settings: { type: "object" } }, required: ["action"] } },
 // ══════════ INTEGRATIONS ══════════
 { name: "get_integrations", description: "Show connected integrations — Klaviyo (email), Instagram auto-posting, and any linked sales platform.", input_schema: { type: "object", properties: {} } },
 { name: "manage_integration", description: "Manage integrations. action: 'klaviyo_sync' (push customers to Klaviyo), 'klaviyo_disconnect', 'instagram_toggle' (enabled — auto-post new listings to IG Story), 'instagram_post_now' (itemId), 'instagram_disconnect'. CONNECTING needs a login/API key entered by the seller in the Apps tab — walk them there, never ask for keys. Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["klaviyo_sync", "klaviyo_disconnect", "instagram_toggle", "instagram_post_now", "instagram_disconnect"] }, enabled: { type: "boolean" }, itemId: { type: "string" } }, required: ["action"] } },
 // ══════════ CUSTOMERS ══════════
 { name: "get_customer", description: "Look up ONE customer by email — orders, spend, subscription, location, and their tags/note. Use for 'has this person bought before', 'what's this customer's history'.", input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
 { name: "list_segments", description: "List the customer segments (tags) in use for this store and how many contacts each holds. Use for 'what segments do I have', before tagging or targeting.", input_schema: { type: "object", properties: {} } },
 { name: "manage_customer", description: "action: 'add' (email + optional name), 'subscribe'/'unsubscribe' (toggle marketing opt-in), 'tag'/'untag' (email + tag — a segment label like 'vip' or 'wholesale'), or 'note' (email + note — set/replace a private note, empty note clears it). Confirm first.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["add", "subscribe", "unsubscribe", "tag", "untag", "note"] }, email: { type: "string" }, name: { type: "string" }, tag: { type: "string" }, note: { type: "string" } }, required: ["action", "email"] } },
 // ══════════ STORE SETTINGS, POLICIES, SHIPPING, VOICE ══════════
 { name: "get_store_settings", description: "Read the store's operational settings in one place: store profile (display name, legal name, location, bio), refund/return policy, shipping, the brief (pricing target, brand voice, about), promo code, minimum markup, messaging/offers settings, plan/tier, and payout-setup status.", input_schema: { type: "object", properties: {} } },
 { name: "update_store_settings", description: "Update store settings — pass only the group(s) to change:\n• profile: { name, legalName, location, bio } — the store's display NAME (this is how you rename the store; it flows to their emails too), its LEGAL name (for receipts/policies), location, and bio\n• policy: { refundsEnabled, returnWindowDays, restockingFeePct, returnShippingPaidBy 'buyer'/'store', policyText }\n• shipping: { mode 'buyer_pays'/'store_pays'/'free_over', freeThresholdUsd }\n• brief: { about, voice, pricing } — text that guides AI copy\n• storefront: { tagline, about } — public storefront text\n• messaging: { messagingEnabled, offersEnabled, offersBinding, minOfferPct }\n• promoCode: a code string (empty to clear)\n• minMarkupPct: minimum markup %\nConfirm the specific change first.", input_schema: { type: "object", properties: { profile: { type: "object" }, policy: { type: "object" }, shipping: { type: "object" }, brief: { type: "object" }, storefront: { type: "object" }, messaging: { type: "object" }, promoCode: { type: "string" }, minMarkupPct: { type: "number" } } } },
 // ══════════ SOURCING & MARKET INTELLIGENCE ══════════
 { name: "get_market_intelligence", description: "Pull VYA market intelligence for 'what should I source', 'what's in demand', 'what's trending', 'where's the whitespace'. action: 'whitespace' (gaps between market demand and the store's own supply), 'source_now' (current sourcing board of hot segments — Pro), 'colors' (trending colours), 'trends' (brand heat index), 'demand' (this store's demand intelligence — unmet searches + brand/category demand). Output is privacy-safe market aggregate — never another store's individual numbers. Optional window '7d'/'30d'.", input_schema: { type: "object", properties: { action: { type: "string", enum: ["whitespace", "source_now", "colors", "trends", "demand"] }, window: { type: "string", enum: ["7d", "30d"] } }, required: ["action"] } },
 { name: "get_account_status", description: "Read account status: subscription plan & tier, payout setup (Stripe connected, charges/payouts enabled), connected sales platform. Read-only — changing plan or connecting payouts is done by the seller in Billing/Payments; walk them there.", input_schema: { type: "object", properties: {} } },
 // ══════════ OPERATING COSTS (the P&L's second half) ══════════
 { name: "log_expense", description: "Record a business cost that ISN'T the purchase price of a piece — packaging, mailers, dust bags, flyers, studio rent, ads, market stall fees, dry cleaning, repairs. This is how a seller adds a cost just by saying it: \"spent 84 on poly mailers\" or \"paid 150 for the flea stall on Saturday\". Pick the closest category. Amount is in DOLLARS. Only pass occurredOn for a past date the seller names (YYYY-MM-DD); leave it off for today. Log it straight away — don't ask them to confirm an amount they just told you — then say what you recorded and the new total. NEVER use this for what a piece of inventory cost; that belongs on the listing itself.", input_schema: { type: "object", properties: { amountUsd: { type: "number", description: "Cost in dollars, e.g. 84 or 12.50" }, label: { type: "string", description: "What it was, in the seller's own words — \"poly mailers + tissue\"" }, category: { type: "string", enum: ["packaging", "shipping", "marketing", "studio", "fees", "repairs", "sourcing", "other"] }, occurredOn: { type: "string", description: "YYYY-MM-DD, only for a past date the seller names" } }, required: ["amountUsd", "label", "category"] } },
 { name: "list_expenses", description: "Read the store's recorded operating costs for a period, with the total and a per-category breakdown. Use for 'what have I spent', 'how much on packaging this quarter', or to read a total back after logging something. days defaults to 90.", input_schema: { type: "object", properties: { days: { type: "number", description: "How many days back to look. Default 90." } } } },
];

// The live commerce model is scoped by sellerId (a UUID), not the store slug — resolve it once.
async function sellerIdOf(slug: string): Promise<string | null> {
 const s = await getSellerBySlug(slug);
 return s?.id ?? null;
}

async function loadTheme(slug: string): Promise<StorefrontTheme> {
 const sf = (await getStorefrontBySlug(slug)) ?? (await upsertStorefront(slug, { handle: slug, enabled: false, tagline: "", accentColor: "#5D0F17", heroImage: "", about: "" }));
 return { ...(sf.theme ?? {}) };
}

// Exported for read-only smoke tests / internal tooling. The route still resolves and scopes `slug`.
export async function runTool(slug: string, name: string, input: any): Promise<any> {
 switch (name) {
 case "log_expense": {
 const dollars = Number(input.amountUsd);
 if (!Number.isFinite(dollars) || dollars <= 0) return { ok: false, error: "I need an amount above zero to record that." };
 const category = isExpenseCategory(input.category) ? input.category : "other";
 const saved = await addExpense(slug, {
  amountCents: Math.round(dollars * 100),
  label: String(input.label ?? "").trim(),
  category,
  occurredOn: typeof input.occurredOn === "string" ? input.occurredOn : null,
  source: "assistant",
 });
 // Hand back the running total so the reply can close the loop without a second call.
 const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
 const totals = await expenseTotals(slug, since, new Date(Date.now() + 86_400_000).toISOString()).catch(() => null);
 return {
  ok: true,
  logged: { ...saved, categoryLabel: categoryLabel(saved.category), amountUsd: saved.amountCents / 100 },
  last90DaysTotalUsd: totals ? totals.totalCents / 100 : null,
 };
 }
 case "list_expenses": {
 const days = Math.min(730, Math.max(1, Number(input.days) || 90));
 const start = new Date(Date.now() - days * 86_400_000).toISOString();
 const end = new Date(Date.now() + 86_400_000).toISOString();
 const [totals, recent] = await Promise.all([
  expenseTotals(slug, start, end),
  listExpenses(slug, start, end, 25),
 ]);
 return {
  days,
  totalUsd: totals.totalCents / 100,
  byCategory: totals.byCategory.filter((c) => c.amountCents > 0).map((c) => ({ category: c.label, usd: c.amountCents / 100, entries: c.count })),
  recent: recent.map((e) => ({ date: e.occurredOn, what: e.label, category: categoryLabel(e.category), usd: e.amountCents / 100 })),
 };
 }
 case "get_storefront": {
 const sf = await getStorefrontBySlug(slug);
 // The store's REAL address, so a link the assistant gives a seller is one that exists. Without it
 // it built URLs out of the handle and guessed, handing out via-admin.vyasites.com/s/via-admin —
 // the store's own origin with VYA's internal path stuck on the end.
 return { template: sf?.theme?.template ?? null, colors: sf?.theme?.colors ?? null, fonts: sf?.theme?.fonts ?? null, customCss: sf?.theme?.customCss ?? null, handle: sf?.handle ?? null, tagline: sf?.tagline ?? null, heroImage: sf?.heroImage ?? null, live: !!sf?.enabled, url: storefrontUrl(sf?.customDomain, slug, sf?.handle), templatesAvailable: templateIds };
 }
 case "style_storefront": {
 const css = String(input.css ?? "").slice(0, 20000);
 const theme = await loadTheme(slug);
 theme.customCss = css;
 await setStorefrontTheme(slug, theme);
 return { ok: true, applied: css.trim() ? `${css.length} chars of CSS` : "cleared" };
 }
 case "write_storefront_code": {
 const theme = await loadTheme(slug);
 theme.customJs = sanitizeCode(input.js);
 await setStorefrontTheme(slug, theme);
 const sfc = await getStorefrontBySlug(slug).catch(() => null);
 const url = storefrontUrl(sfc?.customDomain, slug, sfc?.handle);
 return theme.customJs.trim()
  ? { ok: true, chars: theme.customJs.length, seeItAt: url,
      note: "Live on every page of the storefront. It runs on the store's own domain only — VYA's copy of the same shop doesn't carry it, so check it at the URL above." }
  : { ok: true, cleared: true, seeItAt: url };
 }
 case "set_site_effects": {
 const theme = await loadTheme(slug);
 theme.effects = resolveEffects({ cursor: input.cursor as SiteEffects["cursor"], cursorColor: typeof input.color === "string" ? input.color : null });
 await setStorefrontTheme(slug, theme);
 const on = theme.effects.cursor !== "none";
 const sfx = await getStorefrontBySlug(slug).catch(() => null);
 return { ok: true, cursor: theme.effects.cursor, color: theme.effects.cursorColor ?? "the store accent",
  seeItAt: storefrontUrl(sfx?.customDomain, slug, sfx?.handle),
  note: on
   ? "Live on every page. It's skipped automatically for anyone who has reduced motion switched on, and on touch screens where there's no pointer to follow."
   : "Switched off." };
 }
 case "update_storefront_design": {
 const sf = (await getStorefrontBySlug(slug)) ?? (await upsertStorefront(slug, { handle: slug, enabled: false, tagline: "", accentColor: "#5D0F17", heroImage: "", about: "" }));
 const theme: StorefrontTheme = { ...(sf.theme ?? {}) };
 // A template's LOOK — palette, type, corners, header, catalogue density. Sections are left alone
 // here on purpose: this tool runs mid-conversation on a store the seller has already built, and
 // "make it feel more like Vitrine" must not silently delete the page they were editing. Laying out
 // a template's sections is the studio's template picker, which asks first.
 if (input.template) {
 const t = getTemplate(String(input.template));
 if (t) {
  theme.template = t.id;
  theme.colors = { ...t.colors };
  theme.fonts = { ...t.fonts };
  theme.radius = t.radius;
  theme.headerLayout = t.headerLayout;
  theme.shopGrid = { ...t.grid };
  theme.productLayout = t.productLayout;
 }
 }
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
 const sid = await sellerIdOf(slug);
 if (!sid) return { count: 0, items: [] };
 const all = await listSellerItems(sid);
 const items = input.activeOnly ? all.filter((i) => i.status === "active") : all;
 return { count: items.length, items: items.slice(0, 60).map((l) => ({ id: l.id, title: l.title, priceUsd: Math.round((l.priceCents || 0) / 100), status: l.status, brand: l.brand, category: l.category, size: l.size, hasDescription: !!l.description })) };
 }
 case "write_description": {
 const r = await anthropic({ model: MODEL, max_tokens: 400, system: "You write concise, evocative, SEO-aware product descriptions for curated vintage fashion. 2–3 sentences, no hype, no emojis. Note era, material, and how to style it where you can infer it.", messages: [{ role: "user", content: `Write a description for: ${input.title}${input.details ? `\nDetails: ${input.details}` : ""}` }] });
 const text = (r.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
 return { description: text };
 }
 case "update_listing": {
 const sid = await sellerIdOf(slug);
 if (!sid) return { error: "No seller record for this store yet." };
 const it = await getItem(String(input.id));
 if (!it || it.sellerId !== sid) return { error: "No listing with that id on this store." };
 const patch: Record<string, any> = {};
 if (input.title != null) patch.title = String(input.title).slice(0, 200);
 if (input.priceUsd != null) patch.priceCents = Math.max(0, Math.round(Number(input.priceUsd) * 100));
 if (input.description != null) patch.description = String(input.description);
 if (input.brand != null) patch.brand = String(input.brand);
 if (input.size != null) patch.size = String(input.size);
 if (input.category != null) patch.category = String(input.category);
 if (input.condition != null) patch.condition = String(input.condition);
 if (input.status != null && ["draft", "active"].includes(input.status)) patch.status = input.status;
 const updated = await updateItem(String(input.id), patch);
 return updated ? { ok: true, id: updated.id, title: updated.title, priceUsd: Math.round((updated.priceCents || 0) / 100), status: updated.status } : { error: "Update failed." };
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
 // Merge visual overrides (bg, textColor, align, headingSize, space); sanitizeBlocks validates them.
 if (input.style && typeof input.style === "object") b.style = { ...b.style, ...input.style };
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
 case "add_html_section": {
 const html = String(input.html ?? "").trim();
 const js = String(input.js ?? "").trim();
 const css = String(input.css ?? "").trim();
 if (!html && !js) return { error: "Provide the HTML for the section." };
 // Reject output that will silently break once sanitized (stripped JS, fake accordions) — the tool
 // won't let the assistant ship something that looks built but doesn't work; it redirects to the fix.
 const verdict = checkCustomHtml(html, js);
 if (!verdict.ok) return { error: verdict.reason };
 const theme = await loadTheme(slug);
 // Any JS ⇒ interactive/sandboxed; otherwise a static inline section.
 const props: Record<string, string> = js ? { html, css, js, mode: "sandbox" } : { html, ...(css ? { css } : {}) };
 const block = makeBlock("custom", props);
 if (input.style && typeof input.style === "object") block.style = input.style;
 // Target a page: 'home' (default), 'shop' (intro above the grid), or an extra page's slug.
 const page = String(input.page ?? "home");
 const insertInto = (arr: typeof theme.blocks) => {
 const list = sanitizeBlocks(arr ?? []);
 const pos = Number.isInteger(input.position) ? Math.max(0, Math.min(list.length, Number(input.position))) : list.length;
 list.splice(pos, 0, block);
 return sanitizeBlocks(list);
 };
 if (page === "shop") {
 theme.shopBlocks = insertInto(theme.shopBlocks);
 } else if (page === "home") {
 theme.blocks = insertInto(theme.blocks);
 } else {
 const pages = sanitizePages(theme.extraPages ?? []);
 const pg = pages.find((p) => p.slug === page);
 if (!pg) return { error: "No page with that slug. Use 'home', 'shop', or an existing extra page's slug (see list_pages)." };
 pg.blocks = insertInto(pg.blocks);
 theme.extraPages = pages;
 }
 await setStorefrontTheme(slug, theme);
 return { ok: true, added: { id: block.id, page, mode: js ? "sandbox" : "static" }, note: js ? "Interactive section added — it runs sandboxed and is isolated from the store." : "Static section added — style it further with style_storefront if needed." };
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
 case "get_business_snapshot": {
 const days = Number.isFinite(input.days) && input.days > 0 ? Math.min(365, Math.round(input.days)) : 30;
 const a = await getStoreAnalytics(slug, days);
 const usd = (c: number) => Math.round((c || 0) / 100);
 return {
 periodDays: days,
 revenueUsd: usd(a.revenueCents), orders: a.orders, aovUsd: usd(a.aovCents),
 priorPeriod: { revenueUsd: usd(a.prior.revenueCents), orders: a.prior.orders },
 traffic: { sessions: a.sessions, productViews: a.productViews, favorites: a.favorites },
 customers: { total: a.customers, buyers: a.buyers, newBuyers: a.newBuyers, returningBuyers: a.returningBuyers },
 inventory: { active: a.inventory.active, draft: a.inventory.draft, sold: a.inventory.sold, activeValueUsd: usd(a.inventory.activeValueCents) },
 topBrands: a.topBrands.slice(0, 8).map((b) => ({ brand: b.brand, sold: b.sold, revenueUsd: usd(b.revenueCents) })),
 topCategories: a.topCategories.slice(0, 8).map((c) => ({ category: c.category, sold: c.sold, revenueUsd: usd(c.revenueCents) })),
 topSearches: a.topSearches.slice(0, 10),
 recentSales: a.recentSales.slice(0, 8).map((s) => ({ title: s.title, amountUsd: usd(s.amountCents), at: s.at })),
 };
 }
 case "get_orders": {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { orders: [], note: "No seller record found." };
 const limit = Number.isFinite(input.limit) && input.limit > 0 ? Math.min(50, Math.round(input.limit)) : 20;
 const orders = await listSellerOrders(seller.id);
 return {
 count: orders.length,
 orders: orders.slice(0, limit).map((o) => ({ id: o.id, orderNo: `#${1000 + o.orderNo}`, item: o.itemTitle, amountUsd: Math.round((o.amountCents || 0) / 100), status: o.status, buyer: o.buyerEmail, date: (o.paidAt || o.createdAt)?.toISOString?.() ?? null })),
 };
 }
 case "get_customers": {
 const limit = Number.isFinite(input.limit) && input.limit > 0 ? Math.min(100, Math.round(input.limit)) : 30;
 const all = await listCustomerProfiles(slug);
 const tag = input.tag ? String(input.tag).toLowerCase().trim() : null;
 const profiles = tag ? all.filter((p) => p.tags.includes(tag)) : all;
 const sorted = [...profiles].sort((a, b) => b.spentCents - a.spentCents);
 return {
 total: profiles.length,
 ...(tag ? { segment: tag } : {}),
 subscribers: profiles.filter((p) => p.subscribed).length,
 customers: sorted.slice(0, limit).map((p) => ({ name: p.name, email: p.email, orders: p.orders, spentUsd: Math.round((p.spentCents || 0) / 100), subscribed: p.subscribed, location: p.location, lastOrderAt: p.lastOrderAt, tags: p.tags })),
 };
 }
 case "revert_last_change": {
 if (input.target === "email") {
 const r = await revertEmailBrand(slug);
 return r.reverted ? { ok: true, target: "email", note: r.brand ? "Restored the previous email design." : "Email design is back to matching the storefront." } : { ok: true, note: "Nothing to revert on the email design yet." };
 }
 const ok = await revertStorefrontTheme(slug);
 return { ok: true, target: "storefront", note: ok ? "Reverted the last storefront change." : "Nothing to revert on the storefront yet." };
 }
 case "get_email_design": {
 const [brand, storefront] = await Promise.all([getStoreEmailBrand(slug), getStorefrontEmailBrand(slug)]);
 return { brand, storefrontBrand: storefront, headingFonts: EMAIL_HEADING_FONTS, bodyFonts: EMAIL_BODY_FONTS };
 }
 case "update_email_design": {
 if (input.reset) {
 await setEmailBrandOverrides(slug, null);
 return { ok: true, reset: true, brand: await getStorefrontEmailBrand(slug) };
 }
 const current = await getStoreEmailBrand(slug);
 const merged = {
 ...current,
 ...(input.accent != null ? { accent: input.accent } : {}),
 ...(input.background != null ? { bg: input.background } : {}),
 ...(input.text != null ? { text: input.text } : {}),
 ...(input.headingFont != null ? { headingFont: input.headingFont } : {}),
 ...(input.bodyFont != null ? { bodyFont: input.bodyFont } : {}),
 ...(input.buttonLabel != null ? { buttonLabel: input.buttonLabel } : {}),
 ...(input.footerText != null ? { footerText: input.footerText } : {}),
 ...(input.buttonStyle != null ? { buttonStyle: input.buttonStyle } : {}),
 ...(input.headerAlign != null ? { headerAlign: input.headerAlign } : {}),
 ...(input.showAccentBar != null ? { showAccentBar: !!input.showAccentBar } : {}),
 ...(input.layout != null ? { layout: input.layout } : {}),
 ...(input.logo != null ? { logo: /^https?:\/\//i.test(String(input.logo)) ? String(input.logo) : null } : {}),
 };
 const clean = sanitizeBrand(merged);
 if (!clean) return { error: "Couldn’t build that design." };
 await setEmailBrandOverrides(slug, clean);
 return { ok: true, applied: clean };
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
 // ── Inventory (items model) ──
 case "create_listing": {
 const sid = await sellerIdOf(slug);
 if (!sid) return { error: "No seller record for this store yet." };
 const priceCents = Math.max(0, Math.round(Number(input.priceUsd || 0) * 100));
 let publishAt: Date | null = null;
 let status: "draft" | "active" = "draft";
 if (input.scheduleAt) {
 const t = new Date(input.scheduleAt);
 if (isNaN(t.getTime()) || t.getTime() < Date.now() + 60000) return { error: "scheduleAt must be a valid time at least a minute in the future." };
 await ensurePublishAtColumn();
 publishAt = t;
 } else if (input.publish) {
 status = "active";
 }
 const images = Array.isArray(input.images) ? input.images.filter((u: any) => typeof u === "string") : [];
 const item = await createItem({ sellerId: sid, title: String(input.title).slice(0, 200), description: input.description ?? null, priceCents, currency: "USD", images, brand: input.brand ?? null, era: input.era ?? null, material: input.material ?? null, condition: input.condition ?? null, size: input.size ?? null, category: input.category ?? null, status, source: "manual", publishAt } as any);
 return { ok: true, id: item.id, title: item.title, status: item.status, scheduledFor: publishAt ? publishAt.toISOString() : null };
 }
 case "manage_listing": {
 const sid = await sellerIdOf(slug);
 if (!sid) return { error: "No seller record for this store yet." };
 const ids: string[] = Array.isArray(input.ids) ? input.ids.map(String) : [];
 if (ids.length) {
 if (input.action === "publish") return { ok: true, published: await publishItems(sid, ids) };
 if (input.action === "archive") return { ok: true, archived: await removeItems(sid, ids) };
 return { error: "Bulk (ids) supports only 'publish' or 'archive'." };
 }
 const id = String(input.id || "");
 if (!id) return { error: "id (or ids) is required." };
 const it = await getItem(id);
 if (!it || it.sellerId !== sid) return { error: "No listing with that id on this store." };
 let r: any = null;
 switch (input.action) {
 case "publish": r = await publishItem(id); break;
 case "unpublish": r = await updateItem(id, { status: "draft" }); break;
 case "mark_sold": r = await markSold(id); break;
 case "relist": r = await relistItem(id); break;
 case "archive": r = await removeItem(id); break;
 default: return { error: "Unknown action." };
 }
 return r ? { ok: true, id: r.id, status: r.status } : { error: "That action couldn't be applied." };
 }
 // ── Collections ──
 case "list_collections": {
 const sid = await sellerIdOf(slug);
 if (!sid) return { collections: [] };
 const cols = await listCollections(sid);
 return { collections: cols.map((c) => ({ id: c.id, title: c.title, items: c.itemCount })) };
 }
 case "manage_collection": {
 const sid = await sellerIdOf(slug);
 if (!sid) return { error: "No seller record for this store yet." };
 const title = String(input.title || "").trim();
 if (!title) return { error: "A collection title is required." };
 if (input.action === "create") {
 const c = await getOrCreateCollection(sid, title);
 return { ok: true, id: c.id, title: c.title };
 }
 const itemId = String(input.itemId || "");
 if (!itemId) return { error: "itemId is required to assign/unassign." };
 const it = await getItem(itemId);
 if (!it || it.sellerId !== sid) return { error: "No item with that id on this store." };
 const col = await getOrCreateCollection(sid, title);
 const current = await getItemCollectionIds(itemId);
 const set = new Set(current);
 if (input.action === "assign") set.add(col.id); else set.delete(col.id);
 await setItemCollections(itemId, [...set]);
 return { ok: true, itemId, collection: col.title, action: input.action };
 }
 // ── Discounts ──
 case "list_discounts": {
 return { discounts: await listDiscounts(slug) };
 }
 case "manage_discount": {
 if (input.action === "create") {
 const code = String(input.code || "").trim();
 if (!code) return { error: "A code is required." };
 const d = await addDiscount(slug, { code, label: input.label, kind: input.kind === "fixed" ? "fixed" : "percent", value: input.value != null ? Number(input.value) : null });
 return d ? { ok: true, discount: d } : { error: "Couldn't create that code (it may already exist)." };
 }
 const id = Number(input.id);
 if (!Number.isFinite(id)) return { error: "id is required." };
 if (input.action === "delete") { await deleteDiscount(slug, id); return { ok: true, deleted: id }; }
 const patch: { active?: boolean; autoApply?: boolean } = {};
 if (input.action === "enable") patch.active = true;
 else if (input.action === "disable") patch.active = false;
 else if (input.action === "autoapply_on") patch.autoApply = true;
 else if (input.action === "autoapply_off") patch.autoApply = false;
 else return { error: "Unknown action." };
 await updateDiscount(slug, id, patch);
 return { ok: true, id, ...patch };
 }
 // ── Orders ──
 case "update_order": {
 const seller = await getSellerBySlug(slug);
 if (!seller) return { error: "No seller record." };
 const id = String(input.id || "");
 const orders = await listSellerOrders(seller.id);
 if (!orders.some((o) => o.id === id)) return { error: "No order with that id on this store (use the id from get_orders)." };
 if (input.action === "mark_shipped") { await markOrderShipped(id); return { ok: true, id, status: "shipped" }; }
 if (input.action === "set_status") {
 if (!["paid", "shipped", "delivered"].includes(input.status)) return { error: "status must be paid, shipped, or delivered." };
 await updateOrderStatus(id, input.status);
 return { ok: true, id, status: input.status };
 }
 return { error: "Unknown action." };
 }
 // ── Inbox & offers ──
 case "get_inbox": {
 if (input.conversationId != null) {
 const cid = Number(input.conversationId);
 const convo = await getConversationForStore(cid, slug);
 if (!convo) return { error: "No conversation with that id." };
 const messages = await getMessages(cid);
 await markStoreRead(cid, slug).catch(() => {});
 return { conversation: convo, messages };
 }
 const threads = await getConversationsByStore(slug);
 return { count: threads.length, threads };
 }
 case "reply_message": {
 const cid = Number(input.conversationId);
 const convo = await getConversationForStore(cid, slug);
 if (!convo) return { error: "No conversation with that id." };
 const body = String(input.body || "").trim();
 if (!body) return { error: "The reply is empty." };
 await addMessage(cid, "store", body);
 return { ok: true, conversationId: cid, sent: body.slice(0, 80) };
 }
 case "get_offers": {
 const offers = await listOffersByStore(slug);
 const pending = await countPendingForStore(slug).catch(() => 0);
 return { count: offers.length, pending, offers: offers.map((o) => ({ id: o.id, item: o.itemTitle, listUsd: Math.round(o.listPriceCents / 100), offerUsd: Math.round(o.amountCents / 100), status: o.status, yourTurn: o.lastActor === "buyer", buyer: o.buyerEmail })) };
 }
 case "respond_offer": {
 const offer = await getOfferForStore(Number(input.id), slug);
 if (!offer) return { error: "No offer with that id." };
 const amountCents = input.action === "counter" && input.counterUsd != null ? Math.round(Number(input.counterUsd) * 100) : undefined;
 if (input.action === "counter" && !amountCents) return { error: "Provide counterUsd to counter." };
 const r = await respondToOffer(offer, "store", input.action, amountCents);
 return r ? { ok: true, id: r.id, status: r.status, offerUsd: Math.round(r.amountCents / 100) } : { error: "That move isn't allowed on this offer right now." };
 }
 // ── Marketing: automations & campaigns ──
 case "get_automations": {
 const a = await getAutomations(slug);
 return { ...a, builtinCatalog: BUILTIN_AUTOMATIONS, customTriggers: CUSTOM_TRIGGERS };
 }
 case "manage_automation": {
 switch (input.action) {
 case "toggle_builtin":
 if (!input.key) return { error: "key is required." };
 await setBuiltinEnabled(slug, String(input.key), !!input.enabled);
 return { ok: true, key: input.key, enabled: !!input.enabled };
 case "add_custom":
 if (!input.name || !input.trigger || !input.subject || !input.body) return { error: "name, trigger, subject and body are all required." };
 await addCustomAutomation(slug, { name: String(input.name), trigger: String(input.trigger), subject: String(input.subject), body: String(input.body) });
 return { ok: true, added: input.name };
 case "toggle_custom":
 if (input.id == null) return { error: "id is required." };
 await setCustomEnabled(slug, Number(input.id), !!input.enabled);
 return { ok: true, id: input.id, enabled: !!input.enabled };
 case "remove_custom":
 if (input.id == null) return { error: "id is required." };
 await removeCustomAutomation(slug, Number(input.id));
 return { ok: true, removed: input.id };
 default:
 return { error: "Unknown action." };
 }
 }
 case "send_campaign": {
 const subject = String(input.subject || "").trim();
 const body = String(input.body || "").trim();
 if (!subject || !body) return { error: "Subject and body are required." };
 // Only allow safe http(s) CTA links (never javascript:/data: etc.).
 const rawLink = input.link ? String(input.link).trim() : "";
 const link = /^https?:\/\//i.test(rawLink) ? rawLink : null;
 const segment = input.segment ? String(input.segment).toLowerCase().trim() : null;
 // Schedule for later → queue it; the cron delivers it.
 if (input.scheduleAt) {
 const t = new Date(input.scheduleAt);
 if (isNaN(t.getTime()) || t.getTime() < Date.now() + 60000) return { error: "scheduleAt must be a valid time at least a minute in the future." };
 const c = await createScheduledCampaign(slug, { subject, body, link, segment, scheduledAt: t });
 return { ok: true, scheduled: true, id: c.id, scheduledFor: c.scheduledAt, segment };
 }
 // Test send → only to the store's own inbox, no history record.
 if (input.test !== false) {
 const sender = await resolveStoreSender(slug);
 const brand = await getStoreEmailBrand(slug);
 const r = await sendStoreCampaign({ storeSlug: slug, storeName: sender.fromName, storeEmail: sender.replyTo, fromAddress: sender.fromAddress, subject: subject.slice(0, 200), body: body.slice(0, 10000), link: link || undefined, brand, recipients: [sender.replyTo] } as any);
 return { ok: true, test: true, sentTo: sender.replyTo, note: "Test sent to your own inbox — check it, then confirm to send for real.", result: r };
 }
 // Real send → deliver + log to campaign history.
 const { recipientCount } = await deliverCampaign(slug, { subject, body, link, segment });
 if (!recipientCount) return { error: segment ? "No subscribers in that segment." : "No subscribers to send to yet." };
 await recordSentCampaign(slug, { subject, body, link, segment, recipientCount });
 return { ok: true, test: false, recipients: recipientCount, segment };
 }
 case "list_campaigns": {
 const campaigns = await listCampaigns(slug, 30);
 return { count: campaigns.length, campaigns };
 }
 case "cancel_campaign": {
 const ok = await cancelScheduledCampaign(slug, Number(input.id));
 return ok ? { ok: true, canceled: input.id } : { error: "No scheduled campaign with that id (it may have already sent)." };
 }
 // ── Cross-listing ──
 case "get_crosslisting": {
 const [board, accounts] = await Promise.all([getCrossListBoard(slug).catch(() => null), getPlatformAccounts(slug).catch(() => [])]);
 return { platforms: PLATFORMS, accounts, board };
 }
 case "manage_crosslisting": {
 const sid = await sellerIdOf(slug);
 switch (input.action) {
 case "connect":
 if (!input.platform || !input.handle) return { error: "platform and handle are required." };
 await upsertPlatformAccount(slug, String(input.platform), String(input.handle), !!input.autoList);
 return { ok: true, connected: input.platform };
 case "disconnect":
 if (!input.platform) return { error: "platform is required." };
 await removePlatformAccount(slug, String(input.platform));
 return { ok: true, disconnected: input.platform };
 case "list_item": {
 if (!input.itemId) return { error: "itemId is required." };
 if (!sid) return { error: "No seller record for this store." };
 const it = await getItem(String(input.itemId));
 if (!it || it.sellerId !== sid) return { error: "No item with that id on this store." };
 const n = await createCrossListingsForItem(slug, String(input.itemId));
 await syncItemToApiPlatforms(slug, String(input.itemId)).catch(() => {});
 return { ok: true, listedOn: n };
 }
 case "delist": {
 if (!input.itemId) return { error: "itemId is required." };
 if (!sid) return { error: "No seller record for this store." };
 const it = await getItem(String(input.itemId));
 if (!it || it.sellerId !== sid) return { error: "No item with that id on this store." };
 const removed = await delistEverywhere(String(input.itemId), "manual");
 return { ok: true, delistedFrom: removed };
 }
 default:
 return { error: "Unknown action." };
 }
 }
 // ── Consignment ──
 case "get_consignment": {
 const [settings, consignors, splitRules, summary] = await Promise.all([
 getConsignmentSettings(slug),
 listConsignors(slug),
 getSplitRules(slug).catch(() => []),
 getConsignmentSummary(slug).catch(() => null),
 ]);
 return { settings, splitRules, summary, consignors };
 }
 case "manage_consignment": {
 switch (input.action) {
 case "set_default_split":
 if (input.splitPct == null) return { error: "splitPct is required." };
 await upsertConsignmentSettings(slug, { storeDefaultSplitPct: Number(input.splitPct) });
 return { ok: true, storeDefaultSplitPct: Number(input.splitPct) };
 case "update_settings": {
 if (!input.settings || typeof input.settings !== "object") return { error: "settings object required." };
 // autoPayout turns on AUTOMATED Stripe transfers to consignors (money movement) — that stays
 // behind the seller's own UI, never the assistant. Whitelist the safe operational fields only.
 if (input.settings.autoPayout !== undefined) return { error: "Turning on automatic payouts moves money on a schedule — do that yourself in the Consignment tab. I can set everything else up." };
 const ALLOWED = ["payoutCycle", "holdDays", "requireAgreement", "collectW9", "agreementTerms", "storeCreditBonusPct", "defaultPayoutMethod", "payoutMethods", "storeDefaultSplitPct"];
 const patch: Record<string, any> = {};
 for (const k of ALLOWED) if (input.settings[k] !== undefined) patch[k] = input.settings[k];
 if (!Object.keys(patch).length) return { error: "No editable settings provided." };
 await upsertConsignmentSettings(slug, patch);
 return { ok: true, updated: Object.keys(patch) };
 }
 case "add_consignor": {
 if (!input.name) return { error: "name is required." };
 const c = await createConsignor(slug, { name: String(input.name), email: input.email ?? null, phone: input.phone ?? null, defaultSplitPct: input.splitPct != null ? Number(input.splitPct) : null });
 return { ok: true, consignor: { id: c.id, name: c.name } };
 }
 case "update_consignor": {
 if (input.id == null) return { error: "id is required." };
 const owned = await getConsignor(Number(input.id));
 if (!owned || owned.storeSlug !== slug) return { error: "No consignor with that id on this store." };
 const patch: Record<string, any> = {};
 if (input.name != null) patch.name = String(input.name);
 if (input.email != null) patch.email = String(input.email);
 if (input.phone != null) patch.phone = String(input.phone);
 if (input.splitPct != null) patch.defaultSplitPct = Number(input.splitPct);
 await updateConsignor(Number(input.id), patch);
 return { ok: true, id: input.id };
 }
 case "remove_consignor": {
 if (input.id == null) return { error: "id is required." };
 const owned = await getConsignor(Number(input.id));
 if (!owned || owned.storeSlug !== slug) return { error: "No consignor with that id on this store." };
 await deleteConsignor(Number(input.id));
 return { ok: true, removed: input.id };
 }
 default:
 return { error: "Unknown action." };
 }
 }
 // ── Integrations ──
 case "get_integrations": {
 const [klaviyo, ig, conn] = await Promise.all([
 getEspConnection(slug).catch(() => null),
 getStoreIgConnection(slug).catch(() => null),
 getConnection(slug).catch(() => null),
 ]);
 return {
 klaviyo: klaviyo ? { connected: true, provider: klaviyo.provider } : { connected: false },
 instagram: ig ? { connected: true, username: (ig as any).igUsername ?? null, autoPost: (ig as any).autoPost ?? null } : { connected: false, appConfigured: igAppConfigured() },
 salesPlatform: conn,
 };
 }
 case "manage_integration": {
 switch (input.action) {
 case "klaviyo_sync": {
   // Pushes contacts AND the store's pieces and orders — the same thing the Apps page does.
   const { syncEspNow } = await import("./esp-sync");
   return await syncEspNow(slug);
  }
 case "klaviyo_disconnect": await disconnectEsp(slug); return { ok: true, disconnected: "klaviyo" };
 case "instagram_toggle": await setStoreIgAutoPost(slug, !!input.enabled); return { ok: true, autoPost: !!input.enabled };
 case "instagram_post_now": {
 if (!input.itemId) return { error: "itemId is required." };
 const sid = await sellerIdOf(slug);
 const it = sid ? await getItem(String(input.itemId)) : null;
 if (!it || it.sellerId !== sid) return { error: "No item with that id on this store." };
 const r = await publishItemStory(slug, String(input.itemId));
 return { ok: true, ...(r as any) };
 }
 case "instagram_disconnect": await disconnectStoreIg(slug); return { ok: true, disconnected: "instagram" };
 default:
 return { error: "Unknown action." };
 }
 }
 // ── Customers ──
 case "get_customer": {
 const email = String(input.email || "").toLowerCase().trim();
 if (!email) return { error: "email is required." };
 const profiles = await listCustomerProfiles(slug);
 const p = profiles.find((x) => (x.email || "").toLowerCase() === email);
 if (!p) return { error: "No customer with that email." };
 return { customer: { name: p.name, email: p.email, orders: p.orders, spentUsd: Math.round((p.spentCents || 0) / 100), subscribed: p.subscribed, location: p.location, lastOrderAt: p.lastOrderAt, tags: p.tags, note: p.notes } };
 }
 case "list_segments": {
 const tags = await listCustomerTags(slug);
 return { segments: tags };
 }
 case "manage_customer": {
 const email = String(input.email || "").toLowerCase().trim();
 if (!email) return { error: "email is required." };
 switch (input.action) {
 case "add": await addCustomer(slug, email, input.name ? String(input.name) : null); return { ok: true, added: email };
 case "subscribe": await setEmailSubscribed(slug, email, true); return { ok: true, email, subscribed: true };
 case "unsubscribe": await setEmailSubscribed(slug, email, false); return { ok: true, email, subscribed: false };
 case "tag": if (!input.tag) return { error: "tag is required." }; await addCustomerTag(slug, email, String(input.tag)); return { ok: true, email, tagged: String(input.tag).toLowerCase().trim() };
 case "untag": if (!input.tag) return { error: "tag is required." }; await removeCustomerTag(slug, email, String(input.tag)); return { ok: true, email, untagged: String(input.tag).toLowerCase().trim() };
 case "note": await setCustomerNote(slug, email, input.note != null ? String(input.note) : null); return { ok: true, email, note: input.note != null ? String(input.note).slice(0, 80) : null };
 default: return { error: "Unknown action." };
 }
 }
 // ── Store settings, policies, shipping, voice ──
 case "get_store_settings": {
 const [profile, policy, shipping, brief, promo, minMarkupBps, inbox, plan, pay] = await Promise.all([
 getStoreProfile(slug).catch(() => null),
 getRefundPolicy(slug),
 getShippingSettings(slug),
 getStoreBrief(slug).catch(() => null),
 getPromoCode(slug).catch(() => null),
 getMinMarkupBps(slug).catch(() => 0),
 getInboxSettings(slug).catch(() => null),
 getStorePlan(slug).catch(() => null),
 getSellerPayments(slug).catch(() => null),
 ]);
 return { profile, policy, shipping, brief, promoCode: promo, minMarkupPct: minMarkupBps ? minMarkupBps / 100 : 0, messaging: inbox, plan, payouts: pay ? { connected: !!pay.stripeAccountId, chargesEnabled: pay.chargesEnabled, payoutsEnabled: pay.payoutsEnabled, detailsSubmitted: pay.detailsSubmitted } : { connected: false } };
 }
 case "update_store_settings": {
 const done: string[] = [];
 if (input.profile && typeof input.profile === "object") { await updateStoreProfile(slug, { displayName: input.profile.name, legalName: input.profile.legalName, location: input.profile.location, bio: input.profile.bio }); done.push("profile"); }
 if (input.policy && typeof input.policy === "object") { await setRefundPolicy(slug, input.policy); await syncPayoutSchedule(slug).catch(() => null); done.push("policy"); }
 if (input.shipping && typeof input.shipping === "object") {
 const s = input.shipping;
 const cur = await getShippingSettings(slug);
 const next = { mode: ["buyer_pays", "store_pays", "free_over"].includes(s.mode) ? s.mode : cur.mode, freeThresholdCents: s.freeThresholdUsd != null ? Math.round(Number(s.freeThresholdUsd) * 100) : cur.freeThresholdCents, shipFrom: cur.shipFrom };
 await setShippingSettings(slug, next as any);
 done.push("shipping");
 }
 if (input.brief && typeof input.brief === "object") {
 const cur = (await getStoreBrief(slug).catch(() => null)) as any;
 await saveStoreBrief(slug, { pricing: input.brief.pricing ?? cur?.pricing ?? "", voice: input.brief.voice ?? cur?.voice ?? "", about: input.brief.about ?? cur?.about ?? "" });
 done.push("brief");
 }
 if (input.storefront && typeof input.storefront === "object") {
 const sf = await getStorefrontBySlug(slug);
 await upsertStorefront(slug, { handle: sf?.handle || slug, enabled: !!sf?.enabled, tagline: input.storefront.tagline ?? sf?.tagline ?? "", accentColor: sf?.accentColor || "#5D0F17", heroImage: sf?.heroImage || "", about: input.storefront.about ?? sf?.about ?? "" });
 done.push("storefront");
 }
 if (input.messaging && typeof input.messaging === "object") { await updateInboxSettings(slug, input.messaging); done.push("messaging"); }
 if (input.promoCode != null) { await setPromoCode(slug, String(input.promoCode).trim() || null); done.push("promoCode"); }
 if (input.minMarkupPct != null) { await setMinMarkupBps(slug, Math.round(Number(input.minMarkupPct) * 100)); done.push("minMarkup"); }
 if (!done.length) return { error: "Nothing to update — pass policy, shipping, brief, storefront, messaging, promoCode and/or minMarkupPct." };
 return { ok: true, updated: done };
 }
 // ── Sourcing & market intelligence ──
 case "get_market_intelligence": {
 const window = input.window === "7d" ? "7d" : "30d";
 switch (input.action) {
 case "whitespace": return { whitespace: await getStoreWhitespace(slug, window, 12) };
 case "colors": return { colors: await getTopColors(window, 8) };
 case "trends": return { trends: await getBrandHeatIndex(window === "7d" ? 7 : 30, 40) };
 case "demand": {
 const d = await getStoreDemandIntelligence(slug, { windowDays: window === "7d" ? 7 : 30 });
 // Privacy: brand/category demand comes from UNGATED marketplace aggregates, so a brand carried
 // by a single store would expose that store's raw engagement. Strip the raw counts — keep the
 // brand/category name, the seller's OWN inventory, global search intent, and the opportunity flag.
 const demand = {
 ...d,
 brandDemand: (d.brandDemand as any[]).map((b) => ({ brand: b.brand, searches: b.searches, yourInventory: b.yourInventory, opportunity: b.opportunity })),
 hotCategories: (d.hotCategories as any[]).map((c) => ({ category: c.category, yourInventory: c.yourInventory })),
 };
 return { demand };
 }
 case "source_now":
 if (!(await isStorePro(slug))) return { locked: true, note: "Source-now is a Pro feature — the seller can upgrade in Billing." };
 return { sourceNow: await getSourceNow(window) };
 default:
 return { error: "Unknown action." };
 }
 }
 case "get_account_status": {
 const [plan, pay, conn] = await Promise.all([getStorePlan(slug).catch(() => null), getSellerPayments(slug).catch(() => null), getConnection(slug).catch(() => null)]);
 return { plan, payouts: pay ? { connected: !!pay.stripeAccountId, chargesEnabled: pay.chargesEnabled, payoutsEnabled: pay.payoutsEnabled, detailsSubmitted: pay.detailsSubmitted } : { connected: false }, salesPlatform: conn };
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
- Design their marketing emails — the look EVERY campaign and automation sends with (get_email_design / update_email_design). You control BOTH the whole LAYOUT/STRUCTURE (the "layout" field: classic / minimal / editorial / bold — a card vs flat vs magazine vs a bold reversed look) AND the details: colours, heading & body fonts, logo, button label + shape, footer note, alignment, accent bar. So when a seller says "completely redesign my emails" or "make my emails look totally different", you CAN — pick a new layout + palette + type + button together, don't just recolor. By default emails inherit the storefront brand; saving a change makes it their custom email design (reset:true snaps back). If they describe or upload an inspiration email, translate its layout + palette + type into these settings and apply it.
- Answer anything about how the business is doing — pull a live snapshot (revenue, orders, AOV, traffic, top brands/categories, inventory, customers) with get_business_snapshot, list recent orders with get_orders, and list/rank customers with get_customers. Use these for any sales, revenue, traffic, order-lookup, or customer question instead of guessing.
- Run the whole INVENTORY: list it (list_inventory), create new listings (create_listing — incl. scheduling a future drop with scheduleAt or going live now with publish), edit any field (update_listing), and manage the lifecycle (manage_listing: publish/unpublish/mark_sold/relist/archive, single or bulk). This is the live catalogue the seller sees — always use these, not guesses.
- MERCHANDISE: organize products into collections (list_collections / manage_collection) and run discount codes (list_discounts / manage_discount — create, enable/disable, auto-apply, delete).
- Handle ORDERS: look them up (get_orders) and update them (update_order: mark_shipped, set_status). Refunds and buying labels move money — do everything up to that and hand the seller the final click in the Orders tab.
- Run the INBOX: read buyer messages (get_inbox), reply (reply_message), and handle price offers (get_offers / respond_offer: accept, decline, counter).
- Run MARKETING beyond the email look: manage automations (get_automations / manage_automation) and send real campaigns (send_campaign — test to their own inbox first, then send to subscribers only on explicit confirmation; you can also SCHEDULE a campaign for later with scheduleAt, or target a segment tag). See what's gone out or is queued with list_campaigns, and cancel an upcoming one with cancel_campaign.
- Manage other SALES CHANNELS: cross-listing to eBay/Etsy/Depop/Poshmark (get_crosslisting / manage_crosslisting: connect, list an item, delist) and CONSIGNMENT (get_consignment / manage_consignment: consignors, splits, settings).
- Manage INTEGRATIONS: Klaviyo and Instagram auto-posting (get_integrations / manage_integration). Connecting an integration needs a login/key the seller enters in the Apps tab — walk them there rather than asking for credentials.
- Manage CUSTOMERS as a CRM: look one up (get_customer — shows their tags & note), add them, toggle subscription, TAG them into segments and add a private note (manage_customer: tag/untag/note), list your segments (list_segments), and pull one segment (get_customers with a tag). Then you can send a campaign to just that segment.
- Configure the STORE: rename it / set its legal name / location / bio (update_store_settings profile — renaming flows through to their emails), plus policies (returns/refunds), shipping, brand voice/brief, storefront tagline/about, buyer-messaging & offer settings, promo code, minimum markup — all via get_store_settings / update_store_settings.
- Give SOURCING & MARKET intelligence: get_market_intelligence answers "what should I source", "what's in demand/trending", "where's the whitespace" (whitespace, source_now [Pro], colors, trends, demand). It's privacy-safe market aggregate — never another store's individual numbers; never claim otherwise. get_account_status reads plan/tier and payout-setup status.
- Undo your last change to the storefront or the email design with revert_last_change — do it instantly when the seller says "undo" / "revert" / "go back."
- Remember across conversations — when the seller shares a preference, their brand voice, or a decision worth keeping, save it with remember_fact so you recall it next time. Everything you already remember is given to you at the start of each chat; use it and don't re-ask.

Inspiration images: sellers can attach pictures to the chat — an email they like, a storefront, a moodboard, a colour palette, a product. When they do, actually LOOK: pull the dominant colours as hex values, read the type feel (serif vs sans, elegant vs bold vs playful), the spacing, and the overall mood. Then propose a concrete design in a line or two ("warm cream background, near-black Cormorant headings, a pill button in terracotta — want me to apply it to your emails?") and, on confirmation, turn it into real settings with update_email_design (for the email look) or the storefront tools (for the store). Don't just describe the picture back to them — translate it into a design and offer to apply it. If a request is ambiguous about WHERE to apply it (emails vs storefront), ask which.

You can also answer questions, not just take actions — resale and vintage expertise, pricing and merchandising, marketing and growth, business advice, or general questions even outside VYA. Be genuinely useful and never refuse a question just because it's off-topic.

When a seller asks you to build or change part of their page, prefer the section tools (add_section / update_section / move_section / remove_section). Check the current layout with list_sections first when it helps.

For any OPEN-ENDED design or layout request that the section fields don't cover — repositioning an element, alignment, spacing, sizing, custom colors, borders, hover effects, "move the heading to the bottom left", "make the buttons rounded", "add more space above the products", etc. — use style_storefront to write real CSS targeting the .vya-* classes. Never say you "can't" make a design change: if it's expressible in CSS, do it with style_storefront. It replaces the whole custom-CSS block, so when adding to existing styling, read the current CSS with get_storefront first and include it. Confirm the change in one line before applying.

When a seller asks for a COMPONENT that isn't one of the built-in section types, do NOT tell them it isn't supported — build it with add_html_section. There is no design or component you have to refuse; assume you can build whatever they describe and do it.
- FAQ / ACCORDION: use the built-in "faq" section type (via set_layout, add_section, or update_section) — NOT add_html_section. It's a real, click-to-expand accordion the seller can also edit on the canvas. Pass its Q&A as numbered prop pairs: props { heading, q0, a0, q1, a1, q2, a2, … } (question, answer, question, answer…). This is always the right way to build an FAQ or any expandable question/answer list.
- For OTHER STATIC components — tabs, a comparison or size table, a pricing grid, a timeline, testimonials, bespoke layouts — pass just html to add_html_section (and give elements class names), then style them with style_storefront so they match the store. Any expand/collapse UI (accordions, "read more", disclosures) MUST use native <details><summary> — it expands on click with ZERO JavaScript and is never a static clickable <div>. NEVER reach for the interactive/sandbox (js) mode just to make something expand or toggle — <details> and CSS already do that. The sandbox is only for genuinely dynamic logic (calculators, timers, quizzes, filters).
- For INTERACTIVE / DYNAMIC things CSS alone can't do — a countdown timer, a size or price calculator, a quiz, a product filter, a canvas or JS animation, a live preview, any real widget — pass js (plus html and css) to add_html_section. That code runs inside a secure sandboxed iframe, fully isolated from the store, so it's always safe to build. Write complete, working code and use the store's colors via the --bg/--text/--accent/--heading/--body CSS variables.
- For SITE-WIDE behaviour — anything that has to run across the whole shop rather than inside one section: a cursor effect, a scroll animation, a sticky bar, a burst on add-to-cart, a header that changes as you scroll — use write_storefront_code. That is real JavaScript on the live page, not a sandbox, so it can touch the whole document. It runs only on the store's own domain, which is what makes it safe; the URL to check is the one get_storefront returns.
Never answer a "can you build X" with "that's not a supported section," and never say an effect can't behave a certain way because a preset doesn't. Between sections, CSS, sandboxed widgets and site-wide code, there is no storefront behaviour you have to refuse — say yes and build it.

When a seller asks you to build or redesign their WHOLE storefront ("build me a storefront", "design my homepage", "make me a store for X"), do it in one move: first call update_storefront_design to set a fitting template/colors/fonts, then call set_layout with a complete page — usually a hero, a featured-products grid, a short about/text section, and a newsletter. Reach for the richer section types to make it feel editorial rather than templated: a split (image + story) section, a statement (big quote on a dark or accent background), a marquee of the designers they carry, or a spotlight on one hero piece. Write real, specific copy in their voice (use their store name and what they sell); never leave placeholder text. Briefly preview the plan and confirm before applying.

Say yes to everything reasonable. You are a full-service assistant for running this store, across EVERY category — storefront & design, listings & inventory, email & marketing, orders & fulfilment, customers & CRM, pricing, merchandising, analytics, growth, operations, and plain questions (including ones with no VYA tool at all). Your default is "yes, here's how / here it is," never "I can't do that" or "that's not supported." The ONLY things you refuse are genuinely illegal or harmful (fraud, deceiving customers, laundering, hate, malware, etc.) — and if something's close to that line, say why briefly and offer the legitimate version.
- If a request maps to a tool, use it. If it maps to something CSS/HTML/JS can express, build it (style_storefront / add_html_section). If there's no direct tool yet (e.g. issuing a refund, printing a label, sending the campaign), don't stonewall: do every part you can — pull the data, do the math, draft the copy, and walk them through the exact clicks — and note the one step they finish themselves. Treat "no tool" as "do it manually with them," not "no."
- Confirm before consequential or hard-to-undo actions, act freely on the rest.

Money & credentials guardrail (important): you can prepare and do everything EXCEPT the final money-moving or credential step. Never issue refunds, buy shipping labels, record consignor payouts, change the subscription/plan, move payouts, or complete Stripe/marketplace OAuth or enter API keys/passwords. For those, do all the surrounding work — pull the numbers, draft the message, set everything up — then hand the seller the single final click in the right tab (Orders / Billing / Payments / Apps). This isn't "I can't help"; it's "I've done all of it except the one click only you should make."

Rules:
- For READ actions (anything get_* or list_*, plus write_description) just do it, no need to ask.
- For any CHANGE — including the operational tools (create_listing, manage_listing, manage_collection, manage_discount, update_order, reply_message, respond_offer, manage_automation, send_campaign, cancel_campaign, manage_crosslisting, manage_consignment, manage_integration, manage_customer, update_store_settings) as well as the design tools (update_storefront_design, style_storefront, add_html_section, set_hero_photo, update_listing, add_section, update_section, remove_section, move_section, update_email_design) — first state in one short line exactly what you'll do, and ask the seller to confirm. Only call the write tool AFTER they confirm in their next message. Two extra-careful cases: send_campaign for real (test:false) needs an explicit "yes, send it to everyone" after they've seen a test; and respond_offer / update_order affect real buyers, so confirm the specifics. Exception: revert_last_change is instant and needs no confirmation.
- Be concise and friendly — prefer doing over explaining. After a change, confirm what changed in one line.
- You only ever take ACTIONS on THIS seller's own store, and you never touch or reveal other stores' data.`;

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
 const res = await anthropic({ model: MODEL, max_tokens: 4096, system: sys, tools: TOOLS, messages: convo });
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
