import { NextResponse } from "next/server";
import { getReminderCandidates, markReminderSent } from "@/app/lib/giveaway-db";
import { sendGiveawayReminder } from "@/app/lib/email";

export async function GET(request: Request) {
 console.log("[Giveaway Reminders] Cron job triggered");

 const authHeader = request.headers.get("authorization");
 const hasCronSecret = !!process.env.CRON_SECRET;

 if (!hasCronSecret) {
 console.error("[Giveaway Reminders] CRON_SECRET env var is not set!");
 return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 }

 if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
 console.error("[Giveaway Reminders] Auth failed. Header present:", !!authHeader);
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const hasResendKey = !!process.env.RESEND_API_KEY;
 if (!hasResendKey) {
 console.error("[Giveaway Reminders] RESEND_API_KEY env var is not set!");
 return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
 }

 try {
 const candidates = await getReminderCandidates();
 console.log(`[Giveaway Reminders] Found ${candidates.length} candidates`);

 if (candidates.length === 0) {
 console.log("[Giveaway Reminders] No candidates. Nothing to send");
 return NextResponse.json({ success: true, sent: 0, failed: 0, total: 0 });
 }

 // Log candidate breakdown by category
 const byCategory = candidates.reduce((acc, c) => {
 acc[c.category] = (acc[c.category] || 0) + 1;
 return acc;
 }, {} as Record<string, number>);
 console.log("[Giveaway Reminders] Candidates by category:", JSON.stringify(byCategory));

 let sent = 0;
 let failed = 0;
 const errors: string[] = [];

 for (const { entry, category } of candidates) {
 try {
 console.log(`[Giveaway Reminders] Sending to ${entry.email} (${category})`);
 await sendGiveawayReminder(entry.email, entry.referralCode, category);
 await markReminderSent(entry.id);
 sent++;
 console.log(`[Giveaway Reminders] Sent successfully to ${entry.email}`);
 } catch (err) {
 failed++;
 const errMsg = err instanceof Error ? err.message : String(err);
 errors.push(`${entry.email}: ${errMsg}`);
 console.error(`[Giveaway Reminders] Failed to send to ${entry.email}:`, errMsg);
 }
 }

 console.log(`[Giveaway Reminders] Done: Sent: ${sent}, Failed: ${failed}, Total: ${candidates.length}`);

 return NextResponse.json({
 success: true,
 sent,
 failed,
 total: candidates.length,
 categories: byCategory,
 ...(errors.length > 0 && { errors }),
 });
 } catch (error) {
 console.error("[Giveaway Reminders] Cron job error:", error);
 return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 }
}
