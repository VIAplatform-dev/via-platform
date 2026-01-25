import Link from "next/link";
import NewsletterSignup from "./NewsletterSignup";

export default function Footer() {
  return (
    <footer className="bg-black text-white">
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-6 py-16 sm:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-block mb-4">
              <span className="text-2xl font-serif">VIA</span>
            </Link>
            <p className="text-neutral-400 text-sm leading-relaxed max-w-xs">
              Discover curated vintage and resale from independent stores nationwide.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-sm uppercase tracking-wide mb-4">Shop</h4>
            <ul className="space-y-3 text-neutral-400 text-sm">
              <li>
                <Link href="/browse" className="hover:text-white transition min-h-[44px] inline-flex items-center">
                  Browse All
                </Link>
              </li>
              <li>
                <Link href="/stores" className="hover:text-white transition min-h-[44px] inline-flex items-center">
                  Stores
                </Link>
              </li>
              <li>
                <Link href="/categories" className="hover:text-white transition min-h-[44px] inline-flex items-center">
                  Categories
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm uppercase tracking-wide mb-4">Company</h4>
            <ul className="space-y-3 text-neutral-400 text-sm">
              <li>
                <Link href="/for-stores" className="hover:text-white transition min-h-[44px] inline-flex items-center">
                  Partner With Us
                </Link>
              </li>
              <li>
                <Link href="/faqs" className="hover:text-white transition min-h-[44px] inline-flex items-center">
                  FAQs
                </Link>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/theviaplatform/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition min-h-[44px] inline-flex items-center"
                >
                  Instagram
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="sm:col-span-2 lg:col-span-1">
            <NewsletterSignup variant="footer" title="Stay Updated" />
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-neutral-500">
          <p>© {new Date().getFullYear()} VIA. All rights reserved.</p>
          <div className="flex gap-6">
            <a
              href="https://www.instagram.com/theviaplatform/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition"
            >
              Instagram
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
