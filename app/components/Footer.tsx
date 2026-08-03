import Link from "next/link";

export default function Footer() {
 const currentYear = new Date().getFullYear();

 return (
 <footer className="bg-[#FFFDF8]">
 <div className="relative overflow-hidden rounded-t-[1.75rem] sm:rounded-t-[2.5rem]">
 {/* Background — same croc image as the hero */}
 <div
 className="absolute inset-0"
 style={{ backgroundImage: "url(/hero-v10.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
 aria-hidden="true"
 />
 <div className="absolute inset-0 bg-black/45" aria-hidden="true" />

 {/* Content */}
 <div className="relative text-[#FFFDF8]">
 {/* Main Footer Content */}
 <div className="max-w-7xl mx-auto px-6 sm:px-10 py-16">
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
 {/* Brand Column */}
 <div className="lg:col-span-1">
 <Link href="/" className="inline-flex items-start gap-1.5 mb-5">
 <img src="/vya-logo.png" alt="VYA" className="h-7 sm:h-8 w-auto" style={{ filter: "brightness(0) invert(1)" }} />
 <span className="text-[9px] uppercase tracking-[0.2em] text-[#FFFDF8]/60 mt-0.5">pilot</span>
 </Link>
 <p className="text-[#FFFDF8]/75 text-sm leading-relaxed mb-6 max-w-xs">
 Shop the best vintage stores in the world, all in one place.
 </p>
 {/* Social Links */}
 <div className="flex items-center gap-4">
 <a
 href="https://www.instagram.com/vyaplatform"
 target="_blank"
 rel="noopener noreferrer"
 className="group flex items-center justify-center w-10 h-10 border border-[#FFFDF8]/35 hover:border-[#FFFDF8] hover:bg-[#FFFDF8] transition-all duration-300"
 aria-label="Follow us on Instagram"
 >
 <svg
 className="w-5 h-5 text-[#FFFDF8] group-hover:text-[#5D0F17] transition-colors duration-300"
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
 <a
 href="https://www.tiktok.com/@vyaplatform"
 target="_blank"
 rel="noopener noreferrer"
 className="group flex items-center justify-center w-10 h-10 border border-[#FFFDF8]/35 hover:border-[#FFFDF8] hover:bg-[#FFFDF8] transition-all duration-300"
 aria-label="Follow us on TikTok"
 >
 <svg
 className="w-5 h-5 text-[#FFFDF8] group-hover:text-[#5D0F17] transition-colors duration-300"
 fill="currentColor"
 viewBox="0 0 24 24"
 aria-hidden="true"
 >
 <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
 </svg>
 </a>
 <a
 href="https://vyaplatform.substack.com/"
 target="_blank"
 rel="noopener noreferrer"
 className="group flex items-center justify-center w-10 h-10 border border-[#FFFDF8]/35 hover:border-[#FFFDF8] hover:bg-[#FFFDF8] transition-all duration-300"
 aria-label="Read our Substack"
 >
 <svg
 className="w-5 h-5 text-[#FFFDF8] group-hover:text-[#5D0F17] transition-colors duration-300"
 fill="currentColor"
 viewBox="0 0 24 24"
 aria-hidden="true"
 >
 <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z" />
 </svg>
 </a>
 </div>
 </div>

 {/* Shop Column */}
 <div>
 <h4 className="text-xs uppercase tracking-[0.2em] text-[#FFFDF8]/55 mb-6">
 Shop
 </h4>
 <ul className="space-y-4">
 {[
 { href: "/browse", label: "Browse All" },
 { href: "/stores", label: "Our Stores" },
 { href: "/categories", label: "Categories" },
 { href: "/brands", label: "Designers" },
 { href: "/collections", label: "Collections" },
 ].map(({ href, label }) => (
 <li key={href}>
 <Link
 href={href}
 className="text-[#FFFDF8]/75 hover:text-[#FFFDF8] transition-colors duration-200 text-sm link-underline"
 >
 {label}
 </Link>
 </li>
 ))}
 </ul>
 </div>

 {/* Company Column */}
 <div>
 <h4 className="text-xs uppercase tracking-[0.2em] text-[#FFFDF8]/55 mb-6">
 Company
 </h4>
 <ul className="space-y-4">
 {[
 { href: "/partner-with-vya", label: "Partner With Us" },
 { href: "/for-stores", label: "Already a Partner?" },
 { href: "/faqs", label: "FAQs" },
 { href: "/terms", label: "Terms & Conditions" },
 { href: "/privacy", label: "Privacy Policy" },
 ].map(({ href, label }) => (
 <li key={href}>
 <Link
 href={href}
 className="text-[#FFFDF8]/75 hover:text-[#FFFDF8] transition-colors duration-200 text-sm link-underline"
 >
 {label}
 </Link>
 </li>
 ))}
 <li>
 <a
 href="https://form.typeform.com/to/ssrEgHZ1"
 target="_blank"
 rel="noopener noreferrer"
 className="text-[#FFFDF8]/75 hover:text-[#FFFDF8] transition-colors duration-200 text-sm link-underline"
 >
 Give Feedback
 </a>
 </li>
 </ul>
 </div>

 {/* Press Column */}
 <div>
 <h4 className="text-xs uppercase tracking-[0.2em] text-[#FFFDF8]/55 mb-6">
 As Seen In
 </h4>
 <ul className="space-y-5">
 <li>
 <a
  href="https://www.glossy.co/fashion/why-its-thrift-stores-time-to-shine/"
  target="_blank"
  rel="noopener noreferrer"
  className="group"
 >
  <p className="text-sm font-semibold text-[#FFFDF8]/80 group-hover:text-[#FFFDF8] transition-colors duration-200">Glossy</p>
  <p className="text-[11px] text-[#FFFDF8]/55 group-hover:text-[#FFFDF8]/70 transition-colors duration-200 leading-snug mt-0.5">Why it&apos;s thrift stores&apos; time to shine</p>
 </a>
 </li>
 <li>
 <a
  href="https://www.businessinsider.com/college-senior-built-vintage-marketplace-claude-2026-5"
  target="_blank"
  rel="noopener noreferrer"
  className="group"
 >
  <p className="text-sm font-semibold text-[#FFFDF8]/80 group-hover:text-[#FFFDF8] transition-colors duration-200">Business Insider</p>
  <p className="text-[11px] text-[#FFFDF8]/55 group-hover:text-[#FFFDF8]/70 transition-colors duration-200 leading-snug mt-0.5">A college senior built a vintage marketplace with Claude</p>
 </a>
 </li>
 </ul>
 </div>

 </div>
 </div>

 {/* Bottom Bar */}
 <div className="border-t border-[#FFFDF8]/15">
 <div className="max-w-7xl mx-auto px-6 sm:px-10 py-6">
 <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
 <p className="text-[#FFFDF8]/55 text-xs tracking-wide">
 {currentYear} VYA. All rights reserved.
 </p>
 </div>
 </div>
 </div>
 </div>
 </div>
 </footer>
 );
}
