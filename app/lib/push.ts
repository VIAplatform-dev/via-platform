// ───────────────────────────────────────────────────────────────────────────
// Server-side Expo push delivery. Tokens are collected by the app (customers in
// user_push_tokens, stores in store_push_tokens). This sends banner pushes to
// them via the Expo Push API. Best-effort: failures never throw to the caller.
// ───────────────────────────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushPayload = {
 title: string;
 body: string;
 data?: Record<string, unknown>;
};

/** Send a push to many tokens. Filters non-Expo tokens, batches by 100, and
 * swallows errors so a notification failure never breaks a message send. */
export type PushResult = { sent: number; failed: number; dead: number; errors: string[] };

export async function sendExpoPush(tokens: string[], payload: PushPayload): Promise<PushResult> {
 const valid = [...new Set(tokens)].filter(
 (t) => t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")),
 );
 if (valid.length === 0) return { sent: 0, failed: 0, dead: 0, errors: [] };

 const dead: string[] = [];

 const messages = valid.map((to) => ({
 to,
 title: payload.title,
 body: payload.body,
 data: payload.data ?? {},
 sound: "default",
 }));

 let ok = 0;
 const errors: string[] = [];

 for (let i = 0; i < messages.length; i += 100) {
 const batch = messages.slice(i, i + 100);
 try {
 const res = await fetch(EXPO_PUSH_URL, {
 method: "POST",
 headers: {
 Accept: "application/json",
 "Content-Type": "application/json",
 },
 body: JSON.stringify(batch),
 });
 // READ THE ANSWER. This used to be fire-and-forget, which meant a token Apple had
 // retired ("DeviceNotRegistered") looked exactly like a delivered push: the call
 // succeeded, Expo replied with an error ticket, and nobody looked. A notification
 // system nobody can tell is broken is one that stays broken.
 const body = (await res.json().catch(() => null)) as { data?: { status: string; message?: string; details?: { error?: string } }[] } | null;
 for (const [j, ticket] of (body?.data ?? []).entries()) {
 if (ticket?.status === "ok") { ok += 1; continue; }
 const reason = ticket?.details?.error || ticket?.message || "unknown";
 errors.push(reason);
 // A retired device keeps its row forever otherwise, and every future send pays for it.
 if (reason === "DeviceNotRegistered") dead.push(batch[j].to);
 }
 } catch (e) {
 errors.push(e instanceof Error ? e.message : "network");
 }
 }

 if (dead.length) await forgetTokens(dead);
 return { sent: ok, failed: errors.length, dead: dead.length, errors: [...new Set(errors)].slice(0, 5) };
}

/** Drop tokens Expo says are gone. Best-effort: a failure here only costs a wasted send later. */
async function forgetTokens(tokens: string[]): Promise<void> {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return;
 try {
 const { neon } = await import("@neondatabase/serverless");
 const sql = neon(url);
 await sql`DELETE FROM user_push_tokens WHERE token = ANY(${tokens})`;
 await sql`DELETE FROM store_push_tokens WHERE token = ANY(${tokens})`;
 } catch {
 /* allow-swallow: pruning is housekeeping, never worth failing a send over */
 }
}
