import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const hours = parseInt(searchParams.get("hours") ?? "24", 10);

  const supabase = createServerClient();

  const since = new Date(Date.now() - hours * 3600000).toISOString();

  const { data, error } = await supabase
    .from("strikes")
    .select("id, location_name, occurred_at, description, verified")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
