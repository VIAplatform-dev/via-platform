import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditCapture } from "./capture-edit-access.ts";

test("a signed-out visitor may never open edit mode", () => {
 const a = canEditCapture("tous-vintage", { slug: null });
 assert.equal(a.allowed, false);
 assert.equal(a.allowed === false && a.reason, "signed-out");
});

test("a seller signed into her own store may open her own editor", () => {
 assert.equal(canEditCapture("tous-vintage", { slug: "tous-vintage" }).allowed, true);
});

test("a seller signed into a DIFFERENT store may not open this one's editor", () => {
 const a = canEditCapture("tous-vintage", { slug: "blummier" });
 assert.equal(a.allowed, false);
 assert.equal(a.allowed === false && a.reason, "other-store");
});

test("slug matching ignores case and stray whitespace", () => {
 assert.equal(canEditCapture("Tous-Vintage", { slug: " tous-vintage " }).allowed, true);
});

test("a VYA admin may open any store's editor (portal preview)", () => {
 assert.equal(canEditCapture("tous-vintage", { slug: "via-admin", isAdmin: true }).allowed, true);
 assert.equal(canEditCapture("tous-vintage", { slug: null, isAdmin: true }).allowed, true);
});

test("an empty acting slug is signed-out, not a match for an empty site slug", () => {
 const a = canEditCapture("", { slug: "" });
 assert.equal(a.allowed, false);
 assert.equal(a.allowed === false && a.reason, "signed-out");
});
