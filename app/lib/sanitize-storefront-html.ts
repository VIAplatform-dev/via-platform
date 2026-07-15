import "server-only";
import sanitizeHtml from "sanitize-html";

// Custom storefront sections let VYA (or a hands-on seller) build ANY component from HTML —
// accordions via <details>, tabs, comparison tables, timelines, custom layouts — styled with the
// storefront's custom CSS. Because that HTML renders on a PUBLIC page, every write path funnels
// through this allowlist first (see setStorefrontTheme): structural + text markup, native
// interactive elements, images and links are kept; scripts, event handlers, iframes, forms, and
// unsafe URLs are dropped. Interactivity is CSS/`<details>`-native — no JS ever runs.
const CONFIG: sanitizeHtml.IOptions = {
 allowedTags: [
 "div", "section", "article", "header", "footer", "aside", "main", "nav",
 "h1", "h2", "h3", "h4", "h5", "h6",
 "p", "span", "strong", "b", "em", "i", "u", "s", "small", "mark", "sub", "sup",
 "br", "hr", "blockquote", "q", "cite", "abbr", "code", "pre", "time", "address",
 "ul", "ol", "li", "dl", "dt", "dd",
 "details", "summary",
 "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
 "a", "img", "figure", "figcaption", "picture", "source", "label", "button", "span",
 "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon",
 ],
 allowedAttributes: {
 "*": ["class", "id", "style", "title", "role", "aria-*", "data-*"],
 a: ["href", "target", "rel"],
 img: ["src", "alt", "width", "height", "loading"],
 source: ["srcset", "media", "type", "sizes"],
 details: ["open"],
 col: ["span"],
 td: ["colspan", "rowspan"],
 th: ["colspan", "rowspan", "scope"],
 button: ["type"],
 // Inline SVG (icons/dividers) — geometry only, no scripting surface.
 svg: ["viewbox", "width", "height", "fill", "stroke", "stroke-width", "xmlns"],
 path: ["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"],
 g: ["fill", "stroke", "transform"],
 circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
 rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke"],
 line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
 polyline: ["points", "fill", "stroke", "stroke-width"],
 polygon: ["points", "fill", "stroke", "stroke-width"],
 },
 // Images/links may only point at real web resources (no javascript:, no data:text/html).
 allowedSchemesByTag: { a: ["http", "https", "mailto"], img: ["http", "https"] },
 // Keep <button> (for styling) but it can never carry a handler — that's already stripped as a
 // non-allowed attribute. Force safe rel on any new tab link.
 transformTags: {
 a: (tagName, attribs) => {
 const rel = attribs.target === "_blank" ? "noopener noreferrer" : attribs.rel;
 return { tagName, attribs: { ...attribs, ...(rel ? { rel } : {}) } };
 },
 },
 // Drop the contents of anything not on the list (so a stray <script>…</script> leaves nothing).
 disallowedTagsMode: "discard",
};

export function sanitizeStorefrontHtml(dirty: string | undefined | null): string {
 if (!dirty) return "";
 return sanitizeHtml(dirty, CONFIG).slice(0, 40000);
}
