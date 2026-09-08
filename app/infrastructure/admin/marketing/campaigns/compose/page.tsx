"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Send, Check, AlertCircle } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, TechButton, cn } from "../../../ui";
import { parseAudience, audienceIsEmpty, describeAudience, type AudienceFilter } from "@/app/lib/customer-audience-core";

// Editing an email, the way the storefront builder edits a page: controls on one side, the real
// thing on the other, updating as you type.
//
// The preview is rendered by the SAME function that sends, so what's on screen is what arrives. An
// editor drawn by separate preview code is an editor that lies, and the lie surfaces in an inbox.

type Design = "classic" | "statement" | "photo" | "editorial" | "grid";

const DESIGNS: { id: Design; name: string; hint: string }[] = [
 { id: "classic", name: "Standard", hint: "Words, a button, then your pieces." },
 { id: "statement", name: "Bold", hint: "Big headline in your colour." },
 { id: "photo", name: "Photo", hint: "One large photo at the top." },
 { id: "editorial", name: "Simple", hint: "Centred text, lots of space." },
 { id: "grid", name: "Grid", hint: "Pieces two across." },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
 return (
  <label className="block">
   <span className="mb-1 block text-[12px] font-medium text-stone-700">{label}</span>
   {children}
   {hint && <span className="mt-1 block text-[11px] leading-relaxed text-stone-400">{hint}</span>}
  </label>
 );
}

const input = "w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus:border-stone-400";

function Compose() {
 const params = useSearchParams();

 const [subject, setSubject] = useState("");
 const [headline, setHeadline] = useState("");
 const [subhead, setSubhead] = useState("");
 const [ctaLabel, setCtaLabel] = useState("Shop now");
 const [link, setLink] = useState("");
 const [design, setDesign] = useState<Design>("classic");
 const [pieceCount, setPieceCount] = useState(4);
 const [eyebrow, setEyebrow] = useState("");
 const [preheader, setPreheader] = useState("");
 const [productsHeading, setProductsHeading] = useState("");
 const [code, setCode] = useState("");
 const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
 // Specific pieces, when a shop wants to feature something rather than take the newest.
 const [pieces, setPieces] = useState<{ id: string; title: string; image: string | null; price: string | null }[]>([]);
 const [itemIds, setItemIds] = useState<string[]>([]);
 const [picking, setPicking] = useState(false);
 const [ground, setGround] = useState<"white" | "brand">("white");
 const [showPrices, setShowPrices] = useState(true);

 const [html, setHtml] = useState("");
 const [count, setCount] = useState(0);
 // Who it goes to: everyone, or a tag / spent-over / bought-in slice. Resolved by the SAME filter the
 // Customers page runs, and the count comes from the server so the button says what will send.
 const [audience, setAudience] = useState<AudienceFilter>({ tags: [], spentOverCents: null, category: null });
 const [spentOverText, setSpentOverText] = useState("");
 const [choices, setChoices] = useState<{ tags: { tag: string; count: number }[]; categories: string[] }>({ tags: [], categories: [] });
 const [allowance, setAllowance] = useState<{ label: string; canSend: boolean; reason: string | null } | null>(null);
 // Empty = send now. A date = leave it for the cron. Scheduling is the difference between "I'll
 // remember to send this on Monday" and it going out on Monday.
 const [sendAt, setSendAt] = useState("");
 const [sending, setSending] = useState(false);
 const [note, setNote] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

 // Load the chosen starting point. Its words land in the fields as a draft — editable immediately,
 // rather than as something to accept or reject.
 useEffect(() => {
  // Opened from the Emails page: its words come back so editing is editing, not retyping.
  const preSubject = params.get("subject");
  const preBody = params.get("body");
  if (preSubject || preBody) {
   const lines = String(preBody || "").split("\n").filter(Boolean);
   setSubject(preSubject || "");
   setHeadline(lines[0] || preSubject || "");
   setSubhead(lines.slice(1).join(" "));
  }

  const id = params.get("template");
  fetch("/api/store/campaign/templates").then((r) => (r.ok ? r.json() : null)).then((d) => {
   const t = d?.templates?.find((x: { id: string }) => x.id === id) ?? null;
   if (!t) return;
   const lines = String(t.body || "").split("\n").filter(Boolean);
   setSubject(t.subject || "");
   setHeadline(lines[0] || t.subject || "");
   setSubhead(lines.slice(1).join(" "));
   setCtaLabel(t.cta || "Shop now");
   setDesign((t.design as Design) || "classic");
   setPieceCount(t.design === "grid" ? 4 : t.design === "photo" ? 2 : 3);
  }).catch(() => {});
  // Arriving from a filtered Customers page: the same ?tag=&spentOver=&category= lands here.
  const a = parseAudience({ tag: params.get("tag"), spentOver: params.get("spentOver"), category: params.get("category") });
  if (!audienceIsEmpty(a)) { setAudience(a); if (a.spentOverCents != null) setSpentOverText(String(a.spentOverCents / 100)); }
  fetch("/api/store/campaign").then((r) => (r.ok ? r.json() : null))
   .then((d) => { setAllowance(d?.allowance ?? null); setChoices({ tags: d?.tags ?? [], categories: d?.categories ?? [] }); }).catch(() => {});
  fetch("/api/store/campaign/pieces").then((r) => (r.ok ? r.json() : null))
   .then((d) => setPieces(d?.pieces ?? [])).catch(() => {});
 }, [params]);

 // The recipient count follows the audience.
 useEffect(() => {
  const qs = new URLSearchParams();
  if (audience.tags?.length) qs.set("tag", audience.tags.join(","));
  if (audience.spentOverCents != null) qs.set("spentOver", String(audience.spentOverCents / 100));
  if (audience.category) qs.set("category", audience.category);
  fetch(`/api/store/campaign${qs.toString() ? `?${qs}` : ""}`).then((r) => (r.ok ? r.json() : null))
   .then((d) => setCount(d?.recipientCount ?? 0)).catch(() => {});
 }, [audience]);

 // Re-render as you type, but not on every keystroke — this hits the server.
 const render = useCallback(() => {
  fetch("/api/store/campaign/render", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ design, headline, subhead, ctaLabel, link, pieceCount, eyebrow, preheader, productsHeading, code, links, itemIds, ground, showPrices }),
  }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.html) setHtml(d.html); }).catch(() => {});
 }, [design, headline, subhead, ctaLabel, link, pieceCount, eyebrow, preheader, productsHeading, code, links, itemIds]);

 useEffect(() => { const t = setTimeout(render, 250); return () => clearTimeout(t); }, [render]);

 async function send(test: boolean) {
  setSending(true); setNote(null);
  // The body the sender expects: first line is the headline, the rest sits under it.
  const body = [headline, subhead].filter(Boolean).join("\n");
  const r = await fetch("/api/store/campaign", {
   method: "POST", headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ subject, body, link, test, audience, scheduledAt: !test && sendAt ? new Date(sendAt).toISOString() : undefined }),
  }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => null);
  setSending(false);
  setNote(r?.ok
   ? { text: test ? "Test sent to you." : r.d?.scheduled ? "Scheduled. You'll find it under Your emails." : `Sent to ${count.toLocaleString()}.`, tone: "ok" }
   : { text: r?.d?.error || "Couldn't send that.", tone: "err" });
 }

 const ready = subject.trim().length > 0 && headline.trim().length > 0;

 return (
  <AdminPage>
   <AdminHeader
    eyebrow="Store · Marketing"
    title="Write your email"
    subtitle="Change anything on the left. The preview is exactly what your customers will get."
    actions={
     <a href="/admin/marketing/campaigns" className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900">
      <ArrowLeft size={14} /> Back to templates
     </a>
    }
   />

   <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
    <div className="flex flex-col gap-4">
     <TechCard className="flex flex-col gap-4 p-5">
      <Field label="Subject" hint="The line people see in their inbox before they open it.">
       <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="New in at your shop" />
      </Field>
      <Field label="Headline" hint="The big line at the top of the email.">
       <input className={input} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="We just added 4 new pieces." />
      </Field>
      <Field label="Line underneath" hint="Optional. One short sentence.">
       <textarea className={cn(input, "resize-none")} rows={2} value={subhead} onChange={(e) => setSubhead(e.target.value)} placeholder="Have a look before they go." />
      </Field>
      <Field label="Small line above the headline" hint="Optional. A word or two, like “New in”.">
       <input className={input} value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="New in" />
      </Field>
      <Field
       label="Inbox preview line"
       hint="The grey line next to your subject in someone's inbox. Left blank, they'll see your shop's name instead — a wasted line."
      >
       <input className={input} value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Four new pieces, one of each." />
      </Field>
      <Field label="Discount code" hint="Optional. Shown under the headline.">
       <input className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SPRING10" />
      </Field>
     </TechCard>

     {/* Who it goes to. Everyone subscribed, unless she narrows it — the count on the button follows. */}
     <TechCard className="flex flex-col gap-3 p-5" data-testid="audience-picker">
      <Field label="Who gets it" hint={`${describeAudience(audience)} · ${count.toLocaleString()} ${count === 1 ? "person" : "people"}`}>
       <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => { setAudience({ tags: [], spentOverCents: null, category: null }); setSpentOverText(""); }}
         className={cn("rounded-full border px-2.5 py-1 text-[12px] transition", audienceIsEmpty(audience) ? "border-transparent bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:border-stone-400")}>Everyone</button>
        {choices.tags.map(({ tag, count: n }) => {
         const on = (audience.tags || []).includes(tag);
         return (
          <button key={tag} type="button" aria-pressed={on} onClick={() => setAudience((a) => ({ ...a, tags: on ? (a.tags || []).filter((t) => t !== tag) : [...(a.tags || []), tag] }))}
           className={cn("rounded-full border px-2.5 py-1 text-[12px] transition", on ? "border-transparent bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:border-stone-400")}>Tag: {tag} <span className="opacity-60">{n}</span></button>
         );
        })}
       </div>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
       <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
        <span className="whitespace-nowrap">Spent over $</span>
        <input type="number" inputMode="decimal" min={0} value={spentOverText} placeholder="0" aria-label="Spent over"
         onChange={(e) => { const t = e.target.value; setSpentOverText(t); const n = Number(t); setAudience((a) => ({ ...a, spentOverCents: t.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null })); }}
         className={cn(input, "w-24")} />
       </label>
       {choices.categories.length > 0 && (
        <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
         <span className="whitespace-nowrap">Bought in</span>
         <select value={audience.category || ""} onChange={(e) => setAudience((a) => ({ ...a, category: e.target.value || null }))} aria-label="Bought in category" className={cn(input, "w-auto")}>
          <option value="">any category</option>
          {choices.categories.map((c) => <option key={c} value={c}>{c}</option>)}
         </select>
        </label>
       )}
      </div>
     </TechCard>

     <TechCard className="flex flex-col gap-4 p-5">
      <Field label="Button" hint="Where the button takes people. Leave it blank and it goes to your shop.">
       <input className={input} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Shop now" />
      </Field>
      <input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://yourshop.com/new" />
      <Field label="Which pieces" hint={itemIds.length ? "You've picked these yourself." : "Your newest listings. Pick your own to feature something."}>
       <div className="flex flex-wrap gap-1.5">
        {[0, 2, 3, 4, 6].map((n) => (
         <button key={n} type="button" onClick={() => { setPieceCount(n); setItemIds([]); }}
          className={cn("rounded-lg border px-3 py-1.5 text-[12.5px] transition",
           !itemIds.length && pieceCount === n ? "border-stone-900 bg-stone-900/[0.03] ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50")}
         >{n === 0 ? "None" : `Newest ${n}`}</button>
        ))}
        <button type="button" onClick={() => setPicking(true)}
         className={cn("rounded-lg border px-3 py-1.5 text-[12.5px] transition",
          itemIds.length ? "border-stone-900 bg-stone-900/[0.03] ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50")}
        >{itemIds.length ? `${itemIds.length} chosen` : "Choose pieces"}</button>
       </div>
      </Field>
      <Field label="Heading above the pieces" hint="Optional, like “Just in”.">
       <input className={input} value={productsHeading} onChange={(e) => setProductsHeading(e.target.value)} placeholder="Just in" />
      </Field>
     </TechCard>

     {/* Links along the bottom — collections, a sale page, an Instagram. Four at most: a row of
         links people scan, not a menu they read. */}
     <TechCard className="p-5">
      <p className="mb-2 text-[12px] font-medium text-stone-700">Links at the bottom</p>
      <div className="flex flex-col gap-2">
       {links.map((l, i) => (
        <div key={i} className="flex gap-1.5">
         <input className={cn(input, "flex-1")} value={l.label} placeholder="New arrivals"
          onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
         <input className={cn(input, "flex-[1.4]")} value={l.url} placeholder="https://…"
          onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
         <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))}
          className="px-1.5 text-[12px] text-stone-400 hover:text-rose-600">Remove</button>
        </div>
       ))}
       {links.length < 4 && (
        <button type="button" onClick={() => setLinks([...links, { label: "", url: "" }])}
         className="self-start text-[12.5px] text-stone-500 underline underline-offset-2 hover:text-stone-900">Add a link</button>
       )}
      </div>
     </TechCard>

     <TechCard className="p-5">
      <p className="mb-2.5 text-[12px] font-medium text-stone-700">Background</p>
      <div className="mb-4 flex gap-1.5">
       {([["white", "Plain"], ["brand", "Your colour"]] as const).map(([g, label]) => (
        <button key={g} type="button" onClick={() => setGround(g)}
         className={cn("flex-1 rounded-lg border px-3 py-2 text-[12.5px] transition",
          ground === g ? "border-stone-900 bg-stone-900/[0.03] ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50")}
        >{label}</button>
       ))}
      </div>
      <label className="mb-4 flex cursor-pointer items-center gap-2">
       <input type="checkbox" checked={showPrices} onChange={() => setShowPrices((v) => !v)} className="h-3.5 w-3.5 accent-stone-900" />
       <span className="text-[12.5px] text-stone-600">Show prices under each piece</span>
      </label>
      <p className="mb-2.5 text-[12px] font-medium text-stone-700">Layout</p>
      <div className="grid grid-cols-2 gap-2">
       {DESIGNS.map((d) => (
        <button key={d.id} type="button" onClick={() => setDesign(d.id)}
         className={cn("rounded-lg border p-2.5 text-left transition",
          design === d.id ? "border-stone-900 bg-stone-900/[0.03] ring-1 ring-stone-900" : "border-stone-200 hover:bg-stone-50")}
        >
         <span className="block text-[12.5px] font-medium text-stone-800">{d.name}</span>
         <span className="mt-0.5 block text-[11px] leading-snug text-stone-400">{d.hint}</span>
        </button>
       ))}
      </div>
     </TechCard>
    </div>

    {/* The email itself. Sticky, because the controls are taller than it is. */}
    <div className="lg:sticky lg:top-6 lg:self-start">
     <TechCard className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-2.5">
       <p className="text-[12px] text-stone-500">Preview</p>
       <p className="ml-auto truncate text-[12px] text-stone-400">{subject || "No subject yet"}</p>
      </div>
      <iframe srcDoc={html} title="Email preview" sandbox="" className="h-[620px] w-full border-0 bg-white" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/60 px-4 py-3">
       <span className="text-[12px]">
        {note ? (
         <span className={cn("inline-flex items-center gap-1.5 font-medium", note.tone === "ok" ? "text-emerald-700" : "text-rose-600")}>
          {note.tone === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}{note.text}
         </span>
        ) : (
         <span className="text-stone-400">{allowance?.label || "Send one to yourself first."}</span>
        )}
       </span>
       <span className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
         <span className="whitespace-nowrap">Send later</span>
         <input
          type="datetime-local"
          value={sendAt}
          onChange={(e) => setSendAt(e.target.value)}
          className="rounded-lg border border-stone-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-stone-400"
         />
        </label>
        <TechButton variant="secondary" onClick={() => send(true)} disabled={sending || !ready}>Send test to myself</TechButton>
        <TechButton onClick={() => send(false)} disabled={sending || !ready || !count || allowance?.canSend === false} title={allowance?.reason ?? undefined}>
         <Send size={14} />{sending ? "Sending…" : sendAt ? "Schedule it" : `Send to ${count.toLocaleString()}`}
        </TechButton>
       </span>
      </div>
     </TechCard>
    </div>
   </div>
   {picking && (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => setPicking(false)}>
     <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-3.5">
       <p className="flex-1 text-[13.5px] font-medium text-stone-900">Choose pieces</p>
       <span className="text-[12px] text-stone-400">{itemIds.length} chosen</span>
       <button type="button" onClick={() => setItemIds([])} className="text-[12px] text-stone-400 hover:text-stone-700">Clear</button>
       <TechButton onClick={() => setPicking(false)}>Done</TechButton>
      </div>
      <div className="grid grid-cols-3 gap-2.5 overflow-y-auto p-4 sm:grid-cols-4">
       {pieces.length === 0 && <p className="col-span-full py-8 text-center text-[13px] text-stone-400">Nothing live to show yet.</p>}
       {pieces.map((p) => {
        const on = itemIds.includes(p.id);
        return (
         <button key={p.id} type="button"
          onClick={() => setItemIds(on ? itemIds.filter((x) => x !== p.id) : [...itemIds, p.id].slice(0, 8))}
          className={cn("overflow-hidden rounded-xl border text-left transition", on ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-300")}
         >
          <div className="aspect-[4/5] w-full bg-stone-100">
           {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="p-2">
           <p className="line-clamp-1 text-[11.5px] text-stone-700">{p.title}</p>
           <p className="text-[11px] text-stone-400">{p.price}</p>
          </div>
         </button>
        );
       })}
      </div>
      <p className="border-t border-stone-100 px-5 py-3 text-[11.5px] text-stone-400">
       Up to eight. They appear in the order you pick them.
      </p>
     </div>
    </div>
   )}
  </AdminPage>
 );
}

export default function ComposePage() {
 return <Suspense fallback={null}><Compose /></Suspense>;
}
