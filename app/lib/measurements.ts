// Pull flat measurements out of an imported description (Shopify body_html prose usually carries
// them — "Bust 34\" · Waist 28\" · Length 40\"") into a clean, structured string for the item's
// measurements field. Conservative: only emits when it finds unambiguous garment measurements, so a
// stray "width" in unrelated copy doesn't produce a junk value.

// Canonical label + its aliases. ORDER MATTERS: compound phrases run first and their matched text is
// masked out, so "sleeve length" is claimed by Sleeve (not Length) and "shoulder to hem" by Length
// (not Hem). "Length" appears twice — the specific phrase first, then bare "length" for what's left.
const LABELS: Array<{ canon: string; alias: string; strong: boolean }> = [
 { canon: "Pit to pit", alias: "pit[\\s-]?to[\\s-]?pit|p2p|armpit[\\s-]?to[\\s-]?armpit|across[\\s-]?chest", strong: true },
 { canon: "Sleeve", alias: "sleeve(?:\\s+length)?", strong: true },
 { canon: "Length", alias: "shoulder[\\s-]?to[\\s-]?hem|total\\s+length", strong: true },
 { canon: "Shoulder", alias: "shoulder[\\s-]?to[\\s-]?shoulder|shoulders?", strong: true },
 { canon: "Bust", alias: "bust|chest", strong: true },
 { canon: "Waist", alias: "waist", strong: true },
 { canon: "Hips", alias: "hips?", strong: true },
 { canon: "Inseam", alias: "inseam", strong: true },
 { canon: "Rise", alias: "(?:front\\s+)?rise", strong: true },
 { canon: "Thigh", alias: "thigh", strong: true },
 { canon: "Leg opening", alias: "leg[\\s-]?opening", strong: true },
 { canon: "Length", alias: "length", strong: true }, // bare — after Sleeve/Shoulder-to-hem are masked
 // Footwear + boots (this is a resale marketplace — lots of shoes). "Heel" runs before "Height".
 { canon: "Heel", alias: "heel[\\s-]?height|heel", strong: true },
 { canon: "Platform", alias: "platform(?:\\s+height)?", strong: true },
 { canon: "Shaft", alias: "(?:boot\\s+)?shaft(?:\\s+height)?", strong: true },
 { canon: "Calf", alias: "calf(?:\\s+circumference)?", strong: true },
 { canon: "Insole", alias: "insole(?:\\s+length)?", strong: true },
 { canon: "Hem", alias: "hem", strong: false },
 { canon: "Cuff", alias: "cuff", strong: false },
 { canon: "Strap drop", alias: "(?:handle|strap)[\\s-]?drop", strong: false },
 { canon: "Height", alias: "height", strong: false },
 { canon: "Width", alias: "width", strong: false },
 { canon: "Depth", alias: "depth", strong: false },
];

// A number (34, 34.5, 34 1/2) with an optional unit. The lookahead stops it matching a PREFIX of a
// longer number ("28" out of "2800"), so prices/counts don't masquerade as measurements.
const VALUE = String.raw`(\d{1,3}(?:\.\d{1,2})?(?:\s?\d\/\d)?)(?![\d.])\s*("|''|”|″|inches?|in\b|cm\b)?`;

function toNum(s: string): number {
 const frac = s.match(/(\d+)\s*\/\s*(\d+)/);
 const whole = parseFloat(s.replace(/\d+\s*\/\s*\d+/, "").trim()) || 0;
 return frac ? whole + parseInt(frac[1], 10) / parseInt(frac[2], 10) : parseFloat(s);
}

/** Parse measurements out of a description; null if none confidently found. Emits in source order. */
export function extractMeasurements(text: string | null | undefined): string | null {
 if (!text) return null;
 let t = String(text)
 .replace(/<[^>]+>/g, " ") // leftover HTML tags
 .replace(/&quot;/g, '"').replace(/&#0?39;|&#34;/g, '"')
 .replace(/\s+/g, " ");
 const found: { pos: number; text: string }[] = [];
 const seen = new Set<string>();
 let strongCount = 0;
 for (const { canon, alias, strong } of LABELS) {
 if (seen.has(canon)) continue;
 // Allow a run of filler words between the label and the number ("measures approx.", "is about").
 const m = new RegExp(`\\b(?:${alias})\\b\\s*[:=~–-]?\\s*(?:(?:is|of|approx\\.?|about|around|roughly|measures|~)\\s*)*${VALUE}`, "i").exec(t);
 if (!m) continue;
 const n = toNum(m[1]);
 const isCm = /cm/i.test(m[2] || "");
 if (!Number.isFinite(n) || n < 1 || n > (isCm ? 250 : 90)) continue; // reject prices/years/junk
 const val = Math.round(n * 100) / 100;
 found.push({ pos: m.index, text: `${canon} ${val}${isCm ? " cm" : '"'}` });
 seen.add(canon);
 if (strong) strongCount++;
 // Mask the matched span (same length) so overlapping labels can't double-count it.
 t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length);
 }
 // Confident only with an unambiguous garment measurement, or several together.
 if (strongCount < 1 && found.length < 2) return null;
 return found.sort((a, b) => a.pos - b.pos).map((f) => f.text).join(" · ");
}
