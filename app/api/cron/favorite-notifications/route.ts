import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import {
 getFavoriteNotificationCandidates,
 recordNotificationSent,
} from "@/app/lib/notification-db";
import { sendFavoriteActivityNotification, type FavoriteActivityProduct } from "@/app/lib/email";
import { getPushTokensForUser } from "@/app/lib/saved-searches-db";
import { sendExpoPush } from "@/app/lib/push";
import { favoritePush } from "@/app/lib/shopper-push-core";

const MAX_ITEMS_PER_EMAIL = 3;
const BASE_URL = getBaseUrl();

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;

 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const candidates = await getFavoriteNotificationCandidates();

 // Group all qualifying products by user. One email per user, never one per product
 const byUser = new Map<string, typeof candidates>();
 for (const c of candidates) {
 const existing = byUser.get(c.user_id) ?? [];
 existing.push(c);
 byUser.set(c.user_id, existing);
 }

 let sent = 0;
 let skipped = 0;

 for (const [userId, items] of byUser) {
 // Sort by click count desc so the hottest items lead the email
 items.sort((a, b) => b.recent_click_count - a.recent_click_count);

 // Show top MAX_ITEMS_PER_EMAIL; mark ALL as sent so they don't re-queue
 const toShow = items.slice(0, MAX_ITEMS_PER_EMAIL);
 const email = items[0].email;

 const products: FavoriteActivityProduct[] = toShow.map((c) => ({
 title: c.product_title,
 image: c.product_image,
 storeName: c.store_name,
 productUrl: `${BASE_URL}/products/${c.store_slug}-${c.product_id}?utm_source=email&utm_medium=email&utm_campaign=favorite_notification`,
 price: c.price,
 currency: c.currency,
 clickCount: c.recent_click_count,
 }));

 try {
 await sendFavoriteActivityNotification(email, products);
 await pushAlso(userId, toShow.map((c) => ({ id: c.product_id, name: c.product_title })));
 // Record every qualifying item as sent (including ones beyond the display cap)
 await Promise.all(
 items.map((c) => recordNotificationSent(userId, c.product_id, c.recent_click_count))
 );
 sent++;
 } catch (err) {
 console.error(`Failed to send notification to ${email}:`, err);
 skipped++;
 }
 }

 return NextResponse.json({
 ok: true,
 candidates: candidates.length,
 usersNotified: sent,
 skipped,
 });
 } catch (err) {
 console.error("Favorite notifications cron error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}

/** Buzz this person's phones. Never throws: a push failure must not undo a sent email. */
async function pushAlso(userId: string, items: { id: number; name: string | null }[]): Promise<void> {
  try {
    const payload = favoritePush(items);
    if (!payload) return;
    const tokens = await getPushTokensForUser(userId);
    if (tokens.length) await sendExpoPush(tokens, payload);
  } catch {
    /* allow-swallow */
  }
}
