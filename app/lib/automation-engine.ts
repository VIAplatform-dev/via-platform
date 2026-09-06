import { sendStoreCampaign, sendStoreAutomationEmail, sendStoreNewArrivals, getStoreEmailBrand } from "./email";
import { vyaSends } from "./esp-mirror";
import { resolveStoreSender } from "./email-settings-db";
import { getCustomAutomationsForTrigger, isAutomationEnabled } from "./automations-db";
import { listCustomerProfiles } from "./store-customers-db";
import { getStorefrontBySlug } from "./storefront-db";
import type { AbandonedCart } from "./checkout-attempts-db";

const NEW_ARRIVALS_BASE = "https://vyaplatform.com";

// The recommerce automation engine: turns a store's automation settings + custom
// triggers into actually-sent emails, honoring the on/off toggles and each customer's
// email-subscription status. Sends AS the store (their name + verified domain when set,
// else VYA's shared domain), with replies routed to the store.

// {{name}}, {{item}} … → value.
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");

/**
 * Fire every active custom automation for an event, to one recipient. Used by the
 * per-customer triggers (a new customer, a placed order). Returns emails sent.
 */
export async function fireAutomationTrigger(
 storeSlug: string,
 trigger: string,
 recipient: { email: string; name?: string | null },
 vars: Record<string, string> = {},
): Promise<number> {
 if (!recipient.email || !recipient.email.includes("@")) return 0;
 const autos = await getCustomAutomationsForTrigger(storeSlug, trigger).catch(() => []);
 if (!autos.length) return 0;
 // A store that hands marketing to Klaviyo or Mailchimp gets these from there instead. Sending
 // both is how a shopper receives the same welcome twice, from the same shop, minutes apart.
 if (!(await vyaSends(storeSlug, "custom-automation"))) return 0;
 const { fromName, fromAddress, replyTo, website } = await resolveStoreSender(storeSlug);
 if (!replyTo) return 0;
 const brand = await getStoreEmailBrand(storeSlug).catch(() => undefined);
 const v = { name: recipient.name || "there", ...vars };
 let sent = 0;
 for (const a of autos) {
 // The shared automated-email format, not the campaign chrome: a campaign is a thing the store
 // designed and sent by hand, an automation is one the store never sees go out. They should look
 // like the shop, not like two different senders.
 const r = await sendStoreAutomationEmail({ storeSlug, storeName: fromName, storeEmail: replyTo, fromAddress, subject: fill(a.subject, v), body: fill(a.body, v), link: website, recipients: [recipient.email], brand }).catch(() => null);
 if (r) sent += r.sent;
 }
 return sent;
}

/**
 * Daily new-listings digest → the store's SUBSCRIBED customers, if the built-in
 * "new arrivals" flow is on OR a custom "new_listing" automation is active. Batched,
 * so a whole drop is one email — never one per publish.
 */
export type NewListingItem = { id: string; title: string; image: string | null; priceCents: number; currency: string };
// testRecipient: send only to that address, skipping the enabled/subscriber gates — for previews.
export async function sendNewListingsDigest(storeSlug: string, newItems: NewListingItem[], testRecipient?: string): Promise<{ sent: number } | null> {
 if (!newItems.length) return null;
 const custom = await getCustomAutomationsForTrigger(storeSlug, "new_listing").catch(() => []);
 if (!testRecipient) {
 const builtinOn = await isAutomationEnabled(storeSlug, "new_arrivals").catch(() => true);
 if (!builtinOn && custom.length === 0) return null;
 }

 const { fromName, fromAddress, replyTo, website } = await resolveStoreSender(storeSlug);
 if (!replyTo && !testRecipient) return null;
 let recipients: string[];
 if (testRecipient) {
 recipients = [testRecipient];
 } else {
 const profiles = await listCustomerProfiles(storeSlug).catch(() => []);
 recipients = [...new Set(profiles.filter((c) => c.subscribed && c.email.includes("@")).map((c) => c.email))];
 }
 if (!recipients.length) return null;
 // Their tool sends new arrivals now — and has the pieces, because the store sync sends them.
 // A test send is still allowed: the seller asked for that one specifically.
 if (!testRecipient && !(await vyaSends(storeSlug, "new-arrivals"))) return null;

 // Link each piece to its storefront product page when the store has a live storefront; else the
 // store's own site, else VYA.
 const sf = await getStorefrontBySlug(storeSlug).catch(() => null);
 const itemUrl = (id: string) => (sf?.handle ? `${NEW_ARRIVALS_BASE}/s/${sf.handle}/p/${id}` : (website || NEW_ARRIVALS_BASE));
 const shopUrl = sf?.handle ? `${NEW_ARRIVALS_BASE}/s/${sf.handle}/shop` : website;
 const products = newItems.slice(0, 12).map((i) => ({ title: i.title, image: i.image, priceCents: i.priceCents, currency: i.currency, url: itemUrl(i.id) }));

 // The store's own logo, colours and fonts — the same brand every other automatic email uses.
 const brand = await getStoreEmailBrand(storeSlug).catch(() => undefined);
 const subject = custom[0]?.subject?.trim() || `New arrivals from ${fromName}`;
 // Plain, and true whatever the store sells. The old default sold at the reader — "Fresh one-of-one
 // pieces just landed. Shop them before they're gone." — which is a voice most stores wouldn't pick.
 const count = newItems.length;
 const intro = custom[0]?.body?.trim() || `${count} new ${count === 1 ? "piece" : "pieces"} just landed.`;
 const r = await sendStoreNewArrivals({ storeName: fromName, storeEmail: replyTo, fromAddress, subject, intro, products, shopUrl, recipients, brand }).catch(() => null);
 return r ? { sent: r.sent } : null;
}

const CHECKOUT_BASE = "https://vyaplatform.com";

/**
 * Nudge a shopper who opened checkout for a one-of-one piece but didn't finish —
 * only if the store's "abandoned cart" flow is on. A custom "order_placed"-style
 * automation could layer on later; this covers the built-in flow.
 */
export async function sendAbandonedCartEmail(cart: AbandonedCart, opts: { force?: boolean } = {}): Promise<boolean> {
 // Manual sends (the seller clicking "Send reminder") bypass the automation toggle; the cron respects it.
 if (!opts.force && !(await isAutomationEnabled(cart.storeSlug, "abandoned_cart").catch(() => true))) return false;
 // The one most likely to be sent twice: a connected store's tool has the basket and its own
 // recovery timing, so ours stands down. A seller pressing "Send reminder" herself still sends —
 // she's looking at the person and has decided.
 if (!opts.force && !(await vyaSends(cart.storeSlug, "abandoned-basket"))) return false;
 if (!cart.email.includes("@")) return false;
 const { fromName, fromAddress, replyTo } = await resolveStoreSender(cart.storeSlug);
 if (!replyTo) return false;
 const brand = await getStoreEmailBrand(cart.storeSlug).catch(() => undefined);
 const piece = cart.itemTitle || "your piece";
 const subject = `${piece} is still in your basket`;
 // First line becomes the headline, the rest sits under it — see sendStoreAutomationEmail.
 const body = `You left ${piece} in your basket.\nIt's still here if you'd like it.`;
 const r = await sendStoreAutomationEmail({ storeSlug: cart.storeSlug, storeName: fromName, storeEmail: replyTo, fromAddress, subject, body, link: `${CHECKOUT_BASE}/checkout?item=${cart.itemId}`, recipients: [cart.email], brand }).catch(() => null);
 return !!r && r.sent > 0;
}
