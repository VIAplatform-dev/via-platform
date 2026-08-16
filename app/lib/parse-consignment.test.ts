import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConsignors } from "./parse-consignment.ts";

test("parseConsignors maps common columns and dollar balances → cents", () => {
 const csv = [
  "Consignor Name,Email,Phone,Split %,Balance Owed,Payout Method",
  "Jane Doe,JANE@example.com,555-1212,60,\"$124.50\",Store Credit",
  "Bob Smith,bob@x.com,,50,0,Cash",
 ].join("\n");
 const rows = parseConsignors(csv);
 assert.equal(rows.length, 2);
 assert.equal(rows[0].name, "Jane Doe");
 assert.equal(rows[0].email, "jane@example.com"); // lowercased
 assert.equal(rows[0].splitPct, 60);
 assert.equal(rows[0].balanceCents, 12450);
 assert.equal(rows[0].payoutMethod, "store_credit");
 assert.equal(rows[1].balanceCents, 0);
 assert.equal(rows[1].payoutMethod, "cash");
});

test("parseConsignors builds a name from first/last and tolerates missing balance", () => {
 const csv = "First Name,Last Name,E-mail,Commission\nAda,Lovelace,ada@x.com,55";
 const rows = parseConsignors(csv);
 assert.equal(rows.length, 1);
 assert.equal(rows[0].name, "Ada Lovelace");
 assert.equal(rows[0].splitPct, 55);
 assert.equal(rows[0].balanceCents, 0);
});

test("parseConsignors skips rows without a name and handles tab-delimited", () => {
 const csv = "name\temail\tcurrent balance\nZoe\tzoe@x.com\t89.00\n\t nobody@x.com\t10";
 const rows = parseConsignors(csv);
 assert.equal(rows.length, 1);
 assert.equal(rows[0].name, "Zoe");
 assert.equal(rows[0].balanceCents, 8900);
});

test("parseConsignors ignores an implausible split (>100)", () => {
 const rows = parseConsignors("name,split\nX,150");
 assert.equal(rows[0].splitPct, null);
});
