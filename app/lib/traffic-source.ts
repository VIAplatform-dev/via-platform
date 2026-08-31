// Classify "where a visitor came from" from the referrer + any UTM tags. Pure and
// testable so the storefront tracker and any backfill share one source of truth.
// Tagged links (utm) win over the raw referrer because they're intentional.

export type SourceType = "Direct" | "Search" | "Social" | "Email" | "Paid" | "Referral";
export type ClassifiedSource = { type: SourceType; source: string; referrerHost: string };

// ── In-app browsers ────────────────────────────────────────────────────────
// The reason "Direct" swallows most social traffic. A tap from an Instagram bio
// or a TikTok profile opens inside that app's own webview, which sends NO
// referrer at all — so referrer-only classification files the visit as Direct
// and the seller never learns Instagram sent it. The app is, however, plainly
// identifiable in the user-agent, so we read it there when the referrer is
// silent. TikTok in particular has never once appeared in our data by referrer.
const IN_APP: { test: RegExp; type: SourceType; source: string }[] = [
 { test: /bytedancewebview|musical_ly|\btiktok\b/i, type: "Social", source: "TikTok" },
 { test: /instagram/i, type: "Social", source: "Instagram" },
 { test: /\bFBAN\b|\bFBAV\b|FB_IAB|FB4A/i, type: "Social", source: "Facebook" },
 { test: /pinterest/i, type: "Social", source: "Pinterest" },
 { test: /snapchat/i, type: "Social", source: "Snapchat" },
 { test: /\bLine\//i, type: "Social", source: "LINE" },
 { test: /\bTwitter\b/i, type: "Social", source: "X" },
 { test: /LinkedInApp/i, type: "Social", source: "LinkedIn" },
 { test: /\bReddit\b/i, type: "Social", source: "Reddit" },
 { test: /GSA\//i, type: "Search", source: "Google" },
];

/** The app a visit came from when the referrer is silent, or null when it's a plain browser. */
export function classifyInAppBrowser(userAgent: string | null | undefined): { type: SourceType; source: string } | null {
 const ua = userAgent || "";
 if (!ua) return null;
 for (const app of IN_APP) if (app.test.test(ua)) return { type: app.type, source: app.source };
 return null;
}

// Android apps hand over a package name instead of a hostname. Without this they
// read as a "Referral" from "Com.google.android.googlequicksearchbox".
const ANDROID_PACKAGES: Record<string, { type: SourceType; source: string }> = {
 "com.google.android.googlequicksearchbox": { type: "Search", source: "Google" },
 "com.google.android.gm": { type: "Email", source: "Email" },
 "com.instagram.android": { type: "Social", source: "Instagram" },
 "com.zhiliaoapp.musically": { type: "Social", source: "TikTok" },
 "com.facebook.katana": { type: "Social", source: "Facebook" },
 "com.pinterest": { type: "Social", source: "Pinterest" },
 "com.snapchat.android": { type: "Social", source: "Snapchat" },
};

// Hosts that look like a source but are really a round-trip back to us: the
// Google OAuth screen is where a sign-in bounces through, not where a shopper
// came from, and counting it as Search inflates Google with our own logins.
const AUTH_BOUNCE = new Set(["accounts.google.com", "appleid.apple.com", "login.microsoftonline.com"]);

// Search engines and social platforms we name explicitly; everything else with a
// referrer becomes a Referral keyed by its domain.
const SEARCH: Record<string, string> = {
 google: "Google", bing: "Bing", duckduckgo: "DuckDuckGo", yahoo: "Yahoo",
 ecosia: "Ecosia", baidu: "Baidu", yandex: "Yandex", brave: "Brave",
 startpage: "Startpage", qwant: "Qwant",
};
const SOCIAL: Record<string, string> = {
 instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", pinterest: "Pinterest",
 youtube: "YouTube", reddit: "Reddit", linkedin: "LinkedIn", snapchat: "Snapchat",
 threads: "Threads", tumblr: "Tumblr", whatsapp: "WhatsApp",
};

function hostOf(u: string): string {
 if (!u) return "";
 try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); }
 catch { return u.replace(/^www\./, "").toLowerCase().split("/")[0]; }
}

function titleCase(s: string): string {
 const t = s.trim();
 return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

// Match a hostname against the known search/social tables. Short-link + mobile
// subdomains (t.co, l.instagram.com, m.facebook.com) resolve to the right brand.
function matchKnown(host: string): { type: SourceType; source: string } | null {
 if (!host) return null;
 // X / Twitter short + canonical domains.
 if (host === "x.com" || host === "t.co" || host.includes("twitter.")) return { type: "Social", source: "X" };
 if (host.includes("lnkd.in")) return { type: "Social", source: "LinkedIn" };
 for (const [k, v] of Object.entries(SEARCH)) if (host === `${k}.com` || host.includes(`${k}.`)) return { type: "Search", source: v };
 for (const [k, v] of Object.entries(SOCIAL)) if (host.includes(k) || host === `${k.slice(0, 2)}.com`) return { type: "Social", source: v };
 return null;
}

export function classifySource(input: { referrer?: string | null; utmSource?: string | null; utmMedium?: string | null; selfHost?: string | null; userAgent?: string | null }): ClassifiedSource {
 const referrerHost = hostOf(input.referrer || "");
 const med = (input.utmMedium || "").toLowerCase().trim();
 const src = (input.utmSource || "").toLowerCase().trim();

 // 1. Intentional tags win. Email + paid by medium.
 if (med.includes("email") || src.includes("email") || src.includes("newsletter") || src.includes("klaviyo")) return { type: "Email", source: "Email", referrerHost };
 if (med === "cpc" || med === "ppc" || med === "paid" || med === "ads" || med.includes("paid")) return { type: "Paid", source: titleCase(src) || "Paid", referrerHost };

 // 2. A named utm_source — match it to a platform, else treat it as a referral source.
 if (src) {
 const known = matchKnown(src.includes(".") ? src : `${src}.com`);
 if (known) return { ...known, referrerHost };
 return { type: "Referral", source: titleCase(src), referrerHost };
 }

 // 3. The referrer, when there is a usable one.
 const inApp = classifyInAppBrowser(input.userAgent);
 const self = (input.selfHost || "").replace(/^www\./, "").toLowerCase().split(":")[0];
 const selfReferred = Boolean(self) && referrerHost === self;

 // No referrer, our own pages, or an auth bounce — none of those say where the
 // shopper came from, so the in-app browser is the better answer when we have one.
 if (!referrerHost || selfReferred || AUTH_BOUNCE.has(referrerHost)) {
 if (inApp) return { ...inApp, referrerHost };
 return { type: "Direct", source: "Direct", referrerHost };
 }

 const androidApp = ANDROID_PACKAGES[referrerHost];
 if (androidApp) return { ...androidApp, referrerHost };

 // Both VYA hosts are the marketplace sending a shopper on to a store.
 if (referrerHost.includes("vyaplatform") || referrerHost.includes("getvya")) return { type: "Referral", source: "VYA", referrerHost };
 const known = matchKnown(referrerHost);
 if (known) return { ...known, referrerHost };
 // A generic referrer beats nothing, but a named app beats a generic referrer.
 if (inApp) return { ...inApp, referrerHost };
 return { type: "Referral", source: referrerHost, referrerHost };
}

// ───────────────────────────────────────────────────────────────────────────
// Stored-source normalization — ONE definition, shared by every reader.
//
// Historically four different places each had their own alias map and their own
// hardcoded list of junk values to ignore (the marketplace tracker, /api/track-utm,
// the admin customers query, and the customers response mapper). They drifted, which
// is why the Source Attribution panel showed "Chrome / Safari / Edge" as traffic
// sources while the customer list — which filtered those out — disagreed with it.
//
// Browser names are in the data because the page tracker used to label untagged
// traffic by user-agent. That's fixed at the write side, but ~months of rows still
// carry it, so every READER collapses them here rather than anyone rewriting history.
// ───────────────────────────────────────────────────────────────────────────

/** Short-hand link slugs → the canonical platform name. */
export const SOURCE_ALIASES: Record<string, string> = {
 ig: "instagram", fb: "facebook", tw: "twitter", x: "twitter",
 tt: "tiktok", yt: "youtube", li: "linkedin", pin: "pinterest",
};

/**
 * Values that are NOT a traffic source, and must never be shown as one.
 * Browser names (the old user-agent fallback), plus placeholders and the names of
 * the capture surfaces themselves ("register", "giveaway_modal" — those say WHERE the
 * row was written, not where the person came from).
 */
export const LEGACY_NON_SOURCES = [
 "chrome", "safari", "firefox", "edge", "samsung", "web", "opera", "browser",
 "direct", "unknown", "none", "null", "waitlist", "register", "giveaway_modal", "",
];
const NON_SOURCE = new Set(LEGACY_NON_SOURCES);

/** Lowercase, alias-resolved slug. "IG" → "instagram". Empty string when there's nothing. */
export function canonicalSource(raw: string | null | undefined): string {
 const s = (raw ?? "").toLowerCase().trim();
 if (!s) return "";
 return SOURCE_ALIASES[s] ?? s;
}

/** True when the stored value is a browser name / placeholder rather than a real source. */
export function isRealSource(raw: string | null | undefined): boolean {
 const s = canonicalSource(raw);
 return Boolean(s) && !NON_SOURCE.has(s);
}

/**
 * The display label for a stored source. Anything that isn't a real source — a browser
 * name, a placeholder, an empty cell — becomes "Direct", because that is what it
 * actually means: we never learned where they came from.
 */
export function normalizeStoredSource(raw: string | null | undefined): string {
 const s = canonicalSource(raw);
 if (!isRealSource(s)) return "Direct";
 if (s === "twitter") return "X";
 const known = SEARCH[s] || SOCIAL[s];
 if (known) return known;
 return titleCase(s);
}

// Email service providers, so a source of "mailchimp" channels as Email rather than
// falling through to Referral. The LABEL still says Mailchimp — only the grouping changes.
const EMAIL_SENDERS = ["email", "newsletter", "klaviyo", "mailchimp", "sendgrid", "resend", "mailerlite", "beehiiv", "substack_email"];

/** The channel a source belongs to — what the filter chips in the admin group by. */
export function sourceChannel(raw: string | null | undefined): SourceType {
 const s = canonicalSource(raw);
 if (!isRealSource(s)) return "Direct";
 if (EMAIL_SENDERS.some((e) => s.includes(e))) return "Email";
 if (SOCIAL[s] || s === "twitter") return "Social";
 if (SEARCH[s]) return "Search";
 return "Referral";
}

/**
 * Roll a list of per-source rows up by their normalized label, summing the numeric
 * fields. Legacy browser rows fold into a single "Direct" row instead of appearing as
 * four separate fake sources.
 */
export function rollUpBySource<T extends Record<string, unknown>>(
 rows: T[],
 sourceKey: keyof T,
 numericKeys: (keyof T)[],
): T[] {
 const byLabel = new Map<string, T>();
 for (const row of rows) {
  const label = normalizeStoredSource(row[sourceKey] as string | null);
  const existing = byLabel.get(label);
  if (!existing) {
   byLabel.set(label, { ...row, [sourceKey]: label } as T);
   continue;
  }
  for (const k of numericKeys) {
   (existing[k] as number) = Number(existing[k] ?? 0) + Number(row[k] ?? 0);
  }
 }
 return [...byLabel.values()];
}
