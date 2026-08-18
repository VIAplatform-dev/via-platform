// Guardrail for the assistant's add_html_section tool. Custom HTML is sanitized before it renders on a
// public page — scripts and event handlers are stripped. That means an accordion/FAQ (or anything
// click-driven) built as static HTML with onclick handlers LOOKS built but silently does nothing once
// saved. Rather than let the assistant ship that (and make the seller discover it), we reject it at the
// tool boundary with an actionable redirect. This is the "system catches it, not the user" line of
// defense — pure + unit-tested so it can't quietly regress.

export type CustomHtmlVerdict = { ok: true } | { ok: false; reason: string };

const NATIVE_FAQ_HINT =
 "Use the built-in 'faq' section instead — it's a real click-to-expand accordion that needs no JavaScript. " +
 "Call add_section (home), set_page_layout (an existing page), or create_page with a block of type 'faq' and " +
 "props { heading, q0, a0, q1, a1, q2, a2, … } (question, answer, question, answer …).";

/**
 * Decide whether a custom_html_section payload will actually work once sanitized.
 * - js present ⇒ it runs sandboxed (its own JS survives) ⇒ allowed.
 * - static html that leans on stripped interactivity (onclick/scripts) ⇒ rejected.
 * - static html that looks like an accordion/FAQ but isn't native <details> ⇒ rejected → faq section.
 */
export function checkCustomHtml(html: string, js?: string): CustomHtmlVerdict {
 const raw = (html || "").trim();
 if ((js || "").trim()) return { ok: true }; // sandbox mode carries its own JS
 if (!raw) return { ok: true };
 const h = raw.toLowerCase();

 // 1) Interactivity that depends on handlers/scripts the sanitizer removes → it won't work.
 if (/<script|javascript:|\son(click|change|input|toggle|mouse[a-z]+|key[a-z]+|submit|focus|load)\s*=/.test(h)) {
 return {
 ok: false,
 reason:
 "This static HTML relies on JavaScript/event handlers, which are stripped for security when it renders — so it will look built but do nothing. " +
 "For expand/collapse, use native <details><summary> (works on click with no JS). " +
 "For a FAQ/accordion, don't hand-write HTML at all: " + NATIVE_FAQ_HINT + " " +
 "For a genuinely dynamic widget (calculator, timer, quiz), pass the js field so it runs sandboxed.",
 };
 }

 // 2) Looks like an accordion/FAQ but not built on native <details> → it won't expand.
 const looksAccordion = /\bfaq\b|\baccordion\b|class=["'][^"']*(accordion|faq|collapse|toggle|expandable)[^"']*["']/.test(h);
 if (looksAccordion && !/<details[\s>]/.test(h)) {
 return {
 ok: false,
 reason:
 "This looks like an FAQ/accordion but isn't built on native <details><summary>, so it won't expand when clicked. " +
 NATIVE_FAQ_HINT,
 };
 }

 return { ok: true };
}
