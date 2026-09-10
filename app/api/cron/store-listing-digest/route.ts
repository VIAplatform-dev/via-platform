import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { storeContactEmails } from "@/app/lib/stores";
import { getUnalertedFlaggedByStore, markListingsAlerted } from "@/app/lib/listing-quality-db";
import { sendStoreListingDigest } from "@/app/lib/email";
import { getNotificationPrefs } from "@/app/lib/notification-prefs-db";
import { emailEnabled } from "@/app/lib/notification-prefs-core";

// Weekly listing-quality email to each store partner. Each flagged listing is
// emailed ONCE — we only send newly-flagged listings (those not yet alerted),
// then mark them so stores aren't reminded about the same listing again.
export const maxDuration = 300;
const BASE_URL = getBaseUrl();

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 // Kill-switch: the weekly digest stays OFF until we explicitly enable it, so
 // stores don't get listing alerts before we're ready. Flip on by setting the
 // env var STORE_LISTING_DIGEST_ENABLED=1 in Vercel (no redeploy needed).
 if (process.env.STORE_LISTING_DIGEST_ENABLED !== "1") {
 return NextResponse.json({ skipped: true, reason: "STORE_LISTING_DIGEST_ENABLED not set — digest disabled" });
 }

 let sent = 0;
 let skipped = 0;
 let listingsAlerted = 0;
 const entries = Object.entries(storeContactEmails);
 for (let i = 0; i < entries.length; i++) {
 const [slug, email] = entries[i];
 if (!email) { skipped++; continue; }
 // Her own answer about being emailed. "Something needs you" is a switch on the Notifications
 // screen that nothing read — every store on the list got this digest whether it wanted it or not.
 const wants = await getNotificationPrefs(slug).then((p) => emailEnabled(p, "needs")).catch(() => true);
 if (!wants) { skipped++; continue; }
 try {
 // Only listings not yet alerted (new or never emailed).
 const { storeName, products: flagged } = await getUnalertedFlaggedByStore(slug);
 if (flagged.length === 0) { skipped++; continue; }

 const products = flagged.slice(0, 25).map((p) => ({
  title: p.title,
  url: `${BASE_URL}${p.url}`,
  flags: [
  p.noDescription ? "no description" : null,
  p.noSizing ? "no size or measurements" : null,
  p.noImage ? "no image" : null,
  ].filter(Boolean) as string[],
 }));

 await sendStoreListingDigest({
  email,
  storeName,
  flagged: flagged.length,
  counts: {
  noDescription: flagged.filter((p) => p.noDescription).length,
  noSizing: flagged.filter((p) => p.noSizing).length,
  noImage: flagged.filter((p) => p.noImage).length,
  },
  products,
  dashboardUrl: `${BASE_URL}/store/dashboard`,
 });

 // Mark every flagged listing we just told them about so it's never re-sent.
 await markListingsAlerted(flagged.map((p) => p.id));
 listingsAlerted += flagged.length;
 sent++;
 } catch (err) {
 console.error(`[store-listing-digest] failed for ${slug}:`, err);
 skipped++;
 }
 // Stay under Resend's rate limit.
 if ((i + 1) % 4 === 0) await new Promise((r) => setTimeout(r, 1000));
 }

 return NextResponse.json({ ok: true, sent, skipped, listingsAlerted });
}
