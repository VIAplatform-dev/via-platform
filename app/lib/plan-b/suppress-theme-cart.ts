// Keeping the theme's own cart out of the way, now that VYA owns the buy path.
//
// On a store origin the theme's JavaScript is alive — that is the whole point of Plan B, and it is
// what makes the menus, carousels and galleries work. But its cart code is alive too, so pressing
// Add opened VYA's drawer AND the theme's, one over the other. A browser sweep caught it as
// "2 cart panels visible at once".
//
// SUPPRESS, DO NOT DELETE. Removing the elements a theme's cart code queries makes it throw, and a
// thrown handler can take unrelated page behaviour down with it. Hiding them leaves every
// getElementById resolving and every innerHTML landing — into something nobody sees. The theme's
// cart code runs to completion and changes nothing a shopper can perceive.
//
// This is the one place that still names theme selectors, and it is the cheap kind: a miss shows a
// second drawer, not a broken storefront. Reproducing a cart needs the markup to be RIGHT; hiding
// one only needs it to be FOUND.
//
// Pure: HTML in, HTML out.

/**
 * Cart PANELS a theme may open — never the icon that opens one.
 *
 * That distinction matters: VYA's cart script intercepts clicks on anything linking to /cart, so the
 * theme's own cart icon stays useful and simply opens ours instead. Hide the icon and a shopper has
 * nothing to press.
 *
 * Squarespace names everything differently from Shopify, which is why both carts opened at once on
 * lei-vintage and montrose-edit until its markup was added here.
 */
export const THEME_CART_SELECTORS = [
 // Shopify
 "#CartDrawer",
 "cart-drawer",
 "cart-drawer-component",
 ".cart-drawer",
 ".cart-notification",
 "#cart-notification",
 ".drawer--cart",
 "[class*='cart-drawer']",
 "[class*='cart-notification']",
 "[id*='CartDrawer']",
 // Squarespace
 ".sqs-custom-cart",
 ".Cart-inner",
 ".sqs-cart-dropdown",
 "#sqs-cart-container",
 "#sqs-cart-root",
 // Squarespace builds its "Added to cart!" confirmation at RUNTIME — it is not in the served HTML
 // at all, so it can only be found by clicking Add in a real browser and watching the DOM grow.
 ".commerce-mini-cart-root",
 "[class*='commerce-mini-cart']",
].map((s) => `${s}:not(#vya-cart-drawer):not(#vya-cart-overlay)`);

const THEME_CART = THEME_CART_SELECTORS.join(",\n");

const STYLE = `<style data-vya-suppress-theme-cart="1">
${THEME_CART}{display:none!important;visibility:hidden!important;pointer-events:none!important}
#vya-cart-drawer,#vya-cart-overlay{display:flex!important;visibility:visible!important;pointer-events:auto!important}
/* The floating pill is rescued only where it is the ONLY way into the bag. On a store whose own
   cart icon we have bound (the body marker), rescuing it put a second bag on screen — the exact
   thing binding the icon was meant to end. Both rules carry !important so the theme cannot win
   either argument. */
body:not([data-vya-has-cart-control]) #vya-cart-btn{display:flex!important;visibility:visible!important;pointer-events:auto!important}
body[data-vya-has-cart-control] #vya-cart-btn{display:none!important}
#vya-cart-overlay:not(.open){display:none!important}
</style>`;

/**
 * Hide the theme's cart surfaces so only VYA's is ever visible.
 *
 * Injected last, into <head> where possible, so the `!important` rules win over the theme's own
 * stylesheet regardless of source order.
 */
export function suppressThemeCart(html: string): string {
 if (!html || html.includes("data-vya-suppress-theme-cart")) return html;
 if (html.includes("</head>")) return html.replace("</head>", `${STYLE}</head>`);
 if (html.includes("</body>")) return html.replace("</body>", `${STYLE}</body>`);
 return html + STYLE;
}
