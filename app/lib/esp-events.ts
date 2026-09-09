// A sale, told to the store's email tool as it happens.
//
// Klaviyo builds its flows on EVENTS — "Placed Order" is what a post-purchase or win-back sequence
// waits for. A contact list without events means those flows never fire, so this is not optional
// extra credit; it's the difference between a connection that works and one that only looks
// connected.
//
// Mailchimp is different: it takes orders as objects on the connected store rather than as events,
// and that happens in the full sync. So this is Klaviyo-only by design, not by omission.
import { espAuth } from "./esp-auth";

const KLAVIYO_REVISION = "2024-10-15";

export async function syncOrderToKlaviyo(
 storeSlug: string,
 order: { email: string; name?: string | null; orderId: string | number; valueCents: number; itemTitle?: string | null; currency?: string },
): Promise<void> {
 try {
  if (!order.email) return;
  const r = await espAuth(storeSlug);
  if (!r?.auth || r.conn.provider !== "klaviyo") return;

  const parts = String(order.name || "").trim().split(/\s+/).filter(Boolean);
  await fetch("https://a.klaviyo.com/api/events/", {
   method: "POST",
   headers: { ...r.auth.headers, revision: KLAVIYO_REVISION, "content-type": "application/json", accept: "application/json" },
   body: JSON.stringify({
    data: {
     type: "event",
     attributes: {
      properties: {
       OrderId: String(order.orderId),
       ...(order.itemTitle ? { Item: order.itemTitle } : {}),
      },
      // Their name for the money on the event. Flows and revenue reports both read it.
      value: Math.round(order.valueCents) / 100,
      metric: { data: { type: "metric", attributes: { name: "Placed Order" } } },
      profile: {
       data: {
        type: "profile",
        attributes: {
         email: order.email.trim().toLowerCase(),
         ...(parts[0] ? { first_name: parts[0] } : {}),
         ...(parts.length > 1 ? { last_name: parts.slice(1).join(" ") } : {}),
        },
       },
      },
     },
    },
   }),
   signal: AbortSignal.timeout(10000),
  });
 } catch {
  // A sale must never fail because a marketing tool was slow. The full sync repairs the gap.
 }
}
