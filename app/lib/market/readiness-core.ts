// Pure "am I ready for the market?" computation — no DB, unit-tested.

export type ReadinessItem = { id: string; status: string; priceCents: number; images: string[]; variants: unknown[] | null; source?: string; costCents?: number | null; size?: string | null };

export type Readiness = {
 paymentsReady: boolean;
 available: number;
 missingPhotos: number;
 missingPrice: number;
 multiVariant: number;
 legacyProducts: number;
 quickUnfinished: number; // quick-listed at a market, still missing cost or size
 ready: boolean; // nothing that would BLOCK a sale
 warnings: string[]; // human copy for the Setup checklist
};

const SELLABLE = new Set(["active", "draft"]);

export function computeReadiness(input: { chargesEnabled: boolean; items: ReadinessItem[]; legacyProductCount: number }): Readiness {
 const sellable = input.items.filter((i) => SELLABLE.has(i.status));
 const missingPhotos = sellable.filter((i) => !Array.isArray(i.images) || i.images.length === 0).length;
 const missingPrice = sellable.filter((i) => !(i.priceCents > 0)).length;
 const multiVariant = sellable.filter((i) => Array.isArray(i.variants) && i.variants.length > 1).length;
 const quickUnfinished = input.items.filter((i) => i.source === "market" && (i.costCents == null || !i.size)).length;
 const warnings: string[] = [];
 if (!input.chargesEnabled) warnings.push("Card payments are off — finish Stripe setup or you'll be cash-only.");
 if (missingPhotos) warnings.push(`${missingPhotos} item${missingPhotos === 1 ? "" : "s"} without a photo can't be found by camera (search still works).`);
 if (missingPrice) warnings.push(`${missingPrice} item${missingPrice === 1 ? "" : "s"} have no price — you'll be asked at checkout.`);
 if (multiVariant) warnings.push(`${multiVariant} multi-size listing${multiVariant === 1 ? "" : "s"} sell as a whole listing in Market Mode.`);
 if (input.legacyProductCount > 0) warnings.push(`${input.legacyProductCount} products are still in your synced catalog — convert them to managed inventory to sell them in person.`);
 const ready = missingPrice === 0 && input.legacyProductCount === 0;
 return { paymentsReady: input.chargesEnabled, available: sellable.length, missingPhotos, missingPrice, multiVariant, legacyProducts: input.legacyProductCount, quickUnfinished, ready, warnings };
}
