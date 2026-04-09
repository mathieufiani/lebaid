import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "33.8547");
  const lng = parseFloat(searchParams.get("lng") ?? "35.8623");
  const radiusKm = parseFloat(searchParams.get("radius") ?? "10");
  const status = searchParams.get("status") ?? "open";

  const supabase = createServerClient();

  const radiusMeters = radiusKm * 1000;

  let query = supabase.rpc("get_shelters_nearby", {
    p_lat: lat,
    p_lng: lng,
    p_radius: radiusMeters,
  });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query.order("distance_km", { ascending: true }).limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    meta: { total: data?.length ?? 0, radius_km: radiusKm },
  });
}
