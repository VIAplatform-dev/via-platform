// Shared CSV export. One definition so every download quotes the same way — a
// title containing a comma or a quote is the normal case in resale, not an edge
// one, and a spreadsheet that splits a listing name across two columns is worse
// than no export at all.

/** Quote a cell only when it needs it, doubling any embedded quotes (RFC 4180). */
export function csvCell(v: string | number | null | undefined): string {
 const s = v == null ? "" : String(v);
 return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
 return [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/**
 * Hand the browser a file. Excel needs the BOM to read UTF-8, or a seller's
 * accented brand names ("Chloé", "Hermès") arrive as mojibake.
 */
export function downloadCsv(filename: string, csv: string): void {
 const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
 a.href = url;
 a.download = filename;
 a.click();
 URL.revokeObjectURL(url);
}

/** "inventory-2026-08-31.csv" — dated, so repeated exports don't overwrite each other. */
export function datedFilename(base: string): string {
 return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
