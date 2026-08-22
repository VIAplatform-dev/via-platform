// Switching a section from one layout to another, without losing the merchant's work.
//
// The governing rule here is simple and worth stating plainly: **a layout switch never deletes
// props.** It only ever ADDS or DERIVES what the destination layout needs. That single rule buys
// three things at once —
//   • switching back restores everything, because nothing was thrown away;
//   • undo (the studio's design-wide snapshot stack) is exact, not approximate;
//   • "we'll keep the first slide, the others won't show in this layout" is honest — the other
//     slides are genuinely still there, not quietly destroyed.
//
// What it will NOT do is invent content. A destination field with nothing to derive from is left
// empty (or seeded from the variant's own defaults, which are structure, not copy).

import type { Block } from "./storefront-blocks.ts";
import { variantsFor, normalizeVariant, variantSupports } from "./storefront-variants.ts";
import { ITEM_SCHEMAS, readItems, writeItems, type Item } from "./storefront-items.ts";

// The concepts that carry across layouts. A heading is a heading whether it sits over a photo, beside
// one, or on the first slide of a slideshow — so these keys map by NAME, in both directions.
const SHARED_KEYS = ["heading", "subtext", "cta", "image", "body", "price", "caption"] as const;

function schemaFor(name?: string) {
 return name ? ITEM_SCHEMAS[name as keyof typeof ITEM_SCHEMAS] : undefined;
}

// What changes if the merchant commits this switch — shown BEFORE they do, so nothing is a surprise.
export function switchNotes(block: Block, toVariant: string): string[] {
 const from = variantSupports(block.type, block.variant);
 const to = variantSupports(block.type, toVariant);
 const notes: string[] = [];
 const fromSchema = schemaFor(from.items);
 const toSchema = schemaFor(to.items);
 if (fromSchema && !toSchema) {
  const n = readItems(block.props, fromSchema).length;
  if (n > 1) notes.push(`This layout shows one, so the first is kept — the other ${n - 1} stay saved and come back if you switch again.`);
 }
 if (toSchema && !fromSchema && !readItems(block.props, toSchema).length) {
  notes.push("Your current heading, text, button, and photo become the first item.");
 }
 if (from.free?.length && !to.free?.length && block.style?.free && Object.keys(block.style.free).length) {
  notes.push("Text you positioned by hand returns to this layout's own placement.");
 }
 return notes;
}

// Apply the switch. Returns a NEW block; the caller sets it through the normal update path, so
// autosave and undo treat it like any other edit.
export function applyVariant(block: Block, toVariant: string): Block {
 // Exact match, deliberately NOT resolveVariant's forgiving fallback. Rendering an unknown id as the
 // default is right — the storefront must never go blank. WRITING an unknown id as the default is
 // not: a typo'd id would quietly rewrite a merchant's chosen layout as "bleed". So a destination we
 // don't recognize changes nothing at all.
 const toDef = variantsFor(block.type).find((v) => v.id === toVariant);
 if (!toDef) return block;
 const from = variantSupports(block.type, block.variant);
 const to = toDef.supports || {};
 const props: Record<string, string> = { ...(block.props || {}) };
 const fromSchema = schemaFor(from.items);
 const toSchema = schemaFor(to.items);

 // Singular → repeated: seed the first item from the section's existing content, so switching a hero
 // into a slideshow gives you your hero as slide one rather than an empty carousel.
 if (toSchema && toSchema !== fromSchema && !readItems(props, toSchema).length) {
  const seed: Item = {};
  let any = false;
  for (const f of toSchema.fields) {
   const v = props[f];
   if (v) { seed[f] = v; any = true; }
  }
  if (any) props[toSchema.key] = writeItems([seed], toSchema);
 }

 // Repeated → singular: hoist the first item up into the fields this layout reads. Only fills gaps —
 // a value the merchant already set at the section level wins over one derived from an item.
 if (fromSchema && fromSchema !== toSchema) {
  const [first] = readItems(props, fromSchema);
  if (first) for (const k of SHARED_KEYS) {
   if (!props[k] && first[k]) props[k] = first[k];
  }
 }

 // Structural defaults the destination needs (a split's image side, say) — never overwriting a value
 // that's already there.
 for (const [k, v] of Object.entries(toDef.defaults || {})) {
  if (props[k] === undefined || props[k] === "") props[k] = v;
 }

 const variant = normalizeVariant(block.type, toVariant);
 const next: Block = { ...block, props };
 if (variant) next.variant = variant; else delete next.variant;
 return next;
}
