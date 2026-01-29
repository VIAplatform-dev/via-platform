import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f6f3]">
      <div className="max-w-3xl mx-auto px-6 py-20 sm:py-28">
        {/* Header */}
        <div className="mb-16">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
            Legal
          </p>
          <h1 className="text-4xl sm:text-5xl font-serif mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500">
            Last updated: January 29, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-12 text-gray-700 leading-relaxed">
          <section>
            <p>
              VIA Platform (&ldquo;VIA,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
              or &ldquo;our&rdquo;) is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, disclose, and safeguard
              your information when you visit our website at theviaplatform.com
              (the &ldquo;Site&rdquo;). Please read this policy carefully. If you
              do not agree with the terms of this Privacy Policy, please do not
              access the Site.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              1. Information We Collect
            </h2>

            <h3 className="text-lg font-serif mb-3 text-black">
              Personal Information
            </h3>
            <p className="mb-4">
              We may collect personal information that you voluntarily provide to
              us when you:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li>Subscribe to our newsletter</li>
              <li>Create an account or user profile</li>
              <li>Participate in quizzes or interactive features (e.g., VIA Taste Match)</li>
              <li>Contact us with inquiries or feedback</li>
              <li>Apply to partner with us as a store</li>
            </ul>
            <p className="mb-4">This information may include:</p>
            <ul className="list-disc pl-6 space-y-2 mb-6">
              <li>Email address</li>
              <li>Name</li>
              <li>Store or business information (for partners)</li>
              <li>Quiz responses and style preferences</li>
            </ul>

            <h3 className="text-lg font-serif mb-3 text-black">
              Automatically Collected Information
            </h3>
            <p className="mb-4">
              When you visit the Site, we may automatically collect certain
              information about your device and usage, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Browser type and version</li>
              <li>Operating system</li>
              <li>IP address</li>
              <li>Pages visited and time spent on pages</li>
              <li>Referring website addresses</li>
              <li>Device identifiers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              2. How We Use Your Information
            </h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, operate, and maintain the Site</li>
              <li>Send you newsletters and marketing communications (with your consent)</li>
              <li>Improve and personalize your experience on the Site</li>
              <li>Analyze usage trends and Site performance</li>
              <li>Generate and display your taste profile and quiz results</li>
              <li>Facilitate referral and sharing features</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Detect, prevent, and address technical issues or fraud</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              3. Analytics and Tracking
            </h2>
            <p className="mb-4">
              We use third-party analytics services to help us understand how
              the Site is used. These services may collect information sent by
              your browser, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Google Analytics (GA4):</strong> We use Google Analytics
                to analyze Site traffic and usage patterns. Google Analytics uses
                cookies to collect information. You can learn more about how
                Google uses data at{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-black underline hover:no-underline"
                >
                  Google&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Pinterest Tag:</strong> We use the Pinterest Tag to
                measure the effectiveness of our advertising and to understand
                how users interact with our content.
              </li>
            </ul>
            <p>
              You can opt out of analytics tracking by using browser extensions
              such as the{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-black underline hover:no-underline"
              >
                Google Analytics Opt-out Browser Add-on
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              4. Cookies and Local Storage
            </h2>
            <p className="mb-4">
              We use cookies and browser local storage to enhance your experience:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Cookies:</strong> Small data files placed on your device
                by analytics and tracking services. You can control cookies
                through your browser settings.
              </li>
              <li>
                <strong>Local Storage:</strong> We use browser local storage to
                save your quiz results, user preferences, and session data
                locally on your device. This data is not transmitted to our
                servers unless you explicitly interact with features that
                require it.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              5. Sharing of Information
            </h2>
            <p className="mb-4">We may share your information in the following situations:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>With Service Providers:</strong> We may share your
                information with third-party service providers who perform
                services on our behalf, such as email delivery, analytics, and
                hosting.
              </li>
              <li>
                <strong>With Partner Stores:</strong> When you click through to
                a partner store to make a purchase, you will be subject to that
                store&apos;s own privacy policy.
              </li>
              <li>
                <strong>For Legal Purposes:</strong> We may disclose your
                information if required to do so by law or in response to valid
                requests by public authorities.
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a
                merger, acquisition, or sale of assets, your information may be
                transferred as a business asset.
              </li>
            </ul>
            <p className="mt-4">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              6. Data Security
            </h2>
            <p>
              We use commercially reasonable administrative, technical, and
              physical security measures to protect your personal information.
              However, no method of transmission over the Internet or method of
              electronic storage is 100% secure. While we strive to use
              commercially acceptable means to protect your personal information,
              we cannot guarantee its absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              7. Data Retention
            </h2>
            <p>
              We retain your personal information only for as long as necessary
              to fulfill the purposes outlined in this Privacy Policy, unless a
              longer retention period is required or permitted by law. When your
              information is no longer needed, we will securely delete or
              anonymize it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              8. Your Rights
            </h2>
            <p className="mb-4">
              Depending on your location, you may have certain rights regarding
              your personal information, including:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The right to access the personal information we hold about you</li>
              <li>The right to request correction of inaccurate information</li>
              <li>The right to request deletion of your personal information</li>
              <li>The right to opt out of marketing communications</li>
              <li>The right to data portability</li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, please contact us at{" "}
              <a
                href="mailto:hana@theviaplatform.com"
                className="text-black underline hover:no-underline"
              >
                hana@theviaplatform.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              9. Children&apos;s Privacy
            </h2>
            <p>
              Our Service is not directed to individuals under the age of 13. We
              do not knowingly collect personal information from children under
              13. If you are a parent or guardian and believe your child has
              provided us with personal information, please contact us and we
              will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              10. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify
              you of any changes by posting the new Privacy Policy on this page
              and updating the &ldquo;Last updated&rdquo; date. You are advised
              to review this Privacy Policy periodically for any changes.
              Changes are effective when posted on this page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-serif mb-4 text-black">
              11. Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, please
              contact us at{" "}
              <a
                href="mailto:hana@theviaplatform.com"
                className="text-black underline hover:no-underline"
              >
                hana@theviaplatform.com
              </a>
              .
            </p>
          </section>
        </div>

        {/* Back link */}
        <div className="mt-16 pt-8 border-t border-gray-200">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-black transition"
          >
            ← Back to VIA
          </Link>
        </div>
      </div>
    </main>
  );
}
