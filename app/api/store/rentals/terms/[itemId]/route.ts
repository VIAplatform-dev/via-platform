import { NextRequest, NextResponse } from "next/server";
import { getItemTerms, saveItemTerms, removeItemTerms, rentalContext, ownerOfItem } from "@/app/lib/rentals/rentals-db";
import { settingsWarnings, type RentalSettings } from "@/app/lib/rentals/settings-core";
import type { Tier } from "@/app/lib/rentals/availability-core";
import { seller, unauthorized, notFound, bad } from "../../_shared";

export const dynamic = "force-dynamic";

// A piece becomes rentable when terms exist for it, and stops being rentable when
// they're deleted. Overrides are any store setting, for this piece only.

export async function GET(request: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { itemId } = await ctx.params;
 const [terms, resolved] = await Promise.all([getItemTerms(itemId), rentalContext(itemId, acting.slug)]);
 return NextResponse.json({ terms, settings: resolved.settings, warnings: settingsWarnings(resolved.settings) });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { itemId } = await ctx.params;

 // Never take a seller's word for who owns the piece.
 const owner = await ownerOfItem(itemId);
 if (!owner) return notFound("No such item");
 if (owner.sellerId !== acting.seller.id) return unauthorized();

 const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
 const rawTiers = Array.isArray(body.tiers) ? body.tiers : [];
 const tiers: Tier[] = rawTiers
  .map((t) => ({ days: Number((t as Tier)?.days), cents: Math.round(Number((t as Tier)?.cents)) }))
  .filter((t) => Number.isFinite(t.days) && t.days > 0 && Number.isFinite(t.cents) && t.cents >= 0)
  .sort((a, b) => a.days - b.days);
 if (!tiers.length) return bad("At least one duration and price is needed.");

 const terms = await saveItemTerms({
  itemId,
  sellerId: acting.seller.id,
  tiers,
  replacementCents: body.replacementCents == null ? null : Math.round(Number(body.replacementCents)) || null,
  fitsSizes: typeof body.fitsSizes === "string" && body.fitsSizes.trim() ? body.fitsSizes.trim().slice(0, 120) : null,
  overrides: (body.overrides && typeof body.overrides === "object" ? body.overrides : {}) as Partial<RentalSettings>,
  alsoForSale: body.alsoForSale !== false,
 });
 const resolved = await rentalContext(itemId, acting.slug);
 return NextResponse.json({ terms, settings: resolved.settings, warnings: settingsWarnings(resolved.settings) });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
 const acting = await seller(request);
 if (!acting) return unauthorized();
 const { itemId } = await ctx.params;
 const owner = await ownerOfItem(itemId);
 if (!owner || owner.sellerId !== acting.seller.id) return unauthorized();
 await removeItemTerms(itemId);
 return NextResponse.json({ ok: true });
}
