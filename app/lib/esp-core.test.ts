import { test } from "node:test";
import assert from "node:assert/strict";
import { checkKey, mailchimpHost, mailchimpMemberId, maskKey, klaviyoProfile, mailchimpMember, syncable, batches } from "./esp-core.ts";

test("a key pasted into the wrong box is named, not sent", () => {
 // "401 Unauthorized" tells a seller nothing. This is the mistake people actually make.
 assert.match((checkKey("klaviyo", "abc123def456ghi789-us21") as { reason: string }).reason, /Mailchimp key/);
 assert.match((checkKey("mailchimp", "pk_abcdef123456") as { reason: string }).reason, /Klaviyo key/);
});

test("each provider's key shape is checked before anyone is called", () => {
 assert.equal(checkKey("klaviyo", "pk_abcdef1234567890").ok, true);
 assert.equal(checkKey("klaviyo", "pk_short").ok, false);
 assert.equal(checkKey("mailchimp", "abcdef1234567890abcdef-us21").ok, true);
 assert.match((checkKey("mailchimp", "abcdef1234567890abcdef") as { reason: string }).reason, /region/);
 assert.match((checkKey("klaviyo", "") as { reason: string }).reason, /Paste your API key/);
});

test("Mailchimp's host comes out of the key itself", () => {
 assert.equal(mailchimpHost("abcdef1234567890abcdef-us21"), "https://us21.api.mailchimp.com/3.0");
 assert.equal(mailchimpHost("abcdef1234567890abcdef"), null, "no region, no host");
});

test("a member id is the md5 of the LOWERCASED address", () => {
 // Their URLs are built from this. Hash the wrong case and you update nobody.
 assert.equal(mailchimpMemberId("Jane@Example.com"), mailchimpMemberId("jane@example.com"));
 assert.match(mailchimpMemberId("jane@example.com"), /^[0-9a-f]{32}$/);
});

test("a key is never shown in full", () => {
 assert.equal(maskKey("pk_abcdef1234567890"), "pk_ab••••7890");
 assert.equal(maskKey("short"), "••••");
});

test("a name splits into first and last, and a one-word name doesn't invent a surname", () => {
 assert.deepEqual(klaviyoProfile({ email: "a@b.com", name: "Jane Doe", subscribed: true }).attributes.first_name, "Jane");
 assert.equal(klaviyoProfile({ email: "a@b.com", name: "Cher", subscribed: true }).attributes.last_name, undefined);
});

test("what they spent goes over in whole currency, not cents", () => {
 const p = klaviyoProfile({ email: "a@b.com", subscribed: true, orders: 3, spentCents: 124050 });
 assert.equal(p.attributes.properties.vya_spent, 1240.5);
 assert.equal(p.attributes.properties.vya_orders, 3);
});

test("a resync never changes an existing subscription state", () => {
 // status_if_new, not status: someone who unsubscribed IN Mailchimp must stay unsubscribed, or a
 // sync quietly starts emailing people who opted out.
 const m = mailchimpMember({ email: "a@b.com", subscribed: true });
 assert.equal(m.status_if_new, "subscribed");
 assert.equal((m as Record<string, unknown>).status, undefined);
});

test("someone unsubscribed here is still sent, marked unsubscribed", () => {
 // Leaving them out means the other tool keeps emailing someone who opted out on VYA.
 const out = syncable([{ email: "a@b.com", subscribed: false }]);
 assert.equal(out.length, 1);
 assert.equal(mailchimpMember(out[0]).status_if_new, "unsubscribed");
});

test("rubbish addresses and duplicates never leave", () => {
 const out = syncable([
  { email: "a@b.com", subscribed: true },
  { email: "A@B.com", subscribed: true },
  { email: "not-an-email", subscribed: true },
  { email: "", subscribed: true },
 ]);
 assert.equal(out.length, 1);
});

test("big lists are cut into batches the APIs accept", () => {
 const many = Array.from({ length: 1201 }, (_, i) => ({ email: `x${i}@b.com`, subscribed: true }));
 const b = batches(many);
 assert.equal(b.length, 3);
 assert.equal(b[0].length, 500);
 assert.equal(b[2].length, 201);
});
