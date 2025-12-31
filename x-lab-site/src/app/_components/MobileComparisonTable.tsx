"use client";

import { useState } from "react";
import Image from "next/image";

type ComparisonRow = {
  label: string;
  type: "boolean" | "text";
  xlab: boolean | string;
  cantosub: boolean | string;
  subanana: boolean | string;
};

type ComparisonColumns = {
  xlab: string;
  cantosub: string;
  subanana: string;
};

type TabKey = "xlab" | "cantosub" | "subanana";

const tabs: { key: TabKey; icon?: string; alt: string }[] = [
  { key: "xlab", alt: "X-Lab" },
  { key: "cantosub", icon: "/brands/cantosub.png", alt: "CantoSub" },
  { key: "subanana", icon: "/brands/subanana.png", alt: "Subanana" },
];

export default function MobileComparisonTable({
  columns,
  rows,
}: {
  columns: ComparisonColumns;
  rows: ComparisonRow[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("xlab");

  const getSlidePosition = () => {
    switch (activeTab) {
      case "xlab": return "left-1";
      case "cantosub": return "left-[calc(33.333%+1px)]";
      case "subanana": return "left-[calc(66.666%+1px)]";
    }
  };

  const renderMark = (value: boolean) => (
    <span
      className={[
        "text-base font-semibold",
        value ? "text-emerald-400" : "text-rose-400",
      ].join(" ")}
      aria-label={value ? "Yes" : "No"}
    >
      {value ? "✓" : "✗"}
    </span>
  );

  const getValue = (row: ComparisonRow) => {
    const value = row[activeTab];
    if (row.type === "boolean") {
      return renderMark(value as boolean);
    }
    return <span className="text-sm">{value as string}</span>;
  };

  return (
    <div className="mt-6">
      {/* Segmented Tab Switcher */}
      <div className="relative flex rounded-full border border-x-line bg-x-surface p-1">
        {/* Sliding Background */}
        <div
          className={`absolute top-1 bottom-1 w-[calc(33.333%-3px)] rounded-full bg-x-accent/20 border border-x-accent/40 transition-all duration-300 ease-out ${getSlidePosition()}`}
        />

        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-xs font-medium transition-colors duration-300 ${
              activeTab === tab.key
                ? "text-x-accent"
                : "text-x-soft hover:text-x-muted"
            }`}
          >
            {tab.icon && (
              <span className={`flex items-center justify-center rounded ${tab.key === 'subanana' ? 'bg-white/90 p-0.5' : ''}`}>
                <Image
                  src={tab.icon}
                  alt={tab.alt}
                  width={14}
                  height={14}
                  className="rounded-sm"
                />
              </span>
            )}
            <span className="truncate">{columns[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Comparison Rows */}
      <div className="mt-4 space-y-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg bg-x-surface/60 backdrop-blur-sm px-4 py-3"
          >
            <span className="text-sm font-medium text-x-text">{row.label}</span>
            {getValue(row)}
          </div>
        ))}
      </div>
    </div>
  );
}
