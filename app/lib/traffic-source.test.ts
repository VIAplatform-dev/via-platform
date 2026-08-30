import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySource } from "./traffic-source.ts";

test("no referrer → Direct", () => {
 const r = classifySource({ referrer: "", selfHost: "shop.com" });
 assert.equal(r.type, "Direct");
 assert.equal(r.source, "Direct");
});

test("google search → Search/Google", () => {
 const r = classifySource({ referrer: "https://www.google.com/search?q=vintage" });
 assert.equal(r.type, "Search");
 assert.equal(r.source, "Google");
});

test("duckduckgo → Search/DuckDuckGo", () => {
 assert.equal(classifySource({ referrer: "https://duckduckgo.com/" }).source, "DuckDuckGo");
});

test("instagram (incl. l.instagram.com) → Social/Instagram", () => {
 assert.equal(classifySource({ referrer: "https://l.instagram.com/" }).source, "Instagram");
 assert.equal(classifySource({ referrer: "https://instagram.com/" }).type, "Social");
});

test("t.co → Social/X", () => {
 assert.equal(classifySource({ referrer: "https://t.co/abc" }).source, "X");
});

test("unknown domain → Referral keyed by host", () => {
 const r = classifySource({ referrer: "https://blog.example.com/post" });
 assert.equal(r.type, "Referral");
 assert.equal(r.source, "blog.example.com");
});

test("internal referrer (self host) → Direct", () => {
 assert.equal(classifySource({ referrer: "https://shop.com/about", selfHost: "shop.com" }).type, "Direct");
});

test("utm_medium=email → Email", () => {
 assert.equal(classifySource({ referrer: "", utmMedium: "email" }).type, "Email");
});

test("utm_medium=cpc → Paid with source name", () => {
 const r = classifySource({ referrer: "", utmSource: "google", utmMedium: "cpc" });
 assert.equal(r.type, "Paid");
 assert.equal(r.source, "Google");
});

test("utm_source=tiktok (untagged medium) → Social/TikTok", () => {
 assert.equal(classifySource({ utmSource: "tiktok" }).source, "TikTok");
});

test("utm beats referrer", () => {
 const r = classifySource({ referrer: "https://google.com", utmSource: "instagram", utmMedium: "social" });
 assert.equal(r.source, "Instagram");
});

// ── In-app browsers ────────────────────────────────────────────────────────
// These carry no referrer, which is exactly why social traffic used to pile up
// under "Direct". The app name in the user-agent is the only signal there is.

test("a TikTok in-app tap is TikTok, not Direct", () => {
 const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 BytedanceWebview/d8a21c musical_ly_34.5.0";
 const r = classifySource({ referrer: "", userAgent: ua });
 assert.equal(r.type, "Social");
 assert.equal(r.source, "TikTok");
});

test("an Instagram in-app tap is Instagram, not Direct", () => {
 const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 340.0.0.19.109";
 assert.equal(classifySource({ referrer: "", userAgent: ua }).source, "Instagram");
});

test("a Facebook in-app tap is Facebook", () => {
 const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) [FBAN/FBIOS;FBAV/470.0.0.44.108]";
 assert.equal(classifySource({ referrer: "", userAgent: ua }).source, "Facebook");
});

test("a plain mobile browser with no referrer stays Direct", () => {
 const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
 assert.equal(classifySource({ referrer: "", userAgent: ua }).type, "Direct");
});

test("a real referrer still beats the in-app guess", () => {
 const ua = "Mozilla/5.0 (iPhone) Instagram 340.0.0.19.109";
 assert.equal(classifySource({ referrer: "https://www.google.com/search?q=vintage", userAgent: ua }).source, "Google");
});

test("Android app package referrers resolve to the app, not a hostname", () => {
 assert.equal(classifySource({ referrer: "android-app://com.google.android.googlequicksearchbox" }).source, "Google");
 assert.equal(classifySource({ referrer: "android-app://com.google.android.gm" }).type, "Email");
 assert.equal(classifySource({ referrer: "android-app://com.zhiliaoapp.musically" }).source, "TikTok");
});

test("the Google sign-in bounce is not counted as Search", () => {
 const r = classifySource({ referrer: "https://accounts.google.com/o/oauth2/v2/auth", selfHost: "shop.com" });
 assert.equal(r.type, "Direct");
});

test("an in-app tap that bounced through sign-in still credits the app", () => {
 const ua = "Mozilla/5.0 (iPhone) Instagram 340.0.0.19.109";
 assert.equal(classifySource({ referrer: "https://accounts.google.com/o/oauth2/v2/auth", userAgent: ua }).source, "Instagram");
});

test("both VYA hosts read as the marketplace referring on", () => {
 assert.equal(classifySource({ referrer: "https://vyaplatform.com/stores/x" }).source, "VYA");
 assert.equal(classifySource({ referrer: "https://getvya.ai/" }).source, "VYA");
});
