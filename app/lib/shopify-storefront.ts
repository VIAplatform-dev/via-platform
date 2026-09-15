// ───────────────────────────────────────────────────────────────────────────
// Shopify Storefront API client. When a seller connects their store (pastes a
// Storefront API token), we pull their nav menu, pages, and collections EXACTLY
// via GraphQL, no screenshots/vision/scraping for those parts. Read-only.
// ───────────────────────────────────────────────────────────────────────────

const API_VERSION = "2024-10";

function endpoint(shop: string): string {
 const host = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
 return `https://${host}/api/${API_VERSION}/graphql.json`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function storefrontQuery(shop: string, token: string, query: string, variables?: any): Promise<any> {
 const res = await fetch(endpoint(shop), {
 method: "POST",
 headers: { "Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": token },
 body: JSON.stringify({ query, variables }),
 signal: AbortSignal.timeout(15000),
 });
 if (res.status === 401 || res.status === 403) throw new Error("Invalid Storefront API token.");
 const json = await res.json();
 if (json.errors?.length) throw new Error(json.errors[0]?.message || "Storefront API error");
 return json.data;
}

/** Validate a connection: returns the shop name on success. */
export async function verifyConnection(shop: string, token: string): Promise<{ ok: boolean; shopName?: string; error?: string }> {
 try {
 const d = await storefrontQuery(shop, token, `{ shop { name } }`);
 return { ok: true, shopName: d?.shop?.name };
 } catch (e: any) {
 return { ok: false, error: e?.message || "Couldn’t connect." };
 }
}

export type MenuItem = { title: string; url: string; items: { title: string; url: string }[] };

/** The store's nav menu (top-level items + their dropdown sub-items). */
export async function getMenu(shop: string, token: string, handle = "main-menu"): Promise<MenuItem[]> {
 const d = await storefrontQuery(
 shop,
 token,
 `query($h: String!) { menu(handle: $h) { items { title url items { title url } } } }`,
 { h: handle },
 );
 return (d?.menu?.items || []).map((i: any) => ({
 title: String(i.title || "").trim(),
 url: String(i.url || ""),
 items: (i.items || []).map((s: any) => ({ title: String(s.title || "").trim(), url: String(s.url || "") })),
 }));
}

export type ShopifyPage = { title: string; handle: string; body: string };

/** The store's content pages (exact title + HTML body). */
export async function getPages(shop: string, token: string): Promise<ShopifyPage[]> {
 const d = await storefrontQuery(shop, token, `{ pages(first: 30) { edges { node { title handle body } } } }`);
 return (d?.pages?.edges || []).map((e: any) => ({ title: e.node.title, handle: e.node.handle, body: e.node.body || "" }));
}
