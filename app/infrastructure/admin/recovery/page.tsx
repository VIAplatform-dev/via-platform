import { redirect } from "next/navigation";

// Cart recovery moved under Customers, where it belongs — it's a list of people, not a feature of
// its own. Kept as a redirect because these URLs are in bookmarks and in older emails.
export default function MovedRecovery() {
 redirect("/admin/customers/recovery");
}
