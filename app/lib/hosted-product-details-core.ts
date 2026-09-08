// What a hosted product page says about a piece beyond its title, price and photos. Pure — no I/O.
//
// A store served from its own captured theme (/site/[slug]/products/[handle]) prints the page the
// crawler saw: the theme's own description block and nothing VYA has learned since — no flaws, no
// grade, no measurements, no "Ships to". The classic product page (app/s/[handle]/p/[id]/page.tsx)
// prints all of those. A shopper must read the same words whichever renderer she landed on, so the
// sections here are built from the SAME cores that page uses, in the same order of reading:
//
//   size (what the tag says and what it means) → measurements under it → the grade with its one-line
//   meaning and the seller's note → the flaws → where it ships.
//
// The HTML is deliberately theme-neutral: inline styles only, no classes, sized in em so it takes
// the theme's type and colour wherever it is dropped (see hosted-product-details.ts for where).

import { shipsToLine } from "./ships-to-core.ts";
import type { ZoneConfig } from "./shipping-zones.ts";
import { sizeLine, formatSizeLine } from "./size-display-core.ts";
import { formatMeasurement, isMeasurementKey, type Measurement } from "./measurements-core.ts";
import { isConditionGrade, conditionDefinition } from "./condition-core.ts";

export type HostedDetailSectionId = "size" | "measurements" | "condition" | "flaws" | "ships-to";

export type HostedDetailSection = { id: HostedDetailSectionId; label: string; lines: string[] };

/** The item fields the sections read. Loose on purpose: a drizzle row or a plain object both fit. */
export type HostedDetailItem = {
 title?: string | null;
 size?: string | null;
 category?: string | null;
 description?: string | null;
 currency?: string | null;
 condition?: string | null;
 conditionNote?: string | null;
 flaws?: unknown;
 measurementsJson?: unknown;
};

/** The store's shipping, as the classic page reads it: zones null when the store never saved
 *  shipping (say nothing — the Buy button does the talking), else its zones and home country. */
export type HostedDetailStore = { zones: ZoneConfig | null | undefined; country: string | null | undefined };

const measurementsOf = (raw: unknown): Measurement[] =>
 Array.isArray(raw) ? raw.filter((m): m is Measurement => !!m && typeof m === "object" && isMeasurementKey((m as Measurement).key) && Number.isFinite((m as Measurement).value)) : [];

// Same filter the product page applies: strings with something in them.
const flawsOf = (raw: unknown): string[] =>
 Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string" && !!f.trim()).map((f) => f.trim()) : [];

export function hostedProductDetails(item: HostedDetailItem, store: HostedDetailStore): HostedDetailSection[] {
 const out: HostedDetailSection[] = [];

 const size = formatSizeLine(sizeLine({ size: item.size, category: item.category, title: item.title, description: item.description, currency: item.currency }));
 if (size) out.push({ id: "size", label: "Size", lines: [size] });

 const measurements = measurementsOf(item.measurementsJson);
 if (measurements.length) out.push({ id: "measurements", label: "Measurements", lines: measurements.map(formatMeasurement) });

 const condition = String(item.condition ?? "").trim();
 const note = String(item.conditionNote ?? "").trim();
 if (condition || note) {
  const lines: string[] = [];
  if (condition) lines.push(condition);
  // The grade's one-line meaning only for a piece graded on the scale; free text saved before it
  // prints as she wrote it (condition-core.ts).
  if (isConditionGrade(condition)) lines.push(conditionDefinition(condition));
  if (note) lines.push(`Condition note: ${note}`);
  out.push({ id: "condition", label: "Condition", lines });
 }

 const flaws = flawsOf(item.flaws);
 if (flaws.length) out.push({ id: "flaws", label: "Flaws", lines: flaws });

 const shipsTo = shipsToLine(store.zones, store.country);
 if (shipsTo) out.push({ id: "ships-to", label: "Ships to", lines: [shipsTo] });

 return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LABEL = "margin:0 0 .35em;font-size:.72em;text-transform:uppercase;letter-spacing:.2em;opacity:.5";
const LINE = "margin:0;font-size:.95em;line-height:1.7;opacity:.8";

/**
 * The sections as one `<section data-vya-details>` block, or "" when there is nothing to print.
 * A list section (flaws, measurements) is a `<ul>`; a one-or-few-line section is `<p>`s. No classes,
 * so a theme's stylesheet neither styles nor breaks it; the hairline uses the current colour.
 */
export function renderHostedDetailsHtml(sections: HostedDetailSection[]): string {
 if (!sections.length) return "";
 const parts = sections.map((s) => {
  const body = s.id === "flaws" || s.id === "measurements"
   ? `<ul style="${LINE};padding:0 0 0 1.1em">${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
   : s.lines.map((l) => `<p style="${LINE}">${esc(l)}</p>`).join("");
  return `<div data-vya-section="${s.id}" style="margin:0 0 1em"><p style="${LABEL}">${esc(s.label)}</p>${body}</div>`;
 });
 return `<section data-vya-details="1" style="margin:1.25em 0 0;padding:1em 0 0;border-top:1px solid;border-color:color-mix(in srgb,currentColor 12%,transparent);font:inherit;color:inherit;text-align:left">${parts.join("")}</section>`;
}
