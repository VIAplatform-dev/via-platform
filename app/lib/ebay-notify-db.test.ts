import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFY_TOPIC, setupNotifications, type ApiRes, type NotifyState, type SetupDeps } from "./ebay-notify-setup.ts";

// The subscribe flow, with eBay and the database faked. It is run by the owner after every deploy
// and again whenever a store connects, so what matters is that it is IDEMPOTENT — a second run
// creates nothing — and that every way eBay can say no comes back as a sentence, not a stack trace.

const ENDPOINT = "https://vyaplatform.com/api/webhooks/ebay";
const TOKEN = "v".repeat(40);
const NOW = "2026-09-07T12:00:00.000Z";

type Call = { token: string; method: string; path: string; body?: unknown };
function fakes(o: {
 destinationId?: string | null; states?: Record<string, NotifyState>; connected?: string[]; userTokens?: Record<string, string | null>;
 respond?: (c: Call) => ApiRes | undefined; verificationToken?: string | null; alertEmail?: string | null; appToken?: string | null;
} = {}) {
 const calls: Call[] = [];
 let destinationId = o.destinationId ?? null;
 const states: Record<string, NotifyState> = { ...(o.states ?? {}) };
 const ok = (json: unknown, status = 200, location: string | null = null): ApiRes => ({ ok: true, status, json, location });
 // The default eBay: a healthy destination and subscription for whatever ids we hold; creates succeed.
 const defaultRespond = (c: Call): ApiRes => {
  if (c.method === "GET" && c.path.startsWith("/commerce/notification/v1/destination/")) return ok({ destinationId: c.path.split("/").pop(), status: "ENABLED", deliveryConfig: { endpoint: ENDPOINT } });
  if (c.method === "POST" && c.path === "/commerce/notification/v1/destination") return ok(null, 201, "/commerce/notification/v1/destination/dest-new");
  if (c.method === "GET" && c.path === `/commerce/notification/v1/topic/${NOTIFY_TOPIC}`) return ok({ topicId: NOTIFY_TOPIC, scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment", supportedPayloads: [{ format: "JSON", schemaVersion: "1.0", deliveryProtocol: "HTTPS" }] });
  if (c.method === "GET" && c.path.startsWith("/commerce/notification/v1/subscription/")) return ok({ subscriptionId: c.path.split("/").pop(), topicId: NOTIFY_TOPIC, status: "ENABLED", destinationId });
  if (c.method === "POST" && c.path === "/commerce/notification/v1/subscription") return ok(null, 201, `/commerce/notification/v1/subscription/sub-${(c.body as { destinationId: string }).destinationId}-${calls.length}`);
  if (c.method === "PUT" && c.path === "/commerce/notification/v1/config") return ok(null, 204);
  return { ok: false, status: 404, json: { errors: [{ message: "not found" }] }, location: null };
 };
 const deps: SetupDeps = {
  now: () => NOW,
  endpoint: ENDPOINT,
  verificationToken: o.verificationToken === undefined ? TOKEN : o.verificationToken,
  alertEmail: o.alertEmail ?? null,
  appToken: async () => (o.appToken === undefined ? "app-token" : o.appToken),
  userToken: async (slug) => (o.userTokens && slug in o.userTokens ? o.userTokens[slug] : `user-${slug}`),
  api: async (token, method, path, body) => { const c = { token, method, path, body }; calls.push(c); return o.respond?.(c) ?? defaultRespond(c); },
  getDestinationId: async () => destinationId,
  saveDestinationId: async (id) => { destinationId = id; },
  connectedStores: async () => o.connected ?? ["scottie"],
  getState: async (slug) => states[slug] ?? null,
  saveState: async (slug, patch) => { states[slug] = { subscriptionId: null, status: "off", since: null, lastError: null, ...(states[slug] ?? {}), ...patch }; },
 };
 return { deps, calls, states, destination: () => destinationId };
}

test("a bad or missing verification token is refused before eBay is called, with the rule spelled out", async () => {
 const f = fakes({ verificationToken: "short" });
 const r = await setupNotifications({}, f.deps);
 assert.equal(r.ok, false);
 assert.match(String(r.error), /EBAY_NOTIFY_VERIFICATION_TOKEN.*32/);
 assert.equal(f.calls.length, 0);
});

test("no eBay app keys is a sentence, not a crash", async () => {
 const f = fakes({ appToken: null });
 const r = await setupNotifications({}, f.deps);
 assert.equal(r.ok, false);
 assert.match(String(r.error), /eBay app/);
});

test("first run: one destination for the app, one subscription per connected store, ids persisted", async () => {
 const f = fakes({ connected: ["scottie", "tess"] });
 const r = await setupNotifications({}, f.deps);
 assert.equal(r.ok, true);
 assert.deepEqual(r.destination, { id: "dest-new", action: "created" });
 assert.equal(f.destination(), "dest-new");
 assert.deepEqual(r.stores.map((s) => [s.slug, s.action]), [["scottie", "subscribed"], ["tess", "subscribed"]]);
 assert.equal(f.states.scottie.status, "active");
 assert.equal(f.states.scottie.since, NOW);
 assert.match(String(f.states.scottie.subscriptionId), /^sub-dest-new/);
 // The destination is the app's (application token); each subscription is the seller's (her token).
 const destCreate = f.calls.find((c) => c.method === "POST" && c.path.endsWith("/destination"))!;
 assert.equal(destCreate.token, "app-token");
 assert.deepEqual(destCreate.body, { name: "VYA sale notifications", status: "ENABLED", deliveryConfig: { endpoint: ENDPOINT, verificationToken: TOKEN } });
 const subCreates = f.calls.filter((c) => c.method === "POST" && c.path.endsWith("/subscription"));
 assert.deepEqual(subCreates.map((c) => c.token), ["user-scottie", "user-tess"]);
 assert.deepEqual(subCreates[0].body, { topicId: NOTIFY_TOPIC, status: "ENABLED", destinationId: "dest-new", payload: { format: "JSON", schemaVersion: "1.0", deliveryProtocol: "HTTPS" } });
 assert.equal(r.topic.scope, "https://api.ebay.com/oauth/api_scope/sell.fulfillment");
});

test("second run: everything is reused — not one POST", async () => {
 const f = fakes({ destinationId: "dest-1", states: { scottie: { subscriptionId: "sub-1", status: "active", since: "2026-09-01T00:00:00.000Z", lastError: null } } });
 const r = await setupNotifications({}, f.deps);
 assert.equal(r.ok, true);
 assert.deepEqual(r.destination, { id: "dest-1", action: "reused" });
 assert.deepEqual(r.stores.map((s) => [s.slug, s.action, s.subscriptionId]), [["scottie", "already", "sub-1"]]);
 assert.equal(f.calls.filter((c) => c.method === "POST").length, 0);
 assert.equal(f.states.scottie.since, "2026-09-01T00:00:00.000Z", "the on-since date is not reset by a re-run");
});

test("a destination eBay marked down is re-enabled in place, with the same id", async () => {
 const f = fakes({
  destinationId: "dest-1",
  respond: (c) => (c.method === "GET" && c.path.endsWith("/destination/dest-1") ? { ok: true, status: 200, json: { destinationId: "dest-1", status: "MARKED_DOWN", deliveryConfig: { endpoint: ENDPOINT } }, location: null }
   : c.method === "PUT" && c.path.endsWith("/destination/dest-1") ? { ok: true, status: 204, json: null, location: null } : undefined),
 });
 const r = await setupNotifications({}, f.deps);
 assert.deepEqual(r.destination, { id: "dest-1", action: "re-enabled" });
 const put = f.calls.find((c) => c.method === "PUT" && c.path.endsWith("/destination/dest-1"))!;
 assert.deepEqual(put.body, { name: "VYA sale notifications", status: "ENABLED", deliveryConfig: { endpoint: ENDPOINT, verificationToken: TOKEN } });
});

test("a destination eBay no longer has (404) is created afresh", async () => {
 const f = fakes({ destinationId: "dest-gone", respond: (c) => (c.method === "GET" && c.path.endsWith("/destination/dest-gone") ? { ok: false, status: 404, json: null, location: null } : undefined) });
 const r = await setupNotifications({}, f.deps);
 assert.deepEqual(r.destination, { id: "dest-new", action: "created" });
 assert.equal(f.destination(), "dest-new");
});

test("a destination that fails the challenge stops the run with eBay's reason — no subscriptions are attempted", async () => {
 const f = fakes({ respond: (c) => (c.method === "POST" && c.path.endsWith("/destination") ? { ok: false, status: 400, json: { errors: [{ errorId: 195020, message: "Challenge verification failed for the endpoint" }] }, location: null } : undefined) });
 const r = await setupNotifications({}, f.deps);
 assert.equal(r.ok, false);
 assert.equal(r.destination.action, "failed");
 assert.match(String(r.destination.error), /Challenge verification failed/);
 assert.equal(r.stores.length, 0);
});

test("a store without a working eBay token is reported, not attempted", async () => {
 const f = fakes({ connected: ["scottie", "tess"], userTokens: { tess: null } });
 const r = await setupNotifications({}, f.deps);
 assert.deepEqual(r.stores.map((s) => [s.slug, s.action]), [["scottie", "subscribed"], ["tess", "failed"]]);
 assert.match(String(r.stores[1].error), /reconnect/i);
 assert.equal(f.calls.filter((c) => c.token === "user-tess").length, 0);
});

test("a store whose grant lacks sell.fulfillment gets told to reconnect, and the error is kept on her row", async () => {
 const f = fakes({ respond: (c) => (c.method === "POST" && c.path.endsWith("/subscription") ? { ok: false, status: 403, json: { errors: [{ errorId: 1100, message: "Access denied", longMessage: "Insufficient permissions to fulfill the request." }] }, location: null } : undefined) });
 const r = await setupNotifications({}, f.deps);
 assert.equal(r.ok, false);
 assert.equal(r.stores[0].action, "failed");
 assert.match(String(r.stores[0].error), /Insufficient permissions/);
 assert.match(String(r.stores[0].error), /reconnect eBay/);
 assert.equal(f.states.scottie.status, "error");
 assert.match(String(f.states.scottie.lastError), /Insufficient permissions/);
});

test("a subscription eBay says already exists is found by listing and adopted", async () => {
 const f = fakes({
  destinationId: "dest-1",
  respond: (c) => {
   if (c.method === "POST" && c.path.endsWith("/subscription")) return { ok: false, status: 409, json: { errors: [{ message: "A subscription for this topic and destination already exists" }] }, location: null };
   if (c.method === "GET" && c.path.startsWith("/commerce/notification/v1/subscription?")) return { ok: true, status: 200, json: { subscriptions: [{ subscriptionId: "sub-old", topicId: NOTIFY_TOPIC, destinationId: "dest-1", status: "ENABLED" }] }, location: null };
   return undefined;
  },
 });
 const r = await setupNotifications({}, f.deps);
 assert.deepEqual(r.stores.map((s) => [s.slug, s.action, s.subscriptionId]), [["scottie", "already", "sub-old"]]);
 assert.equal(f.states.scottie.subscriptionId, "sub-old");
 assert.equal(f.states.scottie.status, "active");
});

test("a subscription we hold that eBay has disabled is enabled again", async () => {
 const f = fakes({
  destinationId: "dest-1", states: { scottie: { subscriptionId: "sub-1", status: "active", since: NOW, lastError: null } },
  respond: (c) => (c.method === "GET" && c.path.endsWith("/subscription/sub-1") ? { ok: true, status: 200, json: { subscriptionId: "sub-1", topicId: NOTIFY_TOPIC, status: "DISABLED", destinationId: "dest-1" }, location: null }
   : c.method === "POST" && c.path.endsWith("/subscription/sub-1/enable") ? { ok: true, status: 204, json: null, location: null } : undefined),
 });
 const r = await setupNotifications({}, f.deps);
 assert.deepEqual(r.stores.map((s) => [s.slug, s.action]), [["scottie", "re-enabled"]]);
});

test("one store can be targeted; the others are left alone", async () => {
 const f = fakes({ connected: ["scottie", "tess"] });
 const r = await setupNotifications({ stores: ["tess"] }, f.deps);
 assert.deepEqual(r.stores.map((s) => s.slug), ["tess"]);
 assert.equal(f.states.scottie, undefined);
});

test("the topic's own payload spec is used when eBay publishes one, defaults otherwise", async () => {
 const f = fakes({ respond: (c) => (c.method === "GET" && c.path.endsWith(`/topic/${NOTIFY_TOPIC}`) ? { ok: false, status: 500, json: null, location: null } : undefined) });
 await setupNotifications({}, f.deps);
 const sub = f.calls.find((c) => c.method === "POST" && c.path.endsWith("/subscription"))!;
 assert.deepEqual((sub.body as { payload: unknown }).payload, { format: "JSON", schemaVersion: "1.0", deliveryProtocol: "HTTPS" });
});

test("the alert email is set on eBay's config when one is configured, and reported either way", async () => {
 const withEmail = fakes({ alertEmail: "ops@vyaplatform.com" });
 const r1 = await setupNotifications({}, withEmail.deps);
 assert.equal(r1.alertEmail, "set");
 const cfg = withEmail.calls.find((c) => c.path.endsWith("/config"))!;
 assert.deepEqual(cfg.body, { alertEmail: "ops@vyaplatform.com" });
 const without = fakes();
 const r2 = await setupNotifications({}, without.deps);
 assert.equal(r2.alertEmail, "skipped");
 assert.equal(without.calls.some((c) => c.path.endsWith("/config")), false);
});
