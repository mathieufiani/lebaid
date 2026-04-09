import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "33.8547");
  const lng = parseFloat(searchParams.get("lng") ?? "35.8623");
  const radiusKm = parseFloat(searchParams.get("radius") ?? "10");

  const supabase = createServerClient();

  const { data, error } = await supabase
    .rpc("get_food_nearby", {
      p_lat: lat,
      p_lng: lng,
      p_radius: radiusKm * 1000,
    })
    .order("distance_km", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    meta: { total: data?.length ?? 0, radius_km: radiusKm },
  });
}
