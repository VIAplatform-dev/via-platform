import { redirect } from "next/navigation";

// Instagram moved under Marketing. Kept as a redirect: this URL is the OAuth return path stores
// have already authorised, and a 404 there would strand a half-finished connection.
export default function MovedInstagram() {
 redirect("/admin/marketing/instagram");
}
