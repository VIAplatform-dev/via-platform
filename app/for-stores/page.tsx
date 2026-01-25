export default function ForStoresPage() {
  return (
    <main className="bg-white min-h-screen">

      {/* HEADER */}
      <section className="bg-[#f7f6f3] py-20 sm:py-32">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif mb-4 sm:mb-6">
            Partner with VIA
          </h1>
          <p className="text-base sm:text-lg text-black max-w-2xl mx-auto">
            We work with independent vintage & resale stores to help them reach
            customers nationwide — without changing how they run their business.
          </p>
        </div>
      </section>

      {/* FORM */}
      <section className="py-16 sm:py-32">
        <div className="max-w-xl mx-auto px-6">

          <form
            action="https://formspree.io/f/mpqqzgeb"
            method="POST"
            className="space-y-8 sm:space-y-12"
          >

            {/* Store Name */}
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
                Store Name
              </label>
              <input
                type="text"
                name="store_name"
                required
                className="w-full border-b border-black bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
                Website / Instagram
              </label>
              <input
                type="text"
                name="website"
                className="w-full border-b border-black bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
                Store Location
              </label>
              <input
                type="text"
                name="location"
                required
                className="w-full border-b border-black bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
              />
            </div>

            {/* Inventory Size */}
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
                Approximate Inventory Size
              </label>
              <select
                name="inventory_size"
                required
                className="w-full border-b border-black bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
              >
                <option value="">Select one</option>
                <option value="under-500">Under 500 items</option>
                <option value="500-2000">500 – 2,000 items</option>
                <option value="2000+">2,000+ items</option>
              </select>
            </div>

            {/* Ecommerce */}
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
                Do you currently sell online?
              </label>
              <select
                name="sells_online"
                required
                className="w-full border-b border-black bg-transparent py-3 text-base focus:outline-none min-h-[48px]"
              >
                <option value="">Select one</option>
                <option value="yes-own-site">Yes — my own site</option>
                <option value="yes-marketplace">Yes — marketplace only</option>
                <option value="no">No</option>
              </select>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="block text-sm uppercase tracking-wide mb-2 sm:mb-3">
                Anything else you'd like us to know?
              </label>
              <textarea
                name="notes"
                rows={4}
                className="w-full border-b border-black bg-transparent py-3 text-base focus:outline-none resize-none"
              />
            </div>

            {/* Submit */}
            <div className="pt-8 sm:pt-12">
              <button
                type="submit"
                className="w-full border border-black py-4 min-h-[52px] text-sm uppercase tracking-wide hover:bg-black hover:text-white transition"
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

