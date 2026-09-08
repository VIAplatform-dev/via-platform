// Option J, on the one step that bites: without a ship-from address a draft cannot go live and a
// label cannot be bought. Inventory and Orders show the gate where it is felt; the publish routes
// refuse with the same words, so "blocked" is true rather than decorative.

import type { SetupStep } from "./setup-core.ts";

export const SHIP_FROM_MESSAGE = "Pieces can't go live yet. Add the address you ship from.";

export type ShipFromGate = { message: string; href: string; verb: string };

/** The gate to show, or null when the address is set (or the steps are not known). */
export function shipFromGate(setup: SetupStep[] | null | undefined): ShipFromGate | null {
 const step = (setup ?? []).find((s) => s.id === "ship_from");
 if (!step || step.done) return null;
 return { message: SHIP_FROM_MESSAGE, href: step.href, verb: "Add address" };
}

/** What a publish route answers when the store has no ship-from address; null = go ahead. */
export function publishRefusal(shipFromSet: boolean): { status: 409; error: string } | null {
 return shipFromSet ? null : { status: 409, error: SHIP_FROM_MESSAGE };
}
