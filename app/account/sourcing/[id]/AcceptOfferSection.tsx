"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SourcingOffer } from "@/app/lib/sourcing-offers-db";

export default function AcceptOfferSection({
  requestId,
  offers,
  requestStatus,
  matchedStoreSlug,
}: {
  requestId: string;
  offers: SourcingOffer[];
  requestStatus: string;
  matchedStoreSlug: string | null;
}) {
  const router = useRouter();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acceptedOffer = offers.find((o) => o.status === "accepted");

  async function handleAccept(offerId: string) {
    setAccepting(offerId);
    setError(null);
    try {
      const res = await fetch(`/api/sourcing/${requestId}/offers/${offerId}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAccepting(null);
    }
  }

  // If already matched and we have an accepted offer, show confirmation
  if (requestStatus === "matched" && acceptedOffer) {
    return (
      <div className="mt-8">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-3">Accepted Offer</p>
        <div className="border border-green-200 bg-green-50 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-serif text-base text-[#5D0F17]">{acceptedOffer.storeName}</p>
            <span className="text-[9px] uppercase tracking-widest bg-green-100 text-green-800 px-2 py-1">Accepted</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm text-[#5D0F17]/70">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Sourcing Fee</p>
              <p>${acceptedOffer.fee}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Timeline</p>
              <p>{acceptedOffer.timeline}</p>
            </div>
            {(acceptedOffer.expectedPriceMin || acceptedOffer.expectedPriceMax) && (
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Expected Item Price</p>
                <p>
                  {acceptedOffer.expectedPriceMin && acceptedOffer.expectedPriceMax
                    ? `$${acceptedOffer.expectedPriceMin}–$${acceptedOffer.expectedPriceMax}`
                    : acceptedOffer.expectedPriceMin
                    ? `From $${acceptedOffer.expectedPriceMin}`
                    : `Up to $${acceptedOffer.expectedPriceMax}`}
                </p>
              </div>
            )}
          </div>
          {acceptedOffer.notes && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Notes</p>
              <p className="text-sm text-[#5D0F17]/70">{acceptedOffer.notes}</p>
            </div>
          )}
          <p className="text-xs text-[#5D0F17]/50 mt-4 leading-relaxed">
            The store will reach out to you directly via email to arrange next steps.
          </p>
        </div>
      </div>
    );
  }

  // No offers yet
  if (offers.length === 0) {
    return (
      <div className="mt-8 border border-[#5D0F17]/10 p-5 bg-[#D8CABD]/10">
        <p className="text-sm text-[#5D0F17]/60 leading-relaxed">
          Stores in our network are reviewing your request. Offers will appear here when a store responds, and you can choose which one to accept.
        </p>
      </div>
    );
  }

  // Show pending offers
  return (
    <div className="mt-8">
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#5D0F17]/40 mb-4">
        Offers ({offers.length})
      </p>

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      <div className="flex flex-col gap-4">
        {offers.map((offer) => (
          <div
            key={offer.id}
            className={`border p-5 ${
              offer.status === "declined" || offer.status === "rescinded"
                ? "border-[#5D0F17]/10 opacity-50"
                : "border-[#5D0F17]/20"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <p className="font-serif text-base text-[#5D0F17]">{offer.storeName}</p>
              {offer.status === "declined" && (
                <span className="shrink-0 text-[9px] uppercase tracking-widest text-[#5D0F17]/40 px-2 py-1 border border-[#5D0F17]/10">
                  Not selected
                </span>
              )}
              {offer.status === "rescinded" && (
                <span className="shrink-0 text-[9px] uppercase tracking-widest text-[#5D0F17]/40 px-2 py-1 border border-[#5D0F17]/10">
                  Withdrawn by store
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-[#5D0F17]/70 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Sourcing Fee</p>
                <p className="text-[#5D0F17] font-medium">${offer.fee}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Timeline</p>
                <p>{offer.timeline}</p>
              </div>
              {(offer.expectedPriceMin || offer.expectedPriceMax) && (
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Expected Item Price</p>
                  <p>
                    {offer.expectedPriceMin && offer.expectedPriceMax
                      ? `$${offer.expectedPriceMin}–$${offer.expectedPriceMax}`
                      : offer.expectedPriceMin
                      ? `From $${offer.expectedPriceMin}`
                      : `Up to $${offer.expectedPriceMax}`}
                  </p>
                </div>
              )}
            </div>

            {offer.notes && (
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#5D0F17]/40 mb-0.5">Notes</p>
                <p className="text-sm text-[#5D0F17]/70 leading-relaxed">{offer.notes}</p>
              </div>
            )}

            {offer.status === "pending" && requestStatus === "paid" && (
              <button
                onClick={() => handleAccept(offer.id)}
                disabled={accepting === offer.id}
                className="w-full py-2.5 text-xs uppercase tracking-widest transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "#5D0F17", color: "#FFFDF8" }}
              >
                {accepting === offer.id ? "Accepting…" : "Accept This Offer"}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[#5D0F17]/40 mt-4 leading-relaxed">
        The sourcing fee is charged by the store on top of the item price. Your $20 VYA sourcing fee is separate.
        Accepting an offer does not charge you. The store will contact you to arrange payment and delivery.
      </p>
    </div>
  );
}
