"use client";

import { translations, type Lang } from "@/lib/i18n";
import type { FilterTab } from "@/lib/supabase";

type CategoryFilterProps = {
  active: FilterTab;
  onChange: (category: FilterTab) => void;
  lang: Lang;
};

const categories: { key: FilterTab; emoji: string }[] = [
  { key: "all", emoji: "🗺️" },
  { key: "shelters", emoji: "🏠" },
  { key: "food", emoji: "🍞" },
  { key: "hospitals", emoji: "🏥" },
  { key: "pharmacy", emoji: "💊" },
];

export default function CategoryFilter({ active, onChange, lang }: CategoryFilterProps) {
  const t = translations[lang];

  const labelMap: Record<FilterTab, string> = {
    all: t.all,
    shelters: t.shelters,
    food: t.food,
    hospitals: t.health,
    pharmacy: t.pharmacy,
  };

  return (
    <div className="flex gap-2 px-4 py-2 bg-white border-b border-gray-100">
      {categories.map(({ key, emoji }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#CC0001] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>{emoji}</span>
            <span className="hidden sm:inline">{labelMap[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
