import { redirect } from "next/navigation";

// Moved into Apps & integrations, where a store looks for a third-party connection. Kept as a
// redirect because this URL has been used during setup.
export default function MovedEsp() {
 redirect("/admin/apps/email");
}
