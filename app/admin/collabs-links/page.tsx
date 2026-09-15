"use client";

import { useState, useEffect } from "react";

type StoreCount = Record<string, number>;

type GenerateResult = {
 success?: boolean;
 saved?: number;
 created?: number;
 failed?: number;
 skipped?: number;
 rateLimitSkipped?: number;
 skippedProducts?: { title: string; store: string; shopifyId: string }[];
 errors?: { id: number; title: string; error: string }[];
 error?: string;
};

export default function CollabsLinksPage() {
 const [cookie, setCookie] = useState("");
 const [csrfToken, setCsrfToken] = useState("");
 const [storeSlug, setStoreSlug] = useState("");
 const [loading, setLoading] = useState(false);
 const [purging, setPurging] = useState(false);
 const [purgeResult, setPurgeResult] = useState<{ deleted: number } | null>(null);
 const [checking, setChecking] = useState(true);
 const [missing, setMissing] = useState<{
 total: number;
 byStore: StoreCount;
 stuckByStore?: Record<string, Array<{ title: string; daysOld: number | null; firstSeen: string }>>;
 collabsStores: string[];
 sampleLinks?: { id: number; title: string; storeSlug: string; collabsLink: string; compositeId: string }[];
 redirectInfo?: { collabsLink: string; redirectsTo: string } | null;
 debug?: { dbStoreCounts: Record<string, number>; collabsStoreSlugsList: string[]; shopifyIdCoverage?: Record<string, { total: number; withId: number; withoutId: number; withCollabsLink: number }> };
 } | null>(null);
 const [result, setResult] = useState<GenerateResult | null>(null);
 const [progress, setProgress] = useState<{
 saved: number;
 created: number;
 failed: number;
 product?: string;
 store?: string;
 } | null>(null);
 const [statusMessage, setStatusMessage] = useState("");
 const [log, setLog] = useState<string[]>([]);

 async function checkMissing() {
 setChecking(true);
 try {
 const res = await fetch("/api/admin/generate-collabs-links");
 if (res.ok) {
 const data = await res.json();
 setMissing(data);
 }
 } catch {
 // ignore
 }
 setChecking(false);
 }

 useEffect(() => {
 checkMissing();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 async function handlePurge(minDaysStuck?: number) {
 const label = minDaysStuck
 ? `Delete all products stuck without a collabs link for ${minDaysStuck}+ days? These are likely sold-out items that Collabs excludes. They'll be re-added automatically when the store re-lists them.`
 : "Delete all pre-Collabs stuck products from the DB? They'll be re-added automatically once the store enrolls them in Collabs.";
 if (!confirm(label)) return;
 setPurging(true);
 setPurgeResult(null);
 try {
 const url = minDaysStuck
 ? `/api/admin/generate-collabs-links?minDaysStuck=${minDaysStuck}`
 : "/api/admin/generate-collabs-links";
 const res = await fetch(url, { method: "DELETE" });
 if (res.ok) {
 const data = await res.json();
 setPurgeResult(data);
 await checkMissing();
 }
 } catch {
 // ignore
 }
 setPurging(false);
 }

 async function handleGenerate() {
 if (!cookie.trim() || !csrfToken.trim()) {
 setResult({
 error: "Both the Cookie and CSRF Token fields are required.",
 });
 return;
 }

 setLoading(true);
 setResult(null);
 setProgress(null);
 setLog([]);

 try {
 const body: Record<string, string> = {
 cookie: cookie.trim(),
 csrfToken: csrfToken.trim(),
 };
 if (storeSlug) body.storeSlug = storeSlug;

 const res = await fetch("/api/admin/generate-collabs-links", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(body),
 });

 if (!res.ok) {
 const data = await res.json();
 setResult({ error: data.error || "Request failed" });
 setLoading(false);
 return;
 }

 // Read streaming response
 const reader = res.body?.getReader();
 const decoder = new TextDecoder();
 let buffer = "";

 if (reader) {
 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split("\n");
 buffer = lines.pop() || "";

 for (const line of lines) {
 if (!line.trim()) continue;
 try {
 const data = JSON.parse(line);
 if (data.type === "start") {
 setLog((prev) => [...prev, `Starting: ${data.stores} stores, ${data.missingInDb} products missing in DB`]);
 } else if (data.type === "store") {
 setStatusMessage(`Fetching products from ${data.store}...`);
 setLog((prev) => [...prev, `--- ${data.store} ---`]);
 } else if (data.type === "fetch_error") {
 setStatusMessage(`${data.store} ERROR: ${data.error}`);
 setLog((prev) => [...prev, `ERROR fetching ${data.store}: ${data.error}`]);
 } else if (data.type === "store_products") {
 const totalInfo = data.totalCount !== null ? ` (API says ${data.totalCount} total)` : "";
 const mismatchWarn = data.paginationMismatch ? ` ⚠ PAGINATION MISMATCH, only fetched ${data.count} of ${data.totalCount}` : "";
 const msg = `${data.store}: fetched ${data.count} products from Collabs${totalInfo}${mismatchWarn}`;
 setStatusMessage(msg);
 setLog((prev) => [
 ...prev,
 msg,
 ...(data.debug ? [
 ` Missing in DB: ${data.debug.missingCount} | Found in Collabs: ${data.debug.foundInCollabs}`,
 ` Collabs sample IDs: ${JSON.stringify(data.debug.collabsSampleIds)}`,
 ` DB sample IDs: ${JSON.stringify(data.debug.dbSampleIds)}`,
 ] : []),
 ]);
 } else if (data.type === "progress") {
 setProgress({
 saved: data.saved,
 created: data.created,
 failed: data.failed,
 product: data.product,
 store: data.store,
 });
 } else if (data.type === "rate_limit") {
 setLog((prev) => [...prev, `RATE LIMITED: ${data.message}`]);
 } else if (data.type === "error") {
 setLog((prev) => [...prev, `FAILED: ${data.product} (${data.store}): ${data.error}`]);
 } else if (data.type === "done") {
 setResult(data);
 setProgress(null);
 setStatusMessage("");
 setLog((prev) => [...prev, `Done: saved=${data.saved} created=${data.created} failed=${data.failed} skipped=${data.skipped}`]);
 checkMissing();
 }
 } catch {
 // skip malformed lines
 }
 }
 }
 }
 } catch (error) {
 setResult({
 error: error instanceof Error ? error.message : "Request failed",
 });
 }

 setLoading(false);
 }

 const selectedCount = storeSlug
 ? missing?.byStore[storeSlug] || 0
 : missing?.total || 0;

 return (
 <main style={{ background: "#f8f9fa", minHeight: "100vh" }}>

 {/* Page title */}
 <section style={{ background: "#fff", borderBottom: "1px solid #e4e4e7" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px" }}>
 <h1 style={{ fontSize: 20, fontWeight: 600, color: "#09090b", marginBottom: 8 }}>
 Collabs Links
 </h1>
 <p style={{ fontSize: 15, color: "#71717a" }}>
 Generate per-product affiliate links from Shopify Collabs. These links handle tracking and attribution automatically.
 </p>
 </div>
 </section>

 {/* Stats */}
 <section style={{ borderBottom: "1px solid #e4e4e7", background: "#fff", marginTop: 24 }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px" }}>
 {checking ? (
 <p className="text-sm text-neutral-500">Checking products...</p>
 ) : missing ? (
 <div>
 <div className="flex items-baseline gap-3 mb-4">
 <span style={{ fontSize: 36, fontWeight: 700, color: "#09090b" }}>
 {missing.total}
 </span>
 <span style={{ fontSize: 14, color: "#71717a" }}>
 products missing collabs links
 </span>
 </div>
 {missing.total > 0 && (
 <div className="flex flex-wrap gap-3">
 {Object.entries(missing.byStore).map(([slug, count]) => (
 <div
 key={slug}
 style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
 >
 <span style={{ color: "#09090b", fontWeight: 500 }}>{slug}</span>
 <span style={{ color: "#71717a", marginLeft: 8 }}>{count}</span>
 </div>
 ))}
 </div>
 )}
 {missing.total === 0 && (
 <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#15803d" }}>
 All products have collabs links. Nothing to generate.
 </div>
 )}
 {missing.stuckByStore && Object.keys(missing.stuckByStore).length > 0 && (
 <details className="mt-4">
 <summary className="text-xs text-neutral-400 cursor-pointer hover:text-black">
 Show stuck products ({missing.total} total, not in Collabs catalog)
 </summary>
 <div className="mt-3 mb-2 flex flex-wrap items-center gap-3">
 <button
 onClick={() => handlePurge(14)}
 disabled={purging}
 style={{ fontSize: 12, padding: "6px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500, opacity: purging ? 0.5 : 1 }}
 >
 {purging ? "Purging…" : "Purge sold-out stuck products (14+ days)"}
 </button>
 <button
 onClick={() => handlePurge()}
 disabled={purging}
 style={{ fontSize: 12, padding: "6px 12px", background: "#fff", color: "#09090b", border: "1px solid #e4e4e7", borderRadius: 6, cursor: "pointer", fontWeight: 500, opacity: purging ? 0.5 : 1 }}
 >
 {purging ? "Purging…" : "Purge pre-Collabs only"}
 </button>
 {purgeResult && (
 <span style={{ fontSize: 12, color: "#71717a" }}>{purgeResult.deleted} products deleted</span>
 )}
 </div>
 <p className="text-xs text-neutral-400 mb-2">Red button: removes all stuck products 14+ days old (sold-out items Collabs excludes. Re-added automatically when relisted). Grey: only removes pre-Collabs era products.</p>
 <div className="mt-3 space-y-4">
 {Object.entries(missing.stuckByStore).map(([slug, prods]) => (
 <div key={slug}>
 <p className="text-xs font-medium text-black mb-1">{slug} ({prods.length})</p>
 <div className="space-y-0.5">
 {prods.map((p, i) => (
 <div key={i} className="flex gap-3 text-xs font-mono text-neutral-600">
 <span className={`flex-shrink-0 w-24 ${p.daysOld !== null && p.daysOld >= 7 ? "text-red-500 font-medium" : p.firstSeen === "pre-collabs" ? "text-orange-500" : "text-neutral-400"}`}>
 {p.daysOld !== null ? `${p.daysOld}d` : p.firstSeen}
 </span>
 <span className="truncate">{p.title}</span>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 </details>
 )}
 {missing.debug && (
 <details className="mt-4">
 <summary className="text-xs text-neutral-400 cursor-pointer hover:text-black">DB debug</summary>
 <div className="mt-2 text-xs font-mono space-y-1 text-neutral-600">
 <p className="font-medium text-black">All stores in DB:</p>
 {Object.entries(missing.debug.dbStoreCounts).map(([slug, count]) => (
 <div key={slug} className={`flex gap-3 ${missing.debug!.collabsStoreSlugsList.includes(slug) ? "text-black" : "text-neutral-400"}`}>
 <span>{slug}</span>
 <span>{count} products</span>
 {!missing.debug!.collabsStoreSlugsList.includes(slug) && <span className="text-red-400">(not in collabs list)</span>}
 </div>
 ))}
 {missing.debug.collabsStoreSlugsList
 .filter(slug => !missing.debug!.dbStoreCounts[slug])
 .map(slug => (
 <div key={slug} className="flex gap-3 text-red-500">
 <span>{slug}</span>
 <span>0 products in DB</span>
 </div>
 ))}
 {missing.debug.shopifyIdCoverage && (
 <>
 <p className="font-medium text-black mt-3">Shopify ID coverage (collabs stores):</p>
 {missing.debug.collabsStoreSlugsList.map(slug => {
 const cov = missing.debug!.shopifyIdCoverage?.[slug];
 if (!cov) return (
 <div key={slug} className="flex gap-3 text-red-500">
 <span>{slug}</span>
 <span>not in DB</span>
 </div>
 );
 const allHaveId = cov.withoutId === 0 && cov.total > 0;
 return (
 <div key={slug} className={`flex gap-3 ${allHaveId ? "text-green-600" : "text-red-500"}`}>
 <span>{slug}</span>
 <span>{cov.withId}/{cov.total} have shopify_id</span>
 {cov.withCollabsLink > 0 && <span className="text-neutral-400">({cov.withCollabsLink} have collabs link)</span>}
 {cov.withoutId > 0 && <span className="text-red-400">⚠ {cov.withoutId} missing ID: re-sync needed</span>}
 </div>
 );
 })}
 </>
 )}
 </div>
 </details>
 )}
 </div>
 ) : null}
 </div>
 </section>

 {/* Verify Links */}
 {missing?.sampleLinks && missing.sampleLinks.length > 0 && (
 <section style={{ borderBottom: "1px solid #e4e4e7" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px" }}>
 <h2 style={{ fontSize: 16, fontWeight: 600, color: "#09090b", marginBottom: 16 }}>Verify Links</h2>

 {missing.redirectInfo && (
 <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: 16, fontSize: 12, fontFamily: "monospace", marginBottom: 16 }}>
 <p style={{ color: "#71717a", marginBottom: 4 }}>collabs.shop redirects to:</p>
 <p style={{ color: "#09090b", wordBreak: "break-all" }}>{missing.redirectInfo.redirectsTo}</p>
 </div>
 )}

 <div className="space-y-2">
 {missing.sampleLinks.map((p) => (
 <div key={p.id} className="flex items-center gap-3 text-sm">
 <span style={{ color: "#a1a1aa", fontSize: 12, width: 112, flexShrink: 0 }}>{p.storeSlug}</span>
 <span style={{ color: "#09090b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.title}</span>
 <a
 href={p.collabsLink}
 target="_blank"
 rel="noopener noreferrer"
 className="text-blue-600 hover:underline text-xs flex-shrink-0"
 >
 collabs.shop
 </a>
 <a
 href={`/api/track?pid=${p.compositeId}&pn=${encodeURIComponent(p.title)}&s=test&ss=${p.storeSlug}&url=https://example.com`}
 target="_blank"
 rel="noopener noreferrer"
 className="text-blue-600 hover:underline text-xs flex-shrink-0"
 >
 test track
 </a>
 </div>
 ))}
 </div>
 </div>
 </section>
 )}

 {/* Generate Form */}
 {missing && missing.total > 0 && (
 <section style={{ borderBottom: "1px solid #e4e4e7", padding: "24px 0" }}>
 <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
 <h2 style={{ fontSize: 18, fontWeight: 600, color: "#09090b", marginBottom: 24 }}>
 Generate Links
 </h2>

 <div className="space-y-6 max-w-2xl">
 {/* Instructions */}
 <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: 16, fontSize: 14 }}>
 <p style={{ fontWeight: 500, color: "#09090b", marginBottom: 12 }}>
 How to get the credentials:
 </p>
 <ol className="list-decimal list-inside space-y-2" style={{ color: "#71717a" }}>
 <li>
 Go to{" "}
 <a
 href="https://collabs.shopify.com/collabs"
 target="_blank"
 rel="noopener noreferrer"
 className="underline"
 >
 collabs.shopify.com/collabs
 </a>
 </li>
 <li>
 Open DevTools (Cmd+Option+I) &rarr;{" "}
 <strong>Network</strong> tab
 </li>
 <li>Click on any store to trigger a request</li>
 <li>
 Click on any request to{" "}
 <strong>collabs.shopify.com</strong>
 </li>
 <li>
 In the <strong>Request Headers</strong>, copy the full{" "}
 <strong>Cookie</strong> value
 </li>
 <li>
 In the same headers, copy the{" "}
 <strong>X-Csrf-Token</strong> value
 </li>
 </ol>
 </div>

 {/* Cookie input */}
 <div>
 <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#09090b", marginBottom: 6 }}>
 Cookie
 </label>
 <textarea
 value={cookie}
 onChange={(e) => setCookie(e.target.value)}
 placeholder="Paste the full Cookie header value from DevTools..."
 rows={3}
 style={{ width: "100%", border: "1px solid #e4e4e7", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#09090b", fontFamily: "monospace", resize: "vertical", outline: "none" }}
 />
 </div>

 {/* CSRF Token input */}
 <div>
 <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#09090b", marginBottom: 6 }}>
 X-Csrf-Token
 </label>
 <input
 type="text"
 value={csrfToken}
 onChange={(e) => setCsrfToken(e.target.value)}
 placeholder="Paste the X-Csrf-Token header value..."
 style={{ width: "100%", border: "1px solid #e4e4e7", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#09090b", fontFamily: "monospace", outline: "none" }}
 />
 </div>

 {/* Optional store filter */}
 <div>
 <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#09090b", marginBottom: 6 }}>
 Store{" "}
 <span style={{ color: "#a1a1aa", fontWeight: 400 }}>
 (optional: leave blank for all stores)
 </span>
 </label>
 <select
 value={storeSlug}
 onChange={(e) => setStoreSlug(e.target.value)}
 style={{ width: "100%", border: "1px solid #e4e4e7", borderRadius: 6, padding: "10px 12px", fontSize: 13, color: "#09090b", background: "#fff", outline: "none" }}
 >
 <option value="">All stores</option>
 {missing.collabsStores.map((slug) => (
 <option key={slug} value={slug}>
 {slug} ({missing.byStore[slug] || 0} missing)
 </option>
 ))}
 </select>
 </div>

 {/* Generate button */}
 <button
 onClick={handleGenerate}
 disabled={loading}
 style={{ padding: "10px 24px", background: "#18181b", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
 >
 {loading
 ? "Generating..."
 : `Generate Links (${selectedCount} products)`}
 </button>

 {/* Status message */}
 {statusMessage && (
 <p style={{ fontSize: 13, color: "#71717a" }}>{statusMessage}</p>
 )}

 {/* Debug log */}
 {log.length > 0 && (
 <div className="bg-neutral-900 text-green-400 p-4 text-xs font-mono max-h-[300px] overflow-y-auto whitespace-pre-wrap">
 {log.map((entry, i) => (
 <div key={i}>{entry}</div>
 ))}
 </div>
 )}

 {/* Live progress */}
 {progress && (
 <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 16, fontSize: 13 }}>
 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
 <span style={{ color: "#71717a" }}>
 {progress.saved} saved
 {progress.created > 0 && (
 <span style={{ color: "#a1a1aa", marginLeft: 4 }}>
 ({progress.created} newly created)
 </span>
 )}
 </span>
 {progress.failed > 0 && (
 <span style={{ color: "#dc2626" }}>
 {progress.failed} failed
 </span>
 )}
 </div>
 {progress.product && (
 <p style={{ color: "#a1a1aa", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
 {progress.store}: {progress.product}
 </p>
 )}
 </div>
 )}

 {/* Final result */}
 {result && (
 <div
 style={{
 border: `1px solid ${result.error ? "#fecaca" : result.success ? "#bbf7d0" : "#fef08a"}`,
 borderRadius: 8,
 padding: 16,
 fontSize: 13,
 background: result.error ? "#fef2f2" : result.success ? "#f0fdf4" : "#fefce8",
 }}
 >
 {result.error ? (
 <p style={{ color: "#991b1b" }}>{result.error}</p>
 ) : (
 <div className="space-y-3">
 <p style={{ color: result.success ? "#15803d" : "#854d0e" }}>
 Saved <strong>{result.saved}</strong> collabs links
 {result.created
 ? ` (${result.created} newly created)`
 : ""}
 {result.rateLimitSkipped
 ? `: ${result.rateLimitSkipped} need links (run again tomorrow)`
 : ""}
 {result.failed
 ? `: ${result.failed} failed`
 : ""}
 </p>
 {result.skippedProducts && result.skippedProducts.length > 0 && (
 <details className="mt-2">
 <summary className="cursor-pointer text-amber-700 font-medium">
 {result.skippedProducts.length} Collabs products not found in VYA DB. Re-sync these stores
 </summary>
 <p className="text-xs text-neutral-500 mt-2 mb-2">
 These products exist in Collabs but VYA doesn&apos;t have their Shopify ID. Go to Admin → Inventory Sync and re-sync these stores, then run this again.
 </p>
 {(() => {
 const byStore: Record<string, typeof result.skippedProducts> = {};
 for (const p of result.skippedProducts!) {
 if (!byStore[p.store]) byStore[p.store] = [];
 byStore[p.store]!.push(p);
 }
 return Object.entries(byStore).map(([slug, prods]) => (
 <div key={slug} className="mt-2">
 <p className="text-xs font-medium text-black mb-1">{slug} ({prods.length})</p>
 <div className="space-y-0.5">
 {prods.map((p, i) => (
 <div key={i} className="flex gap-3 text-xs font-mono text-neutral-500">
 <span style={{ background: "#f4f4f5", color: "#09090b", borderRadius: 4, padding: "0 4px" }} className="flex-shrink-0">{p.shopifyId}</span>
 <span className="truncate">{p.title}</span>
 </div>
 ))}
 </div>
 </div>
 ));
 })()}
 </details>
 )}
 {result.errors && result.errors.length > 0 && (
 <div className="mt-3 space-y-1">
 <p className="font-medium text-red-800">
 Failed products:
 </p>
 <div className="max-h-[200px] overflow-y-auto">
 {result.errors.map((e) => (
 <p key={e.id} className="text-red-700">
 #{e.id} {e.title}: {e.error}
 </p>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 </section>
 )}

 </main>
 );
}
