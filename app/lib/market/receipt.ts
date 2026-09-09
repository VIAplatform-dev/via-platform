import { marketTag, normalizeReceiptEmail, receiptCopy, type ReceiptInput } from "./receipt-core.ts";

// After a cash sale: the receipt, and the customer record. Both best-effort — a receipt that
// fails must never fail the sale it describes, so nothing here throws.
//
// The order already carries the email (finalizeMarketSale writes receipt_email onto the order as
// buyer_email), which is how the customer list attaches purchases to a person — the tag is what
// remembers WHERE they were met.

export type ReceiptDeps = {
 sendEmail: (storeSlug: string, m: { to: string; subject: string; body: string }) => Promise<void>;
 /** Upsert the customer row and add one tag. */
 tagCustomer: (storeSlug: string, email: string, tag: string) => Promise<void>;
};

export type ReceiptResult = { emailed: boolean; tagged: boolean; email: string | null; tag: string };

export async function sendCashReceipt(o: ReceiptInput & { storeSlug: string; receiptEmail: unknown }, deps: ReceiptDeps): Promise<ReceiptResult> {
 const tag = marketTag(o.sessionName);
 const email = normalizeReceiptEmail(o.receiptEmail);
 if (!email) return { emailed: false, tagged: false, email: null, tag };
 const copy = receiptCopy(o);
 const [emailed, tagged] = await Promise.all([
  deps.sendEmail(o.storeSlug, { to: email, subject: copy.subject, body: copy.body }).then(() => true, () => false),
  deps.tagCustomer(o.storeSlug, email, tag).then(() => true, () => false),
 ]);
 return { emailed, tagged, email, tag };
}

/** The real dependencies: the store-branded transactional shell, and the CRM tag upsert. */
export async function liveReceiptDeps(): Promise<ReceiptDeps> {
 const [{ sendStoreBrandedTransactional }, { addCustomerTag }] = await Promise.all([import("@/app/lib/email"), import("@/app/lib/store-customers-db")]);
 return {
  sendEmail: (storeSlug, m) => sendStoreBrandedTransactional(storeSlug, m),
  tagCustomer: (storeSlug, email, tag) => addCustomerTag(storeSlug, email, tag),
 };
}
