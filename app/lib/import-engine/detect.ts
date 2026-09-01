// Platform detection + "can we import this at all?" scoring.
//
// Pure functions over a fetched homepage — no network, no DB — so every rule here is testable
// against the saved corpus of real storefronts. Detection decides which extraction rung the
// importer tries first (see rungs.ts); the shell score decides whether to try at all.

export type PlatformId =
 | "shopify"
 | "shopify-headless"
 | "squarespace"
 | "woocommerce"
 | "wordpress"
 | "bigcommerce"
 | "wix"
 | "webflow"
 | "ecwid"
 | "square"
 | "magento"
 | "static"
 | "unknown";

export type Detection = {
 platform: PlatformId;
 confidence: number; // 0–1
 /** The JS framework, when the page is app-rendered. Tells us whether embedded state is minable. */
 framework: string | null;
 /** Theme fingerprint, where the platform exposes one (keys the capture shim). */
 theme: string | null;
 /** How much of the page exists in the HTML we were served. See shellScore(). */
 shell: ShellScore;
 signals: string[];
};

export type ShellScore = {
 /** true = the server sent essentially nothing; the page is built in the browser. */
 isShell: boolean;
 bytes: number;
 textLength: number;
 images: number;
 reason: string;
};

/** Visible text length, ignoring script/style bodies and tags. */
export function visibleTextLength(html: string): number {
 return html
  .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim().length;
}

/**
 * Is this HTML a client-rendered shell?
 *
 * Gatsby/Vite/CRA/Lovable pages ship a near-empty <div id="root"> and build everything in the
 * browser, so there is nothing for a fetch-based importer to read — no products, no design. We'd
 * rather say so plainly than "import" a blank page. Measured rather than guessed: a real
 * storefront homepage carries thousands of characters of copy and dozens of images (the smallest
 * genuine store in the corpus still had ~4.8k chars), while the shells had ~66–234 chars and 0–1
 * images.
 */
export function shellScore(html: string): ShellScore {
 const bytes = html.length;
 const textLength = visibleTextLength(html);
 const images = (html.match(/<img\b/gi) || []).length;
 // Generous thresholds: only flag pages that are unambiguously empty, so a sparse-but-real
 // storefront is never wrongly declined.
 const isShell = textLength < 600 && images <= 2;
 const reason = isShell
  ? `only ${textLength} characters of text and ${images} image(s) in the served HTML — this site builds its content in the browser`
  : `${textLength} characters of text, ${images} images`;
 return { isShell, bytes, textLength, images, reason };
}

/**
 * Is this response a bot-protection interstitial rather than the site?
 *
 * Cloudflare's managed challenge, Akamai's and PerimeterX's equivalents all answer a *successful*
 * HTTP status with a tiny page that says "prove you're human". captureSite's only gate is `res.ok`,
 * so a challenge served as **200** — which is what ec.2ndstreetusa.com does for the first stretch,
 * switching to 429 only later — would be stored as the seller's storefront on every page, and the
 * import would report success. That is worse than failing: a store goes live serving a Cloudflare
 * notice under the seller's own name.
 *
 * Deliberately conservative, and requires BOTH halves: an unmistakable challenge marker AND a page
 * with almost no content of its own. A real storefront that happens to mention Cloudflare, or ships
 * a "security" page, has thousands of characters of its own copy and is never flagged.
 */
const CHALLENGE_MARKERS = [
 /_cf_chl_opt/,                      // Cloudflare managed challenge / Turnstile bootstrap
 /cdn-cgi\/challenge-platform/,      // …and the script it loads
 /id=["']cf-challenge-running["']/,  // Cloudflare's legacy "Just a moment…" interstitial
 /<title>\s*Just a moment\.\.\.?\s*<\/title>/i,
 /<title>[^<]{0,60}Verifying your connection[^<]{0,20}<\/title>/i,
 /_pxAppId|px-captcha/,              // PerimeterX
 /\/_sec\/cp_challenge\//,           // Akamai
];
export function looksLikeBotChallenge(html: string): boolean {
 if (!html) return false;
 if (!CHALLENGE_MARKERS.some((re) => re.test(html))) return false;
 // A challenge page carries the vendor's own boilerplate and nothing of the seller's. The smallest
 // genuine storefront homepage in the corpus still had ~4.8k characters of visible text; the
 // Cloudflare interstitial has a headline and a sentence.
 return visibleTextLength(html) < 2000;
}

const FRAMEWORKS: [string, RegExp][] = [
 ["remix", /__remixContext/],
 ["next", /__NEXT_DATA__|_next\/static/],
 ["nuxt", /__NUXT__|\/_nuxt\//],
 ["gatsby", /gatsby-|page-data\.json/],
 ["sveltekit", /__sveltekit|\/_app\/immutable\//],
 ["astro", /astro-island|astro-root/],
 ["vite", /\/assets\/index-[\w-]+\.js|type="module"[^>]*crossorigin/],
];

/** Which JS framework rendered this page, if any. Determines whether embedded state is minable. */
export function detectFramework(html: string): string | null {
 for (const [id, re] of FRAMEWORKS) if (re.test(html)) return id;
 return null;
}

/** Shopify's theme object, when present — the shim registry keys off this. */
export function detectShopifyTheme(html: string): string | null {
 const m = html.match(/Shopify\.theme\s*=\s*\{[^}]*"schema_name"\s*:\s*"([^"]+)"/);
 if (m) return m[1];
 const n = html.match(/Shopify\.theme\s*=\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
 return n ? n[1] : null;
}

/**
 * Identify the commerce platform from a served homepage.
 *
 * Detection is always run live rather than trusted from a directory: stores migrate, and every
 * "best BigCommerce stores" listicle in the corpus turned out to include a site that had since
 * moved to Shopify. Ordering matters — the more specific signature wins, and headless Shopify is
 * checked before generic Shopify because it looks like Shopify while behaving nothing like it.
 */
export function detectPlatform(html: string, url?: string): Detection {
 const signals: string[] = [];
 const add = (s: string) => { signals.push(s); return true; };
 const framework = detectFramework(html);
 const shell = shellScore(html);
 const theme = detectShopifyTheme(html);
 const has = (re: RegExp, label: string) => (re.test(html) ? add(label) : false);

 const shopifyAssets = has(/cdn\.shopify\.com|cdn\/shop\/|myshopify\.com/i, "shopify-assets");
 // A Shopify BACKEND behind a custom frontend: Shopify's CDN serves the images, but the page is a
 // JS app and the storefront domain has no products.json. Those need the merchant's myshopify
 // domain (or a Storefront API token), so they're worth naming rather than lumping in with Shopify.
 if (shopifyAssets && framework && !/Shopify\.theme|shopify-section/i.test(html)) {
  add(`framework:${framework}`);
  return { platform: "shopify-headless", confidence: 0.75, framework, theme, shell, signals };
 }
 if (shopifyAssets || theme) {
  if (theme) add(`theme:${theme}`);
  return { platform: "shopify", confidence: 0.95, framework, theme, shell, signals };
 }
 if (has(/squarespace|static1\.squarespace|sqs-block/i, "squarespace")) {
  return { platform: "squarespace", confidence: 0.9, framework, theme, shell, signals };
 }
 if (has(/cdn11\.bigcommerce|bigcommerce\.com|stencil-utils/i, "bigcommerce")) {
  return { platform: "bigcommerce", confidence: 0.9, framework, theme, shell, signals };
 }
 if (has(/parastorage\.com|wixstatic\.com|wix-code|_wixCssImports/i, "wix")) {
  return { platform: "wix", confidence: 0.9, framework, theme, shell, signals };
 }
 if (has(/woocommerce|wc-block|wp-content\/plugins\/woocommerce/i, "woocommerce")) {
  return { platform: "woocommerce", confidence: 0.9, framework, theme, shell, signals };
 }
 if (has(/wp-content|wp-includes|wp-json/i, "wordpress")) {
  // WordPress without WooCommerce is a brochure site: design is importable, products aren't.
  return { platform: "wordpress", confidence: 0.8, framework, theme, shell, signals };
 }
 if (has(/webflow\.com|w-webflow|data-wf-page/i, "webflow")) {
  return { platform: "webflow", confidence: 0.85, framework, theme, shell, signals };
 }
 if (has(/ecwid|app\.ecwid\.com/i, "ecwid")) {
  return { platform: "ecwid", confidence: 0.8, framework, theme, shell, signals };
 }
 if (has(/square\.site|squareup\.com|weebly/i, "square")) {
  return { platform: "square", confidence: 0.8, framework, theme, shell, signals };
 }
 // Anchored signatures only. An earlier `mage\/` matched inside "image/" — so every page with
 // `type="image/png"` was detected as Magento. Substring probes need a real boundary.
 if (has(/\bMagento\b|data-mage-init|mage-init|static\/version\d+\/frontend|Mage\.Cookies/, "magento")) {
  return { platform: "magento", confidence: 0.8, framework, theme, shell, signals };
 }
 if (framework) {
  add(`framework:${framework}`);
  return { platform: "unknown", confidence: 0.4, framework, theme, shell, signals };
 }
 if (url) add(`url:${url}`);
 // Server-rendered HTML we don't recognise: still importable via sitemap + JSON-LD.
 return { platform: shell.isShell ? "unknown" : "static", confidence: 0.3, framework, theme, shell, signals };
}

/** A seller-facing explanation for a site we can't import automatically. Says what's true and what
 *  they can do instead — never a bare failure. */
export function declineMessage(d: Detection): string | null {
 if (d.platform === "wix") {
  return "Wix builds its pages in the browser and doesn't publish a product feed we can read, so we can't import this one automatically. You can upload your inventory as a CSV and build your storefront here instead.";
 }
 if (d.shell.isShell) {
  const what = d.framework ? `a ${d.framework} app` : "a JavaScript app";
  return `This site is ${what} that renders in the browser, so there's nothing in the page for us to import (${d.shell.reason}). Upload your inventory as a CSV, or connect your store's platform directly.`;
 }
 if (d.platform === "shopify-headless") {
  return "This storefront runs on Shopify behind a custom frontend. Paste your .myshopify.com address (or connect your store) and we'll import the full catalog from there.";
 }
 if (d.platform === "wordpress") {
  return "This is a WordPress site without WooCommerce, so there's no product feed to import. We can still bring the design over — add your inventory by CSV or by hand.";
 }
 return null;
}
