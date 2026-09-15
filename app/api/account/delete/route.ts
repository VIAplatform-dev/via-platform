import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/app/lib/auth";

function getDatabaseUrl() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL not set");
 return url;
}

export async function DELETE() {
 const session = await auth();
 if (!session?.user?.id) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const userId = session.user.id;
 const sql = neon(getDatabaseUrl());

 // Cancel Stripe subscription if they are a VYA Insider member
 const userRows = await sql`
 SELECT stripe_subscription_id, email FROM users WHERE id = ${userId} LIMIT 1
 `;
 const stripeSubscriptionId = userRows[0]?.stripe_subscription_id as string | null;
 if (stripeSubscriptionId) {
 const stripeKey = process.env.STRIPE_SECRET_KEY;
 if (stripeKey) {
 await fetch(`https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${stripeKey}` },
 }).catch(() => {}); // best-effort: don't block account deletion if Stripe fails
 }
 }

 // Delete from all tables that reference this user
 // Order matters: leaf tables first, then the user row
 await sql`DELETE FROM favorite_notifications WHERE user_id = ${userId}`;
 await sql`DELETE FROM friend_activity WHERE user_id = ${userId}`;
 await sql`DELETE FROM friend_requests WHERE from_user_id = ${userId} OR to_user_id = ${userId}`;
 await sql`DELETE FROM friendships WHERE user_a_id = ${userId} OR user_b_id = ${userId}`;
 await sql`DELETE FROM product_favorites WHERE user_id = ${userId}`;
 await sql`DELETE FROM store_favorites WHERE user_id = ${userId}`;
 await sql`DELETE FROM clicks WHERE user_id = ${userId}`;
 await sql`DELETE FROM product_views WHERE user_id = ${userId}`;
 await sql`DELETE FROM page_type_views WHERE user_id = ${userId}`;
 await sql`DELETE FROM utm_visits WHERE user_id = ${userId}`;
 await sql`DELETE FROM sourcing_requests WHERE user_id = ${userId}`.catch(() => {});
 await sql`DELETE FROM cart_items WHERE user_id = ${userId}`.catch(() => {});
 await sql`DELETE FROM abandoned_cart_emails WHERE user_id = ${userId}`.catch(() => {});
 // Remove from waitlist and pilot access so they can't re-register with existing approval
 const emailRows = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;
 const email = emailRows[0]?.email as string | null;
 if (email) {
 await sql`DELETE FROM waitlist WHERE LOWER(email) = LOWER(${email})`.catch(() => {});
 await sql`DELETE FROM pilot_access WHERE LOWER(email) = LOWER(${email})`.catch(() => {});
 }
 await sql`DELETE FROM accounts WHERE user_id = ${userId}`;
 await sql`DELETE FROM users WHERE id = ${userId}`;

 return NextResponse.json({ ok: true });
}
