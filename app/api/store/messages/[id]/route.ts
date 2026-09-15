import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getConversation, getMessages, markReadByStore } from "@/app/lib/messages-db";

export const dynamic = "force-dynamic";

/** GET /api/store/messages/[id]: one conversation's thread for the acting
 * store. Marks customer messages as read (clears the store's unread badge). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const conversationId = parseInt(id);
 if (isNaN(conversationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

 const conv = await getConversation(conversationId);
 if (!conv || conv.storeSlug !== slug) {
 return NextResponse.json({ error: "Not found" }, { status: 404 });
 }

 const messages = await getMessages(conversationId);
 await markReadByStore(conversationId);
 return NextResponse.json({ conversation: conv, messages });
}
