/**
 * June 2026 Insider Newsletter. Drop-in HTML for the insider shell.
 * Pass `JUNE_2026_NEWSLETTER_HTML` as `contentHtml` to /api/admin/send-insider-newsletter.
 *
 * Uses brand fonts: Playfair Display for headlines + Cormorant Garamond for body,
 * with Georgia as fallback for clients that don't load web fonts.
 */

const CREAM = "#FFFDF8";
const TEXT = "#5D0F17";
const TEXT_MUTED = "rgba(93,15,23,0.7)";
const RULE = "rgba(93,15,23,0.18)";
const BTN_BG = "#5D0F17";
const BTN_TEXT = "#FFFDF8";
const HEAD = "'Playfair Display', Georgia, 'Times New Roman', serif";
const BODY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

function h2(text: string): string {
 return `<h2 style="font-family:${HEAD};font-size:30px;color:${TEXT};margin:0 0 14px;font-weight:500;line-height:1.15;letter-spacing:-0.01em;">${text}</h2>`;
}

function h3(text: string): string {
 return `<h3 style="font-family:${HEAD};font-size:21px;color:${TEXT};margin:28px 0 10px;font-weight:500;line-height:1.3;">${text}</h3>`;
}

function eyebrow(text: string): string {
 return `<p style="font-family:${BODY};font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:${TEXT};margin:0 0 10px;font-weight:600;">${text}</p>`;
}

function para(text: string): string {
 return `<p style="font-family:${BODY};font-size:17px;color:${TEXT};line-height:1.65;margin:0 0 16px;font-weight:400;">${text}</p>`;
}

function quote(text: string): string {
 return `<p style="font-family:${BODY};font-size:18px;color:${TEXT};line-height:1.55;margin:0 0 18px;font-style:italic;border-left:2px solid ${TEXT};padding-left:18px;font-weight:400;">${text}</p>`;
}

function ornamentDivider(): string {
 return `
 <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CREAM}">
 <tr><td bgcolor="${CREAM}" align="center" style="padding:36px 0;">
 <span style="font-family:${HEAD};font-size:16px;color:${TEXT};letter-spacing:1em;">&#9670;&nbsp;&nbsp;&nbsp;&#9670;&nbsp;&nbsp;&nbsp;&#9670;</span>
 </td></tr>
 </table>`;
}

function ctaButton(label: string, url: string): string {
 return `
 <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
 <tr><td bgcolor="${BTN_BG}" style="background:${BTN_BG};padding:14px 32px;">
 <a href="${url}" style="display:block;color:${BTN_TEXT};text-decoration:none;font-family:${BODY};font-size:12px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;">${label}</a>
 </td></tr>
 </table>`;
}

/**
 * Product card with image. Image fills the card width.
 */
function productCard(args: {
 image: string;
 title: string;
 store: string;
 href: string;
 note?: string;
}): string {
 const safeImg = args.image.replace(/&/g, "&amp;");
 const safeHref = args.href.replace(/&/g, "&amp;");
 return `
 <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CREAM}" style="margin:0 0 24px;">
 <tr><td bgcolor="${CREAM}" style="padding:0;">
 <a href="${safeHref}" style="display:block;text-decoration:none;">
 <img src="${safeImg}" alt="${args.title.replace(/&[a-z]+;/g, "").replace(/"/g, "&quot;")}" width="512"
  style="display:block;width:100%;max-width:512px;height:auto;border:0;outline:none;text-decoration:none;" border="0" />
 </a>
 </td></tr>
 <tr><td bgcolor="${CREAM}" style="padding:14px 4px 8px;">
 <p style="font-family:${BODY};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${TEXT};margin:0 0 6px;font-weight:600;">${args.store}</p>
 <p style="font-family:${HEAD};font-size:18px;color:${TEXT};margin:0 0 ${args.note ? "10px" : "14px"};line-height:1.35;font-weight:500;">${args.title}</p>
 ${args.note ? `<p style="font-family:${BODY};font-size:15px;color:${TEXT_MUTED};margin:0 0 14px;font-style:italic;line-height:1.5;">${args.note}</p>` : ""}
 <a href="${safeHref}" style="display:inline-block;border:1px solid ${TEXT};color:${TEXT};padding:10px 22px;text-decoration:none;font-family:${BODY};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">Shop The Piece</a>
 </td></tr>
 </table>`;
}

/**
 * Outfit mood-board with linked piece list. Used in Natalie's styling section.
 * Big square outfit image at the top, followed by a clean list of small
 * underlined links to each individual piece.
 */
function outfitCard(args: {
 image: string;
 alt: string;
 pieces: { label: string; href: string }[];
}): string {
 const safeImg = args.image.replace(/&/g, "&amp;");
 const piecesHtml = args.pieces
 .map(
 (p) => `
 <li style="font-family:${BODY};font-size:16px;color:${TEXT};line-height:1.7;margin:0 0 6px;list-style:none;">
  <a href="${p.href.replace(/&/g, "&amp;")}" style="color:${TEXT};text-decoration:underline;text-underline-offset:3px;">${p.label}</a>
 </li>`,
 )
 .join("");
 return `
 <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CREAM}" style="margin:0 0 32px;">
 <tr><td bgcolor="${CREAM}" align="center" style="padding:0;">
 <img src="${safeImg}" alt="${args.alt.replace(/"/g, "&quot;")}" width="512"
  style="display:block;width:100%;max-width:512px;height:auto;border:0;" border="0" />
 </td></tr>
 <tr><td bgcolor="${CREAM}" style="padding:18px 4px 0;">
 <p style="font-family:${BODY};font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:${TEXT};margin:0 0 10px;font-weight:600;">Shop The Look</p>
 <ul style="margin:0;padding:0;">${piecesHtml}</ul>
 </td></tr>
 </table>`;
}

/**
 * Two-column product row for showcasing pairs.
 */
function productRow(left: Parameters<typeof productCard>[0], right: Parameters<typeof productCard>[0]): string {
 return `
 <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CREAM}" style="margin:0 0 12px;">
 <tr>
 <td bgcolor="${CREAM}" width="50%" valign="top" style="padding:0 10px 0 0;">${productCard(left)}</td>
 <td bgcolor="${CREAM}" width="50%" valign="top" style="padding:0 0 0 10px;">${productCard(right)}</td>
 </tr>
 </table>`;
}

function eventCard(args: { name: string; bullets: string[]; date?: string }): string {
 const bulletHtml = args.bullets
 .map((b) => `<li style="font-family:${BODY};font-size:16px;color:${TEXT};line-height:1.65;margin:0 0 6px;">${b}</li>`)
 .join("");
 return `
 <table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CREAM}" style="margin:0 0 28px;">
 <tr><td bgcolor="${CREAM}" style="padding:0;">
 <p style="font-family:${HEAD};font-size:20px;color:${TEXT};margin:0 0 4px;font-weight:500;">${args.name}</p>
 ${args.date ? `<p style="font-family:${BODY};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${TEXT};margin:0 0 12px;font-weight:600;">${args.date}</p>` : ""}
 <ul style="margin:6px 0 0;padding-left:22px;">${bulletHtml}</ul>
 </td></tr>
 </table>`;
}

const PRODUCT = (compositeId: string) => `https://vyaplatform.com/products/${compositeId}`;

// Product image URLs (pre-fetched from /api/public/product/{id})
const IMG = {
 dgSandals: "https://cdn.shopify.com/s/files/1/0661/9342/4562/files/C4EF4851-484A-4F8D-9644-2CAE6562C06C.jpg?v=1743474717",
 gucciJacket: "https://cdn.shopify.com/s/files/1/0922/3274/5207/files/IMG-0437.png?v=1775931887",
 chloePaddington: "https://cdn.shopify.com/s/files/1/0618/1054/0619/files/IMG-6832.png?v=1778735493",
 etroSkirt: "https://cdn.shopify.com/s/files/1/0907/1335/8617/files/IMG_4300_a9a17c9c-6953-441f-a51a-ea909f52d790.jpg?v=1779653423",
 etroShoes: "https://cdn.shopify.com/s/files/1/0739/2421/5029/files/IMG_1084_bb8ab1d7-dd63-4d30-84aa-2fb758f939b2.jpg?v=1774612712",
 colorPop: "https://cdn.shopify.com/s/files/1/0991/0321/1834/files/A03C446E-3FF0-441C-9729-19B12ABC00FE.jpg?v=1779387842",
 diorMalice: "https://cdn.shopify.com/s/files/1/0945/1762/5199/files/da7ef475-777c-49c3-8ec7-aa0f0991ae15.jpg?v=1774023697",
 fendiBaguette: "https://cdn.shopify.com/s/files/1/0618/1054/0619/files/IMG-5841.png?v=1777568634",
 cavalliJeans: "https://cdn.shopify.com/s/files/1/2541/8476/files/Photoroom_20260107_151925.png?v=1767823431",
 daytonJaneBangle: "https://cdn.shopify.com/s/files/1/0681/7687/1469/files/IMG_6138.jpg?v=1772676253",
 dgMiniSkirt: "https://cdn.shopify.com/s/files/1/0933/2454/2227/files/IMG_3858.jpg?v=1761759623",
};

export const JUNE_2026_NEWSLETTER_SUBJECT = "via VYA. The vintage fashion guide for VYA insiders · June";

export const JUNE_2026_NEWSLETTER_HTML = `
 ${para(`Welcome to the first <em>via VYA</em>. Built for our top community members to get the inside scoop &mdash; what we&rsquo;re loving, who we&rsquo;re featuring, and what&rsquo;s coming next.`)}

 ${ornamentDivider()}

 ${eyebrow("Hana's Top Picks")}
 ${h2("Founder's Edit")}
 ${para("Three pieces I'm obsessed with right now &mdash; each from a different store, each unmistakably summer.")}

 ${productCard({
 image: IMG.dgSandals,
 title: "Dolce &amp; Gabbana Strappy Sandals",
 store: "Vintage Archives LA",
 href: PRODUCT("vintage-archives-la-241"),
 })}

 ${productCard({
 image: IMG.gucciJacket,
 title: "Gucci Red Leather Peplum Jacket &mdash; Frida Giannini Era",
 store: "Edited Archive",
 href: PRODUCT("edited-archive-1225604"),
 })}

 ${productCard({
 image: IMG.chloePaddington,
 title: "Chlo&eacute; Paddington Red Bag",
 store: "Porter's Preloved",
 href: PRODUCT("porters-preloved-1247886"),
 })}

 ${ornamentDivider()}

 ${eyebrow("This Month In Vintage")}
 ${h2("Upcoming Happenings")}

 ${eventCard({
 name: "The Boston Open Market",
 date: "Every Saturday &middot; May–October",
 bullets: [
 "Vibrant open-air market featuring 50 local artists and small businesses",
 "Boylston Street entrance to the Boston Public Garden",
 "Stunning jewelry, fashion accessories, pottery, and one-of-a-kind home decor",
 ],
 })}

 ${eventCard({
 name: "Fredrick VNTG Fest (DC)",
 date: "June 20 &middot; 11am–5pm",
 bullets: [
 "Shop 120+ curated vendors across 3 buildings and 20,000 sqft",
 "Y2K / 90s clothing, jewelry, music, home decor, local art, tattoos &amp; more",
 ],
 })}

 ${eventCard({
 name: "NY Archive: Open Now",
 bullets: [
 "Every piece is sold by one of their vendors",
 "Space for shopping appointments, stylist pulls, creative shoots, and community events",
 "Rotating vendors every 3 months across 15 iconic brands",
 ],
 })}

 ${ornamentDivider()}

 ${eyebrow("Stylist Spotlight")}
 ${h2("Natalie Granader's Summer Edit")}

 ${quote(`&ldquo;Summer dressing is all about finding standout pieces that can inspire an entire outfit. This month I pulled some of my favorite finds from VYA and styled them for some of my favorite summer occasions.&rdquo;`)}

 ${h3("For Dinner")}
 ${para(`&ldquo;I'd pair these colorful statement accessories with an airy white top and vintage Levi's for an elevated summer dinner look. The Fendi baguette and vintage Dolce &amp; Gabbana heels do all the work &mdash; sometimes the best outfits start with incredible accessories.&rdquo;`)}
 ${outfitCard({
 image: "https://vyaplatform.com/newsletter/natalie-dinner.png",
 alt: "Natalie's dinner outfit",
 pieces: [
 { label: "Dolce &amp; Gabbana Strappy Heels &mdash; Vintage Archives LA", href: PRODUCT("vintage-archives-la-241") },
 { label: "Fendi Baguette &mdash; Porter's Preloved", href: PRODUCT("porters-preloved-889840") },
 ],
 })}

 ${h3("For Brunch")}
 ${para(`&ldquo;I'd style these statement floral jeans with a simple white tank, satin mules, a mini shoulder bag, and a chunky gold bangle. The look feels effortless but cool &mdash; perfect for a summer brunch.&rdquo;`)}
 ${outfitCard({
 image: "https://vyaplatform.com/newsletter/natalie-brunch.png",
 alt: "Natalie's brunch outfit",
 pieces: [
 { label: "Cavalli Floral Jeans &mdash; Bloda's Choice", href: PRODUCT("blodas-choice-23622") },
 { label: "Vintage Gold Metal Bangle &mdash; Dayton Jane", href: PRODUCT("dayton-jane-54691") },
 ],
 })}

 ${h3("For a European Beach Day")}
 ${para(`&ldquo;This vintage mini skirt was made for a European summer. I'd style it with a bright bikini, jelly flip-flops, retro-inspired sunglasses, and a crochet beach bag for a look that takes you from the beach club straight to lunch by the water.&rdquo;`)}
 ${outfitCard({
 image: "https://vyaplatform.com/newsletter/natalie-beach.png",
 alt: "Natalie's European beach day outfit",
 pieces: [
 { label: "D&amp;G Vintage Tropical Mini Skirt &mdash; Club Fleur Vintage", href: PRODUCT("club-fleur-46675") },
 ],
 })}

 ${quote(`&ldquo;My favorite outfits always start with a statement piece. Whether it's a vintage Fendi baguette or a pair of Dolce &amp; Gabbana heels, the best vintage finds don't just complete an outfit &mdash; they inspire it.&rdquo;`)}

 ${ornamentDivider()}

 ${eyebrow("What's Coming")}
 ${h2("Trends We're Watching")}

 ${h3("ETRO summer instead of Pucci summer?")}
 ${para("The print obsession is shifting. We're already seeing demand pivot toward ETRO's painterly motifs over Pucci's psychedelic geometry.")}
 ${productRow(
 { image: IMG.etroSkirt, title: "ETRO Printed Skirt", store: "Sourced by Scottie", href: PRODUCT("sourced-by-scottie-1734674") },
 { image: IMG.etroShoes, title: "ETRO Shoes", store: "The Objects of Affection", href: PRODUCT("the-objects-of-affection-176848") },
 )}

 ${h3("Less leopard, more color")}
 ${para("Vibrant solids and bold mono-tones are pulling ahead of animal prints for the first time in two seasons.")}
 ${productCard({
 image: IMG.colorPop,
 title: "A color-forward piece worth knowing",
 store: "Situations Vintage",
 href: PRODUCT("situations-vintage-1736931"),
 })}

 ${h3("The Dior Malice bag")}
 ${para("Get one now &mdash; prices are climbing fast.")}
 ${productCard({
 image: IMG.diorMalice,
 title: "Dior Malice Bag",
 store: "Petria Vintage",
 href: PRODUCT("petria-vintage-102595"),
 })}

 <div style="text-align:center;margin:24px 0 12px;">
 ${ctaButton("Browse New Arrivals", "https://vyaplatform.com/new-arrivals")}
 </div>

 ${ornamentDivider()}

 ${eyebrow("Designer of the Month")}
 ${h2("Phoebe Philo")}

 ${para("There are designers who follow culture, and then there are those who quietly rewire it. Phoebe Philo belongs to the latter. The nature of her influence is difficult to quantify, but it&rsquo;s something far more enduring and long-lasting. Philo essentially founded minimalism in fashion before it was rebranded as &ldquo;quiet luxury.&rdquo;")}

 ${para("Born in Paris but raised in London, that duality placed her between two of fashion&rsquo;s most influential capitals and ultimately led her to Central Saint Martins. After graduating, she joined Stella McCartney at Chlo&eacute;, where she refined her vision for practical femininity. It wasn&rsquo;t long before she took the helm as creative director, boosting Chlo&eacute;&rsquo;s sales by over 60% in under five years.")}

 ${para("It was at C&eacute;line, beginning in 2008, that her vision fully materialized. Philo had a tenacious rejection of overt sexuality &mdash; what we now call &ldquo;the male gaze&rdquo; &mdash; and instead offered structured, functional alternatives. Oversized silhouettes, sophisticated tailoring, restrained neutral palettes. These were clothes that assumed a woman&rsquo;s interior life was rich, complex, and worthy of consideration.")}

 ${para("The &ldquo;Philo woman&rdquo; became industry shorthand, though never easily defined. Independent, self-possessed, dressing only for herself. When she stepped down in 2018, her influence threaded through The Row, Toteme, Matthieu Blazy at Chanel, Michael Rider at C&eacute;line, Peter Do at Helmut Lang. In 2021 she returned with her self-titled label &mdash; a continuation of her legacy.")}

 ${para("To Philo, minimalism was a philosophy rooted in respect, not an aesthetic or a trend. She didn&rsquo;t just design clothes &mdash; she redefined the relationship between a woman and her wardrobe.")}

 ${quote(`&ldquo;A woman should never be a mannequin for clothes. She should bring her own personality to them.&rdquo; <span style="display:block;font-style:normal;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-top:8px;">&mdash; Phoebe Philo</span>`)}

 <div style="text-align:center;margin:28px 0 0;">
 ${ctaButton("Read The Full Article", "https://vyaplatform.substack.com/p/icons-in-fashion-phoebe-philo")}
 </div>
`;
