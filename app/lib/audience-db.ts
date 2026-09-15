import { neon } from "@neondatabase/serverless";

// "Where your shoppers come from". Attribution by acquisition channel. Clicks from
// the clicks table (utm_source captured on landing), orders + sales by joining
// conversions back to the click that drove them (conversions.via_click_id), so each
// channel gets real conversion rate + AOV. New vs returning from first-order status.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

// Raw utm_source / referrer → a friendly channel bucket.
function channelOf(src: string): string {
 const s = (src || "").toLowerCase().trim();
 if (!s || s === "direct" || s === "unknown" || s === "none") return "Direct";
 if (s.includes("instagram") || s === "ig") return "Instagram";
 if (s.includes("tiktok") || s === "tt") return "TikTok";
 if (s.includes("email") || s.includes("klaviyo") || s.includes("newsletter")) return "Email";
 if (s.includes("pinterest") || s === "pin") return "Pinterest";
 if (s.includes("facebook") || s === "fb") return "Facebook";
 if (s.includes("youtube") || s === "yt") return "YouTube";
 if (s.includes("twitter") || s === "x" || s === "x.com" || s === "t.co") return "X";
 if (s.includes("google")) return "Google";
 if (s.includes("reddit")) return "Reddit";
 if (s.includes(".")) return "Referral"; // a referrer domain
 return src.charAt(0).toUpperCase() + src.slice(1);
}

export type ChannelRow = { channel: string; clicks: number; orders: number; sales: number; convPct: number; aov: number };
export type Attribution = {
 rows: ChannelRow[];
 totals: { clicks: number; orders: number; sales: number; convPct: number; aov: number };
 newCustomers: number;
 returningCustomers: number;
};

export async function getAttribution(storeSlug: string, sinceDays?: number): Promise<Attribution> {
 const sql = db();
 const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;

 const clickRows = (cutoff
 ? await sql`SELECT COALESCE(NULLIF(utm_source, ''), 'direct') AS source, COUNT(*)::int AS clicks
 FROM clicks WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY 1`
 : await sql`SELECT COALESCE(NULLIF(utm_source, ''), 'direct') AS source, COUNT(*)::int AS clicks
 FROM clicks WHERE store_slug = ${storeSlug} GROUP BY 1`) as { source: string; clicks: number }[];

 const ordRows = (cutoff
 ? await sql`SELECT COALESCE(NULLIF(c.utm_source, ''), 'direct') AS source, COUNT(*)::int AS orders, COALESCE(SUM(conv.order_total), 0)::float AS sales
 FROM conversions conv JOIN clicks c ON c.click_id = conv.via_click_id
 WHERE conv.store_slug = ${storeSlug} AND conv.timestamp >= ${cutoff} GROUP BY 1`
 : await sql`SELECT COALESCE(NULLIF(c.utm_source, ''), 'direct') AS source, COUNT(*)::int AS orders, COALESCE(SUM(conv.order_total), 0)::float AS sales
 FROM conversions conv JOIN clicks c ON c.click_id = conv.via_click_id
 WHERE conv.store_slug = ${storeSlug} GROUP BY 1`) as { source: string; orders: number; sales: number }[];

 const nr = (cutoff
 ? await sql`WITH ord AS (SELECT user_id, timestamp, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp) AS rn
 FROM conversions WHERE store_slug = ${storeSlug} AND user_id IS NOT NULL)
 SELECT COUNT(*) FILTER (WHERE rn = 1 AND timestamp >= ${cutoff})::int AS new_c,
 COUNT(*) FILTER (WHERE rn > 1 AND timestamp >= ${cutoff})::int AS ret_c FROM ord`
 : await sql`WITH ord AS (SELECT user_id, timestamp, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp) AS rn
 FROM conversions WHERE store_slug = ${storeSlug} AND user_id IS NOT NULL)
 SELECT COUNT(*) FILTER (WHERE rn = 1)::int AS new_c, COUNT(*) FILTER (WHERE rn > 1)::int AS ret_c FROM ord`) as { new_c: number; ret_c: number }[];

 const byChannel = new Map<string, ChannelRow>();
 const row = (src: string): ChannelRow => {
 const ch = channelOf(src);
 let r = byChannel.get(ch);
 if (!r) { r = { channel: ch, clicks: 0, orders: 0, sales: 0, convPct: 0, aov: 0 }; byChannel.set(ch, r); }
 return r;
 };
 for (const r of clickRows) row(String(r.source)).clicks += Number(r.clicks);
 for (const r of ordRows) { const t = row(String(r.source)); t.orders += Number(r.orders); t.sales += Number(r.sales); }

 const rows = [...byChannel.values()]
 .map((r) => ({ ...r, convPct: r.clicks ? +((r.orders / r.clicks) * 100).toFixed(1) : 0, aov: r.orders ? Math.round(r.sales / r.orders) : 0 }))
 .sort((a, b) => b.clicks - a.clicks);

 const t = rows.reduce((acc, r) => ({ clicks: acc.clicks + r.clicks, orders: acc.orders + r.orders, sales: acc.sales + r.sales }), { clicks: 0, orders: 0, sales: 0 });
 const totals = { ...t, convPct: t.clicks ? +((t.orders / t.clicks) * 100).toFixed(1) : 0, aov: t.orders ? Math.round(t.sales / t.orders) : 0 };

 return { rows, totals, newCustomers: Number(nr[0]?.new_c || 0), returningCustomers: Number(nr[0]?.ret_c || 0) };
}

export type Trend = { days: string[]; series: { channel: string; counts: number[] }[] };

/** Daily click-throughs for the top channels, for a sparkline-style trend chart. */
export async function getChannelTrend(storeSlug: string, sinceDays = 30): Promise<Trend> {
 const sql = db();
 const cutoff = new Date(Date.now() - sinceDays * 86400000).toISOString();
 const rows = (await sql`SELECT to_char(date_trunc('day', timestamp), 'MM-DD') AS day, COALESCE(NULLIF(utm_source, ''), 'direct') AS source, COUNT(*)::int AS clicks
 FROM clicks WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff} GROUP BY 1, 2 ORDER BY 1`) as { day: string; source: string; clicks: number }[];

 // A continuous day axis so the lines don't jump over gaps.
 const days: string[] = [];
 for (let i = sinceDays - 1; i >= 0; i--) {
 const d = new Date(Date.now() - i * 86400000);
 days.push(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
 }
 const totals = new Map<string, number>();
 for (const r of rows) { const c = channelOf(r.source); totals.set(c, (totals.get(c) || 0) + Number(r.clicks)); }
 const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
 const series = top.map((ch) => {
 const byDay = new Map<string, number>();
 for (const r of rows) if (channelOf(r.source) === ch) byDay.set(r.day, (byDay.get(r.day) || 0) + Number(r.clicks));
 return { channel: ch, counts: days.map((d) => byDay.get(d) || 0) };
 });
 return { days, series };
}

/** Total store sales in the period. Every conversion, attributed to a click or not.
 *  The denominator for "share of sales attributed to marketing". */
export async function getStoreSalesTotal(storeSlug: string, sinceDays?: number): Promise<number> {
 const sql = db();
 const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86400000).toISOString() : null;
 const rows = (cutoff
 ? await sql`SELECT COALESCE(SUM(order_total), 0)::float AS total FROM conversions WHERE store_slug = ${storeSlug} AND timestamp >= ${cutoff}`
 : await sql`SELECT COALESCE(SUM(order_total), 0)::float AS total FROM conversions WHERE store_slug = ${storeSlug}`) as { total: number }[];
 return Number(rows[0]?.total || 0);
}
