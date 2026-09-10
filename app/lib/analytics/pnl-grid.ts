// The P&L as a spreadsheet: months across the top, lines down the side.
//
// The existing Profit & loss is one column for one period, which answers "how did this quarter go"
// and nothing else. A shop keeps its books to see the shape of a year — which months carry it, when
// costs jumped, whether last March beat this one — and that is a grid, which is why every seller
// already has one in Excel.
//
// Pure, so the arithmetic can be tested and so the same numbers can be rendered on screen and
// written to a CSV she opens in the spreadsheet she came from.

export type MoneyDirection = "in" | "out";

/** One dated amount — from her own imported sheet, or from VYA's records. */
export type LedgerEntry = {
 date: string;          // yyyy-mm-dd
 rowKey: string;        // which P&L line it belongs to
 amountCents: number;   // always positive; `direction` carries the sign
 direction: MoneyDirection;
 imported?: boolean;
};

export type GridRow = {
 key: string;
 label: string;
 direction: MoneyDirection | "net";
 /** Cents per month, index-matched to `months`. Signed the way a P&L reads: costs negative. */
 cells: number[];
 total: number;
};

export type Grid = {
 /** "2026-01" … in order. */
 months: string[];
 monthLabels: string[];
 rows: GridRow[];
 /** Months holding BOTH imported rows and VYA's own — where a figure could be counted twice. */
 overlapMonths: string[];
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthOf = (iso: string) => String(iso || "").slice(0, 7);

export function monthLabel(m: string): string {
 const [y, mo] = m.split("-");
 const i = Number(mo) - 1;
 return `${MONTH_NAMES[i] ?? mo} ${String(y).slice(2)}`;
}

/** Every month from the earliest entry to the latest, with no gaps — an empty month is information. */
export function monthSpan(entries: LedgerEntry[]): string[] {
 const ms = entries.map((e) => monthOf(e.date)).filter(Boolean).sort();
 if (!ms.length) return [];
 const out: string[] = [];
 const [y0, m0] = ms[0].split("-").map(Number);
 const [y1, m1] = ms[ms.length - 1].split("-").map(Number);
 let y = y0, m = m0;
 // Bounded so a stray 1970 or 2099 date can't spin this up into thousands of columns.
 for (let guard = 0; guard < 600 && (y < y1 || (y === y1 && m <= m1)); guard++) {
  out.push(`${y}-${String(m).padStart(2, "0")}`);
  if (++m > 12) { m = 1; y++; }
 }
 return out;
}

/**
 * Build the grid.
 *
 * `rowOrder` fixes which lines appear and in what order, so a month with no shipping labels still
 * shows the row — a line that vanishes when it's zero makes two months impossible to compare.
 */
export function buildGrid(
 entries: LedgerEntry[],
 rowOrder: { key: string; label: string; direction: MoneyDirection }[],
): Grid {
 const months = monthSpan(entries);
 const idx = new Map(months.map((m, i) => [m, i]));
 const zero = () => months.map(() => 0);

 const byKey = new Map<string, number[]>();
 for (const r of rowOrder) byKey.set(r.key, zero());
 const importedIn = new Set<string>();
 const vyaIn = new Set<string>();

 for (const e of entries) {
  const m = monthOf(e.date);
  const i = idx.get(m);
  if (i == null) continue;
  const cells = byKey.get(e.rowKey);
  if (!cells) continue;
  const signed = e.direction === "out" ? -Math.abs(e.amountCents) : Math.abs(e.amountCents);
  cells[i] += signed;
  (e.imported ? importedIn : vyaIn).add(m);
 }

 const rows: GridRow[] = rowOrder.map((r) => {
  const cells = byKey.get(r.key) ?? zero();
  return { key: r.key, label: r.label, direction: r.direction, cells, total: cells.reduce((a, b) => a + b, 0) };
 });

 // The closing line, computed from the rows above rather than from the entries again — one sum, so
 // the column can never disagree with what is printed above it.
 const net = months.map((_m, i) => rows.reduce((s, r) => s + r.cells[i], 0));
 rows.push({ key: "net", label: "Net profit", direction: "net", cells: net, total: net.reduce((a, b) => a + b, 0) });

 return {
  months,
  monthLabels: months.map(monthLabel),
  rows,
  overlapMonths: months.filter((m) => importedIn.has(m) && vyaIn.has(m)),
 };
}

/** The grid as a CSV, for the spreadsheet she came from. */
export function gridToCsv(grid: Grid): string {
 const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
 const money = (c: number) => (c / 100).toFixed(2);
 const head = ["", ...grid.monthLabels, "Total"].map(esc).join(",");
 const body = grid.rows.map((r) => [esc(r.label), ...r.cells.map(money), money(r.total)].join(","));
 return [head, ...body].join("\n");
}
