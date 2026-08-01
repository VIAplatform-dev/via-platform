import { NextRequest, NextResponse } from "next/server";
import { createConversation } from "@/app/lib/messaging-db";
import { getInboxSettings } from "@/app/lib/storefront-settings-db";
import { notifyStoreOfMessage } from "@/app/lib/message-notify";

export const dynamic = "force-dynamic";

// Public: a storefront contact form / item question opens a conversation.
// { storeSlug, name?, email?, message, itemTitle? } → returns a thread token.
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 const storeSlug = body?.storeSlug ? String(body.storeSlug).trim() : "";
 const message = body?.message ? String(body.message).trim() : "";
 if (!storeSlug || !message) {
 return NextResponse.json({ error: "Message required." }, { status: 400 });
 }
 // Honor the store's Buyer-messaging toggle — if they've turned messaging off, don't open a thread.
 const settings = await getInboxSettings(storeSlug).catch(() => null);
 if (settings && !settings.messagingEnabled) {
 return NextResponse.json({ error: "This store isn’t taking messages right now." }, { status: 403 });
 }
 try {
 const name = body?.name ? String(body.name).slice(0, 200) : null;
 const itemTitle = body?.itemTitle ? String(body.itemTitle).slice(0, 300) : null;
 const { token } = await createConversation(storeSlug, {
 name,
 email: body?.email ? String(body.email).slice(0, 200) : null,
 itemTitle,
 message: message.slice(0, 5000),
 });
 // Notify the store — email + (if configured) a text to the seller's phone.
 notifyStoreOfMessage(storeSlug, { itemTitle, buyerName: name, message: message.slice(0, 5000) }).catch(() => {});
 return NextResponse.json({ ok: true, token });
 } catch {
 return NextResponse.json({ error: "Couldn’t send. Try again." }, { status: 500 });
 }
}
