// What the customer importer can actually read, and the message when it's handed something else.
//
// The panel used to say "we read any format" while the parser only ever read text — an Excel
// workbook picked through "All files" (or dropped in) turned into "Couldn't find any email
// addresses", which blamed the list instead of the file type. Gianna's review: "if only a csv is
// allowed for upload, let's make sure that's clear." So one place says which types, the panel and
// the API both ask it, and the refusal tells the seller exactly what to do next.

export const CUSTOMER_FILE_TYPES = [".csv", ".tsv", ".txt"] as const;
export const CUSTOMER_FILE_TYPES_LABEL = ".csv, .tsv or .txt";

const SPREADSHEET_EXT = /\.(xlsx|xlsm|xls|numbers|ods)$/i;
// Every .xlsx / .numbers / .ods is a zip archive, and every zip begins with "PK" + two control
// bytes. Read as text that's still the first thing in the string, so a workbook renamed to .csv
// (or dropped in past the picker's filter) is still caught before the parser shrugs at it.
const ZIP_HEADER = /^PK[\x01-\x08]/;

const EXCEL_MESSAGE = `That's an Excel file. Open it and use File › Save as › CSV, then upload the .csv it makes.`;

/** null when the file can be read; otherwise the message to show the seller. */
export function customerFileRefusal({ name, text }: { name: string | null; text: string }): string | null {
 if (ZIP_HEADER.test(text)) return EXCEL_MESSAGE;
 if (!name) return null;
 const lower = name.toLowerCase();
 if (CUSTOMER_FILE_TYPES.some((ext) => lower.endsWith(ext))) return null;
 if (SPREADSHEET_EXT.test(lower)) return EXCEL_MESSAGE;
 const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "that file";
 return `We can't read ${ext} files. Export your list as ${CUSTOMER_FILE_TYPES_LABEL} and upload that.`;
}
