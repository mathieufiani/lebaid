"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import CategoryFilter from "@/components/CategoryFilter";
import LanguageToggle from "@/components/LanguageToggle";
import ResourceCard from "@/components/ResourceCard";
import BottomSheet from "@/components/BottomSheet";
import SubmitFAB from "@/components/SubmitFAB";
import SubmitModal from "@/components/SubmitModal";
import { translations, type Lang } from "@/lib/i18n";
import type { Resource, Category, FilterTab } from "@/lib/supabase";

// Leaflet must be imported client-side only (uses window)
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="text-gray-500 text-sm">Chargement de la carte...</div>
    </div>
  ),
});

/** Derive a Category from a resource when displaying in "all" mode. */
function inferCategory(resource: Resource): Category {
  // Hospital has emergency_available field
  if ("emergency_available" in resource) return "hospitals";
  // Shelter has capacity / current_occupancy
  if ("capacity" in resource) return "shelters";
  // Pharmacy has no organization or schedule
  if (!("organization" in resource) && !("schedule" in resource) && !("emergency_available" in resource) && !("capacity" in resource)) {
    // FoodPoint has status "active" | "inactive"; Pharmacy has "open" | "closed"
    // Both are ambiguous — check for governorate being a string (both have it).
    // Use schedule as the differentiator: FoodPoint has schedule, Pharmacy does not.
    return "pharmacy";
  }
  return "food";
}

export default function MapPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [resources, setResources] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const t = translations[lang];

  // Get user geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
      },
      () => setLocationError(true),
      { timeout: 10000 }
    );
  }, []);

  // Fetch resources when filterTab or location changes
  useEffect(() => {
    const params = new URLSearchParams({ radius: "15" });
    if (userLat !== null) params.set("lat", String(userLat));
    if (userLng !== null) params.set("lng", String(userLng));

    setLoading(true);

    if (filterTab === "all") {
      Promise.all([
        fetch(`/api/shelters?${params}`).then(r => r.json()),
        fetch(`/api/food?${params}`).then(r => r.json()),
        fetch(`/api/hospitals?${params}`).then(r => r.json()),
        fetch(`/api/pharmacies?${params}`).then(r => r.json()),
      ])
        .then(([s, f, h, p]) => {
          setResources([
            ...(s.data ?? []),
            ...(f.data ?? []),
            ...(h.data ?? []),
            ...(p.data ?? []),
          ]);
        })
        .catch(() => setResources([]))
        .finally(() => setLoading(false));
    } else {
      const endpoint =
        filterTab === "shelters"
          ? "/api/shelters"
          : filterTab === "food"
          ? "/api/food"
          : filterTab === "hospitals"
          ? "/api/hospitals"
          : "/api/pharmacies";

      fetch(`${endpoint}?${params}`)
        .then((r) => r.json())
        .then((data) => setResources(data.data ?? []))
        .catch(() => setResources([]))
        .finally(() => setLoading(false));
    }
  }, [filterTab, userLat, userLng]);

  const handleMarkerClick = useCallback((resource: Resource) => {
    setSelected(resource);
  }, []);

  // When filterTab is "all", pass "shelters" as the Map category prop (all markers render as blue).
  // For BottomSheet and ResourceCard, resolve per-resource category.
  const mapCategory: Category = filterTab === "all" ? "shelters" : filterTab;

  function resolveCategory(resource: Resource): Category {
    if (filterTab !== "all") return filterTab;
    return inferCategory(resource);
  }

  return (
    <div className="fixed inset-0 flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-[#CC0001] text-white shadow-sm z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🇱🇧</span>
          <span className="font-bold text-lg">LebAid</span>
        </div>
        <LanguageToggle lang={lang} onChange={setLang} />
      </header>

      {/* Category tabs */}
      <CategoryFilter active={filterTab} onChange={setFilterTab} lang={lang} />

      {/* Map — takes remaining height */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <Map
          resources={resources}
          category={mapCategory}
          userLat={userLat}
          userLng={userLng}
          onMarkerClick={handleMarkerClick}
        />

        {/* Location error banner */}
        {locationError && (
          <div className="absolute top-2 left-2 right-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 z-10">
            {t.enableLocation}
          </div>
        )}
      </div>

      {/* Bottom list — scrollable, shows top 5 nearest */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 max-h-52 overflow-y-auto z-10">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-500 text-sm">
            {t.loading}
          </div>
        ) : resources.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-gray-500 text-sm">
            {t.noResults}
          </div>
        ) : (
          <>
            <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
              {resources.length} {t.nearbyResults}
            </div>
            {resources.slice(0, 5).map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                category={resolveCategory(r)}
                lang={lang}
                onClick={() => setSelected(r)}
              />
            ))}
          </>
        )}
      </div>

      {/* Submit FAB */}
      <SubmitFAB onClick={() => setShowSubmitModal(true)} />

      {/* Bottom sheet detail */}
      {selected && (
        <BottomSheet
          resource={selected}
          category={resolveCategory(selected)}
          lang={lang}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Submit modal */}
      <SubmitModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        lang={lang}
        userLat={userLat}
        userLng={userLng}
      />
    </div>
  );
}
