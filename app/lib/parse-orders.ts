import type { ImportedOrderInput } from "./imported-orders-db";

// Flexible historical-order CSV parser. Handles the common exports (Shopify, Square,
// spreadsheet). Shopify's order export is the tricky one: ONE order spans multiple rows
// (one per line item), with order-level fields (total, email, date) only on the first
// row. So we group rows by order id, take the order-level fields from the first row that
// has them, sum line-item amounts when there's no order total, and join item titles.

function splitLine(line: string, delim: string): string[] {
 const out: string[] = [];
 let cur = "";
 let inQ = false;
 for (let i = 0; i < line.length; i++) {
 const ch = line[i];
 if (ch === '"') {
 if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
 else inQ = !inQ;
 } else if (ch === delim && !inQ) {
 out.push(cur); cur = "";
 } else cur += ch;
 }
 out.push(cur);
 return out.map((c) => c.trim());
}

const toCents = (v: string): number => Math.round((parseFloat((v || "").replace(/[^0-9.]/g, "")) || 0) * 100);
const cur = (v: string): string => (/£/.test(v) ? "GBP" : /€/.test(v) ? "EUR" : "USD");

export function parseOrders(text: string): ImportedOrderInput[] {
 const lines = text.split(/\r?\n/).filter((l) => l.trim());
 if (lines.length < 2) return [];
 const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
 const header = splitLine(lines[0], delim).map((c) => c.toLowerCase());
 const find = (re: RegExp) => header.findIndex((c) => re.test(c));
 const idx = {
 id: find(/^name$|order.?(number|id|name|#)|^#$|invoice/),
 date: find(/created.?at|order.?date|^date$|paid.?at|processed/),
 email: find(/email|e-mail/),
 name: find(/(billing|customer|shipping).?name|^name$/),
 first: find(/first.?name/),
 last: find(/last.?name/),
 item: find(/lineitem.?name|line.?item|product|item.?name|title|description/),
 qty: find(/lineitem.?quantity|quantity|qty/),
 amount: find(/^total$|order.?total|grand.?total|^amount$|total.?price|subtotal|net.?sales/),
 lineprice: find(/lineitem.?price|line.?price|price/),
 status: find(/financial.?status|fulfillment|payment.?status|^status$/),
 };
 const at = (cells: string[], i: number) => (i >= 0 && cells[i] != null ? cells[i].trim() : "");

 // Group by order id when present, so Shopify's multi-line orders collapse to one record.
 const grouped = new Map<string, ImportedOrderInput & { _seenAmount: boolean }>();
 const ungrouped: ImportedOrderInput[] = [];

 for (const line of lines.slice(1)) {
 const cells = splitLine(line, delim);
 const id = at(cells, idx.id) || null;
 const amountRaw = at(cells, idx.amount) || at(cells, idx.lineprice);
 const amountCents = toCents(amountRaw);
 const itemTitle = at(cells, idx.item) || null;
 const email = (at(cells, idx.email) || "").toLowerCase() || null;
 let name: string | null = at(cells, idx.name) || null;
 if (!name && (idx.first >= 0 || idx.last >= 0)) name = [at(cells, idx.first), at(cells, idx.last)].filter(Boolean).join(" ") || null;
 const qtyRaw = at(cells, idx.qty);
 const quantity = qtyRaw ? parseInt(qtyRaw.replace(/[^0-9]/g, ""), 10) || null : null;
 const status = at(cells, idx.status) || null;
 const orderDate = at(cells, idx.date) || null;

 // A row must carry SOMETHING useful (an amount or an item).
 if (!amountCents && !itemTitle) continue;

 if (id) {
 const g = grouped.get(id);
 if (!g) {
 grouped.set(id, {
 externalId: id, orderDate, buyerName: name, buyerEmail: email,
 itemTitle, quantity, amountCents, currency: cur(amountRaw), status,
 _seenAmount: amountCents > 0,
 });
 } else {
 // Merge subsequent line-item rows into the existing order.
 if (!g._seenAmount && amountCents > 0) { g.amountCents = amountCents; g._seenAmount = true; }
 else if (!g._seenAmount && !at(cells, idx.amount)) g.amountCents += amountCents; // summing line prices
 if (itemTitle) g.itemTitle = g.itemTitle ? `${g.itemTitle}, ${itemTitle}` : itemTitle;
 if (!g.buyerEmail && email) g.buyerEmail = email;
 if (!g.buyerName && name) g.buyerName = name;
 if (!g.orderDate && orderDate) g.orderDate = orderDate;
 if (!g.status && status) g.status = status;
 }
 } else {
 ungrouped.push({ externalId: null, orderDate, buyerName: name, buyerEmail: email, itemTitle, quantity, amountCents, currency: cur(amountRaw), status });
 }
 }

 const out = [...[...grouped.values()].map(({ _seenAmount, ...o }) => o), ...ungrouped];
 // Keep only orders that ended up with a real amount.
 return out.filter((o) => o.amountCents > 0);
}
