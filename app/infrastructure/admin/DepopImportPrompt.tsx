"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { TechCard, TechButton, TechButtonLink } from "./ui";
import { depopPrompt, DEPOP_PROMPT_KEY, type PromptState } from "@/app/lib/depop-prompt";

// "Are your products on Depop?" — asked once, of the sellers it could possibly help.
//
// A seller building a shop from scratch is looking at an empty inventory and a lot of typing. Most
// of them already have the whole thing on Depop: photographs taken, descriptions written, prices
// decided. One question here is the difference between a migration and a re-entry.
//
// WHO IS NOT ASKED. Anyone who brought her own website over — her pieces came in with the site, so
// the question has no right answer and reads as VYA not knowing what it just did. Anyone who has
// already imported. And anyone who has answered, ever, on any device: see store-prompts-db.
//
// See app/lib/depop-prompt.ts — the rule is there, tested, rather than spread through this render.

// The canonical listing. The short /detail/<id> form 301s here, and a redirect on the way to an
// install is one more thing that can go wrong in front of somebody deciding whether to bother.
const EXTENSION_URL = "https://chromewebstore.google.com/detail/vya-cross-lister/jcbjeoingkdkodflfbachfpllmkgojkp";

export default function DepopImportPrompt() {
 const [state, setState] = useState<PromptState | null>(null);
 const [started, setStarted] = useState(false);
 const [installing, setInstalling] = useState(false);

 useEffect(() => {
  let live = true;
  // The extension announces itself on the page; it may arrive after this mounts.
  const extension = () => document.documentElement.getAttribute("data-vya-ext") === "1";
  const obs = new MutationObserver(() => setState((s) => (s ? { ...s, extensionInstalled: extension() } : s)));
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vya-ext"] });

  fetch("/api/store/prompts")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => {
    if (!live || !d?.ok) return;
    setState({
     hasCapturedSite: !!d.hasCapturedSite,
     alreadyImported: !!d.depopImported,
     dismissed: (d.answered || []).includes(DEPOP_PROMPT_KEY),
     extensionInstalled: extension(),
    });
   })
   .catch(() => {});
  return () => { live = false; obs.disconnect(); };
 }, []);

 if (!state) return null;
 const verdict = depopPrompt(state);
 if (!verdict.show) return null;

 // Remembered before the card goes, so a slow network can't resurrect it on the next page.
 function answered() {
  setState((s) => (s ? { ...s, dismissed: true } : s));
  void fetch("/api/store/prompts", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ key: DEPOP_PROMPT_KEY }),
  }).catch(() => {});
 }

 // The page tells the extension; the extension opens Depop, walks her selling hub and posts what it
 // finds back to VYA. See the bridge in the extension's vya.js.
 function bringThemOver() {
  try { window.postMessage({ source: "vya-crosslist", type: "import-depop" }, window.location.origin); } catch { /* ignore */ }
  setStarted(true);
 }

 return (
  <TechCard className="mb-4 flex items-start gap-4 p-5">
   <div className="min-w-0 flex-1">
    <p className="text-[14.5px] font-medium text-stone-900">Are your products on Depop?</p>
    <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-stone-500">
     Bring your whole shop over — listings <span className="text-stone-400">and</span> sold history — as drafts,
     so you don&rsquo;t type any of it twice. Nothing goes live until you say so.
    </p>

    {/* WITHOUT THE EXTENSION, SAY WHY AND HAND IT OVER. The import runs in her own browser, signed in
        as her — that is the whole reason it can read her shop at all, and it is worth one sentence,
        because "install something" with no reason given is where most people stop. */}
    {verdict.action === "install-extension" && !started && (
     <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-stone-500">
      It runs through a free Chrome extension, on your own computer, signed in as you — which is how it
      can read your shop at all. One install, then the button here does the rest.
     </p>
    )}
    {installing && (
     <p className="mt-2 text-[12.5px] font-medium text-stone-700">
      Once it&rsquo;s added, refresh this page — this turns into &ldquo;Yes, bring them over&rdquo;.
     </p>
    )}

    {started && (
     <p className="mt-2 text-[12.5px] font-medium text-stone-700">
      Opening Depop and importing — watch the panel there, then come back. Your drafts land in Inventory.
     </p>
    )}
   </div>

   {!started && (
    <div className="flex shrink-0 items-center gap-2">
     {verdict.action === "import" ? (
      <TechButton onClick={bringThemOver}>Yes, bring them over</TechButton>
     ) : (
      // A button reading "bring them over" that cannot bring anything over is worse than the question,
      // so the offer becomes the install — primary, right here, not a link to go and find somewhere.
      <TechButtonLink href={EXTENSION_URL} target="_blank" rel="noopener" onClick={() => setInstalling(true)}>
       <Download size={14} /> Add to Chrome
      </TechButtonLink>
     )}
     <button
      type="button"
      onClick={answered}
      title="No, my products aren’t on Depop"
      aria-label="No, my products aren’t on Depop"
      className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
     >
      <X size={16} />
     </button>
    </div>
   )}
  </TechCard>
 );
}
