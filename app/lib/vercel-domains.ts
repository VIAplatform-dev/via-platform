// ───────────────────────────────────────────────────────────────────────────
// Custom domains (Slice 3). Thin wrapper over the Vercel REST API so a seller
// can point their own domain (bought at GoDaddy/Squarespace or existing) at
// their VYA storefront. Adding a domain to the project makes Vercel route + SSL
// it; the seller then sets the DNS records we return. Host→store resolution
// lives in middleware + storefront_settings.custom_domain.
//
// Required env (set in Vercel project settings):
//   VERCEL_API_TOKEN   — a token from vercel.com/account/tokens
//   VERCEL_PROJECT_ID  — this project's id (Project Settings → General)
//   VERCEL_TEAM_ID     — optional, if the project lives under a team
// ───────────────────────────────────────────────────────────────────────────

const API = "https://api.vercel.com";

function cfg() {
 return {
 token: process.env.VERCEL_API_TOKEN || "",
 projectId: process.env.VERCEL_PROJECT_ID || "",
 teamId: process.env.VERCEL_TEAM_ID || "",
 };
}

/** Whether custom-domain features are usable (token + project configured). */
export function domainsConfigured(): boolean {
 const { token, projectId } = cfg();
 return Boolean(token && projectId);
}

function teamQuery(): string {
 const { teamId } = cfg();
 return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

function authHeaders(): HeadersInit {
 const { token } = cfg();
 return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export type DnsRecord = { type: "A" | "CNAME"; name: string; value: string };
export type DomainStatus = {
 domain: string;
 verified: boolean; // ownership verified by Vercel
 misconfigured: boolean; // DNS not pointing at Vercel yet
 records: DnsRecord[]; // what the seller should set at their registrar
 verification: { type: string; domain: string; value: string }[]; // TXT challenges, if any
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Add a domain to the Vercel project. Idempotent-ish: an already-attached
 * domain is treated as success. */
async function addOne(domain: string): Promise<{ ok: boolean; error?: string }> {
 const { projectId } = cfg();
 const res = await fetch(`${API}/v10/projects/${projectId}/domains${teamQuery()}`, {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ name: domain }),
 });
 if (res.ok) return { ok: true };
 const data = await res.json().catch(() => ({}));
 const code = data?.error?.code;
 if (code === "domain_already_in_use" || code === "domain_already_exists") return { ok: true };
 return { ok: false, error: data?.error?.message || "Couldn’t add the domain." };
}

export async function addDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
 if (!domainsConfigured()) return { ok: false, error: "Custom domains aren’t configured on the server yet." };
 const added = await addOne(domain);
 if (!added.ok) return added;
 // Register the www form too, so Vercel serves (or redirects) it once the
 // seller's CNAME points here. Best-effort: the apex is what they asked for, and
 // a www that can't be registered shouldn't fail the whole connection.
 if (isApexDomain(domain)) await addOne(`www.${domain}`).catch(() => ({ ok: false }));
 return { ok: true };
}

/** Remove a domain from the project — and its www form, which addDomain paired with it. */
export async function removeDomain(domain: string): Promise<{ ok: boolean }> {
 const { projectId } = cfg();
 if (!domainsConfigured()) return { ok: false };
 const drop = (name: string) =>
 fetch(`${API}/v9/projects/${projectId}/domains/${name}${teamQuery()}`, { method: "DELETE", headers: authHeaders() });
 const res = await drop(domain);
 // Leaving the www behind would keep it attached to this project and block the
 // next store that tries to connect the same domain.
 if (isApexDomain(domain)) await drop(`www.${domain}`).catch(() => {});
 return { ok: res.ok };
}

/** Apex vs subdomain → the DNS record the seller should create. */
/**
 * Two-part public suffixes, where the registrable domain has THREE labels.
 * Counting dots alone reads vintagestores.co.uk as a subdomain and hands a UK
 * seller a CNAME named "vintagestores" instead of an apex A record — pointing
 * their whole site at nothing. Not the full Public Suffix List (that's a large
 * dataset to vendor); these are the ones a store is realistically on.
 */
const MULTI_PART_SUFFIXES = new Set([
 "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "ac.uk",
 "com.au", "net.au", "org.au", "id.au",
 "co.nz", "net.nz", "org.nz",
 "co.jp", "or.jp", "ne.jp",
 "com.br", "com.mx", "com.ar", "com.co", "com.tr", "com.sg", "com.hk", "com.tw",
 "co.za", "co.kr", "co.in", "co.il", "co.id", "co.th",
 "com.cn", "net.cn", "org.cn",
 "co.at", "or.at", "com.es", "com.pl", "com.ua", "com.ph", "com.my", "com.vn",
]);

/** True for a bare domain like vintagestores.com, false for shop.vintagestores.com. */
export function isApexDomain(domain: string): boolean {
 const labels = domain.toLowerCase().replace(/\.$/, "").split(".");
 if (labels.length <= 2) return true;
 return labels.length === 3 && MULTI_PART_SUFFIXES.has(labels.slice(-2).join("."));
}

function recommendedRecords(domain: string): DnsRecord[] {
 // An apex needs BOTH: the A record for vintagestores.com, and a CNAME so
 // www.vintagestores.com resolves too. Plenty of people type www, and shared
 // links carry it — a storefront that 404s on the www form looks broken to the
 // shopper, who has no idea the two are different.
 return isApexDomain(domain)
 ? [
   { type: "A", name: "@", value: "76.76.21.21" },
   { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
  ]
 : [{ type: "CNAME", name: domain.split(".")[0], value: "cname.vercel-dns.com" }];
}

/** Current verification + DNS-config status for a domain on this project. */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
 const base: DomainStatus = {
 domain,
 verified: false,
 misconfigured: true,
 records: recommendedRecords(domain),
 verification: [],
 };
 if (!domainsConfigured()) return base;
 const { projectId } = cfg();

 try {
 const [projRes, confRes] = await Promise.all([
 fetch(`${API}/v9/projects/${projectId}/domains/${domain}${teamQuery()}`, { headers: authHeaders() }),
 fetch(`${API}/v6/domains/${domain}/config${teamQuery()}`, { headers: authHeaders() }),
 ]);
 const proj: any = await projRes.json().catch(() => ({}));
 const conf: any = await confRes.json().catch(() => ({}));
 return {
 domain,
 verified: Boolean(proj?.verified),
 misconfigured: conf?.misconfigured !== false, // true unless explicitly false
 records: recommendedRecords(domain),
 verification: Array.isArray(proj?.verification) ? proj.verification : [],
 };
 } catch {
 return base;
 }
}

function withTeam(path: string): string {
 const { teamId } = cfg();
 if (!teamId) return path;
 return path + (path.includes("?") ? "&" : "?") + `teamId=${encodeURIComponent(teamId)}`;
}

// New Vercel registrar API (the v4/status + v5/buy endpoints were sunsetted Nov 2025).
/** Is a domain available to register? */
export async function checkAvailability(domain: string): Promise<{ available: boolean }> {
 if (!domainsConfigured()) return { available: false };
 const res = await fetch(`${API}${withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/availability`)}`, { headers: authHeaders() });
 const d: any = await res.json().catch(() => ({}));
 return { available: Boolean(d?.available) };
}

/** Registration price for a domain, in cents. */
export async function getDomainPrice(domain: string, years = 1): Promise<{ priceCents: number; years: number } | null> {
 if (!domainsConfigured()) return null;
 const res = await fetch(`${API}${withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/price?years=${years}`)}`, { headers: authHeaders() });
 if (!res.ok) return null;
 const d: any = await res.json().catch(() => ({}));
 const price = d?.price ?? d?.purchasePrice ?? d?.amount;
 return price != null ? { priceCents: Math.round(Number(price) * 100), years } : null;
}

/**
 * TLDs offered when a seller searches for a name to buy.
 *
 * .com leads because that is what a customer types and what a seller means when
 * they say "I want vintagestore.com". The rest are the ones that still read as a
 * shop rather than a tech company — a resale store on .io looks like a startup.
 */
export const SUGGESTED_TLDS = ["com", "co", "shop", "store", "studio", "boutique", "style", "online"] as const;

export type DomainOption = { domain: string; tld: string; available: boolean; priceCents: number | null };

/**
 * GoDaddy-style search: take a name (bare, or a full domain) and report what can
 * actually be bought, across the TLDs above.
 *
 * Availability is checked for all of them at once; price is only fetched for the
 * ones that are free, since that is a second call per domain and there is no
 * point pricing something nobody can have. A registrar hiccup on one TLD marks
 * just that row unavailable rather than failing the whole search.
 */
export async function searchDomains(rawName: string): Promise<DomainOption[]> {
 if (!domainsConfigured()) return [];
 // "vintagestore.com" or "Vintage Store" both reduce to the same stem.
 const stem = String(rawName || "")
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "")
  .split(".")[0]
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/^-+|-+$/g, "");
 if (stem.length < 2) return [];

 const asked = String(rawName || "").toLowerCase().trim();
 const typedTld = asked.includes(".") ? asked.split(".").slice(1).join(".") : null;
 // If they typed a TLD we don't normally offer, still check the exact thing they asked for.
 const tlds = typedTld && !SUGGESTED_TLDS.includes(typedTld as (typeof SUGGESTED_TLDS)[number])
  ? [typedTld, ...SUGGESTED_TLDS]
  : [...SUGGESTED_TLDS];

 const checked = await Promise.all(
  tlds.map(async (tld) => {
   const domain = `${stem}.${tld}`;
   const { available } = await checkAvailability(domain).catch(() => ({ available: false }));
   return { domain, tld, available, priceCents: null as number | null };
  }),
 );

 await Promise.all(
  checked.filter((c) => c.available).map(async (c) => {
   const price = await getDomainPrice(c.domain).catch(() => null);
   c.priceCents = price?.priceCents ?? null;
  }),
 );

 // Available first, then in the order offered above (.com leads).
 return checked.sort((a, b) => Number(b.available) - Number(a.available) || tlds.indexOf(a.tld) - tlds.indexOf(b.tld));
}

export type DomainContact = { firstName: string; lastName: string; email: string; phone: string; address1: string; city: string; state: string; zip: string; country: string };

/** Buy a domain through Vercel's registrar (charges the platform's Vercel account).
 * Needs the registrant's contact info. expectedPrice (dollars) must match the quote. */
export async function buyDomain(domain: string, expectedPriceDollars: number, contact: DomainContact, years = 1): Promise<{ ok: boolean; orderId?: string; error?: string }> {
 if (!domainsConfigured()) return { ok: false, error: "Not configured." };
 const res = await fetch(`${API}${withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy`)}`, {
 method: "POST",
 headers: authHeaders(),
 body: JSON.stringify({ autoRenew: true, years, expectedPrice: expectedPriceDollars, contactInformation: contact }),
 });
 const d: any = await res.json().catch(() => ({}));
 if (res.ok) return { ok: true, orderId: d?.orderId };
 return { ok: false, error: d?.message || d?.error?.message || "Purchase failed — try again." };
}

/** Trigger Vercel to (re)check ownership verification. */
export async function verifyDomain(domain: string): Promise<{ verified: boolean }> {
 const { projectId } = cfg();
 if (!domainsConfigured()) return { verified: false };
 const res = await fetch(`${API}/v9/projects/${projectId}/domains/${domain}/verify${teamQuery()}`, {
 method: "POST",
 headers: authHeaders(),
 });
 const data: any = await res.json().catch(() => ({}));
 return { verified: Boolean(data?.verified) };
}

/** Turn auto-renew off — used when a seller's card fails, so VYA isn't billed for a domain it can't recover. */
export async function setAutoRenew(domain: string, renew: boolean): Promise<{ ok: boolean }> {
 if (!domainsConfigured()) return { ok: false };
 const res = await fetch(`${API}${withTeam(`/v3/domains/${encodeURIComponent(domain)}`)}`, {
  method: "PATCH",
  headers: authHeaders(),
  body: JSON.stringify({ op: "update", renew }),
 });
 return { ok: res.ok };
}

/**
 * Start a transfer out: the seller is taking the domain to another registrar.
 * Vercel returns the auth (EPP) code they'll paste at the receiving registrar.
 * The domain stays live here until the transfer completes on their side.
 */
export async function requestTransferOut(domain: string): Promise<{ ok: boolean; authCode?: string; error?: string }> {
 if (!domainsConfigured()) return { ok: false, error: "Domains aren’t configured." };
 const res = await fetch(`${API}${withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/transfer-out`)}`, {
  method: "POST",
  headers: authHeaders(),
 });
 const d: any = await res.json().catch(() => ({}));
 if (!res.ok) return { ok: false, error: d?.error?.message || "Couldn’t start the transfer." };
 const code = d?.authCode ?? d?.transferCode ?? d?.code ?? null;
 return code
  ? { ok: true, authCode: String(code) }
  : { ok: true, error: "Transfer unlocked. Your auth code will arrive by email from the registrar." };
}

// ── DNS records ────────────────────────────────────────────────────────────
// Only for domains registered THROUGH us: those sit on Vercel's nameservers, so
// Vercel is the zone and we can edit it. A domain the seller connected from
// their own registrar keeps its DNS there, and we must not pretend otherwise —
// records added here would simply never resolve.

export type DomainInfo = {
 /** True when Vercel runs this domain's nameservers, i.e. we can manage DNS. */
 managed: boolean;
 boughtThroughUs: boolean;
 expiresAt: string | null;
 autoRenew: boolean;
};

export async function getDomainInfo(domain: string): Promise<DomainInfo | null> {
 if (!domainsConfigured()) return null;
 const res = await fetch(`${API}${withTeam(`/v5/domains/${encodeURIComponent(domain)}`)}`, { headers: authHeaders() });
 if (!res.ok) return null;
 const d: any = await res.json().catch(() => ({}));
 const dom = d?.domain ?? d;
 return {
  // "zeit.world" is Vercel's own nameservers; "external" means someone else's.
  managed: dom?.serviceType === "zeit.world",
  boughtThroughUs: Boolean(dom?.boughtAt),
  expiresAt: dom?.expiresAt ? new Date(dom.expiresAt).toISOString() : null,
  autoRenew: Boolean(dom?.renew),
 };
}

export type ZoneRecord = { id: string; type: string; name: string; value: string; ttl: number | null; mxPriority: number | null; locked: boolean };

/**
 * The records that keep the storefront reachable. A seller deleting these takes
 * their own shop offline, so they're returned flagged and refused on delete —
 * everything else in the zone is theirs to change.
 */
function isStorefrontRecord(r: { type: string; name: string; value: string }): boolean {
 const name = (r.name || "").toLowerCase();
 const value = (r.value || "").toLowerCase();
 if (r.type === "A" && (name === "" || name === "@") && value === "76.76.21.21") return true;
 if (r.type === "CNAME" && name === "www" && value.includes("vercel-dns.com")) return true;
 return false;
}

export async function listDnsRecords(domain: string): Promise<ZoneRecord[]> {
 if (!domainsConfigured()) return [];
 const res = await fetch(`${API}${withTeam(`/v4/domains/${encodeURIComponent(domain)}/records`)}`, { headers: authHeaders() });
 if (!res.ok) return [];
 const d: any = await res.json().catch(() => ({}));
 return (d?.records ?? []).map((r: any) => ({
  id: String(r.id),
  type: String(r.type),
  name: String(r.name ?? ""),
  value: String(r.value ?? ""),
  ttl: r.ttl ?? null,
  mxPriority: r.mxPriority ?? r.priority ?? null,
  locked: isStorefrontRecord({ type: String(r.type), name: String(r.name ?? ""), value: String(r.value ?? "") }),
 }));
}

export async function createDnsRecord(domain: string, rec: { type: string; name: string; value: string; ttl?: number; mxPriority?: number }): Promise<{ ok: boolean; error?: string }> {
 if (!domainsConfigured()) return { ok: false, error: "Domains aren’t configured." };
 const body: Record<string, unknown> = { type: rec.type, name: rec.name, value: rec.value };
 if (rec.ttl) body.ttl = rec.ttl;
 if (rec.type === "MX") body.mxPriority = rec.mxPriority ?? 10;
 const res = await fetch(`${API}${withTeam(`/v2/domains/${encodeURIComponent(domain)}/records`)}`, {
  method: "POST",
  headers: authHeaders(),
  body: JSON.stringify(body),
 });
 if (res.ok) return { ok: true };
 const d: any = await res.json().catch(() => ({}));
 return { ok: false, error: d?.error?.message || "Couldn’t add that record." };
}

export async function deleteDnsRecord(domain: string, recordId: string): Promise<{ ok: boolean; error?: string }> {
 if (!domainsConfigured()) return { ok: false, error: "Domains aren’t configured." };
 // Re-read the zone so a locked record can't be deleted by id alone.
 const records = await listDnsRecords(domain);
 const target = records.find((r) => r.id === recordId);
 if (!target) return { ok: false, error: "That record no longer exists." };
 if (target.locked) return { ok: false, error: "That record points your domain at your storefront — removing it would take your shop offline." };
 const res = await fetch(`${API}${withTeam(`/v2/domains/${encodeURIComponent(domain)}/records/${recordId}`)}`, { method: "DELETE", headers: authHeaders() });
 return res.ok ? { ok: true } : { ok: false, error: "Couldn’t remove that record." };
}

/**
 * One-click MX presets. A vintage seller wanting hello@theirshop.com should not
 * have to hand-enter five MX rows with priorities — that is where mistakes and
 * silently-lost email come from.
 *
 * Only providers with a FIXED set of records belong here. Microsoft 365 is
 * deliberately absent: its MX host is tenant-specific, so a preset would add a
 * record that silently swallows mail. That one is added by hand.
 */
export const MX_PRESETS: Record<string, { label: string; records: { type: string; name: string; value: string; mxPriority: number }[] }> = {
 google: {
  label: "Google Workspace",
  records: [{ type: "MX", name: "@", value: "smtp.google.com", mxPriority: 1 }],
 },
 fastmail: {
  label: "Fastmail",
  records: [
   { type: "MX", name: "@", value: "in1-smtp.messagingengine.com", mxPriority: 10 },
   { type: "MX", name: "@", value: "in2-smtp.messagingengine.com", mxPriority: 20 },
  ],
 },
};
