import { Resend } from "resend";

// Standalone ops-alert sender — deliberately a LEAF module: it imports only `resend`, nothing that
// reaches the server-only storefront sanitizer. error-log.ts imports it (and error-log is pulled in by
// the foundational db.ts), so keeping this dependency-light is what lets db.ts stay client-bundle-safe.
// The full email.ts re-exports sendOpsAlert from here for its other server-side callers.

const getResend = () => {
 const apiKey = process.env.RESEND_API_KEY;
 if (!apiKey) throw new Error("RESEND_API_KEY environment variable is not set.");
 return new Resend(apiKey);
};

const FROM_EMAIL = "VYA <hana@vyaplatform.com>";
// Where operational alerts (failed/empty nightly ETL, thin shipping margin, etc.) are sent.
const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || "helster@me.com";

/**
 * Send an operational alert to the founder — used when a nightly ETL cron throws or produces a
 * suspiciously empty result, or a shipping label eats its margin, so silent failures surface instead
 * of looking like "no data". Best-effort: never throws, so an alert failure can't mask the original.
 */
export async function sendOpsAlert(subject: string, body: string): Promise<void> {
 try {
 if (!process.env.RESEND_API_KEY) {
  console.error(`[ops-alert] ${subject}: ${body}`);
  return;
 }
 const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
 await getResend().emails.send({
  from: FROM_EMAIL,
  to: OPS_ALERT_EMAIL,
  subject: `⚠️ VYA ops: ${subject}`,
  html: `<pre style="font-family:monospace;white-space:pre-wrap">${esc(body)}</pre>`,
 });
 } catch (e) {
 console.error(`[ops-alert] failed to send "${subject}":`, e);
 }
}
