// EasyPost shipping aggregator — the migration target from Shippo (see the shipping-provider decision).
// Implements the SAME interface as shippo.ts (getRates / buyLabel / voidLabel) so ship-provider.ts can
// swap between them with zero call-site churn. Gated by EASYPOST_API_KEY, so it's dormant until the key
// is set AND SHIP_PROVIDER=easypost. Per-store sub-accounts (Forge "Child Users") are stubbed here until
// Forge is enabled on the account and the child-auth flow is verified live.

import type { ShipAddress, Parcel, Rate, PurchasedLabel } from "./shippo";
import type { CustomsDeclaration } from "./customs";

const EASYPOST_API = "https://api.easypost.com/v2";

export function isEasyPostConfigured(): boolean {
 return Boolean(process.env.EASYPOST_API_KEY);
}

// EasyPost auth = HTTP Basic with the API key as the username and an empty password.
function authHeader(apiKey: string): string {
 return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// apiKey overrides the platform key — pass a store's Child-User key to act as that sub-account.
async function ep(path: string, method: "GET" | "POST", body?: any, apiKey?: string): Promise<any | null> {
 const key = apiKey || process.env.EASYPOST_API_KEY;
 if (!key) return null;
 try {
  const res = await fetch(`${EASYPOST_API}${path}`, {
   method,
   headers: { Authorization: authHeader(key), "Content-Type": "application/json" },
   body: body ? JSON.stringify(body) : undefined,
   signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  return await res.json();
 } catch {
  return null;
 }
}

function toEpAddress(a: ShipAddress) {
 return { name: a.name || "", street1: a.street1, street2: a.street2 || "", city: a.city, state: a.state, zip: a.zip, country: a.country, phone: a.phone || "", email: a.email || "" };
}
/**
 * Our declaration in EasyPost's field names.
 *
 * Two conversions worth naming: EasyPost takes value in DOLLARS where we hold cents, and wants the
 * tariff number as bare digits, so the dotted six-digit heading has its dot stripped.
 */
function toEpCustoms(d: CustomsDeclaration) {
 return {
  contents_type: d.contentsType,
  restriction_type: "none",
  non_delivery_option: d.nonDeliveryOption,
  customs_certify: true,
  customs_signer: d.certifySigner,
  // Null means the seller owes an AES filing we can't invent — send nothing rather than a false one.
  ...(d.eelPfc ? { eel_pfc: d.eelPfc } : {}),
  customs_items: d.lines.map((l) => ({
   description: l.description,
   quantity: l.quantity,
   value: Number((l.valueCents / 100).toFixed(2)),
   weight: l.weightOz,
   hs_tariff_number: l.hsCode.replace(/\D/g, ""),
   origin_country: l.originCountry,
   currency: "USD",
  })),
 };
}

function toEpParcel(p: Parcel) {
 // EasyPost: dimensions in inches, weight in ounces (matches our Parcel type).
 return { length: Math.max(1, p.lengthIn), width: Math.max(1, p.widthIn), height: Math.max(1, p.heightIn), weight: Math.max(1, p.weightOz) };
}

/** Live rates from->to for a parcel, cheapest first. [] if not configured / on error. */
export async function getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel, apiKey?: string, customs?: CustomsDeclaration | null): Promise<Rate[]> {
 const shipment = await ep("/shipments", "POST", { shipment: {
  to_address: toEpAddress(to), from_address: toEpAddress(from), parcel: toEpParcel(parcel),
  // A shipment crossing a border needs a declaration or EasyPost returns no international rates at
  // all. It goes on at CREATION, not at purchase, because buying references this shipment by id.
  // DDP needs BOTH: the incoterm goes on the customs paperwork, and duty_payment tells the carrier
  // whose account to bill. DHL Express reads the incoterm alone, but FedEx and UPS bill the
  // RECEIVER unless duty_payment says otherwise — which would hand the buyer a bill at the door on
  // an order whose store promised duties were covered.
  ...(customs ? {
   customs_info: toEpCustoms(customs),
   options: {
    incoterm: customs.incoterm,
    ...(customs.incoterm === "DDP" ? { duty_payment: { type: "SENDER" } } : {}),
   },
  } : {}),
 } }, apiKey);
 const shipmentId = shipment?.id as string | undefined;
 const rates: any[] = shipment?.rates || [];
 if (!shipmentId) return [];
 return rates
  .map((r) => ({
   // EasyPost buys by (shipment, rate), so carry both in the opaque rateId our interface passes around.
   rateId: `${shipmentId}:${r.id}`,
   provider: String(r.carrier || ""),
   service: String(r.service || ""),
   amountCents: Math.round(parseFloat(r.rate || "0") * 100),
   currency: String(r.currency || "USD"),
   estDays: typeof r.delivery_days === "number" ? r.delivery_days : null,
  }))
  .filter((r) => r.amountCents > 0)
  .sort((a, b) => a.amountCents - b.amountCents);
}

/** Buy a label for a rateId returned by getRates (format "shipmentId:rateId"). null if it didn't succeed. */
export async function buyLabel(rateId: string, apiKey?: string): Promise<PurchasedLabel | null> {
 const [shipmentId, rid] = String(rateId).split(":");
 if (!shipmentId || !rid) return null;
 const bought = await ep(`/shipments/${shipmentId}/buy`, "POST", { rate: { id: rid } }, apiKey);
 const label = bought?.postage_label;
 if (!bought || !label?.label_url) return null;
 return {
  labelUrl: String(label.label_url),
  trackingNumber: String(bought.tracking_code || ""),
  trackingUrl: bought.tracker?.public_url || null,
  costCents: Math.round(parseFloat(bought.selected_rate?.rate || "0") * 100),
  transactionId: String(bought.id || ""), // the shipment id — used to refund/void the label
 };
}

/** Refund (void) an unused label so its cost is credited back. Best-effort; already-used labels are rejected (fine). */
export async function voidLabel(transactionId: string, apiKey?: string): Promise<boolean> {
 if (!transactionId) return false;
 const r = await ep(`/shipments/${transactionId}/refund`, "POST", undefined, apiKey);
 const st = r?.refund_status;
 return !!r && (st === "submitted" || st === "refunded");
}

/**
 * Create an EasyPost Child User (per-store sub-account) under the platform account. Requires Forge to be
 * enabled on the account. Returns the child's id + its production API key (which is how you then act as
 * that sub-account when buying labels). Dormant until Forge is on — DO NOT rely on this until the
 * child-auth + FlexRate flow is verified against a Forge-enabled account.
 */
export async function createChildUser(name: string): Promise<{ id: string; apiKey: string | null } | null> {
 const u = await ep("/users", "POST", { user: { name } });
 if (!u?.id) return null;
 const prodKey = Array.isArray(u.api_keys) ? (u.api_keys.find((k: any) => k.mode === "production")?.key ?? null) : null;
 return { id: String(u.id), apiKey: prodKey };
}
