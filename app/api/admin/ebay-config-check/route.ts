import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/app/lib/storeAuth";
import { ebayConfigured } from "@/app/lib/ebay";

export const dynamic = "force-dynamic";

// Why does cross-listing say "needs eBay app keys"? ebayConfigured() requires all three env vars.
// This reports which are PRESENT (boolean only — never the secret values) on THIS environment, so
// you can tell whether a key is missing, and whether it's missing on localhost vs prod.
export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const present = (v: string | undefined) => Boolean(v && v.trim());
 return NextResponse.json({
 ok: true,
 environment: process.env.VERCEL_ENV || (process.env.NODE_ENV === "development" ? "local" : process.env.NODE_ENV),
 ebayConfigured: ebayConfigured(),
 vars: {
 EBAY_CLIENT_ID: present(process.env.EBAY_CLIENT_ID),
 EBAY_CLIENT_SECRET: present(process.env.EBAY_CLIENT_SECRET),
 EBAY_RU_NAME: present(process.env.EBAY_RU_NAME),
 },
 note: "true = the env var is set here (value hidden). ebayConfigured requires all three true.",
 });
}
