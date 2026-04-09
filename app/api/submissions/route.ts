import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { isInLebanon, sanitizeText, SUBMISSION_TYPES, GOVERNORATES } from "@/lib/validation";

export async function POST(req: NextRequest) {
  // Get real IP (Vercel edge)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Rate limit
  const { success, remaining } = await checkRateLimit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "Trop de signalements. Réessayez dans une heure.", code: "RATE_LIMIT" },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide.", code: "INVALID" }, { status: 400 });
  }

  const { type, name, name_ar, lat, lng, governorate, district, contact_phone, notes, submitter_email } = body;

  // Validate type
  if (!type || !SUBMISSION_TYPES.includes(type as never)) {
    return NextResponse.json({ error: "Type invalide.", code: "INVALID" }, { status: 400 });
  }

  // Validate coordinates
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (isNaN(latNum) || isNaN(lngNum) || !isInLebanon(latNum, lngNum)) {
    return NextResponse.json(
      { error: "Coordonnées hors du Liban ou invalides.", code: "INVALID" },
      { status: 400 }
    );
  }

  // Validate governorate
  if (!governorate || !GOVERNORATES.includes(governorate as never)) {
    return NextResponse.json({ error: "Gouvernorat requis.", code: "INVALID" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.from("submissions").insert({
    type,
    name: name ? sanitizeText(String(name), 100) : null,
    name_ar: name_ar ? sanitizeText(String(name_ar), 100) : null,
    lat: latNum,
    lng: lngNum,
    governorate: String(governorate),
    district: district ? sanitizeText(String(district), 100) : null,
    contact_phone: contact_phone ? sanitizeText(String(contact_phone), 20) : null,
    notes: notes ? sanitizeText(String(notes), 500) : null,
    submitter_email: submitter_email ? String(submitter_email).slice(0, 200) : null,
    submitter_ip: ip,
    status: "pending",
  }).select("id").single();

  if (error) {
    console.error("Submission insert error:", error);
    return NextResponse.json({ error: "Erreur serveur.", code: "SERVER_ERROR" }, { status: 500 });
  }

  // TODO: Send email notification to admin (Phase 3)

  return NextResponse.json({ id: data.id, status: "pending" }, { status: 201 });
}
