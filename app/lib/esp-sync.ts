// Push everything to the store's email tool, in one call.
//
// Extracted so the Apps page and the assistant do the SAME thing — two paths that "sync" but send
// different data is how a seller ends up with contacts in Mailchimp and no products.
import { espAuth } from "./esp-auth";
import { pushContacts, syncStore, syncProducts, syncOrders, syncCustomers } from "./esp-client";
import { syncable, type Contact } from "./esp-core";
import { recordEspSync } from "./esp-db";
import { listCustomerProfiles } from "./store-customers-db";
import { getSellerBySlug } from "./db/sellers";
import { listStorefrontItems } from "./db/inventory";
import { listSellerOrders } from "./db/orders";

export async function syncEspNow(storeSlug: string): Promise<{ ok: boolean; note: string; sent?: number }> {
 const r = await espAuth(storeSlug);
 if (!r) return { ok: false, note: "No email tool is connected." };
 if (!r.auth) return { ok: false, note: "That connection has stopped working — connect it again." };
 if (!r.conn.listId) return { ok: false, note: "Choose which list to sync into first." };

 const profiles = await listCustomerProfiles(storeSlug).catch(() => []);
 const contacts: Contact[] = syncable(profiles.map((p) => ({
  email: p.email, name: p.name, phone: p.phone, subscribed: p.subscribed,
  orders: p.orders, spentCents: p.spentCents, lastOrderAt: p.lastOrderAt, tags: p.tags,
 })));
 if (!contacts.length) return { ok: false, note: "You have no customers to send yet." };

 const push = await pushContacts(r.conn.provider, r.auth, r.conn.listId, contacts);

 // Mailchimp only: the store itself, so their product and abandoned-basket emails have something
 // to work with. Best-effort — a store that fails to sync mustn't fail the contacts that worked.
 let extra = "";
 if (r.conn.provider === "mailchimp") {
  try {
   const seller = await getSellerBySlug(storeSlug);
   if (seller && await syncStore(r.auth, { slug: storeSlug, name: seller.name || storeSlug, currency: "USD", email: seller.email ?? undefined, listId: r.conn.listId })) {
    const items = await listStorefrontItems(seller.id).catch(() => []);
    const p = await syncProducts(r.auth, storeSlug, items.slice(0, 500).map((i) => ({
     id: i.id, title: i.title, priceCents: i.priceCents ?? 0,
     image: (i.images as string[] | null)?.[0] ?? null,
     description: i.description ?? null, inStock: i.status !== "sold",
    })));
    const byEmail = new Map(profiles.map((x) => [x.email.toLowerCase(), x]));
    const orders = (await listSellerOrders(seller.id).catch(() => []))
     .filter((o) => o.buyerEmail && o.paidAt).slice(0, 500)
     .map((o) => {
      const prof = byEmail.get(String(o.buyerEmail).toLowerCase());
      return {
       id: String(o.id),
       customer: { email: String(o.buyerEmail), name: prof?.name ?? null, subscribed: prof?.subscribed ?? false, orders: prof?.orders, spentCents: prof?.spentCents },
       totalCents: o.amountCents ?? 0, currency: o.currency,
       placedAt: o.paidAt ? new Date(o.paidAt).toISOString() : null,
       lines: o.itemId ? [{ id: String(o.id), productId: String(o.itemId), priceCents: o.amountCents ?? 0 }] : [],
      };
     });
    const ord = await syncOrders(r.auth, storeSlug, orders);
    await syncCustomers(r.auth, storeSlug, contacts.map((x) => ({
     email: x.email, name: x.name, subscribed: x.subscribed, orders: x.orders, spentCents: x.spentCents,
    })));
    extra = ` · ${p.ok} pieces and ${ord.ok} orders`;
   }
  } catch { /* the contacts above still went */ }
 }

 const note = push.ok
  ? `${push.sent} contacts sent to ${r.conn.listName || "your list"}${extra}`
  : `${push.sent} sent, ${push.failed} failed — ${push.reason || "unknown"}`;
 await recordEspSync(storeSlug, note).catch(() => {});
 return { ok: push.ok, note, sent: push.sent };
}
