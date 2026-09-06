// ───────────────────────────────────────────────────────────────────────────
// What a seller actually did, in her own words.
//
// PostHog answers "how many" across everyone. This answers "what happened to HER" — the question you
// have when one store is trying VYA for the first time and you want to know whether she got stuck on
// step two or listed nine pieces and left happy.
//
// Deliberately small: an append-only line per event, written server-side where the thing actually
// happened, so it can't be blocked, sampled, or lost to an ad blocker the way a client analytics
// call can. It is a record, not a metric.
//
// Pure: naming and grouping live here so the wording is testable and consistent. The writes are in
// seller-activity-db.ts.
// ───────────────────────────────────────────────────────────────────────────

export type ActivityKind =
 | "signed-in" | "store-created" | "store-claimed"
 | "viewed" | "listed" | "published" | "edited" | "deleted"
 | "imported" | "storefront-published"
 | "order" | "email-sent" | "connected" | "setting";

export type Activity = {
 id?: number;
 storeSlug: string | null;
 email: string | null;
 kind: ActivityKind;
 /** What it was — a page path, a piece's title, the name of a setting. */
 detail: string | null;
 at: string;
};

/** Everyday words. A log a person reads shouldn't need a legend. */
const VERB: Record<ActivityKind, string> = {
 "signed-in": "Signed in",
 "store-created": "Created her store",
 "store-claimed": "Opened the store we'd built for her",
 viewed: "Opened",
 listed: "Started a listing",
 published: "Published",
 edited: "Edited",
 deleted: "Deleted",
 imported: "Imported her site",
 "storefront-published": "Published her storefront",
 order: "Got an order",
 "email-sent": "Sent an email",
 connected: "Connected",
 setting: "Changed a setting",
};

/** Navigation is noise next to an action, and should read quieter in the list. */
export function isNavigation(kind: ActivityKind): boolean {
 return kind === "viewed";
}

/** The screen names a seller would use, from the admin path she opened. */
const SCREENS: [RegExp, string][] = [
 [/^\/admin\/?$/, "Home"],
 [/^\/admin\/home/, "Home"],
 [/^\/admin\/onboarding\/build/, "the store builder"],
 [/^\/admin\/onboarding/, "the setup wizard"],
 [/^\/admin\/inventory\/collections/, "Collections"],
 [/^\/admin\/inventory\/drafts/, "Drafts"],
 [/^\/admin\/inventory\/sold/, "Sold"],
 [/^\/admin\/inventory/, "Inventory"],
 [/^\/admin\/add-listing/, "Add listing"],
 [/^\/admin\/bulk-upload/, "Bulk upload"],
 [/^\/admin\/cross-listing/, "Cross-listing"],
 [/^\/admin\/consignment/, "Consignment"],
 [/^\/admin\/rentals/, "Rentals"],
 [/^\/admin\/appointments/, "Appointments"],
 [/^\/admin\/orders/, "Orders"],
 [/^\/admin\/inbox/, "Inbox"],
 [/^\/admin\/customers\/recovery/, "Cart recovery"],
 [/^\/admin\/customers/, "Customers"],
 [/^\/admin\/storefront/, "the storefront editor"],
 [/^\/admin\/import/, "Bring your site"],
 [/^\/admin\/marketing\/campaigns\/compose/, "the email editor"],
 [/^\/admin\/marketing\/campaigns/, "Campaigns"],
 [/^\/admin\/marketing\/design/, "Email design"],
 [/^\/admin\/marketing/, "Marketing"],
 [/^\/admin\/apps\/email/, "Klaviyo & Mailchimp"],
 [/^\/admin\/apps/, "Apps"],
 [/^\/admin\/discounts/, "Discounts"],
 [/^\/admin\/dashboard/, "Analytics"],
 [/^\/admin\/settings\/(\w[\w-]*)/, "Settings"],
 [/^\/admin\/settings/, "Settings"],
];

export function screenName(path: string): string {
 const p = String(path || "").split("?")[0];
 for (const [re, name] of SCREENS) if (re.test(p)) return name;
 return p.replace(/^\/admin\/?/, "") || "Home";
}

/** One line, the way you'd say it aloud. */
export function describeActivity(a: Pick<Activity, "kind" | "detail">): string {
 const verb = VERB[a.kind] ?? a.kind;
 if (a.kind === "viewed") return `Opened ${screenName(a.detail || "")}`;
 return a.detail ? `${verb} — ${a.detail}` : verb;
}

/**
 * Collapse a run of the same screen into one line.
 *
 * A seller who lingers on Inventory generates a view every time the page re-renders, and eleven
 * identical rows push the thing she actually DID off the screen. The count is kept, because "opened
 * Inventory 11 times" is itself worth seeing.
 */
export function collapse(events: Activity[]): (Activity & { times: number })[] {
 const out: (Activity & { times: number })[] = [];
 for (const e of events) {
  const last = out[out.length - 1];
  if (last && last.kind === e.kind && isNavigation(e.kind) && screenName(last.detail || "") === screenName(e.detail || "")) {
   last.times++;
   continue;
  }
  out.push({ ...e, times: 1 });
 }
 return out;
}

/** "3 minutes ago", "yesterday" — a log is read for recency, not for timestamps. */
export function ago(iso: string, now = Date.now()): string {
 const t = Date.parse(iso);
 if (!Number.isFinite(t)) return "";
 const s = Math.max(0, Math.round((now - t) / 1000));
 if (s < 45) return "just now";
 const m = Math.round(s / 60);
 if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
 const h = Math.round(m / 60);
 if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
 const d = Math.round(h / 24);
 if (d === 1) return "yesterday";
 if (d < 30) return `${d} days ago`;
 return new Date(t).toLocaleDateString();
}
