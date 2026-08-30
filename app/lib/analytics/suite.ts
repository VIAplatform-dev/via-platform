import { resolveSeller } from "./core";
import { resolvePeriod, type PeriodInput, type ResolvedPeriod } from "./period";
import { getSalesMetrics, type SalesMetrics } from "./sales";
import { getCustomerMetrics, type CustomerMetrics } from "./customers";
import { getCatalogMetrics, type CatalogMetrics } from "./catalog";
import { getProductMetrics, type ProductMetrics } from "./products";
import { getEngagementMetrics, type EngagementMetrics } from "./engagement";
import { getQualityMetrics, type QualityMetrics } from "./quality";
import { getMarginMetrics, type MarginMetrics } from "./margin";

// ───────────────────────────────────────────────────────────────────────────
// Analytics — the suite orchestrator.
//
// Resolves the store and the period ONCE, then fans the six metric sections out
// in parallel. Sections are individually selectable so a dashboard tab can ask
// for just what it renders instead of paying for the whole suite on every
// keystroke of the date picker.
//
// Section boundaries mirror the questions a store owner actually asks:
//   sales      — did I make money, and is that up or down?
//   customers  — who bought, and do they come back?
//   catalog    — what am I asking, what do things go for, what's moving?
//   products   — which pieces are carrying the store, and which are dead weight?
//   engagement — where do people come from and where do they fall out?
//   quality    — what about how I list makes a piece sell?
//   margin     — what did I actually keep?
// ───────────────────────────────────────────────────────────────────────────

export const SECTIONS = ["sales", "customers", "catalog", "products", "engagement", "quality", "margin"] as const;
export type Section = (typeof SECTIONS)[number];

export type PeriodSummary = {
 key: string;
 label: string;
 tz: string;
 startISO: string;
 endISO: string;
 days: number;
 allTime: boolean;
 granularity: ResolvedPeriod["granularity"];
 comparisons: {
  prior: { label: string; startISO: string; endISO: string } | null;
  yoy: { label: string; startISO: string; endISO: string } | null;
 };
};

export type AnalyticsSuite = {
 store: { slug: string; name: string };
 period: PeriodSummary;
 sections: Section[];
 sales?: SalesMetrics;
 customers?: CustomerMetrics;
 catalog?: CatalogMetrics;
 products?: ProductMetrics;
 engagement?: EngagementMetrics;
 quality?: QualityMetrics;
 margin?: MarginMetrics;
 generatedAt: string;
};

/** Parse a comma-separated ?sections= list, defaulting to everything. */
export function parseSections(raw: string | null | undefined): Section[] {
 if (!raw) return [...SECTIONS];
 const asked = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
 const picked = SECTIONS.filter((s) => asked.includes(s));
 return picked.length ? picked : [...SECTIONS];
}

function summarise(p: ResolvedPeriod): PeriodSummary {
 const w = (x: { label: string; startISO: string; endISO: string } | null) =>
  x ? { label: x.label, startISO: x.startISO, endISO: x.endISO } : null;
 return {
  key: p.key,
  label: p.current.label,
  tz: p.tz,
  startISO: p.current.startISO,
  endISO: p.current.endISO,
  days: p.current.days,
  allTime: p.allTime,
  granularity: p.granularity,
  comparisons: { prior: w(p.prior), yoy: w(p.yoy) },
 };
}

export class StoreNotFoundError extends Error {
 constructor(slug: string) {
  super(`No seller for slug "${slug}"`);
  this.name = "StoreNotFoundError";
 }
}

export async function getAnalyticsSuite(slug: string, input: PeriodInput & { sections?: Section[] } = {}): Promise<AnalyticsSuite> {
 const seller = await resolveSeller(slug);
 if (!seller) throw new StoreNotFoundError(slug);

 // "All time" starts the day the store did, not at the Unix epoch.
 const period = resolvePeriod({ ...input, earliest: seller.createdAt });
 const summary = summarise(period);
 const sections = input.sections?.length ? input.sections : [...SECTIONS];
 const want = (s: Section) => sections.includes(s);

 const [sales, customers, catalog, products, engagement, quality, margin] = await Promise.all([
  want("sales") ? getSalesMetrics(seller.id, period) : undefined,
  want("customers") ? getCustomerMetrics(seller.id, seller.slug, period) : undefined,
  want("catalog") ? getCatalogMetrics(seller.id, period) : undefined,
  want("products") ? getProductMetrics(seller.id, seller.slug, period) : undefined,
  want("engagement") ? getEngagementMetrics(seller.id, seller.slug, period) : undefined,
  // Structural, not period-scoped — see quality.ts.
  want("quality") ? getQualityMetrics(seller.id) : undefined,
  want("margin") ? getMarginMetrics(seller.id, seller.slug, period) : undefined,
 ]);

 return {
  store: { slug: seller.slug, name: seller.name },
  period: summary,
  sections,
  sales,
  customers,
  catalog,
  products,
  engagement,
  quality,
  margin,
  generatedAt: new Date().toISOString(),
 };
}
