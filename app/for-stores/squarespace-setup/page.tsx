"use client";

import Link from "next/link";
import { useState } from "react";

export default function SquarespaceSetupPage() {
 const [storeSlug, setStoreSlug] = useState("");
 const [storeName, setStoreName] = useState("");
 const [copied, setCopied] = useState(false);

 const isFilled = storeSlug.length > 0 && storeName.length > 0;

 const displaySlug = storeSlug || "your-store-slug";
 const displayName = storeName || "Your Store Name";

 // One script goes in Header — handles click tracking AND order conversion
 const headerCode = `<!-- VYA Tracking -->
<script>
(function() {
 // Save via_click_id from URL into a 30-day cookie
 var urlParams = new URLSearchParams(window.location.search);
 var clickId = urlParams.get('via_click_id');
 if (clickId) {
 document.cookie = 'via_click_id=' + clickId + ';max-age=2592000;path=/;SameSite=Lax';
 }

 // Fire conversion when customer lands on order confirmation page
 if (window.location.pathname.indexOf('/commerce/orders/') === -1) return;

 var pathParts = window.location.pathname.split('/');
 var orderId = pathParts[pathParts.length - 1];
 if (!orderId || orderId.length < 10) return;

 // Prevent double-firing
 if (sessionStorage.getItem('via_' + orderId)) return;
 sessionStorage.setItem('via_' + orderId, '1');

 // Read via_click_id from cookie
 var viaClickId = null;
 var cookies = document.cookie.split(';');
 for (var i = 0; i < cookies.length; i++) {
 var c = cookies[i].trim();
 if (c.indexOf('via_click_id=') === 0) { viaClickId = c.substring(13); break; }
 }

 // Find the order total — take the largest dollar amount on the page
 function findTotal() {
 var matches = document.body.innerText.match(/\\$[\\d,]+\\.\\d{2}/g) || [];
 var amounts = matches.map(function(m) { return parseFloat(m.replace(/[\\$,]/g, '')); });
 return amounts.length ? Math.max.apply(null, amounts) : 0;
 }

 // Retry up to 10 times (10 seconds) waiting for the page to render the order total
 function sendWhenReady(attempts) {
 var total = findTotal();
 if (total > 0) {
 fetch('https://vyaplatform.com/api/conversion', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 orderId: orderId,
 orderTotal: total,
 currency: 'USD',
 items: [],
 viaClickId: viaClickId,
 storeSlug: '${displaySlug}',
 storeName: '${displayName}'
 })
 }).catch(function() {});
 } else if (attempts > 0) {
 setTimeout(function() { sendWhenReady(attempts - 1); }, 1000);
 }
 }

 if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', function() { sendWhenReady(10); });
 } else {
 sendWhenReady(10);
 }
})();
</script>`;

 function copyCode() {
 navigator.clipboard.writeText(headerCode);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 }

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Header */}
 <section className="">
 <div className="max-w-3xl mx-auto px-6 py-12 sm:py-20">
 <div className="flex items-center gap-4 mb-4 text-sm">
 <Link
 href="/for-stores"
 className="text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors"
 >
 &larr; Partner with VYA
 </Link>
 </div>
 <h1 className="text-3xl sm:text-5xl font-serif mb-3 sm:mb-4">
 Connect Your Squarespace Store
 </h1>
 <p className="text-[#5D0F17]/60 text-base sm:text-lg">
 Follow these steps to connect your Squarespace store to VYA.
 No coding knowledge needed. Just copy, paste, and save.
 </p>
 </div>
 </section>

 {/* Time Estimate */}
 <section className="bg-[#5D0F17]/5">
 <div className="max-w-3xl mx-auto px-6 py-4">
 <p className="text-sm text-[#5D0F17]/60">
 This takes about <strong className="text-[#5D0F17]">5 minutes</strong>. You&apos;ll just be copying and pasting
 one block of text into your Squarespace settings.
 </p>
 </div>
 </section>

 {/* Content */}
 <section className="py-12 sm:py-16">
 <div className="max-w-3xl mx-auto px-6">

 {/* Before you start */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-4">Before You Start</h2>
 <p className="text-[#5D0F17]/60 mb-4">
 You&apos;ll need access to your Squarespace website settings.
 Make sure you&apos;re logged in as an admin on your Squarespace site.
 </p>
 <div className="bg-[#5D0F17]/5 border border-[#5D0F17]/10 p-5">
 <p className="text-sm text-[#5D0F17]/60">
 <strong className="text-[#5D0F17]">Note:</strong> This requires a Squarespace Business plan or higher.
 If you&apos;re on a Personal plan, you&apos;ll need to upgrade first.
 </p>
 </div>
 </div>

 {/* Step 1: Enter store info */}
 <div className="mb-12 sm:mb-16">
 <div className="flex items-center gap-4 mb-6">
 <span className="w-10 h-10 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-lg font-medium flex-shrink-0">
 1
 </span>
 <h2 className="text-xl sm:text-2xl font-serif">Enter Your Store Name</h2>
 </div>
 <p className="text-[#5D0F17]/60 mb-6">
 Type in your store details below. The code in Step 2 will update automatically with your info.
 </p>

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium mb-2">
 Store Name <span className="text-[#5D0F17]/40 font-normal">(how it appears on VYA)</span>
 </label>
 <input
 type="text"
 value={storeName}
 onChange={(e) => setStoreName(e.target.value)}
 placeholder="e.g. My Vintage Store"
 className="w-full px-4 py-3 border border-[#5D0F17]/20 focus:border-[#5D0F17] focus:outline-none text-base"
 />
 </div>
 <div>
 <label className="block text-sm font-medium mb-2">
 Store ID <span className="text-[#5D0F17]/40 font-normal">(lowercase, use dashes instead of spaces)</span>
 </label>
 <input
 type="text"
 value={storeSlug}
 onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
 placeholder="e.g. my-vintage-store"
 className="w-full px-4 py-3 border border-[#5D0F17]/20 focus:border-[#5D0F17] focus:outline-none text-base"
 />
 </div>
 </div>

 {isFilled && (
 <div className="mt-4 bg-green-50 border border-green-200 p-4">
 <p className="text-sm text-green-800">
 Your store info has been filled in. The code below now includes{" "}
 <strong>&quot;{storeName}&quot;</strong> and <strong>&quot;{storeSlug}&quot;</strong>.
 </p>
 </div>
 )}
 </div>

 {/* Step 2: Copy the code */}
 <div className="mb-12 sm:mb-16">
 <div className="flex items-center gap-4 mb-6">
 <span className="w-10 h-10 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-lg font-medium flex-shrink-0">
 2
 </span>
 <h2 className="text-xl sm:text-2xl font-serif">Copy &amp; Paste the Code</h2>
 </div>

 <div className="space-y-6">
 {!isFilled && (
 <div className="bg-amber-50 border border-amber-200 p-4">
 <p className="text-sm text-amber-800">
 Fill in your store name and store ID in Step 1 first, the code will
 automatically include your store info.
 </p>
 </div>
 )}

 <div className="bg-[#5D0F17]/5 border border-[#5D0F17]/10 p-5 space-y-4">
 <p className="text-sm font-medium">Here&apos;s what to do:</p>
 <ol className="space-y-3 text-sm text-[#5D0F17]/60">
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">a.</span>
 <span>In your Squarespace admin, go to <strong className="text-[#5D0F17]">Settings</strong> &rarr; <strong className="text-[#5D0F17]">Advanced</strong> &rarr; <strong className="text-[#5D0F17]">Code Injection</strong></span>
 </li>
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">b.</span>
 <span>Find the box labeled <strong className="text-[#5D0F17]">Header</strong></span>
 </li>
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">c.</span>
 <span>Click <strong className="text-[#5D0F17]">Copy</strong> below and paste it into that box</span>
 </li>
 </ol>
 </div>

 <div className="relative">
 <pre className="bg-neutral-900 text-neutral-100 p-4 text-xs overflow-x-auto rounded">
 <code>{headerCode}</code>
 </pre>
 <button
 onClick={copyCode}
 className={`absolute top-3 right-3 px-4 py-2 text-sm font-medium transition rounded ${
 copied
 ? "bg-green-500 text-white"
 : "bg-[#FFFDF8] text-[#5D0F17] hover:bg-[#5D0F17]/10"
 }`}
 >
 {copied ? "Copied!" : "Copy"}
 </button>
 </div>

 <p className="text-[#5D0F17]/40 text-xs">
 If you previously installed two VYA code blocks, replace your existing Header code with this one and delete the Order Confirmation code. This single block handles everything.
 </p>
 </div>
 </div>

 {/* Step 3: Save */}
 <div className="mb-12 sm:mb-16">
 <div className="flex items-center gap-4 mb-6">
 <span className="w-10 h-10 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-lg font-medium flex-shrink-0">
 3
 </span>
 <h2 className="text-xl sm:text-2xl font-serif">Hit Save</h2>
 </div>
 <p className="text-[#5D0F17]/60">
 Click the <strong>Save</strong> button at the top of the Squarespace Code Injection page.
 That&apos;s it, you&apos;re all set!
 </p>
 <div className="bg-green-50 border border-green-200 p-4 mt-4">
 <p className="text-sm text-green-800">
 Once saved, VYA will automatically know when a customer we send to your store makes a purchase.
 You don&apos;t need to do anything else.
 </p>
 </div>
 </div>

 {/* Divider */}
 <hr className="border-[#5D0F17]/10 my-12 sm:my-16" />

 {/* FAQ */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-6">Questions</h2>
 <div className="space-y-6">
 <div>
 <h3 className="font-medium mb-2">Will this affect my website speed or checkout?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 No. It&apos;s a tiny piece of code that runs in the background. Your customers won&apos;t notice anything different.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Does this track all my customers?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 No, only customers who came from VYA. If someone finds your store on their own,
 nothing happens. We never collect customer names, emails, or personal info.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">What if a customer browses other products after clicking from VYA?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 If a customer clicks through from VYA and ends up buying a different item on your store,
 VYA still gets credit. The tracking lasts for 30 days from their first click.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Can I remove this later?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 Yes. Just go back to Code Injection and delete the code from the Header box. No changes
 to your site will remain.
 </p>
 </div>
 </div>
 </div>

 {/* Support */}
 <div className="pt-8">
 <p className="text-[#5D0F17]/60 text-sm">
 Stuck or have questions? Email us at{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="text-[#5D0F17] underline">
 partnerships@vyaplatform.com
 </a>
 {" "}and we&apos;ll walk you through it.
 </p>
 </div>
 </div>
 </section>
 </main>
 );
}
