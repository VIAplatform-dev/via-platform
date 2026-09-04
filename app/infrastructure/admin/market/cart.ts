"use client";

// The seller's in-progress basket: items picked on Find/Confirm before ONE payment. Lives in
// sessionStorage (per tab, survives refresh, gone when the tab closes) — never a source of truth;
// the server re-validates every line when the checkout starts.
import type { CartLine, Discount } from "@/app/lib/market/sale-core";

export type UiLine = CartLine & { title: string; image: string | null; size: string | null; discount: Discount };
const KEY = "market:cart";

export function readCart(): UiLine[] {
 try { const raw = sessionStorage.getItem(KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
export function writeCart(lines: UiLine[]): void {
 try { sessionStorage.setItem(KEY, JSON.stringify(lines.slice(0, 20))); } catch { /* storage off */ }
}
export function clearCart(): void { try { sessionStorage.removeItem(KEY); } catch { /* */ } }

// Which server-side cart this device is currently serving. The carts themselves live in the database
// (so they survive a closed tab and show up on every device); this is just the pointer, per device,
// so two phones at the same stall can work two different customers at once.
const AKEY = "market:activeCart";
export function getActiveCartId(): string | null { try { return sessionStorage.getItem(AKEY); } catch { return null; } }
export function setActiveCartId(id: string | null): void { try { if (id) sessionStorage.setItem(AKEY, id); else sessionStorage.removeItem(AKEY); } catch { /* storage off */ } }
export function addToCart(line: UiLine): UiLine[] {
 const cur = readCart().filter((l) => l.itemId !== line.itemId);
 const next = [...cur, line];
 writeCart(next);
 return next;
}

// ── Offline cash queue ───────────────────────────────────────────────────────────────────────
// A cash sale taken with no signal is stored here and replayed to /checkout/cash-direct as soon as
// the phone is back. The stored clientKey makes a replay idempotent server-side.
export type QueuedCash = { clientKey: string; lines: { itemId: string; saleCents: number; title: string }[]; amountCents: number; tenderedCents: number | null; at: string; error?: string };
const QKEY = "market:cash-queue";
export function readQueue(): QueuedCash[] { try { const v = JSON.parse(localStorage.getItem(QKEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
export function writeQueue(q: QueuedCash[]): void { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* */ } }
export function enqueueCash(sale: QueuedCash): void { writeQueue([...readQueue(), sale]); }
