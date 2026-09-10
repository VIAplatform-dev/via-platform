import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_EMAILS, isAdminEmail } from "./admin-emails.ts";

test("the four people who run VYA", () => {
  assert.deepEqual([...ADMIN_EMAILS].sort(), [
    "avishig5@terpmail.umd.edu",
    "gianna@vyaplatform.com",
    "giannaraucher@gmail.com",
    "hana@vyaplatform.com",
  ]);
});

test("case and whitespace don't decide who you are", () => {
  assert.equal(isAdminEmail("Gianna@VYAplatform.com"), true);
  assert.equal(isAdminEmail("  hana@vyaplatform.com  "), true);
});

test("a seller is not an admin", () => {
  assert.equal(isAdminEmail("someone@example.com"), false);
  assert.equal(isAdminEmail(""), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
});

test("a lookalike address is not a match", () => {
  // Substring matching here would hand admin to anyone who could register the right domain.
  assert.equal(isAdminEmail("hana@vyaplatform.com.evil.com"), false);
  assert.equal(isAdminEmail("nothana@vyaplatform.com"), false);
  assert.equal(isAdminEmail("hana@vyaplatform.co"), false);
});
