"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type QualityProduct = {
 id: number; storeSlug: string; storeName: string; title: string; url: string;
 noSizing: boolean; noDescription: boolean; noImage: boolean;
};
type StoreSummary = {
 storeSlug: string; storeName: string; total: number; flagged: number;
 noSizing: number; noDescription: number; noImage: number;
};
type Data = { stores: StoreSummary[]; products: QualityProduct[] };

type IssueKey = "all" | "noSizing" | "noDescription" | "noImage";
const ISSUE_LABELS: Record<Exclude<IssueKey, "all">, string> = {
 noSizing: "No size / measurements",
 noDescription: "No description",
 noImage: "No image",
};

function Flag({ on, label }: { on: boolean; label: string }) {
 if (!on) return null;
 return <span className="rounded bg-[#5D0F17]/[0.08] px-2 py-0.5 text-[11px] text-[#5D0F17]">{label}</span>;
}

export default function ListingQualityPage() {
 const router = useRouter();
 const [data, setData] = useState<Data | null>(null);
 const [loading, setLoading] = useState(true);
 const [store, setStore] = useState<string>("");
 const [issue, setIssue] = useState<IssueKey>("all");

 useEffect(() => {
 fetch("/api/admin/listing-quality")
 .then((r) => {
  if (r.status === 401) { router.replace("/admin/login?redirect=/admin/listing-quality"); return null; }
  return r.ok ? r.json() : null;
 })
 .then((d) => d && setData(d))
 .finally(() => setLoading(false));
 }, [router]);

 const products = useMemo(() => {
 if (!data) return [];
 return data.products
 .filter((p) => !store || p.storeSlug === store)
 .filter((p) => issue === "all" || p[issue])
 .slice(0, 400);
 }, [data, store, issue]);

 const totals = useMemo(() => {
 const s = data?.stores ?? [];
 return {
 total: s.reduce((a, x) => a + x.total, 0),
 flagged: s.reduce((a, x) => a + x.flagged, 0),
 noSizing: s.reduce((a, x) => a + x.noSizing, 0),
 noDescription: s.reduce((a, x) => a + x.noDescription, 0),
 noImage: s.reduce((a, x) => a + x.noImage, 0),
 };
 }, [data]);

 return (
 <main className="min-h-screen bg-[#FBF8F1] p-8 text-[#5D0F17]">
 <div className="mx-auto max-w-6xl">
 <h1 className="font-serif text-2xl">Listing Quality</h1>
 <p className="mt-1 text-sm text-[#5D0F17]/55">Products missing a size/measurements, description, or image, so they can be fixed.</p>

 {loading ? (
 <p className="mt-8 text-sm text-[#5D0F17]/50">Loading…</p>
 ) : !data ? (
 <p className="mt-8 text-sm text-[#5D0F17]/50">No data.</p>
 ) : (
 <>
 {/* Totals */}
 <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
  {[
  { label: "Flagged", value: `${totals.flagged.toLocaleString()} / ${totals.total.toLocaleString()}` },
  { label: "No size / measurements", value: totals.noSizing.toLocaleString() },
  { label: "No description", value: totals.noDescription.toLocaleString() },
  { label: "No image", value: totals.noImage.toLocaleString() },
  ].map((t) => (
  <div key={t.label} className="rounded-xl border border-[#5D0F17]/10 bg-white p-4">
   <p className="font-serif text-2xl">{t.value}</p>
   <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#5D0F17]/50">{t.label}</p>
  </div>
  ))}
 </div>

 {/* Filters */}
 <div className="mt-6 flex flex-wrap items-center gap-3">
  <select value={store} onChange={(e) => setStore(e.target.value)} className="rounded-lg border border-[#5D0F17]/15 bg-white px-3 py-2 text-sm">
  <option value="">All stores</option>
  {data.stores.map((s) => (
   <option key={s.storeSlug} value={s.storeSlug}>{s.storeName} ({s.flagged})</option>
  ))}
  </select>
  <div className="flex flex-wrap gap-1">
  {(["all", "noSizing", "noDescription", "noImage"] as IssueKey[]).map((k) => (
   <button key={k} onClick={() => setIssue(k)}
   className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${issue === k ? "bg-[#5D0F17] text-[#FFFDF8]" : "border border-[#5D0F17]/15 text-[#5D0F17]/60"}`}>
   {k === "all" ? "All issues" : ISSUE_LABELS[k]}
   </button>
  ))}
  </div>
 </div>

 {/* Per-store summary */}
 <div className="mt-6 overflow-hidden rounded-xl border border-[#5D0F17]/10 bg-white">
  <div className="overflow-x-auto">
  <table className="w-full text-sm">
   <thead>
   <tr className="border-b border-[#5D0F17]/[0.07] text-left text-[11px] uppercase tracking-[0.06em] text-[#5D0F17]/45">
    <th className="px-5 py-3 font-medium">Store</th>
    <th className="px-3 py-3 font-medium text-right">Flagged / total</th>
    <th className="px-3 py-3 font-medium text-right">Size / meas.</th>
    <th className="px-3 py-3 font-medium text-right">Description</th>
    <th className="px-5 py-3 font-medium text-right">Image</th>
   </tr>
   </thead>
   <tbody className="divide-y divide-[#5D0F17]/[0.05]">
   {data.stores.map((s) => (
    <tr key={s.storeSlug} className="cursor-pointer hover:bg-[#5D0F17]/[0.03]" onClick={() => setStore(s.storeSlug)}>
    <td className="px-5 py-3">{s.storeName}</td>
    <td className="px-3 py-3 text-right">{s.flagged} / {s.total}</td>
    <td className="px-3 py-3 text-right">{s.noSizing || "-"}</td>
    <td className="px-3 py-3 text-right">{s.noDescription || "-"}</td>
    <td className="px-5 py-3 text-right">{s.noImage || "-"}</td>
    </tr>
   ))}
   </tbody>
  </table>
  </div>
 </div>

 {/* Flagged products */}
 <h2 className="mt-8 font-serif text-lg">Products ({products.length}{products.length === 400 ? "+" : ""})</h2>
 <div className="mt-3 overflow-hidden rounded-xl border border-[#5D0F17]/10 bg-white">
  <div className="divide-y divide-[#5D0F17]/[0.05]">
  {products.length === 0 ? (
   <p className="px-5 py-8 text-center text-sm text-[#5D0F17]/45">Nothing flagged for this filter. 🎉</p>
  ) : products.map((p) => (
   <a key={`${p.storeSlug}-${p.id}`} href={p.url} target="_blank" rel="noopener noreferrer"
    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-[#5D0F17]/[0.03]">
   <span className="min-w-0">
    <span className="block truncate text-sm text-[#5D0F17]">{p.title}</span>
    <span className="text-[11px] text-[#5D0F17]/45">{p.storeName}</span>
   </span>
   <span className="flex shrink-0 flex-wrap justify-end gap-1">
    <Flag on={p.noSizing} label="size / measurements" />
    <Flag on={p.noDescription} label="description" />
    <Flag on={p.noImage} label="image" />
   </span>
   </a>
  ))}
  </div>
 </div>
 </>
 )}
 </div>
 </main>
 );
}
