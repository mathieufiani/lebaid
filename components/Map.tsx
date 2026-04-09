"use client";

import { useEffect, useRef } from "react";
import type { Resource, Category, Shelter, FoodPoint, Hospital } from "@/lib/supabase";

// Leaflet must be imported client-side only
let L: typeof import("leaflet");

type MapProps = {
  resources: Resource[];
  category: Category;
  userLat: number | null;
  userLng: number | null;
  onMarkerClick: (resource: Resource) => void;
};

const categoryColors: Record<Category, string> = {
  shelters: "#3B82F6",  // blue
  food: "#F59E0B",      // amber
  hospitals: "#EF4444", // red
  pharmacy: "#10B981",  // green
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
  return (resource as Hospital).status;
}

function isOpen(resource: Resource, category: Category): boolean {
  const status = getStatus(resource, category);
  return status === "open" || status === "active" || status === "operational";
}

export default function Map({ resources, category, userLat, userLng, onMarkerClick }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").Layer[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    async function initMap() {
      L = (await import("leaflet")).default;

      // Already initialized (StrictMode double-mount)
      if ((mapRef.current as unknown as { _leaflet_id?: number })?._leaflet_id) return;

      // Fix Leaflet default icon paths
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [33.8547, 35.8623], // Lebanon center
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
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update user location marker
  useEffect(() => {
    if (!mapInstanceRef.current || userLat === null || userLng === null) return;

    async function addUserMarker() {
      if (!L) L = (await import("leaflet")).default;
      const map = mapInstanceRef.current!;

      const userIcon = L.divIcon({
        html: `<div style="width:16px;height:16px;background:#CC0001;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px #CC0001"></div>`,
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      L.marker([userLat!, userLng!], { icon: userIcon })
        .addTo(map)
        .bindPopup("📍 Vous êtes ici");

      map.setView([userLat!, userLng!], 13);
    }

    addUserMarker();
  }, [userLat, userLng]);

  // Update resource markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    async function updateMarkers() {
      if (!L) L = (await import("leaflet")).default;
      const map = mapInstanceRef.current!;

      // Clear old markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      const color = categoryColors[category];
      const emoji = categoryEmojis[category];

      resources.forEach((resource) => {
        const open = isOpen(resource, category);
        const icon = L.divIcon({
          html: `<div style="width:36px;height:36px;background:${open ? color : "#9CA3AF"};border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px">${emoji}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([resource.lat, resource.lng], { icon })
          .addTo(map)
          .on("click", () => onMarkerClick(resource));

        markersRef.current.push(marker);
      });
    }

    updateMarkers();
  }, [resources, category, onMarkerClick]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
