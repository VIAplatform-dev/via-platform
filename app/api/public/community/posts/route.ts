import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { createPost } from "@/app/lib/communityDb";
import { getMobileUserId, getUserById } from "@/app/lib/mobileAuth";

export const dynamic = "force-dynamic";

const MAX_CONTENT = 1000;
const BANNED_PATTERNS = [
 /\bdm\s+me\b/i,
 /\btext\s+me\b/i,
 /\bvenmo\b/i,
 /\bpaypal\.me\b/i,
 /\bcashapp\b/i,
 /\bzelle\b/i,
 /(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/, // phone numbers
];

/**
 * POST /api/public/community/posts
 * Body: { content: string, displayName?: string, imageUrl?: string }
 * Authorization: Bearer <jwt> (optional in dev mode)
 *
 * If signed in via JWT, displayName is taken from the user record.
 * Otherwise displayName must be provided in the body.
 */
export async function POST(request: Request) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 try {
 const body = await request.json();
 const content = (body?.content ?? "").toString().trim();
 const imageUrl = (body?.imageUrl ?? null) as string | null;

 if (!content) {
 return NextResponse.json({ error: "Empty post" }, { status: 400 });
 }
 if (content.length > MAX_CONTENT) {
 return NextResponse.json({ error: "Post too long" }, { status: 400 });
 }
 for (const pat of BANNED_PATTERNS) {
 if (pat.test(content)) {
  return NextResponse.json({
  error: "Please keep conversation on platform. Don't share contact info or payment details.",
  }, { status: 400 });
 }
 }

 const userId = getMobileUserId(request);
 let displayName: string;

 if (userId) {
 const user = await getUserById(userId);
 if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
 // Never expose the email local-part as a public name. Fall back to a neutral handle.
 displayName = user.name?.trim() || `Member ${String(userId).slice(-4)}`;
 } else {
 const bodyName = (body?.displayName ?? "").toString().trim();
 if (!bodyName) {
  return NextResponse.json({ error: "displayName required when not signed in" }, { status: 400 });
 }
 displayName = bodyName.slice(0, 60);
 }

 const { id } = await createPost({
 userId,
 displayName,
 content,
 imageUrl,
 });

 return NextResponse.json({ id, ok: true });
 } catch (err) {
 console.error("[community post] error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}
