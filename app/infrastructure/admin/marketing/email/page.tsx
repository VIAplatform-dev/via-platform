import { redirect } from "next/navigation";

// The email Sender settings now live under Settings (Settings → Email sender). Keep this path
// working for old links by redirecting there.
export default function SenderMoved() {
 redirect("/infrastructure/admin/settings?tab=sender");
}
