import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
 title: "Terms of Service | VYA",
 description: "VYA Platform Corporation's terms of service governing your use of the VYA platform.",
 openGraph: {
 title: "Terms of Service | VYA",
 description: "VYA Platform Corporation's terms of service governing your use of the VYA platform.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
};

export default function TermsPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* Header */}
 <section className="border-b border-[#5D0F17]/10">
 <div className="max-w-4xl mx-auto px-6 pt-8 pb-4 sm:pt-10 sm:pb-6">
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/40 mb-2">Legal</p>
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Terms of Service</h1>
 <p className="text-sm text-[#5D0F17]/50">
 Effective: May 23, 2026 &nbsp;·&nbsp; Last Updated: May 23, 2026
 </p>
 </div>
 </section>

 {/* Content */}
 <section className="py-12 sm:py-16">
 <div className="max-w-4xl mx-auto px-6 space-y-12 text-[#5D0F17]/80 leading-relaxed text-sm sm:text-base">

 <div className="space-y-4">
 <p className="text-lg font-serif text-[#5D0F17]">Welcome to VYA!</p>
 <p>
 The following Terms of Service (the &ldquo;Terms&rdquo;) and the VYA Platform&apos;s{" "}
 <Link href="/privacy" className="underline hover:text-[#5D0F17]/60 transition">Privacy Policy</Link>{" "}
 between you and VIA Platform Corporation (&ldquo;VYA&rdquo;) govern your use of and
 access to VYA, including VYA&apos;s website and services (individually and collectively,
 these &ldquo;Service(s)&rdquo;).
 </p>
 <p>
 Your use or access of these Services confirms that you can form a legally binding
 contract with VYA, that you assent to these Terms, and that your continued use or access
 of these Services is conditioned on your continued acceptance and compliance with these
 Terms as set out below. By accessing or using these Services in any manner, you agree to
 be bound by these Terms. If you do not agree to these Terms, you shall not use or access
 these Services.
 </p>
 <p>
 Please read these Terms, the Privacy Policy, and any other agreements referenced in
 these Terms carefully.
 </p>
 </div>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">1. Eligibility to Use Services</h2>
 <p className="mb-4">
 <strong>Users:</strong> In compliance with the requirements of the Children&apos;s
 Online Privacy Protection Act (COPPA), VYA does not collect any information from any
 person under thirteen (13) years of age. If you are younger than age thirteen (13), you
 may not use these Services. Those between the ages of thirteen (13) and eighteen (18)
 (&ldquo;Child User&rdquo;) may use these Services only under the supervision of a parent
 or legal guardian who agrees to be bound by these Terms for the benefit of the Child
 User. If you are a parent or legal guardian agreeing to these Terms for the benefit of
 the Child User, you are fully responsible for the Child User&apos;s use of these Services.
 </p>
 <p>
 <strong>Entities:</strong> If you use these Services on behalf of a company,
 partnership, association, or other entity, you hereby represent that you have the
 capacity to enter into these Terms on behalf of the entity, or that an authorized
 representative of the entity has agreed to bind the entity to these Terms.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">2. Privacy Policy</h2>
 <p>
 Your use of these Services signifies your assent to the Privacy Policy. The Privacy
 Policy includes information on how VYA collects, processes, and discloses data and other
 personal information through these Services. You may access the Privacy Policy here:{" "}
 <Link href="/privacy" className="underline hover:text-[#5D0F17]/60 transition">
 https://vyaplatform.com/privacy
 </Link>
 . Please read the Privacy Policy carefully.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">3. Acceptable Use of Services</h2>
 <p>
 VYA hereby grants you permission to use these Services, provided that such use complies
 with these Terms. You acknowledge and agree that your use of these Services will adhere
 to the following restrictions and obligations.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">4. Prohibited Use of Services</h2>
 <p className="mb-4">You are prohibited from, or assisting other persons in:</p>
 <ol className="list-[lower-alpha] pl-6 space-y-3">
 <li>
 soliciting personal information for commercial or unlawful purposes, including hidden
 pages, links, or images, providing instructional information about illegal activities,
 or which threatens VYA&apos;s relationships with its partners, customers, or suppliers;
 </li>
 <li>
 attempting to conceal or misrepresent the identity of the sender or person submitting
 the information, or otherwise invade someone&apos;s privacy;
 </li>
 <li>disrupting the normal flow of these Services;</li>
 <li>
 transmitting through these Services any information, data, text, files, links, software,
 or other materials that are unlawful, harmful, threatening, abusive, harassing,
 defamatory, vulgar, obscene, pornographic, hateful, racially, ethnically or otherwise
 objectionable, or which may be discriminatory towards a person&apos;s or class of
 people&apos;s race, religion, color, age, ethnicity, national origin, disability,
 physical, or mental characteristics, sexual orientation, gender expression, gender
 identity, family status, medical or genetic condition, personality characteristics, or
 physical appearance, including through the material distortion of the behavior of any
 such person or class of people in a manner that causes or is likely to cause that person
 or class of people physical or psychological harm;
 </li>
 <li>
 using these Services in a manner that is intentionally misleading, false, otherwise
 inappropriate, or harmful to others, including, but not limited to, providing VYA with
 an incorrect name, phone number, email, or other information, regardless of whether the
 content or its dissemination is unlawful;
 </li>
 <li>
 posting or generating content that has any risk or possibility of exploiting, harming,
 or endangering the health or well-being of children or other minors
 (&ldquo;Children&rdquo;), such as images of Children in sexualized costumes, poses, or
 a sexual fetishistic context, or which identifies, directly or indirectly, alleged
 victims of child sexual exploitation, or for the purpose of exploiting, harming or
 attempting to exploit or harm Children in any way;
 </li>
 <li>
 using these Services in such a way that damages the image or rights of VYA, other
 users, or third parties;
 </li>
 <li>
 sending spam or other direct marketing communications or posting, transmitting, or
 linking to any unsolicited advertising, promotional materials, or any other forms of
 solicitation or commercial content;
 </li>
 <li>
 posting or transmitting executable programming of any kind, including viruses, spyware,
 trojan horses, easter eggs, or other forms of computer programming or disabling
 mechanism;
 </li>
 <li>
 using any robot, spider, or other automatic program or device, or manual process to
 monitor, copy, summarize, or otherwise extract information from these Services;
 </li>
 <li>
 intentionally or unintentionally violating, performing, or promoting any applicable
 local, provincial/state, national, or international law, including, but not limited to,
 any regulations having the force of law, and any laws regarding the export of data or
 software to and from the United States or other countries, while using or accessing
 these Services; or
 </li>
 <li>
 engaging in any other conduct that restricts another&apos;s use or enjoyment of these
 Services, or that may harm VYA or its owners.
 </li>
 </ol>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">5. User Accounts</h2>
 <p className="mb-6">
 To purchase items through VYA, you must create a user account
 (&ldquo;User Account(s)&rdquo;) by providing certain required and optional registration
 details or other information to VYA, including your name, phone number, email, and Google
 account information. It is a condition of your continued use of VYA that all the
 information you provide is correct, current, and complete.
 </p>
 <p className="text-xs uppercase tracking-[0.15em] text-[#5D0F17]/50 mb-3">
 Representations and Warranties: Sourcing Program
 </p>
 <p className="text-xs leading-relaxed text-[#5D0F17]/60">
 YOU HEREBY ACKNOWLEDGE THAT YOU ARE USING THE SOURCING PROGRAM AT YOUR OWN RISK. THE
 SOURCING PROGRAM AND RELATED CONTENT ARE PROVIDED &ldquo;AS IS,&rdquo; AND VYA, ITS
 AFFILIATES, AND ITS THIRD-PARTY SERVICE PROVIDERS HEREBY DISCLAIM ANY AND ALL
 WARRANTIES, EXPRESS AND IMPLIED, INCLUDING, BUT NOT LIMITED TO, ANY WARRANTIES OF
 ACCURACY, RELIABILITY, MERCHANTABILITY, NON-INFRINGEMENT, FITNESS FOR A PARTICULAR
 PURPOSE, AND ANY OTHER WARRANTY, CONDITION, GUARANTEE OR REPRESENTATION, EXPRESS OR
 IMPLIED, WHETHER ORAL, IN WRITING OR IN ELECTRONIC FORM. VYA, ITS AFFILIATES, AND ITS
 THIRD-PARTY SERVICE PROVIDERS DO NOT REPRESENT OR WARRANT THAT ACCESS TO THE SOURCING
 PROGRAM WILL BE UNINTERRUPTED OR THAT THERE WILL BE NO FAILURES, ERRORS OR OMISSIONS,
 LOSS OF TRANSMITTED INFORMATION, OR THAT NO VIRUSES OR OTHER MALWARE WILL BE TRANSMITTED
 THROUGH THE SOURCING PROGRAM. FURTHER, VYA MAKES NO REPRESENTATION OR WARRANTY THAT ANY
 ITEM REQUESTED BY A REGISTERED USER THROUGH THE SOURCING PROGRAM WILL BE LOCATED BY A
 PARTNER STORE, THAT THE FINAL PRICE WILL FALL WITHIN THE USER&apos;S ESTIMATED RANGE OR
 PARTNER STORE&apos;S ESTIMATED RANGE, OR THAT THE ITEM WILL BE FIT FOR THE REGISTERED
 USER&apos;S PARTICULAR PURPOSE.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">8. Intellectual Property Rights</h2>
 <p className="mb-4">
 VYA and its entire contents, features, and functionality (including, but not limited to,
 all information, software, text, displays, images, video, and audio, and the design,
 selection, and arrangement thereof) (individually and collectively, the
 &ldquo;Content&rdquo;) are owned by VYA, its licensors, or other providers of such
 material and are protected by applicable United States and international intellectual
 property or proprietary rights laws.
 </p>
 <p>
 You will not use, copy, adapt, modify, prepare derivative works based upon, distribute,
 license, sell, transfer, publicly display, transmit, broadcast, or otherwise exploit
 these Services or Content, except as expressly permitted in these Terms. You have no
 right to sublicense the license rights granted in these Terms. No licenses or rights are
 granted to you by implication or otherwise under any intellectual property rights owned
 or controlled by VYA or its licensors, except for the licenses and rights expressly
 granted in these Terms.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">9. Relationship with Merchants</h2>
 <p className="mb-4">
 VYA does not own any of the merchandise offered through these Services. VYA does not
 directly process payments for or directly hold inventory. All purchases of inventory on
 VYA&apos;s website must be completed directly with the individual store that owns and
 holds the inventory.
 </p>
 <p>
 VYA does not handle shipping, exchanges, or returns of any merchandise offered through
 these Services. Please contact the store where you made your purchase for information on
 shipping, exchanges, and returns.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-6">10. Copyright Infringement</h2>

 <h3 className="font-serif text-[#5D0F17] text-base mb-3">a. Notices of Copyright Infringement</h3>
 <p className="mb-4">
 VYA takes claims of copyright infringement very seriously.
 </p>
 <p className="mb-4">
 VYA will respond to notices of alleged copyright infringement that comply with applicable
 law. If you believe any materials accessible on or from VYA infringe upon your copyright,
 you may request removal of those materials (or access to them) from VYA by submitting
 written notification to VYA&apos;s copyright agent, as designated below. In accordance
 with the Online Copyright Infringement Liability Limitation Act of the Digital Millennium
 Copyright Act (17 U.S.C. &sect; 512) (&ldquo;DMCA&rdquo;), the written notice (the
 &ldquo;DMCA Notice&rdquo;) must include substantially the following:
 </p>
 <ol className="list-[lower-roman] pl-6 space-y-2 mb-6">
 <li>your physical or electronic signature;</li>
 <li>
 identification of the copyrighted work you believe to have been infringed or, if the
 claim involves multiple works on the Website, a representative list of such works;
 </li>
 <li>
 identification of the material you believe to be infringing in a sufficiently precise
 manner to allow VYA to locate that material;
 </li>
 <li>
 adequate information by which VYA can contact you (including your name, postal address,
 telephone number, and, if available, email address);
 </li>
 <li>
 a statement that you have a good faith belief that use of the copyrighted material is
 not authorized by the copyright owner, its agent, or the law;
 </li>
 <li>a statement that the information in the written notice is accurate; and</li>
 <li>
 a statement, under penalty of perjury, that you are authorized to act on behalf of the
 copyright owner.
 </li>
 </ol>
 <p className="mb-4">
 VYA&apos;s designated copyright agent to receive DMCA Notices is:
 </p>
 <div className="pl-4 border-l border-[#5D0F17]/20 text-[#5D0F17]/70 mb-6 space-y-0.5">
 <p>Hana Elster</p>
 <p>VIA Platform Corporation</p>
 <p>131 Continental Drift, Suite 305</p>
 <p>Newark, Delaware 19713</p>
 <a href="mailto:hana@vyaplatform.com" className="underline hover:text-[#5D0F17]/60 transition">
 hana@vyaplatform.com
 </a>
 </div>
 <p className="mb-4">
 If you fail to comply with all the requirements of Section 512(c)(3) of the DMCA, your
 DMCA Notice may be ineffective. Please be aware that if you knowingly materially
 misrepresent that material or activity displayed through these Services is infringing your
 copyright, you may be held liable for damages (including costs and attorneys&apos; fees)
 under Section 512(f) of the DMCA.
 </p>
 <p className="mb-8">
 VYA reserves the sole right to disable or terminate the accounts of users who are repeat
 infringers.
 </p>

 <h3 className="font-serif text-[#5D0F17] text-base mb-3">b. Counter Notices</h3>
 <p className="mb-4">
 If you believe that material you posted on VYA was removed or access to that material was
 disabled by mistake or misidentification, you may file a counter notification with VYA (a
 &ldquo;Counter Notice&rdquo;) by submitting a written notification to VYA&apos;s
 Copyright Agent, as designated above. Pursuant to the DMCA, the Counter Notice must
 substantially include the following information:
 </p>
 <ol className="list-[lower-roman] pl-6 space-y-2 mb-6">
 <li>your physical or electronic signature;</li>
 <li>
 identification of the material that has been removed or to which access has been
 disabled and the location at which the material appeared before it was removed or access
 was disabled;
 </li>
 <li>
 adequate information by which VYA can contact you (including your name, postal address,
 telephone number, and, if available, email address);
 </li>
 <li>
 a statement, made under the penalty of perjury, by you stating that you have a good
 faith belief that the material identified above was removed or disabled due to a mistake
 or misidentification of the material to be removed or disabled; and
 </li>
 <li>
 a statement that you will consent to the jurisdiction of the Federal District Court for
 the judicial district in which your address is located (or, if you reside outside the
 United States, for any judicial district in which the Website may be found) and that you
 will accept service from the person (or agent of that person) who provided VYA with the
 complaint at issue.
 </li>
 </ol>
 <p className="mb-4">
 The DMCA authorizes VYA to restore the removed content if the party filing the original
 DMCA Notice does not file a court action against you within ten (10) business days of
 receiving the copy of your Counter Notice.
 </p>
 <p>
 Please be aware that if you knowingly materially misrepresent that material or activity
 displayed through these Services was removed by mistake or misidentification, you may be
 held liable for damages (including costs and attorneys&apos; fees) under Section 512(f)
 of the DMCA.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">11. Third-Party Content</h2>
 <p className="mb-4">
 While using these Services, VYA may provide you with access to third-party websites,
 information, and services, including, but not limited to, third-party databases,
 networks, servers, software, programs, systems, directories, applications, websites,
 payment processing services, and products. You hereby acknowledge that VYA does not
 control such third-party websites and services, and cannot be held responsible for their
 content, operation, or use. VYA does not give any representation, warranty, or
 endorsement, express or implied, with respect to the legality, accuracy, quality, or
 authenticity of content, information, or services provided by such third-party websites
 and services.
 </p>
 <p className="text-xs leading-relaxed text-[#5D0F17]/60">
 VYA DISCLAIMS ANY AND ALL RESPONSIBILITY OR LIABILITY FOR ANY HARM RESULTING FROM YOUR
 USE OF SUCH THIRD-PARTY WEBSITES AND SERVICES, AND YOU HEREBY IRREVOCABLY WAIVE ANY
 CLAIM AGAINST VYA WITH RESPECT TO THE CONTENT OR OPERATION OF ANY SUCH THIRD-PARTY
 WEBSITES AND SERVICES.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">12. Representations and Warranties</h2>
 <p className="text-xs leading-relaxed text-[#5D0F17]/60">
 YOU HEREBY ACKNOWLEDGE THAT YOU ARE USING THESE SERVICES AT YOUR OWN RISK. THESE
 SERVICES AND CONTENT ARE PROVIDED &ldquo;AS IS,&rdquo; AND VYA, ITS AFFILIATES, AND ITS
 THIRD-PARTY SERVICE PROVIDERS HEREBY DISCLAIM ANY AND ALL WARRANTIES, EXPRESS AND
 IMPLIED, INCLUDING, BUT NOT LIMITED TO, ANY WARRANTIES OF ACCURACY, RELIABILITY,
 MERCHANTABILITY, NON-INFRINGEMENT, FITNESS FOR A PARTICULAR PURPOSE, AND ANY OTHER
 WARRANTY, CONDITION, GUARANTEE OR REPRESENTATION, EXPRESS OR IMPLIED, WHETHER ORAL, IN
 WRITING OR IN ELECTRONIC FORM. VYA, ITS AFFILIATES, AND ITS THIRD-PARTY SERVICE
 PROVIDERS DO NOT REPRESENT OR WARRANT THAT ACCESS TO THESE SERVICES WILL BE
 UNINTERRUPTED OR THAT THERE WILL BE NO FAILURES, ERRORS OR OMISSIONS, LOSS OF
 TRANSMITTED INFORMATION, OR THAT NO VIRUSES OR OTHER MALWARE WILL BE TRANSMITTED THROUGH
 THESE SERVICES.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">13. Limitation of Liability</h2>
 <p className="text-xs leading-relaxed text-[#5D0F17]/60">
 TO THE FULLEST EXTENT PROVIDED BY LAW, IN NO EVENT WILL THE COLLECTIVE LIABILITY OF VYA
 AND ITS SUBSIDIARIES AND AFFILIATES, AND THEIR LICENSORS, SERVICE PROVIDERS, EMPLOYEES,
 AGENTS, OFFICERS, AND DIRECTORS, TO ANY PARTY (REGARDLESS OF THE FORM OF ACTION,
 WHETHER IN CONTRACT, TORT, STATUTORY, OR OTHERWISE) EXCEED TWENTY DOLLARS ($20) OR THE
 AMOUNT YOU HAVE PAID TO VYA AND ITS SUBSIDIARIES AND AFFILIATES FOR THE APPLICABLE
 CONTENT, PRODUCT, OR SERVICE OUT OF WHICH LIABILITY AROSE.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">14. Indemnification</h2>
 <p>
 To the fullest extent allowed by applicable law, you agree to indemnify and hold VYA,
 its affiliates, officers, agents, employees, and partners harmless from and against any
 and all claims, liabilities, damages (actual and consequential), losses and expenses
 (including attorneys&apos; fees) arising from or in any way related to any third party
 claims relating to your (a) use of these Services (including any actions taken by a third
 party using your account); and (b) violation of these Terms.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">15. Termination and Monitoring</h2>
 <p className="mb-4">VYA reserves the right to, in its sole discretion:</p>
 <ol className="list-[lower-alpha] pl-6 space-y-2 mb-6">
 <li>remove any user accounts or user content for any reason;</li>
 <li>take any action with respect to any user content that VYA deems necessary or appropriate;</li>
 <li>
 take any appropriate legal actions, including, but not limited to, referral to law
 enforcement for any illegal or unauthorized use of VYA or these Services; and
 </li>
 <li>
 terminate or suspend your use or access to all or part of these Services for any reason,
 including violation of these Terms, violation of any applicable laws, or to protect the
 safety or property of other users, VYA, or third parties.
 </li>
 </ol>
 <p>
 You may voluntarily choose to delete your account with VYA. Upon receipt of your request
 to delete your account, VYA will use commercially reasonable efforts to locate and remove
 your account and associated information within a commercially reasonable time. Please
 note that any information that you have submitted may not be removable.
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-4">16. Modification</h2>
 <p className="mb-4">
 VYA reserves the sole right to modify these Terms at any time, without prior notice, and
 at its sole discretion. The date of the last modification will be posted at the beginning
 of these Terms. By continuing to access or use these Services, you agree to be bound by
 these Terms as modified. It is your sole responsibility to check for updates to these
 Terms.
 </p>
 <p>
 Any modifications to these Terms or other communications required or permitted hereunder
 will be given in writing either through the email you provide to VYA or a posting to
 VYA&apos;s website:{" "}
 <a href="https://vyaplatform.com" className="underline hover:text-[#5D0F17]/60 transition">
 https://vyaplatform.com
 </a>
 .
 </p>
 </section>

 <section>
 <h2 className="text-xl font-serif text-[#5D0F17] mb-6">17. Miscellaneous</h2>
 <div className="space-y-6">
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">a. No Waiver</h3>
 <p>
 VYA&apos;s failure to exercise or enforce any right or provision of these Terms shall
 not constitute a waiver of such right or provision. VYA may only waive a right or
 provision of these Terms through express written consent.
 </p>
 </div>
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">b. Severability</h3>
 <p>
 If any provision(s) of these Terms is found by a court of competent jurisdiction to be
 invalid, the parties agree that the court should endeavor to give effect to the
 parties&apos; intent as reflected in the provision, and the other provisions of these
 Terms shall remain in full force and effect.
 </p>
 </div>
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">c. Entire Agreement</h3>
 <p>
 These Terms reflect the entire agreement between you and VYA related to the subject
 matter hereof and supersede all prior agreements, representations, statements, and
 understandings of the parties.
 </p>
 </div>
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">d. Assignment</h3>
 <p>
 You may not assign or transfer these Terms, by operation of law or otherwise, without
 VYA&apos;s prior written consent. Any attempt by you to assign or transfer these Terms
 without such consent will be null and of no effect. VYA may assign or transfer these
 Terms, at its sole discretion, without restriction. Subject to the foregoing, these
 Terms will bind and inure to the benefit of the parties, their successors and permitted
 assigns. These Terms do not and are not intended to confer any rights or remedies upon
 any person other than the parties.
 </p>
 </div>
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">e. Governing Law</h3>
 <p>
 These Terms and any further rules, policies, or guidelines incorporated by reference
 herein are governed by the laws of the State of Maryland, United States.
 </p>
 </div>
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">f. Disputes</h3>
 <p>
 Any action relating to the use of these Services or Terms must be brought in a state or
 federal court in Montgomery County, Maryland, United States. Both parties agree to submit
 to the exclusive personal jurisdiction and venue of such courts.
 </p>
 </div>
 <div>
 <h3 className="font-medium text-[#5D0F17] mb-1">g. Contact Us</h3>
 <p>
 If you have any questions about these Services or VYA, please contact VYA at{" "}
 <a href="mailto:hana@vyaplatform.com" className="underline hover:text-[#5D0F17]/60 transition">
 hana@vyaplatform.com
 </a>
 .
 </p>
 </div>
 </div>
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
