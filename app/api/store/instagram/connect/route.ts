import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { igAppConfigured } from "@/app/lib/instagram-publish";
import { BASE_URL } from "@/app/lib/base-url";

export const dynamic = "force-dynamic";

// Kicks off the Meta OAuth so a store connects Instagram in one click. Dormant until the
// Meta app is live (IG_APP_ID / IG_APP_SECRET) and has cleared App Review for
// instagram_content_publish. Until then, stores connect by pasting a token (see the main route).
const OAUTH_SCOPES = [
 "instagram_basic",
 "instagram_content_publish",
 "pages_show_list",
 "business_management",
].join(",");

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!igAppConfigured()) {
  return NextResponse.json(
   { error: "Instagram one-click connect isn't configured yet. Connect with a token instead." },
   { status: 503 }
  );
 }

 const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
 url.searchParams.set("client_id", process.env.IG_APP_ID!);
 url.searchParams.set("redirect_uri", `${BASE_URL}/api/store/instagram/callback`);
 url.searchParams.set("scope", OAUTH_SCOPES);
 url.searchParams.set("response_type", "code");
 url.searchParams.set("state", slug); // echoed back; the callback re-resolves the store from session
 return NextResponse.redirect(url.toString());
}
