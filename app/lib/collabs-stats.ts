import { getSetting } from "./settings-db";
import { stores } from "./stores";

// A store's authoritative Shopify Collabs commission. The same number the admin
// "Shopify Collabs" analytics tab shows. Read from the snapshot persisted on each sync
// (`collabs_partnerships_snapshot`) and matched to the store by brand name.

type Partnership = { name: string; totalCommissionEarned: string; currency?: string; totalOrders?: number; totalLinkVisits?: number };

const normalizeName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type CollabsCommission = { commissionUsd: number; orders: number; linkVisits: number };

export async function getCollabsCommissionForStore(storeSlug: string): Promise<CollabsCommission | null> {
 const store = stores.find((s) => s.slug === storeSlug);
 if (!store) return null;
 const raw = await getSetting("collabs_partnerships_snapshot").catch(() => null);
 if (!raw) return null;
 let parts: Partnership[];
 try { parts = JSON.parse(raw); } catch { return null; }
 if (!Array.isArray(parts)) return null;

 // Match on the store name OR its Collabs affiliate handle (affiliatePath): the Collabs
 // brand name often differs from the store name (e.g. "Rareality Archive" vs "RAREALITY").
 // Exact normalized match first, then a length-guarded contains fallback.
 const affiliatePath = (store as { affiliatePath?: string }).affiliatePath;
 const candidates = [store.name, affiliatePath].filter(Boolean).map((c) => normalizeName(c as string)).filter((c) => c.length >= 3);
 const partNorm = (x: Partnership) => normalizeName(x.name);
 const p =
 parts.find((x) => candidates.includes(partNorm(x))) ||
 parts.find((x) => {
 const pn = partNorm(x);
 return candidates.some((c) => (pn.includes(c) || c.includes(pn)) && Math.min(pn.length, c.length) >= 4);
 });
 if (!p) return null;

 // displayValue like "$203.70", take the numeric part (Collabs reports in USD).
 const amount = parseFloat(String(p.totalCommissionEarned || "").replace(/[^0-9.]/g, "")) || 0;
 return { commissionUsd: Math.round(amount * 100) / 100, orders: Number(p.totalOrders || 0), linkVisits: Number(p.totalLinkVisits || 0) };
}
