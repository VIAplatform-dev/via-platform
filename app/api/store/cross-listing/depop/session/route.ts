import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { saveDepopTokens, getDepopTokens, clearDepopTokens } from "@/app/lib/depop-tokens-db";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Depop session hand-off — the VYA side of the on-device connect.
//
// The VYA mobile app (via-app) redeems the seller's Depop magic link ON THE PHONE, where the login
// looks genuine to Depop and never trips the SMS gate. Whatever credential that login yields — a
// session cookie string, a bearer token, or both — the app POSTs here, and VYA stores it in the
// existing depop_tokens drawer. From then on the server-side poster and the sold-sync use it.
//
// WHY THE SHAPE IS FLEXIBLE: we haven't yet measured a completed Depop login (the web capture died
// at the SMS screen), so we don't know whether the credential is a cookie header, a JWT, or a
// cookie + refresh pair. Rather than guess a rigid schema now and rebuild it later, this accepts a
// `session` string (stored as the access credential) plus optional `refresh` and expiry, and the
// app sends whatever it captured. Once we see a real login we can tighten this.
//
// AUTH: the seller must be signed into VYA (resolveStoreSlugAny) — same gate as every other
// /api/store route. The Depop credential is bound to THAT store, never passed in the body as a
// slug, so one seller can't attach a session to another's account.
// ───────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const body = await request.json().catch(() => null);

 // The credential the on-device login produced. Named `session` because for Depop it's most likely
 // a cookie string, not an OAuth token — but the store treats it opaquely either way.
 const session = typeof body?.session === "string" ? body.session.trim() : "";
 if (!session || session.length < 8) {
  return NextResponse.json({ error: "No Depop session in the request." }, { status: 400 });
 }

 const refresh = typeof body?.refresh === "string" && body.refresh.trim() ? body.refresh.trim() : null;
 const handle = typeof body?.handle === "string" ? body.handle.trim().replace(/^@/, "").slice(0, 60) : null;

 // Expiry may arrive as seconds-from-now (expiresInSec) or an absolute ISO time (expiresAt).
 // The app reads whichever Depop gives it; we normalise to seconds for saveDepopTokens.
 let expiresInSec: number | null = null;
 if (typeof body?.expiresInSec === "number" && body.expiresInSec > 0) {
  expiresInSec = Math.floor(body.expiresInSec);
 } else if (typeof body?.expiresAt === "string") {
  const t = new Date(body.expiresAt).getTime();
  if (!Number.isNaN(t)) expiresInSec = Math.max(60, Math.floor((t - Date.now()) / 1000));
 }

 await saveDepopTokens(slug, { accessToken: session, refreshToken: refresh, expiresInSec, depopUser: handle });

 // Report back what we stored (never the value) so the app can show "Connected as @handle" and,
 // crucially, surface the session lifetime — the number that tells us how often a seller reconnects.
 return NextResponse.json({
  ok: true,
  connected: true,
  handle,
  expiresInSec,
  // Days is the human-readable version the app can show and we can watch during the pilot.
  expiresInDays: expiresInSec ? Math.round((expiresInSec / 86400) * 10) / 10 : null,
 });
}

// GET — is this store's Depop connected, and how much life is left on the session? Powers the
// app's "Connected / Reconnect" state without ever handing the credential back to the client.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const t = await getDepopTokens(slug).catch(() => null);
 if (!t) return NextResponse.json({ ok: true, connected: false });

 const expiresAt = t.expiresAt ?? null;
 const msLeft = expiresAt ? new Date(expiresAt).getTime() - Date.now() : null;
 // "stale" once the session has expired (or is within a day of it) so the app can prompt a
 // reconnect BEFORE a post fails, rather than after.
 const stale = msLeft != null && msLeft < 86400 * 1000;
 return NextResponse.json({
  ok: true,
  connected: true,
  handle: t.depopUser ?? null,
  expiresAt,
  stale,
 });
}

// DELETE — disconnect. Mirrors the existing per-platform disconnect on the cross-listing board.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });
 await clearDepopTokens(slug).catch(() => {});
 return NextResponse.json({ ok: true, connected: false });
}
