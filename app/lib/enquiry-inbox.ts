import { createConversation } from "./messaging-db";

// An enquiry that arrives any other way still belongs in the inbox.
//
// A rental application and an appointment request are both somebody asking the store a question.
// They each sent an email and wrote a row in their own table — and then stopped, so the seller had
// to know to go and look at two more screens. The inbox is where she looks for "who wants something
// from me", and a request that never reaches it is one she answers late or not at all.
//
// BEST-EFFORT, ALWAYS. The booking is the thing that matters; a messaging table that is slow or
// down must never be the reason an appointment fails to be made. Every caller swallows the failure.

export type Enquiry = {
  storeSlug: string;
  name?: string | null;
  email?: string | null;
  /** What it is about, shown where an item title normally sits: "Rental · Fendi tote". */
  subject: string;
  /** The message as the seller should read it — written in the ASKER's voice, because that is who
   *  the thread is from and a thread that opens in our voice reads as an automated notice. */
  body: string;
};

export async function openEnquiryThread(e: Enquiry): Promise<void> {
  const body = e.body.trim();
  if (!e.storeSlug || !body) return;
  await createConversation(e.storeSlug, {
    name: e.name ?? null,
    email: e.email ?? null,
    itemTitle: e.subject,
    message: body,
  });
}

export { appointmentEnquiryBody, rentalEnquiryBody } from "./enquiry-inbox-core";
