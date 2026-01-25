"use client";

import { useState } from "react";

type FAQ = {
  q: string;
  a: string;
};

export default function FAQAccordion({ faqs }: { faqs: FAQ[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-4 sm:space-y-6">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;

        return (
          <div
            key={faq.q}
            className="border-b border-black/20 pb-4 sm:pb-6"
          >
            <button
              onClick={() =>
                setOpenIndex(isOpen ? null : index)
              }
              className="w-full flex items-center justify-between text-left group py-2 min-h-[48px]"
            >
              <h3 className="text-lg sm:text-xl font-serif transition-opacity group-hover:opacity-70 pr-4">
                {faq.q}
              </h3>

              <span
                className={`text-2xl leading-none transition-transform duration-300 flex-shrink-0 w-8 h-8 flex items-center justify-center ${
                  isOpen ? "rotate-45" : "rotate-0"
                }`}
              >
                +
              </span>
            </button>

            {/* Animated answer */}
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isOpen
                  ? "grid-rows-[1fr] opacity-100 mt-2 sm:mt-4"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p
                  className={`text-gray-700 max-w-3xl text-sm sm:text-base transition-all duration-300 ease-in-out ${
                    isOpen ? "translate-y-0" : "-translate-y-2"
                  }`}
                >
                  {faq.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

