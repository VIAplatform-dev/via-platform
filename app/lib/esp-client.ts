// The calls to Klaviyo and Mailchimp. Everything that decides anything is in esp-core.ts.
//
// Every function returns a result rather than throwing: the caller is a seller pressing a button,
// and "your key doesn't have permission to write profiles" is something she can fix, where a stack
// trace isn't.
import { mailchimpMemberId, klaviyoProfile, mailchimpMember, batches, type Contact, type EspProvider } from "./esp-core";

const KLAVIYO = "https://a.klaviyo.com/api";
// Klaviyo versions its API by date and rejects a request without one.
const KLAVIYO_REVISION = "2024-10-15";

export type EspList = { id: string; name: string; members?: number };
export type Verified = { ok: true; account: string; lists: EspList[] } | { ok: false; reason: string };

const timeout = (ms = 15000) => AbortSignal.timeout(ms);

/** Check the key works AND fetch the lists, because a connection with no list to write to is useless. */
export async function verify(provider: EspProvider, auth: { headers: Record<string, string>; host: string | null }): Promise<Verified> {
 try {
  if (provider === "klaviyo") {
   const r = await fetch(`${KLAVIYO}/lists/`, {
    headers: { ...auth.headers, revision: KLAVIYO_REVISION, accept: "application/json" },
    signal: timeout(),
   });
   if (r.status === 401 || r.status === 403) return { ok: false, reason: "Klaviyo has stopped accepting this connection. Connect it again." };
   if (!r.ok) return { ok: false, reason: `Klaviyo said ${r.status}. Try again in a moment.` };
   const d = await r.json();
   const lists: EspList[] = (d?.data || []).map((l: { id: string; attributes?: { name?: string } }) => ({ id: String(l.id), name: String(l.attributes?.name || "Untitled list") }));
   return { ok: true, account: "Klaviyo", lists };
  }

  const host = auth.host;
  if (!host) return { ok: false, reason: "We don't know which Mailchimp server this account is on. Connect it again." };
  const me = await fetch(`${host}/`, { headers: auth.headers, signal: timeout() });
  if (me.status === 401) return { ok: false, reason: "Mailchimp has stopped accepting this connection. Connect it again." };
  if (!me.ok) return { ok: false, reason: `Mailchimp said ${me.status}. Try again in a moment.` };
  const acct = await me.json();
  const r = await fetch(`${host}/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count`, { headers: auth.headers, signal: timeout() });
  const d = r.ok ? await r.json() : { lists: [] };
  const lists: EspList[] = (d?.lists || []).map((l: { id: string; name: string; stats?: { member_count?: number } }) => ({
   id: String(l.id), name: String(l.name || "Untitled audience"), members: l.stats?.member_count,
  }));
  return { ok: true, account: String(acct?.account_name || "Mailchimp"), lists };
 } catch (e) {
  return { ok: false, reason: e instanceof Error && e.name === "TimeoutError" ? "They didn't answer in time. Try again." : "Couldn't reach them just now." };
 }
}

export type PushResult = { ok: boolean; sent: number; failed: number; reason?: string };

/** Send contacts to one list. Batched, and one failed batch doesn't lose the rest. */
export async function pushContacts(provider: EspProvider, auth: { headers: Record<string, string>; host: string | null }, listId: string, contacts: Contact[]): Promise<PushResult> {
 let sent = 0, failed = 0, reason: string | undefined;

 for (const batch of batches(contacts)) {
  try {
   if (provider === "klaviyo") {
    // Their bulk endpoint takes profiles and the list in one job, and answers 202 — accepted, not
    // finished. There's nothing to poll for here: a profile that fails validation is dropped by
    // them, and re-running the sync is the fix.
    const r = await fetch(`${KLAVIYO}/profile-bulk-import-jobs/`, {
     method: "POST",
     headers: { ...auth.headers, revision: KLAVIYO_REVISION, "content-type": "application/json", accept: "application/json" },
     body: JSON.stringify({
      data: {
       type: "profile-bulk-import-job",
       attributes: { profiles: { data: batch.map(klaviyoProfile) } },
       relationships: { lists: { data: [{ type: "list", id: listId }] } },
      },
     }),
     signal: timeout(30000),
    });
    if (r.ok || r.status === 202) sent += batch.length;
    else { failed += batch.length; reason = reason || `Klaviyo said ${r.status}.`; }
    continue;
   }

   const host = auth.host;
   if (!host) return { ok: false, sent, failed: contacts.length, reason: "We don't know which Mailchimp server this account is on." };
   const r = await fetch(`${host}/lists/${encodeURIComponent(listId)}`, {
    method: "POST",
    headers: { ...auth.headers, "content-type": "application/json" },
    // update_existing so a resync refreshes what they spent without touching their subscribe state.
    body: JSON.stringify({ members: batch.map(mailchimpMember), update_existing: true }),
    signal: timeout(30000),
   });
   if (r.ok) {
    const d = await r.json().catch(() => null);
    sent += Number(d?.total_created ?? 0) + Number(d?.total_updated ?? 0) || batch.length;
    const errs = Number(d?.error_count ?? 0);
    if (errs) { failed += errs; reason = reason || String(d?.errors?.[0]?.error || "Some contacts were refused."); }
   } else {
    failed += batch.length;
    reason = reason || `Mailchimp said ${r.status}.`;
   }
  } catch {
   failed += batch.length;
   reason = reason || "Couldn't reach them for part of the list.";
  }
 }
 return { ok: failed === 0, sent, failed, reason };
}

/** Add or update ONE person — used when someone subscribes, so the other tool learns about them now. */
export async function pushOne(provider: EspProvider, auth: { headers: Record<string, string>; host: string | null }, listId: string, contact: Contact): Promise<boolean> {
 if (provider === "klaviyo") return (await pushContacts(provider, auth, listId, [contact])).ok;
 if (!auth.host) return false;
 try {
  const r = await fetch(`${auth.host}/lists/${encodeURIComponent(listId)}/members/${mailchimpMemberId(contact.email)}`, {
   method: "PUT",
   headers: { ...auth.headers, "content-type": "application/json" },
   body: JSON.stringify(mailchimpMember(contact)),
   signal: timeout(),
  });
  return r.ok;
 } catch { return false; }
}


/**
 * Which Mailchimp server this account lives on.
 *
 * There is no way to know it from the token: their API host is built from a per-account datacentre
 * ("us21"), and this endpoint is the only place it's published. Called once, right after the code
 * exchange, and stored — every later call needs it.
 */
export async function mailchimpMetadata(accessToken: string): Promise<{ dc: string; accountName: string | null } | null> {
 try {
  const r = await fetch("https://login.mailchimp.com/oauth2/metadata", {
   headers: { Authorization: `OAuth ${accessToken}` },
   signal: timeout(),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const dc = String(d?.dc || "");
  return dc ? { dc, accountName: d?.accountname ? String(d.accountname) : null } : null;
 } catch { return null; }
}

/** Klaviyo's account name, for showing which account is connected. Best-effort. */
export async function klaviyoAccountName(headers: Record<string, string>): Promise<string | null> {
 try {
  const r = await fetch(`${KLAVIYO}/accounts/`, { headers: { ...headers, revision: KLAVIYO_REVISION, accept: "application/json" }, signal: timeout() });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.data?.[0]?.attributes?.contact_information?.organization_name || null;
 } catch { return null; }
}

// ── VYA as a connected store ────────────────────────────────────────────────
// Mailchimp only. Klaviyo models the same ground as catalogues and events, which is a separate job.

import { mailchimpStore, mailchimpCustomer, mailchimpProduct, mailchimpOrder, mailchimpCart, storeId, commerceReady,
 type StoreInfo, type CommerceCustomer, type CommerceProduct, type CommerceOrder } from "./esp-commerce";

type Auth = { headers: Record<string, string>; host: string | null };

/** PUT-then-POST: their upsert. POST alone fails once the object exists, which is every sync but the first. */
async function upsert(auth: Auth, collection: string, id: string, body: unknown): Promise<boolean> {
 if (!auth.host) return false;
 const headers = { ...auth.headers, "content-type": "application/json" };
 try {
  const put = await fetch(`${auth.host}${collection}/${encodeURIComponent(id)}`, {
   method: "PATCH", headers, body: JSON.stringify(body), signal: timeout(20000),
  });
  if (put.ok) return true;
  // 404 means it doesn't exist yet, which is the only case where creating is right.
  if (put.status !== 404) return false;
  const post = await fetch(`${auth.host}${collection}`, { method: "POST", headers, body: JSON.stringify(body), signal: timeout(20000) });
  return post.ok;
 } catch { return false; }
}

/** Create or update the store object itself. Everything else hangs off it, so this goes first. */
export async function syncStore(auth: Auth, info: StoreInfo): Promise<boolean> {
 return upsert(auth, "/ecommerce/stores", storeId(info.slug), mailchimpStore(info));
}

export async function syncProducts(auth: Auth, slug: string, products: CommerceProduct[]): Promise<{ ok: number; failed: number }> {
 const sid = storeId(slug);
 let ok = 0, failed = 0;
 // Sequential on purpose: their per-account rate limit is modest, and a burst that trips it fails
 // the whole run rather than slowing it.
 for (const p of products) {
  (await upsert(auth, `/ecommerce/stores/${sid}/products`, p.id, mailchimpProduct(p))) ? ok++ : failed++;
 }
 return { ok, failed };
}

export async function syncCustomers(auth: Auth, slug: string, customers: CommerceCustomer[]): Promise<{ ok: number; failed: number }> {
 const sid = storeId(slug);
 let ok = 0, failed = 0;
 for (const c of customers) {
  const m = mailchimpCustomer(c);
  (await upsert(auth, `/ecommerce/stores/${sid}/customers`, m.id, m)) ? ok++ : failed++;
 }
 return { ok, failed };
}

export async function syncOrders(auth: Auth, slug: string, orders: CommerceOrder[]): Promise<{ ok: number; failed: number }> {
 const sid = storeId(slug);
 let ok = 0, failed = 0;
 for (const o of orders.filter(commerceReady)) {
  (await upsert(auth, `/ecommerce/stores/${sid}/orders`, o.id, mailchimpOrder(o))) ? ok++ : failed++;
 }
 return { ok, failed };
}

/**
 * An abandoned basket, and its removal once it converts.
 *
 * Deleting a cart when the order lands is not tidiness — a cart left behind keeps their recovery
 * automation chasing someone who has already paid.
 */
export async function syncCart(auth: Auth, slug: string, cart: CommerceOrder): Promise<boolean> {
 if (!commerceReady(cart)) return false;
 return upsert(auth, `/ecommerce/stores/${storeId(slug)}/carts`, cart.id, mailchimpCart(cart));
}

export async function deleteCart(auth: Auth, slug: string, cartId: string): Promise<boolean> {
 if (!auth.host) return false;
 try {
  const r = await fetch(`${auth.host}/ecommerce/stores/${storeId(slug)}/carts/${encodeURIComponent(cartId)}`, {
   method: "DELETE", headers: auth.headers, signal: timeout(),
  });
  return r.ok || r.status === 404;
 } catch { return false; }
}
