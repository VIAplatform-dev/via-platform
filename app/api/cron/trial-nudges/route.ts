import { NextResponse } from "next/server";
import { listAccountsForNudge, setNudgeStage } from "@/app/lib/store-accounts-db";
import { isStorePro } from "@/app/lib/store-plans-db";
import { sendTrialNudge } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// Weekly "get paid" nudge for self-onboarded stores still in their 30-day trial. Runs daily and
// emails at the day-7/14/21/27 milestones (whichever the store has newly crossed), until they pick
// a plan. nudge_stage on store_accounts guards against double-sends. Nothing goes to stores that
// have already subscribed. Auth: CRON_SECRET (same as the other crons).

const TRIAL_DAYS = 30;
const MILESTONES = [7, 14, 21, 27]; // days into the trial

export async function GET(request: Request) {
 if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

 const now = Date.now();
 const accounts = await listAccountsForNudge().catch(() => []);
 const sent: string[] = [];
 const skipped: { slug: string; reason: string }[] = [];

 for (const a of accounts) {
  const days = Math.floor((now - new Date(a.createdAt).getTime()) / 86_400_000);
  // Highest milestone the store has crossed but not yet been emailed.
  const milestone = MILESTONES.filter((m) => m <= days && m > a.nudgeStage).pop();
  if (!milestone) { continue; }
  if (days >= TRIAL_DAYS) { skipped.push({ slug: a.slug, reason: "trial-ended" }); continue; }
  if (!a.ownerEmail) { skipped.push({ slug: a.slug, reason: "no-email" }); continue; }
  // Already subscribed → advance the stage silently so we don't nag, and skip.
  if (await isStorePro(a.slug).catch(() => false)) { await setNudgeStage(a.slug, milestone).catch(() => {}); skipped.push({ slug: a.slug, reason: "subscribed" }); continue; }

  try {
   await sendTrialNudge({ to: a.ownerEmail, storeName: a.name, daysLeft: TRIAL_DAYS - days });
   await setNudgeStage(a.slug, milestone);
   sent.push(a.slug);
  } catch {
   skipped.push({ slug: a.slug, reason: "send-failed" });
  }
 }

 return NextResponse.json({ ok: true, sent: sent.length, sentTo: sent, skipped });
}
