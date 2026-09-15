"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Colour tokens (match the rest of admin) ───────────────────────────────────
const DARK   = "#09090b";
const GRAY   = "#71717a";
const MUTED  = "#a1a1aa";
const BORDER = "#e4e4e7";
const BG_PAGE = "#f8f9fa";
const BG_CARD = "#ffffff";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "warning" | "info" | "good";

type Alert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  detail: string;
  action: string;
  href: string;
};

type FunnelStage = { stage: string; sessions: number; pct: number };
type ExitRate    = { page: string; exits: number; totalVisits: number; exitRate: number };
type TimeOnPage  = { page: string; avgMs: number; sampleSize: number };

type SessionData = {
  summary: {
    totalSessions: number;
    uniqueUsers: number;
    avgSessionDepth: number;
    avgDuration: number;
    bounceRate: number;
  };
  funnel: FunnelStage[];
  exitRates: ExitRate[];
  topPaths: { path: string; count: number }[];
  timeOnPage: TimeOnPage[];
};

type AnalyticsKPIs = {
  totalClicks: number;
  totalViews: number;
  totalRevenue: number;
  totalConversions: number;
  matchedConversions: number;
  unmatchedConversions: number;
  totalCustomers: number;
  approvedCustomers: number;
  newSignupsThisWeek: number;
  totalCommission?: number;
};

type ConversionRow = {
  conversionId: string;
  timestamp: string;
  orderId: string;
  orderTotal: number;
  storeName: string;
  matched: boolean;
  buyerEmail: string | null;
  returned: boolean;
};

type AnalyticsData = {
  kpis: AnalyticsKPIs;
  recentConversions: ConversionRow[];
  topStores: { store: string; clicks: number; conversions: number; revenue: number }[];
  trafficSources: { source: string; visits: number; knownUsers: number }[];
};

type CohortPoint = { cohort: string; period: number; retentionPct: number; cohortSize: number };

// ── Alert generation ──────────────────────────────────────────────────────────

function generateAlerts(
  analytics: AnalyticsData | null,
  session: SessionData | null,
  cohort: CohortPoint[],
): Alert[] {
  const alerts: Alert[] = [];

  // ── Session / Funnel alerts ────────────────────────────────────────────────

  if (session) {
    const { summary, funnel, exitRates } = session;

    if (summary.bounceRate > 0.65) {
      alerts.push({
        id: "bounce",
        severity: "warning",
        category: "Session Quality",
        title: `${(summary.bounceRate * 100).toFixed(0)}% bounce rate`,
        detail: "More than half of sessions end after just one page. Users aren't finding a reason to keep browsing.",
        action: "Review session paths",
        href: "/admin/session-flows",
      });
    }

    // Step-by-step funnel drop-offs
    const stages = funnel;
    const total = stages[0]?.sessions ?? 0;
    if (total > 0) {
      const browsed  = stages[1]?.sessions ?? 0;
      const viewed   = stages[2]?.sessions ?? 0;
      const clicked  = stages[3]?.sessions ?? 0;
      const ordered  = stages[4]?.sessions ?? 0;

      const browseRate = browsed / total;
      if (browseRate < 0.4 && total > 20) {
        alerts.push({
          id: "funnel-browse",
          severity: "warning",
          category: "Funnel Drop-off",
          title: `Only ${(browseRate * 100).toFixed(0)}% of sessions reach the browse page`,
          detail: "Most visitors leave before exploring inventory. Consider improving the landing page CTA.",
          action: "Analyze session flows",
          href: "/admin/session-flows",
        });
      }

      if (browsed > 0) {
        const viewRate = viewed / browsed;
        if (viewRate < 0.25 && browsed > 10) {
          alerts.push({
            id: "funnel-view",
            severity: "warning",
            category: "Funnel Drop-off",
            title: `Only ${(viewRate * 100).toFixed(0)}% of browsers open a product`,
            detail: "Product cards aren't generating enough clicks. Check images, pricing, and grid layout.",
            action: "Review top products",
            href: "/admin/analytics",
          });
        }
      }

      if (viewed > 0) {
        const clickRate = clicked / viewed;
        if (clickRate < 0.20 && viewed > 10) {
          alerts.push({
            id: "funnel-click",
            severity: "warning",
            category: "Funnel Drop-off",
            title: `Only ${(clickRate * 100).toFixed(0)}% of product viewers click through to store`,
            detail: "Users browse product pages but don't buy. Price, description, or trust signals may be the blocker.",
            action: "Check product pages",
            href: "/admin/session-flows",
          });
        }
      }

      if (clicked > 0 && ordered > 0) {
        const orderRate = ordered / clicked;
        if (orderRate < 0.05 && clicked > 20) {
          alerts.push({
            id: "funnel-order",
            severity: "info",
            category: "Funnel Drop-off",
            title: `Only ${(orderRate * 100).toFixed(0)}% of store clicks result in an order`,
            detail: "High click-to-no-purchase rate may indicate checkout friction or sizing/fit concerns at the store.",
            action: "View conversions",
            href: "/admin/conversions",
          });
        }
      }
    }

    // High exit rate pages
    const worstExit = [...exitRates].sort((a, b) => b.exitRate - a.exitRate)[0];
    if (worstExit && worstExit.exitRate > 0.7 && worstExit.totalVisits > 20) {
      alerts.push({
        id: "exit-" + worstExit.page,
        severity: "warning",
        category: "Exit Rates",
        title: `"${worstExit.page}" pages have a ${(worstExit.exitRate * 100).toFixed(0)}% exit rate`,
        detail: `${worstExit.exits} of ${worstExit.totalVisits} visits to this page type end the session. Something is stopping users from continuing.`,
        action: "Investigate exits",
        href: "/admin/session-flows",
      });
    }
  }

  // ── Conversion / attribution alerts ───────────────────────────────────────

  if (analytics) {
    const { kpis, recentConversions } = analytics;

    if (kpis.totalConversions > 0) {
      const unmatchedPct = kpis.unmatchedConversions / kpis.totalConversions;
      if (unmatchedPct > 0.25) {
        alerts.push({
          id: "unmatched",
          severity: "warning",
          category: "Attribution",
          title: `${kpis.unmatchedConversions} orders not attributed to VYA clicks`,
          detail: `${(unmatchedPct * 100).toFixed(0)}% of orders have no matching click. We can't prove our impact to stores or investors.`,
          action: "Match manually",
          href: "/admin/conversions?filter=unmatched",
        });
      }
    }

    if (kpis.totalConversions === 0) {
      alerts.push({
        id: "no-conversions",
        severity: "critical",
        category: "Revenue",
        title: "No orders tracked in the last 7 days",
        detail: "Either no purchases occurred or the conversion sync is broken.",
        action: "Check sync",
        href: "/admin/analytics",
      });
    }

    // Returned orders
    const returned = recentConversions.filter((c) => c.returned);
    if (returned.length >= 2) {
      alerts.push({
        id: "returns",
        severity: "info",
        category: "Returns",
        title: `${returned.length} orders returned recently`,
        detail: "Elevated return rate may signal sizing issues or mismatched product descriptions.",
        action: "Review returns",
        href: "/admin/returns",
      });
    }
  }

  // ── Cohort / retention alerts ──────────────────────────────────────────────

  if (cohort.length > 0) {
    const m1Points = cohort.filter((p) => p.period === 1 && p.cohortSize >= 3);
    if (m1Points.length > 0) {
      const avgM1 = m1Points.reduce((s, p) => s + p.retentionPct, 0) / m1Points.length;
      if (avgM1 < 20) {
        alerts.push({
          id: "retention",
          severity: "info",
          category: "Retention",
          title: `Low repeat-purchase rate: avg M+1 retention is ${avgM1.toFixed(0)}%`,
          detail: "Less than 1 in 5 buyers returns the following month. Explore email nudges, new arrivals alerts, or loyalty mechanics.",
          action: "View cohort curves",
          href: "/admin/analytics",
        });
      } else if (avgM1 >= 35) {
        alerts.push({
          id: "retention-good",
          severity: "good",
          category: "Retention",
          title: `Strong M+1 retention: ${avgM1.toFixed(0)}% of buyers return`,
          detail: "This is a diligence-ready number. Flag it in investor decks.",
          action: "View cohort curves",
          href: "/admin/analytics",
        });
      }
    }
  }

  // Sort: critical → warning → info → good
  const order: AlertSeverity[] = ["critical", "warning", "info", "good"];
  return alerts.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_STYLES: Record<AlertSeverity, { bg: string; border: string; dot: string; label: string }> = {
  critical: { bg: "#fef2f2", border: "#fca5a5", dot: "#dc2626", label: "CRITICAL" },
  warning:  { bg: "#fefce8", border: "#fde047", dot: "#b45309", label: "FIX"      },
  info:     { bg: "#eff6ff", border: "#bfdbfe", dot: "#2563eb", label: "WATCH"    },
  good:     { bg: "#f0fdf4", border: "#86efac", dot: "#16a34a", label: "GOOD"     },
};

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }
function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Funnel Bar ────────────────────────────────────────────────────────────────

function FunnelRow({ stage, sessions, pct, prevSessions, isFirst }: {
  stage: string; sessions: number; pct: number; prevSessions?: number; isFirst: boolean;
}) {
  const dropOff = prevSessions != null && prevSessions > 0
    ? ((prevSessions - sessions) / prevSessions) * 100
    : 0;
  const isBad = dropOff > 60;
  const isMed = dropOff > 35;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: DARK }}>{stage}</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {!isFirst && prevSessions != null && dropOff > 0 && (
            <span style={{ fontSize: 11, color: isBad ? "#dc2626" : isMed ? "#b45309" : GRAY }}>
              ↓ {dropOff.toFixed(0)}% dropped
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, color: DARK }}>{sessions.toLocaleString()}</span>
        </div>
      </div>
      <div style={{ height: 8, background: BORDER, borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.max(pct, 0.5)}%`,
            borderRadius: 4,
            background: isFirst ? DARK : isBad ? "#dc2626" : isMed ? "#b45309" : "#16a34a",
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Pulse Card ────────────────────────────────────────────────────────────────

function PulseCard({ label, value, sub, trend, href }: {
  label: string; value: string; sub?: string;
  trend?: "up" | "down" | "flat"; href?: string;
}) {
  const trendColor = trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : MUTED;
  const trendArrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "";
  const inner = (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px", flex: "1 1 140px", minWidth: 120 }}>
      <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: DARK, margin: 0, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: trendColor, margin: "4px 0 0" }}>{trendArrow}{trendArrow ? " " : ""}{sub}</p>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", flex: "1 1 140px", minWidth: 120, display: "block" }}>{inner}</Link> : inner;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SummaryPage() {
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [cohort, setCohort] = useState<CohortPoint[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [scrollReport, setScrollReport] = useState<{ section: string; unique: number; reachPct: number }[]>([]);

  const fetchAll = useCallback(async () => {
    const [aRes, sRes, cRes, srRes] = await Promise.allSettled([
      fetch("/api/admin/analytics-deep?range=7d").then((r) => r.json()),
      fetch("/api/admin/session-flows").then((r) => r.json()),
      fetch("/api/admin/cohort-retention").then((r) => r.json()),
      fetch("/api/admin/homepage-scroll-report?days=30").then((r) => r.json()),
    ]);

    const a: AnalyticsData | null = aRes.status === "fulfilled" ? aRes.value : null;
    const s: SessionData | null   = sRes.status === "fulfilled" ? sRes.value : null;
    const c: CohortPoint[]        = cRes.status === "fulfilled" ? (cRes.value?.cohorts ?? []) : [];
    const sr = srRes.status === "fulfilled" ? (srRes.value?.sections ?? []) : [];

    setAnalytics(a);
    setSession(s);
    setCohort(c);
    setScrollReport(sr);
    setAlerts(generateAlerts(a, s, c));
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60_000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const kpis = analytics?.kpis;
  const funnel = session?.funnel ?? [];
  const exitRates = session?.exitRates ?? [];
  const topStores = analytics?.topStores ?? [];
  const recentOrders = analytics?.recentConversions?.slice(0, 8) ?? [];

  // Top drop-off stage
  const biggestDrop = funnel.reduce<{ stage: string; drop: number; prev: string } | null>((best, cur, i) => {
    if (i === 0) return best;
    const prev = funnel[i - 1];
    const drop = prev.sessions > 0 ? ((prev.sessions - cur.sessions) / prev.sessions) * 100 : 0;
    if (!best || drop > best.drop) return { stage: cur.stage, drop, prev: prev.stage };
    return best;
  }, null);

  // M+1 retention
  const m1Points = cohort.filter((p) => p.period === 1 && p.cohortSize >= 3);
  const avgM1 = m1Points.length > 0
    ? m1Points.reduce((s, p) => s + p.retentionPct, 0) / m1Points.length
    : null;

  return (
    <div style={{ minHeight: "100vh", background: BG_PAGE, color: DARK, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: BG_CARD, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px", color: DARK }}>Command Center</h1>
            <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
              {loading ? "Loading…" : `Last refreshed ${relTime(lastRefresh.toISOString())} · auto-refreshes every 60s`}
            </p>
          </div>
          <button
            onClick={fetchAll}
            style={{ padding: "7px 16px", fontSize: 12, fontWeight: 500, borderRadius: 6, border: `1px solid ${BORDER}`, background: BG_CARD, color: DARK, cursor: "pointer" }}
          >
            Refresh Now
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>

        {/* ── Alerts ────────────────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 12px" }}>
              {alerts.filter(a => a.severity !== "good").length > 0
                ? `${alerts.filter(a => a.severity !== "good").length} thing${alerts.filter(a => a.severity !== "good").length === 1 ? "" : "s"} need attention`
                : "All clear"}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.map((alert) => {
                const s = SEV_STYLES[alert.severity];
                return (
                  <div
                    key={alert.id}
                    style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: s.dot }}>{s.label}</span>
                        <span style={{ fontSize: 10, color: GRAY, textTransform: "uppercase", letterSpacing: "0.07em" }}>{alert.category}</span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: DARK, margin: "0 0 2px" }}>{alert.title}</p>
                      <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{alert.detail}</p>
                    </div>
                    <Link
                      href={alert.href}
                      style={{ fontSize: 11, fontWeight: 500, color: DARK, textDecoration: "none", whiteSpace: "nowrap", border: `1px solid ${BORDER}`, background: "rgba(255,255,255,0.7)", padding: "4px 10px", borderRadius: 5, flexShrink: 0 }}
                    >
                      {alert.action} →
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Platform Pulse ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 12px" }}>
            Last 7 Days
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <PulseCard
              label="Revenue"
              value={kpis ? fmt$(kpis.totalRevenue) : "-"}
              href="/admin/key-metrics"
            />
            <PulseCard
              label="Orders"
              value={kpis ? kpis.totalConversions.toString() : "-"}
              sub={kpis && kpis.unmatchedConversions > 0 ? `${kpis.unmatchedConversions} unmatched` : undefined}
              trend={kpis && kpis.unmatchedConversions > 0 ? "down" : undefined}
              href="/admin/conversions"
            />
            <PulseCard
              label="Store Clicks"
              value={kpis ? kpis.totalClicks.toLocaleString() : "-"}
              href="/admin/analytics"
            />
            <PulseCard
              label="New Signups"
              value={kpis ? kpis.newSignupsThisWeek.toString() : "-"}
              href="/admin/customers"
            />
            <PulseCard
              label="Sessions"
              value={session ? session.summary.totalSessions.toLocaleString() : "-"}
              sub={session ? `${(session.summary.bounceRate * 100).toFixed(0)}% bounce` : undefined}
              trend={session && session.summary.bounceRate > 0.6 ? "down" : undefined}
              href="/admin/session-flows"
            />
            <PulseCard
              label="M+1 Retention"
              value={avgM1 != null ? `${avgM1.toFixed(0)}%` : "-"}
              sub={avgM1 != null ? (avgM1 >= 30 ? "healthy" : "needs work") : "collecting data"}
              trend={avgM1 != null ? (avgM1 >= 30 ? "up" : "down") : undefined}
              href="/admin/analytics"
            />
          </div>
        </div>

        {/* ── Two-column layout: Funnel + Drop-off ──────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>

          {/* Funnel */}
          <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 16px" }}>
              User Journey Funnel
            </p>
            {funnel.length === 0 ? (
              <p style={{ fontSize: 13, color: MUTED }}>No session data yet.</p>
            ) : (
              funnel.map((f, i) => (
                <FunnelRow
                  key={f.stage}
                  stage={f.stage}
                  sessions={f.sessions}
                  pct={f.pct}
                  prevSessions={i > 0 ? funnel[i - 1].sessions : undefined}
                  isFirst={i === 0}
                />
              ))
            )}
          </div>

          {/* Exit rates + biggest drop-off insight */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Biggest drop-off callout */}
            {biggestDrop && (
              <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 10, padding: "16px 20px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#b45309", margin: "0 0 6px" }}>
                  Biggest Drop-off
                </p>
                <p style={{ fontSize: 20, fontWeight: 700, color: DARK, margin: "0 0 4px" }}>
                  {biggestDrop.drop.toFixed(0)}% lost at "{biggestDrop.stage}"
                </p>
                <p style={{ fontSize: 12, color: GRAY, margin: "0 0 10px" }}>
                  {biggestDrop.drop.toFixed(0)}% of sessions that reach "{biggestDrop.prev}" never make it to "{biggestDrop.stage}". This is where you're losing the most people.
                </p>
                <Link href="/admin/session-flows" style={{ fontSize: 11, fontWeight: 500, color: DARK, textDecoration: "underline" }}>
                  Investigate in Session Flows →
                </Link>
              </div>
            )}

            {/* Exit rates */}
            <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px", flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 12px" }}>
                Exit Rate by Page
              </p>
              {exitRates.length === 0 ? (
                <p style={{ fontSize: 13, color: MUTED }}>No exit data yet.</p>
              ) : (
                [...exitRates].sort((a, b) => b.exitRate - a.exitRate).slice(0, 6).map((e) => {
                  const pct = e.exitRate * 100;
                  const color = pct > 65 ? "#dc2626" : pct > 45 ? "#b45309" : "#16a34a";
                  return (
                    <div key={e.page} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: DARK, width: 100, flexShrink: 0, textTransform: "capitalize" }}>{e.page}</span>
                      <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color, width: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Homepage Scroll Depth ────────────────────────────────────────── */}
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: 0 }}>
                Homepage: How Far Do People Scroll?
              </p>
              <p style={{ fontSize: 11, color: MUTED, margin: "4px 0 0" }}>% of homepage visitors who reach each section (last 30 days)</p>
            </div>
          </div>
          {scrollReport.length === 0 || scrollReport.every(s => s.unique === 0) ? (
            <p style={{ fontSize: 13, color: MUTED }}>No data yet. Will populate after first homepage visits post-deploy.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {scrollReport.map((s, i) => {
                const label: Record<string, string> = {
                  "hero": "Hero (above fold)",
                  "how-it-works": "How It Works",
                  "favorites": "Everyone's Favorites",
                  "collections": "Collections",
                  "stores": "Shop by Store",
                  "new-arrivals": "New Arrivals",
                  "categories": "Shop by Category",
                };
                const isFirst = i === 0;
                const prev = i > 0 ? scrollReport[i - 1].reachPct : 100;
                const drop = isFirst ? 0 : prev - s.reachPct;
                const isBad = drop > 30;
                return (
                  <div key={s.section}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: DARK }}>{label[s.section] ?? s.section}</span>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        {!isFirst && drop > 0 && (
                          <span style={{ fontSize: 11, color: isBad ? "#dc2626" : GRAY }}>↓ {drop.toFixed(0)}% leave here</span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 600, color: DARK }}>{s.reachPct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.reachPct}%`, borderRadius: 3, background: isFirst ? DARK : isBad ? "#dc2626" : "#16a34a", transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Store Health ──────────────────────────────────────────────────── */}
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: 0 }}>
              Store Performance (7d)
            </p>
            <Link href="/admin/analytics" style={{ fontSize: 11, color: GRAY, textDecoration: "none" }}>View all →</Link>
          </div>
          {topStores.length === 0 ? (
            <p style={{ fontSize: 13, color: MUTED }}>No store data yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {["Store", "Clicks", "Orders", "Revenue", "Conv. Rate"].map((h) => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: h === "Store" ? "left" : "right", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topStores.slice(0, 8).map((s, i) => {
                    const convRate = s.clicks > 0 ? (s.conversions / s.clicks) * 100 : 0;
                    const rateColor = convRate > 5 ? "#16a34a" : convRate > 2 ? "#b45309" : MUTED;
                    return (
                      <tr key={s.store} style={{ borderBottom: i < topStores.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                        <td style={{ padding: "9px 10px", fontWeight: 500, color: DARK }}>{s.store}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: GRAY }}>{s.clicks.toLocaleString()}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", color: GRAY }}>{s.conversions}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 600, color: s.revenue > 0 ? DARK : MUTED }}>{s.revenue > 0 ? fmt$(s.revenue) : "-"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 600, color: rateColor }}>{s.clicks > 0 ? fmtPct(convRate) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Recent Orders ─────────────────────────────────────────────────── */}
        <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "20px 24px", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: 0 }}>
              Recent Orders
            </p>
            <Link href="/admin/conversions" style={{ fontSize: 11, color: GRAY, textDecoration: "none" }}>View all →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p style={{ fontSize: 13, color: MUTED }}>No orders recorded yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recentOrders.map((o) => (
                <div key={o.conversionId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: o.matched ? "#dcfce7" : "#fef9c3", color: o.matched ? "#15803d" : "#b45309", flexShrink: 0 }}>
                    {o.matched ? "MATCHED" : "UNMATCHED"}
                  </span>
                  {o.returned && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "#fef2f2", color: "#dc2626", flexShrink: 0 }}>
                      RETURNED
                    </span>
                  )}
                  <span style={{ fontWeight: 600, color: DARK, flexShrink: 0 }}>{fmt$(o.orderTotal)}</span>
                  <span style={{ color: GRAY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.storeName}</span>
                  <span style={{ color: MUTED, flexShrink: 0 }}>{relTime(o.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Quick Links ───────────────────────────────────────────────────── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "0 0 12px" }}>
            Admin Areas
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "Analytics", href: "/admin/analytics" },
              { label: "Session Flows", href: "/admin/session-flows" },
              { label: "Key Metrics", href: "/admin/key-metrics" },
              { label: "Conversions", href: "/admin/conversions" },
              { label: "Customers", href: "/admin/customers" },
              { label: "Sync Stores", href: "/admin/sync" },
              { label: "Market Data", href: "/admin/market-data" },
              { label: "Returns", href: "/admin/returns" },
              { label: "Emails", href: "/admin/emails" },
              { label: "Collabs", href: "/admin/collabs-links" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{ fontSize: 12, fontWeight: 500, color: DARK, textDecoration: "none", padding: "6px 14px", border: `1px solid ${BORDER}`, borderRadius: 6, background: BG_CARD }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
