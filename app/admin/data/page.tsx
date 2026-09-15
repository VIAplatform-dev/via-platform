"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type BrandHeat = {
 brand: string; rank: number; rankPrev: number | null; rankDelta: number | null;
 heat: number; momentumPct: number | null; isBreakout: boolean;
 views: number; favorites: number; searches: number; sold: number; gmv: number;
};
type GroupHeat = {
 key: string; rank: number; rankPrev: number | null; rankDelta: number | null;
 heat: number; momentumPct: number | null; isBreakout: boolean;
 views: number; favorites: number; sold: number; gmv: number;
};
type HeatIndex = { generatedAt: string; periodDays: number; brands: BrandHeat[]; categories: GroupHeat[]; stores: GroupHeat[] };

type Demand = {
 windowDays: number;
 summary: { gmv: number; orders: number; aov: number };
 unmetSearches: { query: string; searches: number; results: number }[];
 topBrands: { brand: string; views: number; hearts: number; purchases: number; searches: number }[];
 whitespace: { brand: string; demand: number; inventory: number; ratio: number }[];
 topCategories: { category: string; views: number; hearts: number; purchases: number }[];
 openSourcing: { id: string; description: string; priceMin: number; priceMax: number; size: string | null; deadline: string }[];
};

type FunnelStage = { views: number; favorites: number; clicks: number; purchases: number; favoriteRate: number; clickRate: number; buyRate: number };
type Funnel = { windowDays: number; overall: FunnelStage; byBrand: (FunnelStage & { brand: string })[] };
type PriceVel = { windowDays: number; brands: { brand: string; listings: number; avgListPrice: number; markdownPct: number | null; sold: number; avgSoldPrice: number | null; sellThroughPct: number | null; avgDaysToSell: number | null }[] };
type Trend = { query: string; current: number; prior: number; deltaPct: number | null; isNew: boolean; results: number };
type SearchTrends = { windowDays: number; rising: Trend[]; falling: Trend[]; top: Trend[] };
type Sizing = { windowDays: number; sizes: { size: string; demand: number; views: number; favorites: number; supply: number; ratio: number | null }[] };
type DataProducts = { funnel: Funnel; priceVelocity: PriceVel; searchTrends: SearchTrends; sizing: Sizing };

const MUTED = "rgba(255,255,255,0.55)";
const FAINT = "rgba(255,255,255,0.4)";
const LINE = "1px solid rgba(255,255,255,0.08)";
const card: React.CSSProperties = { border: LINE, borderRadius: 8, padding: "18px 20px", marginBottom: 22 };

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
 return <th style={{ padding: "8px 10px", textAlign: right ? "right" : "left", color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{children}</th>;
}
function Td({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) {
 return <td style={{ padding: "9px 10px", textAlign: right ? "right" : "left", color: bold ? "rgba(255,255,255,0.92)" : MUTED, fontWeight: bold ? 600 : 400 }}>{children}</td>;
}

export default function AdminDataPage() {
 const [days, setDays] = useState(30);
 const [heat, setHeat] = useState<HeatIndex | null>(null);
 const [demand, setDemand] = useState<Demand | null>(null);
 const [products, setProducts] = useState<DataProducts | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 setLoading(true);
 Promise.all([
 fetch(`/api/admin/brand-heat?days=${days}`).then((r) => (r.ok ? r.json() : null)),
 fetch(`/api/admin/demand?days=${days}`).then((r) => (r.ok ? r.json() : null)),
 fetch(`/api/admin/data-products?days=${days}`).then((r) => (r.ok ? r.json() : null)),
 ]).then(([h, d, p]) => {
 if (h && h.brands) setHeat(h);
 if (d && d.topBrands) setDemand(d);
 if (p && p.funnel) setProducts(p);
 }).finally(() => setLoading(false));
 }, [days]);

 const move = (b: BrandHeat) => {
 if (b.rankPrev == null) return <span style={{ color: "#d4af37" }}>NEW</span>;
 if (!b.rankDelta) return <span style={{ color: FAINT }}>-</span>;
 return b.rankDelta > 0 ? <span style={{ color: "#4ade80" }}>▲ {b.rankDelta}</span> : <span style={{ color: "#f87171" }}>▼ {Math.abs(b.rankDelta)}</span>;
 };
 const mom = (b: BrandHeat) => {
 if (b.isBreakout) return <span style={{ color: "#d4af37" }}>Breakout</span>;
 if (b.momentumPct == null) return <span style={{ color: FAINT }}>-</span>;
 const up = b.momentumPct >= 0;
 return <span style={{ color: up ? "#4ade80" : "#f87171" }}>{up ? "+" : ""}{b.momentumPct}%</span>;
 };
 const sig = (d: { views: number; hearts: number; purchases: number }) =>
 [d.views ? `${d.views.toLocaleString()} views` : null, d.hearts ? `${d.hearts} hearts` : null, d.purchases ? `${d.purchases} sold` : null].filter(Boolean).join(" · ") || "-";

 const groupMove = (g: GroupHeat) => {
 if (g.rankPrev == null) return <span style={{ color: "#d4af37" }}>NEW</span>;
 if (!g.rankDelta) return <span style={{ color: FAINT }}>-</span>;
 return g.rankDelta > 0 ? <span style={{ color: "#4ade80" }}>▲ {g.rankDelta}</span> : <span style={{ color: "#f87171" }}>▼ {Math.abs(g.rankDelta)}</span>;
 };
 const groupMom = (g: GroupHeat) => {
 if (g.isBreakout) return <span style={{ color: "#d4af37" }}>Breakout</span>;
 if (g.momentumPct == null) return <span style={{ color: FAINT }}>-</span>;
 const up = g.momentumPct >= 0;
 return <span style={{ color: up ? "#4ade80" : "#f87171" }}>{up ? "+" : ""}{g.momentumPct}%</span>;
 };
 const groupTable = (title: string, label: string, rows?: GroupHeat[]) => (!rows || rows.length === 0) ? null : (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>{title}</h2>
 <div style={{ overflowX: "auto" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
 <thead><tr><Th>#</Th><Th>Move</Th><Th>{label}</Th><Th right>Heat</Th><Th right>Momentum</Th><Th right>Views</Th><Th right>Favorites</Th><Th right>Sold</Th></tr></thead>
 <tbody>{rows.map((g) => (
  <tr key={g.key} style={{ borderTop: LINE }}>
  <Td>{g.rank}</Td><td style={{ padding: "9px 10px", fontSize: 12 }}>{groupMove(g)}</td>
  <Td bold>{g.key}</Td><Td right bold>{g.heat.toLocaleString()}</Td>
  <td style={{ padding: "9px 10px", textAlign: "right" }}>{groupMom(g)}</td>
  <Td right>{g.views.toLocaleString()}</Td><Td right>{g.favorites.toLocaleString()}</Td><Td right>{g.sold.toLocaleString()}</Td>
  </tr>
 ))}</tbody>
 </table>
 </div>
 </div>
 );

 return (
 <div style={{ minHeight: "100vh", background: "#0d0f12", color: "rgba(255,255,255,0.9)", fontFamily: "Arial, sans-serif", padding: "32px 28px" }}>
 <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
 <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Data Layer</h1>
 <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
 <Link href="/admin/market-data" style={{ fontSize: 12, color: MUTED, marginRight: 8 }}>Market Data →</Link>
 {[30, 60, 90].map((d) => (
 <button key={d} onClick={() => setDays(d)} style={{ padding: "5px 12px", fontSize: 12, cursor: "pointer", borderRadius: 4, border: LINE, background: days === d ? "rgba(255,255,255,0.12)" : "transparent", color: days === d ? "#fff" : MUTED }}>{d}d</button>
 ))}
 </div>
 </div>
 <p style={{ color: MUTED, fontSize: 12.5, maxWidth: 760, marginTop: 6, marginBottom: 24 }}>
 Cross-store demand intelligence: brand momentum, what shoppers want, and where supply is missing. Aggregated across every store. <span style={{ color: FAINT }}>Internal / beta, not visible to stores.</span>
 </p>

 {loading && <p style={{ color: MUTED }}>Loading…</p>}

 {/* Revenue summary: headline numbers for the window */}
 {demand && demand.summary && (
 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>
 {[
  { label: `GMV · last ${demand.windowDays}d`, value: `$${(demand.summary.gmv ?? 0).toLocaleString()}` },
  { label: "Orders", value: (demand.summary.orders ?? 0).toLocaleString() },
  { label: "Avg order value", value: `$${(demand.summary.aov ?? 0).toLocaleString()}` },
 ].map((k) => (
  <div key={k.label} style={{ border: LINE, borderRadius: 8, padding: "16px 18px" }}>
  <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
  <div style={{ fontSize: 26, fontWeight: 600, marginTop: 6 }}>{k.value}</div>
  </div>
 ))}
 </div>
 )}

 {/* Brand Heat Index */}
 {heat && heat.brands.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>🔥 Brand Heat Index</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>Weighted demand (views + favorites + searches + sales) vs the prior {days}d.</p>
 <div style={{ overflowX: "auto" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
  <thead><tr><Th>#</Th><Th>Move</Th><Th>Brand</Th><Th right>Heat</Th><Th right>Momentum</Th><Th right>Views</Th><Th right>Favorites</Th><Th right>Searches</Th><Th right>Sold</Th><Th right>GMV</Th></tr></thead>
  <tbody>
  {heat.brands.map((b) => (
   <tr key={b.brand} style={{ borderTop: LINE }}>
   <Td>{b.rank}</Td><td style={{ padding: "9px 10px", fontSize: 12 }}>{move(b)}</td>
   <Td bold>{b.brand}</Td><Td right bold>{b.heat.toLocaleString()}</Td>
   <td style={{ padding: "9px 10px", textAlign: "right" }}>{mom(b)}</td>
   <Td right>{b.views.toLocaleString()}</Td><Td right>{b.favorites.toLocaleString()}</Td>
   <Td right>{b.searches.toLocaleString()}</Td><Td right>{b.sold.toLocaleString()}</Td>
   <Td right>{b.gmv ? `$${b.gmv.toLocaleString()}` : "-"}</Td>
   </tr>
  ))}
  </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Category & Store momentum */}
 {heat && groupTable("📂 Category Heat", "Category", heat.categories)}
 {heat && groupTable("🏪 Store Momentum", "Store", heat.stores)}

 {/* Unmet demand */}
 {demand && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Unmet demand</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>Searched repeatedly, few or no results. What to source.</p>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
 {demand.unmetSearches.length === 0 ? <span style={{ color: MUTED, fontSize: 13 }}>None.</span> :
  demand.unmetSearches.map((u) => (
  <span key={u.query} style={{ fontSize: 12.5, padding: "5px 11px", border: LINE, borderRadius: 999 }}>
   {u.query} <span style={{ color: FAINT }}>· {u.searches}× · {u.results} results</span>
  </span>
  ))}
 </div>
 </div>
 )}

 {/* Brand demand */}
 {demand && demand.topBrands.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Brand demand</h2>
 <div style={{ overflowX: "auto" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
  <thead><tr><Th>Brand</Th><Th right>Views</Th><Th right>Hearts</Th><Th right>Sold</Th><Th right>Searches</Th></tr></thead>
  <tbody>{demand.topBrands.map((b) => (
   <tr key={b.brand} style={{ borderTop: LINE }}>
   <Td bold>{b.brand}</Td><Td right>{b.views.toLocaleString()}</Td><Td right>{b.hearts.toLocaleString()}</Td><Td right>{b.purchases.toLocaleString()}</Td><Td right>{b.searches.toLocaleString()}</Td>
   </tr>
  ))}</tbody>
 </table>
 </div>
 </div>
 )}

 {/* Whitespace: demand outstripping supply (the headline sourcing signal) */}
 {demand && demand.whitespace && demand.whitespace.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>⚪ Whitespace. Demand vs supply</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>Brands shoppers want that the marketplace is under-stocked on. High ratio = sourcing opportunity.</p>
 <div style={{ overflowX: "auto" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
  <thead><tr><Th>Brand</Th><Th right>Demand</Th><Th right>In stock</Th><Th right>Demand / unit</Th></tr></thead>
  <tbody>{demand.whitespace.map((w) => (
  <tr key={w.brand} style={{ borderTop: LINE }}>
   <Td bold>{w.brand}</Td><Td right>{w.demand.toLocaleString()}</Td>
   <Td right>{w.inventory.toLocaleString()}</Td>
   <td style={{ padding: "9px 10px", textAlign: "right", color: w.ratio >= 20 ? "#d4af37" : MUTED, fontWeight: 600 }}>{w.ratio.toLocaleString()}</td>
  </tr>
  ))}</tbody>
 </table>
 </div>
 </div>
 )}

 {/* 1. Conversion funnel */}
 {products && products.funnel && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>🛒 Conversion funnel</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>Where demand leaks: view → favorite → click (checkout intent) → purchase, over {products.funnel.windowDays}d.</p>
 <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
 {[
  { label: "Views", value: products.funnel.overall.views, sub: null },
  { label: "Favorites", value: products.funnel.overall.favorites, sub: `${products.funnel.overall.favoriteRate}% of views` },
  { label: "Clicks", value: products.funnel.overall.clicks, sub: `${products.funnel.overall.clickRate}% of views` },
  { label: "Purchases", value: products.funnel.overall.purchases, sub: `${products.funnel.overall.buyRate}% of views` },
 ].map((s) => (
  <div key={s.label} style={{ flex: "1 1 130px", border: LINE, borderRadius: 8, padding: "12px 14px" }}>
  <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
  <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{s.value.toLocaleString()}</div>
  {s.sub && <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{s.sub}</div>}
  </div>
 ))}
 </div>
 {products.funnel.byBrand.length > 0 && (
 <div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
  <thead><tr><Th>Brand</Th><Th right>Views</Th><Th right>Fav rate</Th><Th right>Click rate</Th><Th right>Buy rate</Th></tr></thead>
  <tbody>{products.funnel.byBrand.map((b) => (
   <tr key={b.brand} style={{ borderTop: LINE }}>
   <Td bold>{b.brand}</Td><Td right>{b.views.toLocaleString()}</Td>
   <Td right>{b.favoriteRate}%</Td><Td right>{b.clickRate}%</Td>
   <td style={{ padding: "9px 10px", textAlign: "right", color: b.buyRate > 0 ? "#4ade80" : FAINT, fontWeight: 600 }}>{b.buyRate}%</td>
   </tr>
  ))}</tbody>
  </table>
 </div>
 )}
 </div>
 )}

 {/* 2. Price & velocity */}
 {products && products.priceVelocity && products.priceVelocity.brands.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>💰 Price &amp; velocity</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>List price, markdown depth, and sell-through by brand. Sold units &amp; realized price from real orders.</p>
 <div style={{ overflowX: "auto" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
  <thead><tr><Th>Brand</Th><Th right>In stock</Th><Th right>Avg list</Th><Th right>Markdown</Th><Th right>Sold</Th><Th right>Avg sold</Th><Th right>Sell-through</Th><Th right>Days to sell</Th></tr></thead>
  <tbody>{products.priceVelocity.brands.map((b) => (
  <tr key={b.brand} style={{ borderTop: LINE }}>
   <Td bold>{b.brand}</Td><Td right>{b.listings.toLocaleString()}</Td>
   <Td right>${b.avgListPrice.toLocaleString()}</Td>
   <Td right>{b.markdownPct != null ? `${b.markdownPct}%` : "-"}</Td>
   <Td right>{b.sold.toLocaleString()}</Td>
   <Td right>{b.avgSoldPrice != null ? `$${b.avgSoldPrice.toLocaleString()}` : "-"}</Td>
   <td style={{ padding: "9px 10px", textAlign: "right", color: (b.sellThroughPct ?? 0) >= 10 ? "#4ade80" : MUTED }}>{b.sellThroughPct != null ? `${b.sellThroughPct}%` : "-"}</td>
   <Td right>{b.avgDaysToSell != null ? `${b.avgDaysToSell}d` : "-"}</Td>
  </tr>
  ))}</tbody>
 </table>
 </div>
 </div>
 )}

 {/* 3. Search-trend intelligence */}
 {products && products.searchTrends && (products.searchTrends.rising.length > 0 || products.searchTrends.top.length > 0) && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>📈 Search trends</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>What shoppers are typing now vs the prior {products.searchTrends.windowDays}d. Rising + low results = a sourcing alarm.</p>
 {products.searchTrends.rising.length > 0 && (
 <>
  <div style={{ fontSize: 12, color: MUTED, margin: "0 0 8px", fontWeight: 600 }}>Rising</div>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
  {products.searchTrends.rising.map((t) => (
   <span key={t.query} style={{ fontSize: 12.5, padding: "5px 11px", border: LINE, borderRadius: 999 }}>
   {t.query} <span style={{ color: "#4ade80" }}>{t.isNew ? "NEW" : `+${t.deltaPct}%`}</span>
   <span style={{ color: FAINT }}> · {t.current}×{t.results <= 3 ? ` · ${t.results} results` : ""}</span>
   </span>
  ))}
  </div>
 </>
 )}
 {products.searchTrends.falling.length > 0 && (
 <>
  <div style={{ fontSize: 12, color: MUTED, margin: "0 0 8px", fontWeight: 600 }}>Cooling</div>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
  {products.searchTrends.falling.map((t) => (
   <span key={t.query} style={{ fontSize: 12.5, padding: "5px 11px", border: LINE, borderRadius: 999 }}>
   {t.query} <span style={{ color: "#f87171" }}>{t.deltaPct}%</span>
   </span>
  ))}
  </div>
 </>
 )}
 </div>
 )}

 {/* 4. Sizing & fit demand */}
 {products && products.sizing && products.sizing.sizes.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>📏 Sizing &amp; fit demand</h2>
 <p style={{ color: FAINT, fontSize: 12, margin: "0 0 14px" }}>Engagement vs stock by size (region prefix ignored). High demand-per-listing = under-served sizes.</p>
 <div style={{ overflowX: "auto" }}>
 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
  <thead><tr><Th>Size</Th><Th right>Demand</Th><Th right>Views</Th><Th right>Favorites</Th><Th right>In stock</Th><Th right>Demand / unit</Th></tr></thead>
  <tbody>{products.sizing.sizes.map((s) => (
  <tr key={s.size} style={{ borderTop: LINE }}>
   <Td bold>{s.size}</Td><Td right>{s.demand.toLocaleString()}</Td>
   <Td right>{s.views.toLocaleString()}</Td><Td right>{s.favorites.toLocaleString()}</Td>
   <Td right>{s.supply.toLocaleString()}</Td>
   <td style={{ padding: "9px 10px", textAlign: "right", color: (s.ratio ?? 0) >= 10 ? "#d4af37" : MUTED, fontWeight: 600 }}>{s.ratio != null ? s.ratio.toLocaleString() : "-"}</td>
  </tr>
  ))}</tbody>
 </table>
 </div>
 </div>
 )}

 {/* Category demand + sourcing */}
 {demand && demand.topCategories.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Category demand</h2>
 {demand.topCategories.map((c) => (
 <div key={c.category} style={{ display: "flex", justifyContent: "space-between", borderTop: LINE, padding: "8px 2px" }}>
  <span style={{ fontWeight: 600 }}>{c.category}</span>
  <span style={{ color: MUTED, fontSize: 12.5 }}>{sig(c)}</span>
 </div>
 ))}
 </div>
 )}

 {demand && demand.openSourcing.length > 0 && (
 <div style={card}>
 <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Open buyer requests</h2>
 {demand.openSourcing.map((s) => (
 <div key={s.id} style={{ borderTop: LINE, padding: "8px 2px" }}>
  <span style={{ fontWeight: 600 }}>{s.description}</span>
  <span style={{ color: FAINT, fontSize: 12, marginLeft: 8 }}>${s.priceMin}–${s.priceMax}{s.size ? ` · ${s.size}` : ""} · by {s.deadline}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 );
}
