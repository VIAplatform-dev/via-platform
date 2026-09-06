// Keep the store's own email tool current, one person at a time.
//
// The full sync is for setting up and for catching up. This is the everyday path: someone
// subscribes, buys, or unsubscribes on VYA, and their record in Klaviyo or Mailchimp changes within
// the second — so a store's flows fire on real state rather than on a list that's a day behind.
//
// Deliberately best-effort and never awaited by anything a shopper is waiting on. If Klaviyo is
// down, an unsubscribe on VYA still succeeds; the next full sync repairs it.
import { espAuth } from "./esp-auth";
import { getEspConnection } from "./esp-db";
import { vyaShouldSend, type EmailKind } from "./email-ownership";
import { pushOne } from "./esp-client";
import type { Contact } from "./esp-core";

export function mirrorToEsp(storeSlug: string, contact: Contact): void {
 void (async () => {
  try {
   const r = await espAuth(storeSlug);
   if (!r?.auth || !r.conn.autoSync || !r.conn.listId) return;
   await pushOne(r.conn.provider, r.auth, r.conn.listId, contact);
  } catch { /* the next full sync fixes it */ }
 })();
}


/**
 * Whether VYA should send a given email itself.
 *
 * Everything that sends a MARKETING email asks this first. Transactional callers don't need to —
 * `vyaShouldSend` always says yes for those — but asking is harmless and makes the rule visible at
 * the call site.
 */
export async function vyaSends(storeSlug: string, kind: EmailKind): Promise<boolean> {
 try {
  const c = await getEspConnection(storeSlug);
  return vyaShouldSend(kind, {
   // A connection with no list chosen isn't sending anything, so VYA must keep going.
   espConnected: Boolean(c && c.listId),
   handOverMarketing: c?.handOverMarketing !== false,
  });
 } catch {
  // If we can't tell, SEND. A missed marketing email is a smaller harm than silence caused by a
  // database hiccup — and the duplicate case needs a working connection to happen at all.
  return true;
 }
}
