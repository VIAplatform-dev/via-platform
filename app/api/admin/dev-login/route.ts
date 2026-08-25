import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Local-development sign-in. Nothing else.
//
// The real admin sign-in is password → OTP emailed via Resend → code entry. That is correct for
// production and painful on localhost, where it means round-tripping an email to look at a page.
// The proxy already accepts a `via_admin_token` cookie equal to sha256(ADMIN_PASSWORD), so this
// route just sets that cookie directly — it grants nothing the password alone doesn't.
//
// THREE INDEPENDENT GUARDS, because an auth bypass that ships is the worst kind of convenience:
//   1. Refuses unless NODE_ENV === "development" (`next build` sets "production").
//   2. Refuses unless the request Host is loopback — so it can't be reached over the LAN even in
//      dev, which matters because the dev server binds 0.0.0.0 and gets shared on a network.
//   3. Refuses if ADMIN_PASSWORD is unset or is the `[SENSITIVE]` placeholder `vercel env pull`
//      writes, so it can never mint a token from a non-secret.
// Any refusal is a 404, not a 403 — an endpoint that says "forbidden" tells a scanner it exists.

export const dynamic = "force-dynamic";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export async function GET(request: NextRequest) {
 const notFound = () => new NextResponse("Not found", { status: 404 });

 if (process.env.NODE_ENV !== "development") return notFound();

 const host = request.headers.get("host") || "";
 if (!LOOPBACK.test(host)) return notFound();

 const password = (process.env.ADMIN_PASSWORD || "").trim();
 if (!password || password === "[SENSITIVE]") {
  return new NextResponse(
   "ADMIN_PASSWORD is not set in .env.local (or still holds the [SENSITIVE] placeholder that `vercel env pull` writes). Fill it in and reload.",
   { status: 500, headers: { "content-type": "text/plain" } },
  );
 }

 // Same derivation the proxy compares against (isAdminAuthenticated).
 const token = crypto.createHash("sha256").update(password).digest("hex");

 const to = request.nextUrl.searchParams.get("to") || "/admin";
 // Only same-origin paths — never an absolute URL, so this can't be used as an open redirect.
 const dest = to.startsWith("/") && !to.startsWith("//") ? to : "/admin";

 const res = NextResponse.redirect(new URL(dest, request.nextUrl.origin));
 res.cookies.set("via_admin_token", token, {
  httpOnly: true,
  sameSite: "lax",
  secure: false, // localhost is http
  path: "/",
  maxAge: 60 * 60 * 12,
 });
 return res;
}
