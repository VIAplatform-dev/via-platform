// New arrivals, waiting as a draft rather than sent behind the seller's back.
//
// Every other automatic email answers something a shopper did. "Here are four new pieces" is a shop
// choosing to advertise — which pieces, and how it reads, is the seller's call. So the pieces are
// gathered for her and left as a draft she can open, change and send.
//
// One draft at a time: if yesterday's is still unsent, it's updated rather than joined by a second.
// A seller who was away for a week should come back to one email about her new stock, not seven.
import { neon } from "@neondatabase/serverless";

const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

export async function draftNewArrivals(
 storeSlug: string,
 d: { subject: string; intro: string; count: number },
): Promise<void> {
 const sql = db();
 const existing = (await sql`SELECT id FROM store_campaigns
  WHERE store_slug = ${storeSlug} AND status = 'draft' AND segment = 'new-arrivals' LIMIT 1`
  .catch(() => [])) as Array<{ id: number }>;

 if (existing[0]) {
  await sql`UPDATE store_campaigns SET subject = ${d.subject}, body = ${d.intro}, created_at = now()
   WHERE id = ${existing[0].id}`.catch(() => {});
  return;
 }
 await sql`INSERT INTO store_campaigns (store_slug, subject, body, segment, status, recipient_count)
  VALUES (${storeSlug}, ${d.subject}, ${d.intro}, 'new-arrivals', 'draft', 0)`.catch(() => {});
}
