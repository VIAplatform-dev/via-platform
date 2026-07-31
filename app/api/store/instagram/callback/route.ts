import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { igAppConfigured, saveStoreIgConnection } from "@/app/lib/instagram-publish";
import { BASE_URL } from "@/app/lib/base-url";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const WORKSPACE = "/infrastructure/admin/instagram";

// Handles the Meta OAuth return: code → user token → the Page's linked IG Business account →
// save { ig_user_id, page access_token } for that store. The Page access token is what the
// Content Publishing API uses. Untested end-to-end until the Meta app exists — the token-paste
// path in the main route is the one that works before App Review.
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const back = (status: string) => NextResponse.redirect(`${BASE_URL}${WORKSPACE}?ig=${status}`);

 if (!igAppConfigured()) return back("unconfigured");

 const code = request.nextUrl.searchParams.get("code");
 if (request.nextUrl.searchParams.get("error") || !code) return back("denied");

 try {
  // 1. code → user access token
  const tokUrl = new URL(`${GRAPH}/oauth/access_token`);
  tokUrl.searchParams.set("client_id", process.env.IG_APP_ID!);
  tokUrl.searchParams.set("client_secret", process.env.IG_APP_SECRET!);
  tokUrl.searchParams.set("redirect_uri", `${BASE_URL}/api/store/instagram/callback`);
  tokUrl.searchParams.set("code", code);
  const tok = await fetch(tokUrl, { signal: AbortSignal.timeout(20000) }).then((r) => r.json());
  const userToken = tok?.access_token;
  if (!userToken) return back("token_failed");

  // 2. find a Page with a linked IG Business account
  const pagesUrl = new URL(`${GRAPH}/me/accounts`);
  pagesUrl.searchParams.set("fields", "name,access_token,instagram_business_account{id,username}");
  pagesUrl.searchParams.set("access_token", userToken);
  const pages = await fetch(pagesUrl, { signal: AbortSignal.timeout(20000) }).then((r) => r.json());
  const page = (pages?.data || []).find((p: any) => p?.instagram_business_account?.id);
  if (!page) return back("no_ig_account");

  await saveStoreIgConnection({
   storeSlug: slug,
   igUserId: page.instagram_business_account.id,
   igUsername: page.instagram_business_account.username ?? null,
   accessToken: page.access_token,
  });
  return back("connected");
 } catch {
  return back("error");
 }
}
