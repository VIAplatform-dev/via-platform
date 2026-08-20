// Global "design" layer for imported/captured storefronts. The seller picks accent / background / text
// colours, a corner style, and heading/body fonts; we express that as a CSS block injected over their
// theme (via the site-wide custom-CSS row, which wins by source order). The block is self-describing — a
// JSON comment header lets the editor read the current settings back — and any OTHER custom CSS (e.g.
// added by the VYA assistant) is preserved alongside it. NOTE: a captured site keeps its own baked-in
// section backgrounds, so bg/text mainly move the base page + anything that inherits; accent/fonts/corners
// hit buttons, links, and headings reliably.

export type Radius = "sharp" | "soft" | "round";
export type DesignSettings = { accent: string | null; heading: string | null; body: string | null; bg: string | null; text: string | null; radius: Radius | null };

const START = "/* vya-design:";
const END = "/* vya-design-end */";

const SERIFS = new Set(["Playfair Display", "Cormorant Garamond", "Bodoni Moda", "Fraunces", "Newsreader", "Instrument Serif", "EB Garamond", "Source Serif 4"]);
// Kept for any callers/UI that still want a flat list, but fonts are no longer restricted to these.
export const HEADING_FONTS = ["Playfair Display", "Cormorant Garamond", "Bodoni Moda", "Fraunces", "Newsreader", "Instrument Serif", "EB Garamond", "Inter", "Poppins", "Montserrat"];
export const BODY_FONTS = ["Inter", "Poppins", "Montserrat", "Lato", "Work Sans", "Nunito Sans", "EB Garamond", "Newsreader"];

function fam(name: string): string {
 return `'${name.replace(/['"\\]/g, "")}', ${SERIFS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;
}
const isHex = (v: string) => /^#[0-9a-fA-F]{3,8}$/.test(v);
const isFont = (v: string) => /^[\w \-]{2,40}$/.test(v); // any reasonable Google-font family name
const RADIUS_PX: Record<Radius, string> = { sharp: "0", soft: "10px", round: "22px" };

/** Split a stored custom-CSS blob into the design settings + whatever other CSS it holds. */
export function parseDesign(css: string): { settings: DesignSettings; rest: string } {
 const empty: DesignSettings = { accent: null, heading: null, body: null, bg: null, text: null, radius: null };
 const s = css.indexOf(START);
 if (s === -1) return { settings: empty, rest: css.trim() };
 const jEnd = css.indexOf("*/", s);
 const e = css.indexOf(END);
 let settings = empty;
 if (jEnd !== -1) {
 try { settings = { ...empty, ...JSON.parse(css.slice(s + START.length, jEnd).trim()) }; } catch { /* keep empty */ }
 }
 const rest = (e === -1 ? css.slice(0, s) : css.slice(0, s) + css.slice(e + END.length)).trim();
 return { settings, rest };
}

/** Rebuild the full custom-CSS blob: the generated design block (if any) + preserved rest. */
export function buildDesignCss(settings: DesignSettings, rest: string): string {
 const accent = settings.accent && isHex(settings.accent) ? settings.accent : null;
 const bg = settings.bg && isHex(settings.bg) ? settings.bg : null;
 const text = settings.text && isHex(settings.text) ? settings.text : null;
 const heading = settings.heading && isFont(settings.heading) ? settings.heading : null;
 const body = settings.body && isFont(settings.body) ? settings.body : null;
 const radius = settings.radius && RADIUS_PX[settings.radius] !== undefined ? settings.radius : null;
 const cleanRest = rest.trim();
 if (!accent && !heading && !body && !bg && !text && !radius) return cleanRest; // nothing to apply

 const fonts = [...new Set([heading, body].filter(Boolean) as string[])];
 const imp = fonts.length ? `@import url('https://fonts.googleapis.com/css2?${fonts.map((f) => "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700").join("&")}&display=swap');\n` : "";
 let block = `${START}${JSON.stringify({ accent, heading, body, bg, text, radius })} */\n${imp}`;
 if (heading) block += `h1,h2,h3,h4,h5,h6{font-family:${fam(heading)}!important}\n`;
 if (body) block += `body{font-family:${fam(body)}!important}\n`;
 if (bg) block += `body{background-color:${bg}!important}\n`;
 if (text) block += `body{color:${text}!important}\n`;
 if (accent) block += `a{color:${accent}}\nbutton,.btn,.button,[type="submit"],.shopify-payment-button__button,.button--primary{background-color:${accent}!important;border-color:${accent}!important;color:#fff!important}\n`;
 if (radius) block += `button,.btn,.button,[type="submit"],input,select,textarea,.card,.product-card{border-radius:${RADIUS_PX[radius]}!important}\n`;
 block += END;
 return cleanRest ? `${block}\n${cleanRest}` : block;
}
