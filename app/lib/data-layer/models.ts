// ───────────────────────────────────────────────────────────────────────────
// Model / line detection — the deepest sourcing granularity ("Dior · Saddle").
//
// A brand × category ("Dior · bags") is actionable; the exact model ("Dior Saddle") is sharper still
// and prices tightest of all. We detect the model from the title against a seeded vocabulary of each
// house's recognizable lines — the same alias-map approach as brands/eras, so it's deterministic and
// cheap (no per-event LLM). Seeded here for the top houses; add rows as coverage gaps show up.
// Keyed by the CANONICAL brand (as resolveBrand returns it), lowercased.
// ───────────────────────────────────────────────────────────────────────────

// brand → { canonical model : [match keywords] }. Keywords match word-bounded, case-insensitive.
const MODELS: Record<string, Record<string, string[]>> = {
 "dior": { "Saddle": ["saddle"], "Book Tote": ["book tote"], "Lady Dior": ["lady dior", "lady d-lite"], "Bobby": ["bobby"], "30 Montaigne": ["30 montaigne", "montaigne"], "Diorama": ["diorama"], "Caro": ["dior caro"] },
 "chanel": { "Classic Flap": ["classic flap", "timeless", "2.55", "double flap", "single flap"], "19": ["chanel 19"], "Boy": ["boy bag", "le boy"], "Gabrielle": ["gabrielle"], "Deauville": ["deauville"], "Wallet on Chain": ["wallet on chain", "woc"] },
 "gucci": { "Marmont": ["marmont"], "Dionysus": ["dionysus"], "Jackie": ["jackie"], "Horsebit 1955": ["horsebit", "1955"], "Ophidia": ["ophidia"], "Bamboo": ["bamboo"], "Soho Disco": ["soho disco"] },
 "fendi": { "Baguette": ["baguette"], "Peekaboo": ["peekaboo"], "Mamma Baguette": ["mamma"], "Spy": ["spy bag"], "First": ["fendi first"], "Sunshine": ["sunshine shopper", "sunshine tote"] },
 "prada": { "Galleria": ["galleria"], "Re-Nylon": ["re-nylon", "re nylon"], "Cahier": ["cahier"], "Cleo": ["cleo"], "Nylon": ["nylon"] },
 "louis vuitton": { "Speedy": ["speedy"], "Neverfull": ["neverfull"], "Alma": ["alma"], "Pochette Accessoires": ["pochette accessoires"], "Keepall": ["keepall"], "Noe": ["noe"], "Papillon": ["papillon"], "Multi Pochette": ["multi pochette"] },
 "saint laurent": { "Loulou": ["loulou"], "Kate": ["kate bag"], "Sunset": ["sunset"], "Niki": ["niki"], "College": ["college bag"], "Le 5 a 7": ["5 a 7", "5 à 7"] },
 "bottega veneta": { "Jodie": ["jodie"], "Cassette": ["cassette"], "Pouch": ["\\bpouch\\b"], "Arco": ["arco"], "Padded Cassette": ["padded cassette"] },
 "celine": { "Triomphe": ["triomphe"], "Luggage": ["luggage tote", "nano luggage", "micro luggage"], "Belt Bag": ["belt bag"], "Ava": ["ava bag"], "Classic Box": ["classic box"] },
 "balenciaga": { "City": ["city bag"], "Hourglass": ["hourglass"], "Le Cagole": ["cagole"], "Motorcycle": ["motorcycle", "moto bag"] },
 "loewe": { "Puzzle": ["puzzle"], "Hammock": ["hammock"], "Gate": ["gate bag"], "Flamenco": ["flamenco"], "Amazona": ["amazona"] },
 "hermes": { "Birkin": ["birkin"], "Kelly": ["kelly"], "Constance": ["constance"], "Evelyne": ["evelyne"], "Garden Party": ["garden party"], "Picotin": ["picotin"] },
 "miu miu": { "Wander": ["wander"], "Arcadie": ["arcadie"], "Matelasse": ["matelasse", "matelassé"] },
 "valentino": { "Rockstud": ["rockstud"], "Roman Stud": ["roman stud"], "VLogo": ["vlogo", "v logo"], "VRing": ["vring"] },
 "jacquemus": { "Chiquito": ["chiquito", "le chiquito"], "Bambino": ["bambino"] },
 "marc jacobs": { "Tote Bag": ["the tote bag"], "Stam": ["stam"], "Snapshot": ["snapshot"] },
 "coach": { "Willis": ["willis"], "Tabby": ["tabby"], "Rogue": ["rogue"], "Pillow Tabby": ["pillow tabby"] },
 "chloe": { "Paddington": ["paddington"], "Marcie": ["marcie"], "Nile": ["nile bag"], "Woody": ["woody"], "Faye": ["faye"] },
 "prada re-edition": { "Re-Edition 2005": ["re-edition 2005", "re edition 2005"], "Re-Edition 2000": ["re-edition 2000"] },
};

function wordIn(text: string, kw: string): boolean {
 // Word-bounded match. kw may itself contain a regex fragment (e.g. "\\bpouch\\b").
 const pattern = kw.startsWith("\\b") ? kw : `\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`;
 try { return new RegExp(pattern, "i").test(text); } catch { return false; }
}

/**
 * The recognizable model/line named in a title, for a known brand — or null. Deterministic: returns
 * the FIRST model (in seed order) whose keyword appears word-bounded in the title.
 */
export function inferModel(title: string | null | undefined, brand: string | null | undefined): string | null {
 const t = (title || "").toLowerCase();
 const b = (brand || "").toLowerCase().trim();
 if (!t || !b) return null;
 const models = MODELS[b];
 if (!models) return null;
 for (const [model, kws] of Object.entries(models)) {
  for (const kw of kws) if (wordIn(t, kw)) return model;
 }
 return null;
}
