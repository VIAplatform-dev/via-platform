import { neon } from "@neondatabase/serverless";
import type { StorefrontTheme } from "./store-import";
import { sanitizeStorefrontHtml } from "./sanitize-storefront-html";

type ThemeBlock = { id: string; type: string; props: Record<string, string>; style?: { bg?: string } };
const cap = (s: string | undefined, n: number) => String(s ?? "").slice(0, n);
// Custom sections are the "build anything" escape hatch, in two flavours, both handled at this one
// write chokepoint (covers the editor, the design API, and the AI):
//  • inline  — static markup rendered into the page. XSS-sensitive, so scrub to the safe allowlist.
//  • sandbox — full HTML+CSS+JS rendered inside an isolated sandboxed iframe (SandboxEmbed). It
//    can't touch the store, so the JS is kept as-is; we only bound its size.
function scrubBlocks(blocks?: ThemeBlock[]): ThemeBlock[] | undefined {
 if (!Array.isArray(blocks)) return blocks;
 return blocks.map((b) => {
 if (b?.type !== "custom") return b;
 const sandbox = b.props?.mode === "sandbox" || !!(b.props?.js && b.props.js.trim());
 if (sandbox) {
 return { ...b, props: { ...b.props, mode: "sandbox", html: cap(b.props?.html, 40000), css: cap(b.props?.css, 40000), js: cap(b.props?.js, 40000) } };
 }
 return { ...b, props: { ...b.props, html: sanitizeStorefrontHtml(b.props?.html) } };
 });
}
function scrubThemeHtml(theme: StorefrontTheme | null): StorefrontTheme | null {
 if (!theme) return theme;
 return {
 ...theme,
 blocks: scrubBlocks(theme.blocks),
 shopBlocks: scrubBlocks(theme.shopBlocks),
 extraPages: theme.extraPages?.map((p) => ({ ...p, blocks: scrubBlocks(p.blocks) || [] })),
 };
}

// ───────────────────────────────────────────────────────────────────────────
// Hosted storefronts (Slice 1). One row per store keyed on store_slug (the
// universal store identity). `handle` is the public URL segment (/s/<handle>),
// defaulting to the slug. Branding lives here; the products themselves still
// come from the existing synced `products` table (keyed on store_slug).
// custom_domain is reserved for Slice 3 (seller-owned domains).
// ───────────────────────────────────────────────────────────────────────────

export type StorefrontSettings = {
 storeSlug: string;
 handle: string;
 enabled: boolean;
 tagline: string | null;
 accentColor: string; // hex
 heroImage: string | null;
 about: string | null;
 customDomain: string | null;
 theme: StorefrontTheme | null; // extracted design (fonts/colors/logo)
 updatedAt?: string;
};

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return url;
};

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
 if (!tableReady) {
 const sql = neon(getDatabaseUrl());
 tableReady = (async () => {
 await sql`
 CREATE TABLE IF NOT EXISTS storefront_settings (
 store_slug TEXT PRIMARY KEY,
 handle TEXT UNIQUE NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 tagline TEXT,
 accent_color TEXT NOT NULL DEFAULT '#5D0F17',
 hero_image TEXT,
 about TEXT,
 custom_domain TEXT UNIQUE,
 created_at TIMESTAMPTZ DEFAULT NOW(),
 updated_at TIMESTAMPTZ DEFAULT NOW()
 )
 `;
 await sql`ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS theme JSONB`;
 })().catch((e) => {
 tableReady = null; // allow retry on transient failure
 throw e;
 });
 }
 return tableReady;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToSettings(r: any): StorefrontSettings {
 return {
 storeSlug: r.store_slug,
 handle: r.handle,
 enabled: r.enabled,
 tagline: r.tagline ?? null,
 accentColor: r.accent_color || "#5D0F17",
 heroImage: r.hero_image ?? null,
 about: r.about ?? null,
 customDomain: r.custom_domain ?? null,
 theme: (r.theme as StorefrontTheme) ?? null,
 updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
 };
}

/** Save the extracted design theme (fonts/colors/logo) for a store. */
export async function setStorefrontTheme(storeSlug: string, theme: StorefrontTheme | null): Promise<void> {
 await ensureTable();
 const clean = scrubThemeHtml(theme);
 const sql = neon(getDatabaseUrl());
 await sql`UPDATE storefront_settings SET theme = ${clean ? JSON.stringify(clean) : null}::jsonb, updated_at = NOW() WHERE store_slug = ${storeSlug}`;
}

/** Public lookup for the storefront page — only enabled rows resolve. */
export async function getStorefrontByHandle(handle: string): Promise<StorefrontSettings | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const h = handle.toLowerCase().trim();
 const rows = await sql`SELECT * FROM storefront_settings WHERE handle = ${h} AND enabled = TRUE`;
 return rows.length ? rowToSettings(rows[0]) : null;
}

/** Preview lookup — resolves a handle even when the storefront is off (owner
 * preview). The public page only uses this with ?preview and shows a ribbon. */
export async function getStorefrontByHandleAny(handle: string): Promise<StorefrontSettings | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const h = handle.toLowerCase().trim();
 const rows = await sql`SELECT * FROM storefront_settings WHERE handle = ${h}`;
 return rows.length ? rowToSettings(rows[0]) : null;
}

/** Editor lookup — returns the row for a store regardless of enabled state. */
export async function getStorefrontBySlug(storeSlug: string): Promise<StorefrontSettings | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT * FROM storefront_settings WHERE store_slug = ${storeSlug}`;
 return rows.length ? rowToSettings(rows[0]) : null;
}

/** Is this handle already claimed by a different store? */
export async function isHandleTaken(handle: string, exceptSlug: string): Promise<boolean> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const h = handle.toLowerCase().trim();
 const rows = await sql`SELECT store_slug FROM storefront_settings WHERE handle = ${h} AND store_slug <> ${exceptSlug}`;
 return rows.length > 0;
}

/** Public lookup by connected custom domain (host-based routing). */
export async function getStorefrontByDomain(domain: string): Promise<StorefrontSettings | null> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const d = domain.toLowerCase().trim().replace(/^www\./, "");
 const rows = await sql`
 SELECT * FROM storefront_settings
 WHERE enabled = TRUE AND (LOWER(custom_domain) = ${d} OR LOWER(custom_domain) = ${"www." + d})
 `;
 return rows.length ? rowToSettings(rows[0]) : null;
}

/** Is this custom domain already claimed by a different store? */
export async function isDomainTaken(domain: string, exceptSlug: string): Promise<boolean> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const d = domain.toLowerCase().trim();
 const rows = await sql`SELECT store_slug FROM storefront_settings WHERE LOWER(custom_domain) = ${d} AND store_slug <> ${exceptSlug}`;
 return rows.length > 0;
}

/** Set (or clear) a store's custom domain. Returns false if the store has no
 * storefront row yet (configure the storefront first). */
export async function setCustomDomain(storeSlug: string, domain: string | null): Promise<boolean> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const d = domain ? domain.toLowerCase().trim() : null;
 const rows = await sql`UPDATE storefront_settings SET custom_domain = ${d}, updated_at = NOW() WHERE store_slug = ${storeSlug} RETURNING store_slug`;
 return rows.length > 0;
}

export type StorefrontUpdate = {
 handle: string;
 enabled: boolean;
 tagline: string | null;
 accentColor: string;
 heroImage: string | null;
 about: string | null;
};

/** Create or update a store's storefront settings. */
export async function upsertStorefront(storeSlug: string, u: StorefrontUpdate): Promise<StorefrontSettings> {
 await ensureTable();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 INSERT INTO storefront_settings (store_slug, handle, enabled, tagline, accent_color, hero_image, about, updated_at)
 VALUES (${storeSlug}, ${u.handle}, ${u.enabled}, ${u.tagline}, ${u.accentColor}, ${u.heroImage}, ${u.about}, NOW())
 ON CONFLICT (store_slug) DO UPDATE SET
 handle = EXCLUDED.handle,
 enabled = EXCLUDED.enabled,
 tagline = EXCLUDED.tagline,
 accent_color = EXCLUDED.accent_color,
 hero_image = EXCLUDED.hero_image,
 about = EXCLUDED.about,
 updated_at = NOW()
 RETURNING *
 `;
 return rowToSettings(rows[0]);
}

/** Normalise a handle to url-safe form: lowercase, [a-z0-9-], collapsed hyphens. */
export function normalizeHandle(raw: string): string {
 return raw
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "")
 .slice(0, 40);
}
