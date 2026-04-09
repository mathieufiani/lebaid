"use client";

import { translations, type Lang } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import type { Resource, Category, Shelter, FoodPoint, Hospital, Pharmacy } from "@/lib/supabase";

type BottomSheetProps = {
  resource: Resource | null;
  category: Category;
  lang: Lang;
  onClose: () => void;
};

function timeAgo(dateStr: string, lang: Lang): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor(diff / 60000);
  if (hours > 24) return `${Math.floor(hours / 24)}j`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
}

function getEmoji(category: Category): string {
  const map: Record<Category, string> = { shelters: "🏠", food: "🍞", hospitals: "🏥", pharmacy: "💊" };
  return map[category];
}

export default function BottomSheet({ resource, category, lang, onClose }: BottomSheetProps) {
  const t = translations[lang];
  const isRtl = lang === "ar";

  if (!resource) return null;

  const name = (isRtl && resource.name_ar) ? resource.name_ar : resource.name;

  const status =
    category === "shelters"
      ? (resource as Shelter).status
      : category === "food"
      ? (resource as FoodPoint).status
      : category === "pharmacy"
      ? (resource as Pharmacy).status
      : (resource as Hospital).status;

  const phone = resource.contact_phone;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${resource.lat},${resource.lng}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-20"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className="fixed bottom-0 left-0 right-0 z-30 bg-white rounded-t-2xl shadow-xl max-h-[80vh] overflow-y-auto"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-8">
          {/* Header */}
          <div className="flex items-start gap-3 mt-2 mb-4">
            <span className="text-3xl">{getEmoji(category)}</span>
            <div className="flex-1">
              <h2 className="font-bold text-lg text-gray-900 leading-tight">{name}</h2>
              <StatusBadge status={status} lang={lang} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none -mt-1"
            >
              ×
            </button>
          </div>

          {/* Details */}
          <div className="space-y-3 text-sm">
            {/* Shelter-specific */}
            {category === "shelters" && (
              <>
                {(resource as Shelter).capacity && (
                  <DetailRow label={t.capacity}>
                    {(resource as Shelter).current_occupancy !== null
                      ? `${(resource as Shelter).current_occupancy}/${(resource as Shelter).capacity}`
                      : `${(resource as Shelter).capacity}`}
                  </DetailRow>
                )}
              </>
            )}

            {/* Food-specific */}
            {category === "food" && (
              <>
                {(resource as FoodPoint).organization && (
                  <DetailRow label={t.organization}>
                    {(resource as FoodPoint).organization!}
                  </DetailRow>
                )}
                {(resource as FoodPoint).schedule && (
                  <DetailRow label={t.schedule}>
                    {(resource as FoodPoint).schedule!}
                  </DetailRow>
                )}
              </>
            )}

            {/* Hospital-specific */}
            {category === "hospitals" && (
              <>
                {(resource as Hospital).emergency_available && (
                  <div className="flex items-center gap-2 text-red-600 font-medium">
                    <span>🚨</span>
                    <span>{t.emergency}</span>
                  </div>
                )}
              </>
            )}

            {/* Common fields */}
            {(resource.district || resource.governorate) && (
              <DetailRow label="📍">
                {[resource.district, resource.governorate].filter(Boolean).join(", ")}
              </DetailRow>
            )}

            {phone && (
              <DetailRow label="📞">{phone}</DetailRow>
            )}

            {"source" in resource && resource.source && (
              <DetailRow label={t.source}>{resource.source as string}</DetailRow>
            )}

            <DetailRow label={t.lastUpdated}>
              il y a {timeAgo(resource.last_updated, lang)}
            </DetailRow>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-6">
            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#CC0001] text-white font-medium"
              >
                <span>📞</span>
                <span>{t.call}</span>
              </a>
            )}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-800 font-medium"
            >
              <span>🗺️</span>
              <span>{t.directions}</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-500 min-w-16">{label}</span>
      <span className="text-gray-900 font-medium">{children}</span>
    </div>
  );
}
