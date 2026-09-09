import { test } from "node:test";
import assert from "node:assert/strict";
import { storeId, customerId, mailchimpStore, mailchimpCustomer, mailchimpProduct, mailchimpOrder, mailchimpCart, commerceReady } from "./esp-commerce.ts";

test("ids are safe in a URL and stable across syncs", () => {
 // They upsert on the id. An id that changes between runs creates a duplicate every time.
 assert.equal(storeId("Situations Vintage!"), "vya-situations-vintage-");
 assert.equal(customerId("Jane@Example.com"), "jane@example.com");
 assert.equal(customerId("jane@example.com"), customerId("JANE@EXAMPLE.COM"));
});

test("money crosses as a number, not cents and not a string", () => {
 const o = mailchimpOrder({ id: "o1", customer: { email: "a@b.com", subscribed: true }, totalCents: 124050, lines: [{ id: "l1", productId: "p1", priceCents: 20000 }] });
 assert.equal(o.order_total, 1240.5);
 assert.equal(o.lines[0].price, 200);
 assert.equal(typeof o.order_total, "number");
});

test("a store defaults to a currency they'll accept rather than being refused", () => {
 assert.equal(mailchimpStore({ slug: "s", name: "S", listId: "l" }).currency_code, "USD");
 assert.equal(mailchimpStore({ slug: "s", name: "S", listId: "l", currency: "gbp" }).currency_code, "GBP");
});

test("the store's own consent travels with the customer", () => {
 // Otherwise an unsubscribe on VYA stops our sends and Mailchimp's automations carry on.
 assert.equal(mailchimpCustomer({ email: "a@b.com", subscribed: false }).opt_in_status, false);
 assert.equal(mailchimpCustomer({ email: "a@b.com", subscribed: true }).opt_in_status, true);
});

test("a one-of-one piece gets exactly one variant, and a sold one shows no stock", () => {
 const p = mailchimpProduct({ id: "p1", title: "Silk dress", priceCents: 20000 });
 assert.equal(p.variants.length, 1);
 assert.equal(p.variants[0].id, "p1", "the variant is the piece");
 assert.equal(p.variants[0].inventory_quantity, 1);
 assert.equal(mailchimpProduct({ id: "p1", title: "x", priceCents: 1, inStock: false }).variants[0].inventory_quantity, 0);
});

test("a one-word name doesn't invent a surname", () => {
 assert.equal(mailchimpCustomer({ email: "a@b.com", name: "Cher", subscribed: true }).last_name, undefined);
});

test("a basket without a real email is caught here, not by their API", () => {
 // This is the usual reason an abandoned-cart sync silently does nothing.
 const lines = [{ id: "l", productId: "p", priceCents: 100 }];
 assert.equal(commerceReady({ id: "c", customer: { email: "", subscribed: true }, totalCents: 100, lines }), false);
 assert.equal(commerceReady({ id: "c", customer: { email: "not-an-email", subscribed: true }, totalCents: 100, lines }), false);
 assert.equal(commerceReady({ id: "c", customer: { email: "a@b.com", subscribed: true }, totalCents: 100, lines: [] }), false, "an empty basket is not a basket");
 assert.equal(commerceReady({ id: "c", customer: { email: "a@b.com", subscribed: true }, totalCents: 100, lines }), true);
});

test("a cart carries its lines, which is what makes their recovery emails work", () => {
 const c = mailchimpCart({ id: "c1", customer: { email: "a@b.com", subscribed: true }, totalCents: 20000, lines: [{ id: "l1", productId: "p1", priceCents: 20000 }] });
 assert.equal(c.lines[0].product_variant_id, "p1");
 assert.equal(c.lines[0].quantity, 1);
});
