import test from "node:test";
import assert from "node:assert/strict";
import { destinationAfterAuth, loginHref, safeNext } from "./auth-route.ts";

// The seller sign-in has exactly one job — put the right person in the right place — and getting it
// wrong is what "it keeps telling me to log in when I'm already logged in" actually is. The branches
// below are the four answers whoami can give, plus the redirect that carries someone back to where
// they were headed.

type Reply = { status: number; body?: unknown };
function stubWhoAmI(replies: Reply[]) {
 const calls: string[] = [];
 const original = globalThis.fetch;
 let i = 0;
 globalThis.fetch = (async (url: string) => {
  calls.push(String(url));
  const r = replies[Math.min(i++, replies.length - 1)];
  return { status: r.status, json: async () => r.body ?? {} } as Response;
 }) as typeof fetch;
 return { calls, restore: () => { globalThis.fetch = original; } };
}

test("a seller with a store lands in her workspace", async () => {
 const s = stubWhoAmI([{ status: 200, body: { admin: false, slug: "tess-elizabeth-vintage" } }]);
 assert.equal(await destinationAfterAuth(null), "/admin/home");
 s.restore();
});

test("a seller with a store is returned to where she was headed", async () => {
 const s = stubWhoAmI([{ status: 200, body: { slug: "blummier" } }]);
 assert.equal(await destinationAfterAuth("/admin/orders"), "/admin/orders");
 s.restore();
});

test("a brand-new signup goes to onboarding, not to `next`", async () => {
 // Setting the shop up comes first — `next` would drop her into an empty workspace.
 const s = stubWhoAmI([{ status: 200, body: { admin: false, needsOnboarding: true } }]);
 assert.equal(await destinationAfterAuth("/admin/orders"), "/admin/onboarding");
 s.restore();
});

test("the owner lands in the workspace like any store", async () => {
 const s = stubWhoAmI([{ status: 200, body: { admin: true, slug: "via-admin" } }]);
 assert.equal(await destinationAfterAuth(null), "/admin/home");
 s.restore();
});

test("the localhost dev shortcut is not treated as a sign-in", async () => {
 // whoami answers "owner" from NODE_ENV alone on `next dev`, but the proxy won't honour it. Acting
 // on it sent the browser into the workspace, straight back out, and round again — the sign-in page
 // reloading forever. The form must simply render.
 const s = stubWhoAmI([{ status: 200, body: { admin: true, slug: "via-admin", dev: true } }]);
 assert.equal(await destinationAfterAuth("/admin/home"), "/store/login");
 s.restore();
});

test("a real session on localhost still wins over the shortcut", async () => {
 const s = stubWhoAmI([{ status: 200, body: { admin: false, slug: "tess-elizabeth-vintage" } }]);
 assert.equal(await destinationAfterAuth(null), "/admin/home");
 s.restore();
});

test("nobody signed in stays on the sign-in page", async () => {
 const s = stubWhoAmI([{ status: 401 }]);
 assert.equal(await destinationAfterAuth(null), "/store/login");
 s.restore();
});

test("a 401 right after a callback is retried before giving up", async () => {
 // The session cookie is occasionally unreadable on the first request after a provider callback.
 // Telling a seller who just signed in that she isn't is the one failure this flow can't have.
 const s = stubWhoAmI([{ status: 401 }, { status: 200, body: { slug: "tess-elizabeth-vintage" } }]);
 assert.equal(await destinationAfterAuth(null, true), "/admin/home");
 assert.equal(s.calls.length, 2);
 s.restore();
});

test("without retry it asks exactly once", async () => {
 const s = stubWhoAmI([{ status: 401 }]);
 await destinationAfterAuth(null);
 assert.equal(s.calls.length, 1);
 s.restore();
});

test("an off-site `next` is refused rather than followed", async () => {
 // It arrives in the URL, so anyone can put anything there. Honouring it would hand a
 // freshly-authenticated seller straight to someone else's site.
 for (const evil of ["https://evil.example", "//evil.example", "javascript:alert(1)", ""]) {
  assert.equal(safeNext(evil), null, evil);
 }
 assert.equal(safeNext("/admin/inventory"), "/admin/inventory");
});

test("an off-site `next` doesn't survive into the destination", async () => {
 const s = stubWhoAmI([{ status: 200, body: { slug: "blummier" } }]);
 assert.equal(await destinationAfterAuth("//evil.example"), "/admin/home");
 s.restore();
});

test("loginHref carries the destination and swaps between sign-in and sign-up", () => {
 assert.equal(loginHref("/admin/orders"), "/store/login?next=%2Fadmin%2Forders");
 assert.equal(loginHref("/admin/orders", "signup"), "/store/signup?next=%2Fadmin%2Forders");
 assert.equal(loginHref(null), "/store/login");
 assert.equal(loginHref("https://evil.example"), "/store/login");
});
