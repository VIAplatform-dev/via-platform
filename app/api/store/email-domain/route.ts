import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getEmailSettings, upsertEmailSettings, resolveStoreSender } from "@/app/lib/email-settings-db";
import { auth } from "@/app/lib/auth";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";

export const dynamic = "force-dynamic";

function resend() {
 const key = process.env.RESEND_API_KEY;
 return key ? new Resend(key) : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// GET — current sender + domain status (DNS records, verified), plus sensible defaults to
// pre-fill: the email the store signed into VYA with (reply-to), and the storefront's own
// custom domain (domain authentication) so they don't have to retype what VYA already knows.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [settings, sender, session, sf] = await Promise.all([
 getEmailSettings(slug),
 resolveStoreSender(slug),
 auth().catch(() => null),
 getStorefrontBySlug(slug).catch(() => null),
 ]);
 const accountEmail = session?.user?.email || null; // what they signed in with
 const storefrontDomain = sf?.customDomain || null; // domain added during storefront setup
 return NextResponse.json({ ok: true, sender, settings, accountEmail, storefrontDomain });
}

// PATCH { fromName?, replyTo?, sendingEmail? } — the store's display name + reply-to,
// and (once the domain is verified) which address to send from.
export async function PATCH(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const patch: any = {};
 if (typeof b?.fromName === "string") patch.fromName = b.fromName.trim().slice(0, 80) || null;
 if (typeof b?.replyTo === "string") patch.replyTo = b.replyTo.trim().slice(0, 160) || null;
 if (typeof b?.sendingEmail === "string") {
 const cur = await getEmailSettings(slug);
 const email = b.sendingEmail.trim().toLowerCase();
 // A custom sending address must live on the store's verified domain.
 if (email && cur?.verified && cur.domain && email.endsWith(`@${cur.domain}`)) patch.sendingEmail = email;
 else if (email) return NextResponse.json({ error: `The sending address must end in @${cur?.domain || "your verified domain"}.` }, { status: 400 });
 }
 await upsertEmailSettings(slug, patch);
 return NextResponse.json({ ok: true, sender: await resolveStoreSender(slug), settings: await getEmailSettings(slug) });
}

// POST { domain } — start authenticating a domain (creates it in Resend, returns the
// DNS records to add). POST { action: "verify" } — re-check verification.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const r = resend();
 if (!r) return NextResponse.json({ error: "Email domains aren’t configured on the server yet." }, { status: 503 });
 const b = await request.json().catch(() => ({}));

 if (b?.action === "verify") {
 const s = await getEmailSettings(slug);
 if (!s?.resendDomainId) return NextResponse.json({ error: "Add a domain first." }, { status: 400 });
 try {
 await r.domains.verify(s.resendDomainId).catch(() => {});
 const got: any = await r.domains.get(s.resendDomainId);
 const status = got?.data?.status || got?.status;
 const records = got?.data?.records || got?.records || s.dnsRecords;
 const verified = status === "verified";
 const sendingEmail = verified ? (s.sendingEmail || `hello@${s.domain}`) : s.sendingEmail;
 await upsertEmailSettings(slug, { verified, sendingEmail, dnsRecords: records });
 return NextResponse.json({ ok: true, status, verified, settings: await getEmailSettings(slug), sender: await resolveStoreSender(slug) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Verification failed." }, { status: 502 });
 }
 }

 const domain = String(b?.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
 if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return NextResponse.json({ error: "Enter a valid domain, e.g. yourstore.com" }, { status: 400 });
 try {
 const created: any = await r.domains.create({ name: domain });
 const id = created?.data?.id || created?.id;
 const records = created?.data?.records || created?.records || [];
 if (!id) return NextResponse.json({ error: created?.error?.message || "Couldn’t create the domain." }, { status: 502 });
 await upsertEmailSettings(slug, { domain, resendDomainId: id, dnsRecords: records, verified: false, sendingEmail: `hello@${domain}` });
 return NextResponse.json({ ok: true, domain, records, settings: await getEmailSettings(slug) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn’t create the domain." }, { status: 502 });
 }
}
