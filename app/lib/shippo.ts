// Shippo shipping aggregator. VYA holds one integration and resells discounted
// USPS/UPS/FedEx rates — sellers never need their own carrier accounts. Gated by
// SHIPPO_API_KEY so it's dormant until you add the key.

const FALLBACK_EMAIL = "shipping@vyaplatform.com";

const SHIPPO_API = "https://api.goshippo.com";

export function isShippoConfigured(): boolean {
 return Boolean(process.env.SHIPPO_API_KEY);
}

import type { CustomsDeclaration } from "./customs";
import { shippoLabelFileType, DEFAULT_LABEL_PRINTER, type LabelPrinter } from "./label-format-core";

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
 // EMAIL IS NOT OPTIONAL TO USPS. It rejects an empty address_from.email and the whole purchase
 // fails — so a store whose sellers row has no email could never buy a label. A placeholder on
 // OUR domain is better than a failed label: the carrier only ever uses it for delivery notices.
 return { name: a.name || "", street1: a.street1, street2: a.street2 || "", city: a.city, state: a.state, zip: a.zip, country: a.country, phone: a.phone || "", email: a.email || FALLBACK_EMAIL };
}
/** Our declaration in Shippo's field names — its enums are upper-cased and its EEL code is slugged. */
function toShippoCustoms(d: CustomsDeclaration) {
 return {
  contents_type: "MERCHANDISE",
  non_delivery_option: "RETURN",
  certify: true,
  certify_signer: d.certifySigner,
  incoterm: d.incoterm,
  // The seller's own VAT registration, when she gave us one. Omitted entirely rather than sent
  // empty: a blank identification block is a different declaration from no declaration.
  ...(d.exporterTaxId ? { exporter_identification: { tax_id: { number: d.exporterTaxId.number, type: d.exporterTaxId.type } } } : {}),
  ...(d.eelPfc ? { eel_pfc: "NOEEI_30_37_a" } : {}),
  items: d.lines.map((l) => ({
   description: l.description,
   quantity: l.quantity,
   net_weight: String(l.weightOz),
   mass_unit: "oz",
   value_amount: (l.valueCents / 100).toFixed(2),
   value_currency: "USD",
   origin_country: l.originCountry,
   tariff_number: l.hsCode.replace(/\D/g, ""),
  })),
 };
}

function parcelToShippo(p: Parcel) {
 return { length: String(Math.max(1, p.lengthIn)), width: String(Math.max(1, p.widthIn)), height: String(Math.max(1, p.heightIn)), distance_unit: "in", weight: String(Math.max(1, p.weightOz)), mass_unit: "oz" };
}

/** Live rates from->to for a parcel, cheapest first. [] if not configured / on error. */
// `printer` is accepted for interface symmetry with EasyPost and deliberately unused: Shippo puts
// the label format on the TRANSACTION, not the shipment, so the choice is applied in buyLabel.
export async function getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel, customs?: CustomsDeclaration | null, _printer?: LabelPrinter): Promise<Rate[]> {
 const shipment = await shippo("/shipments/", "POST", {
  address_from: toShippo(from), address_to: toShippo(to), parcels: [parcelToShippo(parcel)], async: false,
  // Same rule as EasyPost: no declaration, no international rates.
  ...(customs ? { customs_declaration: toShippoCustoms(customs) } : {}),
 });
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

export type PurchasedLabel = {
 labelUrl: string; trackingNumber: string; trackingUrl: string | null; costCents: number; transactionId: string;
 /**
  * USPS Label Broker: a QR the Post Office scans and prints the label from, so a seller with no
  * printer can still post. Shippo returns it on the transaction as `qr_code_url`; it is null
  * unless the service and account support it, which is why nothing anywhere may assume it exists.
  */
 qrCodeUrl?: string | null;
};

/** Buy a label for a previously-returned rate id. Returns null if it didn't succeed. */
export async function buyLabel(rateId: string, printer: LabelPrinter = DEFAULT_LABEL_PRINTER): Promise<PurchasedLabel | null> {
 // PDF_4x6 for a label printer. This was hardcoded "PDF", which for USPS is an 8.5×11 sheet with
 // the label in the top quarter — unusable on the thermal printer a resale shop actually owns, and
 // uncroppable on a phone.
 const tx = await shippo("/transactions/", "POST", { rate: rateId, label_file_type: shippoLabelFileType(printer), async: false });
 if (!tx || tx.status !== "SUCCESS" || !tx.label_url) return null;
 return {
 labelUrl: tx.label_url as string,
 qrCodeUrl: (tx.qr_code_url as string) || null,
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

export type TrackingSnapshot = { status: string; eta: string | null; carrier: string | null };

/**
 * Ask the carrier where a parcel is.
 *
 * Shippo needs the carrier token as well as the number; "shippo" is their own test/self-resolving
 * carrier and works as a fallback when we didn't record which carrier the label was bought from.
 * Returns null on any failure — a rental screen that can't reach a carrier should show the dates it
 * already has, not an error.
 */
export async function getTracking(trackingNumber: string, carrier?: string | null): Promise<TrackingSnapshot | null> {
 if (!trackingNumber) return null;
 const c = (carrier || "shippo").toLowerCase();
 const r = await shippo(`/tracks/${encodeURIComponent(c)}/${encodeURIComponent(trackingNumber)}`, "GET");
 if (!r) return null;
 const eta = r.eta ? String(r.eta).slice(0, 10) : null;
 return {
  status: String(r.tracking_status?.status || "UNKNOWN"),
  eta: eta && /^\d{4}-\d{2}-\d{2}$/.test(eta) ? eta : null,
  carrier: r.carrier ? String(r.carrier) : null,
 };
}
