import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingEmbed, providerLabel } from "./embed-core.ts";

// Showing the real calendar beats sending a shopper to another website. But an arbitrary URL may
// refuse to be framed and leave an empty box, so anything unrecognised must fall back to a link.

test("a Calendly link becomes an inline embed", () => {
 const e = bookingEmbed("https://calendly.com/hana/fitting");
 assert.equal(e?.provider, "calendly");
 assert.match(e!.src, /embed_type=Inline/);
 assert.match(e!.src, /hide_gdpr_banner=1/);
});

test("an existing query string is extended, not clobbered", () => {
 const e = bookingEmbed("https://calendly.com/hana/fitting?month=2026-09");
 assert.match(e!.src, /month=2026-09/);
 assert.match(e!.src, /&embed_type=Inline/);
});

test("a param already present isn't added twice", () => {
 const e = bookingEmbed("https://calendly.com/hana/fitting?embed_type=Inline");
 assert.equal(e!.src.match(/embed_type/g)?.length, 1);
});

test("cal.com works, including a self-hosted subdomain", () => {
 assert.equal(bookingEmbed("https://cal.com/hana/30min")?.provider, "cal.com");
 assert.equal(bookingEmbed("https://book.acme.cal.com/hana")?.provider, "cal.com");
});

test("a Google appointment schedule embeds; a personal calendar doesn't", () => {
 const e = bookingEmbed("https://calendar.google.com/calendar/appointments/schedules/AcZssZ123");
 assert.equal(e?.provider, "google");
 assert.match(e!.src, /gv=true/);
 assert.equal(bookingEmbed("https://calendar.google.com/calendar/u/0/r"), null);
});

test("a Google link copied while signed into several accounts still works", () => {
 // What Google actually hands you: the /u/0/ account segment sits before "appointments".
 const e = bookingEmbed("https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2dzdB05zKza83XXrBeMxGsIg5VmTij");
 assert.equal(e?.provider, "google");
 assert.match(e!.src, /gv=true/);
});

test("Acuity and Squarespace Scheduling both frame", () => {
 assert.equal(bookingEmbed("https://app.acuityscheduling.com/schedule.php?owner=12345")?.provider, "acuity");
 assert.equal(bookingEmbed("https://hana.as.me/fitting")?.provider, "acuity");
});

test("anything we don't recognise falls back to a link, not an empty frame", () => {
 assert.equal(bookingEmbed("https://example.com/book"), null);
 assert.equal(bookingEmbed("calendly.com/hana"), null); // no scheme — not a usable href either
 assert.equal(bookingEmbed(""), null);
 assert.equal(bookingEmbed(null), null);
 assert.equal(bookingEmbed("javascript:alert(1)"), null);
});

test("providers read as their real names", () => {
 assert.equal(providerLabel("cal.com"), "Cal.com");
 assert.equal(providerLabel("google"), "Google Calendar");
});
