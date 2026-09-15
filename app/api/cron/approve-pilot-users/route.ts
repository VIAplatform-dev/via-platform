import { NextRequest, NextResponse } from "next/server";
import { getPendingUsersToApprove, approvePilotUser, markApprovalEmailSent } from "@/app/lib/pilot-db";
import { sendPilotApprovalEmail } from "@/app/lib/email";

export async function GET(request: NextRequest) {
 // Fail-closed cron auth. This route grants platform access + sends emails, so it must
 // never run for an anonymous caller (and /api/cron bypasses the middleware admin gate).
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const users = await getPendingUsersToApprove();

 if (users.length === 0) {
 console.log("[PilotApproval] No pending users to approve");
 return NextResponse.json({ approved: 0 });
 }

 const results: { email: string; approved: boolean; emailed: boolean; error?: string }[] = [];

 for (const user of users) {
 try {
 await approvePilotUser(user.email);
 let emailed = false;
 try {
 await sendPilotApprovalEmail(user.email, user.first_name ?? undefined);
 emailed = true;
 await markApprovalEmailSent(user.email);
 console.log(`[PilotApproval] Approved + emailed ${user.email}`);
 } catch (emailErr) {
 console.error(`[PilotApproval] Email failed for ${user.email}:`, emailErr);
 }
 results.push({ email: user.email, approved: true, emailed });
 } catch (err) {
 console.error(`[PilotApproval] Failed to approve ${user.email}:`, err);
 results.push({ email: user.email, approved: false, emailed: false, error: String(err) });
 }
 }

 const approved = results.filter((r) => r.approved).length;
 const emailed = results.filter((r) => r.emailed).length;
 console.log(`[PilotApproval] Done: ${approved} approved, ${emailed} emailed`);
 return NextResponse.json({ approved, emailed });
 } catch (error) {
 console.error("[PilotApproval] Error:", error);
 return NextResponse.json({ error: "Failed" }, { status: 500 });
 }
}
