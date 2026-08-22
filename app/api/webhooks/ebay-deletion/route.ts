import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { clearEbayTokensByUser } from "@/app/lib/ebay-tokens-db";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

export const dynamic = "force-dynamic";

// eBay Marketplace Account Deletion / Closure notification endpoint — required to enable
// a Production keyset. GET = eBay's one-time validation challenge; POST = a real deletion
// notice (we drop that user's stored eBay data and ack 200).

function endpointUrl(req: NextRequest): string {
 return process.env.EBAY_DELETION_ENDPOINT || `${req.nextUrl.origin}${req.nextUrl.pathname}`;
}

// Validation: echo SHA-256(challengeCode + verificationToken + endpoint) as hex.
export async function GET(req: NextRequest) {
 const challengeCode = req.nextUrl.searchParams.get("challenge_code");
 const token = process.env.EBAY_VERIFICATION_TOKEN;
 if (!token) return NextResponse.json({ error: "EBAY_VERIFICATION_TOKEN not set" }, { status: 500 });
 if (!challengeCode) return NextResponse.json({ error: "challenge_code required" }, { status: 400 });
 const challengeResponse = createHash("sha256").update(challengeCode + token + endpointUrl(req)).digest("hex");
 return NextResponse.json({ challengeResponse }, { status: 200 });
}

// Real notification: acknowledge fast, best-effort delete the user's eBay data.
//
// eBay's Marketplace Account Deletion notifications aren't signed per-request — the GET
// challenge above is the only verification eBay's spec provides, so this endpoint is
// unavoidably reachable by anyone who knows the URL. To keep that from being a trivial
// "wipe any seller's eBay tokens" primitive: rate-limit per IP, and require the payload to
// actually match eBay's real notification shape (topic + a username) before acting on it —
// this filters out arbitrary POSTs while still accepting genuine eBay notifications.
export async function POST(req: NextRequest) {
 const ip = clientIp(req.headers);
 if (await overRateLimit({ bucket: "ebay-deletion-webhook", ip, max: 20, windowMinutes: 15 })) {
 return new NextResponse(null, { status: 429 });
 }

 const body = await req.json().catch(() => null);
 const topic = body?.metadata?.topic;
 const notificationId = body?.notification?.notificationId;
 const username = body?.notification?.data?.username;

 if (topic !== "MARKETPLACE_ACCOUNT_DELETION" || !notificationId || !username) {
 return new NextResponse(null, { status: 200 }); // ack, but don't act on a malformed payload
 }

 clearEbayTokensByUser(String(username)).catch(() => {});
 return new NextResponse(null, { status: 200 });
}
