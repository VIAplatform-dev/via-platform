import { redirect } from "next/navigation";

// Audience moved into Analytics → Traffic (one home for "where visitors come from", conversion
// by channel, new vs returning, and top pages). Keep this path working for old links.
export default function AudienceMoved() {
 redirect("/admin/dashboard?tab=traffic");
}
