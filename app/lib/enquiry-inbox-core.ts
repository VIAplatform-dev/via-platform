// How an enquiry reads when it lands in the inbox.
//
// Pure and separate from enquiry-inbox.ts because that one talks to the database, and the sentence
// a seller actually reads is worth testing without one. (Same split as price-floor-core.ts.)

/** The opening message for an appointment request, in the customer's voice. */
export function appointmentEnquiryBody(a: {
 kind: string; day: string; start: string; end: string; note?: string | null; pending: boolean;
}): string {
 const when = `${a.day} at ${a.start}–${a.end}`;
 const opening = a.pending
  ? `I've asked for a ${a.kind.toLowerCase()} on ${when}.`
  : `I've booked a ${a.kind.toLowerCase()} on ${when}.`;
 return a.note?.trim() ? `${opening}\n\n${a.note.trim()}` : opening;
}

/** The opening message for a rental request, in the renter's voice. */
export function rentalEnquiryBody(r: {
 title?: string | null; start?: string | null; end?: string | null; affiliation?: string | null; message?: string | null;
}): string {
 const piece = r.title?.trim() || "a piece";
 const dates = r.start && r.end ? ` from ${r.start} to ${r.end}` : "";
 const lines = [`I'd like to rent ${piece}${dates}.`];
 if (r.affiliation?.trim()) lines.push(`I'm with ${r.affiliation.trim()}.`);
 if (r.message?.trim()) lines.push("", r.message.trim());
 return lines.join("\n");
}
