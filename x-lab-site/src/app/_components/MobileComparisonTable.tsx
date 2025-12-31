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

const tabs: { key: TabKey; icon: string; alt: string }[] = [
  { key: "xlab", icon: "/x-lab-mark.svg", alt: "X-Lab" },
  { key: "cantosub", icon: "/brands/cantosub.png", alt: "CantoSub AI" },
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
      {/* Tab Switcher */}
      <div className="flex rounded-xl border border-x-line bg-x-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all",
              activeTab === tab.key
                ? tab.key === "xlab"
                  ? "bg-x-accent/15 text-x-accent shadow-sm"
                  : "bg-x-surface-2 text-x-text"
                : "text-x-soft hover:text-x-muted",
            ].join(" ")}
          >
            <Image src={tab.icon} alt={tab.alt} width={16} height={16} />
            <span className="truncate">{columns[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Comparison Rows */}
      <div className="mt-4 space-y-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className={[
              "flex items-center justify-between rounded-lg px-4 py-3",
              activeTab === "xlab" ? "bg-x-accent/[0.06]" : "bg-x-surface",
            ].join(" ")}
          >
            <span className="text-sm font-medium text-x-text">{row.label}</span>
            {getValue(row)}
          </div>
        ))}
      </div>
    </div>
  );
}
