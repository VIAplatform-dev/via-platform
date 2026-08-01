import { NextRequest, NextResponse } from "next/server";
import { verifyBuyerToken } from "@/app/lib/buyer-auth";
import { getConversationsForBuyer, getConversationForBuyer, getMessages, addMessage } from "@/app/lib/messaging-db";
import { notifyStoreOfMessage } from "@/app/lib/message-notify";

export const dynamic = "force-dynamic";

// A buyer's PER-STORE inbox, opened by a signed magic-link token (store + email). Everything
// is scoped to that (store, email) pair — the token can only ever see this buyer's own threads
// with this one store.

// GET ?token= — all of this buyer's conversations with the store, with messages.
export async function GET(request: NextRequest) {
 const auth = verifyBuyerToken(request.nextUrl.searchParams.get("token"));
 if (!auth) return NextResponse.json({ error: "This link has expired." }, { status: 401 });
 const convs = await getConversationsForBuyer(auth.storeSlug, auth.email).catch(() => []);
 const conversations = await Promise.all(
 convs.map(async (c) => ({
 id: c.id,
 itemTitle: c.itemTitle,
 lastMessageAt: c.lastMessageAt,
 messages: (await getMessages(c.id)).map((m) => ({ sender: m.sender, body: m.body, createdAt: m.createdAt })),
 })),
 );
 return NextResponse.json({ ok: true, storeSlug: auth.storeSlug, email: auth.email, conversations });
}

// POST { token, conversationId, body } — the buyer replies in a thread they own.
export async function POST(request: NextRequest) {
 const body = (await request.json().catch(() => ({}))) as { token?: string; conversationId?: number; body?: string };
 const auth = verifyBuyerToken(body.token);
 if (!auth) return NextResponse.json({ error: "This link has expired." }, { status: 401 });
 const text = (body.body || "").trim();
 if (!text) return NextResponse.json({ error: "Message required." }, { status: 400 });

 const conv = await getConversationForBuyer(Number(body.conversationId), auth.storeSlug, auth.email).catch(() => null);
 if (!conv) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

 await addMessage(conv.id, "buyer", text.slice(0, 5000));
 // Nudge the store their buyer replied (email + optional text) — same path as a new message.
 notifyStoreOfMessage(auth.storeSlug, { itemTitle: conv.itemTitle, buyerName: conv.buyerName, message: text.slice(0, 5000) }).catch(() => {});
 return NextResponse.json({ ok: true });
}
