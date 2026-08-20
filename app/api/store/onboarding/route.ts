import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { createStoreAccount, generateUniqueSlug, getStoreAccountByOwner } from "@/app/lib/store-accounts-db";
import { addStoreUser, storeSlugForEmail } from "@/app/lib/store-users-db";

export const dynamic = "force-dynamic";

// Create a self-onboarded store from the signup wizard. The caller must be signed in
// (magic link) — we take the owner email from the session, never the request body, so a
// store can't be created for someone else. Idempotent: a refresh/double-submit returns the
// store already made rather than creating a duplicate. Does its own auth (in PUBLIC_ROUTES).

const CATEGORIES = new Set(["vintage", "designer", "streetwear", "y2k", "denim", "workwear", "contemporary", "menswear", "womenswear", "accessories", "mixed"]);
const CHANNELS = new Set(["shopify", "square", "depop", "instagram", "in-person", "none"]);

export async function POST(request: NextRequest) {
 const session = await auth();
 const email = session?.user?.email?.trim().toLowerCase();
 if (!email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

 // Already attached to a store? Return it (idempotent) — never a second store for the same owner.
 const existingSlug = await storeSlugForEmail(email);
 if (existingSlug) return NextResponse.json({ ok: true, slug: existingSlug, existing: true });
 const existingAccount = await getStoreAccountByOwner(email);
 if (existingAccount) {
  await addStoreUser(existingAccount.slug, email, "owner");
  return NextResponse.json({ ok: true, slug: existingAccount.slug, existing: true });
 }

 const body = await request.json().catch(() => null);
 const name = String(body?.name || "").trim().slice(0, 80);
 if (name.length < 2) return NextResponse.json({ error: "Enter your store name." }, { status: 400 });

 const hasWebsite = body?.hasWebsite === true ? true : body?.hasWebsite === false ? false : null;
 let websiteUrl: string | null = null;
 if (hasWebsite && body?.websiteUrl) {
  const raw = String(body.websiteUrl).trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { websiteUrl = new URL(withScheme).toString(); } catch { websiteUrl = null; }
 }
 const sellsCategory = CATEGORIES.has(body?.sellsCategory) ? String(body.sellsCategory) : null;
 // The full multi-select (preset keys + any free-typed categories) — kept for pricing/category tuning.
 const sellsCategories = Array.isArray(body?.sellsCategories) ? body.sellsCategories.map((c: unknown) => String(c).slice(0, 40)).filter(Boolean).slice(0, 12) : [];
 const sellsChannel = CHANNELS.has(body?.sellsChannel) ? String(body.sellsChannel) : null;

 const slug = await generateUniqueSlug(name);
 await createStoreAccount({
  slug, name, ownerEmail: email, hasWebsite, websiteUrl, sellsCategory, sellsChannel,
  onboarding: { hasWebsite, websiteUrl, sellsCategory, sellsCategories, sellsChannel },
 });
 await addStoreUser(slug, email, "owner");

 // The 30-day trial starts now (store_accounts.created_at); payouts/going-live stay held
 // until they pick a paid tier (store_plans / isEntitled). hasWebsite tells the client
 // whether to route into import (paste URL → scrape) or the builder.
 return NextResponse.json({ ok: true, slug, hasWebsite, websiteUrl });
}
