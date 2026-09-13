import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { getViewedItemCandidates, recordViewedItemReminderSent } from "@/app/lib/notification-db";
import { sendViewedItemReminderEmail } from "@/app/lib/email";
import { getPushTokensForUser } from "@/app/lib/saved-searches-db";
import { sendExpoPush } from "@/app/lib/push";
import { viewedItemPush } from "@/app/lib/shopper-push-core";

const BASE_URL = getBaseUrl();

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const byUser = await getViewedItemCandidates();
    let sent = 0;
    let skipped = 0;

    for (const [userId, { email, items }] of byUser) {
      try {
        await sendViewedItemReminderEmail(
          email,
          items.map((item) => ({
            productTitle: item.product_title,
            productImage: item.product_image,
            storeName: item.store_name,
            productUrl: `${BASE_URL}/products/${item.store_slug}-${item.product_id}?utm_source=email&utm_medium=email&utm_campaign=viewed_item_reminder`,
            price: item.price,
            currency: item.currency,
          })),
        );
        // AND the phone. Every one of these reminders was email-only, which meant the app
        // existed but was never the thing that told her. Push is an addition: the email still
        // sends, because a push is gone the moment it is swiped and an inbox is not.
        /* allow-swallow: push is a courtesy; never fail an email that already went */
        await pushAlso(userId, items.map((i) => ({ id: i.product_id, name: i.product_title })));
        await recordViewedItemReminderSent(userId, items.map((i) => i.product_id));
        sent++;
      } catch (err) {
        console.error(`Viewed item reminder failed for ${email}:`, err);
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, users: byUser.size, sent, skipped });
  } catch (err) {
    console.error("Viewed item reminder cron error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Buzz this person's phones with the same news the email carried. Never throws. */
async function pushAlso(userId: string, items: { id: number; name: string | null }[]): Promise<void> {
  try {
    const payload = viewedItemPush(items);
    if (!payload) return;
    const tokens = await getPushTokensForUser(userId);
    if (tokens.length) await sendExpoPush(tokens, payload);
  } catch {
    /* allow-swallow: a push failure must not undo a sent email */
  }
}
