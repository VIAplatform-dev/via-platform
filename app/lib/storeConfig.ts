export type SquarespaceStore = {
 type: "squarespace";
 name: string;
 slug: string;
 /** Single shop URL — used by stores where one page lists all products. */
 shopUrl?: string;
 /** Multiple URLs to fetch & merge — for stores that split products across category pages. */
 shopUrls?: string[];
 rssUrl?: string;
};

export type ShopifyStore = {
 type: "shopify";
 name: string;
 slug: string;
 storeDomain: string;
 storefrontAccessToken?: string;
 /** Product titles to exclude from sync (exact match, case-insensitive) */
 excludeTitles?: string[];
 /** Product title keywords to exclude from sync (partial match, case-insensitive) */
 excludeKeywords?: string[];
 /** If set, only sync products from these Shopify collection handles (e.g. ["designer", "vintage"]) */
 collectionHandles?: string[];
 /** If true, fetch each product's page HTML during sync to extract metafield sections (condition, dimensions, etc.) */
 scrapeProductPage?: boolean;
 /** Collection handles to EXCLUDE from sync (blacklist — products in these collections are filtered out) */
 excludeCollectionHandles?: string[];
 /** If true, skip all sold-out filtering — include everything the store lists regardless of inventory status */
 skipSoldOutFilter?: boolean;
};

export type BigCartelStore = {
 type: "bigcartel";
 name: string;
 slug: string;
 /** The store's Big Cartel subdomain slug (e.g. "kikiddesignandconsign") */
 storeSlug: string;
};

export type SquareStore = {
 type: "square";
 name: string;
 slug: string;
 /** Square Location ID (LXXXXXXXXXXXXXXXXX) — used for product catalog sync */
 locationId?: string;
 /** Name of the env var holding this store's Square access token e.g. SQUARE_ACCESS_TOKEN_HONEY_BEAR_VINTAGE */
 accessTokenEnvVar?: string;
};

export type StripeStore = {
 type: "stripe";
 name: string;
 slug: string;
 /** Name of the env var holding this store's Stripe secret key */
 secretKeyEnvVar: string;
 /** Store's public website URL — used to construct product page links */
 websiteUrl: string;
};

export type WixStore = {
 type: "wix";
 name: string;
 slug: string;
 /** Wix site ID (UUID) */
 siteId: string;
 /** Name of the env var holding this store's Wix API key */
 apiKeyEnvVar: string;
 /** Product titles to exclude/remove from sync (exact match, case-insensitive) */
 excludeTitles?: string[];
 /** Product title keywords to exclude/remove from sync (partial match) */
 excludeKeywords?: string[];
};

export type Store = SquarespaceStore | ShopifyStore | BigCartelStore | SquareStore | StripeStore | WixStore;

// Squarespace stores (RSS-based)
export const SQUARESPACE_STORES: SquarespaceStore[] = [
 {
 type: "squarespace",
 name: "In a Past Life",
 slug: "in-a-past-life",
 shopUrl: "https://www.inapast.life/shop",
 },
 {
 type: "squarespace",
 name: "LEI Vintage",
 slug: "lei-vintage",
 shopUrl: "https://www.leivintage.com/shop",
 },
 {
 type: "squarespace",
 name: "Montrose Edit",
 slug: "montrose-edit",
 shopUrl: "https://www.montroseedit.com/shop",
 },
 {
 type: "squarespace",
 name: "Sassy So What",
 slug: "sassy-so-what",
 shopUrl: "https://www.sassysowhat.com/shopall",
 },
 {
 type: "squarespace",
 name: "Keepin It Real Luxe",
 slug: "keepin-it-real-luxe",
 // Site has no "all products" page — categories must be fetched separately and merged.
 shopUrls: [
 "https://www.keepinitrealluxe.com/handbags",
 "https://www.keepinitrealluxe.com/accessories",
 "https://www.keepinitrealluxe.com/shoes",
 "https://www.keepinitrealluxe.com/mens",
 ],
 },
];

// Shopify stores (Storefront API)
export const SHOPIFY_STORES: ShopifyStore[] = [
 {
 type: "shopify",
 name: "Stone Studio Vintage",
 slug: "stone-studio-vintage",
 storeDomain: "stonestudiovintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Vintage Archives LA",
 slug: "vintage-archives-la",
 storeDomain: "vintagearchivesla.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "SCARZ Vintage",
 slug: "scarz-vintage",
 storeDomain: "scarzvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Sacrare",
 slug: "sacrare",
 storeDomain: "sacrare.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Club Fleur Vintage",
 slug: "club-fleur",
 storeDomain: "clubfleurvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Missi Archives",
 slug: "missi-archives",
 storeDomain: "www.missiarchives.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Ascensio Vintage",
 slug: "ascensio-vintage",
 storeDomain: "ascensiovintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Lover Girl Vintage",
 slug: "lover-girl-vintage",
 storeDomain: "lovergirlvintage.com",
 excludeKeywords: ["trucker hat", "jewelry box"],
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Source 24",
 slug: "source-twenty-four",
 storeDomain: "sourcetwentyfour.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "The Objects of Affection",
 slug: "the-objects-of-affection",
 storeDomain: "theobjectsofaffection.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Vintari Vault",
 slug: "vintari-vault",
 storeDomain: "vintarivault.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Vangie",
 slug: "vangie",
 storeDomain: "pgkjey-wq.myshopify.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "House on a Chain",
 slug: "house-on-a-chain",
 storeDomain: "www.houseonachain.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "To Us Vintage",
 slug: "to-us-vintage",
 storeDomain: "tousvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Sourced by Scottie",
 slug: "sourced-by-scottie",
 storeDomain: "sourcedbyscottie.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Maison Optimism Vintage",
 slug: "maison-optimism-vintage",
 storeDomain: "maisonoptimismvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Mookie Studios",
 slug: "mookie-studios",
 storeDomain: "mookiestudios.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "California Boho Studio",
 slug: "california-boho-studio",
 storeDomain: "californiabohostudio.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Shiranka Vintage",
 slug: "shiranka-vintage",
 storeDomain: "shirankavintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Moonstruck Vintage",
 slug: "moonstruck-vintage",
 storeDomain: "moonstruckvintagenyc.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Bag Crush",
 slug: "bag-crush",
 storeDomain: "mybagcrush.com",
 scrapeProductPage: true,
 excludeTitles: ["Bag Charm (Standard)"],
 },
 {
 type: "shopify",
 name: "Bloda's Choice",
 slug: "blodas-choice",
 storeDomain: "blodaschoice.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Rareality Archive",
 slug: "rareality-archive",
 storeDomain: "rarealityarchive.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Sheer Vintage",
 slug: "sheer-vintage",
 storeDomain: "shopsheervintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Petria Vintage",
 slug: "petria-vintage",
 storeDomain: "petriavintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Promised Vintage",
 slug: "promised-vintage",
 storeDomain: "promisedvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Sablier Vintage",
 slug: "sablier-vintage",
 storeDomain: "sabliervintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Dayton Jane",
 slug: "dayton-jane",
 storeDomain: "www.daytonjane.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Front Page Finds",
 slug: "front-page-finds",
 storeDomain: "frontpagefinds.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Vintage Girlfriend",
 slug: "vintage-girlfriend",
 storeDomain: "vintage-girlfriend.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Porter's Preloved",
 slug: "porters-preloved",
 storeDomain: "porterspreloved.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "For The Globe",
 slug: "for-the-globe",
 storeDomain: "shopfortheglobe.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Chill Boutique",
 slug: "chill-boutique",
 storeDomain: "chillboutiqueconsignment.com",
 collectionHandles: ["designer", "vintage"],
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Jade Vintage",
 slug: "jade-vintage",
 storeDomain: "jadevintage.ca",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Other Matters Atelier",
 slug: "other-matters-atelier",
 storeDomain: "othermattersatelier.com",
 scrapeProductPage: true,
 excludeKeywords: ["vintage edit", "designer's guide", "instant download"],
 },
 {
 type: "shopify",
 name: "West Village Vintage",
 slug: "west-village-vintage",
 storeDomain: "westvillagevintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Chomp Chomp Vintage",
 slug: "chomp-chomp-vintage",
 storeDomain: "chompchompvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Tess Elizabeth Vintage",
 slug: "tess-elizabeth-vintage",
 storeDomain: "tesselizabethvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Edited Archive",
 slug: "edited-archive",
 storeDomain: "editedarchive.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Dear Muse",
 slug: "dear-muse",
 storeDomain: "shopdearmuse.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Ange Archive",
 slug: "ange-archive",
 storeDomain: "angearchive.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Rejects Only Vintage",
 slug: "rejects-only-vintage",
 storeDomain: "rejectsonlyvintage.com",
 scrapeProductPage: true,
 excludeCollectionHandles: ["merch", "men-s-vintage-designer-ties", "children-s"],
 },
 {
 type: "shopify",
 name: "Hachi Archive",
 slug: "hachi-archive",
 storeDomain: "hachiarchive.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "SarahDoes",
 slug: "sarah-does",
 storeDomain: "sarahdoes.shop",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Situations Vintage",
 slug: "situations-vintage",
 storeDomain: "situationsvintage.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Capsule Édit",
 slug: "capsule-edit",
 storeDomain: "capsuledit.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Nunumia",
 slug: "nunumia",
 storeDomain: "nunumia.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Thread and Bloom",
 slug: "thread-and-bloom",
 storeDomain: "threadandbloomshop.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Lamash",
 slug: "lamash",
 storeDomain: "lamash-store.myshopify.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Blummier",
 slug: "blummier",
 storeDomain: "blummier.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Reine Revival",
 slug: "reine-revival",
 storeDomain: "reinerevival.com",
 },
 {
 type: "shopify",
 name: "The Vintage New Yorker",
 slug: "the-vintage-new-yorker",
 storeDomain: "thevintagenewyorker.com",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Loved, Again",
 slug: "loved-again",
 storeDomain: "www.lovedagainvintage.com.au",
 scrapeProductPage: true,
 },
 {
 type: "shopify",
 name: "Of Substance",
 slug: "of-substance",
 storeDomain: "shopofsubstance.com",
 scrapeProductPage: true,
 },
];

// Big Cartel stores (public JSON API — no token required)
export const BIGCARTEL_STORES: BigCartelStore[] = [];

// Square stores (webhook-based order tracking, no product catalog sync yet)
export const SQUARE_STORES: SquareStore[] = [
 {
 type: "square",
 name: "Honeybear Vintage",
 slug: "honey-bear-vintage",
 locationId: "LJ886JKR82R0H",
 accessTokenEnvVar: "SQUARE_ACCESS_TOKEN_HONEY_BEAR_VINTAGE",
 },
];

// Wix stores (REST Catalog API — api key + site ID)
export const WIX_STORES: WixStore[] = [
 {
 type: "wix",
 name: "Nello Vintage",
 slug: "nello-vintage",
 siteId: "1d7e01f6-61bb-477e-a804-db6f2d82275f",
 apiKeyEnvVar: "WIX_API_KEY_NELLO_VINTAGE",
 // Knockoff-style listings removed permanently (also won't re-import).
 excludeTitles: ["LV-style pink satin mini bag", "Prada-style croc shoulder bag"],
 },
];

// Carroll Street Vintage uses a custom sync endpoint (/api/admin/sync-carroll-street)
// that scrapes their JS bundle for products and Stripe for orders separately.
// It must NOT be in STRIPE_STORES / ALL_STORES — the generic stripe cron fetches
// Stripe's product catalog (which Carroll Street doesn't use) and would delete
// all scraped products each night.
export const STRIPE_STORES: StripeStore[] = [];

export const ALL_STORES: Store[] = [
 ...SQUARESPACE_STORES,
 ...SHOPIFY_STORES,
 ...BIGCARTEL_STORES,
 ...SQUARE_STORES,
 ...STRIPE_STORES,
 ...WIX_STORES,
];
