"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { visibleStores as stores } from "@/app/lib/stores";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";

const CONDITIONS = ["New", "Like New", "Good", "Fair"] as const;
const DEADLINES = ["ASAP", "1 week", "2 weeks", "1 month", "No deadline"] as const;
const STORAGE_KEY = "via_sourcing_form";

type Step = "form" | "checkout" | "success";

type FormData = {
 imageFile: File | null;
 imagePreview: string | null;
 description: string;
 priceMin: string;
 priceMax: string;
 condition: string;
 size: string;
 deadline: string;
 preferredStoreSlugs: string[];
 phone: string;
 instagram: string;
};

const DEFAULT_FORM: FormData = {
 imageFile: null,
 imagePreview: null,
 description: "",
 priceMin: "",
 priceMax: "",
 condition: "Like New",
 size: "",
 deadline: "1 week",
 preferredStoreSlugs: [],
 phone: "",
 instagram: "",
};

export default function SourcingClient() {
 const { data: session, status } = useSession();
 const router = useRouter();
 const searchParams = useSearchParams();
 const isSuccess = searchParams.get("success") === "true";

 const [step, setStep] = useState<Step>(isSuccess ? "success" : "form");
 const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
 const [uploading, setUploading] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [clientSecret, setClientSecret] = useState<string | null>(null);
 const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
 const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
 const fileInputRef = useRef<HTMLInputElement>(null);
 const storeDropdownRef = useRef<HTMLDivElement>(null);

 // Close store dropdown when clicking outside
 useEffect(() => {
 function handleClick(e: MouseEvent) {
 if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target as Node)) {
 setStoreDropdownOpen(false);
 }
 }
 document.addEventListener("mousedown", handleClick);
 return () => document.removeEventListener("mousedown", handleClick);
 }, []);

 // Restore saved form data after returning from login
 useEffect(() => {
 if (status !== "authenticated") return;
 try {
 const saved = sessionStorage.getItem(STORAGE_KEY);
 if (saved) {
 const parsed = JSON.parse(saved) as Partial<FormData>;
 setFormData((f) => ({
 ...f,
 description: parsed.description ?? f.description,
 priceMin: parsed.priceMin ?? f.priceMin,
 priceMax: parsed.priceMax ?? f.priceMax,
 condition: parsed.condition ?? f.condition,
 size: parsed.size ?? f.size,
 deadline: parsed.deadline ?? f.deadline,
 preferredStoreSlugs: parsed.preferredStoreSlugs ?? f.preferredStoreSlugs,
 phone: parsed.phone ?? f.phone,
 instagram: parsed.instagram ?? f.instagram,
 }));
 sessionStorage.removeItem(STORAGE_KEY);
 }
 } catch {
 // ignore parse errors
 }
 }, [status]);

 function handleImageChange(file: File) {
 const preview = URL.createObjectURL(file);
 setFormData((f) => ({ ...f, imageFile: file, imagePreview: preview }));
 }

 function handleDrop(e: React.DragEvent) {
 e.preventDefault();
 const file = e.dataTransfer.files[0];
 if (file && file.type.startsWith("image/")) handleImageChange(file);
 }

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setError(null);

 if (!formData.description.trim()) {
 setError("Please describe the item you're looking for.");
 return;
 }
 if (!formData.priceMin || !formData.priceMax) {
 setError("Please enter a price range.");
 return;
 }
 if (Number(formData.priceMin) >= Number(formData.priceMax)) {
 setError("Max price must be greater than min price.");
 return;
 }

 // Auth gate: save form to sessionStorage and redirect to login
 if (!session) {
 try {
 sessionStorage.setItem(
 STORAGE_KEY,
 JSON.stringify({
 description: formData.description,
 priceMin: formData.priceMin,
 priceMax: formData.priceMax,
 condition: formData.condition,
 size: formData.size,
 deadline: formData.deadline,
 preferredStoreSlugs: formData.preferredStoreSlugs,
 phone: formData.phone,
 instagram: formData.instagram,
 })
 );
 } catch {
 // ignore
 }
 router.push("/login?callbackUrl=/sourcing");
 return;
 }

 setSubmitting(true);

 try {
 // Upload image if provided
 let imageUrl: string | null = null;
 if (formData.imageFile) {
 setUploading(true);
 const fd = new FormData();
 fd.append("file", formData.imageFile);
 const uploadRes = await fetch("/api/sourcing/upload", { method: "POST", body: fd });
 const uploadData = await uploadRes.json();
 setUploading(false);
 if (!uploadRes.ok) throw new Error(uploadData.error || "Image upload failed");
 imageUrl = uploadData.url;
 }

 // Create checkout session
 const res = await fetch("/api/sourcing/checkout", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 imageUrl,
 description: formData.description.trim(),
 priceMin: Number(formData.priceMin),
 priceMax: Number(formData.priceMax),
 condition: formData.condition,
 size: formData.size.trim() || null,
 deadline: formData.deadline,
 preferredStoreSlugs: formData.preferredStoreSlugs.length > 0
 ? formData.preferredStoreSlugs
 : null,
 phone: formData.phone.trim() || null,
 instagram: formData.instagram.trim() || null,
 }),
 });

 const data = await res.json();
 if (!res.ok || !data.clientSecret) throw new Error(data.error || "Could not start checkout.");

 setStripePromise(loadStripe(
 data.publishableKey?.trim() ||
 "pk_live_51SuO4fH2dVF0WrN0yaIdMeQo3yco2VskEh10ggAbEp5OaTKvfnINJhXTHkUPk6deacXTcmySqx7PzsILoK2BCpwN00WCbtIaPK"
 ));
 setClientSecret(data.clientSecret);
 setStep("checkout");
 } catch (err) {
 setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
 } finally {
 setSubmitting(false);
 setUploading(false);
 }
 }

 const fetchClientSecret = useCallback(async () => {
 return clientSecret ?? "";
 }, [clientSecret]);

 if (step === "success") {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-2xl mx-auto px-6 py-16 text-center">
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-6">Sourcing Request</p>
 <h1 className="font-serif text-3xl mb-4">Request Received</h1>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed mb-2">
 Your $20 sourcing fee has been processed. We&apos;ll be in touch within 21 business days if we find a match.
 </p>
 <p className="text-sm text-[#5D0F17]/60 leading-relaxed mb-10">
 If we can&apos;t find one, your fee will be fully refunded.
 </p>
 <Link
 href="/account/sourcing"
 className="inline-block text-sm uppercase tracking-[0.15em] px-8 py-3 bg-[#5D0F17] text-[#FFFDF8] hover:bg-[#5D0F17]/85 transition"
 >
 View My Requests
 </Link>
 </div>
 </main>
 );
 }

 if (step === "checkout" && clientSecret) {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-2xl mx-auto px-6 py-12">
 <div className="flex items-center gap-4 mb-8">
 <button
 onClick={() => setStep("form")}
 className="text-xs uppercase tracking-widest text-[#5D0F17]/50 hover:text-[#5D0F17] transition"
 >
 ← Back
 </button>
 <h1 className="font-serif text-xl">Pay Sourcing Fee ($20)</h1>
 </div>
 <p className="text-sm text-[#5D0F17]/60 mb-8 leading-relaxed">
 Your $20 fee is refundable if we can&apos;t find a match within 21 business days.
 </p>
 <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
 <EmbeddedCheckout />
 </EmbeddedCheckoutProvider>
 </div>
 </main>
 );
 }

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 <div className="max-w-2xl mx-auto px-6 py-12">
 <h1 className="font-serif text-2xl sm:text-3xl mb-2">Sourcing Request</h1>
 <p className="text-sm text-[#5D0F17]/60 mb-6 leading-relaxed">
 Can&apos;t find what you&apos;re looking for? Tell us what you want and we&apos;ll source it from our network of stores.
 A <strong>$20 sourcing request</strong> applies, fully refunded if we can&apos;t find a match in 21 business days.
 </p>
 <div className="border border-[#5D0F17]/15 bg-[#D8CABD]/15 px-5 py-4 mb-10">
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-1">How it works</p>
 <p className="text-sm text-[#5D0F17]/70 leading-relaxed">
 Stores in our network will review your request and submit offers, each with their own <strong>sourcing fee</strong>,
 timeline, and notes. You choose which offer to accept. The store&apos;s sourcing fee is separate from
 your $20 VYA fee and is only paid when you agree to proceed.
 </p>
 </div>

 <form onSubmit={handleSubmit} className="flex flex-col gap-8">
 {/* Image upload */}
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Photo of Item <span className="normal-case tracking-normal text-[#5D0F17]/30">(optional)</span>
 </label>
 {formData.imagePreview ? (
 <div className="relative w-full aspect-[4/3] bg-[#D8CABD]/30 border border-[#5D0F17]/15 overflow-hidden">
 <img
 src={formData.imagePreview}
 alt="Preview"
 className="w-full h-full object-contain"
 />
 <button
 type="button"
 onClick={() => setFormData((f) => ({ ...f, imageFile: null, imagePreview: null }))}
 className="absolute top-3 right-3 text-xs uppercase tracking-widest bg-[#FFFDF8] border border-[#5D0F17]/20 px-2 py-1 hover:border-[#5D0F17] transition"
 >
 Remove
 </button>
 </div>
 ) : (
 <div
 onDrop={handleDrop}
 onDragOver={(e) => e.preventDefault()}
 onClick={() => fileInputRef.current?.click()}
 className="w-full aspect-[4/3] border-2 border-dashed border-[#5D0F17]/20 flex flex-col items-center justify-center cursor-pointer hover:border-[#5D0F17]/40 transition"
 >
 <p className="text-sm text-[#5D0F17]/40">Drop image here or click to upload</p>
 <p className="text-xs text-[#5D0F17]/25 mt-1">JPG, PNG, WEBP, max 10MB</p>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={(e) => {
 const file = e.target.files?.[0];
 if (file) handleImageChange(file);
 }}
 />
 </div>
 )}
 </div>

 {/* Description */}
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Describe the Item <span className="text-red-500">*</span>
 </label>
 <textarea
 required
 rows={4}
 placeholder="e.g. Vintage Chanel double-flap bag in black caviar leather, gold hardware, late 1990s–early 2000s"
 value={formData.description}
 onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
 className="w-full border border-[#5D0F17]/20 bg-transparent px-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:outline-none focus:border-[#5D0F17] resize-none transition"
 />
 </div>

 {/* Price range */}
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Budget <span className="text-red-500">*</span>
 </label>
 <div className="flex items-center gap-3">
 <div className="relative flex-1">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#5D0F17]/40">$</span>
 <input
 type="number"
 required
 min={0}
 placeholder="Min"
 value={formData.priceMin}
 onChange={(e) => setFormData((f) => ({ ...f, priceMin: e.target.value }))}
 className="w-full border border-[#5D0F17]/20 bg-transparent pl-7 pr-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:outline-none focus:border-[#5D0F17] transition"
 />
 </div>
 <span className="text-[#5D0F17]/40 text-sm">to</span>
 <div className="relative flex-1">
 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#5D0F17]/40">$</span>
 <input
 type="number"
 required
 min={1}
 placeholder="Max"
 value={formData.priceMax}
 onChange={(e) => setFormData((f) => ({ ...f, priceMax: e.target.value }))}
 className="w-full border border-[#5D0F17]/20 bg-transparent pl-7 pr-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:outline-none focus:border-[#5D0F17] transition"
 />
 </div>
 </div>
 </div>

 {/* Condition + Size */}
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Condition <span className="text-red-500">*</span>
 </label>
 <div className="flex flex-col gap-2">
 {CONDITIONS.map((c) => (
 <label key={c} className="flex items-center gap-2.5 cursor-pointer">
 <input
 type="radio"
 name="condition"
 value={c}
 checked={formData.condition === c}
 onChange={() => setFormData((f) => ({ ...f, condition: c }))}
 className="accent-[#5D0F17]"
 />
 <span className="text-sm">{c}</span>
 </label>
 ))}
 </div>
 </div>

 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Size <span className="normal-case tracking-normal text-[#5D0F17]/30">(if applicable)</span>
 </label>
 <input
 type="text"
 placeholder="e.g. M, US 8, 29W"
 value={formData.size}
 onChange={(e) => setFormData((f) => ({ ...f, size: e.target.value }))}
 className="w-full border border-[#5D0F17]/20 bg-transparent px-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:outline-none focus:border-[#5D0F17] transition"
 />
 </div>
 </div>

 {/* Contact info */}
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Phone <span className="normal-case tracking-normal text-[#5D0F17]/30">(optional)</span>
 </label>
 <input
 type="tel"
 placeholder="e.g. +1 212 555 0100"
 value={formData.phone}
 onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
 className="w-full border border-[#5D0F17]/20 bg-transparent px-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:outline-none focus:border-[#5D0F17] transition"
 />
 </div>
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Instagram <span className="normal-case tracking-normal text-[#5D0F17]/30">(optional)</span>
 </label>
 <input
 type="text"
 placeholder="@handle"
 value={formData.instagram}
 onChange={(e) => setFormData((f) => ({ ...f, instagram: e.target.value }))}
 className="w-full border border-[#5D0F17]/20 bg-transparent px-4 py-3 text-sm text-[#5D0F17] placeholder:text-[#5D0F17]/30 focus:outline-none focus:border-[#5D0F17] transition"
 />
 </div>
 </div>
 <p className="text-xs text-[#5D0F17]/40 -mt-4">
 Your contact info is private and only shared with a store after you accept their offer.
 </p>

 {/* Deadline */}
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 When do you need this by? <span className="text-red-500">*</span>
 </label>
 <div className="flex flex-wrap gap-2">
 {DEADLINES.map((d) => (
 <button
 key={d}
 type="button"
 onClick={() => setFormData((f) => ({ ...f, deadline: d }))}
 className={`text-xs uppercase tracking-[0.12em] px-4 py-2 border transition ${
 formData.deadline === d
 ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
 : "border-[#5D0F17]/20 hover:border-[#5D0F17]"
 }`}
 >
 {d}
 </button>
 ))}
 </div>
 </div>

 {/* Preferred stores (optional) */}
 <div>
 <label className="block text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-1">
 Have favorite stores you want to be matched with?{" "}
 <span className="normal-case tracking-normal text-[#5D0F17]/30">(optional)</span>
 </label>
 <p className="text-xs text-[#5D0F17]/40 mb-3">
 Leave blank to be matched with any of our stores, or select specific ones to send your request only to them.
 </p>
 <div className="relative" ref={storeDropdownRef}>
 <button
 type="button"
 onClick={() => setStoreDropdownOpen((o) => !o)}
 className="w-full flex items-center justify-between border border-[#5D0F17]/20 bg-transparent px-4 py-3 text-sm text-left hover:border-[#5D0F17] transition focus:outline-none"
 >
 <span className={formData.preferredStoreSlugs.length === 0 ? "text-[#5D0F17]/30" : "text-[#5D0F17]"}>
 {formData.preferredStoreSlugs.length === 0
 ? "Select stores…"
 : formData.preferredStoreSlugs
 .map((s) => stores.find((st) => st.slug === s)?.name ?? s)
 .join(", ")}
 </span>
 <svg
 className={`w-4 h-4 text-[#5D0F17]/40 flex-shrink-0 ml-2 transition-transform ${storeDropdownOpen ? "rotate-180" : ""}`}
 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
 >
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </button>

 {storeDropdownOpen && (
 <div className="absolute z-20 w-full mt-1 bg-[#FFFDF8] border border-[#5D0F17]/20 shadow-sm max-h-64 overflow-y-auto">
 {stores.map((store) => {
 const selected = formData.preferredStoreSlugs.includes(store.slug);
 return (
 <label
 key={store.slug}
 className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#5D0F17]/5 transition"
 >
 <input
 type="checkbox"
 checked={selected}
 onChange={() =>
 setFormData((f) => ({
 ...f,
 preferredStoreSlugs: selected
 ? f.preferredStoreSlugs.filter((s) => s !== store.slug)
 : [...f.preferredStoreSlugs, store.slug],
 }))
 }
 className="accent-[#5D0F17] w-4 h-4 flex-shrink-0"
 />
 <span className="text-sm text-[#5D0F17]">{store.name}</span>
 </label>
 );
 })}
 </div>
 )}
 </div>
 {formData.preferredStoreSlugs.length > 0 && (
 <button
 type="button"
 onClick={() => setFormData((f) => ({ ...f, preferredStoreSlugs: [] }))}
 className="mt-2 text-xs text-[#5D0F17]/40 underline hover:no-underline"
 >
 Clear selection
 </button>
 )}
 </div>

 {error && (
 <p className="text-sm text-red-600">{error}</p>
 )}

 {/* Submit */}
 <div className="pt-6">
 <p className="text-xs text-[#5D0F17]/40 mb-4 leading-relaxed">
 By submitting you agree to a <strong className="text-[#5D0F17]/60">$20 sourcing fee</strong>, refundable within 21 business days if no match is found.
 {!session && (
 <span className="block mt-1">You&apos;ll be asked to create an account or sign in before proceeding.</span>
 )}
 </p>
 <button
 type="submit"
 disabled={submitting || status === "loading"}
 className="w-full sm:w-auto text-sm uppercase tracking-[0.15em] px-10 py-3.5 bg-[#5D0F17] text-[#FFFDF8] hover:bg-[#5D0F17]/85 transition disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {uploading
 ? "Uploading image…"
 : submitting
 ? "Setting up checkout…"
 : session
 ? "Continue to Payment ($20)"
 : "Continue: Sign In to Submit"}
 </button>
 </div>
 </form>
 </div>
 </main>
 );
}
