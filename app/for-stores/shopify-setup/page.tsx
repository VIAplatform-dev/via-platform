import Link from "next/link";
import WebhookUrlInput from "./WebhookUrlInput";

export default function ShopifySetupPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Header */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-12 sm:py-20">
 <div className="flex items-center gap-4 mb-4 text-sm">
 <Link
 href="/for-stores"
 className="text-[#5D0F17]/40 hover:text-[#5D0F17] transition-colors"
 >
 &larr; Partner with VYA
 </Link>
 </div>
 <h1 className="text-3xl sm:text-5xl font-serif mb-3 sm:mb-4">
 Shopify Store Setup
 </h1>
 <p className="text-[#5D0F17]/60 text-base sm:text-lg">
 Connect your Shopify store to VYA using Shopify Collabs for automatic affiliate tracking.
 </p>
 </div>
 </section>

 {/* Time Estimate */}
 <section className="bg-[#5D0F17]/5">
 <div className="max-w-4xl mx-auto px-6 py-4">
 <p className="text-sm">
 <span className="font-medium">⏱ Setup time:</span>{" "}
 <span className="text-[#5D0F17]/60">~8 minutes</span>
 </p>
 </div>
 </section>

 {/* Content */}
 <section className="py-12 sm:py-16">
 <div className="max-w-4xl mx-auto px-6">
 {/* What is Shopify Collabs */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-4">What is Shopify Collabs?</h2>
 <p className="text-[#5D0F17]/60 mb-4">
 Shopify Collabs is Shopify&apos;s built-in affiliate and creator management tool.
 It handles all affiliate tracking, commission calculation, and payouts automatically, with no
 custom code or pixels required.
 </p>
 <div className="bg-green-50 border border-green-200 p-4 text-sm">
 <p className="text-green-800">
 <strong>Why we use Collabs:</strong> It&apos;s free, native to Shopify, and handles
 all the complex tracking automatically. We generate per-product affiliate links
 on our end, so there&apos;s no theme setup required on yours.
 </p>
 </div>
 </div>

 {/* Step by Step */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-6">Setup Steps</h2>

 <div className="space-y-8">
 {/* Step 1 */}
 <div className="border-l-2 border-[#5D0F17] pl-6">
 <div className="flex items-center gap-3 mb-2">
 <span className="w-8 h-8 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-sm font-medium">
 1
 </span>
 <h3 className="text-lg font-medium">Install Shopify Collabs</h3>
 </div>
 <div className="text-[#5D0F17]/60 space-y-3">
 <p>If you haven&apos;t already, install the Shopify Collabs app:</p>
 <ol className="list-decimal list-inside space-y-1 text-sm">
 <li>Go to your Shopify Admin</li>
 <li>Navigate to <strong>Apps → Search</strong></li>
 <li>Search for &quot;Shopify Collabs&quot;</li>
 <li>Click <strong>Install</strong></li>
 </ol>
 <a
 href="https://apps.shopify.com/collabs"
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-2 text-sm text-[#5D0F17] underline hover:no-underline"
 >
 Open Shopify Collabs App Store page
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
 </svg>
 </a>
 </div>
 </div>

 {/* Step 2 */}
 <div className="border-l-2 border-[#5D0F17] pl-6">
 <div className="flex items-center gap-3 mb-2">
 <span className="w-8 h-8 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-sm font-medium">
 2
 </span>
 <h3 className="text-lg font-medium">Create Your Tiered Commission Collections</h3>
 </div>
 <div className="text-[#5D0F17]/60 space-y-4">
 <p>VYA uses tiered commission rates based on product price. You&apos;ll create three <strong>Smart collections</strong> in Shopify, one per price tier, using price conditions to automatically include the right products, then assign each collection its rate in Collabs.</p>

 <div className="bg-[#5D0F17]/5 border border-[#5D0F17]/10 p-4 text-sm">
 <p className="font-medium text-[#5D0F17] mb-3">Commission rate tiers:</p>
 <div className="space-y-0">
 <div className="flex justify-between items-center py-2">
 <span><strong>TIER 1</strong>: products under $1,000</span>
 <span className="font-medium bg-[#5D0F17] text-[#FFFDF8] px-3 py-1">7%</span>
 </div>
 <div className="flex justify-between items-center py-2">
 <span><strong>TIER 2</strong>: products $1,000–$5,000</span>
 <span className="font-medium bg-[#5D0F17]/50 text-white px-3 py-1">5%</span>
 </div>
 <div className="flex justify-between items-center py-2">
 <span><strong>TIER 3</strong>: products above $5,000</span>
 <span className="font-medium bg-[#5D0F17]/40 text-[#FFFDF8] px-3 py-1">3%</span>
 </div>
 </div>
 </div>

 <div>
 <p className="text-sm font-medium text-[#5D0F17] mb-2">Step 2a: Create the three Smart collections:</p>
 <ol className="list-decimal list-inside space-y-2 text-sm">
 <li>In your Shopify Admin, go to <strong>Products → Collections</strong></li>
 <li>Click <strong>Create collection</strong></li>
 <li>Name it <strong>Under $1,000</strong></li>
 <li>Under <strong>Collection type</strong>, select <strong>Smart</strong></li>
 <li>Set condition: <strong>Price</strong> → <strong>is less than</strong> → <strong>1000</strong></li>
 <li>Click <strong>Save</strong></li>
 <li>Repeat to create <strong>$1,000–$5,000</strong> (price is greater than or equal to 1000 AND price is less than or equal to 5000) and <strong>Above $5,000</strong> (price is greater than 5000)</li>
 </ol>
 </div>

 <div>
 <p className="text-sm font-medium text-[#5D0F17] mb-2">Step 2b: Set commission rates per collection in Collabs:</p>
 <ol className="list-decimal list-inside space-y-2 text-sm">
 <li>Open <strong>Shopify Collabs</strong> from your Apps</li>
 <li>Click <strong>Programs</strong> in the left sidebar, then open your program (or click <strong>Create program</strong>)</li>
 <li>Under <strong>Commission</strong>, click <strong>Add collection rate</strong></li>
 <li>Select <strong>Under $1,000</strong> → set rate to <strong>7%</strong></li>
 <li>Add another collection rate: <strong>$1,000–$5,000</strong> → <strong>5%</strong></li>
 <li>Add another collection rate: <strong>Above $5,000</strong> → <strong>3%</strong></li>
 <li>Click <strong>Save</strong></li>
 </ol>
 </div>

 </div>
 </div>

 {/* Step 3 */}
 <div className="border-l-2 border-[#5D0F17] pl-6">
 <div className="flex items-center gap-3 mb-2">
 <span className="w-8 h-8 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-sm font-medium">
 3
 </span>
 <h3 className="text-lg font-medium">Add VYA as a Collaborator</h3>
 </div>
 <div className="text-[#5D0F17]/60 space-y-3">
 <p>Invite VYA to your Collabs program:</p>
 <ol className="list-decimal list-inside space-y-1 text-sm">
 <li>Open <strong>Shopify Collabs</strong> from your Apps</li>
 <li>Go to <strong>Recruiting → Invite Creator</strong></li>
 <li>Enter VYA&apos;s email:</li>
 </ol>
 <div className="bg-[#5D0F17]/10 p-3 font-mono text-sm select-all">
 partnerships@vyaplatform.com
 </div>
 <p className="text-sm">Attach your program offer to the invite and click <strong>Send Invite</strong>. We&apos;ll accept within 24 hours.</p>
 </div>
 </div>

 {/* Step 4 */}
 <div className="border-l-2 border-[#5D0F17] pl-6">
 <div className="flex items-center gap-3 mb-2">
 <span className="w-8 h-8 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-sm font-medium">
 4
 </span>
 <h3 className="text-lg font-medium">Connect Your Store via Webhook</h3>
 </div>
 <div className="text-[#5D0F17]/60 space-y-4">
 <p>
 A webhook lets VYA receive your order data automatically the moment a payment
 is confirmed, so we always have the right order total, items, and customer
 info without any manual work.
 </p>

 <div>
 <p className="text-sm font-medium text-[#5D0F17] mb-2">Step 4a: Create the webhook:</p>
 <ol className="list-decimal list-inside space-y-2 text-sm">
 <li>In your Shopify Admin, click <strong>Settings</strong> (bottom-left)</li>
 <li>Click <strong>Notifications</strong></li>
 <li>Scroll to the bottom and click <strong>Create webhook</strong></li>
 <li>Set <strong>Event</strong> to <strong>Order payment</strong></li>
 <li>Set <strong>Format</strong> to <strong>JSON</strong></li>
 <li>Paste the webhook URL into the <strong>URL</strong> field, enter your store name below to generate it:</li>
 </ol>
 <div className="mt-3">
 <WebhookUrlInput />
 </div>
 <p className="text-sm mt-3">For <strong>Webhook API version</strong>, select <strong>Latest</strong> (not Unstable). Click <strong>Save</strong>.</p>
 </div>

 <div>
 <p className="text-sm font-medium text-[#5D0F17] mb-2">Step 4b: Send us your signing secret:</p>
 <p className="text-sm">
 After saving, Shopify displays a <strong>signing secret</strong>, a long string of letters and numbers on the webhooks page.
 Copy it and email it to{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="text-[#5D0F17] underline">
 partnerships@vyaplatform.com
 </a>.
 This is how VYA verifies that orders are genuinely coming from your store.
 </p>
 <div className="bg-amber-50 border border-amber-200 p-3 text-sm mt-3">
 <p className="text-amber-800">
 <strong>Keep this secret private.</strong> Don&apos;t share it publicly, treat it like a password. Only send it directly to VYA.
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Step 5 */}
 <div className="border-l-2 border-[#5D0F17] pl-6">
 <div className="flex items-center gap-3 mb-2">
 <span className="w-8 h-8 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-sm font-medium">
 5
 </span>
 <h3 className="text-lg font-medium">We Generate the Affiliate Links</h3>
 </div>
 <div className="text-[#5D0F17]/60 space-y-3">
 <p>
 Once VYA has been added to your Collabs program, we generate a unique
 affiliate link for each of your products on our end. No action needed from you.
 </p>
 <p className="text-sm">
 Each product gets its own tracked link like:
 </p>
 <div className="bg-[#5D0F17]/10 p-3 font-mono text-sm">
 https://collabs.shop/xxxxxxx
 </div>
 <p className="text-sm">
 When a customer clicks a product on VYA, they&apos;re routed through that
 product&apos;s link. Shopify Collabs registers the visit and sets a tracking
 cookie automatically, no theme changes or app embeds needed on your store.
 </p>
 </div>
 </div>

 {/* Step 6 */}
 <div className="border-l-2 border-[#5D0F17]/20 pl-6">
 <div className="flex items-center gap-3 mb-2">
 <span className="w-8 h-8 bg-[#5D0F17]/15 text-[#5D0F17]/60 flex items-center justify-center text-sm font-medium">
 6
 </span>
 <h3 className="text-lg font-medium text-[#5D0F17]/60">Done!</h3>
 </div>
 <div className="text-[#5D0F17]/50 space-y-3">
 <p>
 Once we accept your invitation and activate your webhook, all VYA traffic to
 your store will be automatically tracked. No theme changes needed. Shopify handles:
 </p>
 <ul className="list-disc list-inside space-y-1 text-sm">
 <li>Click tracking via affiliate links</li>
 <li>Conversion attribution</li>
 <li>Commission calculation</li>
 <li>Monthly payouts</li>
 </ul>
 </div>
 </div>
 </div>
 </div>

 {/* How It Works */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-4">How Attribution Works</h2>
 <div className="bg-[#5D0F17]/5 p-6 space-y-4 text-sm">
 <div className="flex items-start gap-4">
 <div className="w-6 h-6 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-xs flex-shrink-0">1</div>
 <p>Customer clicks a product on VYA → routed through a unique per-product affiliate link</p>
 </div>
 <div className="flex items-start gap-4">
 <div className="w-6 h-6 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-xs flex-shrink-0">2</div>
 <p>Shopify Collabs registers the visit and sets an attribution cookie</p>
 </div>
 <div className="flex items-start gap-4">
 <div className="w-6 h-6 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-xs flex-shrink-0">3</div>
 <p>If they purchase within your cookie window, VYA gets credit</p>
 </div>
 <div className="flex items-start gap-4">
 <div className="w-6 h-6 bg-[#5D0F17] text-[#FFFDF8] flex items-center justify-center text-xs flex-shrink-0">4</div>
 <p>Commission is calculated and paid out monthly via Shopify</p>
 </div>
 </div>
 </div>

 {/* FAQ */}
 <div className="mb-12 sm:mb-16">
 <h2 className="text-xl sm:text-2xl font-serif mb-6">Common Questions</h2>
 <div className="space-y-6">
 <div>
 <h3 className="font-medium mb-2">Do I need to change anything on my store or theme?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 No. We use per-product affiliate links that handle tracking automatically.
 No theme changes, app embeds, or custom code required on your end.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">How do I see VYA-referred sales?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 In Shopify Collabs, go to <strong>Analytics</strong> to see all sales, clicks,
 and commissions attributed to VYA.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">When do payouts happen?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 Shopify processes affiliate payouts monthly. You can configure payout thresholds
 and methods in Collabs settings.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Can I change the commission rate later?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 Yes. You can adjust commission rates anytime in Collabs settings. Changes apply
 to future sales only.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Where do I find my signing secret after I save the webhook?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 Go to <strong>Settings → Notifications → Webhooks</strong> in your Shopify Admin. Your signing secret is shown at the top of the webhooks page, above the list of webhooks. It stays the same for all webhooks on your store, you only need to send it to us once.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">What if I accidentally regenerate my signing secret?</h3>
 <p className="text-[#5D0F17]/60 text-sm">
 If Shopify generates a new secret, just email the updated one to{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="text-[#5D0F17] underline">
 partnerships@vyaplatform.com
 </a>{" "}
 and we&apos;ll update it on our end. Orders will resume tracking within minutes.
 </p>
 </div>
 <div>
 <h3 className="font-medium mb-2">Shopify Collabs says &quot;no collections&quot; when I try to set rates, why?</h3>
 <p className="text-[#5D0F17]/60 text-sm mb-2">
 Make sure your Smart collections are set to <strong>Active</strong> (not Draft) and have at least one product matching the price condition. Collections that are empty or in Draft won&apos;t appear in Collabs.
 </p>
 <p className="text-[#5D0F17]/60 text-sm">
 If they still don&apos;t appear, try saving the collection again in Shopify Admin to force a sync, then refresh Collabs.
 </p>
 </div>
 </div>
 </div>

 {/* Support */}
 <div className="pt-8">
 <p className="text-[#5D0F17]/60 text-sm">
 Need help? Email us at{" "}
 <a href="mailto:partnerships@vyaplatform.com" className="text-[#5D0F17] underline">
 partnerships@vyaplatform.com
 </a>
 </p>
 </div>
 </div>
 </section>
 </main>
 );
}
