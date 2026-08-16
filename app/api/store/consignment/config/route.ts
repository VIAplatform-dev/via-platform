import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getConsignmentSettings, upsertConsignmentSettings, getSplitRules, setSplitRules, getConsignmentSummary } from "@/app/lib/consignment-db";
import type { SplitRule } from "@/app/lib/consignment-logic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The store's consignment configuration: settings (payout methods, cycle, hold, default split,
// agreement) + price-band split rules.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [settings, splitRules] = await Promise.all([getConsignmentSettings(slug), getSplitRules(slug)]);
 return NextResponse.json({ settings, splitRules });
}

export async function PUT(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (body?.settings && typeof body.settings === "object") {
 const s = body.settings;
 // Whether a sale's cut is held by VYA (direct-deposit) or left with the store (in-person) is
 // decided at the sale. Don't let the store flip the DEFAULT between those two while consignors are
 // still owed — it would mismatch what's actually held. (Switching among cash/check/credit is fine.)
 if (typeof s.defaultPayoutMethod === "string") {
 const cur = await getConsignmentSettings(slug);
 if ((cur.defaultPayoutMethod === "stripe") !== (s.defaultPayoutMethod === "stripe")) {
 const summary = await getConsignmentSummary(slug).catch(() => null);
 if (summary && summary.owedCents !== 0) {
  return NextResponse.json({ error: "Can’t switch the default between direct-deposit and in-person payout while consignors are owed money. Pay out balances first." }, { status: 409 });
 }
 }
 }
 await upsertConsignmentSettings(slug, {
 payoutMethods: Array.isArray(s.payoutMethods) ? s.payoutMethods : undefined,
 defaultPayoutMethod: typeof s.defaultPayoutMethod === "string" ? s.defaultPayoutMethod : undefined,
 payoutCycle: typeof s.payoutCycle === "string" ? s.payoutCycle : undefined,
 holdDays: typeof s.holdDays === "number" ? s.holdDays : undefined,
 autoPayout: typeof s.autoPayout === "boolean" ? s.autoPayout : undefined,
 storeCreditBonusPct: "storeCreditBonusPct" in s ? (s.storeCreditBonusPct ?? null) : undefined,
 storeDefaultSplitPct: typeof s.storeDefaultSplitPct === "number" ? s.storeDefaultSplitPct : undefined,
 requireAgreement: typeof s.requireAgreement === "boolean" ? s.requireAgreement : undefined,
 agreementTerms: "agreementTerms" in s ? (s.agreementTerms ?? null) : undefined,
 collectW9: typeof s.collectW9 === "boolean" ? s.collectW9 : undefined,
 });
 }
 if (Array.isArray(body?.splitRules)) {
 const rules: SplitRule[] = body.splitRules
 .filter((r: unknown) => r && typeof r === "object")
 .map((r: Record<string, unknown>) => ({
 minPriceCents: Number(r.minPriceCents) || 0,
 maxPriceCents: r.maxPriceCents != null ? Number(r.maxPriceCents) : null,
 category: typeof r.category === "string" && r.category.trim() ? r.category.trim() : null,
 splitPct: Number(r.splitPct) || 0,
 }));
 await setSplitRules(slug, rules);
 }
 const [settings, splitRules] = await Promise.all([getConsignmentSettings(slug), getSplitRules(slug)]);
 return NextResponse.json({ settings, splitRules });
}
