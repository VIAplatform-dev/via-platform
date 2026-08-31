// VYA inventory, rendered in SQUARESPACE's shopping-cart shape.
//
// Same trick as cart-json.ts does for Shopify, in the other big platform's dialect. Squarespace's
// commerce bundle (assets.squarespace.com/universal/scripts-compressed/commerce-*.js) talks to its
// cart over RELATIVE paths, so on a VYA-served store origin it talks to us:
//
//   POST /api/commerce/shopping-cart/entries   {itemId, sku, quantity, additionalFields}
//        → {shoppingCart: <cart>, newlyAdded: <entry>}
//   GET  /api/commerce/shopping-cart           → <cart>
//
// The contract below is read off that bundle, not guessed. Its ShoppingCart model declares exactly
// these attributes (anything else it receives is ignored):
//
//   id, websiteId, orderId, created, expiresAt, isPurchased, entries, shippingOptions,
//   selectedShippingOption, shippingLocation, applicableTaxRules, coupons, validCoupons,
//   invalidCoupons, subtotalCents, taxCents, shippingCostCents, discountCents, grandTotalCents,
//   totalQuantity, hasDigital, purelyDigital, requiresShipping
//
// and two of them drive the visible UI: the header cart pill syncs from
// `TemplateCart.syncAll({items: totalQuantity, subtotal: subtotalAmount})`, where `subtotalAmount`
// is derived from `subtotalCents`. The product page's own "is this already in my cart?" test reads
// `entries[].itemId` and `entries[].chosenVariant.sku`.
//
// Pure — no database, no network. The routes fetch items and hand them here.
import type { CartLineItem } from "./cart-json";

/** Squarespace money: a currency code and a STRING amount with two decimals ("550.00"). Its cart
 *  totals are integer cents instead — both shapes appear, so both are built here. */
export type SqsMoney = { currency: string; value: string };

export type SqsChosenVariant = {
 id: string;
 sku: string | null;
 price: SqsMoney;
 unlimited: boolean;
 qtyInStock: number;
 soldOut: boolean;
 attributes: Record<string, string>;
};

export type SqsCartEntry = {
 id: string;
 itemId: string;
 quantity: number;
 chosenVariant: SqsChosenVariant;
 /** Descriptive fields the cart page renders. A one-of-one piece has one variant and no options. */
 title: string;
 productName: string;
 fullUrl: string;
 imageUrl: string | null;
 /**
  * The line total the "Added to cart!" mini-cart prints, IN MINOR UNITS.
  *
  * Its own code is unambiguous about both the name and the unit:
  *
  *   const m = Gp(successData.subTotal, successData.item?.price?.currency || variant?.price?.currency)
  *   function Gp(u, h) { … const _ = u / Math.pow(10, digits); return formatMoney(new Money(_, M)) }
  *
  * so `subTotal` — capital T, cents — is what it divides by 100. The cart TOTALS on the model next
  * to it are spelled `subtotalCents` instead; both spellings are real and neither substitutes for
  * the other, which is why a cart that showed the right piece still showed it at $0.00.
  */
 subTotal: number;
 /** Read for its currency by the same line. */
 item: { price: SqsMoney };
 unitPriceCents: number;
 subtotalCents: number;
 additionalFields: null;
};

export type SqsShoppingCart = {
 id: string;
 websiteId: string;
 // Absent, not null, when there's no order/shipping choice yet — see buildSqsCart() for why.
 orderId?: string;
 created: number;
 expiresAt: number;
 isPurchased: boolean;
 entries: SqsCartEntry[];
 shippingOptions: unknown[];
 selectedShippingOption?: Record<string, unknown>;
 shippingLocation?: Record<string, unknown>;
 applicableTaxRules: unknown[];
 coupons: unknown[];
 validCoupons: unknown[];
 invalidCoupons: unknown[];
 subtotalCents: number;
 taxCents: number;
 shippingCostCents: number;
 discountCents: number;
 grandTotalCents: number;
 totalQuantity: number;
 hasDigital: boolean;
 purelyDigital: boolean;
 requiresShipping: boolean;
};

/** What Squarespace itself answers when the visitor has never had a cart — verified against a live
 *  Squarespace store, which returns it with a 404. Their bundle treats that as "empty", so matching
 *  it exactly is what stops the pill rendering a phantom item on a first visit. */
export const NO_CART_MESSAGE = "You have no shopping cart yet.";

/**
 * No cart-level reservation. `expiresAt` is not decoration on a Squarespace store: its
 * ReservedCartController mounts a live countdown banner ("Your cart is reserved for 19:41") for any
 * value in the future, and its mini-cart repeats it. VYA holds a piece for ten minutes AT CHECKOUT
 * (DEFAULT_RESERVATION_TTL_SECONDS) and not a second at add-to-cart, so any countdown here is a
 * promise the platform doesn't keep — the first version sent a 14-day expiry and the banner duly
 * offered the shopper a 20,159-minute reservation. Zero is in the past, so the banner never mounts.
 */
const CART_TTL_MS = 0;

function money(cents: number, currency: string | null): SqsMoney {
 return { currency: currency || "USD", value: (cents / 100).toFixed(2) };
}

/** One VYA piece as a cart entry. One-of-one inventory: quantity is always 1, stock is always 1. */
export function toSqsEntry(line: CartLineItem, storePath = ""): SqsCartEntry {
 const price = money(line.priceCents, line.currency);
 return {
  id: line.id,
  itemId: line.id,
  quantity: 1,
  chosenVariant: {
   id: line.sourceVariantId || line.id,
   sku: line.sourceVariantId || null,
   price,
   unlimited: false,
   qtyInStock: 1,
   soldOut: line.available === false,
   attributes: {},
  },
  title: line.title,
  productName: line.title,
  fullUrl: `${storePath}/products/${line.handle || line.id}`,
  imageUrl: line.image,
  subTotal: line.priceCents,
  item: { price },
  unitPriceCents: line.priceCents,
  subtotalCents: line.priceCents,
  additionalFields: null,
 };
}

/**
 * The visitor's VYA cart, in Squarespace's shape.
 *
 * `now` is a parameter rather than a `Date.now()` call so this stays pure and testable; the routes
 * pass the real clock.
 */
export function buildSqsCart(lines: CartLineItem[], token: string, now = 0, storePath = ""): SqsShoppingCart {
 const entries = lines.map((l) => toSqsEntry(l, storePath));
 const subtotalCents = entries.reduce((n, e) => n + e.subtotalCents, 0);
 return {
  id: token,
  websiteId: "",
  // NOT `orderId: null` — read off the real bundle: its ShoppingCart model declares
  // `orderId: {validator: Lang.isString}` (and the same for selectedShippingOption/shippingLocation
  // below, validated as `isObject`) with no fallback value for any of them. YUI's Model.setAttrs()
  // validates the WHOLE incoming object before applying any of it — one attribute failing its
  // validator throws the ENTIRE update out, `entries` included. That's not a guess: an unpurchased
  // VYA cart with a correct, non-empty `entries` array sent this way still rendered the empty-cart
  // state, because these three fields were `null` and their validators reject that. Omitting a key
  // means its setter is never called at all, so nothing here can fail validation.
  created: now,
  expiresAt: now + CART_TTL_MS,
  isPurchased: false,
  entries,
  shippingOptions: [],
  applicableTaxRules: [],
  coupons: [],
  validCoupons: [],
  invalidCoupons: [],
  subtotalCents,
  taxCents: 0,
  shippingCostCents: 0,
  discountCents: 0,
  // VYA charges tax and shipping at checkout, so the cart's grand total IS its subtotal. Reporting
  // anything else here would show the shopper a number their checkout then contradicts.
  grandTotalCents: subtotalCents,
  totalQuantity: entries.length,
  hasDigital: false,
  purelyDigital: false,
  requiresShipping: true,
 };
}

/** The product id Squarespace's Add-to-cart posted. Its bundle sends `itemId`; the `sku` alongside
 *  it identifies the variant, which one-of-one vintage never has more than one of. */
export function itemIdFromAddBody(body: Record<string, unknown>): string {
 const raw = body.itemId ?? body.item_id ?? body.id;
 return typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
}
