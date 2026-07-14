import { neon } from "@neondatabase/serverless";

// The store owner's OWN brief — what they explicitly tell VYA about how they run
// their store: pricing stance, goals, description voice, and positioning. This
// complements what VYA infers from their catalog (see store-voice.ts and
// getStorePricingSignal). Owner intent takes precedence: it steers the AI drafter's
// voice, and nudges pricing (harder the more they price off-market by hand).

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type PricingStance = "value" | "market" | "slight_premium" | "premium" | "custom";
export type PricingGoal = "margin" | "balanced" | "velocity";

export type StoreBrief = {
 pricing: { stance: PricingStance | ""; targetPct: number | null; goal: PricingGoal | ""; notes: string };
 voice: { tone: string; rules: string[]; notes: string };
 about: string;
};

export const EMPTY_BRIEF: StoreBrief = {
 pricing: { stance: "", targetPct: null, goal: "", notes: "" },
 voice: { tone: "", rules: [], notes: "" },
 about: "",
};

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_briefs (
  store_slug TEXT PRIMARY KEY,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Sanitize whatever comes off the wire / DB into a well-formed brief.
function coerce(raw: any): StoreBrief {
 const p = raw?.pricing || {};
 const v = raw?.voice || {};
 const stance = ["value", "market", "slight_premium", "premium", "custom"].includes(p.stance) ? p.stance : "";
 const goal = ["margin", "balanced", "velocity"].includes(p.goal) ? p.goal : "";
 const tp = Number(p.targetPct);
 return {
  pricing: {
   stance,
   targetPct: Number.isFinite(tp) ? Math.max(-60, Math.min(200, Math.round(tp))) : null,
   goal,
   notes: typeof p.notes === "string" ? p.notes.slice(0, 1000) : "",
  },
  voice: {
   tone: typeof v.tone === "string" ? v.tone.slice(0, 60) : "",
   rules: Array.isArray(v.rules) ? v.rules.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.slice(0, 80)).slice(0, 12) : [],
   notes: typeof v.notes === "string" ? v.notes.slice(0, 1000) : "",
  },
  about: typeof raw?.about === "string" ? raw.about.slice(0, 2000) : "",
 };
}

export async function getStoreBrief(storeSlug: string): Promise<StoreBrief | null> {
 await ensureTable();
 const rows = (await db()`SELECT brief FROM store_briefs WHERE store_slug = ${storeSlug}`.catch(() => [])) as { brief: any }[];
 if (!rows.length) return null;
 return coerce(rows[0].brief);
}

export async function saveStoreBrief(storeSlug: string, brief: StoreBrief): Promise<void> {
 await ensureTable();
 const clean = JSON.stringify(coerce(brief));
 await db()`INSERT INTO store_briefs (store_slug, brief, updated_at)
  VALUES (${storeSlug}, ${clean}::jsonb, now())
  ON CONFLICT (store_slug) DO UPDATE SET brief = ${clean}::jsonb, updated_at = now()`;
}

/** Whether the owner has actually filled in anything meaningful. */
export function briefHasContent(b: StoreBrief | null): boolean {
 if (!b) return false;
 return Boolean(b.pricing.stance || b.pricing.notes || b.voice.tone || b.voice.rules.length || b.voice.notes || b.about);
}

/**
 * The owner's TARGET price multiplier vs. market implied by their brief, or null if
 * they didn't state a pricing stance. e.g. "slight premium" → 1.10. A margin/velocity
 * goal tilts it a touch. `custom` uses their explicit targetPct (e.g. +15% → 1.15).
 */
export function briefPricingTarget(b: StoreBrief | null): number | null {
 if (!b || !b.pricing.stance) return null;
 let mult: number;
 if (b.pricing.stance === "custom") {
  if (b.pricing.targetPct == null) return null;
  mult = 1 + b.pricing.targetPct / 100;
 } else {
  mult = ({ value: 0.9, market: 1.0, slight_premium: 1.1, premium: 1.25 } as Record<string, number>)[b.pricing.stance] ?? 1;
 }
 if (b.pricing.goal === "velocity") mult *= 0.96; // move fast → shade down
 else if (b.pricing.goal === "margin") mult *= 1.05; // maximize margin → shade up
 return Math.min(2.5, Math.max(0.5, mult));
}

/**
 * An authoritative voice-instruction block the drafter must follow — built from the
 * owner's stated tone, hard rules, notes, and positioning. Prepended to the learned
 * voice guide so what the owner SAYS overrides what we inferred. "" if nothing set.
 */
export function briefVoiceDirectives(b: StoreBrief | null): string {
 if (!b) return "";
 const parts: string[] = [];
 if (b.voice.tone) parts.push(`Tone: ${b.voice.tone}.`);
 if (b.voice.rules.length) parts.push(`Always follow these rules: ${b.voice.rules.join("; ")}.`);
 if (b.voice.notes.trim()) parts.push(b.voice.notes.trim());
 if (b.about.trim()) parts.push(`About this store (context to reflect): ${b.about.trim()}`);
 return parts.join(" ").trim();
}
