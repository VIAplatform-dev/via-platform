import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/app/lib/auth";
import { getSourcingRequestById } from "@/app/lib/sourcing-db";
import { getOffersByRequestId } from "@/app/lib/sourcing-offers-db";
import AcceptOfferSection from "./AcceptOfferSection";
import CancelRequestSection from "./CancelRequestSection";
import DeleteDraftSection from "./DeleteDraftSection";
import EditRequestSection from "./EditRequestSection";
import PayNowSection from "./PayNowSection";

const STATUS_LABELS: Record<string, string> = {
 pending_payment: "Payment Processing",
 paid: "Searching",
 matched: "Matched",
 refunded: "Refunded",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
 pending_payment: "Your request has been saved but payment hasn't been completed. Edit your request below, then complete payment to send it to stores.",
 paid: "We've received your request and our network of stores is actively searching for your item. Offers from stores will appear below.",
 matched: "You've accepted a sourcing offer. The store will reach out to you directly via email.",
 refunded: "This request has been refunded.",
};

export default async function SourcingRequestDetailPage({
 params,
}: {
 params: Promise<{ id: string }>;
}) {
 const session = await auth();
 if (!session?.user) redirect("/login");

 const { id } = await params;
 const [req, offers] = await Promise.all([
 getSourcingRequestById(id, session.user.id!),
 getOffersByRequestId(id),
 ]);
 if (!req) notFound();

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-2xl mx-auto px-6 py-12">
 {/* Back */}
 <Link
 href="/account"
 className="text-xs uppercase tracking-widest text-[#5D0F17]/50 hover:text-[#5D0F17] transition mb-10 inline-block"
 >
 ← Back to Account
 </Link>

 <div className="flex items-start justify-between gap-4 mb-8">
 <h1 className="font-serif text-2xl">Sourcing Request</h1>
 <span
 className={`shrink-0 text-[9px] uppercase tracking-widest px-2.5 py-1.5 ${
 req.status === "matched"
 ? "bg-green-100 text-green-800"
 : req.status === "refunded"
 ? "bg-[#D8CABD]/50 text-[#5D0F17]/50"
 : "bg-[#5D0F17]/10 text-[#5D0F17]/70"
 }`}
 >
 {STATUS_LABELS[req.status] ?? req.status}
 </span>
 </div>

 {/* Status explanation */}
 <div className="border border-[#5D0F17]/15 p-5 mb-8 bg-[#D8CABD]/10">
 <p className="text-sm text-[#5D0F17]/70 leading-relaxed">
 {STATUS_DESCRIPTIONS[req.status]}
 </p>
 </div>

 {/* Image */}
 {req.imageUrl && (
 <div className="mb-8">
 <img
 src={req.imageUrl}
 alt=""
 className="max-h-80 object-contain border border-[#5D0F17]/10"
 />
 </div>
 )}

 {/* Details */}
 <div className="border border-[#5D0F17]/15 divide-y divide-[#5D0F17]/10">
 <div className="p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-1">Description</p>
 <p className="text-sm leading-relaxed">{req.description}</p>
 </div>

 <div className="grid grid-cols-2 divide-x divide-[#5D0F17]/10">
 <div className="p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-1">Budget</p>
 <p className="text-sm">${req.priceMin} – ${req.priceMax}</p>
 </div>
 <div className="p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-1">Condition</p>
 <p className="text-sm">{req.condition}</p>
 </div>
 </div>

 <div className="grid grid-cols-2 divide-x divide-[#5D0F17]/10">
 {req.size && (
 <div className="p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-1">Size</p>
 <p className="text-sm">{req.size}</p>
 </div>
 )}
 <div className="p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-1">Needed By</p>
 <p className="text-sm">{req.deadline}</p>
 </div>
 </div>

 <div className="p-5">
 <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-1">Submitted</p>
 <p className="text-sm">
 {new Date(req.createdAt).toLocaleDateString("en-US", {
 month: "long",
 day: "numeric",
 year: "numeric",
 })}
 </p>
 </div>
 </div>

 {/* Edit + Pay: available before payment or while still searching */}
 {(req.status === "paid" || req.status === "pending_payment") && (
 <div className="mt-8">
 <EditRequestSection
 requestId={req.id}
 initial={{
 description: req.description,
 priceMin: req.priceMin,
 priceMax: req.priceMax,
 condition: req.condition,
 size: req.size,
 deadline: req.deadline,
 userPhone: req.userPhone,
 userInstagram: req.userInstagram,
 }}
 />
 </div>
 )}

 {/* Pay now, only for unpaid requests */}
 {req.status === "pending_payment" && (
 <div className="mt-6">
 <PayNowSection requestId={req.id} />
 </div>
 )}

 {/* Delete draft, only for unpaid requests */}
 {req.status === "pending_payment" && (
 <DeleteDraftSection requestId={req.id} />
 )}

 {/* Cancel, only while actively searching and within 21 days */}
 {req.status === "paid" && (
 <CancelRequestSection requestId={req.id} createdAt={req.createdAt} />
 )}

 {/* Offers, only show when request is active or matched */}
 {(req.status === "paid" || req.status === "matched") && (
 <AcceptOfferSection
 requestId={req.id}
 offers={offers}
 requestStatus={req.status}
 matchedStoreSlug={req.matchedStoreSlug}
 />
 )}
 </div>
 </main>
 );
}
