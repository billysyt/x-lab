"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type FAQItem = {
  q: string;
  a: string;
};

function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-x-line bg-x-surface/60 backdrop-blur-sm transition-all duration-300"
        >
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-x-surface-2/50 sm:px-6 sm:py-5"
          >
            <span className="text-sm font-semibold text-x-text sm:text-base">
              {item.q}
            </span>
            <span
              className={`shrink-0 text-x-soft transition-all duration-300 ${
                openIndex === index ? "rotate-180 text-x-accent" : ""
              }`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </span>
          </button>
          <div
            className={`grid transition-all duration-300 ease-out ${
              openIndex === index ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="border-t border-x-line px-5 py-4 sm:px-6 sm:py-5">
                <p className="text-sm leading-relaxed text-x-muted sm:text-base">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FAQPage() {
  const t = useTranslations();
  const questions = t.raw("faq.questions") as FAQItem[];

  return (
    <div className="relative">
      <section className="mx-auto w-[min(800px,92vw)] pt-8 md:pt-16">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("faq.title")}
          </h1>
          <p className="mt-4 text-sm text-x-muted sm:text-base md:text-lg">
            {t("faq.desc")}
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="mt-10 md:mt-14">
          <FAQAccordion items={questions} />
        </div>
      </section>
    </div>
  );
}
