import { createHash } from "node:crypto";
import {
 challengeResponse, chooseStores, decodeSignatureHeader, dedupeKey, isSaleTopic, parseNotification,
 syncWindowSince, tradingSignature, verifyNotificationSignature, type ParsedNotification,
} from "./ebay-notify-core.ts";

// The receiving end of an eBay sale notification, written against an interface so the whole path
// — challenge, signature, store, sync, record — runs under test with nothing real behind it. The
// route in app/api/webhooks/ebay is a thin adapter over this.
//
// Two rules shape every branch:
//  1. Nothing unauthenticated reaches the database. The signature is checked before the body is
//     even parsed (Notification API), or the SOAP signature is checked before anything else.
//  2. Once authenticated, the answer is 2xx whatever we make of the payload. eBay retries on
//     non-2xx and marks a destination down after enough failures — a store that stops hearing
//     about sales because we 500'd on a shape we did not expect is the failure to avoid. Odd
//     deliveries are recorded with an outcome the admin can read, not refused.

export type ReceiveDeps = {
 now: () => number;
 endpoint: string;
 verificationToken: string | null;
 /** eBay's public key for a key id (cached by the IO layer); null when eBay does not know the kid. */
 publicKey: (kid: string) => Promise<{ key: string; digest?: string } | null>;
 /** DevId / AppId / CertId for the legacy Trading signature; null when not configured. */
 tradingCreds: () => { devId: string; appId: string; certId: string } | null;
 storesBySku: (skus: string[]) => Promise<string[]>;
 storesByListingId: (ids: string[]) => Promise<string[]>;
 storesByEbayUser: (users: string[]) => Promise<string[]>;
 connectedStores: () => Promise<string[]>;
 /** Insert the delivery; inserted=false means this id was seen before (a replay). */
 record: (r: { id: string; topic: string; storeSlug: string | null; outcome: string; detail: string | null }) => Promise<{ inserted: boolean }>;
 updateOutcome: (id: string, outcome: string, detail: string | null, storeSlug?: string | null) => Promise<void>;
 sync: (slug: string, sinceISO: string) => Promise<{ checked: number; pulled: string[] }>;
 syncTimeoutMs?: number;
 log?: (msg: string) => void;
};

export type ReceiveResult = { status: number; body: Record<string, unknown> };

const TRADING_WINDOW_MS = 10 * 60_000; // eBay's own replay window for platform notifications

export async function handleChallenge(challengeCode: string | null, deps: Pick<ReceiveDeps, "endpoint" | "verificationToken">): Promise<ReceiveResult> {
 if (!deps.verificationToken) return { status: 500, body: { error: "EBAY_NOTIFY_VERIFICATION_TOKEN not set" } };
 if (!challengeCode) return { status: 400, body: { error: "challenge_code required" } };
 return { status: 200, body: { challengeResponse: challengeResponse(challengeCode, deps.verificationToken, deps.endpoint) } };
}

async function authenticate(input: { body: string; signatureHeader: string | null }, deps: ReceiveDeps): Promise<{ ok: true; parsed: ParsedNotification | null } | { ok: false; reason: string }> {
 const sig = decodeSignatureHeader(input.signatureHeader);
 if (sig) {
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(sig.kid)) return { ok: false, reason: "bad key id" };
  const pk = await deps.publicKey(sig.kid).catch(() => null);
  if (!pk) return { ok: false, reason: "unknown key id" };
  if (!verifyNotificationSignature({ body: input.body, signature: sig.signature, publicKey: pk.key, digest: pk.digest })) return { ok: false, reason: "signature mismatch" };
  return { ok: true, parsed: parseNotification(input.body) };
 }
 // No header: only a Trading SOAP delivery can still authenticate, on its own signature.
 const parsed = parseNotification(input.body);
 if (!parsed || parsed.kind !== "trading") return { ok: false, reason: "missing signature" };
 const creds = deps.tradingCreds();
 if (!creds) return { ok: false, reason: "trading credentials not configured" };
 const ts = parsed.trading?.timestamp;
 if (!ts || !parsed.trading?.signature) return { ok: false, reason: "unsigned" };
 const t = Date.parse(ts);
 if (!Number.isFinite(t) || Math.abs(deps.now() - t) > TRADING_WINDOW_MS) return { ok: false, reason: "stale" };
 if (tradingSignature(ts, creds.devId, creds.appId, creds.certId) !== parsed.trading.signature) return { ok: false, reason: "signature mismatch" };
 return { ok: true, parsed };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
 let t: ReturnType<typeof setTimeout> | undefined;
 const timer = new Promise<"timeout">((res) => { t = setTimeout(() => res("timeout"), ms); });
 return Promise.race([p, timer]).finally(() => { if (t) clearTimeout(t); });
}

export async function handleDelivery(input: { body: string; signatureHeader: string | null }, deps: ReceiveDeps): Promise<ReceiveResult> {
 const log = deps.log ?? ((m: string) => console.warn(m));
 const auth = await authenticate(input, deps);
 if (!auth.ok) {
  log(`[ebay-notify] refused: ${auth.reason}`);
  return { status: 401, body: { error: "Invalid signature" } };
 }
 const parsed = auth.parsed;
 if (!parsed) {
  // Signed by eBay, unreadable by us: ack so it is not retried, keep a row so it is not invisible.
  const id = "malformed:" + createHash("sha256").update(input.body).digest("hex").slice(0, 32);
  await deps.record({ id, topic: "?", storeSlug: null, outcome: "malformed", detail: input.body.slice(0, 200) }).catch(() => ({ inserted: false }));
  log("[ebay-notify] malformed payload acknowledged");
  return { status: 202, body: { received: true, outcome: "malformed" } };
 }

 const id = dedupeKey(parsed);
 const { inserted } = await deps.record({ id, topic: parsed.topic, storeSlug: null, outcome: "received", detail: null });
 if (!inserted) return { status: 200, body: { received: true, replay: true } };

 if (!isSaleTopic(parsed.topic)) {
  await deps.updateOutcome(id, "ignored", `topic ${parsed.topic}`);
  return { status: 200, body: { received: true, outcome: "ignored" } };
 }

 const [bySku, byListing, byUser, connected] = await Promise.all([
  parsed.skus.length ? deps.storesBySku(parsed.skus).catch(() => []) : [],
  parsed.itemIds.length ? deps.storesByListingId(parsed.itemIds).catch(() => []) : [],
  parsed.ebayUserIds.length ? deps.storesByEbayUser(parsed.ebayUserIds).catch(() => []) : [],
  deps.connectedStores().catch(() => []),
 ]);
 const choice = chooseStores({ matched: [...bySku, ...byListing, ...byUser], connected, saleTopic: true });
 const keys = parsed.dataKeys.length ? `data keys: ${parsed.dataKeys.join(", ")}` : "";
 if (!choice.slugs.length) {
  await deps.updateOutcome(id, "unknown-store", [`users ${parsed.ebayUserIds.join("|") || "-"}`, `items ${parsed.itemIds.join("|") || "-"}`, `skus ${parsed.skus.join("|") || "-"}`, keys].filter(Boolean).join(" · "));
  log(`[ebay-notify] no store for ${parsed.topic} ${id}`);
  return { status: 202, body: { received: true, outcome: "unknown-store" } };
 }

 const since = syncWindowSince(deps.now());
 const slugLabel = choice.slugs.join(", ");
 let outcome = "synced";
 const details: string[] = [];
 if (choice.how === "broadcast") details.push(`broadcast (${choice.slugs.length} stores, no match)`);
 for (const slug of choice.slugs) {
  try {
   const r = await withTimeout(deps.sync(slug, since), deps.syncTimeoutMs ?? 20_000);
   if (r === "timeout") { outcome = "timeout"; details.push(`${slug}: timed out`); break; }
   details.push(`${slug}: pulled ${r.pulled.length} of ${r.checked} checked`);
  } catch (e) {
   outcome = "sync-error";
   details.push(`${slug}: ${e instanceof Error ? e.message : String(e)}`);
   break;
  }
 }
 if (keys && choice.how === "broadcast") details.push(keys);
 await deps.updateOutcome(id, outcome, details.join(" · "), slugLabel);
 return { status: 200, body: { received: true, outcome, stores: choice.slugs } };
}
