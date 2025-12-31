"use client";

import { useState } from "react";
import Link from "next/link";

type PlanType = "free" | "premium";

export default function MobilePricingCard({
  freeFeatures,
  premiumFeatures,
  translations,
  contactPath,
}: {
  freeFeatures: string[];
  premiumFeatures: string[];
  translations: {
    freeTag: string;
    freeTitle: string;
    freeDesc: string;
    freeCta: string;
    premiumTag: string;
    premiumPrice: string;
    premiumPriceUnit: string;
    premiumDesc: string;
    premiumCta: string;
  };
  contactPath: string;
}) {
  const [activePlan, setActivePlan] = useState<PlanType>("premium");

  return (
    <div className="relative rounded-[30px] border border-x-accent/40 bg-x-surface-2 p-6 shadow-deep">
      {/* Segmented Toggle Switch */}
      <div className="mb-5 flex justify-center">
        <div className="relative flex rounded-full border border-x-line bg-x-surface p-1">
          {/* Sliding Background */}
          <div
            className={`absolute top-1 bottom-1 w-[calc(50%-2px)] rounded-full bg-x-accent/20 border border-x-accent/40 transition-all duration-300 ease-out ${
              activePlan === "premium" ? "left-1" : "left-[calc(50%+1px)]"
            }`}
          />

          {/* Premium Button */}
          <button
            onClick={() => setActivePlan("premium")}
            className={`relative z-10 px-5 py-2 text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${
              activePlan === "premium" ? "text-x-accent" : "text-x-soft hover:text-x-muted"
            }`}
          >
            {translations.premiumTag}
          </button>

          {/* Free Button */}
          <button
            onClick={() => setActivePlan("free")}
            className={`relative z-10 px-5 py-2 text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${
              activePlan === "free" ? "text-x-accent" : "text-x-soft hover:text-x-muted"
            }`}
          >
            {translations.freeTag}
          </button>
        </div>
      </div>

      {/* Plan Title/Price */}
      <div className="transition-all duration-300">
        {activePlan === "premium" ? (
          <div className="flex items-baseline gap-1">
            <h3 className="text-3xl font-semibold">{translations.premiumPrice}</h3>
            <span className="text-sm text-x-soft">{translations.premiumPriceUnit}</span>
          </div>
        ) : (
          <h3 className="text-2xl font-semibold">{translations.freeTitle}</h3>
        )}
      </div>

      {/* Plan Description */}
      <p className="mt-2 text-sm text-x-muted">
        {activePlan === "premium" ? translations.premiumDesc : translations.freeDesc}
      </p>

      {/* Features */}
      <div className="mt-5 space-y-3 text-sm text-x-muted">
        {(activePlan === "premium" ? premiumFeatures : freeFeatures).map((item) => (
          <p key={item} className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-400">✓</span>
            <span>{item}</span>
          </p>
        ))}
      </div>

      {/* CTA Button */}
      <div className="mt-6">
        {activePlan === "premium" ? (
          <Link
            href={contactPath}
            className="btn-primary block w-full text-center"
          >
            {translations.premiumCta}
          </Link>
        ) : (
          <button
            disabled
            className="w-full rounded-full border border-x-line bg-x-surface px-6 py-3 text-sm font-medium text-x-soft opacity-60 cursor-not-allowed"
          >
            {translations.freeCta}
          </button>
        )}
      </div>
    </div>
  );
}
