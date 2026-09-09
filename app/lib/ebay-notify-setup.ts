/* eslint-disable @typescript-eslint/no-explicit-any */
import { validVerificationToken } from "./ebay-notify-core.ts";

// The subscribe flow for eBay sale notifications, against an interface (SetupDeps) so it runs
// under test with a fake eBay and a fake database. ebay-notify-db.ts supplies the real ones.
//
// Idempotent by design: the owner runs it after every deploy and whenever a store connects, and
// a second run must create nothing. Every "no" from eBay comes back in the report as a sentence.

export const NOTIFY_TOPIC = "ORDER_CONFIRMATION";
export const NOTIFY = "/commerce/notification/v1";
const DESTINATION_NAME = "VYA sale notifications";

export type ApiRes = { ok: boolean; status: number; json: any; location: string | null };
export type NotifyState = { subscriptionId: string | null; status: "active" | "error" | "off"; since: string | null; lastError: string | null };

export function ebayError(r: ApiRes): string {
 const e = r.json?.errors?.[0];
 return e?.longMessage || e?.message || (r.status ? `eBay answered ${r.status}` : "eBay unreachable");
}
const idFromLocation = (loc: string | null): string | null => (loc ? loc.split("/").filter(Boolean).pop() ?? null : null);

// ── The subscribe flow ──────────────────────────────────────────────────────────────────────────

export type SetupDeps = {
 now: () => string;
 endpoint: string;
 verificationToken: string | null;
 alertEmail: string | null;
 appToken: () => Promise<string | null>;
 userToken: (slug: string) => Promise<string | null>;
 api: (token: string, method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<ApiRes>;
 getDestinationId: () => Promise<string | null>;
 saveDestinationId: (id: string) => Promise<void>;
 connectedStores: () => Promise<string[]>;
 getState: (slug: string) => Promise<NotifyState | null>;
 saveState: (slug: string, patch: Partial<NotifyState>) => Promise<void>;
};

export type SetupReport = {
 ok: boolean;
 error?: string;
 endpoint: string;
 alertEmail?: "set" | "skipped" | "failed";
 destination: { id: string | null; action: "reused" | "created" | "re-enabled" | "failed"; error?: string };
 topic: { id: string; scope: string | null };
 stores: Array<{ slug: string; action: "already" | "subscribed" | "re-enabled" | "failed"; subscriptionId: string | null; error?: string }>;
};

/**
 * Idempotent: creates or reuses the app's destination (our endpoint + verification token), then
 * for each store creates or adopts her ORDER_CONFIRMATION subscription with HER token. Everything
 * it did or could not do is in the report; nothing throws for an eBay "no".
 */
export async function setupNotifications(o: { stores?: string[] }, deps: SetupDeps): Promise<SetupReport> {
 const report: SetupReport = { ok: false, endpoint: deps.endpoint, destination: { id: null, action: "failed" }, topic: { id: NOTIFY_TOPIC, scope: null }, stores: [] };
 if (!validVerificationToken(deps.verificationToken)) {
  return { ...report, error: "EBAY_NOTIFY_VERIFICATION_TOKEN must be set to 32–80 characters of letters, digits, _ or -." };
 }
 const token = deps.verificationToken as string;
 const app = await deps.appToken();
 if (!app) return { ...report, error: "The eBay app is not configured on this server (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)." };

 // Where eBay emails when it marks the destination down. Best-effort.
 if (deps.alertEmail) {
  const r = await deps.api(app, "PUT", `${NOTIFY}/config`, { alertEmail: deps.alertEmail });
  report.alertEmail = r.ok ? "set" : "failed";
 } else report.alertEmail = "skipped";

 // 1) The destination: the app's, one for all stores.
 const destBody = { name: DESTINATION_NAME, status: "ENABLED", deliveryConfig: { endpoint: deps.endpoint, verificationToken: token } };
 let destinationId = await deps.getDestinationId();
 if (destinationId) {
  const cur = await deps.api(app, "GET", `${NOTIFY}/destination/${destinationId}`);
  if (cur.ok) {
   const healthy = cur.json?.status === "ENABLED" && cur.json?.deliveryConfig?.endpoint === deps.endpoint;
   if (healthy) report.destination = { id: destinationId, action: "reused" };
   else {
    const upd = await deps.api(app, "PUT", `${NOTIFY}/destination/${destinationId}`, destBody);
    report.destination = upd.ok ? { id: destinationId, action: "re-enabled" } : { id: destinationId, action: "failed", error: ebayError(upd) };
   }
  } else destinationId = null; // gone on eBay's side — create a new one
 }
 if (!destinationId) {
  const made = await deps.api(app, "POST", `${NOTIFY}/destination`, destBody);
  if (made.ok && idFromLocation(made.location)) {
   destinationId = idFromLocation(made.location);
   report.destination = { id: destinationId, action: "created" };
  } else {
   // Perhaps it exists under an id we lost: look for our endpoint.
   const list = await deps.api(app, "GET", `${NOTIFY}/destination?limit=100`);
   const found = Array.isArray(list.json?.destinations) ? list.json.destinations.find((d: any) => d?.deliveryConfig?.endpoint === deps.endpoint) : null;
   if (found?.destinationId) {
    destinationId = String(found.destinationId);
    report.destination = { id: destinationId, action: "reused" };
   } else {
    report.destination = { id: null, action: "failed", error: ebayError(made) };
    return { ...report, error: `Destination: ${ebayError(made)}` };
   }
  }
  if (destinationId) await deps.saveDestinationId(destinationId);
 }
 if (report.destination.action === "failed" || !destinationId) return { ...report, error: `Destination: ${report.destination.error ?? "failed"}` };

 // 2) The topic's payload spec, from eBay when it will say.
 let payload = { format: "JSON", schemaVersion: "1.0", deliveryProtocol: "HTTPS" };
 const topic = await deps.api(app, "GET", `${NOTIFY}/topic/${NOTIFY_TOPIC}`);
 if (topic.ok) {
  const sp = Array.isArray(topic.json?.supportedPayloads) ? topic.json.supportedPayloads.find((p: any) => !p?.deprecated) ?? topic.json.supportedPayloads[0] : null;
  if (sp?.format && sp?.schemaVersion) payload = { format: String(sp.format), schemaVersion: String(sp.schemaVersion), deliveryProtocol: String(sp.deliveryProtocol || "HTTPS") };
  if (typeof topic.json?.scope === "string") report.topic.scope = topic.json.scope;
 }

 // 3) One subscription per store, with her token.
 const stores = o.stores ?? (await deps.connectedStores());
 let allOk = true;
 for (const slug of stores) {
  const user = await deps.userToken(slug);
  if (!user) { report.stores.push({ slug, action: "failed", subscriptionId: null, error: "No valid eBay token — the account is not connected, or its refresh failed. Reconnect eBay in Settings › Marketplaces." }); allOk = false; continue; }
  const state = await deps.getState(slug);
  if (state?.subscriptionId) {
   const cur = await deps.api(user, "GET", `${NOTIFY}/subscription/${state.subscriptionId}`);
   if (cur.ok && cur.json?.destinationId === destinationId) {
    if (cur.json?.status === "ENABLED") {
     if (state.status !== "active") await deps.saveState(slug, { status: "active", lastError: null });
     report.stores.push({ slug, action: "already", subscriptionId: state.subscriptionId });
     continue;
    }
    const en = await deps.api(user, "POST", `${NOTIFY}/subscription/${state.subscriptionId}/enable`);
    if (en.ok) { await deps.saveState(slug, { status: "active", lastError: null }); report.stores.push({ slug, action: "re-enabled", subscriptionId: state.subscriptionId }); continue; }
   }
   // Otherwise: gone, or pointing at an old destination — subscribe afresh below.
  }
  const made = await deps.api(user, "POST", `${NOTIFY}/subscription`, { topicId: NOTIFY_TOPIC, status: "ENABLED", destinationId, payload });
  if (made.ok && idFromLocation(made.location)) {
   const subscriptionId = idFromLocation(made.location);
   await deps.saveState(slug, { subscriptionId, status: "active", since: state?.since ?? deps.now(), lastError: null });
   report.stores.push({ slug, action: "subscribed", subscriptionId });
   continue;
  }
  const msg = ebayError(made);
  if (/already exist/i.test(msg)) {
   const list = await deps.api(user, "GET", `${NOTIFY}/subscription?limit=100`);
   const found = Array.isArray(list.json?.subscriptions) ? list.json.subscriptions.find((s: any) => s?.topicId === NOTIFY_TOPIC && s?.destinationId === destinationId) : null;
   if (found?.subscriptionId) {
    await deps.saveState(slug, { subscriptionId: String(found.subscriptionId), status: "active", since: state?.since ?? deps.now(), lastError: null });
    report.stores.push({ slug, action: "already", subscriptionId: String(found.subscriptionId) });
    continue;
   }
  }
  const hint = /permission|scope|insufficient|access denied/i.test(msg) ? " — her eBay connection predates the sell.fulfillment scope; ask her to reconnect eBay in Settings › Marketplaces, then run setup again." : "";
  await deps.saveState(slug, { status: "error", lastError: msg });
  report.stores.push({ slug, action: "failed", subscriptionId: state?.subscriptionId ?? null, error: msg + hint });
  allOk = false;
 }
 report.ok = allOk;
 if (!allOk) report.error = "One or more stores could not be subscribed — see stores[].error.";
 return report;
}

