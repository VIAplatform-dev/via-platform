import { neon } from "@neondatabase/serverless";
import { isShipFromComplete } from "./ship-from-core";
import type { PickupSettings } from "./pickup-core";

// Per-store shipping policy: where they ship from, and who pays.
//   buyer_pays — live rate shown at checkout, added to the buyer's total
//   store_pays — free at checkout; the store absorbs the label cost
//   free_over  — buyer pays below freeThresholdCents, free at/above it
export type ShipMode = "buyer_pays" | "store_pays" | "free_over";
import { type DutyMode, DEFAULT_DUTY_MODE, isDutyMode } from "./customs";
import { type ZoneConfig, normalizeZones, DEFAULT_ZONES } from "./shipping-zones";
export type ShipFrom = { name?: string | null; street1?: string | null; street2?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null; phone?: string | null };
export type ShippingSettings = {
 /**
  * Who settles customs duty on an international order. It is not just a billing preference — it
  * decides the INCOTERM on the declaration, so a store that absorbs duty in its prices and ships
  * DDU has its buyer billed at the door anyway and pays for the same duty twice.
  */
 dutyMode?: DutyMode;
 /**
  * The store's OWN carrier account at EasyPost, when it has connected one.
  *
  * This is what decides whether the store may promise "duties covered" — see resolveDutyMode. On
  * VYA's shared wallet, duty would land on VYA weeks later in an amount nobody quoted, so DDP is
  * only offered once the carrier is billing the store directly.
  */
 carrierAccountId?: string | null;
 /** Where this store ships and what it charges per region — see shipping-zones.ts. */
 zones?: ZoneConfig | null;
 mode: ShipMode;
 freeThresholdCents: number | null;
 shipFrom: ShipFrom | null;
 /** Collect in store, for a seller who has one. Null = not offered. See app/lib/pickup-core.ts. */
 pickup: PickupSettings | null;
};

const MODES: ShipMode[] = ["buyer_pays", "store_pays", "free_over"];
const DEFAULT: ShippingSettings = { mode: "buyer_pays", freeThresholdCents: null, shipFrom: null, pickup: null, zones: DEFAULT_ZONES };

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_shipping (
 store_slug TEXT PRIMARY KEY,
 mode TEXT NOT NULL DEFAULT 'buyer_pays',
 free_threshold_cents INTEGER,
 ship_from JSONB,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // Added lazily, like every other additive column here, so a deploy never lands code that reads a
 // column the database has not got yet.
 await db()`ALTER TABLE store_shipping ADD COLUMN IF NOT EXISTS pickup JSONB`;
 await db()`ALTER TABLE store_shipping ADD COLUMN IF NOT EXISTS duty_mode TEXT`;
 await db()`ALTER TABLE store_shipping ADD COLUMN IF NOT EXISTS carrier_account_id TEXT`;
 await db()`ALTER TABLE store_shipping ADD COLUMN IF NOT EXISTS zones JSONB`;
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getShippingSettings(storeSlug: string): Promise<ShippingSettings> {
 await ensureTable();
 const rows = await db()`SELECT mode, free_threshold_cents, ship_from, pickup, duty_mode, carrier_account_id, zones FROM store_shipping WHERE store_slug = ${storeSlug}`;
 if (!rows.length) return DEFAULT;
 const r: any = rows[0];
 const mode = MODES.includes(r.mode) ? (r.mode as ShipMode) : "buyer_pays";
 const shipFrom = r.ship_from ? (typeof r.ship_from === "string" ? JSON.parse(r.ship_from) : r.ship_from) : null;
 const pickup = r.pickup ? (typeof r.pickup === "string" ? JSON.parse(r.pickup) : r.pickup) : null;
 return { mode, freeThresholdCents: r.free_threshold_cents ?? null, shipFrom, pickup, dutyMode: isDutyMode(r.duty_mode) ? r.duty_mode : DEFAULT_DUTY_MODE, carrierAccountId: r.carrier_account_id ?? null, zones: r.zones ? (typeof r.zones === "string" ? JSON.parse(r.zones) : r.zones) : DEFAULT_ZONES };
}

export async function setShippingSettings(storeSlug: string, s: ShippingSettings): Promise<void> {
 await ensureTable();
 const mode = MODES.includes(s.mode) ? s.mode : "buyer_pays";
 const threshold = mode === "free_over" && s.freeThresholdCents && s.freeThresholdCents > 0 ? Math.round(s.freeThresholdCents) : null;
 const shipFromJson = s.shipFrom ? JSON.stringify(s.shipFrom) : null;
 const pickupJson = s.pickup ? JSON.stringify(s.pickup) : null;
 const dutyMode = isDutyMode(s.dutyMode) ? s.dutyMode : DEFAULT_DUTY_MODE;
 const carrierAccountId = s.carrierAccountId ? String(s.carrierAccountId).trim().slice(0, 60) : null;
 const zonesJson = JSON.stringify(normalizeZones(s.zones));
 await db()`INSERT INTO store_shipping (store_slug, mode, free_threshold_cents, ship_from, pickup, duty_mode, carrier_account_id, zones, updated_at)
 VALUES (${storeSlug}, ${mode}, ${threshold}, ${shipFromJson}::jsonb, ${pickupJson}::jsonb, ${dutyMode}, ${carrierAccountId}, ${zonesJson}::jsonb, now())
 ON CONFLICT (store_slug) DO UPDATE SET mode = ${mode}, free_threshold_cents = ${threshold}, ship_from = ${shipFromJson}::jsonb, pickup = ${pickupJson}::jsonb, duty_mode = ${dutyMode}, carrier_account_id = ${carrierAccountId}, zones = ${zonesJson}::jsonb, updated_at = now()`;
}

/** Does this store have a usable ship-from address (required for rates + labels)? */
export function hasShipFrom(s: ShippingSettings): boolean {
 return isShipFromComplete(s.shipFrom);
}
