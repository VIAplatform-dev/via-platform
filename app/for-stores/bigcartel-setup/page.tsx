"use client";

import Link from "next/link";
import { useState } from "react";

export default function BigCartelSetupPage() {
 const [storeSlug, setStoreSlug] = useState("");
 const [storeName, setStoreName] = useState("");
 const [copied, setCopied] = useState(false);

 const isFilled = storeSlug.length > 0 && storeName.length > 0;
 const displaySlug = storeSlug || "your-store-id";
 const displayName = storeName || "Your Store Name";

 // Combined snippet — click tracking on all pages + conversion on /success
 const trackingCode = `<!-- VYA Tracking -->
<script>
(function() {
 // Capture VYA click ID into a 30-day cookie on any page visit
 var p = new URLSearchParams(window.location.search);
 var c = p.get('via_click_id');
 if (c) document.cookie = 'via_click_id=' + c + ';max-age=2592000;path=/;SameSite=Lax';

 // Only continue on the order success page
 if (!window.location.pathname.match(/\\/success/)) return;

 try {
 var orderId = p.get('o') || ('bc_' + Date.now());
 if (sessionStorage.getItem('via_conv_' + orderId)) return;
 sessionStorage.setItem('via_conv_' + orderId, '1');

 var viaClickId = null;
 document.cookie.split(';').forEach(function(s) {
 s = s.trim();
 if (s.indexOf('via_click_id=') === 0) viaClickId = s.slice(13);
 });

 var amounts = document.body.innerText.match(/\\$[\\d,]+\\.\\d{2}/g) || [];
 var total = amounts.length ? Math.max.apply(null, amounts.map(function(m) {
 return parseFloat(m.replace(/[\\$,]/g, ''));
 })) : 0;

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
 } catch(e) {}
})();
</script>`;

 function copyCode() {
 navigator.clipboard.writeText(trackingCode);
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
 Connect Your Big Cartel Store
 </h1>
 <p className="text-[#5D0F17]/60 text-base sm:text-lg">
 Follow these steps to connect your Big Cartel store to VYA.
 No coding knowledge needed. Just copy, paste, and save.
 </p>
 </div>
 </section>

 {/* Time estimate */}
 <section className="bg-[#5D0F17]/5">
 <div className="max-w-3xl mx-auto px-6 py-4">
 <p className="text-sm text-[#5D0F17]/60">
 This takes about <strong className="text-[#5D0F17]">2 minutes</strong>. You&apos;ll
 paste one small code snippet into your Big Cartel theme settings.
 </p>
 </div>
 </section>

 <section className="py-12 sm:py-16">
 <div className="max-w-3xl mx-auto px-6">

 {/* Step 1: Store info */}
 <div className="mb-12 sm:mb-16">
 <div className="flex items-center gap-4 mb-6">
 <span className="w-10 h-10 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-lg font-medium flex-shrink-0">
 1
 </span>
 <h2 className="text-xl sm:text-2xl font-serif">Enter Your Store Info</h2>
 </div>
 <p className="text-[#5D0F17]/60 mb-6">
 The code snippet below will automatically update with your store details.
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
 placeholder="e.g. Kiki D Design and Consign"
 className="w-full px-4 py-3 border border-[#5D0F17]/20 focus:border-[#5D0F17] focus:outline-none text-base"
 />
 </div>
 <div>
 <label className="block text-sm font-medium mb-2">
 Store ID <span className="text-[#5D0F17]/40 font-normal">(lowercase, dashes instead of spaces; this will be your VYA URL)</span>
 </label>
 <input
 type="text"
 value={storeSlug}
 onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
 placeholder="e.g. kiki-d-design-and-consign"
 className="w-full px-4 py-3 border border-[#5D0F17]/20 focus:border-[#5D0F17] focus:outline-none text-base"
 />
 </div>
 </div>
 {isFilled && (
 <div className="mt-4 bg-green-50 border border-green-200 p-4">
 <p className="text-sm text-green-800">
 Snippets below now include <strong>&quot;{storeName}&quot;</strong> and <strong>&quot;{storeSlug}&quot;</strong>.
 </p>
 </div>
 )}
 </div>

 {/* Step 2: Add tracking code */}
 <div className="mb-12 sm:mb-16">
 <div className="flex items-center gap-4 mb-6">
 <span className="w-10 h-10 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-lg font-medium flex-shrink-0">
 2
 </span>
 <h2 className="text-xl sm:text-2xl font-serif">Add the VYA Tracking Code</h2>
 </div>

 {!isFilled && (
 <div className="bg-amber-50 border border-amber-200 p-4 mb-6">
 <p className="text-sm text-amber-800">
 Fill in your store info in Step 1 first, the code will include your store details automatically.
 </p>
 </div>
 )}

 <div className="bg-[#5D0F17]/5 border border-[#5D0F17]/10 p-5 space-y-3 mb-6">
 <p className="text-sm font-medium">Where to paste this:</p>
 <ol className="space-y-2 text-sm text-[#5D0F17]/60">
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">a.</span>
 <span>In your Big Cartel dashboard, click <strong className="text-[#5D0F17]">Shop Settings</strong> (the gear icon in the left sidebar)</span>
 </li>
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">b.</span>
 <span>Click <strong className="text-[#5D0F17]">Shop Designer</strong>, then select the <strong className="text-[#5D0F17]">Code</strong> tab at the top</span>
 </li>
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">c.</span>
 <span>Under <strong className="text-[#5D0F17]">Integration Code</strong>, click the <strong className="text-[#5D0F17]">Body</strong> button</span>
 </li>
 <li className="flex gap-3">
 <span className="font-medium text-[#5D0F17] flex-shrink-0">d.</span>
 <span>Paste the code below into the text box, click <strong className="text-[#5D0F17]">Done</strong>, then click <strong className="text-[#5D0F17]">Publish</strong></span>
 </li>
 </ol>
 </div>

 <div className="relative">
 <pre className="bg-neutral-900 text-neutral-100 p-4 text-xs overflow-x-auto rounded">
 <code>{trackingCode}</code>
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
 </div>

 {/* Done */}
 <div className="mb-12 sm:mb-16">
 <div className="flex items-center gap-4 mb-6">
 <span className="w-10 h-10 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-lg font-medium flex-shrink-0">
 3
 </span>
 <h2 className="text-xl sm:text-2xl font-serif">You&apos;re All Set!</h2>
 </div>
 <div className="bg-green-50 border border-green-200 p-4">
 <p className="text-sm text-green-800">
 Once the snippet is saved and published, VYA will automatically know when a customer
 we send to your store places an order. No other steps needed.
 </p>
 </div>
 </div>

 <hr className="border-[#5D0F17]/10 my-12 sm:my-16" />

 {/* FAQ */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-6">Questions</h2>
 <div className="space-y-6">
 <div>
 <h3 className="font-medium mb-2">I can&apos;t find Shop Designer or the Code tab, what plan do I need?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 The Integration Code section is available on Big Cartel&apos;s paid plans (Platinum and Diamond).
 If you&apos;re on the free plan or don&apos;t see the Code tab, email us and we&apos;ll help you out.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Will this affect my website or checkout?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 No. The snippet is tiny and runs silently in the background. Your customers won&apos;t notice anything.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Does this track all my customers?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 No, only customers who came from VYA. We never collect customer names, emails, or personal info.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">What if a customer buys something different from what they clicked?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 VYA still gets credit. The tracking lasts 30 days from the first click, so any purchase during that window counts.
 </p>
 </div>
 </div>
 </div>

 <div className="pt-8">
 <p className="text-[#5D0F17]/60 text-sm">
 Stuck or have questions? Email us at{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="text-[#5D0F17] underline">
 partnerships@vyaplatform.com
 </a>{" "}
 and we&apos;ll walk you through it.
 </p>
 </div>
 </div>
 </section>
 </main>
 );
}
