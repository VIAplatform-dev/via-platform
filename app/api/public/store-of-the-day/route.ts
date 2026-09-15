import { NextResponse } from "next/server";
import { isApprovedRequest } from "@/app/lib/approval";
import { visibleStores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";

/**
 * Returns a deterministic "store of the day". The same store for everyone on a
 * given day, rotating one store per day. It walks a fixed shuffled order of every
 * visible store, so NO store repeats until all of them have been featured once
 * (then the cycle restarts). The shuffle is seeded by a constant, so the order is
 * stable across requests/deploys but not alphabetical.
 */

// Seeded PRNG (mulberry32) → deterministic, no Math.random.
function mulberry32(seed: number): () => number {
 return function () {
 seed |= 0;
 seed = (seed + 0x6d2b79f5) | 0;
 let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
 t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
 return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 };
}

// Fixed shuffled order of [0..n-1] using a constant seed.
function fixedOrder(n: number): number[] {
 const arr = Array.from({ length: n }, (_, i) => i);
 const rand = mulberry32(0x5f3759df);
 for (let i = n - 1; i > 0; i--) {
 const j = Math.floor(rand() * (i + 1));
 [arr[i], arr[j]] = [arr[j], arr[i]];
 }
 return arr;
}

export async function GET(request: Request) {
 if (!(await isApprovedRequest(request))) return NextResponse.json({ error: "Approval required", needsApproval: true }, { status: 403 });
 const n = visibleStores.length;
 if (n === 0) return NextResponse.json({ store: null });

 // Whole-day index in UTC (days since the Unix epoch).
 const dayIndex = Math.floor(Date.now() / 86_400_000);
 const order = fixedOrder(n);
 const s = visibleStores[order[((dayIndex % n) + n) % n]];

 return NextResponse.json({
 store: {
  slug: s.slug,
  name: s.name,
  location: s.location ?? null,
  image: s.image ?? null,
  logo: s.logo ?? null,
  logoBg: (s as { logoBg?: string }).logoBg ?? "#ffffff",
  description: s.description ?? null,
  website: s.website ?? null,
 },
 });
}
