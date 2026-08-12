import { NextResponse } from "next/server";
import { importStoreFromUrl } from "@/app/lib/store-import";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Live "import a site" preview for the /infrastructure builder. Pulls a real
// Shopify/Squarespace storefront server-side and returns name + brand color +
// products. (The real seller import that *persists* a VYA store is /api/store/import.)
export async function GET(request: Request) {
 // Public "try it" tool on the homepage → throttle per IP so it can't be used to hammer arbitrary
 // sites through us. (importStoreFromUrl is already SSRF-guarded via safe-url.) Skipped in dev,
 // where localhost has no real client IP so every request would share one "unknown" bucket.
 if (process.env.NODE_ENV !== "development" &&
     await overRateLimit({ bucket: "public-import", ip: clientIp(request.headers), max: 15, windowMinutes: 5 })) {
  return NextResponse.json({ ok: false, error: "Too many tries. Give it a minute and retry." }, { status: 429 });
 }
 const { searchParams } = new URL(request.url);
 const raw = (searchParams.get("url") || "").trim();
 if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });

 const result = await importStoreFromUrl(raw, 12); // demo preview — a handful is enough
 const status = result.ok ? 200 : result.error === "Enter a valid store URL." ? 400 : 200;
 return NextResponse.json(result, { status });
}
