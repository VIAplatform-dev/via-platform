// Whether a consignor can actually be paid right now, and what the button should say.
//
// Three amounts are in play and they are NOT interchangeable:
//   balanceCents  — everything she is owed, hold or no hold.
//   payableCents  — the part past the return hold that VYA holds and can send.
//   offPlatform   — owed for eBay/Depop sales. Real debt, but the marketplace paid the STORE, so
//                   VYA has nothing to send; the store settles it and records that it did.
//   inFlightCents — already reserved by a bank debit that hasn't cleared. Not payable twice.
//
// Direct deposit ("stripe") can only ever send `payable`. Cash, cheque and store credit are the
// store paying out of its own pocket and writing it down, so they can settle marketplace sales too.
// Offering one number for both would either hide real debt or promise a transfer that cannot happen
// — the server refuses that case, and this is what stops the phone offering it in the first place.

export type PayoutRow = {
  method: string;
  balanceCents: number;
  payableCents: number;
  offPlatform?: { totalCents: number } | null;
  inFlightCents?: number | null;
};

export type PayoutAction = {
  canPay: boolean;
  /** What the button spends, in cents. Zero whenever canPay is false. */
  amountCents: number;
  /** "Send" moves real money; "Record" writes down a payment made in the room. */
  verb: "Send" | "Record";
  /** Why she can't pay, or what she should know before she does. Null when there's nothing to add. */
  note: string | null;
};

/** Methods where the money moves through VYA rather than being handed over in person. */
const SENDS_MONEY = new Set(["stripe", "ach"]);

export function payoutActionFor(row: PayoutRow, defaultMethod?: string | null): PayoutAction {
  const method = row.method || defaultMethod || "store_credit";
  const sends = SENDS_MONEY.has(method);
  const offPlatform = Math.max(0, row.offPlatform?.totalCents ?? 0);
  const inFlight = Math.max(0, row.inFlightCents ?? 0);
  const payable = Math.max(0, row.payableCents);

  if (inFlight > 0) {
    return { canPay: false, amountCents: 0, verb: sends ? "Send" : "Record", note: "A payment to them is still clearing." };
  }

  // Direct deposit sends only what VYA is holding.
  const amount = sends ? payable : payable + offPlatform;
  if (amount <= 0) {
    // Owed but nothing to pay: say WHICH of the two reasons it is, because they have different fixes.
    const note =
      sends && offPlatform > 0
        ? "What they're owed was sold on a marketplace that paid you directly — record it as cash instead."
        : row.balanceCents > 0
          ? "Still inside the return hold."
          : null;
    return { canPay: false, amountCents: 0, verb: sends ? "Send" : "Record", note };
  }

  return {
    canPay: true,
    amountCents: amount,
    verb: sends ? "Send" : "Record",
    // Worth saying when the button pays less than the figure beside their name.
    note: amount < row.balanceCents ? "The rest is still inside the return hold." : null,
  };
}
