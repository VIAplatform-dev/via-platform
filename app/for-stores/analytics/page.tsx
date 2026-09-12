"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type TopProduct = {
 name: string;
 count: number;
};

type ClickRecord = {
 clickId: string;
 timestamp: string;
 productName: string;
 store: string;
};

type ConversionRecord = {
 conversionId: string;
 timestamp: string;
 orderId: string;
 orderTotal: number;
 currency: string;
 matched: boolean;
};

type ItemSold = {
 name: string;
 qty: number;
};

type SearchEntry = {
 query: string;
 count: number;
};

type StoreAnalytics = {
 storeName: string;
 totalClicks: number;
 totalConversions: number;
 totalRevenue: number;
 topProducts: TopProduct[];
 recentClicks: ClickRecord[];
 recentConversions: ConversionRecord[];
 itemsSold: ItemSold[];
 topSearches: SearchEntry[];
 range: string;
};

type DateRange = "7d" | "30d" | "all";

function StoreDashboard() {
 const searchParams = useSearchParams();
 const storeSlug = searchParams.get("store");
 const token = searchParams.get("token");

 const [data, setData] = useState<StoreAnalytics | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [range, setRange] = useState<DateRange>("all");
 const [activeTab, setActiveTab] = useState<"clicks" | "conversions" | "items" | "searches">("clicks");

 useEffect(() => {
 if (!storeSlug || !token) {
 setError("missing");
 setLoading(false);
 return;
 }

 async function fetchData() {
 setLoading(true);
 setError(null);
 try {
 const res = await fetch(
 `/api/store-analytics?store=${storeSlug}&token=${token}&range=${range}`
 );
 if (res.status === 401) {
 setError("invalid");
 return;
 }
 if (!res.ok) {
 setError("failed");
 return;
 }
 const json = await res.json();
 setData(json);
 } catch {
 setError("failed");
 } finally {
 setLoading(false);
 }
 }

 fetchData();
 }, [storeSlug, token, range]);

 const formatDate = (timestamp: string) => {
 return new Date(timestamp).toLocaleDateString("en-US", {
 month: "short",
 day: "numeric",
 hour: "numeric",
 minute: "2-digit",
 });
 };

 const formatCurrency = (amount: number) => {
 return new Intl.NumberFormat("en-US", {
 style: "currency",
 currency: "USD",
 }).format(amount);
 };

 const maxProductCount = data ? Math.max(...data.topProducts.map((p) => p.count), 1) : 1;

 if (!loading && error === "missing") {
 return (
 <main className="bg-white min-h-screen text-black flex items-center justify-center px-6">
 <div className="max-w-md text-center">
 <h1 className="text-2xl font-serif mb-4">Dashboard Access</h1>
 <p className="text-neutral-600 mb-6">
 To access your store analytics, use the link VYA sent you. If you
 don&apos;t have it, email{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="underline">
 partnerships@vyaplatform.com
 </a>
 .
 </p>
 <Link href="/for-stores" className="text-sm text-neutral-400 hover:text-black transition-colors">
 &larr; Back to Partner Info
 </Link>
 </div>
 </main>
 );
 }

 if (!loading && error === "invalid") {
 return (
 <main className="bg-white min-h-screen text-black flex items-center justify-center px-6">
 <div className="max-w-md text-center">
 <h1 className="text-2xl font-serif mb-4">Invalid Link</h1>
 <p className="text-neutral-600 mb-6">
 This link doesn&apos;t match any store on VYA. Please use the exact link
 sent to you, or email{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="underline">
 partnerships@vyaplatform.com
 </a>{" "}
 for a new one.
 </p>
 </div>
 </main>
 );
 }

 return (
 <main className="bg-white min-h-screen text-black">
 {/* Header */}
 <section className="border-b border-neutral-200">
 <div className="max-w-5xl mx-auto px-6 py-12 sm:py-20">
 <div className="flex items-center gap-2 text-sm mb-6">
 <Link href="/for-stores" className="text-neutral-400 hover:text-black transition-colors">
 Partner with VYA
 </Link>
 <span className="text-neutral-300">/</span>
 <span className="text-black">Your Dashboard</span>
 </div>
 <h1 className="text-3xl sm:text-5xl font-serif mb-3">
 {data ? data.storeName : "Your Dashboard"}
 </h1>
 <p className="text-neutral-600">
 Traffic and sales VYA has sent your store.
 </p>
 </div>
 </section>

 {/* Summary Cards */}
 {!loading && data && (
 <section className="border-b border-neutral-200 bg-neutral-50">
 <div className="max-w-5xl mx-auto px-6 py-8">
 <div className="grid grid-cols-3 gap-4 sm:gap-8">
 <div>
 <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Clicks from VYA</p>
 <p className="text-2xl sm:text-3xl font-serif">{data.totalClicks.toLocaleString()}</p>
 </div>
 <div>
 <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Orders</p>
 <p className="text-2xl sm:text-3xl font-serif">{data.totalConversions.toLocaleString()}</p>
 </div>
 <div>
 <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Revenue</p>
 <p className="text-2xl sm:text-3xl font-serif">{formatCurrency(data.totalRevenue)}</p>
 </div>
 </div>
 </div>
 </section>
 )}

 {/* Tabs + Date Range */}
 <section className="border-b border-neutral-200">
 <div className="max-w-5xl mx-auto px-6 py-4 sm:py-6">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div className="flex gap-1 bg-neutral-100 p-1">
 <button
 onClick={() => setActiveTab("clicks")}
 className={`px-4 py-2 text-sm transition-colors ${
 activeTab === "clicks" ? "bg-white shadow-sm" : "hover:bg-neutral-200"
 }`}
 >
 Clicks
 </button>
 <button
 onClick={() => setActiveTab("conversions")}
 className={`px-4 py-2 text-sm transition-colors ${
 activeTab === "conversions" ? "bg-white shadow-sm" : "hover:bg-neutral-200"
 }`}
 >
 Orders
 </button>
 <button
 onClick={() => setActiveTab("items")}
 className={`px-4 py-2 text-sm transition-colors ${
 activeTab === "items" ? "bg-white shadow-sm" : "hover:bg-neutral-200"
 }`}
 >
 Items Sold
 </button>
 <button
 onClick={() => setActiveTab("searches")}
 className={`px-4 py-2 text-sm transition-colors ${
 activeTab === "searches" ? "bg-white shadow-sm" : "hover:bg-neutral-200"
 }`}
 >
 Top Searches
 </button>
 </div>
 <div className="flex gap-2">
 {(["7d", "30d", "all"] as DateRange[]).map((r) => (
 <button
 key={r}
 onClick={() => setRange(r)}
 className={`px-4 py-2.5 text-sm tracking-wide transition-colors whitespace-nowrap min-h-[44px] ${
 range === r
 ? "bg-black text-white"
 : "border border-neutral-200 hover:border-black"
 }`}
 >
 {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "All time"}
 </button>
 ))}
 </div>
 </div>
 </div>
 </section>

 {loading ? (
 <div className="max-w-5xl mx-auto px-6 py-16 text-center text-neutral-500">
 Loading...
 </div>
 ) : !data ? null : activeTab === "clicks" ? (
 <>
 {data.totalClicks === 0 ? (
 <div className="max-w-5xl mx-auto px-6 py-16">
 <div className="border border-dashed border-neutral-300 p-8 text-center">
 <p className="text-neutral-500">No clicks recorded yet for this period.</p>
 </div>
 </div>
 ) : (
 <>
 {/* Top Products */}
 {data.topProducts.length > 0 && (
 <section className="py-12 sm:py-16 border-b border-neutral-200">
 <div className="max-w-5xl mx-auto px-6">
 <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Most Clicked Products</h2>
 <div className="space-y-4">
 {data.topProducts.map((product) => (
 <div key={product.name} className="flex items-center gap-4">
 <div className="flex-1 min-w-0">
 <p className="text-sm truncate mb-1">{product.name}</p>
 <div className="h-5 bg-neutral-100">
 <div
 className="h-full bg-black transition-all duration-300"
 style={{ width: `${(product.count / maxProductCount) * 100}%` }}
 />
 </div>
 </div>
 <div className="text-sm tabular-nums w-12 text-right">{product.count}</div>
 </div>
 ))}
 </div>
 </div>
 </section>
 )}

 {/* Recent Clicks */}
 <section className="py-12 sm:py-16">
 <div className="max-w-5xl mx-auto px-6">
 <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Recent Clicks</h2>
 <div className="border border-neutral-200">
 <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
 <div className="col-span-4">Time</div>
 <div className="col-span-8">Product</div>
 </div>
 <div className="max-h-[500px] overflow-y-auto">
 {data.recentClicks.map((click) => (
 <div
 key={click.clickId}
 className="px-6 py-3 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 text-sm"
 >
 <div className="sm:hidden">
 <p className="font-medium truncate">{click.productName}</p>
 <p className="text-xs text-neutral-400 mt-1">{formatDate(click.timestamp)}</p>
 </div>
 <div className="hidden sm:grid grid-cols-12 gap-4">
 <div className="col-span-4 text-neutral-500">{formatDate(click.timestamp)}</div>
 <div className="col-span-8 truncate">{click.productName}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </section>
 </>
 )}
 </>
 ) : (
 <>
 {data.totalConversions === 0 ? (
 <div className="max-w-5xl mx-auto px-6 py-16">
 <div className="border border-dashed border-neutral-300 p-8 text-center">
 <p className="text-neutral-500 mb-2">No orders recorded yet for this period.</p>
 <p className="text-sm text-neutral-400">
 Orders will appear here once customers referred by VYA complete a purchase.
 </p>
 </div>
 </div>
 ) : (
 <section className="py-12 sm:py-16">
 <div className="max-w-5xl mx-auto px-6">
 <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Orders from VYA</h2>
 <div className="border border-neutral-200">
 <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
 <div className="col-span-4">Time</div>
 <div className="col-span-4">Order</div>
 <div className="col-span-4 text-right">Amount</div>
 </div>
 <div className="max-h-[600px] overflow-y-auto">
 {data.recentConversions.map((conv) => (
 <div
 key={conv.conversionId}
 className="px-6 py-4 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 text-sm"
 >
 <div className="sm:hidden">
 <div className="flex items-center justify-between">
 <p className="text-neutral-500 text-xs">#{conv.orderId}</p>
 <p className="font-medium tabular-nums">{formatCurrency(conv.orderTotal)}</p>
 </div>
 <p className="text-xs text-neutral-400 mt-1">{formatDate(conv.timestamp)}</p>
 </div>
 <div className="hidden sm:grid grid-cols-12 gap-4 items-center">
 <div className="col-span-4 text-neutral-500">{formatDate(conv.timestamp)}</div>
 <div className="col-span-4 text-neutral-500">#{conv.orderId}</div>
 <div className="col-span-4 text-right font-medium tabular-nums">
 {formatCurrency(conv.orderTotal)}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </section>
 )}
 </>
 )}

 {/* Top Searches Tab */}
 {!loading && data && activeTab === "searches" && (
 <section className="py-12 sm:py-16">
 <div className="max-w-5xl mx-auto px-6">
 <h2 className="text-xl sm:text-2xl font-serif mb-2">Top Searches on VYA</h2>
 <p className="text-sm text-neutral-500 mb-8">What shoppers across VYA are searching for right now, use this to source what&apos;s in demand.</p>
 {data.topSearches.length === 0 ? (
 <div className="border border-dashed border-neutral-300 p-8 text-center">
 <p className="text-neutral-500">No search data yet for this period.</p>
 </div>
 ) : (
 <div className="space-y-3">
 {data.topSearches.map((s, i) => (
 <div key={s.query} className="flex items-center gap-4">
 <span className="text-sm tabular-nums text-neutral-400 w-6 text-right shrink-0">{i + 1}</span>
 <div className="flex-1 min-w-0">
 <p className={`truncate ${i === 0 ? "text-base font-semibold" : "text-sm"}`}>{s.query}</p>
 <div className="h-1.5 bg-neutral-100 mt-1.5">
 <div
 className="h-full bg-black transition-all duration-300"
 style={{ width: `${(s.count / data.topSearches[0].count) * 100}%` }}
 />
 </div>
 </div>
 <span className="text-sm tabular-nums text-neutral-500 shrink-0">{s.count}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 </section>
 )}

 {/* Items Sold Tab */}
 {!loading && data && activeTab === "items" && (
 <>
 {data.itemsSold.length === 0 ? (
 <div className="max-w-5xl mx-auto px-6 py-16">
 <div className="border border-dashed border-neutral-300 p-8 text-center">
 <p className="text-neutral-500 mb-2">No items sold yet for this period.</p>
 <p className="text-sm text-neutral-400">
 Items will appear here once orders from VYA customers are recorded.
 </p>
 </div>
 </div>
 ) : (
 <section className="py-12 sm:py-16">
 <div className="max-w-5xl mx-auto px-6">
 <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Items Sold via VYA</h2>
 <div className="border border-neutral-200">
 <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
 <div className="col-span-10">Item</div>
 <div className="col-span-2 text-right">Qty</div>
 </div>
 <div className="max-h-[600px] overflow-y-auto">
 {data.itemsSold.map((item, i) => (
 <div
 key={i}
 className="px-6 py-3 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 text-sm"
 >
 <div className="sm:hidden flex items-center justify-between gap-4">
 <p className="truncate">{item.name}</p>
 <p className="text-neutral-500 tabular-nums shrink-0">×{item.qty}</p>
 </div>
 <div className="hidden sm:grid grid-cols-12 gap-4 items-center">
 <div className="col-span-10 truncate">{item.name}</div>
 <div className="col-span-2 text-right text-neutral-500 tabular-nums">×{item.qty}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </section>
 )}
 </>
 )}

 {/* Footer */}
 <section className="border-t border-neutral-200 py-8">
 <div className="max-w-5xl mx-auto px-6">
 <p className="text-xs text-neutral-400">
 Questions? Email{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="underline hover:text-black transition-colors">
 partnerships@vyaplatform.com
 </a>
 </p>
 </div>
 </section>
 </main>
 );
}

export default function StoreAnalyticsPage() {
 return (
 <Suspense>
 <StoreDashboard />
 </Suspense>
 );
}
