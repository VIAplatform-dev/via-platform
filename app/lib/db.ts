import { neon } from "@neondatabase/serverless";

// Get the database URL from environment variable
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL or POSTGRES_URL environment variable is not set. " +
        "Please set up Vercel Postgres or Neon database."
    );
  }
  return url;
};

export type DBProduct = {
  id: number;
  store_slug: string;
  store_name: string;
  title: string;
  price: number;
  currency: string;
  image: string | null;
  external_url: string | null;
  synced_at: Date;
};

/**
 * Initialize the products table if it doesn't exist
 */
export async function initDatabase() {
  const sql = neon(getDatabaseUrl());

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      store_slug VARCHAR(255) NOT NULL,
      store_name VARCHAR(255) NOT NULL,
      title TEXT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'USD',
      image TEXT,
      external_url TEXT,
      synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(store_slug, title)
    )
  `;

  // Create index for faster queries by store
  await sql`
    CREATE INDEX IF NOT EXISTS idx_products_store_slug ON products(store_slug)
  `;
}

/**
 * Sync products for a store - replaces all existing products for that store
 */
export async function syncProducts(
  storeSlug: string,
  storeName: string,
  products: Array<{
    title: string;
    price: number;
    currency?: string;
    image?: string;
    externalUrl?: string;
  }>
) {
  const sql = neon(getDatabaseUrl());

  // Delete existing products for this store
  await sql`DELETE FROM products WHERE store_slug = ${storeSlug}`;

  // Insert new products
  for (const product of products) {
    await sql`
      INSERT INTO products (store_slug, store_name, title, price, currency, image, external_url, synced_at)
      VALUES (
        ${storeSlug},
        ${storeName},
        ${product.title},
        ${product.price},
        ${product.currency || "USD"},
        ${product.image || null},
        ${product.externalUrl || null},
        NOW()
      )
    `;
  }

  return products.length;
}

/**
 * Get all products for a specific store
 */
export async function getProductsByStore(storeSlug: string): Promise<DBProduct[]> {
  const sql = neon(getDatabaseUrl());

  const result = await sql`
    SELECT * FROM products WHERE store_slug = ${storeSlug} ORDER BY id
  `;
  return result as DBProduct[];
}

/**
 * Get all products from all stores
 */
export async function getAllProducts(): Promise<DBProduct[]> {
  const sql = neon(getDatabaseUrl());

  const result = await sql`
    SELECT * FROM products ORDER BY store_slug, id
  `;
  return result as DBProduct[];
}

/**
 * Get list of all synced stores
 */
export async function getSyncedStores(): Promise<
  Array<{ store_slug: string; store_name: string; product_count: number; last_synced: Date }>
> {
  const sql = neon(getDatabaseUrl());

  const result = await sql`
    SELECT
      store_slug,
      store_name,
      COUNT(*) as product_count,
      MAX(synced_at) as last_synced
    FROM products
    GROUP BY store_slug, store_name
    ORDER BY store_name
  `;
  return result as any;
}
