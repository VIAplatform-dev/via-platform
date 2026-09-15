import { redirect } from "next/navigation";

// Performance was merged into Analytics. Keep the old path working for bookmarks/links.
export default function PerformanceRedirect() {
 redirect("/admin/dashboard");
}
