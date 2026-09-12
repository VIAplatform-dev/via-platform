"use client";

// Read an automation before switching it on.
//
// The flows are described in a sentence — "Nudges a shopper who added to cart but didn't check
// out" — and then toggled. A seller turning one on is putting her name on an email she has never
// seen, in her own shop's brand, to her own customers. "should be able to preview these?" is the
// obvious question and there was no answer to it.
//
// Rendered by /api/store/automations/preview, which builds with the same functions the real sends
// use, against the store's real brand and a real piece from its inventory.

import { useState } from "react";
import { X } from "lucide-react";
import { EmailFrame } from "./EmailFrame";

export function AutomationPreviewButton({ flowKey, name }: { flowKey: string; name: string }) {
 const [open, setOpen] = useState(false);
 const [state, setState] = useState<{ html: string; subject: string; note?: string } | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);

 async function show() {
  setOpen(true);
  if (state || loading) return;
  setLoading(true);
  setError(null);
  const r = await fetch("/api/store/automations/preview", {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ key: flowKey }),
  }).then((x) => x.json()).catch(() => null);
  setLoading(false);
  if (r?.ok) setState({ html: r.html, subject: r.subject, note: r.note });
  else setError(r?.error || "Couldn't render that one.");
 }

 return (
  <>
   <button
    type="button"
    onClick={show}
    className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] text-stone-600 transition hover:border-stone-300 hover:bg-stone-50"
   >
    Preview
   </button>

   {open && (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
     <div className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-3 border-b border-stone-100 px-5 py-3.5">
       <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-stone-900">{name}</p>
        {state && <p className="mt-0.5 truncate text-[12px] text-stone-500">{state.subject}</p>}
       </div>
       <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-stone-400 transition hover:text-stone-700"><X size={16} /></button>
      </div>

      {/* The note is for New arrivals, which drafts rather than sends — the difference matters
          before she decides whether the toggle means "emails go out without me". */}
      {state?.note && <p className="border-b border-stone-100 bg-stone-50/70 px-5 py-2.5 text-[12px] text-stone-600">{state.note}</p>}

      {loading && <p className="px-5 py-10 text-center text-[13px] text-stone-400">Rendering…</p>}
      {error && <p className="px-5 py-10 text-center text-[13px] text-rose-600">{error}</p>}
      {state && (
       // below={560}: the modal is 576px wide on a desktop; leave that exactly as it was.
       <EmailFrame html={state.html} title={`${name} preview`} height={520} below={560} className="min-h-0 shrink" />
      )}
     </div>
    </div>
   )}
  </>
 );
}
