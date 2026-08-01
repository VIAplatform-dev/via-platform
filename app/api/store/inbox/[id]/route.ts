import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getConversationForStore, getMessages, addMessage, markStoreRead } from "@/app/lib/messaging-db";
import { sendBuyerReplyNotification } from "@/app/lib/email";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { BASE_URL } from "@/app/lib/base-url";
import { signBuyerToken } from "@/app/lib/buyer-auth";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";

export const dynamic = "force-dynamic";

// Store view of one conversation (marks it read) + the store's reply.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const conv = await getConversationForStore(Number(id), slug).catch(() => null);
 if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const messages = await getMessages(conv.id);
 await markStoreRead(conv.id, slug).catch(() => {});
 return NextResponse.json({ conversation: conv, messages });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await params;
 const conv = await getConversationForStore(Number(id), slug).catch(() => null);
 if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const body = await request.json().catch(() => null);
 const text = body?.body ? String(body.body).trim() : "";
 if (!text) return NextResponse.json({ error: "Message required." }, { status: 400 });
 await addMessage(conv.id, "store", text.slice(0, 5000));
 // Notify the buyer their message got a reply (was a dead end before — they had to revisit the link).
 if (conv.buyerEmail) {
 const store = stores.find((s) => s.slug === slug);
 const sf = await getStorefrontBySlug(slug).catch(() => null);
 const handle = sf?.handle || slug;
 // Magic link to the buyer's per-store inbox (all their threads with THIS store).
 const link = `${BASE_URL}/s/${handle}/messages?t=${signBuyerToken(slug, conv.buyerEmail)}`;
 sendBuyerReplyNotification({
 buyerEmail: conv.buyerEmail,
 storeName: store?.name || slug,
 productTitle: conv.itemTitle,
 replyBody: text.slice(0, 5000),
 threadUrl: link,
 replyTo: storeContactEmails[slug] || null,
 }).catch(() => {});
 }
 return NextResponse.json({ ok: true });
}
