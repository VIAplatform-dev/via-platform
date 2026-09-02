import { NextRequest, NextResponse } from "next/server";
import { normalizeQrCode, destinationFor, isLikelyBotScan } from "@/app/lib/qr-codes";
import { getQrCodeDestination } from "@/app/lib/qr-codes-db";
import { recordQrScan, scanLocationFromHeaders } from "@/app/lib/qr-scans-db";

export const dynamic = "force-dynamic";

/**
 * GET /q/{code} — a printed QR code was scanned.
 *
 * Records where it happened (city/region/country from Vercel's edge headers) and forwards to
 * the code's destination from the qr_codes table.
 *
 * Every failure here ends in a redirect, never an error page. A card printed last season, a
 * code someone retired, a database having a bad minute — all of them still put the person
 * somewhere real, because the alternative is a stranger at an event staring at a 404.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
 const { code: raw } = await ctx.params;

 const destination = await getQrCodeDestination(raw).catch(() => null);

 const userAgent = request.headers.get("user-agent");
 if (!isLikelyBotScan(userAgent)) {
  // Awaited, not fire-and-forget: the serverless instance can freeze the moment the redirect
  // is returned, which would drop the write.
  try {
   await recordQrScan({
    code: normalizeQrCode(raw) || "unknown",
    location: scanLocationFromHeaders(request.headers),
    userAgent,
    referrerHost: referrerHost(request.headers.get("referer")),
   });
  } catch {
   // A scan must redirect even if the DB is down. Losing the row beats losing the visit.
  }
 }

 const res = NextResponse.redirect(destinationFor(destination, raw), 307);
 // Phone browsers and QR apps both cache aggressively. A cached redirect is a lost scan —
 // and worse, it would pin the code to an old destination after you repoint it.
 res.headers.set("Cache-Control", "no-store, max-age=0");
 return res;
}

function referrerHost(referer: string | null): string | null {
 if (!referer) return null;
 try {
  return new URL(referer).host.slice(0, 120) || null;
 } catch {
  return null;
 }
}
