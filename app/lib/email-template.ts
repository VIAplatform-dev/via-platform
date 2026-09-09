// ───────────────────────────────────────────────────────────────────────────
// One shape for every email a store sends automatically.
//
// The reference is the way good fashion retail email actually reads: the shop's name at the top,
// one plain line of context, ONE big serif sentence saying the thing, a small line under it, one
// button — and then, if there are pieces to show, each one as a photo beside its name with its own
// button. Nothing else. No grid of tiles, no stacked banners, no second call to action competing
// with the first.
//
// Why it's built once here rather than per email: new arrivals, an abandoned basket and a welcome
// note are the same email with different words. Writing each one separately is how a store ends up
// with three different-looking emails and no way to restyle them together.
//
// A store can change what it should be able to change — logo, colours, fonts, the button word, the
// footer — and everything else stays consistent, because the consistency is the point.
//
// Email HTML rules, which is why this looks the way it does: tables not flex, inline styles not
// classes, no external CSS, images with explicit widths, and a plain-text-ish reading order so it
// still makes sense when images are blocked.
// ───────────────────────────────────────────────────────────────────────────

export type EmailProduct = {
 title: string;
 image: string | null;
 priceLabel?: string | null;
 url: string;
};

export type EmailLink = { label: string; url: string };

/**
 * The shape of the email, not its colours.
 *
 * One layout for everything made every template look like the same email with different words. Each
 * of these is a genuinely different arrangement — and all of them take the store's own logo, colours
 * and fonts, so two shops picking the same design still send two different-looking emails. That's the
 * part a stock template gallery can't do.
 */
export type EmailDesign =
 | "classic"    // logo, headline, button, pieces beneath — the everyday one
 | "statement"  // headline reversed out of the accent colour, full width. For an announcement.
 | "photo"      // the first piece full-bleed at the top, words underneath
 | "editorial"  // centred serif between hairline rules, generous space
 | "grid";      // pieces two-up, minimal words. For a drop.

export type StoreEmailOptions = {
 storeName: string;
 /** A logo image URL. Falls back to the store's name set in the heading face. */
 logo?: string | null;
 /** The small line above the headline. */
 eyebrow?: string | null;
 /**
  * The grey line an inbox shows after the subject.
  *
  * Left unset, mail clients grab the first words of the email — usually the shop's own name, which
  * wastes the second most valuable line in the inbox. Hidden in the body itself, which is the only
  * way to set it: there's no header for it.
  */
 preheader?: string | null;
 /** The one big sentence. This is the email. */
 headline: string;
 /** The small line under it. Optional — most emails don't need one. */
 subhead?: string | null;
 /** A discount code, shown plainly. */
 code?: string | null;
 button?: { label: string; url: string } | null;
 /** A serif heading above the pieces, e.g. "Just in". */
 productsHeading?: string | null;
 products?: EmailProduct[];
 /** The row of underlined links near the bottom. */
 linksHeading?: string | null;
 links?: EmailLink[];
 footerNote?: string | null;
 unsubscribeUrl?: string | null;
 design?: EmailDesign;
 /**
  * What the email sits on.
  *
  * "brand" makes the WHOLE email the store's colour — the thing every good resale email in the
  * references does, and the thing a white email with a coloured button cannot fake. Text flips to a
  * readable tone automatically, so a pale pink ground gets dark type and a deep brown gets light.
  */
 ground?: "white" | "brand";
 /** Pieces in bands, each under its own heading — "UNDER $500", "Pick Your Prints". */
 sections?: { heading?: string | null; products: EmailProduct[]; columns?: 2 | 3 }[];
 /** Show prices under the pieces. Off suits one-of-one resale, where the name is the draw. */
 showPrices?: boolean;
 /** The small nav row under the logo — Shop, New in, About. */
 navLinks?: EmailLink[];
 /** Instagram and the rest, as words. Icon fonts don't render in email. */
 social?: EmailLink[];
 brand?: {
  accent?: string; text?: string; bg?: string;
  headingFont?: string; bodyFont?: string;
  buttonLabel?: string;
  // The same controls the Email design page offers. They have to work here too: a store that
  // changes "button shape" and sees nothing move has been given a dead switch.
  buttonStyle?: "rounded" | "pill" | "square";
  headerAlign?: "center" | "left";
  showAccentBar?: boolean;
 } | null;
};

const esc = (s: string) =>
 String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Strip the markdown a store writes into an automation body.
 *
 * Campaign bodies are markdown, so a store types "# Just landed" and expects a heading. This
 * template sets the headline in the heading face itself, so the "#" has nothing left to do — and
 * left in, it renders literally: the preview read "# Just landed", hash and all.
 */
export function plainText(s: string): string {
 return String(s ?? "")
  .replace(/^\s{0,3}#{1,6}\s+/gm, "")   // headings
  .replace(/^\s{0,3}>\s?/gm, "")        // quotes
  .replace(/^\s{0,3}[-*+]\s+/gm, "")    // bullets
  .replace(/\*\*([^*]+)\*\*/g, "$1")   // bold
  .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2") // italics
  .replace(/`([^`]+)`/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their words
  .trim();
}

/** Only http(s). A javascript: or data: href in an email is a hole, and some clients will follow it. */
export function safeUrl(url: string | null | undefined): string | null {
 const u = String(url ?? "").trim();
 return /^https?:\/\//i.test(u) ? u.replace(/"/g, "%22") : null;
}

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * The whole email.
 *
 * Everything except `storeName` and `headline` is optional, and each part simply doesn't render
 * when it's missing — so a one-line welcome and a six-piece new-arrivals send are the same call.
 */
export function storeEmailHtml(o: StoreEmailOptions): string {
 const b = o.brand ?? {};
 const accent = b.accent || "#111111";
 const rawText = b.text || "#1a1a1a";
 const rawBg = b.bg || "#ffffff";

 /** Luminance, so type on a ground is chosen rather than hoped for. */
 const lum = (hex: string) => {
  const h = String(hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(n)) return 1;
  const [r, g, bl] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
 };

 // On a brand ground the whole email is the store's colour, so every other colour follows from it.
 const onBrand = (o.ground === "brand");
 const groundColour = onBrand ? (b.bg && lum(b.bg) < 0.98 ? b.bg : accent) : rawBg;
 const dark = lum(groundColour) < 0.5;
 const bg = groundColour;
 // Never pure white or pure black on a coloured ground: both look like a rendering fault beside a
 // hue, and pure black is specifically what dark-mode guidance warns against.
 const text = onBrand ? (dark ? "#f7f5f2" : rawText) : rawText;
 const buttonBg = onBrand ? (dark ? "#ffffff" : accent) : accent;
 const buttonFg = onBrand && dark ? accent : "#ffffff";
 const rule = dark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.14)";
 // A font name goes into a style ATTRIBUTE and into a URL, so it's validated once here rather than
 // trusted in two places. Anything that isn't a plain family name is dropped: a quote in this value
 // closes the attribute, and everything after it is markup the store didn't intend.
 const family = (f: string | undefined) => (f && /^[A-Za-z0-9][A-Za-z0-9 \-]{0,39}$/.test(f) ? f : null);
 const headFamily = family(b.headingFont);
 const bodyFamily = family(b.bodyFont);
 const heading = headFamily ? `'${headFamily}',${SERIF}` : SERIF;
 const body = bodyFamily ? `'${bodyFamily}',${SANS}` : SANS;
 const radius = b.buttonStyle === "pill" ? "999px" : b.buttonStyle === "square" ? "0" : "6px";
 const align = b.headerAlign === "left" ? "left" : "center";
 const name = esc((o.storeName || "").replace(/[<>"\n\r]/g, "").trim() || "Our store");

 const logoUrl = safeUrl(o.logo);
 const header = logoUrl
  ? `<img src="${logoUrl}" alt="${name}" width="150" style="display:block;margin:${b.headerAlign === "left" ? "0" : "0 auto"};max-width:150px;height:auto;border:0;" border="0" />`
  : `<div style="font-family:${heading};font-size:22px;letter-spacing:0.02em;color:${text};">${name}</div>`;

 const eyebrow = o.eyebrow
  ? `<div style="font-family:${body};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;line-height:1.5;color:${text};opacity:0.7;padding:0 0 14px;">${esc(plainText(o.eyebrow))}</div>`
  : "";

 // The headline is the email. Big, serif, and short enough to read in one go.
 // 28px is comfortably past the 20–24px floor the guidance gives for headings, and the references
 // all go bigger still. Tight leading, because a two-line headline at 1.3 drifts apart.
 const headline = `<div style="font-family:${heading};font-size:29px;line-height:1.22;color:${text};padding:0 0 14px;">${esc(plainText(o.headline))}</div>`;

 const subhead = o.subhead
  // 16px. 13px is a web-UI size; on a phone it's the single most common reason an email goes
  // unread, and every guide names 16 as the floor for body copy.
  ? `<div style="font-family:${body};font-size:16px;line-height:1.65;color:${text};opacity:0.85;padding:0 0 20px;">${esc(plainText(o.subhead)).replace(/\n/g, "<br />")}</div>`
  : "";

 const code = o.code
  ? `<div style="font-family:${body};font-size:14px;letter-spacing:0.06em;color:${text};padding:6px 0 14px;">${esc(o.code)}</div>`
  : "";

 const btnUrl = safeUrl(o.button?.url);
 const button = btnUrl
  ? `<div style="padding:8px 0 0;">
      <a href="${btnUrl}" style="display:inline-block;background:${buttonBg};color:${buttonFg};text-decoration:none;font-family:${body};font-size:15px;font-weight:600;letter-spacing:0.02em;line-height:1.2;padding:15px 34px;border-radius:${radius};">${esc(o.button?.label || b.buttonLabel || "Shop now")} &rarr;</a>
     </div>`
  : "";

 // One piece per row: photo on the left, name and its own button on the right. A 2-up grid of
 // tiles looks like a catalogue; this reads like someone showing you a thing.
 const productRow = (p: EmailProduct) => {
  const url = safeUrl(p.url) || "#";
  const img = safeUrl(p.image);
  const photo = img
   ? `<a href="${url}"><img src="${img}" alt="${esc(p.title)}" width="200" style="display:block;width:100%;max-width:200px;height:auto;border:0;" border="0" /></a>`
   // Quiet grey, no words. A placeholder that says something competes with the piece next to it.
   : `<div style="width:100%;height:220px;background:#f2f0ec;"></div>`;
  return `<tr>
   <td width="200" valign="top" style="width:200px;padding:0 24px 26px 0;">${photo}</td>
   <td valign="middle" style="padding:0 0 26px;">
    <div style="font-family:${heading};font-size:17px;line-height:1.35;color:${text};padding:0 0 10px;">${esc(p.title)}</div>
    ${p.priceLabel ? `<div style="font-family:${body};font-size:13px;color:${text};padding:0 0 12px;">${esc(p.priceLabel)}</div>` : ""}
    <a href="${url}" style="display:inline-block;border:1px solid ${text};color:${text};text-decoration:none;font-family:${body};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2;padding:13px 22px;border-radius:${radius};">Shop now</a>
   </td>
  </tr>`;
 };

 const products = (o.products || []).filter((p) => p && p.title);
 const productsBlock = products.length
  ? `${o.productsHeading ? `<div style="font-family:${heading};font-size:20px;line-height:1.3;color:${text};text-align:center;padding:0 0 22px;border-top:1px solid #e9e7e3;padding-top:26px;">${esc(o.productsHeading)}</div>` : ""}
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${products.map(productRow).join("")}</table>`
  : "";

 const nav = (o.navLinks || []).map((l) => ({ label: l.label, url: safeUrl(l.url) })).filter((l) => l.url);
 const navBlock = nav.length
  ? `<div style="padding:14px 0 0;">${nav.map((l) => `<a href="${l.url}" style="font-family:${body};font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:${text};text-decoration:none;padding:0 10px;">${esc(l.label)}</a>`).join("")}</div>`
  : "";

 // Words, not icons. Icon fonts don't load in email and an image-only social row is a stack of
 // broken boxes the moment images are blocked.
 const social = (o.social || []).map((l) => ({ label: l.label, url: safeUrl(l.url) })).filter((l) => l.url);
 const socialBlock = social.length
  ? `<div style="padding:0 0 12px;">${social.map((l) => `<a href="${l.url}" style="font-family:${body};font-size:13px;color:${text};opacity:0.75;text-decoration:none;padding:0 8px;">${esc(l.label)}</a>`).join("")}</div>`
  : "";

 const links = (o.links || []).map((l) => ({ label: l.label, url: safeUrl(l.url) })).filter((l) => l.url);
 const linksBlock = links.length
  ? `<div style="border-top:1px solid #e5e3df;margin:8px 0 0;padding:22px 0 0;text-align:center;">
      ${o.linksHeading ? `<div style="font-family:${body};font-size:12px;color:#8a8681;padding:0 0 10px;">${esc(o.linksHeading)}</div>` : ""}
      ${links.map((l) => `<a href="${l.url}" style="font-family:${heading};font-size:14px;color:${text};text-decoration:underline;padding:0 12px;">${esc(l.label)}</a>`).join("")}
     </div>`
  : "";

 const unsub = safeUrl(o.unsubscribeUrl);
 const footer = `<div style="border-top:1px solid ${rule};margin-top:8px;padding:24px 0 0;text-align:center;font-family:${body};font-size:13px;line-height:1.7;color:${text};opacity:0.7;">
   ${socialBlock}
   ${o.footerNote ? `${esc(o.footerNote)}<br />` : ""}
   &copy; ${new Date().getFullYear()} ${name}
   ${unsub ? `<br /><a href="${unsub}" style="color:${text};text-decoration:underline;">Unsubscribe</a>` : ""}
  </div>`;

 // Load the faces the store picked. Without this the email NAMES a font it never fetches, so every
 // choice fell back to Georgia and the picker looked broken — which it effectively was.
 // Gmail and Apple Mail honour this link; Outlook ignores it and gets the fallback, which is why
 // each stack still ends in a real serif or sans rather than a bare family name.
 const families = [headFamily, bodyFamily]
  .filter((f): f is string => Boolean(f))
  .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`);
 const fontLink = families.length
  ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.join("&")}&display=swap" />`
  : "";

 const design = o.design || "classic";

 // ── the designs ─────────────────────────────────────────────────────────────────────────────
 // Each returns the middle of the email. The header, pieces and footer are shared, so a design
 // choice never costs a store its logo or its unsubscribe link.
 const lead = products[0];
 const leadImg = lead ? safeUrl(lead.image) : null;

 const statementBlock = `
  <tr><td style="background:${accent};padding:44px 32px;text-align:center;">
   ${o.eyebrow ? `<div style="font-family:${body};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#ffffff;opacity:0.75;padding:0 0 14px;">${esc(plainText(o.eyebrow))}</div>` : ""}
   <div style="font-family:${heading};font-size:34px;line-height:1.15;color:#ffffff;">${esc(plainText(o.headline))}</div>
   ${o.subhead ? `<div style="font-family:${body};font-size:13px;line-height:1.6;color:#ffffff;opacity:0.85;padding:14px 0 0;">${esc(plainText(o.subhead))}</div>` : ""}
   ${btnUrl ? `<div style="padding:22px 0 0;"><a href="${btnUrl}" style="display:inline-block;background:#ffffff;color:${accent};text-decoration:none;font-family:${body};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;padding:13px 30px;border-radius:${radius};">${esc(o.button?.label || b.buttonLabel || "Shop now")}</a></div>` : ""}
  </td></tr>
  <tr><td style="height:32px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

 const photoBlock = `
  ${leadImg ? `<tr><td style="padding:0 0 28px;"><a href="${safeUrl(lead!.url) || "#"}"><img src="${leadImg}" alt="${esc(lead!.title)}" width="600" style="display:block;width:100%;height:auto;border:0;" border="0" /></a></td></tr>` : ""}
  <tr><td align="${align}" style="padding:0 0 34px;text-align:${align};">${eyebrow}${headline}${subhead}${code}${button}</td></tr>`;

 const editorialBlock = `
  <tr><td style="border-top:1px solid ${text}22;border-bottom:1px solid ${text}22;padding:38px 24px;text-align:center;">
   ${o.eyebrow ? `<div style="font-family:${body};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${text};opacity:0.55;padding:0 0 16px;">${esc(plainText(o.eyebrow))}</div>` : ""}
   <div style="font-family:${heading};font-size:28px;line-height:1.35;color:${text};">${esc(plainText(o.headline))}</div>
   ${o.subhead ? `<div style="font-family:${body};font-size:13px;line-height:1.7;color:${text};opacity:0.7;padding:16px 40px 0;">${esc(plainText(o.subhead))}</div>` : ""}
   ${button}
  </td></tr>
  <tr><td style="height:30px;font-size:0;line-height:0;">&nbsp;</td></tr>`;

 // Two up, square crops, price under each. For a drop where the pieces are the message.
 const gridCell = (p: EmailProduct) => {
  const url = safeUrl(p.url) || "#";
  const img = safeUrl(p.image);
  return `<td width="50%" valign="top" style="padding:0 8px 20px;">
   ${img ? `<a href="${url}"><img src="${img}" alt="${esc(p.title)}" width="270" style="display:block;width:100%;height:auto;border:0;" border="0" /></a>`
         : `<div style="width:100%;height:200px;background:#f2f0ec;"></div>`}
   <div style="font-family:${body};font-size:12.5px;line-height:1.4;color:${text};padding:9px 0 0;">${esc(p.title)}</div>
   ${p.priceLabel ? `<div style="font-family:${body};font-size:12.5px;color:${text};opacity:0.6;padding:2px 0 0;">${esc(p.priceLabel)}</div>` : ""}
  </td>`;
 };
 /**
  * Pieces in bands.
  *
  * Every email in the references does this: a heading on the ground colour, then a tight grid, then
  * another. It's what lets one email carry eight pieces without reading as a catalogue dump — the
  * bands give a shopper somewhere to stop.
  */
 const band = (sec: { heading?: string | null; products: EmailProduct[]; columns?: 2 | 3 }) => {
  const cols = sec.columns === 3 ? 3 : 2;
  const w = cols === 3 ? "33.33%" : "50%";
  const cell = (p: EmailProduct) => {
   const url = safeUrl(p.url) || "#";
   const img = safeUrl(p.image);
   return `<td width="${w}" valign="top" style="padding:0 6px 22px;">
    ${img ? `<a href="${url}"><img src="${img}" alt="${esc(p.title)}" width="270" style="display:block;width:100%;height:auto;border:0;" border="0" /></a>`
          : `<div style="width:100%;height:190px;background:${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"};"></div>`}
    <div style="font-family:${body};font-size:14px;line-height:1.45;color:${text};padding:10px 2px 0;text-align:center;">${esc(p.title)}</div>
    ${o.showPrices !== false && p.priceLabel ? `<div style="font-family:${body};font-size:14px;color:${text};opacity:0.65;padding:3px 2px 0;text-align:center;">${esc(p.priceLabel)}</div>` : ""}
   </td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < sec.products.length; i += cols) {
   const row = sec.products.slice(i, i + cols).map(cell).join("");
   const missing = cols - sec.products.slice(i, i + cols).length;
   rows.push(`<tr>${row}${`<td width="${w}"></td>`.repeat(missing)}</tr>`);
  }
  // The heading sits ON the ground as a band, the way "UNDER $500" does — a rule above and below,
  // centred, in the heading face. It reads as a divider rather than as another line of copy.
  const head = sec.heading
   ? `<tr><td style="padding:6px 8px 20px;">
       <div style="border-top:1px solid ${rule};border-bottom:1px solid ${rule};padding:12px 0;text-align:center;font-family:${heading};font-size:19px;letter-spacing:0.02em;color:${text};">${esc(plainText(sec.heading))}</div>
      </td></tr>`
   : "";
  return `${head}<tr><td style="padding:0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table></td></tr>`;
 };

 const sections = (o.sections || []).filter((x) => x && x.products?.length);
 const sectionsBlock = sections.map(band).join("");

 const gridRows: string[] = [];
 for (let i = 0; i < products.length; i += 2) {
  gridRows.push(`<tr>${gridCell(products[i])}${products[i + 1] ? gridCell(products[i + 1]) : '<td width="50%"></td>'}</tr>`);
 }
 const gridBlock = `
  <tr><td align="center" style="padding:0 0 26px;text-align:center;">${eyebrow}${headline}${subhead}${button}</td></tr>
  <tr><td style="padding:0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${gridRows.join("")}</table></td></tr>`;

 const classicBlock = `
  <tr><td align="${align}" style="padding:0 0 34px;text-align:${align};">${eyebrow}${headline}${subhead}${code}${button}</td></tr>
  ${productsBlock ? `<tr><td>${productsBlock}</td></tr>` : ""}`;

 const middle =
  design === "statement" ? statementBlock + (productsBlock ? `<tr><td>${productsBlock}</td></tr>` : "")
  : design === "photo" ? photoBlock + (products.length > 1 ? `<tr><td>${productsBlock}</td></tr>` : "")
  : design === "editorial" ? editorialBlock + (productsBlock ? `<tr><td>${productsBlock}</td></tr>` : "")
  : design === "grid" ? gridBlock
  : classicBlock;

 // Bands come after the design's own block, so a store can lead with a statement and still show
 // three groups of pieces underneath.
 const afterMiddle = sectionsBlock;

 return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<!-- Tells a client we've handled both schemes, so it stops inverting our colours for us. -->
<meta name="color-scheme" content="light dark" /><meta name="supported-color-schemes" content="light dark" />
${fontLink}
<style>
 /* On a phone the 600px table is the screen, so the gutter has to come from here. */
 @media only screen and (max-width:620px) {
  .vya-pad { padding-left:18px !important; padding-right:18px !important; }
 }
</style></head>
<body style="margin:0;padding:0;background:${bg};font-family:${body};">
 ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(plainText(o.preheader))}</div>
 <!-- Spacer: without it Gmail runs the body's first words on after the preheader. -->
 <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>` : ""}
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};">
  <tr><td align="center" class="vya-pad" style="padding:40px 16px 40px;">
   <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    ${b.showAccentBar === false || design === "statement" ? "" : `<tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>`}
    <tr><td align="${align}" style="padding:0 0 28px;text-align:${align};">${header}${navBlock}</td></tr>
    ${middle}
    ${afterMiddle}
    ${linksBlock ? `<tr><td>${linksBlock}</td></tr>` : ""}
    <tr><td>${footer}</td></tr>
   </table>
  </td></tr>
 </table>
</body></html>`;
}
