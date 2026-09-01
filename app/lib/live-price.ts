/**
 * Put the piece's REAL price on a captured product page.
 *
 * A captured product page is frozen the day we crawled it, price markup included. The cart and the
 * checkout read the item record. So the moment a price changes — or the currency does — the page a
 * shopper reads and the amount they are charged part company. On blummier, whose prices were
 * repaired from dollars to pounds, 12 of 12 sampled pages advertised a dollar figure while the
 * record held a different number in pounds: "$3,169.00" on the page, £2,295.00 at the till.
 *
 * The rule for what counts as a price is deliberately narrow: a text node whose ENTIRE contents are
 * money, inside an element that calls itself a price. A first attempt at simply finding money-like
 * text inside anything class-named "price" matched "EU 39" out of a size label and "…Jeans 1990s"
 * out of a product title, because a theme's price wrapper often contains the whole title block.
 *
 * Formatting follows the theme, not us: a theme printing "$550.00 USD" keeps its decimals and its
 * code, one printing "$550" keeps neither.
 */
import * as cheerio from "cheerio";

type DomElement = Parameters<cheerio.CheerioAPI>[0] & { tagName?: string };

export type PricedItem = {
 priceCents: number | null;
 currency: string | null;
 /**
  * What the piece was before the seller marked it down, when a markdown is actually running. Taken
  * from the same feed read as the price, so unlike a compare-at frozen at capture time it is a
  * discount we can vouch for. Absent = not on sale, and any captured markdown is removed.
  */
 compareAtCents?: number | null;
};

/** Elements a theme uses to mean "this is the price". Kept to self-description, never position.
 *
 *  The TAG names matter as much as the classes. Shopify's newer themes mark a price up as
 *  <price-list><sale-price>$200.00</sale-price></price-list>, where the element actually holding the
 *  money carries `class="h4 text-on-sale"` — nothing that says "price" at all. Matching on class
 *  alone missed it entirely, and feathers served a dress at its crawl-day $200 while the cart
 *  charged $125. `price-list` matches by class but its direct children are elements, not text, so
 *  the money was never reached. */
const PRICE_HOST = "[class*='price'], [data-product-price], [data-price], [itemprop='price'], sale-price, price-list";
/** A sale/compare-at price from crawl day is a claim about a discount we cannot vouch for.
 *  `compare-at-price` is the same story: a tag, not a class. */
const NOT_OURS_TO_CLAIM = "[class*='price__sale'], [class*='compare-at'], [class*='price--compare'], [class*='price-item--compare'], [data-compare-price], compare-at-price, s, del";
/** The whole text node must be money: an optional symbol/code, digits, optional decimals, optional code. */
const WHOLE_MONEY = /^\s*(?:[^\d\s]{1,3}\s?)?\d[\d,  ]*(?:[.,]\d{2})?(?:\s?[A-Z]{3})?\s*$/;

/** Money strings are ours, but never interpolate text into markup unescaped. */
const escHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function format(cents: number, currency: string | null, decimals: number, showCode: boolean): string {
 const code = currency || "USD";
 let out: string;
 try {
  out = new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(cents / 100);
 } catch {
  out = `${(cents / 100).toFixed(decimals)}`;
 }
 return showCode ? `${out} ${code}` : out;
}

export function applyLivePrice(html: string, item: PricedItem): string {
 // No price on the record is not the same as a price of zero. Say nothing rather than something
 // false — the seller's own page is a better answer than "£0.00".
 if (item.priceCents == null) return html;
 const $ = cheerio.load(html);

 $(NOT_OURS_TO_CLAIM).filter((_: number, el: DomElement) => {
  // Only inside a price context: a theme's <s> in its copy is not a compare-at price.
  return $(el).is(PRICE_HOST) || $(el).parents(PRICE_HOST).length > 0;
 }).remove();

 let rewrote = false;
 for (const el of $(PRICE_HOST).toArray() as DomElement[]) {
  // Direct text children only. A wrapper's descendants include the title; the element that actually
  // holds the money is the one whose own text node IS the money.
  for (const node of ($(el).contents().toArray() as { type?: string; data?: string }[])) {
   if (node.type !== "text" || !node.data) continue;
   const text = node.data;
   if (!WHOLE_MONEY.test(text) || !/\d/.test(text)) continue;
   const decimals = /[.,]\d{2}(?:\s|[A-Z]|$)/.test(text) ? 2 : 0;
   const showCode = /\d[\d,.\s]*\s?[A-Z]{3}\s*$/.test(text);
   // Keep the theme's own surrounding whitespace; some themes lay out on it.
   const lead = /^\s*/.exec(text)![0], tail = /\s*$/.exec(text)![0];
   node.data = lead + format(item.priceCents, item.currency, decimals, showCode) + tail;
   rewrote = true;
  }
 }

 // A page can be captured with its price block EMPTY — the theme fills it in the browser, or the
 // crawl caught the piece mid-render. sourcedbyscottie had one showing no price at all while the
 // seller's own page showed $115.00, and nothing flagged it because nothing looked at the page.
 // Only when the page shows no price anywhere: never a second price beside a real one.
 if (!rewrote) {
  const empty = ($(PRICE_HOST).toArray() as DomElement[]).filter((el) => {
   const $el = $(el);
   if ($el.children().length > 0 || $el.text().trim() !== "") return false;
   const cls = ($el.attr("class") || "").toLowerCase();
   // A sale badge, a compare-at slot or a screen-reader-only node is not where a shopper reads it.
   return !/hidden|sr-only|visually-hidden|compare|--off|sale|was-price/.test(cls);
  });
  // The innermost such element: a theme's price wrapper often nests, and the deepest one is the one
  // it actually styles as the price.
  const depth = (el: DomElement) => $(el).parents().length;
  const target = empty.length ? empty.reduce((a, b) => (depth(b) > depth(a) ? b : a)) : null;
  if (target) $(target).text(format(item.priceCents, item.currency, 2, false));
 }

 // Machine-readable price, for search engines and link previews as much as for our own checks.
 const amount = (item.priceCents / 100).toFixed(2);
 const code = item.currency || "USD";
 $('meta[property="product:price:amount"], meta[property="og:price:amount"]').attr("content", amount);
 $('meta[property="product:price:currency"], meta[property="og:price:currency"]').attr("content", code);
 $('script[type="application/ld+json"]').each((_: number, el: DomElement) => {
  const raw = $(el).html() || "";
  if (!/"price(?:Currency)?"\s*:/.test(raw)) return;
  try {
   const node = JSON.parse(raw);
   const apply = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const rec = o as Record<string, unknown>;
    if ("price" in rec) rec.price = amount;
    if ("priceCurrency" in rec) rec.priceCurrency = code;
    Object.values(rec).forEach(apply);
   };
   apply(node);
   $(el).text(JSON.stringify(node));
  } catch { /* unparseable: leave it rather than delete the seller's structured data */ }
 });

 // A markdown the seller is actually running. Their own page shows both numbers; ours showed one,
 // so the seller lost the markdown. Rendered in the theme's own compare-at slot when it has one.
 const onSale = item.compareAtCents != null && item.compareAtCents > item.priceCents;
 if (onSale) {
  const was = format(item.compareAtCents as number, item.currency, 2, false);
  const $host = $(PRICE_HOST).filter((_: number, el: DomElement) => /\d/.test($(el).text())).first();
  const pill = `<s data-vya-compare-at="1" style="opacity:.55;margin-left:.5em;font:inherit">${escHtml(was)}</s>`;
  if ($host.length) $host.after(pill); else $("body").first().append(pill);
 }

 // The page states its own price, so a check never has to work out which element is the price —
 // the same reason a collection page states its size. See scripts/parity-check.mts.
 $('meta[name="vya:product-price"]').remove();
 const tag = `<meta name="vya:product-price" content="${item.priceCents} ${code}">`
  + (onSale ? `<meta name="vya:product-compare-at" content="${item.compareAtCents} ${code}">` : "");
 const $head = $("head").first();
 if ($head.length) $head.append(tag); else $("body").first().prepend(tag);

 return $.html();
}

/** Currency symbols a storefront actually prints, both directions. */
const SYMBOL: Record<string, string> = { USD: "$", GBP: "\u00a3", EUR: "\u20ac", CAD: "$", AUD: "$", JPY: "\u00a5" };

/**
 * Does the visible text of a served product page actually show this price?
 *
 * The stamp applyLivePrice writes is copied from the item record, so a check comparing the two
 * proves nothing at all. The question worth asking is whether the REWRITE landed: on a theme whose
 * price markup we do not recognise, the stamp would read \u00a32,295 while the shopper still reads
 * $3,169. So this looks for the live price in the text a shopper sees, currency and all.
 *
 * Deliberately anchored to a currency marker: bare digits are not a price ("Item 2295"), and the
 * same digits under the wrong symbol is precisely the blummier bug, not a pass.
 */
export function pageShowsPrice(visibleText: string, cents: number, currency: string | null): boolean {
 const code = (currency || "USD").toUpperCase();
 const sym = SYMBOL[code];
 const amount = cents / 100;
 const whole = Math.trunc(amount);
 // Every way a theme might print the number itself.
 const digits = new Set<string>([
  amount.toFixed(2),
  amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/, ","),
  whole.toLocaleString("en-US"),
  String(whole),
  amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
 ]);
 if (Number.isInteger(amount)) digits.add(whole.toLocaleString("en-US") + ".00");
 const text = visibleText.replace(/\s+/g, " ");
 for (const d of digits) {
  const esc = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // symbol immediately before, or the three-letter code on either side
  const patterns = [sym ? `\\${sym}\\s?${esc}` : null, `${code}\\s?${esc}`, `${esc}\\s?${code}`].filter(Boolean) as string[];
  for (const pat of patterns) {
   // Not followed by more digits: "\u00a32,295" must not match inside "\u00a32,2950".
   if (new RegExp(pat + "(?![\\d,.])").test(text)) return true;
  }
 }
 return false;
}
