import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import {
 getStorefrontBySlug,
 setCustomDomain,
 isDomainTaken,
 upsertStorefront,
} from "@/app/lib/storefront-db";
import { addDomain, removeDomain, getDomainStatus, verifyDomain, domainsConfigured, checkAvailability, getDomainPrice, buyDomain, searchDomains, getDomainInfo, listDnsRecords, createDnsRecord, deleteDnsRecord, requestTransferOut, MX_PRESETS, type DomainContact } from "@/app/lib/vercel-domains";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { stripePost } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Domains VYA runs itself. A seller connecting one of these would put a store's
 * storefront behind the marketplace's own name, and — worse — DISCONNECTING it
 * removes the domain from the Vercel project, which takes the live site down.
 * Subdomains are covered too, since {handle}.vyaplatform.com is how free store
 * addresses already work.
 */
const RESERVED_DOMAINS = ["vyaplatform.com", "getvya.ai", "vyasites.com", "vyasites.test", "vercel.app", "localhost"];

function isReservedDomain(domain: string): boolean {
 const d = domain.toLowerCase().replace(/^www\./, "");
 return RESERVED_DOMAINS.some((r) => d === r || d.endsWith(`.${r}`));
}

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
 const [status, info] = await Promise.all([
 domain ? getDomainStatus(domain) : Promise.resolve(null),
 domain ? getDomainInfo(domain).catch(() => null) : Promise.resolve(null),
 ]);
 // The zone is only ours to show when Vercel runs the nameservers — otherwise the
 // seller's records live at their own registrar and listing an empty zone here
 // would read as "you have no DNS", which is wrong and alarming.
 const records = domain && info?.managed ? await listDnsRecords(domain).catch(() => []) : [];
 return NextResponse.json({ ok: true, configured: domainsConfigured(), domain, status, info, records, mxPresets: MX_PRESETS });
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

 // ?action=transfer-out — the seller is moving the domain to another registrar.
 // They bought it, so they get to leave with it; this returns the auth code the
 // receiving registrar asks for. The storefront keeps serving until the transfer
 // completes on their side, so nothing goes dark in the meantime.
 if (body.action === "transfer-out") {
 const sf = await getStorefrontBySlug(slug);
 const domain = sf?.customDomain;
 if (!domain) return NextResponse.json({ error: "No domain connected." }, { status: 400 });
 const info = await getDomainInfo(domain).catch(() => null);
 if (!info?.boughtThroughUs) {
  return NextResponse.json({ error: "This domain is already at your own registrar — there's nothing to transfer." }, { status: 400 });
 }
 const res = await requestTransferOut(domain);
 if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
 return NextResponse.json({ ok: true, authCode: res.authCode ?? null, note: res.error ?? null });
 }

 // ?action=dns-add / dns-remove — edit the zone of a domain we registered, so a
 // seller can add email, verify their domain with Instagram, or point a subdomain
 // elsewhere. Records that keep the storefront reachable are refused (see
 // deleteDnsRecord) rather than hidden, so nobody takes their own shop offline.
 if (body.action === "dns-add" || body.action === "dns-remove") {
 const sf = await getStorefrontBySlug(slug);
 const domain = sf?.customDomain;
 if (!domain) return NextResponse.json({ error: "Connect a domain first." }, { status: 400 });
 const info = await getDomainInfo(domain).catch(() => null);
 if (!info?.managed) {
  return NextResponse.json({ error: "This domain's DNS is managed at your own registrar — add the record there." }, { status: 400 });
 }

 if (body.action === "dns-remove") {
  const res = await deleteDnsRecord(domain, String(body.recordId || ""));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, records: await listDnsRecords(domain) });
 }

 // A preset expands to several records; otherwise it's the one they typed.
 const preset = body.preset ? MX_PRESETS[String(body.preset)] : null;
 const toAdd = preset
  ? preset.records
  : [{ type: String(body.type || "").toUpperCase(), name: String(body.name ?? "@"), value: String(body.value ?? ""), mxPriority: Number(body.mxPriority) || 10 }];

 for (const r of toAdd) {
  if (!r.type || !r.value) return NextResponse.json({ error: "A record needs a type and a value." }, { status: 400 });
  const res = await createDnsRecord(domain, r);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
 }
 return NextResponse.json({ ok: true, records: await listDnsRecords(domain) });
 }

 // ?action=suggest — a name in, every TLD we sell it under, with prices. This is
 // what a seller actually wants: they type "vintagestore" and see whether the .com
 // is free before settling for anything else.
 if (body.action === "suggest") {
 const options = await searchDomains(String(body.name || body.domain || ""));
 if (!options.length) return NextResponse.json({ ok: true, options: [] });
 // A domain another VYA store already connected isn't available to this one,
 // however free the registrar says it is.
 const checked = await Promise.all(options.map(async (o) => ({
  ...o,
  available: o.available && !(await isDomainTaken(o.domain, slug).catch(() => false)),
 })));
 return NextResponse.json({ ok: true, options: checked });
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
 if (isReservedDomain(domain)) return NextResponse.json({ error: "That's a VYA address — pick a different domain." }, { status: 400 });
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
 if (isReservedDomain(domain)) {
 return NextResponse.json({ error: "That's a VYA address — connect a domain you own instead." }, { status: 400 });
 }
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
 // Clear the record either way, but NEVER hand a VYA-owned domain to
 // removeDomain — that deletes it from the Vercel project and takes the live
 // site down with it. One of these got saved during testing; this makes the
 // cleanup safe rather than catastrophic.
 if (sf?.customDomain && !isReservedDomain(sf.customDomain)) await removeDomain(sf.customDomain);
 await setCustomDomain(slug, null);
 return NextResponse.json({ ok: true });
}
