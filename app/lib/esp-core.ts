// ───────────────────────────────────────────────────────────────────────────
// Klaviyo and Mailchimp — a store's own email tool.
//
// Plenty of shops already run their marketing from one of these, with flows and segments they've
// spent a year tuning. Asking them to move that into VYA to use VYA is a bad trade, and pretending
// we'll replace Klaviyo is worse. So VYA becomes the SOURCE OF TRUTH for who their customers are and
// what they bought, and pushes that to whichever tool they already send from.
//
// What this deliberately does NOT do: send campaigns through their account. Their templates, their
// flows, their send times — a campaign composed here and pushed there would fight everything they've
// built, and every failure would look like ours. Audience and purchase data is the part they can't
// get anywhere else.
//
// The two providers differ in ways that matter, which is most of what this file encodes:
//  · Mailchimp keys carry their own datacentre ("...-us21") and the API host is derived from it.
//    A key without that suffix cannot be used, and saying so up front beats a 401 later.
//  · Mailchimp addresses a member by the MD5 of the lowercased email — not a hash for secrecy, it's
//    how their URLs are built.
//  · Klaviyo is one host for everyone, keys start "pk_", and it wants a dated revision header.
//
// Pure: no network. The client that makes the calls is esp-client.ts.
// ───────────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";

export type EspProvider = "klaviyo" | "mailchimp";

export const PROVIDERS: { key: EspProvider; name: string; keyHint: string; where: string }[] = [
 {
  key: "klaviyo", name: "Klaviyo",
  keyHint: "Starts with pk_",
  where: "Klaviyo → Settings → API keys → Create private API key. It needs write access to Profiles and Lists.",
 },
 {
  key: "mailchimp", name: "Mailchimp",
  keyHint: "Ends with a dash and your region, like -us21",
  where: "Mailchimp → Account → Extras → API keys → Create a key.",
 },
];

export type KeyCheck = { ok: true } | { ok: false; reason: string };

/**
 * Is this even the right shape of key?
 *
 * Checked before we call anyone, because "that isn't a Klaviyo key, it's a Mailchimp one" is a far
 * more useful thing to read than "401 Unauthorized" — and pasting the wrong one into the wrong box
 * is the single most common way this goes wrong.
 */
export function checkKey(provider: EspProvider, key: string): KeyCheck {
 const k = (key || "").trim();
 if (!k) return { ok: false, reason: "Paste your API key first." };
 if (provider === "klaviyo") {
  if (/-[a-z]{2}\d{1,2}$/i.test(k)) return { ok: false, reason: "That looks like a Mailchimp key. Klaviyo keys start with pk_." };
  if (!/^pk_[A-Za-z0-9]{10,}$/.test(k)) return { ok: false, reason: "A Klaviyo private key starts with pk_ — check you copied the whole thing." };
  return { ok: true };
 }
 if (/^pk_/.test(k)) return { ok: false, reason: "That looks like a Klaviyo key. Mailchimp keys end with your region, like -us21." };
 if (!/^[A-Za-z0-9]{16,}-[a-z]{2}\d{1,2}$/i.test(k)) {
  return { ok: false, reason: "A Mailchimp key ends with a dash and your region, like -us21. Copy the whole key." };
 }
 return { ok: true };
}

/** Mailchimp's API host lives in the key's suffix. No suffix, no host — hence the check above. */
export function mailchimpHost(key: string): string | null {
 const dc = (key || "").trim().split("-").pop();
 return dc && /^[a-z]{2}\d{1,2}$/i.test(dc) ? `https://${dc.toLowerCase()}.api.mailchimp.com/3.0` : null;
}

/** How Mailchimp names a member in a URL. Lowercased first, or it addresses the wrong record. */
export function mailchimpMemberId(email: string): string {
 return createHash("md5").update(String(email || "").trim().toLowerCase()).digest("hex");
}

/** Never log or return a key in full. Enough to recognise which one is connected, and no more. */
export function maskKey(key: string): string {
 const k = (key || "").trim();
 if (k.length <= 8) return "••••";
 return `${k.slice(0, 5)}••••${k.slice(-4)}`;
}

export type Contact = {
 email: string;
 name?: string | null;
 phone?: string | null;
 subscribed: boolean;
 orders?: number;
 spentCents?: number;
 lastOrderAt?: string | null;
 tags?: string[];
};

const firstLast = (name: string | null | undefined) => {
 const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
 return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
};

/**
 * One contact, as Klaviyo wants it.
 *
 * What they spent goes in as properties rather than events: an event stream would be a second,
 * conflicting history of their orders, and VYA already holds the real one.
 */
export function klaviyoProfile(c: Contact) {
 const { first, last } = firstLast(c.name);
 return {
  type: "profile",
  attributes: {
   email: c.email.trim().toLowerCase(),
   ...(first ? { first_name: first } : {}),
   ...(last ? { last_name: last } : {}),
   ...(c.phone ? { phone_number: c.phone } : {}),
   properties: {
    vya_orders: c.orders ?? 0,
    vya_spent: Number(((c.spentCents ?? 0) / 100).toFixed(2)),
    ...(c.lastOrderAt ? { vya_last_order: c.lastOrderAt } : {}),
    ...(c.tags?.length ? { vya_tags: c.tags } : {}),
   },
  },
 };
}

/** One contact, as Mailchimp wants it. `status_if_new` so a resync never resubscribes someone. */
export function mailchimpMember(c: Contact) {
 const { first, last } = firstLast(c.name);
 return {
  email_address: c.email.trim().toLowerCase(),
  // Existing members keep whatever status they already have — including "unsubscribed", which we
  // must never overwrite. A sync that resubscribes people is how a store gets reported for spam.
  status_if_new: c.subscribed ? "subscribed" : "unsubscribed",
  merge_fields: {
   ...(first ? { FNAME: first } : {}),
   ...(last ? { LNAME: last } : {}),
  },
  ...(c.tags?.length ? { tags: c.tags.slice(0, 10) } : {}),
 };
}

/** Mailchimp takes 500 at a time; Klaviyo's bulk job takes 1000. Batched to the smaller of the two. */
export const BATCH = 500;

export function batches<T>(items: T[], size = BATCH): T[][] {
 const out: T[][] = [];
 for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
 return out;
}

/**
 * Who to send.
 *
 * Unsubscribed people go too, marked unsubscribed, because a store's other tool needs to know NOT to
 * email them — leaving them out means the ESP keeps sending to someone who opted out here.
 */
export function syncable(contacts: Contact[]): Contact[] {
 const seen = new Set<string>();
 return contacts.filter((c) => {
  const e = String(c.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  if (seen.has(e)) return false;
  seen.add(e);
  return true;
 });
}
