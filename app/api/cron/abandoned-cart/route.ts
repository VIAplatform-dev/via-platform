import { NextResponse } from "next/server";
import { getBaseUrl } from "@/app/lib/base-url";
import { getAbandonedCartItems, markAbandonedCartEmailSentForUser } from "@/app/lib/cart-db";
import { sendAbandonedCartEmail } from "@/app/lib/email";
import { getPushTokensForUser } from "@/app/lib/saved-searches-db";
import { sendExpoPush } from "@/app/lib/push";
import { abandonedCartPush } from "@/app/lib/shopper-push-core";

const BASE_URL = getBaseUrl();

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const items = await getAbandonedCartItems();

 // Group items by user so we send one email per user with all their cart items
 const byUser = new Map<string, { email: string; items: typeof items }>();
 for (const item of items) {
 if (!byUser.has(item.user_id)) {
 byUser.set(item.user_id, { email: item.email, items: [] });
 }
 byUser.get(item.user_id)!.items.push(item);
 }

 let sent = 0;
 let skipped = 0;

 for (const [userId, { email, items: userItems }] of byUser) {
 try {
 await sendAbandonedCartEmail(
 email,
 userItems.map((item) => ({
 productTitle: item.product_title,
 productImage: item.product_image,
 storeName: item.store_name,
 productUrl: `${BASE_URL}/products/${item.store_slug}-${item.product_id}?utm_source=email&utm_medium=email&utm_campaign=abandoned_cart`,
 price: item.price,
 currency: item.currency,
 })),
 );
 await pushAlso(userId, userItems.map((i) => ({ id: i.product_id, name: i.product_title })));
 await markAbandonedCartEmailSentForUser(userId);
 sent++;
 } catch (err) {
 console.error(`Abandoned cart email failed for ${email}:`, err);
 skipped++;
 }
 }

 return NextResponse.json({ ok: true, candidates: items.length, usersEmailed: sent, skipped });
 } catch (err) {
 console.error("Abandoned cart cron error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}

/** Buzz this person's phones with the same news the email carried. Never throws: a push failure
 *  must not undo a sent email, and the bag is still there either way. */
async function pushAlso(userId: string, items: { id: number; name: string | null }[]): Promise<void> {
  try {
    const payload = abandonedCartPush(items);
    if (!payload) return;
    const tokens = await getPushTokensForUser(userId);
    if (tokens.length) await sendExpoPush(tokens, payload);
  } catch {
    /* allow-swallow */
  }
}
