// Ask VYA, the parts that are logic rather than layout.
//
// The web's Sidekick (app/store/Sidekick.tsx) and this file answer the same questions: which
// markdown does Claude actually emit, which replies deserve Yes/No buttons, which tool names are
// worth a chip, and which of them mean the store changed underneath her. Keeping them here rather
// than inside the screen is what lets a test notice when the web moves and the phone doesn't,
// which is the one kind of drift AGENTS.md says can be enforced.

export type Action = { name: string; ok: boolean };

/** One turn as the screen holds it. `images` are data URLs, attached by her, never returned by the API. */
export type ChatMessage = { role: "user" | "assistant"; content: string; actions?: Action[]; images?: string[] };

/** What the opening screen offers. Phrased for a seller holding a phone, not sitting at a canvas:
 *  "build my whole storefront" is the web's first suggestion and is the one thing this screen
 *  cannot show her the result of. */
export const SUGGESTIONS = [
  "What should I list next?",
  "Write a description for my Chanel bag",
  "How do I get paid?",
  "Make my storefront more elegant",
];

// Friendly labels for the "what VYA did" chips. Same map as the web; a tool with no label here
// draws no chip, which is how read-only tools (get_storefront, list_sections) stay silent.
const ACTION_LABELS: Record<string, string> = {
  update_storefront_design: "Updated design", set_hero_photo: "Set hero photo", update_listing: "Updated listing",
  add_section: "Added section", add_html_section: "Built custom section", update_section: "Edited section",
  remove_section: "Removed section", move_section: "Moved section", set_layout: "Rebuilt page",
  create_page: "Created page", set_page_layout: "Updated page", delete_page: "Deleted page",
  edit_captured_page: "Edited copy", style_captured_site: "Applied styling", style_storefront: "Applied custom CSS",
  remember_fact: "Remembered", forget_fact: "Forgot", update_email_design: "Updated email design",
  revert_last_change: "Reverted last change",
};

/** The chips under a reply: only what actually succeeded, and only what has a name a seller knows. */
export function actionChips(actions?: Action[]): string[] {
  return (actions ?? []).filter((a) => a.ok && ACTION_LABELS[a.name]).map((a) => ACTION_LABELS[a.name]);
}

// The tools that WRITE. The web dispatches a "vya:store-updated" event on these so open panels
// refetch; the phone invalidates its query cache for the same reason. Miss one and she watches VYA
// say "done" over an Inventory tab still showing the old listing.
const WRITE_TOOLS = new Set([
  "update_storefront_design", "style_storefront", "add_html_section", "set_hero_photo", "update_listing",
  "add_section", "update_section", "remove_section", "move_section", "set_layout", "create_page",
  "set_page_layout", "delete_page", "edit_captured_page", "style_captured_site", "update_email_design",
  "revert_last_change", "write_storefront_code",
]);

/** Did this turn change anything the rest of the app is drawing? */
export function changedTheStore(actions?: Action[]): boolean {
  return (actions ?? []).some((a) => a.ok && WRITE_TOOLS.has(a.name));
}

// A yes/no question deserves yes/no buttons.
//
// VYA confirms before it changes anything ("Want me to add a reviews section?"), which is right,
// but it means the most common reply in the whole product is the word "yes". On a laptop that is
// three keystrokes. On a phone it is: raise the keyboard, type, send.
//
// Finding the question is the whole problem, and it is the web's problem too, so this is its
// solution: locate the last "?", allow a short sign-off after it on the same line, and take the
// sentence that ends there. Deliberately conservative about WHICH questions qualify, because the
// failure mode is a seller tapping Yes at an open question and meaning nothing by it.
const YES_NO_OPENERS = /^(?:do|does|did|should|shall|would|will|can|could|may|is|are|was|were|have|has|want|ready|okay|ok|sound|look)\b|(?:want me to|shall i|should i|would you like|do you want|ok(?:ay)? to|sound good|look right|make sense|go ahead|shall we)\b/i;

export function isYesNoQuestion(text: string): boolean {
  const t = text.replace(/[*_`>#]/g, "").trim();
  const q = t.lastIndexOf("?");
  if (q === -1) return false;
  // A brief sign-off after the question is fine ("... go ahead? Just say the word."). Anything on a
  // NEW line is not: a question followed by a list of options is asking her to choose, not to agree.
  const after = t.slice(q + 1);
  if (after.includes("\n") || after.trim().length > 60) return false;
  const before = t.slice(0, q);
  const start = Math.max(before.lastIndexOf("\n"), before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
  const last = before.slice(start + 1).trim();
  if (!last || last.length > 200) return false;
  // An "or" question ("a grid or a carousel?") takes neither answer.
  if (/\bor\b/i.test(last)) return false;
  // A wh-question is open by definition, whatever it starts with.
  if (/^(?:what|which|who|whom|whose|where|when|why|how)\b/i.test(last)) return false;
  return YES_NO_OPENERS.test(last);
}

/* ── rich text ──────────────────────────────────────────────────────────────────────────────── */

// Claude replies in markdown whether or not anyone asked it to, and a <Text> renders that markdown
// as literal asterisks. The web has a small dependency-free renderer (app/store/chatRender.tsx);
// this is the same grammar, parsed into data so the RN component can stay a dumb mapper and so the
// parsing itself is testable without a renderer.

export type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean; href?: string };

export type RichBlock =
  | { kind: "para"; spans: Span[] }
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; items: Span[][] };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

/** One line of markdown into styled runs. Unmatched text passes through untouched. */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("`")) out.push({ text: tok.slice(1, -1), code: true });
    else if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), bold: true });
    else if (tok.startsWith("*")) out.push({ text: tok.slice(1, -1), italic: true });
    else {
      const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
      if (link) out.push({ text: link[1], href: link[2] });
      else out.push({ text: tok });
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((s) => s.text !== "");
}

/** A whole reply into blocks: paragraphs, fenced code, and bullet or numbered lists. */
export function parseRich(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  // Split on fences. Odd segments are code. An unterminated fence therefore renders as code to the
  // end of the message, which is what a half-streamed reply should look like, not raw backticks.
  text.split(/```/).forEach((seg, si) => {
    if (si % 2 === 1) {
      // Drop the language tag ("ts\n") and the trailing newline the fence leaves behind.
      const code = seg.replace(/^[a-zA-Z0-9_-]*\n/, "").replace(/\n$/, "");
      if (code) blocks.push({ kind: "code", text: code });
      return;
    }
    let para: string[] = [];
    let list: { ordered: boolean; items: Span[][] } | null = null;
    const flushPara = () => { if (para.length) { blocks.push({ kind: "para", spans: spans(para.join("\n")) }); para = []; } };
    const flushList = () => { if (list) { blocks.push({ kind: "list", ordered: list.ordered, items: list.items }); list = null; } };

    for (const line of seg.split("\n")) {
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      const num = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (bullet) {
        flushPara();
        if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
        list.items.push(spans(bullet[1]));
      } else if (num) {
        flushPara();
        if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
        list.items.push(spans(num[1]));
      } else if (line.trim() === "") {
        flushPara(); flushList();
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara(); flushList();
  });
  return blocks;
}

/* ── talking to /api/store/assistant ────────────────────────────────────────────────────────── */

type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type TextBlock = { type: "text"; text: string };
export type ApiMessage = { role: "user" | "assistant"; content: string | (ImageBlock | TextBlock)[] };

/** A data URL ("data:image/jpeg;base64,...") as an Anthropic image block. */
export function toImageBlock(url: string): ImageBlock {
  const comma = url.indexOf(",");
  const mediaType = /data:(.*?);base64/.exec(url.slice(0, comma))?.[1] || "image/jpeg";
  return { type: "image", source: { type: "base64", media_type: mediaType, data: url.slice(comma + 1) } };
}

/**
 * The thread as the route wants it.
 *
 * Text turns stay plain strings, which is what the saved thread (assistant-memory-db) stores and
 * replays. Only a turn carrying photographs becomes a block array, images first, so the model reads
 * the picture before the question about it. A turn whose images she attached without typing
 * anything sends no empty text block; the API rejects one.
 */
export function toApiMessages(msgs: ChatMessage[]): ApiMessage[] {
  return msgs.map((m) =>
    m.images && m.images.length
      ? { role: m.role, content: [...m.images.map(toImageBlock), ...(m.content ? [{ type: "text" as const, text: m.content }] : [])] }
      : { role: m.role, content: m.content },
  );
}
