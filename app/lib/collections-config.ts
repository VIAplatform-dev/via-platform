// The collections the marketplace offers, and the only place they are defined.
//
// Code, not data: a collection is an editorial decision with a name, a photograph and a sentence
// of copy, and those belong in a diff where they can be read and reverted. What lives in the
// database is only WHICH PIECES sit in each one (editors-picks-db.ts), keyed by the slugs below.
//
// REMOVING A SLUG HERE DOES NOT DELETE ITS PICKS. The rows stay, orphaned and harmless, so a
// collection retired today can be brought back tomorrow with its curation intact.

export const COLLECTIONS = [
  { slug: "editors-picks", name: "Everyone's Favorites", curatedBy: "", href: "/editors-picks", image: "/collections/editors-picks.png", description: "The most-loved pieces from our community of tastemakers, ranked by the people with the best taste." },
  { slug: "for-fall", name: "For Fall", curatedBy: "", href: null, image: "/edit-fall.jpg", description: "Wool, suede and shearling. The weight that comes back into a wardrobe when the light goes. Layers worth keeping for the next ten autumns." },
  { slug: "the-office", name: "The Office", curatedBy: "", href: null, image: "/edit-office.jpg", description: "Nine-to-five, elevated. Sharp blazers, tailored trousers, pencil skirts and crisp shirting. The pieces that make dressing for work feel like a decision rather than a chore." },
  { slug: "early-2000s", name: "Early 2000's", curatedBy: "", href: null, image: "/collections/y2k-girls.png", description: "Baby tees, low-rise, logomania and the it-bags of the era. The decade that never really left." },
  { slug: "the-classics", name: "The Classics", curatedBy: "", href: null, image: "/collections/rachael-edit.png", description: "Staples chosen for how they are made: full-grain leather, proper linings, seams that hold. Quality and craft over anything of the moment." },
  { slug: "nights-out", name: "For Nights Out", curatedBy: "", href: null, image: "/collections/bridal-era.png", description: "Slip dresses, sequins, silk and a heel worth the taxi. For the evenings that earn a second look." },
  { slug: "archival", name: "Archival Collection", curatedBy: "", href: null, image: "/collections/80s-90s.png", description: "House archive and runway. Pieces kept because of where they came from. Provenance first, season never." },
  { slug: "statement-accessories", name: "Statement Accessories", curatedBy: "", href: null, image: "/edit-shoes.jpg", description: "The bag, the belt, the earrings that do the talking. The one piece that decides the whole outfit." },
] as const;

export type CollectionSlug = (typeof COLLECTIONS)[number]["slug"];
