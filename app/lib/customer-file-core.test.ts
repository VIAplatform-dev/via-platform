import { test } from "node:test";
import assert from "node:assert/strict";
import { customerFileRefusal, CUSTOMER_FILE_TYPES } from "./customer-file-core.ts";

// Every .xlsx is a zip archive, and every zip starts with these four bytes.
const XLSX_BYTES = "PK\u0003\u0004";

test("csv, tsv and txt files are accepted", () => {
 for (const name of ["list.csv", "Customers.CSV", "export.tsv", "emails.txt"]) assert.equal(customerFileRefusal({ name, text: "email\njane@example.com" }), null);
 assert.deepEqual(CUSTOMER_FILE_TYPES, [".csv", ".tsv", ".txt"]);
});

test("an Excel workbook is refused with the way out", () => {
 const r = customerFileRefusal({ name: "customers.xlsx", text: XLSX_BYTES });
 assert.match(r!, /Excel/);
 assert.match(r!, /Save as/i);
 assert.match(r!, /CSV/);
});

test("an Excel workbook is caught by its bytes even when renamed .csv", () => {
 assert.match(customerFileRefusal({ name: "customers.csv", text: XLSX_BYTES })!, /Excel/);
});

test("any other type names what it is and what to send instead", () => {
 const r = customerFileRefusal({ name: "audience.pdf", text: "" });
 assert.match(r!, /\.pdf/);
 assert.match(r!, /\.csv, \.tsv or \.txt/);
});

test("pasted text (no file name) is never refused by name", () => {
 assert.equal(customerFileRefusal({ name: null, text: "jane@example.com" }), null);
});
