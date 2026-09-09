import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getMobileUserId, getUserById } from "@/app/lib/mobileAuth";
import {
 getOrCreateConversation,
 getConversation,
 postMessage,
 listCustomerConversations,
 getMessages,
} from "@/app/lib/messages-db";
import { storeContactEmails } from "@/app/lib/stores";
import { sendStoreMessageNotification } from "@/app/lib/email";
import { pushSellerMessage } from "@/app/lib/seller-push";

export const dynamic = "force-dynamic";

function getSql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

/** GET /api/mobile/messages — the signed-in customer's conversations. */
export async function GET(request: Request) {
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const conversations = await listCustomerConversations(userId);
 return NextResponse.json({ conversations });
}

/**
 * POST /api/mobile/messages
 * Body: { productId?, conversationId?, body }
 * Starts (or continues) a conversation with the product's store and notifies
 * the store by email + push. Requires a signed-in customer.
 */
export async function POST(request: Request) {
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const text = (body?.body ?? "").toString().trim();
 if (!text) return NextResponse.json({ error: "Message is required" }, { status: 400 });
 const clipped = text.slice(0, 4000);

 const conversationId = body?.conversationId ? Number(body.conversationId) : null;
 const productId = body?.productId != null ? Number(body.productId) : null;

 let conv;
 if (conversationId) {
 conv = await getConversation(conversationId);
 if (!conv || conv.customerUserId !== userId) {
 return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
 }
 } else {
 if (!productId) {
 return NextResponse.json({ error: "productId or conversationId required" }, { status: 400 });
 }
 const sql = getSql();
 const rows = (await sql`
 SELECT id, store_slug, store_name, title, image FROM products WHERE id = ${productId} LIMIT 1
 `) as Array<{ id: number; store_slug: string; store_name: string; title: string; image: string | null }>;
 const p = rows[0];
 if (!p) return NextResponse.json({ error: "Product not found" }, { status: 404 });
 conv = await getOrCreateConversation({
 customerUserId: userId,
 storeSlug: p.store_slug,
 productId: p.id,
 productTitle: p.title,
 productImage: p.image,
 });
 }

 const message = await postMessage(conv.id, "customer", clipped);

 // Notify the store — email + push, both best-effort.
 const user = await getUserById(userId).catch(() => null);
 const customerName = user?.name ?? user?.email ?? null;
 try {
 const storeEmail = storeContactEmails[conv.storeSlug];
 if (storeEmail) {
 await sendStoreMessageNotification({
 storeEmail,
 storeName: conv.storeSlug,
 productTitle: conv.productTitle,
 customerName,
 messageBody: clipped,
 });
 }
 } catch {
 // ignore email failures
 }
 // The push is gated by the store's notification preferences and never throws (seller-push.ts).
 void pushSellerMessage(conv.storeSlug, { buyerName: customerName, itemTitle: conv.productTitle, message: clipped, conversationId: conv.id, source: "marketplace" });

 const messages = await getMessages(conv.id);
 return NextResponse.json({ conversation: conv, messages, message });
}
