import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import {
 listStoreConversations,
 getConversation,
 postMessage,
 getMessages,
 getStoreUnreadTotal,
} from "@/app/lib/messages-db";
import { getPushTokensForUser } from "@/app/lib/saved-searches-db";
import { sendExpoPush } from "@/app/lib/push";

export const dynamic = "force-dynamic";

/** GET /api/store/messages. Conversations for the acting store + unread total. */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const conversations = await listStoreConversations(slug);
 const unread = await getStoreUnreadTotal(slug);
 return NextResponse.json({ storeSlug: slug, conversations, unread });
}

/**
 * POST /api/store/messages. Store replies in a conversation it owns.
 * Body: { conversationId, body }. Push-notifies the customer.
 */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const conversationId = body?.conversationId ? Number(body.conversationId) : null;
 const text = (body?.body ?? "").toString().trim();
 if (!conversationId || !text) {
 return NextResponse.json({ error: "conversationId and body are required" }, { status: 400 });
 }

 const conv = await getConversation(conversationId);
 if (!conv || conv.storeSlug !== slug) {
 return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
 }

 const message = await postMessage(conv.id, "store", text.slice(0, 4000));

 // Push the customer (best-effort).
 try {
 const tokens = await getPushTokensForUser(conv.customerUserId);
 await sendExpoPush(tokens, {
 title: "Reply from the store",
 body: text.slice(0, 140),
 data: { type: "customer_message", conversationId: conv.id },
 });
 } catch {
 // ignore push failures
 }

 const messages = await getMessages(conv.id);
 return NextResponse.json({ conversation: conv, messages, message });
}
