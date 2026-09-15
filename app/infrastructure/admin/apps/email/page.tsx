import { redirect } from "next/navigation";

// Connecting Mailchimp or Klaviyo is paused, so this page does not offer it.
//
// A REDIRECT RATHER THAN A DELETE. The OAuth flow, the token handling and the list sync are all
// still in the tree (app/api/store/marketing/esp, app/lib/esp-*); only the way in is closed. The
// page keeps answering because links to it exist: the sidebar, the command bar, an email a seller
// was sent months ago. Sending her to the apps page, which says coming soon, is a better answer
// than a 404 or a Connect button that starts a flow nobody is finishing.
//
// Switching it back on is deleting this file and restoring the one in git history beside it.

export default function EmailAppPage() {
 redirect("/admin/apps");
}
