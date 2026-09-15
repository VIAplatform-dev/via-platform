// Which marketplaces the phone offers, and what it honestly promises about each.
//
// /api/store/cross-listing returns every channel VYA knows about, ten of them. Each carrying a
// `mode` that says how a piece would actually get posted. The phone was drawing all ten as equal
// chips, so a seller could switch on Poshmark or Grailed and nothing would ever happen there.
//
// Three are real:
//
//   eBay       mode "api"        a public listing API. The server posts it. Nothing else to do.
//   Depop      mode "extension"  no API at all. The browser extension fills her own logged-in
//   Vestiaire  mode "extension"  form, so it happens at a computer, not here.
//
// The rest are mode "soon" and are simply not shown. A control that cannot do anything is worse
// than an absent one: it takes a decision and then quietly discards it.
//
// The modes are the WEB's definition (app/lib/cross-listing-platforms.ts) arriving over the wire,
// not a second list kept in step by hand. Adding a channel there is all it takes to offer it here.

export type CrossListMode = "api" | "extension" | "soon";
export type CrossListPlatform = { key: string; name: string; hasApi?: boolean; mode?: CrossListMode };

/** The channels a seller can actually queue a piece to, in the order the app should show them. */
export function liveCrossListPlatforms(all: CrossListPlatform[]): CrossListPlatform[] {
  const usable = all.filter((p) => p.mode === "api" || p.mode === "extension");
  // Automatic first: it is the one that needs nothing further from her.
  return usable.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function rank(p: CrossListPlatform): number {
  return p.mode === "api" ? 0 : 1;
}

/** The line under a chip, saying what choosing it will actually cause. */
export function crossListNote(p: CrossListPlatform): string {
  return p.mode === "api" ? "Posts automatically" : "Finish in your browser";
}

/**
 * The paragraph under the row. It changes with what is on offer, because a footnote that says
 * "the posting runs from the computer" is a lie the moment eBay posts itself.
 */
export function crossListFootnote(platforms: CrossListPlatform[]): string {
  const auto = platforms.filter((p) => p.mode === "api").map((p) => p.name);
  const manual = platforms.filter((p) => p.mode === "extension").map((p) => p.name);

  const parts: string[] = [];
  if (auto.length) parts.push(`${list(auto)} ${auto.length === 1 ? "posts" : "post"} on their own when the piece publishes.`);
  if (manual.length) {
    parts.push(
      `${list(manual)} ${manual.length === 1 ? "has" : "have"} no listing API, so ${manual.length === 1 ? "it is" : "they are"} queued here and finished from your browser with the VYA extension.`,
    );
  }
  return parts.join(" ");
}

/** "eBay", "Depop and Vestiaire Collective", "a, b and c". */
function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/* ── what failed, and what she can actually do about it ─────────────────────────────────────── */

/** One row of /api/store/cross-listing's board: a piece, and each platform's status for it. */
export type BoardRow = {
  itemId: string;
  title: string | null;
  images?: string[] | null;
  priceCents?: number | null;
  /** platform key → "listed" | "queued" | "error" | … */
  listings?: Record<string, string> | null;
};

export type FailedPiece = {
  itemId: string;
  title: string;
  image: string | null;
  /** The platform keys that errored on this piece. */
  platforms: string[];
};

/**
 * The pieces behind "3 pieces failed to post".
 *
 * That row on Home had no in-app screen, so it fell through to opening /admin/cross-listing in a
 * browser sheet: the one thing the seller app is not allowed to do. The pieces are knowable here,
 * the board already says which platform errored on which item, and the honest answer is to name
 * them and say where the fix is rather than to bounce her to a desktop page on a phone.
 */
export function failedPieces(board: BoardRow[], platforms: CrossListPlatform[]): FailedPiece[] {
  const named = new Map(platforms.map((p) => [p.key, p.name]));
  const out: FailedPiece[] = [];
  for (const row of board) {
    const bad = Object.entries(row.listings ?? {})
      .filter(([, status]) => status === "error")
      // A platform VYA no longer offers is not something she can act on, and naming it by its raw
      // key ("grailed") in a sentence about what to do next is worse than leaving it out.
      .filter(([key]) => named.has(key))
      .map(([key]) => key);
    if (bad.length) {
      out.push({
        itemId: row.itemId,
        title: row.title?.trim() || "Untitled piece",
        image: row.images?.[0] ?? null,
        platforms: bad,
      });
    }
  }
  return out;
}

/**
 * What to do about one failed piece, in a sentence.
 *
 * The two kinds of failure are genuinely different and lumping them together is what made the old
 * row useless. An API channel failed on VYA's side and can simply be retried. An extension channel
 * has no listing API at all, so the retry has to happen at a computer with the extension installed,
 * and saying so plainly beats sending her to a web page that says it less clearly.
 */
export function failureAdvice(platforms: string[], all: CrossListPlatform[]): string {
  const byKey = new Map(all.map((p) => [p.key, p]));
  const chosen = platforms.map((k) => byKey.get(k)).filter((p): p is CrossListPlatform => !!p);
  const auto = chosen.filter((p) => p.mode === "api").map((p) => p.name);
  const manual = chosen.filter((p) => p.mode === "extension").map((p) => p.name);

  const parts: string[] = [];
  if (auto.length) parts.push(`${list(auto)} can be retried from here.`);
  if (manual.length) {
    parts.push(
      `${list(manual)} ${manual.length === 1 ? "has" : "have"} no listing API, so finish ${manual.length === 1 ? "it" : "them"} on your computer with the VYA extension.`,
    );
  }
  return parts.join(" ");
}

/** True when nothing about this piece can be fixed from the phone. */
export function needsDesktop(platforms: string[], all: CrossListPlatform[]): boolean {
  const byKey = new Map(all.map((p) => [p.key, p]));
  return platforms.every((k) => byKey.get(k)?.mode === "extension");
}
