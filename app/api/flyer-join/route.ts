import { NextRequest, NextResponse } from "next/server";
import { createPilotEntry, getPilotStatus, approvePilotUser } from "@/app/lib/pilot-db";
import { flyerBySlug, flyerSource, flyerDestination } from "@/app/lib/flyers";
import { createMagicSignInLink } from "@/app/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/flyer-join  { email, slug }
 *
 * Someone scanned a printed flyer and gave us their email. They are approved IMMEDIATELY and sent
 * straight in — no email round trip, no password.
 *
 * TWO THINGS ARE NEEDED TO BROWSE, not one. `proxy.ts` gates pages on a SESSION first and the
 * approval cookie second, so the cookie alone opens the API and still bounces every page to
 * /login. So we also mint the same magic sign-in link the approval email carries, and hand it
 * back for the browser to follow immediately instead of mailing it. Following it creates the
 * Auth.js session, and its callbackUrl runs /api/pilot-check, which sets the approval cookie on
 * the way through.
 *
 * The thank-you email is a separate, next-day job (cron/flyer-welcome). It plays no part in
 * granting access; if it never sent, this person would still be browsing.
 *
 * `source` records WHICH flyer, which is the entire point of giving each one its own address.
 */
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 const email = String(body?.email ?? "").trim().toLowerCase();
 const flyer = flyerBySlug(body?.slug);

 // A missing/unknown slug means someone posted here by hand. Refuse rather than attributing the
 // signup to nothing — a row with no source is worse than no row.
 if (!flyer) return NextResponse.json({ error: "Unknown flyer" }, { status: 400 });
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  return NextResponse.json({ error: "That email doesn’t look right." }, { status: 400 });
 }

 try {
  // Already known to us? Make sure they end up approved either way. Someone who joined the
  // waitlist weeks ago and now scans a flyer has earned the same instant access as a stranger —
  // being an earlier fan should not mean waiting longer.
  const status = await getPilotStatus(email).catch(() => "none");
  if (status === "approved") {
   // Nothing to write; they just need the cookie.
  } else if (status === "pending") {
   await approvePilotUser(email);
  } else {
   await createPilotEntry({ email, status: "approved", emailSubscribe: true, source: flyerSource(flyer.slug) });
  }
 } catch (err) {
  console.error("[flyer-join] DB error:", err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
 }

 // The link that actually gets them in. If it cannot be built (no AUTH_SECRET, DB trouble) it
 // falls back to /login — degraded, but never a dead end.
 // Land them where the flyer promised. pilot-check sets the approval cookie on the way through
 // and then forwards to `next`, so the Fendi poster ends on Fendi rather than a homepage they
 // would have to go searching from.
 const destination = flyerDestination(flyer.slug);
 const next = await createMagicSignInLink(
  email,
  `/api/pilot-check?next=${encodeURIComponent(destination)}`,
 ).catch(() => "/login");

 const response = NextResponse.json({ ok: true, next });
 // Set the approval cookie here too. /api/pilot-check will set it again at the end of the sign-in
 // hop, but setting it now means the flyer page itself unlocks even if they never follow the link.
 response.cookies.set("via_access", "1", {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
 });
 return response;
}
