export const COLLECTIONS = [
  { slug: "editors-picks", name: "Everyone's Favorites", curatedBy: "The VYA Community", href: "/editors-picks", description: "The most-loved pieces from our community of tastemakers — ranked by the people with the best taste." },
  { slug: "carly", name: "Carly's Shoe Collection", curatedBy: "Carly Christina", href: "/stores/carly", description: "A curated destination for vintage and secondhand shoes, hand-selected by Carly Christina." },
  { slug: "bridal-era", name: "Bridal Era", curatedBy: "TheElleCollective", href: null, description: "For every bride-to-be searching for her something borrowed — vintage pieces worthy of the biggest day." },
  { slug: "spring-edition", name: "Spring Edition", curatedBy: "Alexa June", href: null, description: "Fresh picks for a new season. Light layers, floral prints, and the kind of pieces that feel like spring." },
  { slug: "summer-edit", name: "Summer Edit", curatedBy: "Sophia Tiago", href: null, description: "The season's best vintage finds — vibrant color, easy silhouettes, and pieces made for warm days and long nights." },
  { slug: "rachael-edit", name: "The Rachael Edit", curatedBy: "Rachael Brownfield", href: null, description: "A celebration of natural materials and quiet quality — pieces made to last, chosen for how they feel as much as how they look." },
  { slug: "office-edit", name: "The Office Edit", curatedBy: "", href: null, description: "Nine-to-five, elevated — sharp blazers, tailored trousers, pencil skirts, and crisp shirting. The vintage pieces that make dressing for the office feel like a power move." },
  { slug: "y2k-girls", name: "Y2K Girls", curatedBy: "", href: null, description: "Pure 2000s energy — baby tees, low-rise, logomania, and the it-bags of the era. For the girls who do it Y2K." },
  { slug: "80s-90s", name: "The 80s & 90s", curatedBy: "", href: null, description: "Power shoulders, bold prints, slip dresses, and grunge — the most iconic decades in fashion, straight from the archive." },
] as const;

export type CollectionSlug = (typeof COLLECTIONS)[number]["slug"];
