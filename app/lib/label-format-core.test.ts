import { test } from "node:test";
import assert from "node:assert";
import {
  labelOptionsFor, shippoLabelFileType, labelFormatNote, isLabelPrinter,
  LABEL_PRINTERS, DEFAULT_LABEL_PRINTER,
} from "./label-format-core.ts";

test("a label printer gets 4x6, which is the whole point", () => {
  // Without this the carrier returns its default: for USPS an 8.5x11 sheet with the label in the
  // top quarter, which a Rollo cannot print and a phone cannot crop.
  assert.deepEqual(labelOptionsFor("thermal"), { label_format: "PDF", label_size: "4x6" });
});

test("a regular printer asks for no size, so the carrier's sheet default stands", () => {
  assert.deepEqual(labelOptionsFor("sheet"), { label_format: "PDF" });
});

test("PDF either way, never ZPL", () => {
  // ZPL prints pixel-perfect on a Zebra and is unreadable gibberish in Mail, Files and every phone
  // viewer. A seller who opened it would think the label had failed.
  for (const p of ["thermal", "sheet"] as const) {
    assert.equal(labelOptionsFor(p).label_format, "PDF");
    assert.match(shippoLabelFileType(p), /^PDF/);
  }
});

test("Shippo's spelling of the same choice", () => {
  assert.equal(shippoLabelFileType("thermal"), "PDF_4x6");
  assert.equal(shippoLabelFileType("sheet"), "PDF");
});

test("the seller is told what she is about to get", () => {
  assert.match(labelFormatNote("thermal"), /4×6/);
  assert.match(labelFormatNote("sheet"), /cut it out/i);
});

test("the default is the recoverable mistake", () => {
  // A 4x6 on an ordinary printer can come out unscannable; a full page on a thermal printer is
  // only annoying. When guessing, guess the one you can recover from.
  assert.equal(DEFAULT_LABEL_PRINTER, "sheet");
});

test("only the two real choices are accepted", () => {
  assert.ok(isLabelPrinter("thermal"));
  assert.ok(isLabelPrinter("sheet"));
  for (const junk of ["zpl", "", null, undefined, 4, {}]) assert.ok(!isLabelPrinter(junk), String(junk));
});

test("every offered printer is a valid one, with words for it", () => {
  assert.deepEqual(LABEL_PRINTERS.map((p) => p.key), ["thermal", "sheet"]);
  for (const p of LABEL_PRINTERS) {
    assert.ok(isLabelPrinter(p.key));
    assert.ok(p.label.trim() && p.hint.trim(), p.key);
  }
});
