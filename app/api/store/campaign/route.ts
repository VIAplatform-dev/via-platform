import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listSubscribers, getAudienceBreakdown } from "@/app/lib/store-customers-db";
import { sendStoreCampaign, getStoreEmailBrand } from "@/app/lib/email";
import { maySendCampaign, allowanceLabel, monthStart } from "@/app/lib/email-limits";
import { countCampaignsSent, createScheduledCampaign } from "@/app/lib/store-campaigns-db";
import { getStoreTier } from "@/app/lib/store-plans-db";
import { resolveStoreSender } from "@/app/lib/email-settings-db";

export const dynamic = "force-dynamic";

// GET — the real recipient count (subscribed, unified) + a breakdown + reply-to, for the composer.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [breakdown, sender, tier, sentThisMonth] = await Promise.all([
 getAudienceBreakdown(slug).catch(() => ({ subscribers: 0, unsubscribed: 0, buyers: 0, imported: 0, total: 0 })),
 resolveStoreSender(slug),
 getStoreTier(slug).catch(() => null),
 countCampaignsSent(slug, monthStart()).catch(() => 0),
 ]);
 // Said BEFORE she writes. Finding out at the send button that the plan won't allow it wastes the
 // twenty minutes she just spent on the email.
 const verdict = maySendCampaign(tier, sentThisMonth);
 return NextResponse.json({
  ok: true,
  recipientCount: breakdown.subscribers, audience: breakdown,
  storeName: sender.fromName, storeEmail: sender.replyTo, verified: sender.verified,
  allowance: { label: allowanceLabel(tier, sentThisMonth), canSend: verdict.ok, reason: verdict.ok ? null : verdict.reason },
 });
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
 const common = { storeSlug: slug, storeName: fromName, storeEmail: replyTo, fromAddress, subject: String(body.subject).slice(0, 200), body: String(body.body).slice(0, 10000), link, brand };

 if (body.test) {
 const r = await sendStoreCampaign({ ...common, recipients: [replyTo] });
 return NextResponse.json({ ok: true, test: true, sentTo: replyTo, ...r });
 }

 // The real audience: subscribed contacts across imported + buyers, deduped — the same set the
 // composer counts, so what's shown is what sends (and unsubscribes are honored).
 const subs = await listSubscribers(slug).catch(() => []);
 // Plan check on the REAL send only — a test to yourself is not a campaign, and refusing it would
 // stop a seller checking her own email before she pays to send it.
 const [tier, sentThisMonth] = await Promise.all([
  getStoreTier(slug).catch(() => null),
  countCampaignsSent(slug, monthStart()).catch(() => 0),
 ]);
 const verdict = maySendCampaign(tier, sentThisMonth);
 if (!verdict.ok) return NextResponse.json({ error: verdict.reason, upgrade: verdict.upgrade }, { status: 402 });

 // Scheduled for later: stored and left for the cron, which sends it at the time she chose. The
 // plan check happens HERE rather than at send time — a store shouldn't queue six campaigns on a
 // plan that allows four and find out at midnight.
 if (body.scheduledAt) {
  const when = new Date(String(body.scheduledAt));
  if (!Number.isFinite(when.getTime())) return NextResponse.json({ error: "That date didn't make sense." }, { status: 400 });
  if (when.getTime() < Date.now() + 60_000) return NextResponse.json({ error: "Pick a time at least a minute from now." }, { status: 400 });
  const c = await createScheduledCampaign(slug, { subject: common.subject, body: common.body, link: link || null, scheduledAt: when });
  return NextResponse.json({ ok: true, scheduled: true, id: c.id, scheduledAt: when.toISOString() });
 }

 const recipients = [...new Set(subs.map((c) => c.email.toLowerCase().trim()).filter((e) => e.includes("@")))];
 if (recipients.length === 0) return NextResponse.json({ error: "No subscribers to send to yet — import a list in Customers, or wait for your first buyers." }, { status: 400 });

 const r = await sendStoreCampaign({ ...common, recipients });
 return NextResponse.json({ ok: true, recipients: recipients.length, ...r });
}
