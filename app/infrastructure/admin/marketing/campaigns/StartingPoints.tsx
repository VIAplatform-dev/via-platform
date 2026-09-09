"use client";

import { useEffect, useState } from "react";
import { cn } from "../../ui";

// The gallery a seller sees before the blank box.
//
// Every card shows the REAL subject and opening line this shop would send — filled server-side with
// the store's name and its newest pieces — because a card reading "{count} new pieces" is asking her
// to finish writing it, which is the thing the gallery exists to avoid.

type Template = {
 id: string; name: string; category: string; blurb: string; design: string;
 subject: string; body: string; cta: string | null;
 /** The email itself, rendered. Shown scaled down, so the card IS the email. */
 preview: string;
};

export default function StartingPoints() {
 const [templates, setTemplates] = useState<Template[]>([]);
 const [categories, setCategories] = useState<string[]>([]);
 const [cat, setCat] = useState<string>("All");
 const [open, setOpen] = useState(true);
 // Which template is open full size. A 190px card is enough to choose the LOOK, not enough to read
 // the words you're about to send to your customers.
 const [preview, setPreview] = useState<Template | null>(null);

 useEffect(() => {
  fetch("/api/store/campaign/templates")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => { if (d?.ok) { setTemplates(d.templates || []); setCategories(d.categories || []); } })
   .catch(() => {});
 }, []);

 if (!templates.length) return null;
 const shown = cat === "All" ? templates : templates.filter((t) => t.category === cat);

 return (
  <div className="border-b border-stone-100 px-5 py-4">
   <div className="flex flex-wrap items-center gap-2">
    <p className="text-[13px] font-medium text-stone-900">Start from something</p>
    <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto text-[12px] text-stone-400 hover:text-stone-700">
     {open ? "Hide" : "Show"}
    </button>
   </div>

   {open && (
    <>
     <p className="mt-0.5 text-[12px] text-stone-500">
      Each one opens as a draft with your shop&rsquo;s details already in it. Click one to read it, then change anything you like.
     </p>

     <div className="mt-3 flex flex-wrap gap-1.5">
      {["All", ...categories].map((c) => (
       <button
        key={c} type="button" onClick={() => setCat(c)}
        className={cn("rounded-full px-2.5 py-1 text-[11.5px] transition",
         cat === c ? "bg-stone-900 text-white" : "border border-stone-200 text-stone-500 hover:bg-stone-50")}
       >{c}</button>
      ))}
     </div>

     <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((t) => (
       <button
        key={t.id} type="button"
        onClick={() => setPreview(t)}
        className="group overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-stone-400"
       >
        {/* The card IS the email: a real render, scaled down. A sketch is a guess at what you'd
            get — this is what would arrive, in your colours, with your pieces in it.
            600px wide scaled to the card, clipped at a readable height. */}
        <div className="relative h-[190px] overflow-hidden border-b border-stone-100 bg-white">
         <iframe
          srcDoc={t.preview}
          title={t.name}
          tabIndex={-1}
          sandbox=""
          scrolling="no"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: 600, height: 700, transform: "scale(0.52)" }}
         />
         {/* Fades the clip rather than cutting a line through a word. */}
         <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
        </div>
        <div className="px-3.5 py-2.5">
         <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12.5px] font-medium text-stone-800">{t.name}</span>
          <span className="text-[11px] text-stone-400">{t.category}</span>
         </div>
         <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-400">{t.blurb}</p>
        </div>
       </button>
      ))}
     </div>
    </>
   )}

   {/* Open one full size: the words matter more than the layout, and they're unreadable at 52%. */}
   {preview && (
    <div
     className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
     onClick={() => setPreview(null)}
     role="dialog"
     aria-label={`${preview.name} preview`}
    >
     <div className="flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-5 py-3.5">
       <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-stone-900">{preview.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-stone-500">Subject: {preview.subject}</p>
       </div>
       <button type="button" onClick={() => setPreview(null)} className="text-[12px] text-stone-400 hover:text-stone-700">Close</button>
       <button
        type="button"
        onClick={() => { window.location.href = `/admin/marketing/campaigns/compose?template=${encodeURIComponent(preview.id)}`; }}
        className="rounded-lg bg-stone-900 px-3.5 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
       >Edit this email</button>
      </div>
      <iframe srcDoc={preview.preview} title={preview.name} sandbox="" className="h-[560px] w-full border-0 bg-white" />
      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] leading-relaxed text-stone-400">
       Editing opens this as a draft you can change: the words, the layout, the pieces and the button.
      </p>
     </div>
    </div>
   )}
  </div>
 );
}
