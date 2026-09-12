// THE MENU ON HER CAPTURED HEADER — read, reordered, and applied to every copy of it.
//
// F3 of the builder survey: a theme ships the same menu TWICE. Shopify has the desktop list plus the
// drawer the phone opens; Squarespace has the desktop nav plus the mobile overlay. An order applied
// to one of them is an order the phone ignores, so everything here runs over EVERY copy — on purpose,
// rather than by the accident of matching old values.
//
// THE TWO COPIES ARE NOT IDENTICAL MARKUP. A Dawn drawer opens a dropdown with a <summary> that has
// no link at all, where the desktop list has a real one — so an item is recognised by being an item,
// and matched across copies by its address OR, failing that, by its words.
//
// Sparse by design. Until she drags something there is no stored menu at all: the panel and the serve
// path read it off the header (`detectMenus`). Once she has one, it is applied only to copies whose
// own href sequence still matches the one it was learned from — a landing page with its own header is
// left exactly as it is, rather than rewritten to a menu that was never on it.
//
// Pure: cheerio in, cheerio out. Nothing here reads the database or the request.
import type * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

export type MenuItem = { id: string; label: string; href: string; hidden?: boolean };
export type StoredMenu = { items: MenuItem[]; signature: string };
export type DetectedMenu = StoredMenu & { copies: number };

export const MENU_LIMITS = { items: 30, label: 60, href: 500 } as const;

/** Where a header lives, on both platforms. Deliberately the same regions numbering v2 refuses to
 *  count as sections (site-capture.ts), so "the header" means one thing across the builder. */
const HEADER_ROOTS = [
 "header",
 ".shopify-section-group-header-group",
 "#shopify-section-header",
 "[id$='__header']",
 "header#header",
].join(", ");

/** A list of links that might be a menu. Squarespace's is a `nav`, not a `ul`. */
const LIST_SEL = "ul, nav.header-nav-list, .header-menu-nav-list, .header-nav-list";

/** Markers a theme puts on the item for the page you are on. A cloned item must carry none of them. */
const ACTIVE_CLASS = /(^|[\s-])(is-)?active$|--active$|(^|\s)current(-menu-item)?$|header-nav-item--active/i;

/**
 * One href, reduced to the key this module matches items by.
 *
 * A page of her site normalises to its path: "/collections/all". Plan A captures bake the VYA path
 * into every link (`/site/lei-vintage/shop`), Plan B leaves them root-relative, and the two must
 * compare equal or a Squarespace menu would never match its own stored order.
 *
 * Anything that leaves her site (an Instagram link) keeps its whole address as the key, lowercased —
 * it is still an item that can be moved, just never a page that can be hidden. A link that goes
 * nowhere at all ("#", a country picker, `javascript:`) is not an address and returns null.
 */
export function normalizeMenuHref(raw: string | null | undefined): string | null {
 const h = String(raw ?? "").trim();
 if (!h) return null;
 if (/^(#|mailto:|tel:|sms:|javascript:|data:)/i.test(h)) return null;
 if (/^https?:\/\//i.test(h) || h.startsWith("//")) return h.toLowerCase().slice(0, MENU_LIMITS.href);
 if (!h.startsWith("/")) return null;
 let p = h.split("#")[0].split("?")[0];
 p = p.replace(/^\/site\/[^/]+/, "") || "/";
 if (p.length > 1) p = p.replace(/\/+$/, "");
 return p || "/";
}

/** Is this key one of her own pages (so it can be hidden), rather than somewhere else entirely? */
export function isInternalMenuKey(key: string | null | undefined): key is string {
 return !!key && key.startsWith("/");
}

/** An item's words, reduced so the desktop list and the drawer agree on them. This is how a dropdown
 *  parent — which has a link in one copy and a bare <summary> in the other — is matched across both. */
function labelKey(label: string): string {
 return `label:${label.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

type MenuEntry = { el: DomElement; key: string | null; label: string };
type Candidate = { el: DomElement; items: MenuEntry[]; signature: string };

/** The href sequence a menu is recognised by. Stored with her order, and checked before it is used. */
export function menuSignature(keys: (string | null | undefined)[]): string {
 return keys.filter(isInternalMenuKey).join("|");
}

/**
 * Are these two lists the same menu?
 *
 * NOT string equality, because the two copies a theme ships are not identical. A Dawn drawer turns a
 * dropdown parent into a bare <summary> with no link, where the desktop list has a real one — so the
 * drawer's addresses are the desktop's MINUS that one, in the same order. One being a subsequence of
 * the other is exactly that relationship, and it is still precise: a landing page carrying its own
 * different menu shares a prefix at most, and is left alone.
 *
 * Two addresses in common at the least, so an empty or one-item signature never matches everything.
 */
export function menuMatches(a: string, b: string): boolean {
 const A = a ? a.split("|") : [], B = b ? b.split("|") : [];
 if (A.length < 2 || B.length < 2) return false;
 const [short, long] = A.length <= B.length ? [A, B] : [B, A];
 let i = 0;
 for (const k of long) if (i < short.length && short[i] === k) i++;
 return i === short.length;
}

function itemsOf($: cheerio.CheerioAPI, list: DomElement): MenuEntry[] {
 return ($(list).children().toArray() as DomElement[])
  .map((el): MenuEntry | null => {
   // The item's OWN link, never one belonging to the submenu it opens.
   const $a = $(el).find("a[href]").filter((_i, a) => $(a).parentsUntil(list, LIST_SEL).length === 0).first();
   const $s = $(el).find("summary").first();
   if (!$a.length && !$s.length) return null;
   const label = ($a.length ? $a : $s).text().replace(/\s+/g, " ").trim().slice(0, MENU_LIMITS.label);
   const key = $a.length ? normalizeMenuHref($a.attr("href") ?? $a.attr("data-vya-href")) : null;
   return { el, key, label };
  })
  .filter((x): x is MenuEntry => x !== null);
}

/**
 * Every list in the header that behaves like a navigation menu.
 *
 * The test is what the links DO, not what they are called: a menu is mostly links to pages of her
 * own site. That is what separates the real menu from the two lists sitting beside it in a Dawn
 * header — a 28-country picker whose every href is "#", and a row of social icons pointing at
 * Instagram — without hard-coding either theme's class names.
 */
export function menuLists($: cheerio.CheerioAPI): Candidate[] {
 const seen = new Set<DomElement>();
 const out: Candidate[] = [];
 for (const root of $(HEADER_ROOTS).toArray() as DomElement[]) {
  for (const list of $(root).find(LIST_SEL).toArray() as DomElement[]) {
   if (seen.has(list)) continue;
   seen.add(list);
   // A submenu inside an item moves with its item; it is never a menu of its own.
   if ($(list).parents(LIST_SEL).length) continue;
   const items = itemsOf($, list);
   if (items.length < 2 || items.length > MENU_LIMITS.items * 2) continue;
   const internal = items.filter((i) => isInternalMenuKey(i.key)).length;
   if (internal < 2 || internal * 2 < items.length) continue;
   out.push({ el: list, items, signature: menuSignature(items.map((i) => i.key)) });
  }
 }
 return out;
}

/**
 * Her main menu, as the header currently has it — the shape the panel shows before she has ever
 * changed anything, and the shape a stored menu is checked against.
 *
 * The menu is the one with the most COPIES (F3: the real menu is the one shipped twice), then the
 * most items. Null when the header carries nothing that looks like a menu.
 */
export function detectMenus($: cheerio.CheerioAPI): DetectedMenu | null {
 const groups: Candidate[][] = [];
 for (const c of menuLists($)) {
  const group = groups.find((g) => g.some((x) => menuMatches(x.signature, c.signature)));
  if (group) group.push(c); else groups.push([c]);
 }
 const best = groups.sort((a, b) => b.length - a.length || b[0].items.length - a[0].items.length)[0];
 if (!best) return null;
 // The copy that names the most ADDRESSES describes the menu best — not the one with the most items.
 // Both copies carry the same five items; only the desktop list says where the dropdown parent goes,
 // because the drawer renders it as a wordless <summary>. Sorting by item count would be a coin toss
 // between them, and losing it costs that item its address.
 const keyCount = (c: Candidate) => c.items.filter((i) => isInternalMenuKey(i.key)).length;
 const richest = [...best].sort((a, b) => keyCount(b) - keyCount(a) || b.items.length - a.items.length)[0];
 return {
  signature: richest.signature,
  copies: best.length,
  items: richest.items.map((i, n) => ({ id: `m${n}`, label: i.label, href: i.key ?? "" })),
 };
}

/** What a PUT may store: bounded, and never a link that runs script. */
export function sanitizeMenuItems(raw: unknown): MenuItem[] {
 if (!Array.isArray(raw)) return [];
 const out: MenuItem[] = [];
 for (const e of raw) {
  if (!e || typeof e !== "object") continue;
  const o = e as { id?: unknown; label?: unknown; href?: unknown; hidden?: unknown };
  const href = typeof o.href === "string" ? o.href.trim().slice(0, MENU_LIMITS.href) : "";
  // A menu item's address is checked here as well as on the way in, because this is the value that
  // ends up in an href attribute on every page of her site.
  if (/^\s*(javascript|data|vbscript):/i.test(href)) continue;
  out.push({
   id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `m${out.length}`,
   label: typeof o.label === "string" ? o.label.replace(/\s+/g, " ").trim().slice(0, MENU_LIMITS.label) : "",
   href,
   ...(o.hidden === true ? { hidden: true as const } : {}),
  });
  if (out.length >= MENU_LIMITS.items) break;
 }
 return out;
}

/**
 * Write a new name into an existing item, without disturbing the markup around it.
 *
 * A theme wraps its label in its own element as often as not (Dawn's inline items put it in a
 * `<span>`), and that element may be what its CSS and its script are addressing. So the words are
 * replaced on the DEEPEST element that holds them and nothing else is touched — never the anchor
 * itself when the anchor has structure inside it.
 */
function setItemLabel($: cheerio.CheerioAPI, entry: MenuEntry, label: string): boolean {
 const $a = $(entry.el).find("a[href]").first();
 const $host = $a.length ? $a : $(entry.el).find("summary").first();
 if (!$host.length) return false;
 const deepest = $host.find("*").filter((_i, el) => $(el).children().length === 0 && $(el).text().trim() === entry.label).last();
 const $target = deepest.length ? deepest : $host;
 // Only when the target really is just those words: an anchor holding an icon plus a label would
 // lose the icon, and a menu that drops its cart glyph is worse than one with an old name on it.
 if (!$target.children().length || $target.text().trim() === entry.label) { $target.text(label); return true; }
 return false;
}

/** A new item, cloned from one of her own so it arrives in the theme's own markup. */
function cloneItem($: cheerio.CheerioAPI, from: readonly MenuEntry[], item: MenuItem): DomElement | null {
 // Never clone an item that opens a dropdown: its markup carries a whole submenu and the ids the
 // theme's own script binds to. A plain item is the one shape that is safe to copy.
 const plain = from.find((i) => i.key && !$(i.el).find("details, summary, ul, .header-nav-folder-item").length);
 if (!plain) return null;
 const $c = $(plain.el).clone();
 $c.removeAttr("aria-current").find("[aria-current]").removeAttr("aria-current");
 $c.add($c.find("*")).each((_i, el) => {
  const cls = ($(el).attr("class") || "").split(/\s+/).filter((c) => c && !ACTIVE_CLASS.test(c));
  if (cls.length) $(el).attr("class", cls.join(" ")); else $(el).removeAttr("class");
 });
 const $a = $c.find("a[href]").first();
 if (!$a.length) return null;
 // The editor parks every href (see prepareEditMode); a cloned item has to be parked the same way or
 // it becomes the one live link on an otherwise inert page.
 if ($a.attr("data-vya-href") !== undefined) $a.attr("data-vya-href", item.href).attr("href", "#");
 else $a.attr("href", item.href);
 $a.text(item.label || item.href);
 return $c.get(0) as DomElement;
}

/**
 * Her order, and her hidden pages, applied to every copy of the menu.
 *
 * Only whole item ELEMENTS are moved or removed — never their insides. A mega-menu's markup, the ids
 * its script binds to and the submenu it opens all travel with the item, which is what keeps this
 * safe on themes that index their own menu items.
 *
 * With no stored menu (`menu: null`) this still runs, for the one thing that is true without her
 * having arranged anything: a page she hid is a page her menu must stop pointing at.
 */
export function applyMenu(
 $: cheerio.CheerioAPI,
 opts: { menu?: StoredMenu | null; hidden?: ReadonlySet<string>; labels?: ReadonlyMap<string, string> },
): { copies: number; changed: boolean } {
 const menu = opts.menu ?? null;
 const hidden = opts.hidden ?? new Set<string>();
 const labels = opts.labels ?? new Map<string, string>();
 if (!menu && !hidden.size && !labels.size) return { copies: 0, changed: false };

 let copies = 0, changed = false;
 for (const list of menuLists($)) {
  // 1. Links to pages she has hidden, gone — from EVERY copy, whether or not this header is the one
  //    her order was learned from. A hidden page must not be linked from any menu at all.
  let entries = list.items;
  for (const i of entries) if (isInternalMenuKey(i.key) && hidden.has(i.key)) { $(i.el).remove(); changed = true; }
  entries = entries.filter((i) => !(isInternalMenuKey(i.key) && hidden.has(i.key)));

  // 2. A page she RENAMED wears its new name in the menu — in every copy, and whether or not she has
  //    ever dragged anything. The name comes from the page's own row, so this needs no stored menu;
  //    renaming is one write, and both the tab title and the menu label follow from it.
  for (const i of entries) {
   const renamed = isInternalMenuKey(i.key) ? labels.get(i.key) : undefined;
   if (!renamed || renamed === i.label) continue;
   if (setItemLabel($, i, renamed)) { i.label = renamed; changed = true; }
  }

  // A page whose header is not the one this menu was learned from keeps its own menu.
  if (!menu || !menuMatches(list.signature, menu.signature)) continue;
  copies++;

  const byKey = new Map<string, MenuEntry>();
  const byLabel = new Map<string, MenuEntry>();
  for (const i of entries) {
   if (i.key && !byKey.has(i.key)) byKey.set(i.key, i);
   if (!byLabel.has(labelKey(i.label))) byLabel.set(labelKey(i.label), i);
  }
  const wanted = menu.items.filter((it) => !it.hidden && !(isInternalMenuKey(it.href) && hidden.has(it.href)));

  // 2. Her order, and anything she added that this copy has no element for.
  const ordered: DomElement[] = [];
  const used = new Set<MenuEntry>();
  for (const it of wanted) {
   // THE PAGE'S OWN ROW IS THE NEWER TRUTH ABOUT ITS NAME. Her stored menu remembers the name an item
   // had when she last arranged the order; renaming the page writes only the page's row. For a page
   // she ADDED, this copy has no element of its own and one is cloned below — so without this the
   // clone would arrive wearing the name she just changed, and renaming would look like it did
   // nothing. Renaming stays ONE write.
   const named = (isInternalMenuKey(it.href) ? labels.get(it.href) : undefined) || it.label;
   let match = (it.href ? byKey.get(it.href) : undefined) ?? byLabel.get(labelKey(it.label)) ?? byLabel.get(labelKey(named)) ?? null;
   if (!match && it.href) {
    const el = cloneItem($, entries, { ...it, label: named });
    if (el) {
     $(list.el).append(el);
     match = { el, key: it.href, label: named };
     entries = [...entries, match];
     byKey.set(it.href, match);
     changed = true;
    }
   }
   // An element this copy already had may still be wearing the old name.
   if (match && named !== match.label && setItemLabel($, match, named)) { match.label = named; changed = true; }
   if (match && !used.has(match)) { used.add(match); ordered.push(match.el); }
  }

  // 3. An item her stored menu KNOWS and no longer wants (she took it out of the menu). An item the
  //    stored menu has never heard of is left alone — it arrived with a re-crawl, and dropping it
  //    would silently delete something from her site.
  for (const i of entries) {
   if (used.has(i)) continue;
   const named = menu.items.some((it) => (it.href && i.key === it.href) || labelKey(it.label) === labelKey(i.label));
   if (named) { $(i.el).remove(); changed = true; }
  }

  // 4. Put them in her order. Re-appending children that are already children is what reorders them.
  if (!ordered.length) continue;
  const rest = ($(list.el).children().toArray() as DomElement[]).filter((el) => !ordered.includes(el));
  const after = [...ordered, ...rest];
  const before = $(list.el).children().toArray();
  if (before.length !== after.length || before.some((el, i) => el !== after[i])) changed = true;
  for (const el of after) $(list.el).append(el);
 }
 return { copies, changed };
}
