import { test } from "node:test";
import assert from "node:assert/strict";
import { appointmentEnquiryBody, rentalEnquiryBody } from "./enquiry-inbox-core.ts";

test("an appointment request reads as the customer asking, not as a system notice", () => {
 // A thread that opens "A new appointment has been created" reads as an automated notice and gets
 // skimmed. It is a person asking for a time.
 assert.equal(
  appointmentEnquiryBody({ kind: "Try-on", day: "2026-09-15", start: "14:00", end: "14:30", pending: true }),
  "I've asked for a try-on on 2026-09-15 at 14:00–14:30.",
 );
 assert.equal(
  appointmentEnquiryBody({ kind: "Collection", day: "2026-09-15", start: "09:00", end: "09:30", pending: false }),
  "I've booked a collection on 2026-09-15 at 09:00–09:30.",
 );
});

test("their note is kept, under the request", () => {
 const b = appointmentEnquiryBody({ kind: "Try-on", day: "2026-09-15", start: "14:00", end: "14:30", pending: true, note: "Looking for something for a wedding." });
 assert.match(b, /^I've asked for a try-on/);
 assert.match(b, /wedding/);
});

test("a rental request names the piece and the dates", () => {
 assert.equal(
  rentalEnquiryBody({ title: "Fendi tote", start: "2026-10-01", end: "2026-10-05" }),
  "I'd like to rent Fendi tote from 2026-10-01 to 2026-10-05.",
 );
});

test("a rental request with no dates still says what it is about", () => {
 assert.equal(rentalEnquiryBody({ title: "Fendi tote" }), "I'd like to rent Fendi tote.");
 assert.equal(rentalEnquiryBody({}), "I'd like to rent a piece.");
});

test("affiliation and message ride along when given", () => {
 const b = rentalEnquiryBody({ title: "Coat", affiliation: "Vogue", message: "For a shoot on the 3rd." });
 assert.match(b, /I'm with Vogue\./);
 assert.match(b, /shoot on the 3rd/);
});
