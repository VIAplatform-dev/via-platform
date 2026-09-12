export default function PartnerWithVYAPage() {
 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">

 {/* Header */}
 <section className="">
 <div className="max-w-4xl mx-auto px-6 py-12 sm:py-20">
 <h1 className="text-2xl sm:text-3xl font-serif mb-2">Partner With VYA</h1>
 <p className="text-sm sm:text-base text-[#5D0F17]/60 max-w-2xl">
 We work with independent vintage &amp; secondhand stores to help them reach customers worldwide — without changing how they run their business.
 </p>
 </div>
 </section>

 {/* Form */}
 <section className="py-12 sm:py-20">
 <div className="max-w-4xl mx-auto px-6">
 <form
 action="https://formspree.io/f/mpqqzgeb"
 method="POST"
 className="max-w-xl space-y-8 sm:space-y-10"
 >

 <div>
 <label htmlFor="store_name" className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
 Store Name
 </label>
 <input
 type="text"
 id="store_name"
         name="store_name"
 required
 className="w-full border-b border-[#5D0F17] bg-transparent py-3 text-base focus:outline-none min-h-[48px] placeholder:text-[#5D0F17]/30"
 />
 </div>

 <div>
 <label htmlFor="website" className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
 Website / Instagram
 </label>
 <input
 type="text"
 id="website"
         name="website"
 className="w-full border-b border-[#5D0F17] bg-transparent py-3 text-base focus:outline-none min-h-[48px] placeholder:text-[#5D0F17]/30"
 />
 </div>

 <div>
 <label htmlFor="location" className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
 Store Location
 </label>
 <input
 type="text"
 id="location"
         name="location"
 required
 className="w-full border-b border-[#5D0F17] bg-transparent py-3 text-base focus:outline-none min-h-[48px] placeholder:text-[#5D0F17]/30"
 />
 </div>

 <div>
 <label htmlFor="inventory_size" className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
 Approximate Inventory Size
 </label>
 <select
 id="inventory_size"
         name="inventory_size"
 required
 className="w-full border-b border-[#5D0F17] bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
 >
 <option value="">Select one</option>
 <option value="under-500">Under 500 items</option>
 <option value="500-2000">500 – 2,000 items</option>
 <option value="2000+">2,000+ items</option>
 </select>
 </div>

 <div>
 <label htmlFor="sells_online" className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
 Do you currently sell online?
 </label>
 <select
 id="sells_online"
         name="sells_online"
 required
 className="w-full border-b border-[#5D0F17] bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
 >
 <option value="">Select one</option>
 <option value="yes-own-site">Yes — my own site</option>
 <option value="yes-marketplace">Yes — marketplace only</option>
 <option value="no">No</option>
 </select>
 </div>

 <div>
 <label htmlFor="notes" className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
 Anything else you&apos;d like us to know?
 </label>
 <textarea
 id="notes"
         name="notes"
 rows={4}
 className="w-full border-b border-[#5D0F17] bg-transparent py-3 text-base focus:outline-none resize-none"
 />
 </div>

 <div className="pt-4">
 <button
 type="submit"
 className="bg-[#5D0F17] text-[#FFFDF8] px-8 py-3 text-sm uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition"
 >
 Submit Application
 </button>
 </div>

 </form>
 </div>
 </section>

 </main>
 );
}
