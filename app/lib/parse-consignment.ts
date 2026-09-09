import type { ConsignorImportRow } from "./consignment-db";

// Generic consignor-roster CSV parser for stores migrating off another consignment platform
// (ConsignCloud, SimpleConsign, Ricochet, Resaleworld, or a plain spreadsheet). Rather than a
// parser per tool, we column-map by common header names — every export carries the same shape:
// a consignor (name/contact), their split, and a current balance owed. The balance is the one
// that matters: it comes over as a stated OPENING figure, never a replay of past sales (see
// importConsignors), so nothing gets double-counted or double-paid.

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

/**
 * A money column, in cents.
 *
 * Has to cope with both conventions, because a store's export follows its own locale: "1,240.50"
 * (comma groups thousands) and "1.240,50" or "124,50" (comma is the decimal point). Getting this
 * wrong is not a cosmetic bug — reading "124,50" as 12450 tells a store it owes a consignor
 * $12,450 instead of $124.50.
 *
 * The rule is positional, which is what actually distinguishes them: whichever separator comes LAST
 * is the decimal point, and a lone comma with exactly two digits after it is a decimal comma.
 */
export const toCents = (v: string): number => {
 const raw = (v || "").replace(/[^0-9.,-]/g, "").trim();
 if (!raw) return 0;
 const lastComma = raw.lastIndexOf(",");
 const lastDot = raw.lastIndexOf(".");
 let normalised: string;
 if (lastComma > -1 && lastDot > -1) {
  // Both present — the later one is the decimal point, the earlier one groups thousands.
  normalised = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
 } else if (lastComma > -1) {
  // Only commas. Two digits after a single comma is a decimal ("124,50"); anything else groups.
  const after = raw.length - lastComma - 1;
  normalised = after === 2 && raw.indexOf(",") === lastComma ? raw.replace(",", ".") : raw.replace(/,/g, "");
 } else {
  normalised = raw;
 }
 return Math.round((parseFloat(normalised) || 0) * 100);
};
const toPct = (v: string): number | null => { const n = parseFloat((v || "").replace(/[^0-9.]/g, "")); return isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : null; };

// Map whatever the platform calls the payout method onto VYA's vocabulary; unknown → null
// (the store's default payout method applies).
function normPayout(v: string): string | null {
 const s = (v || "").toLowerCase();
 if (!s.trim()) return null;
 if (/credit/.test(s)) return "store_credit";
 if (/cash/.test(s)) return "cash";
 if (/che(ck|que)/.test(s)) return "check";
 if (/paypal/.test(s)) return "paypal";
 if (/venmo/.test(s)) return "venmo";
 if (/stripe|ach|bank|direct.?deposit|transfer|zelle/.test(s)) return "stripe";
 return null;
}

export function parseConsignors(text: string): ConsignorImportRow[] {
 const lines = text.split(/\r?\n/).filter((l) => l.trim());
 if (lines.length < 2) return [];
 const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
 const header = splitLine(lines[0], delim).map((c) => c.toLowerCase());
 const find = (re: RegExp) => header.findIndex((c) => re.test(c));
 const idx = {
 name: find(/consignor.?name|vendor.?name|seller.?name|account.?name|full.?name|^name$|^consignor$|^vendor$/),
 first: find(/first.?name/),
 last: find(/last.?name/),
 email: find(/email|e-mail/),
 phone: find(/phone|mobile|cell|^tel$/),
 split: find(/consignor.?(split|commission|percent|pct|rate|share)|split.?(pct|percent)?|^split$|commission|payout.?(pct|percent|rate)/),
 balance: find(/balance|amount.?owed|owed|account.?balance|credit.?balance|current.?balance|due|payable/),
 payout: find(/payout.?method|payment.?method|payout.?type|pay.?by|^method$/),
 id: find(/consignor.?(id|number|no)|vendor.?(id|number)|account.?(id|number)|^id$/),
 };
 const at = (cells: string[], i: number) => (i >= 0 && cells[i] != null ? cells[i].trim() : "");

 const out: ConsignorImportRow[] = [];
 for (const line of lines.slice(1)) {
 const cells = splitLine(line, delim);
 let name = at(cells, idx.name);
 if (!name && (idx.first >= 0 || idx.last >= 0)) name = [at(cells, idx.first), at(cells, idx.last)].filter(Boolean).join(" ");
 if (!name) continue; // a consignor row needs a name
 out.push({
 name,
 email: at(cells, idx.email).toLowerCase() || null,
 phone: at(cells, idx.phone) || null,
 splitPct: toPct(at(cells, idx.split)),
 payoutMethod: normPayout(at(cells, idx.payout)),
 balanceCents: toCents(at(cells, idx.balance)),
 externalId: at(cells, idx.id) || null,
 });
 }
 return out;
}
