// Grade whether two brand strings name the SAME fashion house. Exact string match tanks accuracy —
// "Dior" ≠ "Christian Dior", "YSL" ≠ "Yves Saint Laurent", "Levi's" ≠ "Levi Strauss" — so we allow
// abbreviations, corporate/location suffixes, punctuation, diacritics, and reordering. Shared by the
// eval harness AND the production correction log so both report true brand accuracy, not a false low.

const BRAND_STOP = /\b(inc|incorporated|llc|ltd|limited|co|company|corp|corporation|spa|s ?p ?a|sa|s ?a|srl|gmbh|ag|nv|group|paris|milano|milan|london|roma|rome|italy|italia|france|usa|nyc|new york|official|brand|the)\b/g;

export function normBrand(v: string | null | undefined): string {
 return (v ?? "")
 .toLowerCase()
 .normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip diacritics: garçons → garcons
 .replace(/&/g, " and ")
 .replace(/[^a-z0-9\s]/g, " ") // drop punctuation: Levi's → levi s, A.P.C. → a p c
 .replace(BRAND_STOP, " ")
 .replace(/\s+/g, " ").trim();
}

// Abbreviations / alternate names that normalize+containment can't bridge → a shared canonical form.
const BRAND_ALIASES: Record<string, string> = {
 "ysl": "saint laurent", "yves saint laurent": "saint laurent",
 "lv": "louis vuitton", "cdg": "comme des garcons", "mm6": "maison margiela", "margiela": "maison margiela",
 "apc": "apc", "a p c": "apc", "ck": "calvin klein", "d and g": "dolce and gabbana", "dolce gabbana": "dolce and gabbana",
 "tnf": "the north face", "north face": "the north face", "rl": "ralph lauren", "polo": "ralph lauren", "polo ralph lauren": "ralph lauren",
 "bottega": "bottega veneta", "ferragamo": "salvatore ferragamo", "mcqueen": "alexander mcqueen", "vuitton": "louis vuitton",
};
const canonBrand = (b: string | null | undefined): string => { const n = normBrand(b); return BRAND_ALIASES[n] ?? n; };

export function brandMatch(guess: string | null | undefined, truth: string | null | undefined): boolean {
 const g = canonBrand(guess), t = canonBrand(truth);
 if (!g || !t) return false;
 if (g === t) return true;
 // Same house, one name a fuller form of the other: "dior" ⊂ "christian dior", "levis" ⊂ "levistrauss".
 const gj = g.replace(/\s/g, ""), tj = t.replace(/\s/g, "");
 const short = gj.length <= tj.length ? gj : tj, long = gj.length <= tj.length ? tj : gj;
 if (short.length >= 3 && long.includes(short)) return true;
 // Every word of the shorter name appears in the longer (handles reordering / extra words).
 const gt = g.split(" ").filter((w) => w.length >= 3), tt = t.split(" ").filter((w) => w.length >= 3);
 const [small, big] = gt.length <= tt.length ? [gt, tt] : [tt, gt];
 return small.length > 0 && small.every((w) => big.includes(w));
}
