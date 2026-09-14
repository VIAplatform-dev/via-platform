/**
 * Whether to ask a seller "are your products on Depop?". Pure.
 *
 * THE ONE-TIME QUESTION. A vintage seller arriving at VYA has her shop somewhere already, and for a
 * great many of them that somewhere is Depop. Asking once, at the point she is staring at an empty
 * inventory, saves her typing four hundred listings again. Not asking at all means she does type
 * them again, or she leaves.
 *
 * ONLY A STORE BUILDING FROM SCRATCH. A seller who brought her own website over already has her
 * products — they came in with the site, from Shopify or Squarespace or wherever she was. Asking
 * HER about Depop is a question with no right answer: her pieces are already here, and the prompt
 * reads as VYA not knowing what it just did.
 *
 * AND ONLY ONCE. "No, my products aren't on Depop" is an answer, not a dismissal to re-ask next
 * week. It is remembered per store, not per browser, because a seller who said no on her laptop has
 * still said no when she opens her phone.
 */

export type PromptState = {
 /** Did she bring an existing website over? Captured pages > 0. */
 hasCapturedSite: boolean;
 /** Has anything already come across from Depop? */
 alreadyImported: boolean;
 /** Has she answered the question before? */
 dismissed: boolean;
 /** Is the browser extension installed? Without it there is nothing to press. */
 extensionInstalled: boolean;
};

export type PromptVerdict =
 | { show: false; why: "imported-site" | "already-imported" | "answered" }
 | { show: true; action: "import" | "install-extension" };

/**
 * `action` is what the button does. Without the extension the honest button is "get the extension",
 * not "bring them over" — a button that cannot do the thing it says is worse than the question.
 */
export function depopPrompt(s: PromptState): PromptVerdict {
 if (s.hasCapturedSite) return { show: false, why: "imported-site" };
 if (s.alreadyImported) return { show: false, why: "already-imported" };
 if (s.dismissed) return { show: false, why: "answered" };
 return { show: true, action: s.extensionInstalled ? "import" : "install-extension" };
}

/** The key this answer is remembered under. */
export const DEPOP_PROMPT_KEY = "depop-import";
