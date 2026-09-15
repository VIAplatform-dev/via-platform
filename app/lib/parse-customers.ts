// Flexible customer-list parser. Sellers export from all kinds of systems
// (Shopify, Square, Mailchimp, Klaviyo, a plain list), so we don't assume a fixed
// format: we sniff the delimiter, detect an email/name/phone column from the
// header when there is one, and otherwise pull any email-looking token per line.

export type ParsedCustomer = { email: string; name: string | null; phone: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitLine(line: string, delim: string): string[] {
 // Minimal CSV: respects double-quoted cells (which may contain the delimiter).
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

export function parseCustomers(text: string): ParsedCustomer[] {
 const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
 if (!lines.length) return [];
 const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";

 const header = splitLine(lines[0], delim).map((c) => c.toLowerCase());
 const hasHeader = header.some((c) => /email|e-mail|name|phone|first|last/.test(c)) && !header.some((c) => c.includes("@"));

 let emailIdx = -1, nameIdx = -1, firstIdx = -1, lastIdx = -1, phoneIdx = -1;
 if (hasHeader) {
 header.forEach((c, i) => {
 if (emailIdx < 0 && /email|e-mail/.test(c)) emailIdx = i;
 if (firstIdx < 0 && /first/.test(c)) firstIdx = i;
 if (lastIdx < 0 && /last/.test(c)) lastIdx = i;
 if (nameIdx < 0 && /(full.?name|customer.?name|^name$|display.?name)/.test(c)) nameIdx = i;
 if (phoneIdx < 0 && /phone|mobile|tel/.test(c)) phoneIdx = i;
 });
 }

 const byEmail = new Map<string, ParsedCustomer>();
 for (const line of hasHeader ? lines.slice(1) : lines) {
 const cells = splitLine(line, delim);
 let email = emailIdx >= 0 ? cells[emailIdx] || "" : cells.find((c) => EMAIL_RE.test(c)) || "";
 email = email.toLowerCase().trim();
 if (!EMAIL_RE.test(email)) continue;

 let name: string | null = null;
 if (nameIdx >= 0 && cells[nameIdx]) name = cells[nameIdx];
 else if (firstIdx >= 0 || lastIdx >= 0) name = [cells[firstIdx], cells[lastIdx]].filter(Boolean).join(" ").trim() || null;
 const phone = phoneIdx >= 0 ? cells[phoneIdx] || null : null;

 if (!byEmail.has(email)) byEmail.set(email, { email, name: name || null, phone: phone || null });
 }
 return [...byEmail.values()];
}
