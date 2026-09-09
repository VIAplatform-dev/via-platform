import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listSubscribers, getAudienceBreakdown, listCustomerTags, listSoldCategories } from "@/app/lib/store-customers-db";
import { parseAudience, audienceIsEmpty, type AudienceFilter } from "@/app/lib/customer-audience-core";
import { sendStoreCampaign, getStoreEmailBrand } from "@/app/lib/email";
import { campaignRenderer, parseCampaignDesign } from "@/app/lib/campaign-email";
import { maySendCampaign, allowanceLabel, monthStart } from "@/app/lib/email-limits";
import { countCampaignsSent, createScheduledCampaign, encodeAudience } from "@/app/lib/store-campaigns-db";
import { getStoreTier } from "@/app/lib/store-plans-db";
import { resolveStoreSender } from "@/app/lib/email-settings-db";

export const dynamic = "force-dynamic";

// The audience a request names: ?tag=a,b&spentOver=50&category=bags&notOrderedInDays=90 on GET,
// `audience` on POST. Both ends must carry every field, or the count on the button and the set that
// actually sends drift apart.
function audienceFrom(q: URLSearchParams): AudienceFilter {
 return parseAudience({ tag: q.get("tag"), spentOver: q.get("spentOver"), category: q.get("category"), notOrderedInDays: q.get("notOrderedInDays") });
}
function audienceFromBody(v: unknown): AudienceFilter {
 const a = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
 return {
  tags: Array.isArray(a.tags) ? a.tags.filter((t): t is string => typeof t === "string") : [],
  spentOverCents: typeof a.spentOverCents === "number" && a.spentOverCents >= 0 ? Math.round(a.spentOverCents) : null,
  category: typeof a.category === "string" && a.category.trim() ? a.category.trim() : null,
  notOrderedInDays: typeof a.notOrderedInDays === "number" && a.notOrderedInDays > 0 ? Math.round(a.notOrderedInDays) : null,
 };
}

// GET — the real recipient count (subscribed, unified) + a breakdown + reply-to, for the composer.
// With an audience in the query, `recipientCount` is that audience's count — the number that sends.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const audience = audienceFrom(request.nextUrl.searchParams);
 const [breakdown, sender, tier, sentThisMonth, tags, categories, audienceSubs] = await Promise.all([
 getAudienceBreakdown(slug).catch(() => ({ subscribers: 0, unsubscribed: 0, buyers: 0, imported: 0, total: 0 })),
 resolveStoreSender(slug),
 getStoreTier(slug).catch(() => null),
 countCampaignsSent(slug, monthStart()).catch(() => 0),
 listCustomerTags(slug).catch(() => []),
 listSoldCategories(slug).catch(() => []),
 audienceIsEmpty(audience) ? Promise.resolve(null) : listSubscribers(slug, audience).catch(() => []),
 ]);
 // Said BEFORE she writes. Finding out at the send button that the plan won't allow it wastes the
 // twenty minutes she just spent on the email.
 const verdict = maySendCampaign(tier, sentThisMonth);
 return NextResponse.json({
  ok: true,
  recipientCount: audienceSubs ? audienceSubs.length : breakdown.subscribers, audience: breakdown,
  // What the audience picker offers: every tag in use, every category sold.
  tags, categories,
  storeName: sender.fromName, storeEmail: sender.replyTo, verified: sender.verified,
  allowance: { label: allowanceLabel(tier, sentThisMonth), canSend: verdict.ok, reason: verdict.ok ? null : verdict.reason },
 });
}

// POST — send a campaign. { subject, body, link?, test?, design? }. test:true sends only to the
// store's own email so they can check it before blasting the list.
//
// `design` is the composer's full layout, and it is what actually gets rendered — the same builder
// the preview uses (campaign-email.ts). Without it (the assistant, an older client) this falls back
// to the plain headline-and-link email, which is what every campaign used to be regardless of what
// the seller had laid out on screen.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 if (!body || !String(body.subject || "").trim() || !String(body.body || "").trim()) {
 return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
 }
 const { fromName, fromAddress, replyTo, website } = await resolveStoreSender(slug);
 if (!replyTo) return NextResponse.json({ error: "No store email on file — replies need somewhere to go. Add one in Email settings first." }, { status: 400 });

 const audience = audienceFromBody(body.audience);
 const link = (String(body.link || "").trim() || website) || undefined;
 const brand = await getStoreEmailBrand(slug);
 const common = { storeSlug: slug, storeName: fromName, storeEmail: replyTo, fromAddress, subject: String(body.subject).slice(0, 200), body: String(body.body).slice(0, 10000), link, brand };

 // The layout the seller built. Resolved once — pieces, brand, links — and reused for every
 // recipient in the batch.
 const design = body.design ? parseCampaignDesign(body.design) : null;
 const renderHtml = design ? (await campaignRenderer(slug, design, { fallbackLink: link })).render : undefined;

 if (body.test) {
 const r = await sendStoreCampaign({ ...common, recipients: [replyTo], renderHtml });
 return NextResponse.json({ ok: true, test: true, sentTo: replyTo, ...r });
 }

 // The real audience: subscribed contacts across imported + buyers, deduped — the same set the
 // composer counts, so what's shown is what sends (and unsubscribes are honored).
 const subs = await listSubscribers(slug, audience).catch(() => []);
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
  // The design goes in with it, so the cron sends what she laid out rather than a plain fallback
  // hours later, when she is not there to notice the difference.
  const c = await createScheduledCampaign(slug, { subject: common.subject, body: common.body, link: link || null, segment: encodeAudience(audience), scheduledAt: when, design });
  return NextResponse.json({ ok: true, scheduled: true, id: c.id, scheduledAt: when.toISOString() });
 }

 const recipients = [...new Set(subs.map((c) => c.email.toLowerCase().trim()).filter((e) => e.includes("@")))];
 if (recipients.length === 0) return NextResponse.json({ error: audienceIsEmpty(audience) ? "No subscribers to send to yet — import a list in Customers, or wait for your first buyers." : "Nobody matches that audience yet." }, { status: 400 });

 const r = await sendStoreCampaign({ ...common, recipients, renderHtml });
 return NextResponse.json({ ok: true, recipients: recipients.length, ...r });
}
