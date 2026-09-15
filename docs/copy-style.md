# How VYA talks to sellers

Three things, in this order: **what it is, how it works, how she uses it.**

Never why we built it that way. A seller opens a screen with a job in mind, and every
word between her and doing it is a cost. We do not need to justify ourselves to her.

## The test

Read the sentence and ask: *is this telling her what happens, or explaining ourselves?*

| Explaining ourselves | Saying what it does |
| --- | --- |
| "A heart says come back for this, and on one-of-one vintage the shop cannot always keep that promise." | "Shoppers can save pieces and come back to them." |
| "Recorded on our own servers, so it survives an ad blocker." | "Every screen opened and every piece published, as it happens." |
| "She is told the minimum rather than getting silence." | "Offers below this are declined, and the shopper is told the minimum." |

## Rules

1. **First sentence says what it does.** If it does not, cut it and start again.
2. **Two sentences.** A hint under a field gets two, and usually needs one.
3. **Cut the why.** Design reasoning belongs in a code comment, where it is genuinely
   useful, and nowhere a seller can see it.
4. **Keep the specifics.** "0 lets every offer through" earns its place: it is a fact
   about the control she is looking at. "Built from three data sources" does not.
5. **Say "you", not "the seller".** And never narrate her: no "she is told", no
   "a seller who…".
6. **No throat-clearing.** "If you connected Shopify, your products are already…"
   starts two clauses before the point.

## Where the long version goes

The reasoning is often the most valuable thing we know, and it should be written
down. It goes in the code comment above the thing it explains. That is what the
comments in this repo are for, and why they are as long as they are.
