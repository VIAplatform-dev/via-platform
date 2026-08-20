"use client";

// First-run coach shown when a seller lands in the editor straight from onboarding — orients them:
// this is the editor, their store is already set up, and here's how to get back to admin / go live.
// Shared by the storefront route wrapper so it shows over whichever editor renders (captured or blocks).
export default function WelcomeCoach({ mode, storeName, onClose }: { mode: "import" | "build"; storeName: string; onClose: () => void }) {
 const points = mode === "import"
  ? [
   { t: "Your site is in — exactly as it was", d: "We brought your site over pixel-for-pixel: your header, footer, and pages, now hosted on VYA." },
   { t: "Edit it right here", d: "Click any text or image to change it, and hover a section to move, duplicate, or delete it." },
   { t: "Checkout & inventory are yours", d: "We wired VYA checkout into your site and imported your products — head to admin to manage them." },
  ]
  : [
   { t: "Your storefront is built", d: "We tailored a starting store to what you sell — it's ready to make your own." },
   { t: "Edit anything, right here", d: "Click any text or section to edit it, drag to rearrange, and restyle anything you like." },
   { t: "Add products from admin", d: "Head back to your admin to add inventory — then Publish when you're ready to go live." },
  ];
 return (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-6" onClick={onClose}>
   <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-24px_rgba(43,36,29,0.6)]" onClick={(e) => e.stopPropagation()}>
    <div className="border-b border-black/[0.06] px-6 pb-5 pt-6">
     <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D0F17]">Welcome to VYA</p>
     <h2 className="mt-1.5 text-[22px] leading-tight text-stone-900" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{storeName} is ready 🎉</h2>
    </div>
    <div className="space-y-4 px-6 py-5">
     {points.map((p, i) => (
      <div key={i} className="flex gap-3">
       <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#5D0F17] text-[12px] font-semibold text-white">{i + 1}</span>
       <div className="min-w-0">
        <p className="text-[14px] font-semibold text-stone-800">{p.t}</p>
        <p className="text-[13px] leading-relaxed text-stone-500">{p.d}</p>
       </div>
      </div>
     ))}
    </div>
    <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] px-6 py-4">
     <a href="/admin" className="text-[13px] font-medium text-stone-500 transition hover:text-stone-800">Go to admin</a>
     <button type="button" onClick={onClose} className="rounded-full bg-[#5D0F17] px-6 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#4a0c12]">Start editing</button>
    </div>
   </div>
  </div>
 );
}
