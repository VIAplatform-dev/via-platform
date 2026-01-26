"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

type ConversionRecord = {
  conversionId: string;
  timestamp: string;
  orderId: string;
  orderTotal: number;
  currency: string;
  storeName: string;
  storeSlug: string;
  matched: boolean;
  matchedClickData?: {
    clickId: string;
    clickTimestamp: string;
    productName: string;
  };
};

type ConversionData = {
  totalConversions: number;
  matchedConversions: number;
  totalRevenue: number;
  matchedRevenue: number;
  revenueByStore: Record<string, { total: number; matched: number; count: number }>;
  recentConversions: ConversionRecord[];
  range: string;
};

type DateRange = "7d" | "30d" | "all";

export default function AnalyticsPage() {
  const [clickData, setClickData] = useState<AnalyticsData | null>(null);
  const [conversionData, setConversionData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>("all");
  const [activeTab, setActiveTab] = useState<"clicks" | "conversions">("clicks");
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
    router.refresh();
  }

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const [clicksRes, conversionsRes] = await Promise.all([
          fetch(`/api/analytics?range=${range}`),
          fetch(`/api/conversion?range=${range}`),
        ]);
        const clicks = await clicksRes.json();
        const conversions = await conversionsRes.json();
        setClickData(clicks);
        setConversionData(conversions);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const maxStoreClicks = clickData
    ? Math.max(...Object.values(clickData.clicksByStore), 1)
    : 1;

  const maxStoreRevenue = conversionData
    ? Math.max(...Object.values(conversionData.revenueByStore).map((s) => s.total), 1)
    : 1;

  const conversionRate =
    clickData && conversionData && clickData.totalClicks > 0
      ? ((conversionData.matchedConversions / clickData.totalClicks) * 100).toFixed(2)
      : "0.00";

  return (
    <main className="bg-white min-h-screen text-black">
      {/* Header */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-12 sm:py-20">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm flex-wrap">
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
            <button
              onClick={handleLogout}
              className="text-sm text-neutral-400 hover:text-black transition-colors"
            >
              Logout
            </button>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif mb-3 sm:mb-4">Analytics</h1>
          <p className="text-neutral-600 text-base sm:text-lg">
            Track clicks, conversions, and revenue across all stores.
          </p>
        </div>
      </section>

      {/* Summary Cards */}
      {!loading && clickData && conversionData && (
        <section className="border-b border-neutral-200 bg-neutral-50">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Total Clicks</p>
                <p className="text-2xl sm:text-3xl font-serif">{clickData.totalClicks.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Conversions</p>
                <p className="text-2xl sm:text-3xl font-serif">{conversionData.matchedConversions.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Conversion Rate</p>
                <p className="text-2xl sm:text-3xl font-serif">{conversionRate}%</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Tracked Revenue</p>
                <p className="text-2xl sm:text-3xl font-serif">{formatCurrency(conversionData.matchedRevenue)}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Date Range & Tabs */}
      <section className="border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-neutral-100 p-1">
              <button
                onClick={() => setActiveTab("clicks")}
                className={`px-4 py-2 text-sm transition-colors ${
                  activeTab === "clicks"
                    ? "bg-white shadow-sm"
                    : "hover:bg-neutral-200"
                }`}
              >
                Clicks
              </button>
              <button
                onClick={() => setActiveTab("conversions")}
                className={`px-4 py-2 text-sm transition-colors ${
                  activeTab === "conversions"
                    ? "bg-white shadow-sm"
                    : "hover:bg-neutral-200"
                }`}
              >
                Conversions
              </button>
            </div>

            {/* Date Range */}
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
          </div>
        </div>
      </section>

      {loading ? (
        <div className="max-w-7xl mx-auto px-6 py-16 text-center text-neutral-500">
          Loading analytics...
        </div>
      ) : activeTab === "clicks" ? (
        /* ==================== CLICKS TAB ==================== */
        <>
          {!clickData || clickData.totalClicks === 0 ? (
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
                    {Object.entries(clickData.clicksByStore).map(([store, count]) => (
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
                  {clickData.topProducts.length > 0 ? (
                    <div className="border border-neutral-200">
                      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
                        <div className="col-span-1">#</div>
                        <div className="col-span-6">Product</div>
                        <div className="col-span-3">Store</div>
                        <div className="col-span-2 text-right">Clicks</div>
                      </div>
                      {clickData.topProducts.map((product, index) => (
                        <div
                          key={product.id}
                          className="px-4 sm:px-6 py-4 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50"
                        >
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

              {/* Recent Clicks */}
              <section className="py-12 sm:py-16">
                <div className="max-w-7xl mx-auto px-6">
                  <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Recent Activity</h2>
                  {clickData.recentClicks.length > 0 ? (
                    <div className="border border-neutral-200">
                      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
                        <div className="col-span-3">Time</div>
                        <div className="col-span-5">Product</div>
                        <div className="col-span-4">Store</div>
                      </div>
                      <div className="max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                        {clickData.recentClicks.map((click) => (
                          <div
                            key={click.clickId}
                            className="px-4 sm:px-6 py-3 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 text-sm"
                          >
                            <div className="sm:hidden">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium truncate flex-1">{click.productName}</p>
                              </div>
                              <div className="flex items-center justify-between mt-1 text-xs text-neutral-500">
                                <span>{click.store}</span>
                                <span>{formatDate(click.timestamp)}</span>
                              </div>
                            </div>
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
        </>
      ) : (
        /* ==================== CONVERSIONS TAB ==================== */
        <>
          {!conversionData || conversionData.totalConversions === 0 ? (
            <div className="max-w-7xl mx-auto px-6 py-16">
              <div className="border border-dashed border-neutral-300 p-8 text-center">
                <p className="text-neutral-500 mb-2">No conversion data yet.</p>
                <p className="text-sm text-neutral-400 mb-6">
                  Set up conversion tracking for your stores to see sales attributed to VIA.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/admin/shopify-setup"
                    className="px-6 py-3 bg-black text-white text-sm hover:bg-neutral-800 transition"
                  >
                    Shopify Setup Guide
                  </Link>
                  <Link
                    href="/admin/squarespace-setup"
                    className="px-6 py-3 border border-black text-sm hover:bg-neutral-100 transition"
                  >
                    Squarespace Setup Guide
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Revenue by Store */}
              <section className="py-12 sm:py-16 border-b border-neutral-200">
                <div className="max-w-7xl mx-auto px-6">
                  <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Revenue by Store</h2>
                  <div className="space-y-4">
                    {Object.entries(conversionData.revenueByStore)
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([store, data]) => (
                        <div key={store} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <div className="sm:w-40 text-sm font-medium sm:font-normal truncate">{store}</div>
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 h-6 sm:h-8 bg-neutral-100 relative">
                              <div
                                className="h-full bg-green-600 transition-all duration-300"
                                style={{ width: `${(data.total / maxStoreRevenue) * 100}%` }}
                              />
                            </div>
                            <div className="w-24 sm:w-28 text-right text-sm tabular-nums">
                              {formatCurrency(data.total)}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>

              {/* Conversion Stats */}
              <section className="py-12 sm:py-16 border-b border-neutral-200">
                <div className="max-w-7xl mx-auto px-6">
                  <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Conversion Breakdown</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-neutral-50 p-6">
                      <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Total Orders</p>
                      <p className="text-3xl font-serif">{conversionData.totalConversions}</p>
                      <p className="text-sm text-neutral-500 mt-1">all tracked orders</p>
                    </div>
                    <div className="bg-green-50 p-6">
                      <p className="text-xs uppercase tracking-wide text-green-700 mb-2">VIA-Attributed</p>
                      <p className="text-3xl font-serif text-green-800">{conversionData.matchedConversions}</p>
                      <p className="text-sm text-green-600 mt-1">matched to VIA clicks</p>
                    </div>
                    <div className="bg-neutral-50 p-6">
                      <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Attribution Rate</p>
                      <p className="text-3xl font-serif">
                        {conversionData.totalConversions > 0
                          ? ((conversionData.matchedConversions / conversionData.totalConversions) * 100).toFixed(1)
                          : 0}
                        %
                      </p>
                      <p className="text-sm text-neutral-500 mt-1">of orders from VIA</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Recent Conversions */}
              <section className="py-12 sm:py-16">
                <div className="max-w-7xl mx-auto px-6">
                  <h2 className="text-xl sm:text-2xl font-serif mb-6 sm:mb-8">Recent Conversions</h2>
                  {conversionData.recentConversions.length > 0 ? (
                    <div className="border border-neutral-200">
                      <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-3 bg-neutral-50 text-sm text-neutral-500 border-b border-neutral-200">
                        <div className="col-span-3">Time</div>
                        <div className="col-span-3">Store</div>
                        <div className="col-span-2">Order ID</div>
                        <div className="col-span-2 text-right">Amount</div>
                        <div className="col-span-2 text-right">Status</div>
                      </div>
                      <div className="max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                        {conversionData.recentConversions.map((conv) => (
                          <div
                            key={conv.conversionId}
                            className="px-4 sm:px-6 py-4 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 text-sm"
                          >
                            <div className="sm:hidden">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{conv.storeName}</p>
                                  <p className="text-xs text-neutral-500 mt-1">
                                    Order #{conv.orderId}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium tabular-nums">{formatCurrency(conv.orderTotal)}</p>
                                  <span
                                    className={`text-xs ${
                                      conv.matched ? "text-green-600" : "text-neutral-400"
                                    }`}
                                  >
                                    {conv.matched ? "Matched" : "Unmatched"}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-neutral-400 mt-2">
                                {formatDate(conv.timestamp)}
                              </p>
                            </div>
                            <div className="hidden sm:grid grid-cols-12 gap-4 items-center">
                              <div className="col-span-3 text-neutral-500">
                                {formatDate(conv.timestamp)}
                              </div>
                              <div className="col-span-3 truncate">{conv.storeName}</div>
                              <div className="col-span-2 text-neutral-500 truncate">
                                #{conv.orderId}
                              </div>
                              <div className="col-span-2 text-right tabular-nums font-medium">
                                {formatCurrency(conv.orderTotal)}
                              </div>
                              <div className="col-span-2 text-right">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs ${
                                    conv.matched
                                      ? "bg-green-100 text-green-700"
                                      : "bg-neutral-100 text-neutral-500"
                                  }`}
                                >
                                  {conv.matched ? "VIA Attributed" : "Unmatched"}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-neutral-500">No recent conversions.</p>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* Store Setup Links */}
      <section className="border-t border-neutral-200 bg-neutral-50 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-sm font-medium mb-4">Store Integration Guides</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/shopify-setup"
              className="px-4 py-2 bg-white border border-neutral-200 text-sm hover:border-black transition"
            >
              Shopify (Collabs)
            </Link>
            <Link
              href="/admin/squarespace-setup"
              className="px-4 py-2 bg-white border border-neutral-200 text-sm hover:border-black transition"
            >
              Squarespace (Pixel)
            </Link>
          </div>
        </div>
      </section>

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
