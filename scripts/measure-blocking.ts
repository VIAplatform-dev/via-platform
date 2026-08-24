/**
 * Where do the SAME-PIECE matches live, and can we read their prices?
 *
 * The claim under test: Lens reliably finds the exact garment, but the listings it finds sit on
 * hosts that refuse automated requests, so the price never arrives and the best evidence is
 * discarded for having no number.
 *
 * An earlier version of this check used invented URLs, where a 403 might only have meant "no such
 * listing". Every URL here comes from a real Lens result for a real item, so a block is a block.
 *
 * Read-only apart from the Lens/Voyage calls it has to make.
 */
import { neon } from "@neondatabase/serverless";
import { reverseImageMatches, partitionByVisualMatch } from "../app/lib/comps.ts";
import { extractPriceFromHtml } from "../app/lib/comp-price-verify.ts";
import { embedImage } from "../app/lib/embeddings.ts";

const N = Number(process.argv[2] || 8);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type HostStat = { samePiece: number; fetched: number; blocked: number; priced: number; sold: number };

async function main() {
 const sql = neon(process.env.DATABASE_URL!);
 const items = (await sql`
  SELECT image, title, final_price FROM sold_items
  WHERE image IS NOT NULL AND image <> '' AND final_price > 80
  ORDER BY random() LIMIT ${N}
 `) as Array<{ image: string; title: string; final_price: number }>;

 const byHost = new Map<string, HostStat>();
 const stat = (h: string) => {
  if (!byHost.has(h)) byHost.set(h, { samePiece: 0, fetched: 0, blocked: 0, priced: 0, sold: 0 });
  return byHost.get(h)!;
 };

 let totalSamePiece = 0, hadPriceFromGoogle = 0, itemsWithAnySamePiece = 0;

 for (const it of items) {
  const matches = await reverseImageMatches(it.image).catch(() => []);
  const emb = await embedImage(it.image).catch(() => null);
  const vis = await partitionByVisualMatch(matches, { queryEmbedding: emb }).catch(
   () => ({ verified: [], rejected: [], unchecked: [], ran: false }),
  );
  if (vis.verified.length) itemsWithAnySamePiece++;
  console.log(`\n${String(it.title).slice(0, 54)}  (sold $${Number(it.final_price).toFixed(0)})`);
  console.log(`  lens ${matches.length} · same-piece ${vis.verified.length}`);

  for (const m of vis.verified) {
   if (!m.link) continue;
   let host = "unknown";
   try { host = new URL(m.link).hostname.replace(/^www\./, ""); } catch { continue; }
   const s = stat(host);
   s.samePiece++;
   totalSamePiece++;
   if (m.priceCents && m.priceCents > 0) { hadPriceFromGoogle++; s.priced++; continue; } // Google gave us one

   try {
    const r = await fetch(m.link, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12000) });
    const html = await r.text();
    if (!r.ok || html.length < 2000) { s.blocked++; continue; }
    s.fetched++;
    const p = extractPriceFromHtml(html);
    if (p?.priceCents) { s.priced++; if (p.availability === "sold") s.sold++; }
   } catch { s.blocked++; }
  }
 }

 console.log(`\n${"═".repeat(72)}`);
 console.log(`items: ${items.length} · with at least one same-piece match: ${itemsWithAnySamePiece}`);
 console.log(`same-piece matches found: ${totalSamePiece} · of those, Google already gave a price: ${hadPriceFromGoogle}`);
 console.log(`\nhost                        same-piece  readable  blocked  price-got  sold`);
 const rows = [...byHost.entries()].sort((a, b) => b[1].samePiece - a[1].samePiece);
 let blockedTotal = 0, pricedTotal = 0;
 for (const [h, s] of rows) {
  blockedTotal += s.blocked; pricedTotal += s.priced;
  console.log(`  ${h.padEnd(26)} ${String(s.samePiece).padStart(6)} ${String(s.fetched).padStart(10)} ${String(s.blocked).padStart(8)} ${String(s.priced).padStart(10)} ${String(s.sold).padStart(5)}`);
 }
 const pct = (n: number) => (totalSamePiece ? `${Math.round((n / totalSamePiece) * 100)}%` : "–");
 console.log(`\n  same-piece matches we could get a price for: ${pricedTotal} (${pct(pricedTotal)})`);
 console.log(`  same-piece matches lost to blocking:         ${blockedTotal} (${pct(blockedTotal)})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
