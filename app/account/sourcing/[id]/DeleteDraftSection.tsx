"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteDraftSection({ requestId }: { requestId: string }) {
 const router = useRouter();
 const [confirming, setConfirming] = useState(false);
 const [deleting, setDeleting] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function handleDelete() {
 setDeleting(true);
 setError(null);
 try {
 const res = await fetch(`/api/sourcing/${requestId}/cancel`, { method: "POST" });
 if (res.ok) {
 router.push("/account");
 } else {
 const data = await res.json();
 setError(data.error ?? "Something went wrong. Please try again.");
 setConfirming(false);
 }
 } catch {
 setError("Something went wrong. Please try again.");
 setConfirming(false);
 } finally {
 setDeleting(false);
 }
 }

 return (
 <div className="mt-6 border border-[#5D0F17]/15 p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-3">
 Delete Draft
 </p>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed mb-4">
 This draft hasn&apos;t been submitted yet. You can delete it at any time, no charge.
 </p>

 {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

 {!confirming ? (
 <button
 onClick={() => setConfirming(true)}
 className="text-xs uppercase tracking-widest px-4 py-2.5 border border-[#5D0F17]/30 hover:border-[#5D0F17] transition text-[#5D0F17]/70 hover:text-[#5D0F17]"
 >
 Delete Draft
 </button>
 ) : (
 <div className="flex flex-col sm:flex-row gap-3">
 <button
 onClick={handleDelete}
 disabled={deleting}
 className="flex-1 py-2.5 text-xs uppercase tracking-widest bg-[#5D0F17] text-[#FFFDF8] disabled:opacity-50 transition-opacity"
 >
 {deleting ? "Deleting…" : "Yes, Delete Draft"}
 </button>
 <button
 onClick={() => setConfirming(false)}
 disabled={deleting}
 className="flex-1 py-2.5 text-xs uppercase tracking-widest border border-[#5D0F17]/20 hover:border-[#5D0F17] transition disabled:opacity-50"
 >
 Keep Draft
 </button>
 </div>
 )}
 </div>
 );
}
