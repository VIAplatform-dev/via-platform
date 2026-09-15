import { NextResponse } from "next/server";
import { getWinbackCandidates, recordWinbackSent } from "@/app/lib/notification-db";
import { sendWinbackEmail } from "@/app/lib/email";
import { getPushTokensForUser } from "@/app/lib/saved-searches-db";
import { sendExpoPush } from "@/app/lib/push";
import { winbackPush } from "@/app/lib/shopper-push-core";

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 let sent = 0;
 let skipped = 0;

 for (const tier of ["14d", "30d"] as const) {
 const candidates = await getWinbackCandidates(tier);
 for (const candidate of candidates) {
 try {
 await sendWinbackEmail(candidate.email, tier);
 // The "come back" moment, on the phone as well. This was email-only, so someone with the
 // app installed heard nothing from it, which is the wrong way round.
 await pushAlso(candidate.user_id, tier);
 await recordWinbackSent(candidate.user_id, tier);
 sent++;
 } catch (err) {
 console.error(`Winback email failed for ${candidate.email}:`, err);
 skipped++;
 }
 }
 }

 return NextResponse.json({ ok: true, sent, skipped });
 } catch (err) {
 console.error("Winback cron error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}

/** Buzz this person's phones. Never throws: a push failure must not undo a sent email. */
async function pushAlso(userId: string, tier: "14d" | "30d"): Promise<void> {
  try {
    const tokens = await getPushTokensForUser(userId);
    if (tokens.length) await sendExpoPush(tokens, winbackPush(tier));
  } catch {
    /* allow-swallow */
  }
}
