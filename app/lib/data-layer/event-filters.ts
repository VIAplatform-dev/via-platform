// ───────────────────────────────────────────────────────────────────────────
// Event-quality filtering for the events ETL.
//
// Pure, dependency-free predicates (no config import at runtime, so they stay
// node-testable: the ETL injects the thresholds from config.ts, exactly like
// privacy.ts injects PRIVACY). The ETL feeds raw capture rows through
// `partitionEvents`, which drops bots, internal/seller traffic, and implausible
// bursts, and returns a reason breakdown (for the "% filtered" report).
//
// We never touch the legacy capture tables. This filters on the way INTO the
// unified `events` log only.
// ───────────────────────────────────────────────────────────────────────────

// Mirror of config.EVENT_FILTERS: passed in by the ETL so no threshold is ever
// hardcoded here.
export type EventFilterConfig = {
 botUserAgentPatterns: readonly string[];
 internalEmails: readonly string[];
 internalEmailDomains: readonly string[];
 burst: { minGapSeconds: number; maxPerUserProductPerDay: number };
};

// True when the user-agent looks like a bot/crawler/automation tool. A null UA
// is NOT treated as a bot (most capture tables don't store one. We don't want to
// drop all of them; bursts/internal still apply).
export function isBotUserAgent(ua: string | null | undefined, patterns: readonly string[]): boolean {
 if (!ua) return false;
 const s = ua.toLowerCase();
 return patterns.some((p) => s.includes(p));
}

// True when the email is ours (internal/admin/test) or a seller, never consumer
// demand. `sellerEmails` is injected by the ETL from storeContactEmails.
export function isInternalOrSeller(
 email: string | null | undefined,
 opts: {
 internalEmails: readonly string[];
 internalEmailDomains: readonly string[];
 sellerEmails?: ReadonlySet<string>;
 },
): boolean {
 if (!email) return false;
 const e = email.trim().toLowerCase();
 if (!e) return false;
 if (opts.internalEmails.some((x) => x.toLowerCase() === e)) return true;
 const domain = e.split("@")[1] ?? "";
 if (domain && opts.internalEmailDomains.some((d) => d.toLowerCase() === domain)) return true;
 if (opts.sellerEmails && opts.sellerEmails.has(e)) return true;
 return false;
}

export type BurstInput = {
 userId: string | null;
 productId: number | null;
 eventType: string;
 tsMs: number; // event time, epoch ms
};

// Returns a keep-mask (aligned to input order). For each (userId · productId ·
// eventType) group we debounce rapid repeats and cap per UTC day. Anonymous
// events (userId == null) can't be attributed to a hammering user → always kept.
export function markBursts<T extends BurstInput>(
 events: T[],
 cfg: { minGapSeconds: number; maxPerUserProductPerDay: number },
): boolean[] {
 const keep = new Array<boolean>(events.length).fill(true);
 const groups = new Map<string, number[]>();
 events.forEach((e, i) => {
 if (e.userId == null) return; // anonymous → keep, can't attribute
 const key = `${e.userId}|${e.productId ?? "?"}|${e.eventType}`;
 const arr = groups.get(key);
 if (arr) arr.push(i);
 else groups.set(key, [i]);
 });

 for (const idxs of groups.values()) {
 idxs.sort((a, b) => events[a].tsMs - events[b].tsMs);
 let lastKeptMs = -Infinity;
 const perDay = new Map<number, number>();
 for (const i of idxs) {
  const tsMs = events[i].tsMs;
  const day = Math.floor(tsMs / 86_400_000);
  const gapOk = (tsMs - lastKeptMs) / 1000 >= cfg.minGapSeconds;
  const dayCount = perDay.get(day) ?? 0;
  const capOk = dayCount < cfg.maxPerUserProductPerDay;
  if (gapOk && capOk) {
  keep[i] = true;
  lastKeptMs = tsMs;
  perDay.set(day, dayCount + 1);
  } else {
  keep[i] = false;
  }
 }
 }
 return keep;
}

export type FilterStats = {
 total: number;
 kept: number;
 bot: number;
 internal: number;
 burst: number;
};

export function emptyFilterStats(): FilterStats {
 return { total: 0, kept: 0, bot: 0, internal: 0, burst: 0 };
}

export function mergeFilterStats(a: FilterStats, b: FilterStats): FilterStats {
 return {
 total: a.total + b.total,
 kept: a.kept + b.kept,
 bot: a.bot + b.bot,
 internal: a.internal + b.internal,
 burst: a.burst + b.burst,
 };
}

export type FilterableEvent = BurstInput & {
 userAgent: string | null;
 email: string | null;
};

// Drop bots, internal/seller traffic, and bursts. Per-row checks (bot, internal)
// first so burst detection only sees real consumer events; then burst across the
// survivors. `skipBurst` is for orders (real money, null productId. They'd all
// group under one key and a multi-item order would be collapsed). Returns the
// kept items + a reason breakdown.
export function partitionEvents<T extends FilterableEvent>(
 events: T[],
 ctx: { config: EventFilterConfig; sellerEmails?: ReadonlySet<string>; skipBurst?: boolean },
): { kept: T[]; stats: FilterStats } {
 const stats = emptyFilterStats();
 stats.total = events.length;

 const rowKeep = events.map((e) => {
 if (isBotUserAgent(e.userAgent, ctx.config.botUserAgentPatterns)) {
  stats.bot++;
  return false;
 }
 if (
  isInternalOrSeller(e.email, {
  internalEmails: ctx.config.internalEmails,
  internalEmailDomains: ctx.config.internalEmailDomains,
  sellerEmails: ctx.sellerEmails,
  })
 ) {
  stats.internal++;
  return false;
 }
 return true;
 });

 const survivors = events.filter((_, i) => rowKeep[i]);
 const burstKeep = ctx.skipBurst ? survivors.map(() => true) : markBursts(survivors, ctx.config.burst);

 const kept: T[] = [];
 let si = 0;
 for (let i = 0; i < events.length; i++) {
 if (!rowKeep[i]) continue;
 if (burstKeep[si]) kept.push(events[i]);
 else stats.burst++;
 si++;
 }
 stats.kept = kept.length;
 return { kept, stats };
}
