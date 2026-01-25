import Link from "next/link";
import NewsletterSignup from "./NewsletterSignup";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-neutral-950 text-white">
      {/* Newsletter Section */}
      <div className="border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-16 sm:py-20">
          <div className="max-w-xl mx-auto text-center">
            <h3 className="text-2xl sm:text-3xl font-serif mb-3">
              Join the Inner Circle
            </h3>
            <p className="text-neutral-400 text-sm sm:text-base mb-8 leading-relaxed">
              Be the first to discover new stores, rare finds, and exclusive drops from independent sellers nationwide.
            </p>
            <NewsletterSignup variant="hero" />
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-block mb-5">
              <span className="text-3xl font-serif tracking-wide">VIA</span>
            </Link>
            <p className="text-neutral-400 text-sm leading-relaxed mb-6 max-w-xs">
              Curated vintage and resale from independent stores across the country. Discover pieces with stories.
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-4">
              <a
                href="https://www.instagram.com/theviaplatform/"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-center w-10 h-10 border border-neutral-700 hover:border-white hover:bg-white transition-all duration-300"
                aria-label="Follow us on Instagram"
              >
                <svg
                  className="w-5 h-5 text-neutral-400 group-hover:text-black transition-colors duration-300"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            </div>
          </div>

          {/* Shop Column */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-6">
              Shop
            </h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/browse"
                  className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm"
                >
                  Browse All
                </Link>
              </li>
              <li>
                <Link
                  href="/stores"
                  className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm"
                >
                  Our Stores
                </Link>
              </li>
              <li>
                <Link
                  href="/categories"
                  className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm"
                >
                  Categories
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-6">
              Company
            </h4>
            <ul className="space-y-4">
              <li>
                <Link
                  href="/for-stores"
                  className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm"
                >
                  Partner With Us
                </Link>
              </li>
              <li>
                <Link
                  href="/faqs"
                  className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm"
                >
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Column */}
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-6">
              Connect
            </h4>
            <ul className="space-y-4">
              <li>
                <a
                  href="https://www.instagram.com/theviaplatform/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-300 hover:text-white transition-colors duration-200 text-sm inline-flex items-center gap-2"
                >
                  <span>Instagram</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-neutral-500 text-xs tracking-wide">
              {currentYear} VIA. All rights reserved.
            </p>
            <p className="text-neutral-600 text-xs">
              Curated with care in the USA
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
