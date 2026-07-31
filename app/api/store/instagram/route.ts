import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import {
 getStoreIgConnection,
 saveStoreIgConnection,
 setStoreIgAutoPost,
 disconnectStoreIg,
 publishItemStory,
 igAppConfigured,
} from "@/app/lib/instagram-publish";

export const dynamic = "force-dynamic";

// Instagram auto-posting for the Owner Workspace.
//   GET    → connection status
//   POST   → { action: "connect" | "toggle" | "post-now", ... }
//   DELETE → disconnect
// Auth is per-store via resolveStoreSlugAny (this path is listed in middleware PUBLIC_ROUTES
// only so the workspace's own auth runs instead of the waitlist gate).

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const conn = await getStoreIgConnection(slug);
 return NextResponse.json({
  connected: !!conn,
  igUsername: conn?.igUsername ?? null,
  autoPost: conn?.autoPost ?? false,
  // Whether the one-click OAuth flow is available yet (needs the Meta app + App Review).
  // When false, the store connects by pasting a token from the Graph API Explorer.
  oauthAvailable: igAppConfigured(),
 });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const action = String(body.action || "");

 if (action === "connect") {
  // Manual connect: paste an IG Business account id + a long-lived access token.
  // (The OAuth flow at /connect does this automatically once the Meta app is live.)
  const igUserId = String(body.igUserId || "").trim();
  const accessToken = String(body.accessToken || "").trim();
  if (!igUserId || !accessToken) {
   return NextResponse.json({ error: "igUserId and accessToken are required" }, { status: 400 });
  }
  await saveStoreIgConnection({
   storeSlug: slug,
   igUserId,
   accessToken,
   igUsername: typeof body.igUsername === "string" ? body.igUsername : null,
  });
  return NextResponse.json({ ok: true, connected: true });
 }

 if (action === "toggle") {
  const enabled = !!body.autoPost;
  await setStoreIgAutoPost(slug, enabled);
  return NextResponse.json({ ok: true, autoPost: enabled });
 }

 if (action === "post-now") {
  const itemId = String(body.itemId || "").trim();
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  const result = await publishItemStory(slug, itemId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
 }

 return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 await disconnectStoreIg(slug);
 return NextResponse.json({ ok: true, connected: false });
}
