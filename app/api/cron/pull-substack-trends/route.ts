import { NextResponse } from "next/server";
import { pullSubstack, discoverLeaderboard, listSubstackSources, isSubstackConfigured } from "@/app/lib/data-layer/substack-signal";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly, FULLY AUTOMATED: refresh the roster from Substack's OWN Fashion & Beauty ranking (no human
// picks → no bias), then pull each publication's recent posts → extract trend mentions → they feed
// the weekly consensus. `?list=1` inspects the current roster; `?discover=1` re-syncs it only.
export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 const url = new URL(request.url);
 const authed = request.headers.get("authorization") === `Bearer ${cronSecret}` || (cronSecret && url.searchParams.get("key") === cronSecret);
 if (!cronSecret || !authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 if (url.searchParams.get("list")) {
 return NextResponse.json({ ok: true, sources: await listSubstackSources() });
 }
 try {
 // 1) Re-discover the roster from Substack's ranking (objective, self-updating).
 const roster = await discoverLeaderboard();
 if (url.searchParams.get("discover")) return NextResponse.json({ ok: true, roster });
 // 2) Pull posts + extract (needs the LLM key).
 if (!isSubstackConfigured()) {
  return NextResponse.json({ ok: true, roster, skipped: "ANTHROPIC_API_KEY not set — roster refreshed, extraction off." });
 }
 const result = await pullSubstack();
 return NextResponse.json({ ok: true, roster, ...result });
 } catch (err) {
 console.error("[cron/pull-substack-trends] failed:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
