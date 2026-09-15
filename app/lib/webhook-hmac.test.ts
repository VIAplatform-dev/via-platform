import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyHmacSha256, webhookAuthorised } from "./webhook-hmac.ts";

const SECRET = "s3cret";
const BODY = '{"description":"shipment.invoice.updated","result":{"shipment_id":"shp_1"}}';
const sign = (raw: string, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("hex");

test("a real signature passes, bare or prefixed", async () => {
 const hex = sign(BODY);
 assert.equal(await verifyHmacSha256(BODY, hex, SECRET), true);
 assert.equal(await verifyHmacSha256(BODY, `hmac-sha256-hex=${hex}`, SECRET), true);
 assert.equal(await verifyHmacSha256(BODY, hex.toUpperCase(), SECRET), true, "hex has two spellings");
 assert.equal(await verifyHmacSha256(BODY, ` ${hex} `, SECRET), true);
});

test("everything else fails", async () => {
 const hex = sign(BODY);
 assert.equal(await verifyHmacSha256(BODY, hex, "wrong-secret"), false);
 assert.equal(await verifyHmacSha256(BODY, sign(BODY, "wrong-secret"), SECRET), false);
 // A changed body, which is the whole point of signing it.
 assert.equal(await verifyHmacSha256(BODY.replace("shp_1", "shp_2"), hex, SECRET), false);
 // And a byte of whitespace, because the raw string is what was signed.
 assert.equal(await verifyHmacSha256(BODY + " ", hex, SECRET), false);
 for (const h of [null, undefined, "", "deadbeef", "not-hex", hex.slice(0, 63), hex + "aa"]) {
  assert.equal(await verifyHmacSha256(BODY, h, SECRET), false, JSON.stringify(h));
 }
});

test("no secret means shut, never open", async () => {
 // The direction to fail in. An unconfigured webhook that accepts everything is how a stranger
 // writes rows into your database.
 for (const secret of [undefined, null, "", "   "]) {
  assert.equal(await webhookAuthorised({ raw: BODY, token: "anything", secret }), false, JSON.stringify(secret));
  assert.equal(await webhookAuthorised({ raw: BODY, signatureHeader: sign(BODY), secret }), false, JSON.stringify(secret));
 }
});

test("either proof is accepted, because one provider signs and the other doesn't", async () => {
 // EasyPost signs the body. Shippo signs nothing, so its subscription URL carries the secret.
 assert.equal(await webhookAuthorised({ raw: BODY, signatureHeader: sign(BODY), secret: SECRET }), true);
 assert.equal(await webhookAuthorised({ raw: BODY, token: SECRET, secret: SECRET }), true);
 // Neither, or the wrong one.
 assert.equal(await webhookAuthorised({ raw: BODY, secret: SECRET }), false);
 assert.equal(await webhookAuthorised({ raw: BODY, token: "guess", secret: SECRET }), false);
 assert.equal(await webhookAuthorised({ raw: BODY, token: "", secret: SECRET }), false);
 assert.equal(await webhookAuthorised({ raw: BODY, signatureHeader: "deadbeef", token: "guess", secret: SECRET }), false);
});
