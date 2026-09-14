// Where a seller's shop actually lives, and whether it answers. Pure.
//
// THE BUG THIS EXISTS TO END. `/api/store/me` returns a `website` field, and every screen that
// wanted to say "your storefront" reached for it. It is not the storefront. It is the shop's OWN
// EXTERNAL SITE — the Shopify or Squarespace address VYA syncs its catalogue from — so the Store
// tab opened blummier.com, situationsvintage.com, and for the admin account the VYA marketplace
// homepage. A seller checking her VYA shop was shown the site she already had.
//
// THE ADDRESS IS THE SERVER'S TO SAY, NOT THIS APP'S. `/api/store/storefront` answers with
// `publicOrigin`, computed by the same helper the proxy routes on (storePublicOrigin). Building
// `{slug}.vyasites.com` here instead would be a second opinion that drifts: the suffix is
// configuration, and when it is unset there is no public storefront address AT ALL — a state a
// hardcoded string cannot express, and would paper over by inventing an address that 404s.
//
// WHETHER IT ANSWERS IS OBSERVED, NOT DEDUCED. A storefront serves when it is switched on OR when a
// captured copy of the seller's old site exists, and those two live in different places. Rather than
// reimplementing that rule here and being subtly wrong, the screen reports what the load itself
// returned. The seller gets the truth rather than our model of it.

export type DomainState = {
  configured?: boolean;
  domain?: string | null;
  status?: { domain?: string; verified?: boolean; misconfigured?: boolean } | null;
} | null | undefined;

export type StorefrontState = {
  publicOrigin?: string | null;
  settings?: { handle?: string; enabled?: boolean; customDomain?: string | null; serveMode?: "imported" | "built" | null } | null;
} | null | undefined;

const bareHost = (v: string): string => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

/**
 * The one address shoppers reach her on, or null when she has none yet.
 *
 * A verified custom domain wins; an unverified one is a DNS record somebody still has to add, and
 * naming it as her address sends her to check a page that cannot load.
 */
export function storefrontAddress(sf: StorefrontState, domain?: DomainState): { url: string; host: string } | null {
  const verified = domain?.status?.verified && !domain.status.misconfigured
    ? bareHost(String(domain.domain ?? domain.status?.domain ?? ""))
    : "";
  const host = verified || (sf?.publicOrigin ? bareHost(sf.publicOrigin) : "");
  if (!host) return null;
  return { url: `https://${host}`, host };
}

export type Reach = { line: string; good: boolean };

/**
 * What to say under the address, from what the address itself said.
 *
 * `status` is what loading it returned — 0 when it could not be reached at all, undefined while the
 * load is still in flight. The 404 case is the one that matters and the one nothing
 * in the app ever said: the address is reserved for her, and the page behind it is not switched on
 * at our end. That is not her fault, there is nothing for her to fix, and it used to arrive as a
 * black-on-white Next.js 404 rendered inside her own app.
 */
export function describeReach(status: number | undefined, domain?: DomainState): Reach {
  const own = Boolean(domain?.status?.verified && !domain.status.misconfigured);
  if (status === undefined) return { line: "Checking…", good: false };
  if (status === 0) return { line: "Couldn't reach it just now — that is usually the connection, not your shop.", good: false };
  if (status === 404) return { line: "Reserved for you, but the page isn't switched on at our end yet.", good: false };
  if (status >= 500) return { line: "The address is answering with an error. We're told about these.", good: false };
  if (status >= 400) return { line: `The address answered ${status}.`, good: false };
  if (domain?.configured && !own) return { line: "Live. Your own domain isn't verified yet, so this is still the address in use.", good: true };
  return { line: own ? "Live on your own domain — this is what shoppers reach." : "Live — this is what shoppers reach.", good: true };
}

/** When there is no address at all — a shop with no storefront yet, or hosting switched off. */
export const NO_ADDRESS = "No public address yet — your pieces still sell through the VYA marketplace.";

/** "12 pieces · 48 follows" — the shop in one line, with nothing pretended. */
export function shopLine(livePieces: number, followers: number | null | undefined): string {
  const pieces = `${livePieces} ${livePieces === 1 ? "piece" : "pieces"}`;
  const f = Number(followers);
  if (!Number.isFinite(f) || f <= 0) return pieces;
  return `${pieces} · ${f} ${f === 1 ? "follow" : "follows"}`;
}

/**
 * Which storefront is being served — the imported copy of the shop she arrived with, or the one she
 * built from sections. Null when the server doesn't say (a store that predates storefront versions,
 * where serving falls back to the old capture check).
 *
 * Worth saying out loud on the screen: the two look nothing alike, and a seller who imported a site
 * and is shown a built one — or the reverse — needs to know which of the two she is looking at
 * before she can tell whether anything is wrong.
 */
export function describeServeMode(sf: StorefrontState): string | null {
  const mode = sf?.settings?.serveMode;
  if (mode === "imported") return "Your imported site";
  if (mode === "built") return "The storefront you built";
  return null;
}
