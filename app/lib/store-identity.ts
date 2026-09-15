/**
 * One email per store, connected to everything. Pure.
 *
 * THREE RECORDS CLAIM TO KNOW WHO OWNS A SHOP, and they drifted:
 *   · store_accounts.owner_email: written at signup. The account.
 *   · store_users (role owner), who may sign in and work on it. The access.
 *   · sellers.email: the shop's own address: reply-to on its emails, the contact on
 *                                  its shipping labels, what Mailchimp is told.
 *
 * An audit of 17 stores found 12 not joined up. Two distinct failures, and they are not the same
 * problem:
 *
 *   BLANK. Five shops have no sellers.email at all, so their labels carry no contact address and
 *   their emails fall back to whatever the static map has. Ownership is agreed; the shop simply has
 *   no address of its own. Filling it from the agreed owner is unambiguous.
 *
 *   ORPHANED. A shop has a real owner address in sellers.email, evan@vangie.co, and four more,
 *   and the only ACCESS row belongs to whoever onboarded it. So the shop's actual owner cannot sign
 *   in to her own shop. That is not a data tidy: granting access is a decision, and this module
 *   reports it rather than fixing it.
 */

export type StoreRecords = {
 slug: string;
 accountOwner: string | null; // store_accounts.owner_email
 accessOwner: string | null; // store_users, role owner
 sellerEmail: string | null; // sellers.email
};

export type Finding =
 | { slug: string; kind: "ok" }
 /** Ownership is agreed and sellers.email is missing or different. Safe to set. */
 | { slug: string; kind: "set-seller-email"; to: string; from: string | null }
 /** A real address on the shop that grants no access. Reported, never fixed automatically. */
 | { slug: string; kind: "orphaned-owner"; address: string; hasAccess: string | null }
 /** The two ownership records name different people. Nobody should guess which is right. */
 | { slug: string; kind: "owners-disagree"; account: string; access: string }
 | { slug: string; kind: "no-owner" };

const norm = (v: string | null | undefined): string | null => {
 const s = String(v || "").trim().toLowerCase();
 return s && s.includes("@") ? s : null;
};

/** Addresses that are ours rather than a seller's, and must never become a shop's contact. */
const NOT_A_SELLER = /@vyaplatform\.com$|@getvya\.ai$|^import-test\+/i;

/** What, if anything, is wrong with one store's identity. */
export function review(r: StoreRecords): Finding {
 const account = norm(r.accountOwner);
 const access = norm(r.accessOwner);
 const seller = norm(r.sellerEmail);

 if (account && access && account !== access) return { slug: r.slug, kind: "owners-disagree", account, access };

 const owner = account || access;
 if (!owner) return { slug: r.slug, kind: "no-owner" };

 // A real address on the shop that is nobody's login. The shop's own owner cannot sign in.
 if (seller && seller !== owner && !NOT_A_SELLER.test(seller)) {
  return { slug: r.slug, kind: "orphaned-owner", address: seller, hasAccess: access };
 }

 // Missing, or one of our own test addresses standing in for a seller's.
 if (!seller || (NOT_A_SELLER.test(seller) && !NOT_A_SELLER.test(owner))) {
  return { slug: r.slug, kind: "set-seller-email", to: owner, from: seller };
 }
 return { slug: r.slug, kind: "ok" };
}

/** Every store, reviewed. */
export function reviewAll(rows: StoreRecords[]): Finding[] {
 return (rows || []).map(review);
}
