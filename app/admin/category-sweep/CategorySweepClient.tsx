"use client";

import { useState, useEffect, useCallback } from "react";

type StoreOpt = { slug: string; name: string };
type Correction = { id: number; title: string; url: string; from: string; to: string };
type Override = { storeSlug: string; productId: number; family: string; source: string; note: string | null; updatedAt: string };

const FAMILIES = ["clothing", "bags", "shoes", "accessories", "home"];

export default function CategorySweepClient({ stores }: { stores: StoreOpt[] }) {
 const [scope, setScope] = useState(""); // "" = whole site
 const [dryRun, setDryRun] = useState(true);
 const [thorough, setThorough] = useState(false);
 const [running, setRunning] = useState(false);
 const [progress, setProgress] = useState<{ scanned: number; checked: number; corrected: number; written: number } | null>(null);
 const [corrections, setCorrections] = useState<Correction[]>([]);
 const [overrides, setOverrides] = useState<Override[]>([]);
 const [msg, setMsg] = useState<string | null>(null);

 const storeName = (slug: string) => stores.find((s) => s.slug === slug)?.name ?? slug;

 const loadOverrides = useCallback(async () => {
 const res = await fetch("/api/admin/category-sweep");
 if (res.ok) setOverrides((await res.json()).overrides ?? []);
 }, []);
 useEffect(() => { loadOverrides(); }, [loadOverrides]);

 async function run() {
 setRunning(true);
 setMsg(null);
 setCorrections([]);
 const totals = { scanned: 0, checked: 0, corrected: 0, written: 0 };
 setProgress({ ...totals });
 let offset = 0;
 try {
 // Loop batches until the endpoint reports no more rows.
 for (let guard = 0; guard < 200; guard++) {
  const q = new URLSearchParams({ offset: String(offset), limit: "150" });
  if (scope) q.set("store", scope);
  if (dryRun) q.set("dryRun", "1");
  if (thorough) q.set("strict", "0");
  const res = await fetch(`/api/admin/category-sweep?${q}`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) { setMsg(data.error ?? "Sweep failed."); break; }
  totals.scanned += data.scanned ?? 0;
  totals.checked += data.checked ?? 0;
  totals.corrected += data.corrected ?? 0;
  totals.written += data.written ?? 0;
  setProgress({ ...totals });
  if (Array.isArray(data.corrections) && data.corrections.length) {
  setCorrections((c) => [...c, ...data.corrections]);
  }
  if (data.nextOffset == null) break;
  offset = data.nextOffset;
 }
 setMsg(dryRun
  ? `Dry run complete: ${totals.corrected} miscategorized item(s) found across ${totals.scanned} scanned. Re-run with "apply" to fix them.`
  : `Sweep complete: ${totals.written} correction(s) applied across ${totals.scanned} scanned.`);
 await loadOverrides();
 } finally {
 setRunning(false);
 }
 }

 async function changeFamily(o: Override, family: string) {
 await fetch("/api/admin/category-sweep", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ storeSlug: o.storeSlug, productId: o.productId, family }),
 });
 await loadOverrides();
 }
 async function removeOverride(o: Override) {
 await fetch(`/api/admin/category-sweep?store=${encodeURIComponent(o.storeSlug)}&id=${o.productId}`, { method: "DELETE" });
 await loadOverrides();
 }

 const box = { border: "1px solid #e4e4e7", borderRadius: 12, padding: 18, marginTop: 24 } as const;

 return (
 <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px", fontFamily: "Arial, sans-serif", color: "#18181b" }}>
 <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Category sweep</h1>
 <p style={{ color: "#71717a", fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
 Uses AI vision to read each product photo and compares it to the title-based category.
 Cross-type mismatches (a bag filed under clothing, a wallet under jewelry) get a corrected
 category that both the storefront and the filters respect. Start with a <strong>dry run</strong> to preview.
 </p>

 <div style={box}>
 <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
 <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={running}
  style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #d4d4d8", fontSize: 14, minWidth: 220 }}>
  <option value="">Whole site</option>
  {stores.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
 </select>
 <label style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
  <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={running} />
  Dry run (preview only)
 </label>
 <label style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }} title="Skips the conservative second-pass check. Surfaces many more candidates to review.">
  <input type="checkbox" checked={thorough} onChange={(e) => setThorough(e.target.checked)} disabled={running} />
  Thorough (less strict)
 </label>
 <button onClick={run} disabled={running}
  style={{ padding: "9px 18px", borderRadius: 8, border: 0, background: "#18181b", color: "#fff", fontSize: 14, cursor: "pointer", opacity: running ? 0.5 : 1 }}>
  {running ? "Running…" : dryRun ? "Preview sweep" : "Run & apply"}
 </button>
 </div>
 {progress && (
 <p style={{ marginTop: 12, fontSize: 13, color: "#3f3f46" }}>
  Scanned <strong>{progress.scanned}</strong> · vision-checked <strong>{progress.checked}</strong> · mismatches <strong>{progress.corrected}</strong>
  {!dryRun && <> · applied <strong>{progress.written}</strong></>}
 </p>
 )}
 {msg && <p style={{ marginTop: 8, fontSize: 13, color: "#15803d" }}>{msg}</p>}
 </div>

 {corrections.length > 0 && (
 <div style={box}>
 <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>This run ({corrections.length})</h2>
 <div>
  {corrections.map((c) => (
  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f4f4f5", fontSize: 13 }}>
   <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</a>
   <span style={{ flexShrink: 0, color: "#71717a" }}>{c.from} → <strong style={{ color: "#18181b" }}>{c.to}</strong></span>
  </div>
  ))}
 </div>
 </div>
 )}

 <div style={box}>
 <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>Active overrides ({overrides.length})</h2>
 {overrides.length === 0 ? (
 <p style={{ color: "#a1a1aa", fontSize: 13, margin: 0 }}>No category overrides yet. Run the sweep to create them.</p>
 ) : (
 <div>
  {overrides.map((o) => (
  <div key={`${o.storeSlug}-${o.productId}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #f4f4f5", fontSize: 13 }}>
   <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
   <a href={`/products/${o.storeSlug}-${o.productId}`} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none" }}>
    {storeName(o.storeSlug)} #{o.productId}
   </a>
   {o.source === "manual" && <span style={{ color: "#a1a1aa" }}> · manual</span>}
   </span>
   <span style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>
   <select value={o.family} onChange={(e) => changeFamily(o, e.target.value)}
    style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d4d4d8", fontSize: 13 }}>
    {FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
   </select>
   <button onClick={() => removeOverride(o)}
    style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d4d4d8", background: "#fff", color: "#3f3f46", fontSize: 13, cursor: "pointer" }}>Remove</button>
   </span>
  </div>
  ))}
 </div>
 )}
 </div>
 </div>
 );
}
