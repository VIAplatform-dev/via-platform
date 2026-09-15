import { test } from "node:test";
import assert from "node:assert/strict";
import { inferEra, inferCondition, parseProductId } from "./enrich.ts";
import { ERA_BUCKETS_SEED } from "./config.ts";

const B = ERA_BUCKETS_SEED;

test("inferEra: explicit 4-digit year", () => {
 assert.equal(inferEra("Vintage 1994 Versace silk shirt", B), "90s");
 assert.equal(inferEra("1978 disco wrap dress", B), "70s");
 assert.equal(inferEra("2003 Dior saddle bag", B), "y2k");
 assert.equal(inferEra("2015 Acne studios coat", B), "2010s");
 assert.equal(inferEra("1955 New Look gown", B), "pre-60s");
});

test("inferEra: decade tokens", () => {
 assert.equal(inferEra("Cute 90s baby tee", B), "90s");
 assert.equal(inferEra("1990s Moschino belt", B), "90s");
 assert.equal(inferEra("Y2K low-rise jeans, 2000s vibe", B), "y2k");
 assert.equal(inferEra("00s cargo skirt", B), "y2k");
 assert.equal(inferEra("2010s minimalist blazer", B), "2010s");
 assert.equal(inferEra("'80s power suit", B), "80s");
});

test("inferEra: Y2K keyword and decade words", () => {
 assert.equal(inferEra("Y2K it-girl mini", B), "y2k");
 assert.equal(inferEra("Classic nineties grunge flannel", B), "90s");
 assert.equal(inferEra("Groovy seventies flares", B), "70s");
});

test("inferEra: returns null when not confident", () => {
 assert.equal(inferEra("Vintage designer dress", B), null); // 'vintage' alone is too vague
 assert.equal(inferEra("Beautiful silk blouse", B), null);
 assert.equal(inferEra("20s flapper-style dress", B), null); // 1920s vs 2020s ambiguous → no guess
 assert.equal(inferEra("", B), null);
 assert.equal(inferEra(null, B), null);
});

test("inferEra: doesn't trip on non-year numbers", () => {
 assert.equal(inferEra("100% silk, 34 inch bust, $1200 retail", B), null);
});

test("inferCondition: confident matches across the taxonomy", () => {
 assert.equal(inferCondition("Deadstock, never worn, tags attached"), "Deadstock/NWT");
 assert.equal(inferCondition("NWT: brand new"), "Deadstock/NWT");
 assert.equal(inferCondition("In excellent condition, like new"), "Excellent");
 assert.equal(inferCondition("Mint condition vintage Chanel"), "Excellent");
 assert.equal(inferCondition("Very good condition, barely worn"), "Very Good");
 assert.equal(inferCondition("Good condition with minor wear"), "Good");
 assert.equal(inferCondition("Fair condition, well loved with visible wear"), "Fair");
});

test("inferCondition: 'very good' beats 'good' substring", () => {
 assert.equal(inferCondition("very good condition"), "Very Good");
});

test("inferCondition: null unless stated; style words ignored", () => {
 assert.equal(inferCondition("Gorgeous 90s slip dress in black"), null);
 assert.equal(inferCondition("Distressed denim jacket"), null); // style, not condition
 assert.equal(inferCondition(""), null);
 assert.equal(inferCondition(null), null);
});

test("parseProductId: resolves the inconsistent key shapes", () => {
 assert.equal(parseProductId("shiranka-vintage-2002761"), 2002761);
 assert.equal(parseProductId("the-vntg-collective-42"), 42);
 assert.equal(parseProductId(42), 42);
 assert.equal(parseProductId("42"), 42);
 assert.equal(parseProductId("unknown"), null);
 assert.equal(parseProductId(null), null);
 assert.equal(parseProductId(""), null);
});
