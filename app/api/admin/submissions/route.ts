import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(_req: NextRequest) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { id, action, reason, edits } = body;

  if (!id || !action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  if (action === "reject") {
    const { error } = await supabase
      .from("submissions")
      .update({
        status: "rejected",
        rejection_reason: reason ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "approve") {
    // Fetch the submission
    const { data: sub, error: fetchErr } = await supabase
      .from("submissions")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    // Merge edits
    const merged = { ...sub, ...edits };

    // Copy to correct table based on type
    const tableMap: Record<string, string> = {
      shelter: "shelters",
      food: "food_points",
      health: "hospitals",
      pharmacy: "pharmacies",
      other: "shelters",
    };
    const targetTable = tableMap[sub.type] ?? "shelters";

    // Build insert payload — location as WKT POINT for PostGIS
    const locationStr = `POINT(${merged.lng} ${merged.lat})`;

    let insertPayload: Record<string, unknown> = {
      name: merged.name,
      name_ar: merged.name_ar,
      location: locationStr,
      governorate: merged.governorate,
      district: merged.district,
      contact_phone: merged.contact_phone,
      source: "crowdsourced",
      last_updated: new Date().toISOString(),
    };

    if (targetTable === "shelters") {
      insertPayload = { ...insertPayload, type: "other", status: "open" };
    } else if (targetTable === "food_points") {
      insertPayload = { ...insertPayload, status: "active" };
    } else if (targetTable === "hospitals") {
      insertPayload = {
        ...insertPayload,
        type: "clinic",
        status: "operational",
        emergency_available: false,
      };
    } else if (targetTable === "pharmacies") {
      insertPayload = { ...insertPayload, status: "open" };
    }

    const { error: insertErr } = await supabase.from(targetTable).insert(insertPayload);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Mark submission as approved
    await supabase
      .from("submissions")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
