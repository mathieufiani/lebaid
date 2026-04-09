"use client";

import { useEffect, useRef } from "react";
import type { Resource, Category, Shelter, FoodPoint, Hospital, Pharmacy } from "@/lib/supabase";

type MapProps = {
  resources: Resource[];
  category: Category;
  userLat: number | null;
  userLng: number | null;
  onMarkerClick: (resource: Resource) => void;
};

const categoryColors: Record<Category, string> = {
  shelters: "#3B82F6",
  food: "#F59E0B",
  hospitals: "#EF4444",
  pharmacy: "#10B981",
};

const categoryEmojis: Record<Category, string> = {
  shelters: "🏠",
  food: "🍞",
  hospitals: "🏥",
  pharmacy: "💊",
};

function getStatus(resource: Resource, category: Category): string {
  if (category === "shelters") return (resource as Shelter).status;
  if (category === "food") return (resource as FoodPoint).status;
  if (category === "pharmacy") return (resource as Pharmacy).status;
  return (resource as Hospital).status;
}

function isOpen(resource: Resource, category: Category): boolean {
  const status = getStatus(resource, category);
  return status === "open" || status === "active" || status === "operational";
}

export default function Map({ resources, category, userLat, userLng, onMarkerClick }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<import("leaflet").Layer[]>([]);
  const userMarkerRef = useRef<import("leaflet").Layer | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current) return;
    if ((mapRef.current as unknown as { _leaflet_id?: number })._leaflet_id) return;

    let destroyed = false;

    async function initMap() {
      const L = (await import("leaflet")).default;
      if (destroyed) return;

      leafletRef.current = L;

      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [33.8547, 35.8623],
        zoom: 9,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    initMap();

    return () => {
      destroyed = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        leafletRef.current = null;
      }
    };
  }, []);

  // User location marker
  useEffect(() => {
    if (userLat === null || userLng === null) return;

    // Poll until map is ready (handles async init)
    const interval = setInterval(() => {
      const L = leafletRef.current;
      const map = mapInstanceRef.current;
      if (!L || !map) return;

      clearInterval(interval);

      // Remove previous user marker
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
      }

      const userIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#CC0001;border:3px solid white;border-radius:50%;box-shadow:0 0 0 3px rgba(204,0,1,0.3)"></div>`,
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      userMarkerRef.current = L.marker([userLat, userLng], { icon: userIcon })
        .addTo(map)
        .bindPopup("📍 Vous êtes ici");

      map.setView([userLat, userLng], 13);
    }, 100);

    return () => clearInterval(interval);
  }, [userLat, userLng]);

  // Resource markers — re-run whenever resources or category changes
  useEffect(() => {
    // Poll until map and Leaflet are ready
    const interval = setInterval(() => {
      const L = leafletRef.current;
      const map = mapInstanceRef.current;
      if (!L || !map) return;

      clearInterval(interval);

      // Clear old markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      if (resources.length === 0) return;

      resources.forEach((resource) => {
        if (!resource.lat || !resource.lng) return;

        // In "all" mode the category prop is "shelters" fallback — derive color from resource shape
        const resolvedCategory = category;
        const color = categoryColors[resolvedCategory] ?? "#6B7280";
        const emoji = categoryEmojis[resolvedCategory] ?? "📍";
        const open = isOpen(resource, resolvedCategory);

        const icon = L.divIcon({
          html: `<div style="width:32px;height:32px;background:${open ? color : "#9CA3AF"};border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1">${emoji}</div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([resource.lat, resource.lng], { icon })
          .addTo(map)
          .on("click", () => onMarkerClick(resource));

        markersRef.current.push(marker);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [resources, category, onMarkerClick]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
