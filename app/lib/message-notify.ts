import { getInboxSettings } from "./storefront-settings-db";
import { sendStoreMessageNotification } from "./email";
import { sendLinqText, linqConfigured } from "./linq";
import { stores, storeContactEmails } from "./stores";

// The store's inbox lives in the getvya.ai Owner Workspace (not the marketplace host).
const OS_INBOX_URL = "https://getvya.ai/admin/inbox";

// Notify a store of an inbound buyer message: email (they reply from their inbox) PLUS an
// optional text to the seller's phone via the shared VYA Linq number. The conversation itself
// stays in the VYA inbox — the text is just a nudge, so there's no inbound routing. Best-effort,
// never throws; the text no-ops unless the store set a phone + Linq is configured.
export async function notifyStoreOfMessage(
 storeSlug: string,
 opts: { itemTitle: string | null; buyerName: string | null; message: string },
): Promise<void> {
 try {
 const store = stores.find((s) => s.slug === storeSlug);
 const storeName = store?.name || storeSlug;
 const storeEmail = storeContactEmails[storeSlug];
 const settings = await getInboxSettings(storeSlug).catch(() => null);

 if (storeEmail) {
 sendStoreMessageNotification({
 storeEmail,
 storeName,
 productTitle: opts.itemTitle,
 customerName: opts.buyerName,
 messageBody: opts.message,
 }).catch(() => {});
 }

 if (settings?.notifySms && settings.notifyPhone && linqConfigured()) {
 const about = opts.itemTitle ? ` about "${opts.itemTitle}"` : "";
 const preview = opts.message.length > 140 ? `${opts.message.slice(0, 140)}…` : opts.message;
 sendLinqText(settings.notifyPhone, `[${storeName}] New message${about}: "${preview}" — reply: ${OS_INBOX_URL}`).catch(() => {});
 }
 } catch {
 /* best-effort — a notification failure must never block the message */
 }
}
