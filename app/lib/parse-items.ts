import { MAX_ITEM_IMAGES } from "./item-limits";

// Flexible product/inventory CSV parser. Sellers export from Shopify, Square, a
// spreadsheet, etc., so we sniff the delimiter and map columns by fuzzy header name
// (title/name, price, brand, size, condition, era, material, category, description,
// image URL(s)). A row needs at least a title + price to become a draft item.

export type ParsedItem = {
 title: string;
 priceCents: number;
 currency: string;
 brand: string | null;
 era: string | null;
 material: string | null;
 condition: string | null;
 size: string | null;
 category: string | null;
 description: string | null;
 images: string[];
};

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
const URL_RE = /https?:\/\/[^\s,"]+/gi;

export function parseItems(text: string): ParsedItem[] {
 const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
 if (lines.length < 2) return []; // need a header + at least one row
 const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
 const header = splitLine(lines[0], delim).map((c) => c.toLowerCase());

 const find = (re: RegExp) => header.findIndex((c) => re.test(c));
 const idx = {
 title: find(/(^|\b)(title|name|product|item)(\b|$)/),
 price: find(/price|amount|cost.*sell|listing.?price/),
 brand: find(/brand|designer|vendor|maker/),
 era: find(/era|decade|year|period/),
 material: find(/material|fabric|composition/),
 condition: find(/condition|grade|state/),
 size: find(/\bsize\b/),
 category: find(/category|type|department/),
 description: find(/description|details|body|notes?/),
 image: find(/image|photo|picture|img|media|url/),
 };
 if (idx.title < 0 || idx.price < 0) return []; // can't make items without a title + price

 const at = (cells: string[], i: number) => (i >= 0 && cells[i] ? cells[i].trim() : "");
 const seen = new Set<string>();
 const items: ParsedItem[] = [];
 for (const line of lines.slice(1)) {
 const cells = splitLine(line, delim);
 const title = at(cells, idx.title);
 const priceRaw = at(cells, idx.price);
 const priceCents = toCents(priceRaw);
 if (!title || !priceCents) continue;
 const key = title.toLowerCase();
 if (seen.has(key)) continue;
 seen.add(key);
 // Images: a dedicated column may hold one or several URLs (comma/space separated).
 const imgCell = at(cells, idx.image);
 const images = imgCell ? (imgCell.match(URL_RE) || []).slice(0, MAX_ITEM_IMAGES) : [];
 items.push({
 title,
 priceCents,
 currency: cur(priceRaw),
 brand: at(cells, idx.brand) || null,
 era: at(cells, idx.era) || null,
 material: at(cells, idx.material) || null,
 condition: at(cells, idx.condition) || null,
 size: at(cells, idx.size) || null,
 category: at(cells, idx.category) || null,
 description: at(cells, idx.description) || null,
 images,
 });
 }
 return items;
}
