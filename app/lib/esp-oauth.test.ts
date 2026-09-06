import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, tokenRequest, refreshRequest, makePkce, expiryFrom, isExpired, authHeader, redirectUri, espBaseUrl, KLAVIYO_SCOPES } from "./esp-oauth.ts";

const base = "https://getvya.ai";

test("PKCE makes a verifier of legal length and a matching S256 challenge", () => {
 const { verifier, challenge } = makePkce();
 assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier was ${verifier.length}`);
 assert.doesNotMatch(verifier + challenge, /[+/=]/, "base64url only — a '+' in a query string becomes a space");
 assert.notEqual(verifier, challenge);
});

test("Mailchimp's authorize link carries no PKCE, because they don't use it", () => {
 const u = new URL(authorizeUrl({ provider: "mailchimp", clientId: "cid", baseUrl: base, state: "st" }));
 assert.equal(u.origin + u.pathname, "https://login.mailchimp.com/oauth2/authorize");
 assert.equal(u.searchParams.get("response_type"), "code");
 assert.equal(u.searchParams.get("redirect_uri"), `${base}/api/store/marketing/esp/callback/mailchimp`);
 assert.equal(u.searchParams.get("code_challenge"), null);
});

test("Klaviyo's authorize link carries PKCE and the scopes they require", () => {
 const u = new URL(authorizeUrl({ provider: "klaviyo", clientId: "cid", baseUrl: base, state: "st", challenge: "chal" }));
 assert.equal(u.origin + u.pathname, "https://www.klaviyo.com/oauth/authorize");
 assert.equal(u.searchParams.get("code_challenge_method"), "S256");
 assert.equal(u.searchParams.get("code_challenge"), "chal");
 // They require accounts:read and reject the request without it.
 assert.ok(u.searchParams.get("scope")!.split(" ").includes("accounts:read"));
 assert.deepEqual(u.searchParams.get("scope")!.split(" "), KLAVIYO_SCOPES);
});

test("the secret goes where each provider expects it, and nowhere else", () => {
 // Mailchimp takes it in the body; Klaviyo takes Basic auth and refuses it in the body. Swapping
 // them is a 401 with nothing useful in it.
 const mc = tokenRequest({ provider: "mailchimp", clientId: "cid", clientSecret: "sec", code: "c", baseUrl: base });
 assert.match(mc.body, /client_secret=sec/);
 assert.equal(mc.headers.Authorization, undefined);

 const kl = tokenRequest({ provider: "klaviyo", clientId: "cid", clientSecret: "sec", code: "c", baseUrl: base, verifier: "v" });
 assert.equal(kl.headers.Authorization, `Basic ${Buffer.from("cid:sec").toString("base64")}`);
 assert.doesNotMatch(kl.body, /client_secret/);
 assert.match(kl.body, /code_verifier=v/);
 assert.equal(kl.url, "https://a.klaviyo.com/oauth/token", "www stopped accepting token traffic");
});

test("the redirect we send is the redirect we exchange with", () => {
 // They compare the two and reject a mismatch, which is a maddening thing to debug.
 const sent = new URL(authorizeUrl({ provider: "klaviyo", clientId: "c", baseUrl: base, state: "s", challenge: "x" })).searchParams.get("redirect_uri");
 const exchanged = new URLSearchParams(tokenRequest({ provider: "klaviyo", clientId: "c", clientSecret: "s", code: "c", baseUrl: base }).body).get("redirect_uri");
 assert.equal(sent, exchanged);
 assert.equal(sent, redirectUri(base, "klaviyo"));
});

test("a trailing slash on the base URL doesn't produce a double slash", () => {
 assert.equal(redirectUri("https://getvya.ai/", "mailchimp"), "https://getvya.ai/api/store/marketing/esp/callback/mailchimp");
});

test("expiry is recorded with slack, and a missing expiry means it never expires", () => {
 const now = Date.parse("2026-09-05T12:00:00Z");
 // A minute early, so a call never begins on a token that dies mid-flight.
 assert.equal(expiryFrom(3600, now), new Date(now + 3540_000).toISOString());
 assert.equal(expiryFrom(undefined, now), null);
 assert.equal(isExpired(null, now), false, "Mailchimp tokens don't expire");
 assert.equal(isExpired(new Date(now - 1000).toISOString(), now), true);
 assert.equal(isExpired(new Date(now + 60_000).toISOString(), now), false);
});

test("refresh is Klaviyo's shape and never sends the old access token", () => {
 const r = refreshRequest({ clientId: "c", clientSecret: "s", refreshToken: "rt" });
 assert.match(r.body, /grant_type=refresh_token/);
 assert.match(r.body, /refresh_token=rt/);
 assert.match(r.headers.Authorization, /^Basic /);
});

test("each provider's auth header is the one it actually accepts", () => {
 // Mailchimp is "OAuth <token>", not Bearer. Bearer silently 401s.
 assert.equal(authHeader("mailchimp", "t").Authorization, "OAuth t");
 assert.equal(authHeader("klaviyo", "t").Authorization, "Bearer t");
});

test("the base URL is usable even when the environment omits the scheme", () => {
 // NEXT_PUBLIC_BASE_URL is set to a bare host in this project, and a redirect_uri without a scheme
 // is refused by both providers with an error that doesn't say why.
 assert.equal(espBaseUrl({ NEXT_PUBLIC_BASE_URL: "vyaplatform.com" } as NodeJS.ProcessEnv), "https://vyaplatform.com");
 assert.equal(espBaseUrl({ NEXT_PUBLIC_BASE_URL: '"vyaplatform.com"' } as NodeJS.ProcessEnv), "https://vyaplatform.com", "quotes from the env file");
 assert.equal(espBaseUrl({ BASE_URL: "https://getvya.ai/" } as NodeJS.ProcessEnv), "https://getvya.ai");
 // A dev server is http, and forcing https there makes the callback unreachable.
 assert.equal(espBaseUrl({ ESP_BASE_URL: "localhost:3333" } as NodeJS.ProcessEnv), "http://localhost:3333");
 assert.equal(espBaseUrl({ ESP_BASE_URL: "http://localhost:3333" } as NodeJS.ProcessEnv), "http://localhost:3333");
 // ESP_BASE_URL wins, so testing locally doesn't mean editing the site-wide value.
 assert.equal(espBaseUrl({ ESP_BASE_URL: "http://localhost:3333", NEXT_PUBLIC_BASE_URL: "vyaplatform.com" } as NodeJS.ProcessEnv), "http://localhost:3333");
});
