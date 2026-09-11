import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
 title: "Privacy Policy | VYA",
 description: "How VYA Platform Corporation collects, uses, and protects your personal information.",
 openGraph: {
 title: "Privacy Policy | VYA",
 description: "How VYA Platform Corporation collects, uses, and protects your personal information.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
};

export default function PrivacyPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Header */}
 <section className="border-b border-[#5D0F17]/10">
 <div className="max-w-4xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/40 mb-2">Legal</p>
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Privacy Policy</h1>
 <p className="text-sm text-[#5D0F17]/50">
 Effective: May 23, 2026 &nbsp;·&nbsp; Last Updated: May 23, 2026
 </p>
 </div>
 </section>

 {/* Content */}
 <section className="py-12 sm:py-16">
 <div className="max-w-4xl mx-auto px-6 space-y-12 text-[#5D0F17]/80 leading-relaxed text-sm sm:text-base">

 <p>
 VIA Platform Corporation (&ldquo;VYA,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; and
 &ldquo;our&rdquo;) take your privacy seriously and have outlined the following Privacy
 Policy (the &ldquo;Policy&rdquo;) to inform you of our policies and procedures regarding
 the information we collect from you.
 </p>
 <p>
 By using or accessing VYA&apos;s website (the &ldquo;Services&rdquo;) in any manner, you
 acknowledge that you accept the practices and requirements outlined in this Policy, and
 you hereby consent that we will collect, use, and share your information in the following
 ways:
 </p>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">1. Information Collected</h2>
 <p className="mb-6">
 We collect certain information to facilitate your use of VYA&apos;s Services.
 </p>

 <h3 className="font-serif text-[#5D0F17] text-base mb-2">a. Voluntarily Disclosed Information</h3>
 <p className="mb-6">
 When you use the Services, you will have the opportunity to provide us with some
 information directly. For example, some functions of the Services request that you
 register for an account, where we may ask you for your email address, name, and phone
 number. We may also allow you to complete style quizzes, where we collect information
 about your style and garment preferences to recommend certain items to you; to complete
 website feedback forms, where we collect information about how to improve our website
 interface and design; or to participate in our Sourcing Program, where we collect
 information about the details of a desired item, your contact information, and preferred
 stores in VYA&apos;s network.
 </p>

 <h3 className="font-serif text-[#5D0F17] text-base mb-2">b. Automatically Collected Information</h3>
 <p className="mb-6">
 Whenever you interact with the Services, VYA and third party services we work with
 automatically receive and record information from your browser, which may include your IP
 address, device information, device identifiers (such as cookie IDs), operating system,
 the type of browser you used, the page or feature you requested, what pages you viewed
 and the referral source, mouse movements and clicks, sign-ups, and outbound store visits.
 You may be able to change the preferences on your browser or device to prevent or limit
 your device&apos;s disclosure of information, but doing so may prevent you from taking
 advantage of our Services.
 </p>

 <h3 className="font-serif text-[#5D0F17] text-base mb-2">c. Third Parties</h3>
 <p className="mb-4">
 The technologies we use for automatic information collection may include:
 </p>
 <ul className="list-disc pl-6 space-y-3">
 <li>
 <strong>Cookies.</strong> A cookie is a small file placed on your computer or phone. It
 may be possible to refuse to accept cookies by activating the appropriate setting on
 your computer or phone. However, if you select this setting, you may be unable to access
 certain parts of the Services.
 </li>
 <li>
 Pages of our website and our emails may contain small electronic files known as web
 beacons (also referred to as clear gifs, pixel tags, and single-pixel gifs) that permit
 VYA and third parties we work with to count users who have visited those pages or opened
 an email and for other related app statistics.
 </li>
 <li>
 We partner with third parties to process payment information. When you complete a
 monetary transaction on our webpage, third parties may collect your name, billing and
 shipping addresses, email, phone number, full payment method, credit or debit card
 numbers, transaction amounts and dates, and currency type.
 </li>
 </ul>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">2. Use of Collected Information</h2>
 <p className="mb-4">
 We may use information that we collect about you or that you provide to us, including any
 Personal Information, to provide the Services to you, develop and maintain the Services,
 comply with legal obligations, and for any lawful purpose.
 </p>
 <p>
 We may communicate with you to verify your account, notify you about certain activity on
 the Services, inform you of changes to our policies and procedures, or to otherwise
 facilitate the operation of the Services via email (in each case to the email address you
 provide) or a posting to our website,{" "}
 <a href="https://vyaplatform.com/" className="underline hover:text-[#5D0F17]/60 transition">
 https://vyaplatform.com/
 </a>
 .
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">3. Disclosure of Information</h2>
 <p className="mb-4">
 We employ and partner with retail stores and third parties to bring third-party
 merchandise to you and to perform tasks on our behalf. Retail stores
 (&ldquo;Retail Stores&rdquo;) include any vintage clothing stores that we partner with
 and list on our website. Third parties (&ldquo;Third Parties&rdquo;) include companies
 and external products that VYA relies on to operate its Services, such as hosting our
 website. We must share your information with Retail Stores and Third Parties to provide
 products and services to you.
 </p>
 <p className="mb-4">
 We may share your Personal Information with Retail Stores and Third Parties. We may also
 de-identify your Personal Information so that you are not identified as an individual and
 provide that information to Third Parties. Further, we may also provide aggregate usage
 information to Third Parties (or allow Third Parties to collect that information from
 you). Our Services also contain external links to third-party apps or websites. Clicking
 these links may cause these third parties to collect certain information from you.
 </p>
 <p>
 We reserve the right to access, read, and disclose any information that we believe, in
 our sole discretion, is necessary to comply with law or court order; enforce or apply our
 Terms of Service and other agreements; or protect the rights, property, or safety of VYA,
 our employees, our users, or others. We may notify you by email or text message if we are
 required to disclose your information to comply with a legal data request, subpoena, or
 court order.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">4. Data Security &amp; Storage</h2>
 <p>
 Both VYA and Third Parties that we work with have implemented measures designed to
 protect your Personal Information from loss, unauthorized access, and alteration. We
 endeavor to protect the privacy of your account and other Personal Information we hold in
 our records, and actively work to prevent unauthorized entry or use, hardware or software
 failure, and other factors that could potentially compromise the security of user
 information. But we cannot guarantee complete security.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">5. Modification &amp; Deletion of Information</h2>
 <p>
 To access, and, in some cases, edit or delete your Personal Information and other account
 information, you can do so by accessing the account section of the VYA website, or by
 emailing VYA at{" "}
 <a href="mailto:hana@vyaplatform.com" className="underline hover:text-[#5D0F17]/60 transition">
 hana@vyaplatform.com
 </a>
 . If you request removal of your information, you may be unable to utilize the Services.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">6. Changes to the Policy</h2>
 <p>
 We post any changes we make to our Privacy Policy on this page. If we make material
 changes to how we treat our users&apos; Personal Information, we will post a banner on our
 website, vyaplatform.com, alerting users to any changes, or by sending an email
 notification. The date the Privacy Policy was last revised is identified at the beginning
 of this Policy. You are responsible for ensuring that we have an up-to-date email address
 for you.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">7. Contact Information</h2>
 <p>
 For any inquiries about this Privacy Policy and our privacy practices, contact us at:{" "}
 <a href="mailto:hana@thevyaplatform.com" className="underline hover:text-[#5D0F17]/60 transition">
 hana@thevyaplatform.com
 </a>
 .
 </p>
 </section>

 <div className="pt-4 border-t border-[#5D0F17]/10">
 <Link href="/" className="text-sm text-[#5D0F17]/50 hover:text-[#5D0F17] transition">
 ← Back to VYA
 </Link>
 </div>

 </div>
 </section>
 </main>
 );
}
