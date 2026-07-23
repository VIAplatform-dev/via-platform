// Shippo shipping aggregator. VYA holds one integration and resells discounted
// USPS/UPS/FedEx rates — sellers never need their own carrier accounts. Gated by
// SHIPPO_API_KEY so it's dormant until you add the key.

const SHIPPO_API = "https://api.goshippo.com";

export function isShippoConfigured(): boolean {
 return Boolean(process.env.SHIPPO_API_KEY);
}

export type ShipAddress = {
 name?: string | null;
 street1: string;
 street2?: string | null;
 city: string;
 state: string;
 zip: string;
 country: string; // ISO-2, e.g. "US"
 phone?: string | null;
 email?: string | null;
};
export type Parcel = { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
export type Rate = { rateId: string; provider: string; service: string; amountCents: number; currency: string; estDays: number | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function shippo(path: string, method: "GET" | "POST", body?: any): Promise<any | null> {
 const key = process.env.SHIPPO_API_KEY;
 if (!key) return null;
 try {
 const res = await fetch(`${SHIPPO_API}${path}`, {
 method,
 headers: { Authorization: `ShippoToken ${key}`, "Content-Type": "application/json" },
 body: body ? JSON.stringify(body) : undefined,
 signal: AbortSignal.timeout(25000),
 });
 if (!res.ok) return null;
 return await res.json();
 } catch {
 return null;
 }
}

function toShippo(a: ShipAddress) {
 return { name: a.name || "", street1: a.street1, street2: a.street2 || "", city: a.city, state: a.state, zip: a.zip, country: a.country, phone: a.phone || "", email: a.email || "" };
}
function parcelToShippo(p: Parcel) {
 return { length: String(Math.max(1, p.lengthIn)), width: String(Math.max(1, p.widthIn)), height: String(Math.max(1, p.heightIn)), distance_unit: "in", weight: String(Math.max(1, p.weightOz)), mass_unit: "oz" };
}

/** Live rates from->to for a parcel, cheapest first. [] if not configured / on error. */
export async function getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel): Promise<Rate[]> {
 const shipment = await shippo("/shipments/", "POST", { address_from: toShippo(from), address_to: toShippo(to), parcels: [parcelToShippo(parcel)], async: false });
 const rates: any[] = shipment?.rates || [];
 return rates
 .map((r) => ({
 rateId: r.object_id as string,
 provider: String(r.provider || ""),
 service: String(r.servicelevel?.name || r.servicelevel?.token || ""),
 amountCents: Math.round(parseFloat(r.amount || "0") * 100),
 currency: String(r.currency || "USD"),
 estDays: typeof r.estimated_days === "number" ? r.estimated_days : null,
 }))
 .filter((r) => r.amountCents > 0)
 .sort((a, b) => a.amountCents - b.amountCents);
}

export type PurchasedLabel = { labelUrl: string; trackingNumber: string; trackingUrl: string | null; costCents: number; transactionId: string };

/** Buy a label for a previously-returned rate id. Returns null if it didn't succeed. */
export async function buyLabel(rateId: string): Promise<PurchasedLabel | null> {
 const tx = await shippo("/transactions/", "POST", { rate: rateId, label_file_type: "PDF", async: false });
 if (!tx || tx.status !== "SUCCESS" || !tx.label_url) return null;
 return {
 labelUrl: tx.label_url as string,
 trackingNumber: String(tx.tracking_number || ""),
 trackingUrl: tx.tracking_url_provider || null,
 costCents: Math.round(parseFloat((tx.rate?.amount as string) || "0") * 100),
 transactionId: String(tx.object_id || ""), // needed to refund/void the label if the order is refunded
 };
}

/** Refund (void) an unused label so its cost is credited back — used when an order is refunded before
 *  it ships. Best-effort: Shippo rejects labels that were already used/scanned, which is fine. */
export async function voidLabel(transactionId: string): Promise<boolean> {
 if (!transactionId) return false;
 const r = await shippo("/refunds/", "POST", { transaction: transactionId, async: false });
 // PENDING or SUCCESS both mean the refund was accepted (USPS refunds settle asynchronously).
 return !!r && (r.status === "SUCCESS" || r.status === "PENDING");
}
