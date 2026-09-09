// The composer's layout, sanitised. Pure — no I/O, so it can be tested directly.
//
// Both the preview and the send read a design through this, and a scheduled campaign reads one back
// out of the database months later, so it has to survive junk without either path having to guess.

/** The five layouts the composer offers. Same union as email-template's EmailDesign. */
export type CampaignLayout = "classic" | "statement" | "photo" | "editorial" | "grid";

/** What the composer holds: everything that shapes the email, and nothing about who gets it. */
export type CampaignDesign = {
 design: CampaignLayout;
 headline: string;
 subhead: string | null;
 ctaLabel: string | null;
 link: string | null;
 pieceCount: number;
 itemIds: string[];
 eyebrow: string | null;
 preheader: string | null;
 productsHeading: string | null;
 code: string | null;
 links: { label: string; url: string }[];
 ground: "white" | "brand";
 showPrices: boolean;
};

const DESIGNS = ["classic", "statement", "photo", "editorial", "grid"] as const;
const str = (v: unknown, max: number): string | null => {
 const s = typeof v === "string" ? v.trim() : "";
 return s ? s.slice(0, max) : null;
};

/**
 * A design from untrusted JSON — the composer's body, or a row read back out of the database.
 * Everything is clamped here so neither the renderer nor the sender has to guess.
 */
export function parseCampaignDesign(v: unknown): CampaignDesign {
 const b = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
 const design = DESIGNS.includes(b.design as (typeof DESIGNS)[number]) ? (b.design as CampaignLayout) : "classic";
 return {
  design,
  headline: str(b.headline, 160) || "Your headline",
  subhead: str(b.subhead, 300),
  ctaLabel: str(b.ctaLabel, 40),
  link: str(b.link, 500),
  pieceCount: Math.max(0, Math.min(8, Number(b.pieceCount ?? 0) || 0)),
  itemIds: Array.isArray(b.itemIds) ? b.itemIds.filter((x): x is string => typeof x === "string").slice(0, 8) : [],
  eyebrow: str(b.eyebrow, 60),
  preheader: str(b.preheader, 200),
  productsHeading: str(b.productsHeading, 80),
  code: str(b.code, 40),
  links: (Array.isArray(b.links) ? b.links : [])
   .filter((l): l is { label: string; url: string } =>
    Boolean(l && typeof (l as { label?: unknown }).label === "string" && typeof (l as { url?: unknown }).url === "string"))
   .filter((l) => l.label.trim() && l.url.trim())
   .slice(0, 4),
  ground: b.ground === "brand" ? "brand" : "white",
  showPrices: b.showPrices !== false,
 };
}
