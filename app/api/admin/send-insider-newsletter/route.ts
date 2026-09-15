import { NextRequest, NextResponse } from "next/server";
import { getInsiderAudienceEmails } from "@/app/lib/pilot-db";
import { sendInsiderNewsletterEmail } from "@/app/lib/email";
import {
 JUNE_2026_NEWSLETTER_HTML,
 JUNE_2026_NEWSLETTER_SUBJECT,
} from "@/app/lib/newsletters/june-2026";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TEMPLATES: Record<string, { subject: string; html: string }> = {
 "june-2026": { subject: JUNE_2026_NEWSLETTER_SUBJECT, html: JUNE_2026_NEWSLETTER_HTML },
};

/**
 * GET: preview audience size only. No emails sent.
 * Returns { count, sample } so admin can sanity-check before firing.
 */
export async function GET() {
 const emails = await getInsiderAudienceEmails();
 return NextResponse.json({
 count: emails.length,
 sample: emails.slice(0, 10),
 templates: Object.keys(TEMPLATES),
 });
}

/**
 * POST: actually send the newsletter.
 * Body: {
 *   template?: string,    // e.g. "june-2026": uses pre-built HTML
 *   subject?: string,     // overrides template subject (or required if no template)
 *   contentHtml?: string, // raw HTML: required if no template
 *   testEmail?: string    // if present, only sends to this address
 * }
 *
 * Content drops into the rose-background insider shell between logo and footer.
 */
export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const templateKey = (body?.template ?? "").toString().trim();
 const testEmail = (body?.testEmail ?? "").toString().trim().toLowerCase();

 let subject: string;
 let contentHtml: string;

 if (templateKey && TEMPLATES[templateKey]) {
 const t = TEMPLATES[templateKey];
 subject = (body?.subject ?? "").toString().trim() || t.subject;
 contentHtml = t.html;
 } else {
 subject = (body?.subject ?? "").toString().trim();
 contentHtml = (body?.contentHtml ?? "").toString();
 if (!subject || !contentHtml) {
 return NextResponse.json(
  { error: "Provide either a valid 'template' key, or both 'subject' and 'contentHtml'" },
  { status: 400 },
 );
 }
 }

 const recipients = testEmail
 ? [testEmail]
 : await getInsiderAudienceEmails();

 if (recipients.length === 0) {
 return NextResponse.json({ error: "No recipients" }, { status: 400 });
 }

 const { sent, failed } = await sendInsiderNewsletterEmail(
 recipients,
 subject,
 contentHtml,
 );

 return NextResponse.json({
 ok: true,
 audience: testEmail ? "test-only" : "insiders",
 template: templateKey || null,
 recipients: recipients.length,
 sent,
 failed,
 });
 } catch (err) {
 console.error("[send-insider-newsletter] error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}
