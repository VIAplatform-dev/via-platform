import { test } from "node:test";
import assert from "node:assert/strict";
import { storeEmailHtml, safeUrl } from "./email-template.ts";

const base = { storeName: "Situations Vintage", headline: "Just in: eight new pieces." };

test("the smallest email is still a whole email", () => {
 const h = storeEmailHtml(base);
 assert.match(h, /^<!doctype html>/);
 assert.match(h, /Situations Vintage/);
 assert.match(h, /Just in: eight new pieces\./);
 // Nothing optional should leave an empty box behind.
 assert.doesNotMatch(h, /undefined|null|\[object/);
});

test("every part is optional and simply isn't there when it's missing", () => {
 const h = storeEmailHtml(base);
 assert.doesNotMatch(h, /Unsubscribe/);
 assert.doesNotMatch(h, /Shop now/, "no button url means no button");
});

test("a piece renders as photo, name and its own button", () => {
 const h = storeEmailHtml({
  ...base,
  products: [{ title: "Silk slip dress", image: "https://img.example/1.jpg", priceLabel: "$200", url: "https://shop.example/p/1" }],
 });
 assert.match(h, /img\.example\/1\.jpg/);
 assert.match(h, /Silk slip dress/);
 assert.match(h, /\$200/);
 assert.match(h, /SHOP NOW|Shop now/i);
});

test("a piece with no photo still lays out, rather than collapsing the row", () => {
 const h = storeEmailHtml({ ...base, products: [{ title: "Wool coat", image: null, url: "https://shop.example/p/2" }] });
 assert.match(h, /Wool coat/);
 assert.match(h, /height:220px/, "a placeholder holds the column open");
});

test("a store's brand comes through, and defaults hold when it doesn't", () => {
 // A bare family name, which is what the picker stores. A raw CSS stack ("Didot,serif") is
 // refused now — it would sit unquoted in a style attribute.
 const h = storeEmailHtml({ ...base, brand: { accent: "#5D0F17", headingFont: "Prata" }, button: { label: "Shop the drop", url: "https://shop.example" } });
 assert.match(h, /#5D0F17/);
 assert.match(h, /'Prata',Georgia/);
 assert.match(h, /Shop the drop/);
 assert.match(storeEmailHtml(base), /Georgia/, "no heading font set → the default serif");
});

test("only http(s) links are ever written into the email", () => {
 // An email client following a javascript: or data: href is a real hole, and stores paste URLs in.
 assert.equal(safeUrl("javascript:alert(1)"), null);
 assert.equal(safeUrl("data:text/html,<script>"), null);
 assert.equal(safeUrl("https://ok.example/x"), "https://ok.example/x");
 const h = storeEmailHtml({ ...base, button: { label: "Go", url: "javascript:alert(1)" } });
 assert.doesNotMatch(h, /javascript:/);
});

test("markdown a store typed doesn't render literally", () => {
 // Campaign bodies are markdown, so stores write "# Just landed" — and the headline is already set
 // in the heading face, so the hash has nothing to do but show up.
 const h = storeEmailHtml({ storeName: "S", headline: "# Just landed", subhead: "**Really** just landed" });
 assert.doesNotMatch(h, /# Just landed/);
 assert.match(h, /Just landed/);
 assert.doesNotMatch(h, /\*\*Really\*\*/);
});

test("names and titles are escaped, not injected", () => {
 const h = storeEmailHtml({ storeName: '<script>x</script>', headline: 'A "quoted" thing & more' });
 assert.doesNotMatch(h, /<script>x<\/script>/);
 assert.match(h, /&amp; more/);
});

test("the design controls actually change the email", () => {
 // Each of these is a switch on the Email design page. A switch that moves nothing is worse than
 // no switch, so every one of them has to show up in the HTML.
 const base = { storeName: "S", headline: "Hello", button: { label: "Go", url: "https://x.example" } };
 const pill = storeEmailHtml({ ...base, brand: { buttonStyle: "pill" } });
 assert.match(pill, /border-radius:999px/);
 assert.match(storeEmailHtml({ ...base, brand: { buttonStyle: "square" } }), /border-radius:0/);

 const left = storeEmailHtml({ ...base, brand: { headerAlign: "left" } });
 assert.match(left, /text-align:left/);
 assert.doesNotMatch(storeEmailHtml({ ...base, brand: { headerAlign: "center" } }), /text-align:left/);

 assert.match(storeEmailHtml({ ...base, brand: { accent: "#ff0000" } }), /height:4px;background:#ff0000/, "the top bar is on by default");
 assert.doesNotMatch(storeEmailHtml({ ...base, brand: { showAccentBar: false } }), /height:4px/);
});

test("a chosen font is quoted, with a fallback of its own kind", () => {
 // "Bodoni Moda" unquoted is not a valid font-family value, and the email silently falls back.
 const h = storeEmailHtml({ storeName: "S", headline: "Hi", brand: { headingFont: "Bodoni Moda", bodyFont: "Karla" } });
 assert.match(h, /'Bodoni Moda',Georgia/);
 assert.match(h, /'Karla','Helvetica Neue'/);
});

test("a chosen font is actually FETCHED, not just named", () => {
 // Naming a family the email never loads is why the picker appeared to do nothing: the HTML said
 // Bodoni Moda and every client rendered Georgia.
 const h = storeEmailHtml({ storeName: "S", headline: "Hi", brand: { headingFont: "Bodoni Moda", bodyFont: "Karla" } });
 assert.match(h, /fonts\.googleapis\.com\/css2\?family=Bodoni\+Moda/);
 assert.match(h, /family=Karla/);
 // No fonts chosen → no request at all.
 assert.doesNotMatch(storeEmailHtml({ storeName: "S", headline: "Hi" }), /fonts\.googleapis/);
});

test("a font name from outside the picker can't inject markup", () => {
 const h = storeEmailHtml({ storeName: "S", headline: "Hi", brand: { headingFont: '"><script>x</script>' } });
 assert.doesNotMatch(h, /<script>/);
 assert.doesNotMatch(h, /fonts\.googleapis/);
});

test("each design is genuinely a different email, not the same one restyled", () => {
 const base = {
  storeName: "S", headline: "Four new pieces just landed", subhead: "One of one, as always.",
  button: { label: "Shop", url: "https://x.example" },
  products: [
   { title: "Silk dress", image: "https://img.example/1.jpg", priceLabel: "$200", url: "https://x.example/1" },
   { title: "Wool coat", image: "https://img.example/2.jpg", priceLabel: "$400", url: "https://x.example/2" },
  ],
  brand: { accent: "#5D0F17" },
 };
 const classic = storeEmailHtml({ ...base, design: "classic" });
 const statement = storeEmailHtml({ ...base, design: "statement" });
 const photo = storeEmailHtml({ ...base, design: "photo" });
 const grid = storeEmailHtml({ ...base, design: "grid" });
 const editorial = storeEmailHtml({ ...base, design: "editorial" });

 // Statement reverses the headline out of the accent, so the accent is a BACKGROUND here.
 assert.match(statement, /background:#5D0F17;padding:44px/);
 assert.doesNotMatch(classic, /background:#5D0F17;padding:44px/);
 // Photo leads with the first piece at full width.
 assert.match(photo, /width="600"[^>]*img\.example\/1\.jpg|img\.example\/1\.jpg[^>]*width:100%/);
 // Grid puts pieces two to a row.
 assert.match(grid, /width="50%"/);
 // Editorial frames the words in rules.
 assert.match(editorial, /border-top:1px solid #1a1a1a22/);
 // All five are actually different documents.
 assert.equal(new Set([classic, statement, photo, grid, editorial]).size, 5);
});

test("every design still carries the shop's logo and its unsubscribe link", () => {
 // A design choice must never cost a store its identity or a recipient their way out.
 for (const design of ["classic", "statement", "photo", "editorial", "grid"] as const) {
  const h = storeEmailHtml({
   storeName: "Situations Vintage", headline: "Hello", design,
   unsubscribeUrl: "https://x.example/unsub",
   products: [{ title: "P", image: "https://img.example/1.jpg", url: "https://x.example/1" }],
  });
  assert.match(h, /Situations Vintage/, `${design} lost the shop name`);
  assert.match(h, /Unsubscribe/, `${design} lost the unsubscribe link`);
 }
});

test("preheader text is hidden in the email but present for the inbox", () => {
 // The grey line after the subject. Unset, clients grab the first words of the email — usually the
 // shop's own name, wasting the second most valuable line in an inbox.
 const h = storeEmailHtml({ storeName: "S", headline: "Hi", preheader: "Four new pieces, one of each." });
 assert.match(h, /Four new pieces, one of each\./);
 assert.match(h, /display:none;max-height:0/);
 assert.doesNotMatch(storeEmailHtml({ storeName: "S", headline: "Hi" }), /display:none;max-height:0/);
});

test("body copy is 16px, which is the whole point of the guidance", () => {
 // 13px is a web-UI size. On a phone it's the most common reason an email goes unread, and every
 // guide names 16 as the floor.
 const h = storeEmailHtml({ storeName: "S", headline: "Hi", subhead: "A line of body copy." });
 assert.match(h, /font-size:16px/);
});

test("a button is a real tap target, not a link that looks like one", () => {
 // 44px minimum. 15px text with 15px padding top and bottom clears it.
 const h = storeEmailHtml({ storeName: "S", headline: "Hi", button: { label: "Shop", url: "https://x.example" } });
 assert.match(h, /font-size:15px[^"]*padding:15px 34px/);
});

test("a brand ground picks readable type instead of hoping", () => {
 // A deep ground needs light type and a pale one needs dark. Getting this wrong is an unreadable
 // email, and it's decidable from the colour rather than a guess.
 const onDark = storeEmailHtml({ storeName: "S", headline: "Hi", ground: "brand", brand: { bg: "#3B2A1A" } });
 assert.match(onDark, /background:#3B2A1A/);
 assert.match(onDark, /color:#f7f5f2/, "light type on a dark ground");

 const onPale = storeEmailHtml({ storeName: "S", headline: "Hi", ground: "brand", brand: { bg: "#F6D8DC", text: "#5D0F17" } });
 assert.match(onPale, /background:#F6D8DC/);
 assert.match(onPale, /color:#5D0F17/, "the store's own dark type on a pale ground");
 assert.doesNotMatch(onPale, /color:#f7f5f2/);
});

test("pieces group into bands with their own headings", () => {
 const p = (n: string) => ({ title: n, image: "https://img.example/x.jpg", url: "https://x.example" });
 const h = storeEmailHtml({
  storeName: "S", headline: "Hi",
  sections: [
   { heading: "Under $500", products: [p("A"), p("B")] },
   { heading: "Under $1,500", products: [p("C"), p("D"), p("E")], columns: 3 },
  ],
 });
 assert.match(h, /Under \$500/);
 assert.match(h, /Under \$1,500/);
 assert.match(h, /width="33\.33%"/, "a three-up band");
 for (const n of ["A", "B", "C", "D", "E"]) assert.match(h, new RegExp(`>${n}<`), `${n} is missing`);
});

test("prices can be left off, which is how one-of-one resale reads", () => {
 const p = { title: "Silk dress", image: "https://img.example/x.jpg", priceLabel: "$200", url: "https://x.example" };
 assert.match(storeEmailHtml({ storeName: "S", headline: "Hi", sections: [{ products: [p] }] }), /\$200/);
 assert.doesNotMatch(storeEmailHtml({ storeName: "S", headline: "Hi", showPrices: false, sections: [{ products: [p] }] }), /\$200/);
});

test("social links are words, and the nav row sits under the logo", () => {
 // Icon fonts don't load in email; an image-only row is broken boxes the moment images are blocked.
 const h = storeEmailHtml({
  storeName: "S", headline: "Hi",
  navLinks: [{ label: "Shop", url: "https://x.example/shop" }],
  social: [{ label: "Instagram", url: "https://instagram.com/x" }],
 });
 assert.match(h, />Shop</);
 assert.match(h, />Instagram</);
});

test("the email declares that it handles both colour schemes", () => {
 // Without this a client inverts the colours itself, and a designed ground comes out muddy.
 assert.match(storeEmailHtml({ storeName: "S", headline: "Hi" }), /name="color-scheme" content="light dark"/);
});
