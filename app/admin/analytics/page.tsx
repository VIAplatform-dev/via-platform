"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ClickRecord = {
  clickId: string;
  timestamp: string;
  productId: string;
  productName: string;
  store: string;
  storeSlug: string;
  externalUrl: string;
  userAgent?: string;
};

type TopProduct = {
  id: string;
  name: string;
  store: string;
  count: number;
};

type AnalyticsData = {
  totalClicks: number;
  clicksByStore: Record<string, number>;
  topProducts: TopProduct[];
  recentClicks: ClickRecord[];
  range: string;
};

type DateRange = "7d" | "30d" | "all";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>("all");

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?range=${range}`);
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Failed to fetch analytics:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [range]);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const maxStoreClicks = data
    ? Math.max(...Object.values(data.clicksByStore), 1)
    : 1;

  return (
    <main className="bg-white min-h-screen text-black">
      {/* Header */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-12 sm:py-20">
          <div className="flex items-center gap-4 mb-4 text-sm flex-wrap">
            <Link
              href="/admin/sync"
              className="text-neutral-400 hover:text-black transition-colors min-h-[44px] flex items-center"
            >
              Sync
            </Link>
            <span className="text-neutral-300">/</span>
            <span className="text-black">Analytics</span>
            <span className="text-neutral-300">/</span>
            <Link
              href="/admin/emails"
              className="text-neutral-400 hover:text-black transition-colors min-h-[44px] flex items-center"
            >
              Emails
            </Link>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif mb-3 sm:mb-4">Click Analytics</h1>
          <p className="text-neutral-600 text-base sm:text-lg">
            Track product clicks and store performance.
          </p>
        </div>
      </section>

      {/* Date Range Filter */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
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
          {data && (
            <p className="text-sm text-neutral-500">
              {data.totalClicks.toLocaleString()} total clicks
            </p>
          )}
        </div>
      </section>

      {loading ? (
        <div className="max-w-7xl mx-auto px-6 py-16 text-center text-neutral-500">
          Loading analytics...
        </div>
      ) : !data || data.totalClicks === 0 ? (
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="border border-dashed border-neutral-300 p-8 text-center">
            <p className="text-neutral-500 mb-2">No click data yet.</p>
            <p className="text-sm text-neutral-400">
              Clicks will appear here once visitors start clicking products.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Clicks by Store */}
          <section className="py-12 sm:py-16 border-b border-neutral-200">
            <div className="max-w-7xl mx-auto px-6">
              <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Clicks by Store</h2>
              <div className="space-y-4">
                {Object.entries(data.clicksByStore).map(([store, count]) => (
                  <div key={store} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="sm:w-40 text-sm font-medium sm:font-normal truncate">{store}</div>
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-1 h-6 sm:h-8 bg-neutral-100 relative">
                        <div
                          className="h-full bg-black transition-all duration-300"
                          style={{ width: `${(count / maxStoreClicks) * 100}%` }}
                        />
                      </div>
                      <div className="w-12 sm:w-16 text-right text-sm tabular-nums">
                        {count.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Top Products */}
          <section className="py-12 sm:py-16 border-b border-neutral-200">
            <div className="max-w-7xl mx-auto px-6">
              <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Top 10 Products</h2>
              {data.topProducts.length > 0 ? (
                <div className="border border-neutral-200">
                  {/* Desktop Header */}
                  <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
                    <div className="col-span-1">#</div>
                    <div className="col-span-6">Product</div>
                    <div className="col-span-3">Store</div>
                    <div className="col-span-2 text-right">Clicks</div>
                  </div>
                  {data.topProducts.map((product, index) => (
                    <div
                      key={product.id}
                      className="px-4 sm:px-6 py-4 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                    >
                      {/* Mobile Layout */}
                      <div className="sm:hidden">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                            <p className="text-xs text-neutral-500 mt-1">{product.store}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium tabular-nums">
                              {product.count.toLocaleString()}
                            </span>
                            <span className="text-xs text-neutral-400 ml-1">clicks</span>
                          </div>
                        </div>
                      </div>
                      {/* Desktop Layout */}
                      <div className="hidden sm:grid grid-cols-12 gap-4">
                        <div className="col-span-1 text-neutral-400">{index + 1}</div>
                        <div className="col-span-6 truncate">{product.name}</div>
                        <div className="col-span-3 text-sm text-neutral-500 truncate">
                          {product.store}
                        </div>
                        <div className="col-span-2 text-right tabular-nums font-medium">
                          {product.count.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500">No product clicks recorded.</p>
              )}
            </div>
          </section>

          {/* Recent Activity */}
          <section className="py-12 sm:py-16">
            <div className="max-w-7xl mx-auto px-6">
              <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Recent Activity</h2>
              {data.recentClicks.length > 0 ? (
                <div className="border border-neutral-200">
                  {/* Desktop Header */}
                  <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
                    <div className="col-span-3">Time</div>
                    <div className="col-span-5">Product</div>
                    <div className="col-span-4">Store</div>
                  </div>
                  <div className="max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                    {data.recentClicks.map((click) => (
                      <div
                        key={click.clickId}
                        className="px-4 sm:px-6 py-3 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 text-sm"
                      >
                        {/* Mobile Layout */}
                        <div className="sm:hidden">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium truncate flex-1">{click.productName}</p>
                          </div>
                          <div className="flex items-center justify-between mt-1 text-xs text-neutral-500">
                            <span>{click.store}</span>
                            <span>{formatDate(click.timestamp)}</span>
                          </div>
                        </div>
                        {/* Desktop Layout */}
                        <div className="hidden sm:grid grid-cols-12 gap-4">
                          <div className="col-span-3 text-neutral-500">
                            {formatDate(click.timestamp)}
                          </div>
                          <div className="col-span-5 truncate">{click.productName}</div>
                          <div className="col-span-4 text-neutral-500 truncate">
                            {click.store}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-neutral-500">No recent clicks.</p>
              )}
            </div>
          </section>
        </>
      )}

      {/* Admin Navigation */}
      <section className="border-t border-neutral-200 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap gap-4 sm:gap-6 text-sm">
            <Link
              href="/admin/sync"
              className="text-neutral-500 hover:text-black transition-colors min-h-[44px] flex items-center"
            >
              Inventory Sync
            </Link>
            <span className="text-black min-h-[44px] flex items-center">Analytics</span>
            <Link
              href="/admin/emails"
              className="text-neutral-500 hover:text-black transition-colors min-h-[44px] flex items-center"
            >
              Emails
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
