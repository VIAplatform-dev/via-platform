// The four policy pages a storefront can have, and where they live.
//
// WHY THIS WAS MISSING. A seller could write her returns and shipping policies in settings, and
// nothing on her storefront linked to them and no URL served them. She was filling in a form that
// went nowhere. Worse for her than for us: "what's your returns policy" is the question that
// decides a sale on a piece somebody cannot try on, and several marketplaces and payment providers
// expect a reachable returns page before they will take a store seriously.
//
// NO NEW ROUTE. They are served by the storefront's existing /s/{handle}/{page} route, which
// already resolves a slug against the shop's own pages and already carries her theme, her fonts and
// her nav. A new top-level route would have needed its own proxy allowlist entry, its own chrome,
// and would have drifted from the rest of her site the first time anything changed.
//
// ONLY WHAT SHE WROTE. A store links to a policy page when there is a policy on it; nothing here
// invents one, and a blank policy is not a page. A footer link to an empty page is worse than no
// link, because a shopper clicks it to find out where she stands and learns nothing.

export type PolicySlug = "returns" | "shipping" | "privacy" | "terms";

export const POLICY_SLUGS: PolicySlug[] = ["returns", "shipping", "privacy", "terms"];

const LABELS: Record<PolicySlug, string> = {
 returns: "Returns",
 shipping: "Shipping",
 privacy: "Privacy",
 terms: "Terms",
};

/** The heading and footer link text for a policy. */
export function policyLabel(slug: PolicySlug): string {
 return LABELS[slug];
}

export function isPolicySlug(slug: unknown): slug is PolicySlug {
 return typeof slug === "string" && (POLICY_SLUGS as string[]).includes(slug);
}

/**
 * The footer links for a shop, in a fixed order, and only for policies she has actually written.
 *
 * `base` is "" on her own domain and "/s/{handle}" on ours, exactly as the rest of the storefront
 * computes it, and the preview flag has to survive or a seller checking her own unpublished site
 * falls off it at the first policy link.
 */
export function policyLinks(
 policies: Partial<Record<PolicySlug, string>> | null | undefined,
 base = "",
 preview = false,
): Array<{ label: string; href: string }> {
 if (!policies) return [];
 return POLICY_SLUGS
  .filter((s) => String(policies[s] ?? "").trim().length > 0)
  .map((s) => ({ label: LABELS[s], href: `${base}/${s}${preview ? "?preview=1" : ""}` }));
}

/**
 * A written policy split into paragraphs for rendering.
 *
 * Policies are plain text in a textarea, so a blank line is a paragraph break and a single newline
 * is a line inside one. Anything else would either run the whole thing together or double-space it.
 */
export function policyParagraphs(text: string | null | undefined): string[] {
 return String(text ?? "")
  .replace(/\r\n/g, "\n")
  .split(/\n{2,}/)
  .map((p) => p.trim())
  .filter(Boolean);
}
