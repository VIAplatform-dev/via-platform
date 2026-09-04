import { NextRequest, NextResponse } from "next/server";
import { getFlyerSignupsDueWelcome, markFlyerWelcomeSent } from "@/app/lib/flyer-welcome-db";
import { sendPilotApprovalEmail } from "@/app/lib/email";

export const dynamic = "force-dynamic";

/**
 * The day-after thank-you for people who joined from a printed flyer.
 *
 * THIS JOB GRANTS NOTHING. Access was given the moment they typed their email; if this never ran,
 * they would still be browsing. That separation is deliberate — an email job that is also an
 * access job is one whose failure locks people out.
 *
 * Each address is marked only after its send succeeds, so a bad minute at the mail provider means
 * a retry tomorrow rather than a person who is silently never written to.
 */
export async function GET(request: NextRequest) {
 // Fail-closed, exactly like cron/approve-pilot-users: /api/cron bypasses the admin gate, and this
 // route sends mail to real people.
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
  const due = await getFlyerSignupsDueWelcome();
  if (due.length === 0) return NextResponse.json({ sent: 0 });

  let sent = 0;
  const failed: string[] = [];
  for (const person of due) {
   try {
    await sendPilotApprovalEmail(person.email);
    await markFlyerWelcomeSent(person.email);
    sent++;
   } catch (err) {
    console.error(`[FlyerWelcome] Send failed for ${person.email}:`, err);
    failed.push(person.email);
   }
  }
  return NextResponse.json({ sent, failed: failed.length, considered: due.length });
 } catch (err) {
  console.error("[FlyerWelcome] error:", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}
