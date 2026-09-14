import { test } from "node:test";
import assert from "node:assert/strict";
import { customsSigner, customsTaxId, receiptLegalLine } from "./legal-identity.ts";

test("a customs form is signed by the registered business where there is one", () => {
 assert.equal(customsSigner({ legalName: "Blummier Ltd" }, "Blummier"), "Blummier Ltd");
 assert.equal(customsSigner({ legalName: "  " }, "Blummier"), "Blummier");
 assert.equal(customsSigner({}, ""), "Seller");
});

// The rule that keeps a wrong answer off a legal document.
test("a company number is never sent as a tax id", () => {
 assert.equal(customsTaxId({ companyNumber: "09123456" }), null);
 assert.deepEqual(customsTaxId({ vatNumber: "GB123456789", companyNumber: "09123456" }), { number: "GB123456789", type: "VAT" });
});

test("a VAT number is closed up, because carriers reject it spaced", () => {
 assert.deepEqual(customsTaxId({ vatNumber: "gb 123 4567 89" }), { number: "GB1234567 89".replace(/\s/g, ""), type: "VAT" });
 assert.equal(customsTaxId({ vatNumber: "" }), null);
 assert.equal(customsTaxId({ vatNumber: "GB1" }), null); // too short to be one
});

test("the receipt footer prints only what she filled in", () => {
 assert.equal(
  receiptLegalLine({ legalName: "Blummier Ltd", companyNumber: "09123456", vatNumber: "GB123456789" }, "Blummier"),
  "Blummier Ltd · Company 09123456 · VAT GB123456789",
 );
 assert.equal(receiptLegalLine({ companyNumber: "09123456" }, "Blummier"), "Company 09123456");
 // Nothing filled in: no separators, no "undefined", no empty line on a customer's receipt.
 assert.equal(receiptLegalLine({}, "Blummier"), "");
 // A sole trader whose legal name IS her shop name shouldn't see it twice.
 assert.equal(receiptLegalLine({ legalName: "Blummier" }, "Blummier"), "");
 assert.equal(receiptLegalLine({ legalName: "blummier" }, "Blummier"), "");
});
