import { NextResponse } from "next/server";
import { sendDueCampaigns } from "@/app/lib/store-campaigns-db";
import { sendOpsAlert } from "@/app/lib/email";

// Delivers store marketing campaigns that were scheduled for a future time. The claim
// is atomic (status guard), so overlapping runs never double-send.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const result = await sendDueCampaigns(new Date());
 return NextResponse.json({ ok: true, ...result });
 } catch (err) {
 console.error("[cron/send-scheduled-campaigns] failed:", err);
 await sendOpsAlert("send-scheduled-campaigns FAILED", String(err)).catch(() => {});
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
