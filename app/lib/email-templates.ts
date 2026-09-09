// ───────────────────────────────────────────────────────────────────────────
// Starting points for a campaign.
//
// A blank box is the reason most stores never send a second email. Shopify learned this and put a
// gallery of starting points in front of the composer; this is ours.
//
// Two decisions worth stating, because they're what make this different from a folder of HTML:
//
//  1. A template is CONTENT, not markup. Each one is a subject and a few lines, rendered through the
//     same storeEmailHtml every automatic email uses — so it arrives in the store's own logo,
//     colours and fonts rather than in a stock design that looks like everyone else's.
//
//  2. The words are written to be SENT AS-IS. A template full of "Lorem ipsum" or "[YOUR TEXT HERE]"
//     is a blank box with extra steps. Anything that must change is a {token} the store's own data
//     fills in, and the rest is real copy for a vintage shop.
//
// Tokens: {store} {piece} {count} {code} — filled from the store and its stock before the seller
// sees them, so the draft opens already true rather than as a form to complete.
// ───────────────────────────────────────────────────────────────────────────

export type TemplateCategory = "Announcements" | "New in" | "Sales" | "Newsletters" | "Quiet moments";

export type EmailTemplate = {
 /** Which layout this one is. See EmailDesign in email-template.ts. */
 design: "classic" | "statement" | "photo" | "editorial" | "grid";
 id: string;
 name: string;
 category: TemplateCategory;
 /** One line for the card, so a seller can tell them apart without opening each. */
 blurb: string;
 subject: string;
 /** First line becomes the headline; the rest sits under it. Same rule as every automatic email. */
 body: string;
 /** Whether to attach pieces from the shop. "new" = latest, "none" = words only. */
 pieces: "new" | "none";
 cta?: string;
};

export const TEMPLATES: EmailTemplate[] = [
 // The copy here is deliberately PLAIN.
 //
 // These are drafts a shop owner opens and rewrites in her own voice — so anything clever we write
 // is something she has to delete first. A starting point should say the obvious thing in the
 // fewest words and get out of the way. Square brackets mark the bits only she can fill in, so
 // they're easy to spot and replace.

 // ── New in ───────────────────────────────────────────────────────────────
 {
  id: "just-landed", name: "New arrivals", category: "New in", pieces: "new", design: "grid",
  blurb: "Your newest pieces.",
  subject: "New in at {store}",
  body: "We just added {count} new pieces.\nHave a look before they go.",
  cta: "Shop new arrivals",
 },
 {
  id: "one-piece", name: "One piece", category: "New in", pieces: "new", design: "photo",
  blurb: "One piece, front and centre.",
  subject: "{piece}",
  body: "{piece} just came in.\nThere's only one, so it won't be here long.",
  cta: "Take a look",
 },
 {
  id: "back-in", name: "Back in stock", category: "New in", pieces: "new", design: "classic",
  blurb: "Pieces that have returned.",
  subject: "A few pieces are back",
  body: "Some favourites are back in the shop.\nCleaned and ready to wear.",
  cta: "Shop these",
 },
 {
  id: "one-left", name: "Almost gone", category: "New in", pieces: "new", design: "grid",
  blurb: "For pieces about to sell out.",
  subject: "Almost gone",
  body: "These pieces are nearly gone.\nThere's one of each.",
  cta: "Shop now",
 },

 // ── Announcements ────────────────────────────────────────────────────────
 {
  id: "were-open", name: "We're open", category: "Announcements", pieces: "none", design: "statement",
  blurb: "A new shop, or reopening.",
  subject: "{store} is now open",
  body: "The shop is open.\nEverything is one of a kind.",
  cta: "Have a look",
 },
 {
  id: "market-day", name: "Market or pop-up", category: "Announcements", pieces: "none", design: "statement",
  blurb: "Where you'll be, and when.",
  subject: "We'll be at [market name] this weekend",
  body: "Come and see us at [market name] on [day].\nWe'll have a rail of pieces to try on.",
  cta: "See what we're bringing",
 },
 {
  id: "appointments-open", name: "Book a fitting", category: "Announcements", pieces: "none", design: "editorial",
  blurb: "For shops taking appointments.",
  subject: "Book a fitting at {store}",
  body: "You can now book a time to come in and try things on.\nPick a slot that suits you.",
  cta: "Book a time",
 },
 {
  id: "new-site", name: "New website", category: "Announcements", pieces: "new", design: "statement",
  blurb: "When you've moved or relaunched.",
  subject: "We have a new website",
  body: "Our new shop is live.\nSame pieces, easier to browse.",
  cta: "Visit the shop",
 },

 // ── Sales ────────────────────────────────────────────────────────────────
 {
  id: "code", name: "Discount code", category: "Sales", pieces: "new", design: "statement",
  blurb: "Give a code to your list.",
  subject: "Here's {code} for your next order",
  body: "Use {code} at checkout.\nIt works on everything in the shop.",
  cta: "Shop with your code",
 },
 {
  id: "last-chance", name: "Sale ending", category: "Sales", pieces: "new", design: "statement",
  blurb: "The last day of a sale.",
  subject: "The sale ends tonight",
  body: "Last chance to shop the sale.\nWhen a piece is gone, it's gone.",
  cta: "Shop the sale",
 },
 {
  id: "price-drop", name: "Lower prices", category: "Sales", pieces: "new", design: "grid",
  blurb: "Pieces you've reduced.",
  subject: "New lower prices",
  body: "We've reduced some pieces.\nSame condition, lower price.",
  cta: "See what's reduced",
 },
 {
  id: "free-shipping", name: "Free shipping", category: "Sales", pieces: "new", design: "statement",
  blurb: "A shipping offer.",
  subject: "Free shipping this week",
  body: "Shipping is on us until [date].\nNo code needed.",
  cta: "Shop now",
 },

 // ── Newsletters ──────────────────────────────────────────────────────────
 {
  id: "whats-good", name: "Our picks", category: "Newsletters", pieces: "new", design: "editorial",
  blurb: "A few pieces you like.",
  subject: "A few things we love right now",
  body: "Here are a few pieces we're loving this week.",
  cta: "Shop these",
 },
 {
  id: "how-to-wear", name: "How to style it", category: "Newsletters", pieces: "new", design: "photo",
  blurb: "Styling ideas.",
  subject: "Three ways to wear it",
  body: "One piece, three ways to style it.\n[Write your styling notes here.]",
  cta: "Shop the piece",
 },
 {
  id: "behind", name: "Where we found it", category: "Newsletters", pieces: "new", design: "editorial",
  blurb: "Sourcing notes.",
  subject: "Where these pieces came from",
  body: "A look at what we found this month, and where.\n[Add a line or two about your sourcing.]",
  cta: "Shop the pieces",
 },
 {
  id: "follow-us", name: "Follow us", category: "Newsletters", pieces: "none", design: "classic",
  blurb: "Point people to your socials.",
  subject: "Follow us for first look",
  body: "We post new pieces on Instagram first.\nFollow us at [@yourhandle].",
  cta: "Follow us",
 },

 // ── Quiet moments ────────────────────────────────────────────────────────
 {
  id: "thanks", name: "Thank you", category: "Quiet moments", pieces: "none", design: "editorial",
  blurb: "No selling.",
  subject: "Thank you",
  body: "Thanks for shopping with us.\nIt means a lot to a small shop.",
 },
 {
  id: "still-here", name: "Still want our emails?", category: "Quiet moments", pieces: "none", design: "classic",
  blurb: "Clears out inactive addresses.",
  subject: "Do you still want our emails?",
  body: "You haven't opened our emails in a while.\nIf you'd rather not get them, you can unsubscribe below.",
 },
 {
  id: "holiday", name: "Holiday hours", category: "Quiet moments", pieces: "none", design: "editorial",
  blurb: "Closing dates and last post.",
  subject: "Our holiday hours",
  body: "We're closed from [date] to [date].\nOrders placed before [date] will go out first.",
 },
 {
  id: "restock-soon", name: "Back soon", category: "Quiet moments", pieces: "none", design: "classic",
  blurb: "When you're away or sourcing.",
  subject: "We're away sourcing",
  body: "We're away until [date], finding new pieces.\nThe shop is still open and orders will go out when we're back.",
 },
];

export const CATEGORIES: TemplateCategory[] = ["New in", "Announcements", "Sales", "Newsletters", "Quiet moments"];

export type TemplateFill = { store?: string | null; piece?: string | null; count?: number | null; code?: string | null };

/**
 * Fill a template's tokens from the store's real data.
 *
 * Any token we can't answer is REMOVED rather than left as {piece} — a draft that opens with braces
 * in it is a form to complete, and the whole point is that it opens ready to send. Sentences that
 * lose their subject are dropped whole, so nothing reads as a fragment.
 */
export function fillTemplate(text: string, f: TemplateFill): string {
 const store = (f.store || "").trim();
 const piece = (f.piece || "").trim();
 const count = typeof f.count === "number" && f.count > 0 ? String(f.count) : "";
 const code = (f.code || "").trim();

 return text
  .split("\n")
  .map((line) => {
   // A line that needs something we don't have can't be repaired by leaving the brace in.
   if (/\{piece\}/.test(line) && !piece) return "";
   if (/\{code\}/.test(line) && !code) return "";
   return line
    .replace(/\{store\}/g, store || "our shop")
    .replace(/\{piece\}/g, piece)
    .replace(/\{count\}/g, count || "New")
    .replace(/\{code\}/g, code);
  })
  .filter(Boolean)
  .join("\n")
  .trim();
}

export function templateById(id: string): EmailTemplate | null {
 return TEMPLATES.find((t) => t.id === id) ?? null;
}
