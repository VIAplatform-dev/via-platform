import { NextResponse } from "next/server";
import { getMobileUserId } from "@/app/lib/mobileAuth";
import { getConversation, getMessages, markReadByCustomer } from "@/app/lib/messages-db";

export const dynamic = "force-dynamic";

/** GET /api/mobile/messages/[id]: messages in one of the customer's threads.
 * Marks store messages as read (clears the customer's unread badge). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const userId = getMobileUserId(request);
 if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const { id } = await params;
 const conversationId = parseInt(id);
 if (isNaN(conversationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

 const conv = await getConversation(conversationId);
 if (!conv || conv.customerUserId !== userId) {
 return NextResponse.json({ error: "Not found" }, { status: 404 });
 }

 const messages = await getMessages(conversationId);
 await markReadByCustomer(conversationId);
 return NextResponse.json({ conversation: conv, messages });
}
