// Screens where the text of the thing clicked is somebody else's personal data.
//
// Autocapture is worth keeping — knowing a seller pressed "Connect a marketplace" is exactly the
// kind of thing this exists to learn. But it records the WORDS on the control, and on these screens
// those words are a buyer's name, their email, their address, or what they paid. That is the
// seller's customer's data, and neither of them agreed to it leaving the page.
//
// So the click survives and the words don't: we still see that she opened an order, never whose.
const PRIVATE_SCREENS = /\/admin\/(orders|customers|inbox|consignment|payments|recovery)/;
const REDACTED = "[redacted]";

export function redactOnPrivateScreens(props: Record<string, unknown>): Record<string, unknown> {
 const path = typeof props.$pathname === "string" ? props.$pathname : "";
 if (!PRIVATE_SCREENS.test(path)) return props;

 if (typeof props.$el_text === "string") props.$el_text = REDACTED;
 // The chain is one long string PostHog parses later — redact inside it, don't drop it, or the
 // event loses the structure that makes it readable at all.
 if (typeof props.$elements_chain === "string") {
  props.$elements_chain = props.$elements_chain.replace(/text="[^"]*"/g, `text="${REDACTED}"`);
 }
 if (Array.isArray(props.$elements)) {
  props.$elements = props.$elements.map((el) => {
   if (!el || typeof el !== "object") return el;
   const e = { ...(el as Record<string, unknown>) };
   for (const k of ["$el_text", "text", "attr__title", "attr__alt", "attr__aria-label", "attr__value", "attr__href"]) {
    if (k in e) e[k] = REDACTED;
   }
   return e;
  });
 }
 return props;
}
