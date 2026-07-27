import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listSubscribers, getAudienceBreakdown } from "@/app/lib/store-customers-db";
import { sendStoreCampaign, getStoreEmailBrand } from "@/app/lib/email";
import { resolveStoreSender } from "@/app/lib/email-settings-db";

export const dynamic = "force-dynamic";

// GET — the real recipient count (subscribed, unified) + a breakdown + reply-to, for the composer.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [breakdown, sender] = await Promise.all([
 getAudienceBreakdown(slug).catch(() => ({ subscribers: 0, unsubscribed: 0, buyers: 0, imported: 0, total: 0 })),
 resolveStoreSender(slug),
 ]);
 return NextResponse.json({ ok: true, recipientCount: breakdown.subscribers, audience: breakdown, storeName: sender.fromName, storeEmail: sender.replyTo, verified: sender.verified });
}

// POST — send a campaign. { subject, body, link?, test? }. test:true sends only to
// the store's own email so they can preview before blasting the list.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!body || !String(body.subject || "").trim() || !String(body.body || "").trim()) {
 return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
 }
 const { fromName, fromAddress, replyTo, website } = await resolveStoreSender(slug);
 if (!replyTo) return NextResponse.json({ error: "No store email on file — replies need somewhere to go. Add one in Email settings first." }, { status: 400 });

 const link = (String(body.link || "").trim() || website) || undefined;
 const brand = await getStoreEmailBrand(slug);
 const common = { storeName: fromName, storeEmail: replyTo, fromAddress, subject: String(body.subject).slice(0, 200), body: String(body.body).slice(0, 10000), link, brand };

 if (body.test) {
 const r = await sendStoreCampaign({ ...common, recipients: [replyTo] });
 return NextResponse.json({ ok: true, test: true, sentTo: replyTo, ...r });
 }

 // The real audience: subscribed contacts across imported + buyers, deduped — the same set the
 // composer counts, so what's shown is what sends (and unsubscribes are honored).
 const subs = await listSubscribers(slug).catch(() => []);
 const recipients = [...new Set(subs.map((c) => c.email.toLowerCase().trim()).filter((e) => e.includes("@")))];
 if (recipients.length === 0) return NextResponse.json({ error: "No subscribers to send to yet — import a list in Customers, or wait for your first buyers." }, { status: 400 });

 const r = await sendStoreCampaign({ ...common, recipients });
 return NextResponse.json({ ok: true, recipients: recipients.length, ...r });
}
