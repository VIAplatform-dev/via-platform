"use client";

import { useState } from "react";
import {
 SQUARESPACE_STORES,
 SHOPIFY_STORES,
 BIGCARTEL_STORES,
 SQUARE_STORES,
 WIX_STORES,
 ALL_STORES,
 type Store,
} from "@/app/lib/storeConfig";

type SyncResult = {
 success?: boolean;
 message?: string;
 productCount?: number;
 inserted?: number;
 updated?: number;
 skippedCount?: number;
 skipReasons?: Record<string, number>;
 shopName?: string;
 error?: string;
 details?: string;
 // orders sync
 ordersFound?: number;
 saved?: number;
 duplicates?: number;
};

type StoreStatus = {
 loading: boolean;
 result: SyncResult | null;
 ordersLoading?: boolean;
 ordersResult?: SyncResult | null;
};

type StripeOrdersResult = {
 ok?: boolean;
 totalCharges?: number;
 saved?: number;
 skipped?: number;
 errors?: number;
 since?: string;
 error?: string;
};

export default function SyncAdminPage() {
 const [statuses, setStatuses] = useState<Record<string, StoreStatus>>({});
 const [purgeResult, setPurgeResult] = useState<{ slug: string; deleted?: number; error?: string } | null>(null);
 const [purgeLoading, setPurgeLoading] = useState(false);
 const [carrollStripeLoading, setCarrollStripeLoading] = useState(false);
 const [carrollStripeResult, setCarrollStripeResult] = useState<StripeOrdersResult | null>(null);
 const [carrollProductsLoading, setCarrollProductsLoading] = useState(false);
 const [carrollProductsResult, setCarrollProductsResult] = useState<{ ok?: boolean; productCount?: number; total?: number; error?: string } | null>(null);

 async function handleSyncCarrollStripe() {
 setCarrollStripeLoading(true);
 setCarrollStripeResult(null);
 try {
 const resp = await fetch("/api/admin/sync-carroll-street", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({}),
 });
 const data = await resp.json();
 setCarrollStripeResult(data);
 } catch (err) {
 setCarrollStripeResult({ error: err instanceof Error ? err.message : "Request failed" });
 } finally {
 setCarrollStripeLoading(false);
 }
 }

 async function handleSyncCarrollProducts() {
 setCarrollProductsLoading(true);
 setCarrollProductsResult(null);
 try {
 const resp = await fetch("/api/admin/sync-carroll-street", { method: "GET" });
 const data = await resp.json();
 setCarrollProductsResult(data);
 } catch (err) {
 setCarrollProductsResult({ error: err instanceof Error ? err.message : "Request failed" });
 } finally {
 setCarrollProductsLoading(false);
 }
 }

 async function handleSync(store: Store) {
 setStatuses((prev) => ({
 ...prev,
 [store.slug]: { loading: true, result: null },
 }));

 try {
 let response: Response;

 if (store.type === "squarespace") {
 response = await fetch("/api/sync-squarespace", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 storeName: store.name,
 shopUrl: store.shopUrl,
 shopUrls: store.shopUrls,
 rssUrl: store.rssUrl,
 }),
 });
 } else if (store.type === "bigcartel") {
 response = await fetch("/api/sync-bigcartel", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 storeName: store.name,
 storeSlug: store.storeSlug,
 }),
 });
 } else if (store.type === "shopify") {
 response = await fetch("/api/sync-shopify", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 storeName: store.name,
 storeSlug: store.slug,
 storeDomain: store.storeDomain,
 storefrontAccessToken: store.storefrontAccessToken,
 collectionHandles: store.collectionHandles,
 }),
 });
 } else if (store.type === "square") {
 response = await fetch("/api/sync-square", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug: store.slug, locationId: store.locationId }),
 });
 } else if (store.type === "wix") {
 response = await fetch("/api/sync-wix", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 storeName: store.name,
 storeSlug: store.slug,
 siteId: store.siteId,
 apiKeyEnvVar: store.apiKeyEnvVar,
 }),
 });
 } else {
 return;
 }

 const data = await response.json();
 setStatuses((prev) => ({
 ...prev,
 [store.slug]: { loading: false, result: data },
 }));
 } catch (error) {
 setStatuses((prev) => ({
 ...prev,
 [store.slug]: {
 loading: false,
 result: {
 error: "Request failed",
 details: error instanceof Error ? error.message : "Unknown error",
 },
 },
 }));
 }
 }

 async function handleSyncOrders(store: Store) {
 setStatuses((prev) => ({
 ...prev,
 [store.slug]: { ...(prev[store.slug] ?? { loading: false, result: null }), ordersLoading: true, ordersResult: null },
 }));
 try {
 const response = await fetch("/api/sync-square-orders", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug: store.slug }),
 });
 const data = await response.json();
 setStatuses((prev) => ({
 ...prev,
 [store.slug]: { ...(prev[store.slug] ?? { loading: false, result: null }), ordersLoading: false, ordersResult: data },
 }));
 } catch (error) {
 setStatuses((prev) => ({
 ...prev,
 [store.slug]: {
 ...(prev[store.slug] ?? { loading: false, result: null }),
 ordersLoading: false,
 ordersResult: { error: error instanceof Error ? error.message : "Request failed" },
 },
 }));
 }
 }

 async function handlePurge(slug: string) {
 if (!confirm(`Delete all products for "${slug}" from the database? This cannot be undone.`)) return;
 setPurgeLoading(true);
 setPurgeResult(null);
 try {
 const resp = await fetch(`/api/admin/purge-store?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
 const data = await resp.json();
 setPurgeResult({ slug, ...data });
 } catch (err) {
 setPurgeResult({ slug, error: err instanceof Error ? err.message : "Request failed" });
 } finally {
 setPurgeLoading(false);
 }
 }

 async function handleSyncAll() {
 for (const store of ALL_STORES) {
 await handleSync(store);
 }
 }

 return (
 <main style={{ background: "#f8f9fa", minHeight: "100vh" }}>

 {/* Page title */}
 <section style={{ background: "#fff", borderBottom: "1px solid #e4e4e7" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", marginBottom: 8 }}>
 Inventory Sync
 </h1>
 <p style={{ fontSize: 14, color: "#71717a" }}>
 Sync products from all connected stores.
 </p>
 </div>
 </section>

 {/* Sync All Button */}
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px", display: "flex", justifyContent: "flex-end" }}>
 <button
 onClick={handleSyncAll}
 style={{ padding: "8px 20px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}
 >
 Sync All Stores
 </button>
 </div>

 {/* Content */}
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px 48px" }}>

 {/* Squarespace Stores */}
 {SQUARESPACE_STORES.length > 0 && (
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Squarespace Stores</h2>
 {SQUARESPACE_STORES.map((store) => {
 const status = statuses[store.slug];
 const isLoading = status?.loading;
 const result = status?.result;

 return (
 <div
 key={store.slug}
 style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 12 }}
 >
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b", marginBottom: 4 }}>{store.name}</h3>
 <p style={{ fontSize: 12, color: "#71717a", wordBreak: "break-all" }}>
 {store.shopUrls && store.shopUrls.length > 0
 ? `${store.shopUrls.length} pages: ${store.shopUrls.join(", ")}`
 : store.shopUrl || store.rssUrl}
 </p>
 </div>
 <button
 onClick={() => handleSync(store)}
 disabled={isLoading}
 style={{ padding: "7px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {isLoading ? "Syncing..." : "Sync"}
 </button>
 </div>
 {result && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e4e4e7" }}>
 {result.success ? (
 <div style={{ fontSize: 13 }}>
 <p style={{ color: "#15803d" }}>
 {result.inserted != null
 ? `${result.inserted} new · ${result.updated ?? 0} updated`
 : `${result.productCount} products synced`}
 </p>
 {result.skippedCount !== undefined && result.skippedCount > 0 && (
 <p style={{ color: "#71717a", marginTop: 4 }}>{result.skippedCount} skipped (sold out)</p>
 )}
 </div>
 ) : (
 <p style={{ color: "#dc2626", fontSize: 13 }}>
 {result.error}
 {result.details && (
 <span style={{ display: "block", color: "#71717a", marginTop: 4 }}>{result.details}</span>
 )}
 </p>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Big Cartel Stores */}
 {BIGCARTEL_STORES.length > 0 && (
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Big Cartel Stores</h2>
 {BIGCARTEL_STORES.map((store) => {
 const status = statuses[store.slug];
 const isLoading = status?.loading;
 const result = status?.result;

 return (
 <div key={store.slug} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 12 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b" }}>{store.name}</h3>
 <span style={{ fontSize: 11, padding: "2px 8px", background: "#dbeafe", color: "#1e40af", borderRadius: 99, fontWeight: 500 }}>Big Cartel</span>
 </div>
 <p style={{ fontSize: 12, color: "#71717a", wordBreak: "break-all" }}>
 api.bigcartel.com/{store.storeSlug}
 </p>
 </div>
 <button
 onClick={() => handleSync(store)}
 disabled={isLoading}
 style={{ padding: "7px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {isLoading ? "Syncing..." : "Sync"}
 </button>
 </div>
 {result && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e4e4e7" }}>
 {result.success ? (
 <div style={{ fontSize: 13 }}>
 <p style={{ color: "#15803d" }}>
 {result.inserted != null
 ? `${result.inserted} new · ${result.updated ?? 0} updated`
 : `${result.productCount} products synced`}
 </p>
 {result.skippedCount !== undefined && result.skippedCount > 0 && (
 <p style={{ color: "#71717a", marginTop: 4 }}>{result.skippedCount} skipped (sold out)</p>
 )}
 </div>
 ) : (
 <p style={{ color: "#dc2626", fontSize: 13 }}>
 {result.error}
 {result.details && (
 <span style={{ display: "block", color: "#71717a", marginTop: 4 }}>{result.details}</span>
 )}
 </p>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Square Stores */}
 {SQUARE_STORES.length > 0 && (
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Square Stores</h2>
 {SQUARE_STORES.map((store) => {
 const status = statuses[store.slug];
 const isLoading = status?.loading;
 const result = status?.result;
 const ordersLoading = status?.ordersLoading;
 const ordersResult = status?.ordersResult;
 return (
 <div key={store.slug} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 12 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b" }}>{store.name}</h3>
 <span style={{ fontSize: 11, padding: "2px 8px", background: "#fef9c3", color: "#854d0e", borderRadius: 99, fontWeight: 500 }}>Square</span>
 </div>
 {store.locationId && (
 <p style={{ fontSize: 12, color: "#71717a" }}>Location: {store.locationId}</p>
 )}
 </div>
 <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
 <button
 onClick={() => handleSyncOrders(store)}
 disabled={ordersLoading}
 style={{ padding: "7px 18px", background: "#fff", color: "#18181b", border: "1px solid #e4e4e7", borderRadius: 6, cursor: ordersLoading ? "not-allowed" : "pointer", opacity: ordersLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {ordersLoading ? "Syncing..." : "Sync Orders"}
 </button>
 <button
 onClick={() => handleSync(store)}
 disabled={isLoading}
 style={{ padding: "7px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {isLoading ? "Syncing..." : "Sync Products"}
 </button>
 </div>
 </div>
 {(result || ordersResult) && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e4e4e7", display: "flex", flexDirection: "column", gap: 6 }}>
 {result && (result.success ? (
 <div style={{ fontSize: 13 }}>
 <p style={{ color: "#15803d" }}>{result.productCount} products synced</p>
 {result.skippedCount !== undefined && result.skippedCount > 0 && (
 <p style={{ color: "#71717a", marginTop: 2 }}>{result.skippedCount} skipped</p>
 )}
 {result.skipReasons && Object.keys(result.skipReasons).length > 0 && (
 <p style={{ color: "#a1a1aa", fontSize: 12 }}>
 {Object.entries(result.skipReasons).map(([k, v]) => `${k}: ${v}`).join(" · ")}
 </p>
 )}
 </div>
 ) : (
 <p style={{ color: "#dc2626", fontSize: 13 }}>{result.error}</p>
 ))}
 {ordersResult && (ordersResult.success ? (
 <p style={{ fontSize: 13, color: "#15803d" }}>
 {ordersResult.saved} new orders saved
 {(ordersResult.duplicates ?? 0) > 0 ? ` · ${ordersResult.duplicates} already tracked` : ""}
 {` (${ordersResult.ordersFound} found in last 7 days)`}
 </p>
 ) : (
 <p style={{ color: "#dc2626", fontSize: 13 }}>{ordersResult.error}</p>
 ))}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Wix Stores */}
 {WIX_STORES.length > 0 && (
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Wix Stores</h2>
 {WIX_STORES.map((store) => {
 const status = statuses[store.slug];
 const isLoading = status?.loading;
 const result = status?.result;

 return (
 <div key={store.slug} style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 12 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b" }}>{store.name}</h3>
 <span style={{ fontSize: 11, padding: "2px 8px", background: "#fae8ff", color: "#7e22ce", borderRadius: 99, fontWeight: 500 }}>Wix</span>
 </div>
 <p style={{ fontSize: 12, color: "#71717a" }}>Site ID: {store.siteId}</p>
 </div>
 <button
 onClick={() => handleSync(store)}
 disabled={isLoading}
 style={{ padding: "7px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {isLoading ? "Syncing..." : "Sync"}
 </button>
 </div>
 {result && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e4e4e7" }}>
 {result.success ? (
 <div style={{ fontSize: 13 }}>
 <p style={{ color: "#15803d" }}>
 {result.inserted != null
 ? `${result.inserted} new · ${result.updated ?? 0} updated`
 : `${result.productCount} products synced`}
 </p>
 {result.skippedCount !== undefined && result.skippedCount > 0 && (
 <p style={{ color: "#71717a", marginTop: 4 }}>{result.skippedCount} skipped (sold out)</p>
 )}
 </div>
 ) : (
 <p style={{ color: "#dc2626", fontSize: 13 }}>
 {result.error}
 {result.details && (
 <span style={{ display: "block", color: "#71717a", marginTop: 4 }}>{result.details}</span>
 )}
 </p>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Shopify Stores */}
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Shopify Stores</h2>
 {SHOPIFY_STORES.length > 0 ? (
 SHOPIFY_STORES.map((store) => {
 const status = statuses[store.slug];
 const isLoading = status?.loading;
 const result = status?.result;

 return (
 <div
 key={store.slug}
 style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20, marginBottom: 12 }}
 >
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b" }}>{store.name}</h3>
 <span style={{ fontSize: 11, padding: "2px 8px", background: "#dcfce7", color: "#15803d", borderRadius: 99, fontWeight: 500 }}>Shopify</span>
 </div>
 <p style={{ fontSize: 12, color: "#71717a", wordBreak: "break-all" }}>
 {store.storeDomain}
 </p>
 </div>
 <button
 onClick={() => handleSync(store)}
 disabled={isLoading}
 style={{ padding: "7px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: isLoading ? "not-allowed" : "pointer", opacity: isLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {isLoading ? "Syncing..." : "Sync"}
 </button>
 </div>
 {result && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e4e4e7" }}>
 {result.success ? (
 <div style={{ fontSize: 13 }}>
 <p style={{ color: "#15803d" }}>
 {result.inserted != null
 ? `${result.inserted} new · ${result.updated ?? 0} updated`
 : `${result.productCount} products synced`}
 </p>
 {result.skippedCount !== undefined && result.skippedCount > 0 && (
 <p style={{ color: "#71717a", marginTop: 4 }}>{result.skippedCount} skipped (sold out)</p>
 )}
 {result.shopName && (
 <p style={{ color: "#71717a", marginTop: 4 }}>from {result.shopName}</p>
 )}
 </div>
 ) : (
 <p style={{ color: "#dc2626", fontSize: 13 }}>
 {result.error}
 {result.details && (
 <span style={{ display: "block", color: "#71717a", marginTop: 4 }}>{result.details}</span>
 )}
 </p>
 )}
 </div>
 )}
 </div>
 );
 })
 ) : (
 <div style={{ background: "#fff", border: "1px dashed #e4e4e7", borderRadius: 8, padding: "32px 24px", textAlign: "center" }}>
 <p style={{ color: "#71717a", marginBottom: 8 }}>No Shopify stores configured yet.</p>
 <p style={{ fontSize: 12, color: "#a1a1aa" }}>
 Add stores in <code style={{ background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 4px", fontSize: 11 }}>app/admin/sync/page.tsx</code>
 </p>
 </div>
 )}
 </div>

 {/* Carroll Street Vintage: Stripe Orders */}
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Stripe Stores</h2>
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 20 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b" }}>Carroll Street Vintage</h3>
 <span style={{ fontSize: 11, padding: "2px 8px", background: "#ede9fe", color: "#6d28d9", borderRadius: 99, fontWeight: 500 }}>Stripe</span>
 </div>
 <p style={{ fontSize: 12, color: "#71717a" }}>Syncs last 30 days of Stripe charges → conversions</p>
 </div>
 <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
 <button
 onClick={handleSyncCarrollProducts}
 disabled={carrollProductsLoading}
 style={{ padding: "7px 18px", background: "#fff", color: "#18181b", border: "1px solid #e4e4e7", borderRadius: 6, cursor: carrollProductsLoading ? "not-allowed" : "pointer", opacity: carrollProductsLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {carrollProductsLoading ? "Syncing..." : "Sync Products"}
 </button>
 <button
 onClick={handleSyncCarrollStripe}
 disabled={carrollStripeLoading}
 style={{ padding: "7px 18px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, cursor: carrollStripeLoading ? "not-allowed" : "pointer", opacity: carrollStripeLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {carrollStripeLoading ? "Syncing..." : "Sync Orders"}
 </button>
 </div>
 </div>
 {(carrollStripeResult || carrollProductsResult) && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e4e4e7", display: "flex", flexDirection: "column", gap: 6 }}>
 {carrollProductsResult && (carrollProductsResult.error ? (
 <p style={{ fontSize: 13, color: "#dc2626" }}>{carrollProductsResult.error}</p>
 ) : (
 <p style={{ fontSize: 13, color: "#15803d" }}>{carrollProductsResult.productCount} products synced ({carrollProductsResult.total} found in Stripe)</p>
 ))}
 {carrollStripeResult && (carrollStripeResult.error ? (
 <p style={{ fontSize: 13, color: "#dc2626" }}>{carrollStripeResult.error}</p>
 ) : (
 <p style={{ fontSize: 13, color: "#15803d" }}>
 {carrollStripeResult.saved} new conversions saved
 {(carrollStripeResult.skipped ?? 0) > 0 ? ` · ${carrollStripeResult.skipped} already tracked` : ""}
 {` (${carrollStripeResult.totalCharges} charges found)`}
 {carrollStripeResult.errors ? ` · ${carrollStripeResult.errors} errors` : ""}
 </p>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Purge Removed Stores */}
 <div style={{ marginBottom: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 16 }}>Purge Removed Stores</h2>
 <div style={{ background: "#fff", border: "1px solid #fca5a5", borderRadius: 8, padding: 20 }}>
 <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
 <div>
 <h3 style={{ fontSize: 14, fontWeight: 600, color: "#09090b", marginBottom: 2 }}>Velvet Archive</h3>
 <p style={{ fontSize: 12, color: "#71717a" }}>Removed from VIA. Purge remaining products from the database</p>
 </div>
 <button
 onClick={() => handlePurge("velvet-archive")}
 disabled={purgeLoading}
 style={{ padding: "7px 18px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: purgeLoading ? "not-allowed" : "pointer", opacity: purgeLoading ? 0.5 : 1, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}
 >
 {purgeLoading ? "Purging..." : "Purge Products"}
 </button>
 </div>
 {purgeResult && purgeResult.slug === "velvet-archive" && (
 <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #fee2e2" }}>
 {purgeResult.error ? (
 <p style={{ fontSize: 13, color: "#dc2626" }}>{purgeResult.error}</p>
 ) : (
 <p style={{ fontSize: 13, color: "#15803d" }}>{purgeResult.deleted ?? 0} products deleted.</p>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Help Section */}
 <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, padding: 24, marginTop: 32 }}>
 <h2 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a1a1aa", fontWeight: 500, marginBottom: 20 }}>Setup Guide</h2>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
 <div>
 <h3 style={{ fontSize: 13, fontWeight: 600, color: "#09090b", marginBottom: 12 }}>Squarespace Setup</h3>
 <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6 }}>
 <p>
 <span style={{ color: "#09090b", fontWeight: 500 }}>Shop URL (recommended):</span>{" "}
 <code style={{ fontSize: 11, background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 4px" }}>/shop</code>
 </p>
 <p style={{ marginTop: 8 }}>
 <span style={{ color: "#09090b", fontWeight: 500 }}>RSS fallback:</span>{" "}
 <code style={{ fontSize: 11, background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 4px" }}>/shop?format=rss</code>
 </p>
 <p style={{ marginTop: 12, color: "#71717a" }}>
 Use the shop URL for stores with Squarespace Commerce (includes prices).
 RSS is a fallback for stores with prices in descriptions.
 </p>
 </div>
 </div>

 <div>
 <h3 style={{ fontSize: 13, fontWeight: 600, color: "#09090b", marginBottom: 12 }}>Shopify Collabs Setup</h3>
 <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6 }}>
 <p style={{ color: "#09090b", fontWeight: 600 }}>What to tell the store owner:</p>
 <ol style={{ paddingLeft: 16, marginTop: 8, color: "#71717a" }}>
 <li>Install the Shopify Collabs app from the Shopify App Store (free)</li>
 <li style={{ marginTop: 4 }}>In Shopify Admin, go to Apps → Collabs → set up a Program with commission rates</li>
 <li style={{ marginTop: 4 }}>Go to Recruiting → Invite Creator</li>
 <li style={{ marginTop: 4 }}>Enter your email address</li>
 <li style={{ marginTop: 4 }}>Attach the program offer to the invite and hit Send</li>
 </ol>
 <p style={{ color: "#09090b", fontWeight: 600, marginTop: 16 }}>After you get the invite:</p>
 <ol style={{ paddingLeft: 16, marginTop: 8, color: "#71717a" }}>
 <li>Accept the invite from your email or at <code style={{ fontSize: 11, background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 4px" }}>collabs.shopify.com</code></li>
 <li style={{ marginTop: 4 }}>Grab your unique affiliate link from the Collabs dashboard</li>
 <li style={{ marginTop: 4 }}>Ask the store owner for their Storefront Access Token (see Storefront API steps) so VYA can sync their products</li>
 </ol>
 <p style={{ marginTop: 12, fontSize: 11, color: "#a1a1aa" }}>
 Invites expire after 30 days. The brand only needs your email to invite you.
 </p>
 </div>
 </div>

 <div>
 <h3 style={{ fontSize: 13, fontWeight: 600, color: "#09090b", marginBottom: 12 }}>Shopify Storefront API</h3>
 <div style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6 }}>
 <p>To sync products, get the store&apos;s Storefront Access Token:</p>
 <ol style={{ paddingLeft: 16, marginTop: 8, color: "#71717a" }}>
 <li>Go to Shopify Admin → Settings</li>
 <li style={{ marginTop: 4 }}>Click &quot;Apps and sales channels&quot;</li>
 <li style={{ marginTop: 4 }}>Click &quot;Develop apps&quot; → Create an app</li>
 <li style={{ marginTop: 4 }}>Configure Storefront API scopes</li>
 <li style={{ marginTop: 4 }}>Install the app and copy the token</li>
 </ol>
 <p style={{ marginTop: 12 }}>
 <span style={{ color: "#09090b", fontWeight: 500 }}>Required scopes:</span>{" "}
 <code style={{ fontSize: 11, background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "1px 4px", wordBreak: "break-all" }}>unauthenticated_read_product_listings</code>
 </p>
 </div>
 </div>
 </div>
 </div>
 </div>
 </main>
 );
}
