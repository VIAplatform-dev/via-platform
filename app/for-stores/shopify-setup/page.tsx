import Link from "next/link";

export default function ShopifySetupPage() {
  return (
    <main className="bg-white min-h-screen text-black">
      {/* Header */}
      <section className="border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-6 py-12 sm:py-20">
          <div className="flex items-center gap-4 mb-4 text-sm">
            <Link
              href="/"
              className="text-neutral-400 hover:text-black transition-colors"
            >
              ← Back to VIA
            </Link>
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif mb-3 sm:mb-4">
            Shopify Store Setup
          </h1>
          <p className="text-neutral-600 text-base sm:text-lg">
            Connect your Shopify store to VIA using Shopify Collabs for automatic affiliate tracking.
          </p>
        </div>
      </section>

      {/* Time Estimate */}
      <section className="border-b border-neutral-200 bg-neutral-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="text-sm">
            <span className="font-medium">⏱ Setup time:</span>{" "}
            <span className="text-neutral-600">~3 minutes</span>
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-6">
          {/* What is Shopify Collabs */}
          <div className="mb-12 sm:mb-16">
            <h2 className="text-xl sm:text-2xl font-serif mb-4">What is Shopify Collabs?</h2>
            <p className="text-neutral-600 mb-4">
              Shopify Collabs is Shopify&apos;s built-in affiliate and creator management tool.
              It handles all affiliate tracking, commission calculation, and payouts automatically—no
              custom code or pixels required.
            </p>
            <div className="bg-green-50 border border-green-200 p-4 text-sm">
              <p className="text-green-800">
                <strong>Why we use Collabs:</strong> It&apos;s free, native to Shopify, and handles
                all the complex tracking automatically. You don&apos;t need to add any code to your store.
              </p>
            </div>
          </div>

          {/* Step by Step */}
          <div className="mb-12 sm:mb-16">
            <h2 className="text-xl sm:text-2xl font-serif mb-6">Setup Steps</h2>

            <div className="space-y-8">
              {/* Step 1 */}
              <div className="border-l-2 border-black pl-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 bg-black text-white flex items-center justify-center text-sm font-medium">
                    1
                  </span>
                  <h3 className="text-lg font-medium">Install Shopify Collabs</h3>
                </div>
                <div className="text-neutral-600 space-y-3">
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
                    className="inline-flex items-center gap-2 text-sm text-black underline hover:no-underline"
                  >
                    Open Shopify Collabs App Store page
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Step 2 */}
              <div className="border-l-2 border-black pl-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 bg-black text-white flex items-center justify-center text-sm font-medium">
                    2
                  </span>
                  <h3 className="text-lg font-medium">Add VIA as a Collaborator</h3>
                </div>
                <div className="text-neutral-600 space-y-3">
                  <p>Invite VIA to your Collabs program:</p>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Open <strong>Shopify Collabs</strong> from your Apps</li>
                    <li>Go to <strong>Collaborators → Invite</strong></li>
                    <li>Enter VIA&apos;s affiliate email:</li>
                  </ol>
                  <div className="bg-neutral-100 p-3 font-mono text-sm select-all">
                    partnerships@theviaplatform.com
                  </div>
                  <p className="text-sm">Click <strong>Send Invite</strong>. We&apos;ll accept within 24 hours.</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="border-l-2 border-black pl-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 bg-black text-white flex items-center justify-center text-sm font-medium">
                    3
                  </span>
                  <h3 className="text-lg font-medium">Set Commission Rate</h3>
                </div>
                <div className="text-neutral-600 space-y-3">
                  <p>Configure the commission VIA earns on referred sales. We use a tiered commission structure:</p>

                  <div className="bg-neutral-50 border border-neutral-200 p-4 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-neutral-200">
                      <span className="text-sm font-medium">Sales under $1,000</span>
                      <span className="text-sm font-medium bg-black text-white px-3 py-1">7% commission</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-neutral-200">
                      <span className="text-sm font-medium">Sales $1,000 - $5,000</span>
                      <span className="text-sm font-medium bg-neutral-700 text-white px-3 py-1">5% commission</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm font-medium">Sales above $5,000</span>
                      <span className="text-sm font-medium bg-neutral-500 text-white px-3 py-1">3% commission</span>
                    </div>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>In Collabs, go to <strong>Settings → Commission</strong></li>
                    <li>Set the appropriate commission percentage based on your typical order value</li>
                    <li>Choose <strong>All products</strong> or select specific collections</li>
                    <li>Set cookie duration (we recommend 30 days)</li>
                  </ol>
                  <div className="bg-amber-50 border border-amber-200 p-3 text-sm">
                    <p className="text-amber-800">
                      <strong>Tip:</strong> A 30-day cookie window captures customers who browse
                      on VIA but purchase later. Most vintage purchases happen within 7 days.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="border-l-2 border-neutral-300 pl-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-8 h-8 bg-neutral-200 text-neutral-600 flex items-center justify-center text-sm font-medium">
                    4
                  </span>
                  <h3 className="text-lg font-medium text-neutral-600">Done! (That&apos;s it)</h3>
                </div>
                <div className="text-neutral-500 space-y-3">
                  <p>
                    Once we accept your invitation, all VIA traffic to your store will be
                    automatically tracked. Shopify handles:
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
            <div className="bg-neutral-50 p-6 space-y-4 text-sm">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-black text-white flex items-center justify-center text-xs flex-shrink-0">1</div>
                <p>Customer clicks a product on VIA → redirected to your Shopify store with affiliate tracking</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-black text-white flex items-center justify-center text-xs flex-shrink-0">2</div>
                <p>Shopify Collabs drops a cookie on the customer&apos;s browser</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-black text-white flex items-center justify-center text-xs flex-shrink-0">3</div>
                <p>If they purchase within your cookie window, VIA gets credit</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 bg-black text-white flex items-center justify-center text-xs flex-shrink-0">4</div>
                <p>Commission is calculated and paid out monthly via Shopify</p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="mb-12 sm:mb-16">
            <h2 className="text-xl sm:text-2xl font-serif mb-6">Common Questions</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-2">Do I need to add any code to my store?</h3>
                <p className="text-neutral-600 text-sm">
                  No. Shopify Collabs handles everything automatically. No pixels, no scripts, no theme edits.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">How do I see VIA-referred sales?</h3>
                <p className="text-neutral-600 text-sm">
                  In Shopify Collabs, go to <strong>Analytics</strong> to see all sales, clicks,
                  and commissions attributed to VIA.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">When do payouts happen?</h3>
                <p className="text-neutral-600 text-sm">
                  Shopify processes affiliate payouts monthly. You can configure payout thresholds
                  and methods in Collabs settings.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Can I change the commission rate later?</h3>
                <p className="text-neutral-600 text-sm">
                  Yes. You can adjust commission rates anytime in Collabs settings. Changes apply
                  to future sales only.
                </p>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="border-t border-neutral-200 pt-8">
            <p className="text-neutral-600 text-sm">
              Need help? Email us at{" "}
              <a href="mailto:partnerships@theviaplatform.com" className="text-black underline">
                partnerships@theviaplatform.com
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
