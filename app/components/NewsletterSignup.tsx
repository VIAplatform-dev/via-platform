"use client";

import { useState, useRef } from "react";
import { acquisitionSource } from "@/app/lib/capturedSource";

type NewsletterSignupProps = {
 variant?: "default" | "hero" | "footer";
 title?: string;
 description?: string;
};

export default function NewsletterSignup({
 variant = "default",
 title = "Stay in the loop",
 description = "Get notified about new stores, rare finds, and exclusive drops.",
}: NewsletterSignupProps) {
 const [email, setEmail] = useState("");
 const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
 const [message, setMessage] = useState("");
 const formRef = useRef<HTMLFormElement>(null);
 const isSubmittingRef = useRef(false);

 const submitForm = async () => {
 // Prevent double submission from touch + click events
 if (isSubmittingRef.current || status === "loading") return;
 isSubmittingRef.current = true;

 // Reset the flag after a short delay to allow future submissions
 setTimeout(() => {
 isSubmittingRef.current = false;
 }, 500);

 if (!email.trim()) {
 setStatus("error");
 setMessage("Please enter your email.");
 return;
 }

 // Basic email validation
 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 if (!emailRegex.test(email)) {
 setStatus("error");
 setMessage("Please enter a valid email address.");
 return;
 }

 setStatus("loading");

 try {
 const response = await fetch("/api/newsletter", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ email: email.trim().toLowerCase(), source: acquisitionSource("newsletter") }),
 });

 const data = await response.json();

 if (response.ok) {
 setStatus("success");
 setMessage(data.message || "You're on the list!");
 setEmail("");
 } else {
 setStatus("error");
 setMessage(data.error || "Something went wrong. Please try again.");
 }
 } catch {
 setStatus("error");
 setMessage("Something went wrong. Please try again.");
 }
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 await submitForm();
 };

 // Handle button click/touch directly for better mobile support
 const handleButtonInteraction = async (e: React.MouseEvent | React.TouchEvent) => {
 e.preventDefault();
 e.stopPropagation();
 await submitForm();
 };

 // Hero variant - larger, more prominent
 if (variant === "hero") {
 return (
 <div className="w-full">
 {status === "success" ? (
 <div className="text-center py-4">
 <p className="text-lg text-green-600 font-medium">{message}</p>
 </div>
 ) : (
 <form ref={formRef} onSubmit={handleSubmit} className="w-full">
 <div className="flex flex-col sm:flex-row gap-3">
 <input
 type="email"
 inputMode="email"
 autoComplete="email"
 autoCapitalize="off"
 autoCorrect="off"
 value={email}
 onChange={(e) => {
 setEmail(e.target.value);
 if (status === "error") setStatus("idle");
 }}
 placeholder="Enter your email"
 className="flex-1 px-4 py-3.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 focus:outline-none focus:border-[#5D0F17] transition min-h-[48px] touch-manipulation"
 disabled={status === "loading"}
 />
 <button
 type="submit"
 disabled={status === "loading"}
 onClick={handleButtonInteraction}
 onTouchEnd={handleButtonInteraction}
 className="px-8 py-3.5 bg-[#5D0F17] text-[#FFFDF8] text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition disabled:opacity-50 min-h-[48px] cursor-pointer touch-manipulation"
 >
 {status === "loading" ? "Joining..." : "Get Updates"}
 </button>
 </div>
 {status === "error" && (
 <p className="mt-2 text-red-400 text-sm">{message}</p>
 )}
 </form>
 )}
 </div>
 );
 }

 // Footer variant - compact, inline
 if (variant === "footer") {
 return (
 <div className="w-full">
 <h4 className="text-sm uppercase tracking-wide mb-4">{title}</h4>
 {status === "success" ? (
 <p className="text-sm text-[#5D0F17]/40">{message}</p>
 ) : (
 <form ref={formRef} onSubmit={handleSubmit}>
 <div className="flex flex-col sm:flex-row gap-2">
 <input
 type="email"
 inputMode="email"
 autoComplete="email"
 autoCapitalize="off"
 autoCorrect="off"
 value={email}
 onChange={(e) => {
 setEmail(e.target.value);
 if (status === "error") setStatus("idle");
 }}
 placeholder="Your email"
 className="flex-1 px-4 py-2.5 bg-transparent border border-[#5D0F17]/20 text-[#5D0F17] placeholder:text-[#5D0F17]/40 text-sm focus:outline-none focus:border-[#5D0F17] transition min-h-[44px] touch-manipulation"
 disabled={status === "loading"}
 />
 <button
 type="submit"
 disabled={status === "loading"}
 onClick={handleButtonInteraction}
 onTouchEnd={handleButtonInteraction}
 className="px-5 py-2.5 border border-[#5D0F17] text-[#5D0F17] text-xs uppercase tracking-wide hover:bg-[#5D0F17] hover:text-[#FFFDF8] transition disabled:opacity-50 min-h-[44px] cursor-pointer touch-manipulation"
 >
 {status === "loading" ? "..." : "Join"}
 </button>
 </div>
 {status === "error" && (
 <p className="mt-2 text-red-400 text-xs">{message}</p>
 )}
 </form>
 )}
 </div>
 );
 }

 // Default variant - centered section
 return (
 <div className="max-w-md mx-auto text-center">
 <h3 className="text-2xl sm:text-3xl font-serif mb-3">{title}</h3>
 <p className="text-[#5D0F17]/60 text-sm sm:text-base mb-6">{description}</p>

 {status === "success" ? (
 <div className="py-4 px-6 bg-green-50 border border-green-200">
 <p className="text-green-800">{message}</p>
 </div>
 ) : (
 <form ref={formRef} onSubmit={handleSubmit}>
 <div className="flex flex-col sm:flex-row gap-3">
 <input
 type="email"
 inputMode="email"
 autoComplete="email"
 autoCapitalize="off"
 autoCorrect="off"
 value={email}
 onChange={(e) => {
 setEmail(e.target.value);
 if (status === "error") setStatus("idle");
 }}
 placeholder="Enter your email"
 className="flex-1 px-4 py-3 border border-[#5D0F17]/20 focus:border-[#5D0F17] focus:outline-none bg-transparent transition min-h-[48px] touch-manipulation"
 disabled={status === "loading"}
 />
 <button
 type="submit"
 disabled={status === "loading"}
 onClick={handleButtonInteraction}
 onTouchEnd={handleButtonInteraction}
 className="px-6 py-3 bg-[#5D0F17] text-[#FFFDF8] text-sm uppercase tracking-wide hover:bg-[#5D0F17]/85 transition disabled:opacity-50 min-h-[48px] cursor-pointer touch-manipulation"
 >
 {status === "loading" ? "Joining..." : "Join Waitlist"}
 </button>
 </div>
 {status === "error" && (
 <p className="mt-2 text-red-600 text-sm text-left">{message}</p>
 )}
 </form>
 )}
 </div>
 );
}
