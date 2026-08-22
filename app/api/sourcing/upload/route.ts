import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { put } from "@vercel/blob";

export async function POST(request: NextRequest) {
 const session = await auth();
 if (!session?.user?.id) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const formData = await request.formData();
 const file = formData.get("file") as File | null;

 if (!file) {
 return NextResponse.json({ error: "No file provided" }, { status: 400 });
 }

 // Validate type. SVG is excluded even though it matches "image/*" — it's XML that can carry
 // embedded <script>, and this check is client-asserted MIME with no magic-byte verification, so
 // a renamed file would sail through otherwise. Uploaded to a public blob URL, so an SVG here
 // would be a stored-XSS vector.
 if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
 return NextResponse.json({ error: "Only photo files are allowed (SVG isn’t supported)." }, { status: 400 });
 }

 // Max 10MB
 if (file.size > 10 * 1024 * 1024) {
 return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
 }

 const ext = file.name.split(".").pop() || "jpg";
 const filename = `sourcing/${session.user.id}/${Date.now()}.${ext}`;

 const blob = await put(filename, file, {
 access: "public",
 contentType: file.type,
 });

 return NextResponse.json({ url: blob.url });
 } catch (err) {
 console.error("Image upload error:", err);
 return NextResponse.json({ error: "Upload failed" }, { status: 500 });
 }
}
