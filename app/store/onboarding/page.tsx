"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Result = { pages: number; items: number; url: string };

export default function OnboardingPage() {
 const router = useRouter();
 const [ready, setReady] = useState(false);
 const [storeName, setStoreName] = useState("");
 const [url, setUrl] = useState("");
 const [busy, setBusy] = useState(false);
 const [err, setErr] = useState<string | null>(null);
 const [result, setResult] = useState<Result | null>(null);
 // The one-time fork: do they already have a site to bring over, or build from scratch?
 const [path, setPath] = useState<null | "import" | "build">(null);

 // Already set up? Skip straight to the dashboard.
 useEffect(() => {
 (async () => {
 try {
 const r = await fetch("/api/store/onboarding-status");
 if (r.ok) {
 const d = await r.json();
 setStoreName(d.storeName || "");
 if (d.onboarded) {
 router.replace("/store/dashboard");
 return;
 }
 }
 } catch {
 /* show onboarding anyway */
 }
 setReady(true);
 })();
 }, [router]);

 async function run() {
 if (!url.trim()) return;
 setBusy(true);
 setErr(null);
 try {
 const r = await fetch("/api/store/capture", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ url }),
 });
 const d = await r.json();
 if (!r.ok) setErr(d.error || "Couldn’t bring that site over.");
 else setResult({ pages: d.pages, items: d.items ?? 0, url: d.url });
 } catch {
 setErr("Couldn’t bring that site over.");
 }
 setBusy(false);
 }

 const input =
 "w-full bg-white border border-[#5D0F17]/15 px-3.5 py-3 text-sm text-[#5D0F17] outline-none focus:border-[#5D0F17]/50 transition";

 if (!ready) {
 return <div className="min-h-screen bg-[#FFFDF8] flex items-center justify-center text-[#5D0F17]/40 text-sm">Loading…</div>;
 }

 return (
 <main className="min-h-screen bg-[#FFFDF8] text-[#5D0F17] flex items-center">
 <div className="mx-auto w-full max-w-xl px-6 py-14">
 <p className="text-[10px] uppercase tracking-[0.25em] text-[#5D0F17]/45 mb-2">
 Welcome{storeName ? `, ${storeName}` : ""}
 </p>
 <h1 className="font-serif text-3xl sm:text-4xl mb-3">Let’s set up your store.</h1>
 <p className="text-sm text-[#5D0F17]/55 mb-8">
 {path === "import"
  ? "Paste your existing site and VYA hosts it — every page, exactly as it looks — then switches the backend to VYA commerce. One step, then you’re live."
  : "Two ways to start. Pick whichever fits — you can change everything later."}
 </p>

 {/* Step 1 — the one-time fork. Shown until they pick a path (and before a result). */}
 {!path && !result && (
 <div className="grid gap-4 sm:grid-cols-2">
  <button onClick={() => setPath("import")} className="text-left border border-[#5D0F17]/15 bg-white p-6 transition hover:border-[#5D0F17]/50 hover:shadow-[0_12px_40px_-24px_rgba(93,15,23,0.5)]">
  <p className="font-serif text-xl mb-1.5">I already have a website</p>
  <p className="text-sm text-[#5D0F17]/55">Bring your Shopify or Squarespace store over — every page, exactly as it looks. One-time import.</p>
  <span className="mt-4 inline-block text-xs uppercase tracking-[0.15em] text-[#5D0F17]">Bring it over →</span>
  </button>
  <button onClick={() => { setPath("build"); router.push("/admin/storefront"); }} className="text-left border border-[#5D0F17]/15 bg-white p-6 transition hover:border-[#5D0F17]/50 hover:shadow-[0_12px_40px_-24px_rgba(93,15,23,0.5)]">
  <p className="font-serif text-xl mb-1.5">I need to build one</p>
  <p className="text-sm text-[#5D0F17]/55">Start from a clean storefront and let VYA design it from your products — add and arrange sections yourself.</p>
  <span className="mt-4 inline-block text-xs uppercase tracking-[0.15em] text-[#5D0F17]">Build from scratch →</span>
  </button>
 </div>
 )}

 {!path && !result && (
 <div className="mt-8 text-xs text-[#5D0F17]/45">
  <button onClick={() => router.push("/store/dashboard")} className="underline hover:text-[#5D0F17]">Skip for now</button>
 </div>
 )}

 {result ? (
 <div className="border border-green-700/25 bg-green-700/5 p-6">
 <p className="font-serif text-xl text-green-800 mb-1">Your site is live on VYA.</p>
 <p className="text-sm text-[#5D0F17]/60"><b>{result.pages}</b> {result.pages === 1 ? "page" : "pages"} captured{result.items ? ` · ${result.items} ${result.items === 1 ? "product" : "products"} imported` : ""}.</p>
 <div className="mt-5 flex flex-wrap gap-3">
  <a href={result.url} target="_blank" rel="noopener noreferrer" className="bg-[#5D0F17] text-[#FFFDF8] px-5 py-2.5 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition">View your site ↗</a>
 <button onClick={() => router.push("/store/dashboard")} className="px-5 py-2.5 text-xs uppercase tracking-[0.15em] text-[#5D0F17]/55 hover:text-[#5D0F17] transition">
 Go to dashboard
 </button>
 </div>
 </div>
 ) : path === "import" ? (
 <>
 <input
 className={input}
 value={url}
 onChange={(e) => setUrl(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && run()}
 placeholder="yourstore.com — Shopify or Squarespace"
 autoFocus
 />
 <button
 onClick={run}
 disabled={busy || !url.trim()}
 className="mt-5 bg-[#5D0F17] text-[#FFFDF8] px-6 py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition disabled:opacity-50"
 >
 {busy ? "Bringing your site over…" : "Bring my site over →"}
 </button>
 {err && <p className="mt-3 text-xs text-red-700">{err}</p>}

 <div className="mt-8 flex gap-5 text-xs text-[#5D0F17]/45">
 <button onClick={() => { setPath(null); setErr(null); }} className="underline hover:text-[#5D0F17]">← Back</button>
 <button onClick={() => router.push("/store/dashboard")} className="underline hover:text-[#5D0F17]">Skip for now</button>
 </div>
 </>
 ) : null}
 </div>
 </main>
 );
}
