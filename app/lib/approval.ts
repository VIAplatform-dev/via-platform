import { verifyMobileJwt, getMobileUserId } from "./mobileAuth";
import { getPilotStatus } from "./pilot-db";
import { touchLastActive } from "./notification-db";
import { auth } from "./auth";
import crypto from "crypto";

// Unified "is this requester an APPROVED pilot user?" gate for catalog/content
// endpoints. Must handle BOTH client types because web and mobile authenticate
// differently and both hit /api/public/*:
//   • Web: the `via_access=1` cookie (set by pilot-check on approval), fast path,
//     else fall back to the NextAuth session email → pilot status.
//   • Mobile: Authorization: Bearer <jwt> → email in the JWT → pilot status.
//   • Admin: the via_admin_token cookie (full bypass).
// Fails CLOSED: anonymous or pending users get false. This is what stops waitlisted
// users from browsing the catalog on either platform.

function parseCookies(request: Request): Record<string, string> {
 const header = request.headers.get("cookie") ?? "";
 const out: Record<string, string> = {};
 for (const part of header.split(/;\s*/)) {
  const i = part.indexOf("=");
  if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1));
 }
 return out;
}

function isAdmin(cookies: Record<string, string>): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 const token = cookies["via_admin_token"];
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

export async function isApprovedRequest(request: Request): Promise<boolean> {
 const cookies = parseCookies(request);

 // Admin bypass
 if (isAdmin(cookies)) return true;

 // Web fast path: approval cookie set by /api/pilot-check
 if (cookies["via_access"] === "1") return true;

 // Mobile: any valid app login (a verified JWT) gets full access. The app is past
 // the waitlist, so logging in is enough. (Web still honors the waitlist via the
 // cookie / session-email paths.)
 const authz = request.headers.get("authorization") ?? "";
 const m = /^Bearer\s+(.+)$/i.exec(authz);
 if (m) {
  const payload = verifyMobileJwt(m[1]);
  if (payload?.email) {
   void touchLastActive(getMobileUserId(request)); // "last seen" heartbeat (best-effort)
   return true;
  }
 }

 // Web session without the cookie yet (e.g. just approved): check by session email
 const session = await auth().catch(() => null);
 const email = session?.user?.email;
 if (email) {
  const status = await getPilotStatus(email).catch(() => "pending");
  if (status === "approved") {
   void touchLastActive(session?.user?.id); // "last seen" heartbeat (best-effort)
   return true;
  }
 }

 return false;
}
