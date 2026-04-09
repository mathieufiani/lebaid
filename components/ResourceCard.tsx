"use client";

import { translations, type Lang } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import type { Resource, Category, Shelter, FoodPoint, Hospital, Pharmacy } from "@/lib/supabase";

type ResourceCardProps = {
  resource: Resource;
  category: Category;
  lang: Lang;
  onClick: () => void;
};

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function getEmoji(category: Category): string {
  const map: Record<Category, string> = { shelters: "🏠", food: "🍞", hospitals: "🏥", pharmacy: "💊" };
  return map[category];
}

export default function ResourceCard({ resource, category, lang, onClick }: ResourceCardProps) {
  const t = translations[lang];
  const isRtl = lang === "ar";
  const name = (isRtl && resource.name_ar) ? resource.name_ar : resource.name;

  const status =
    category === "shelters"
      ? (resource as Shelter).status
      : category === "food"
      ? (resource as FoodPoint).status
      : category === "pharmacy"
      ? (resource as Pharmacy).status
      : (resource as Hospital).status;

  return (
    <button
      onClick={onClick}
      dir={isRtl ? "rtl" : "ltr"}
      className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 text-left transition-colors"
    >
      <span className="text-2xl flex-shrink-0">{getEmoji(category)}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate text-sm">{name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <StatusBadge status={status} lang={lang} />
          {resource.district && (
            <span className="text-xs text-gray-500 truncate">{resource.district}</span>
          )}
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500 flex-shrink-0">
        {formatDistance(resource.distance_km)}
      </span>
    </button>
  );
}
