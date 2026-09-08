import { test } from "node:test";
import assert from "node:assert/strict";
import { sendCashReceipt, type ReceiptDeps } from "./receipt.ts";

// The receipt after a cash sale, with the mail and the customer list faked. What is tested is the
// GATE (no email → nothing happens, nothing is even attempted) and that neither half can fail the
// sale that caused it.

function fakes(o: { sendEmail?: ReceiptDeps["sendEmail"]; tagCustomer?: ReceiptDeps["tagCustomer"] } = {}) {
 const emails: { storeSlug: string; to: string; subject: string; body: string }[] = [];
 const tags: { storeSlug: string; email: string; tag: string }[] = [];
 const deps: ReceiptDeps = {
  sendEmail: o.sendEmail ?? (async (storeSlug, m) => { emails.push({ storeSlug, ...m }); }),
  tagCustomer: o.tagCustomer ?? (async (storeSlug, email, tag) => { tags.push({ storeSlug, email, tag }); }),
 };
 return { deps, emails, tags };
}

const SALE = {
 storeSlug: "sourcedbyscottie", storeName: "Sourced by Scottie", sessionName: "Brick Lane", currency: "GBP",
 lines: [{ title: "Fendi Baguette", saleCents: 12_000 }], amountCents: 12_000, tender: "cash" as const, tenderedCents: 15_000, changeCents: 3_000,
};

test("with an email, the receipt goes out and the customer is tagged with the market", async () => {
 const { deps, emails, tags } = fakes();
 const r = await sendCashReceipt({ ...SALE, receiptEmail: "Ana@Example.com" }, deps);
 assert.deepEqual(r, { emailed: true, tagged: true, email: "ana@example.com", tag: "market:brick-lane" });
 assert.equal(emails.length, 1);
 assert.equal(emails[0].to, "ana@example.com");
 assert.equal(emails[0].storeSlug, "sourcedbyscottie");
 assert.equal(emails[0].subject, "Your receipt from Sourced by Scottie");
 assert.match(emails[0].body, /Fendi Baguette/);
 assert.match(emails[0].body, /£150 given, £30 change/);
 assert.deepEqual(tags, [{ storeSlug: "sourcedbyscottie", email: "ana@example.com", tag: "market:brick-lane" }]);
});

test("no email, or a junk one, and nothing is attempted", async () => {
 const { deps, emails, tags } = fakes();
 assert.deepEqual(await sendCashReceipt({ ...SALE, receiptEmail: null }, deps), { emailed: false, tagged: false, email: null, tag: "market:brick-lane" });
 assert.deepEqual(await sendCashReceipt({ ...SALE, receiptEmail: "nope" }, deps), { emailed: false, tagged: false, email: null, tag: "market:brick-lane" });
 assert.equal(emails.length, 0);
 assert.equal(tags.length, 0);
});

test("a mail outage does not stop the tag, and neither failure throws", async () => {
 const { deps, tags } = fakes({ sendEmail: async () => { throw new Error("resend down"); } });
 const r = await sendCashReceipt({ ...SALE, receiptEmail: "ana@example.com" }, deps);
 assert.deepEqual(r, { emailed: false, tagged: true, email: "ana@example.com", tag: "market:brick-lane" });
 assert.equal(tags.length, 1);
 const broken = fakes({ tagCustomer: async () => { throw new Error("db down"); } });
 const r2 = await sendCashReceipt({ ...SALE, receiptEmail: "ana@example.com" }, broken.deps);
 assert.deepEqual(r2, { emailed: true, tagged: false, email: "ana@example.com", tag: "market:brick-lane" });
});
