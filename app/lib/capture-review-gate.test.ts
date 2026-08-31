import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewGate, reviewGateNoticeHtml } from "./capture-review-gate.ts";

const screens = ["/", "/collections/all", "/pages/about-us"];

test("no health check has ever run: there is nothing to review, so editing is not blocked", () => {
 const g = reviewGate(null);
 assert.equal(g.passed, true);
 assert.equal(g.passed === true && g.reason, "nothing-to-review");
});

test("a check with findings but no side-by-sides is also nothing to review", () => {
 const g = reviewGate({ screens: [], answered: [] });
 assert.equal(g.passed, true);
 assert.equal(g.passed === true && g.reason, "nothing-to-review");
});

test("side-by-sides she has not looked at yet block editing, and name what is left", () => {
 const g = reviewGate({ screens, answered: [] });
 assert.equal(g.passed, false);
 assert.deepEqual(g.passed === false && g.remaining, screens);
 assert.equal(g.passed === false && g.reviewed, 0);
 assert.equal(g.passed === false && g.total, 3);
});

test("answering some but not all is still not reviewed", () => {
 const g = reviewGate({ screens, answered: ["/"] });
 assert.equal(g.passed, false);
 assert.deepEqual(g.passed === false && g.remaining, ["/collections/all", "/pages/about-us"]);
 assert.equal(g.passed === false && g.reviewed, 1);
});

test("every page answered: reviewed, editing opens", () => {
 const g = reviewGate({ screens, answered: [...screens] });
 assert.equal(g.passed, true);
 assert.equal(g.passed === true && g.reason, "reviewed");
});

test("'skip' counts as an answer — she saw the page and chose not to judge it", () => {
 // A gate that refused `skip` would push sellers into clicking "Looks right" on pages they have
 // not really formed a view on, just to unlock the editor. That corrupts the very signal the
 // review exists to collect.
 const g = reviewGate({ screens: ["/"], answered: ["/"] });
 assert.equal(g.passed, true);
});

test("'something’s off' does not block editing — it is the strongest reason to let her in", () => {
 const g = reviewGate({ screens: ["/"], answered: ["/"] });
 assert.equal(g.passed, true);
});

test("answers for pages that are no longer in the check don't count toward it", () => {
 const g = reviewGate({ screens, answered: ["/pages/gone", "/", "/collections/all", "/pages/about-us"] });
 assert.equal(g.passed, true);
});

test("duplicate answers for one page do not stand in for another", () => {
 const g = reviewGate({ screens, answered: ["/", "/", "/"] });
 assert.equal(g.passed, false);
 assert.equal(g.passed === false && g.reviewed, 1);
});

test("a trailing slash is the same page — she should not be asked to review it twice", () => {
 const g = reviewGate({ screens: ["/pages/about-us/"], answered: ["/pages/about-us"] });
 assert.equal(g.passed, true);
});

test("the owner's notice names the step and how much of it is left", () => {
 const g = reviewGate({ screens, answered: ["/"] });
 assert.equal(g.passed, false);
 const html = g.passed === false ? reviewGateNoticeHtml(g) : "";
 assert.match(html, /2 pages to go/);
 assert.match(html, /side-by-side/);
 assert.match(html, /href="\/store\/dashboard"/);
 // A step, not a fault.
 assert.doesNotMatch(html, /error|blocked|denied|not allowed/i);
});

test("one page left reads as one page, not '1 pages'", () => {
 const g = reviewGate({ screens: ["/", "/x"], answered: ["/"] });
 assert.match(g.passed === false ? reviewGateNoticeHtml(g) : "", /1 page to go/);
});
