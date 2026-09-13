// Which marketplaces the phone offers, and what it honestly promises about each.
//
// /api/store/cross-listing returns every channel VYA knows about — ten of them — each carrying a
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
