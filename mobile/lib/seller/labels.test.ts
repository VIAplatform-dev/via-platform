import { test } from "node:test";
import assert from "node:assert/strict";
import { labelQuoteLine, type LabelQuote } from "./labels.ts";

const base: LabelQuote = {
  rate: { provider: "USPS", service: "Priority", costCents: 812, estDays: 2, rateId: "r_1" },
  sellerPays: false,
  buyerPaidCents: 1200,
  marginCents: 388,
  international: false,
  incoterm: null,
};

test("when the buyer funded shipping, the line reassures", () => {
  assert.equal(
    labelQuoteLine(base, "USD"),
    "$8.12, covered by the $12.00 the buyer paid for shipping. USPS Priority, about 2 days.",
  );
});

test("when SHE pays, that is the first thing said", () => {
  // This is the only case that can cost her money she wasn't expecting.
  const line = labelQuoteLine({ ...base, sellerPays: true, buyerPaidCents: 0 }, "USD");
  assert.match(line, /^\$8\.12 — charged to your card/);
});

test("an international parcel says who settles duty", () => {
  const ddu = labelQuoteLine({ ...base, international: true, incoterm: "DDU" }, "GBP");
  assert.match(ddu, /buyer settles duty on delivery/);
  const ddp = labelQuoteLine({ ...base, international: true, incoterm: "DDP" }, "GBP");
  assert.match(ddp, /duty covered/);
});

test("pennies are kept — a label is not a round number", () => {
  assert.match(labelQuoteLine(base, "GBP"), /£8\.12/);
});

test("a rate with no estimate doesn't invent one", () => {
  const line = labelQuoteLine({ ...base, rate: { ...base.rate, estDays: null } }, "USD");
  assert.match(line, /USPS Priority\./);
  assert.doesNotMatch(line, /about/);
});
