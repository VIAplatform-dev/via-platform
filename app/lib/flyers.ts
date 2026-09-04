// The printed flyers, and the addresses they point at.
//
// Each flyer gets its own top-level path — vyaplatform.com/vintage — because it is printed on
// paper. Short enough to type when a scan fails, and readable enough to say out loud.
//
// TWO THINGS FOLLOW FROM THE FACT THAT THESE ARE PRINTED:
//
//   1. A slug here can never be renamed or removed once a run is printed. The paper cannot be
//      redeployed. Adding is fine; changing is not.
//   2. Every path must be listed in proxy.ts's PUBLIC_ROUTES. Anything the site does not
//      recognise redirects to /login, so an unlisted flyer sends every scan to a sign-in wall —
//      the one outcome a flyer cannot survive.
//
// The headline is the flyer's own line, carried onto the screen so the joke does not die at the
// scan: someone who just read "I have proof." should land on a page that says it back.

export type Flyer = {
 slug: string;
 /** The line printed on the flyer, repeated as the page's headline. */
 headline: string;
 /** Short line under the headline. The flyer had room for a punchline; the page has room for an offer. */
 subhead: string;
};

export const FLYERS: Flyer[] = [
 {
  slug: "vintage",
  headline: "Vintage?",
  subhead: "Yes. Thousands of one-of-one pieces from vintage stores around the world.",
 },
 {
  slug: "emma-stolen-bag",
  headline: "Emma, I know you stole my Fendi baguette.",
  // The flyer's punchline is its second line — dropping it would land the setup without the joke.
  subhead: "I have proof. Get your own — archive Fendi and more, from vintage stores around the world.",
 },
 {
  slug: "trendsetter",
  headline: "Are you a trendsetter?",
  subhead: "We got you. One-of-one archive pieces you will not see on anyone else.",
 },
 {
  slug: "not-shein",
  headline: "For the girls who don't shop at Shein.",
  subhead: "Real vintage from real stores. Nothing mass-produced, nothing repeated.",
 },
 {
  slug: "fashion-clone",
  headline: "Don't be a fast fashion clone.",
  subhead: "One-of-one archive pieces from vintage stores around the world.",
 },
 {
  slug: "postcard",
  headline: "You found us.",
  subhead: "Archive fashion from vintage stores around the world — skip the waitlist.",
 },
];

const BY_SLUG = new Map(FLYERS.map((f) => [f.slug, f]));

/** Tolerant of the case and whitespace a hand-typed or scanned URL arrives with. */
export function flyerBySlug(slug: string | null | undefined): Flyer | undefined {
 if (!slug) return undefined;
 return BY_SLUG.get(slug.trim().toLowerCase());
}

export function isFlyerSlug(slug: string | null | undefined): boolean {
 return flyerBySlug(slug) !== undefined;
}

/**
 * What goes in pilot_access.source.
 *
 * Namespaced, because that column is shared with every other signup path — a bare "vintage"
 * would collide with anything else that ever calls itself that, and attribution would quietly
 * merge two different things. The column is VARCHAR(50); a test holds us to it.
 */
export function flyerSource(slug: string): string {
 return `flyer:${slug}`;
}

/** Every path that must be publicly reachable. Kept here so proxy.ts cannot drift from this list. */
export function flyerPaths(): string[] {
 return FLYERS.map((f) => `/${f.slug}`);
}
