import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role (for API routes)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type Shelter = {
  id: string;
  name: string;
  name_ar: string | null;
  type: "school" | "mosque" | "church" | "community_center" | "other";
  lat: number;
  lng: number;
  distance_km: number;
  capacity: number | null;
  current_occupancy: number | null;
  status: "open" | "full" | "closed";
  district: string | null;
  governorate: string | null;
  contact_phone: string | null;
  source: string | null;
  last_updated: string;
};

export type FoodPoint = {
  id: string;
  name: string;
  name_ar: string | null;
  organization: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  schedule: string | null;
  status: "active" | "inactive";
  district: string | null;
  governorate: string | null;
  contact_phone: string | null;
  source: string | null;
  last_updated: string;
};

export type Hospital = {
  id: string;
  name: string;
  name_ar: string | null;
  type: "hospital" | "clinic" | "field_clinic";
  lat: number;
  lng: number;
  distance_km: number;
  status: "operational" | "limited" | "closed";
  emergency_available: boolean;
  district: string | null;
  governorate: string | null;
  contact_phone: string | null;
  source: string | null;
  last_updated: string;
};

export type Strike = {
  id: string;
  lat: number;
  lng: number;
  location_name: string | null;
  occurred_at: string;
  description: string | null;
  verified: boolean;
};

export type Pharmacy = {
  id: string;
  name: string;
  name_ar: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  status: "open" | "closed";
  district: string | null;
  governorate: string;
  contact_phone: string | null;
  last_updated: string;
};

export type Submission = {
  id: string;
  type: "shelter" | "food" | "health" | "pharmacy" | "other";
  name: string | null;
  name_ar: string | null;
  lat: number;
  lng: number;
  governorate: string;
  district: string | null;
  contact_phone: string | null;
  notes: string | null;
  submitter_email: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
};

export type Resource = Shelter | FoodPoint | Hospital | Pharmacy;
export type Category = "shelters" | "food" | "hospitals" | "pharmacy";
export type FilterTab = "all" | Category;
