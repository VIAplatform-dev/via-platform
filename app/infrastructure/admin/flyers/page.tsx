import { AdminPage, AdminHeader, TechCard, TH, TD } from "../ui";
import { getFlyerReport } from "@/app/lib/flyer-stats";

// How each printed flyer is doing.
//
// A server component: this is a small aggregate read behind the admin gate, so there is nothing to
// gain from shipping a client fetch and a loading state for it.
//
// The number that matters is not scans and not signups but the gap between them. A flyer with 300
// scans and 4 signups is a poster people notice and a page that fails them; one with 20 scans and
// 12 signups is the opposite problem — the offer works, nobody is seeing it. Both are actionable,
// and neither column tells you on its own, which is why they sit next to each other.

export const dynamic = "force-dynamic";

export default async function FlyersPage() {
 const rows = await getFlyerReport().catch(() => []);
 const totalScans = rows.reduce((n, r) => n + r.scans, 0);
 const totalSignups = rows.reduce((n, r) => n + r.signups, 0);

 return (
  <AdminPage>
   <AdminHeader eyebrow="Campaigns" title="Flyers" subtitle="Scans and signups per printed QR code" />

   <div className="grid grid-cols-3 gap-3">
    <TechCard className="p-4">
     <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Scans</p>
     <p className="mt-1 text-2xl font-medium">{totalScans}</p>
    </TechCard>
    <TechCard className="p-4">
     <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Signups</p>
     <p className="mt-1 text-2xl font-medium">{totalSignups}</p>
    </TechCard>
    <TechCard className="p-4">
     <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500">Converted</p>
     <p className="mt-1 text-2xl font-medium">
      {totalScans === 0 ? "—" : `${Math.min(100, Math.round((totalSignups / totalScans) * 100))}%`}
     </p>
    </TechCard>
   </div>

   <TechCard className="mt-4 overflow-x-auto p-0">
    <table className="w-full text-sm">
     <thead>
      <tr>
       <TH>Flyer</TH>
       <TH>Address</TH>
       <TH>Scans</TH>
       <TH>Signups</TH>
       <TH>Converted</TH>
       <TH>Last scan</TH>
      </tr>
     </thead>
     <tbody>
      {rows.map((r) => (
       <tr key={r.slug}>
        <TD>
         <span className="block max-w-[22rem] truncate">{r.headline}</span>
        </TD>
        <TD><code className="text-[12px] text-stone-500">/{r.slug}</code></TD>
        <TD>{r.scans}</TD>
        <TD>{r.signups}</TD>
        {/* A flyer nobody has scanned shows a dash, not 0% — it has not failed, it has not run. */}
        <TD>{r.conversion === null ? "—" : `${r.conversion}%`}</TD>
        <TD>{r.lastScan ? new Date(r.lastScan).toLocaleDateString() : "never"}</TD>
       </tr>
      ))}
     </tbody>
    </table>
   </TechCard>

   <p className="mt-4 text-[12px] leading-relaxed text-stone-500">
    A scan is counted once per arrival, before anyone signs in — the refresh straight after signup
    carries the access cookie and is not counted again. Bot user agents are excluded, so these are
    people. Signups are lifetime; scans are all-time.
   </p>
  </AdminPage>
 );
}
