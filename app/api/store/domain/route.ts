import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import {
 getStorefrontBySlug,
 setCustomDomain,
 isDomainTaken,
 upsertStorefront,
} from "@/app/lib/storefront-db";
import { addDomain, removeDomain, getDomainStatus, verifyDomain, domainsConfigured, checkAvailability, getDomainPrice, buyDomain, type DomainContact } from "@/app/lib/vercel-domains";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { stripePost } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

/** Strip protocol/path/port and validate as a bare domain. */
function normalizeDomain(raw: string): string | null {
 let d = String(raw || "").trim().toLowerCase();
 d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
 if (!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) return null;
 return d;
}

// GET — the acting store's connected domain + live verification/DNS status.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const sf = await getStorefrontBySlug(slug);
 const domain = sf?.customDomain || null;
 const status = domain ? await getDomainStatus(domain) : null;
 return NextResponse.json({ ok: true, configured: domainsConfigured(), domain, status });
}

// POST — connect a domain (add to Vercel project + save), or re-check verification.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 if (!domainsConfigured()) {
 return NextResponse.json({ error: "Custom domains aren’t enabled on the server yet." }, { status: 503 });
 }

 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

 // ?action=verify just re-checks the existing domain.
 if (body.action === "verify") {
 const sf = await getStorefrontBySlug(slug);
 if (!sf?.customDomain) return NextResponse.json({ error: "No domain connected." }, { status: 400 });
 await verifyDomain(sf.customDomain);
 const status = await getDomainStatus(sf.customDomain);
 return NextResponse.json({ ok: true, domain: sf.customDomain, status });
 }

 // ?action=search — is a domain available to register, and what does it cost?
 if (body.action === "search") {
 const domain = normalizeDomain(body.domain);
 if (!domain) return NextResponse.json({ error: "Enter a valid domain, e.g. yourbrand.com" }, { status: 400 });
 const { available } = await checkAvailability(domain);
 const price = available ? await getDomainPrice(domain) : null;
 const taken = await isDomainTaken(domain, slug);
 return NextResponse.json({ ok: true, domain, available: available && !taken, priceCents: price?.priceCents ?? null });
 }

 // ?action=buy — register a domain through VYA: charge the seller's card, buy it via
 // Vercel's registrar, then connect it. Needs the registrant's contact info.
 if (body.action === "buy") {
 const domain = normalizeDomain(body.domain);
 if (!domain) return NextResponse.json({ error: "Invalid domain." }, { status: 400 });
 const c = body.contact || {};
 const required = ["firstName", "lastName", "email", "phone", "address1", "city", "state", "zip", "country"];
 for (const k of required) if (!String(c[k] || "").trim()) return NextResponse.json({ error: "Fill in all the contact fields (used to register the domain)." }, { status: 400 });
 const contact: DomainContact = { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, address1: c.address1, city: c.city, state: c.state, zip: c.zip, country: String(c.country).toUpperCase().slice(0, 2) };

 const price = await getDomainPrice(domain);
 if (!price) return NextResponse.json({ error: "That domain isn’t available to register." }, { status: 400 });

 const seller = await getSellerBySlug(slug);
 if (!seller?.stripeCustomerId) return NextResponse.json({ error: "Add a payment method in Payments first, then buy your domain." }, { status: 400 });

 // Charge the seller (VYA's Vercel account funds the actual registration).
 let charge: { id?: string } | null = null;
 try {
 // Idempotency key stops a double-click from charging twice for the same domain.
 charge = await stripePost("payment_intents", { amount: String(price.priceCents), currency: "usd", customer: seller.stripeCustomerId, confirm: "true", off_session: "true", description: `VYA domain — ${domain}` }, undefined, `domain-${slug}-${domain}`) as { id?: string };
 } catch {
 return NextResponse.json({ error: "Your card couldn’t be charged — check your payment method in Payments." }, { status: 402 });
 }

 const bought = await buyDomain(domain, price.priceCents / 100, contact);
 if (!bought.ok) {
 // Charged but registration failed → refund, and only SAY "refunded" if the refund actually went through.
 let refunded = false;
 if (charge?.id) refunded = await stripePost("refunds", { payment_intent: charge.id }, undefined, `domain-refund-${charge.id}`).then(() => true).catch(() => false);
 return NextResponse.json({ error: `${bought.error || "Couldn’t register the domain."} ${refunded ? "You were refunded." : "We couldn’t auto-refund — contact support and we’ll refund you right away."}` }, { status: 502 });
 }

 await addDomain(domain).catch(() => {});
 await setCustomDomain(slug, domain);
 const status = await getDomainStatus(domain);
 return NextResponse.json({ ok: true, domain, status, bought: true, priceCents: price.priceCents });
 }

 const domain = normalizeDomain(body.domain);
 if (!domain) return NextResponse.json({ error: "Enter a valid domain, e.g. shop.yourbrand.com" }, { status: 400 });
 if (await isDomainTaken(domain, slug)) {
 return NextResponse.json({ error: "That domain is already connected to another store." }, { status: 409 });
 }

 // A storefront row must exist before we attach a domain to it.
 const existing = await getStorefrontBySlug(slug);
 if (!existing) {
 await upsertStorefront(slug, { handle: slug, enabled: false, tagline: null, accentColor: "#5D0F17", heroImage: null, about: null });
 }

 const added = await addDomain(domain);
 if (!added.ok) return NextResponse.json({ error: added.error || "Couldn’t add the domain." }, { status: 502 });

 await setCustomDomain(slug, domain);
 const status = await getDomainStatus(domain);
 return NextResponse.json({ ok: true, domain, status });
}

// DELETE — disconnect the domain (remove from Vercel + clear it).
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const sf = await getStorefrontBySlug(slug);
 if (sf?.customDomain) await removeDomain(sf.customDomain);
 await setCustomDomain(slug, null);
 return NextResponse.json({ ok: true });
}
