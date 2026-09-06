import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { createStoreAccount, generateUniqueSlug, getStoreAccountByOwner } from "@/app/lib/store-accounts-db";
import { addStoreUser, storeSlugForEmail } from "@/app/lib/store-users-db";
import { getOrCreateSeller } from "@/app/lib/db/sellers";
import { mayOpenStore, chooseStoreSlug, NOT_INVITED_MESSAGE } from "@/app/lib/seller-access";
import { isInvited, markInviteUsed, reservedStoreFor } from "@/app/lib/seller-invites-db";
import { hasCaptures } from "@/app/lib/site-capture-db";
import { logActivity } from "@/app/lib/seller-activity-db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Create a self-onboarded store from the signup wizard. The caller must be signed in
// (magic link) — we take the owner email from the session, never the request body, so a
// store can't be created for someone else. Idempotent: a refresh/double-submit returns the
// store already made rather than creating a duplicate. Does its own auth (in PUBLIC_ROUTES).

const CATEGORIES = new Set(["vintage", "designer", "streetwear", "y2k", "denim", "workwear", "contemporary", "menswear", "womenswear", "accessories", "mixed"]);
const CHANNELS = new Set(["shopify", "square", "depop", "instagram", "in-person", "none"]);

export async function POST(request: NextRequest) {
 // A seller's own session, and nothing else. The owner's admin cookie is not a store identity —
 // a store needs an email to attach, and there is no sensible one to invent. Anyone reaching this
 // without a seller session is sent to sign in BEFORE the wizard, not after they've filled it in.
 const session = await auth();
 const email = session?.user?.email?.trim().toLowerCase();
 if (!email) return NextResponse.json({ error: "Sign in to create your store.", needsSignIn: true }, { status: 401 });

 const body = await request.json().catch(() => null);

 // Already attached to a store? Return it (idempotent) — never a second store for the same owner.
 const existingSlug = await storeSlugForEmail(email);
 if (existingSlug) return NextResponse.json({ ok: true, slug: existingSlug, existing: true });
 const existingAccount = await getStoreAccountByOwner(email);
 if (existingAccount) {
  await addStoreUser(existingAccount.slug, email, "owner");
  return NextResponse.json({ ok: true, slug: existingAccount.slug, existing: true });
 }

 // VYA is invite-only. Checked AFTER the "already has a store" paths above, so that removing an
 // invite can never lock an existing seller out of a shop she's been running.
 const adminPw = process.env.ADMIN_PASSWORD;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 const isVyaOwner = Boolean(adminPw && adminToken && adminToken === crypto.createHash("sha256").update(adminPw).digest("hex"));
 const decision = mayOpenStore({ email, invited: await isInvited(email), isVyaOwner });
 if (!decision.ok) {
  return NextResponse.json({ error: NOT_INVITED_MESSAGE, notInvited: true }, { status: 403 });
 }

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

 // A store we imported for her ahead of time, handed over only if she says she HAS a website.
 //
 // She still chooses. Pick "import my store" and the pieces are already there; pick "from scratch"
 // and she gets a clean shop, with the imported one left untouched for another day. Forcing the
 // seed on someone who chose to start fresh would be answering a question she just answered.
 const reserved = await reservedStoreFor(email);
 const { slug, seeded } = chooseStoreSlug({ reserved, generated: await generateUniqueSlug(name), hasWebsite });
 await createStoreAccount({
  slug, name, ownerEmail: email, hasWebsite, websiteUrl, sellsCategory, sellsChannel,
  onboarding: { hasWebsite, websiteUrl, sellsCategory, sellsCategories, sellsChannel },
 });
 await addStoreUser(slug, email, "owner");
 void markInviteUsed(email);
 // The moment worth knowing about: whether she took the shop we'd built or started her own.
 logActivity({ storeSlug: slug, email, kind: seeded ? "store-claimed" : "store-created", detail: name });
 // And a seller row, now rather than on her first write.
 //
 // Everything downstream keys off seller.id — inventory, orders, every analytics metric — and it
 // was created lazily by whichever write happened first: an import, a market session, a publish.
 // A store that had signed up and not yet listed anything therefore had no identity to key off, so
 // her Analytics answered 404 and the page said "Analytics unavailable. Try refreshing." That is a
 // seller's first look at the screen meant to convince her to stay, on the one day she has no data
 // and most needs to see what she is going to get.
 await getOrCreateSeller(slug, name, email).catch(() => null); /* allow-swallow: additive — the store is created either way, and the lazy path still creates this on first write */

 // The 30-day trial starts now (store_accounts.created_at); payouts/going-live stay held
 // until they pick a paid tier (store_plans / isEntitled). hasWebsite tells the client
 // whether to route into import (paste URL → scrape) or the builder.
 // `seeded` tells the client her pieces are already in — so it can send her to inventory rather
 // than to a "paste your website" step that would re-import what she already has.
 // A seeded store may ALSO have had its site captured ahead of time — pages, theme, the lot. When
 // it has, there is nothing left to import and re-scraping would only rebuild what's already live.
 // When it hasn't, she has her pieces but a stock storefront, and the capture still has to run.
 const alreadyCaptured = seeded ? await hasCaptures(slug).catch(() => false) : false;
 return NextResponse.json({ ok: true, slug, hasWebsite, websiteUrl, seeded, alreadyCaptured });
}
