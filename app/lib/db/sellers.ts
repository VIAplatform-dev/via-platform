import { eq } from "drizzle-orm";
import { isPlaceholderName } from "../store-display-name";
import { getDb, sellers } from "./index";
import type { Seller } from "./index";

// Bridge from the current slug-based auth to the new sellers table: ensure a
// seller row exists for a store slug (created lazily on first write). Replaces
// the hardcoded stores.ts as the source of truth as the platform takes over.
export async function getOrCreateSeller(slug: string, name: string, email: string): Promise<Seller> {
 const db = getDb();
 await db.insert(sellers).values({ slug, name, email }).onConflictDoNothing({ target: sellers.slug });
 const [row] = await db.select().from(sellers).where(eq(sellers.slug, slug)).limit(1);
 return row;
}

export async function getSellerBySlug(slug: string): Promise<Seller | null> {
 const db = getDb();
 const [row] = await db.select().from(sellers).where(eq(sellers.slug, slug)).limit(1);
 return row ?? null;
}

export async function getSellerById(id: string): Promise<Seller | null> {
 const db = getDb();
 const [row] = await db.select().from(sellers).where(eq(sellers.id, id)).limit(1);
 return row ?? null;
}

/**
 * Give a store its real name, if it is still going by its slug.
 *
 * Only ever replaces a PLACEHOLDER (empty, or the slug itself). A name a human typed — in the
 * portal, or in stores.ts — outranks anything the importer reads off a homepage, so it is never
 * overwritten by a later re-import. See store-display-name.ts.
 */
export async function setSellerNameIfPlaceholder(slug: string, name: string): Promise<boolean> {
 const proposed = (name || "").trim();
 if (!proposed || isPlaceholderName(proposed, slug)) return false;
 const current = await getSellerBySlug(slug);
 if (!current || !isPlaceholderName(current.name, slug)) return false;
 await getDb().update(sellers).set({ name: proposed }).where(eq(sellers.slug, slug));
 return true;
}
