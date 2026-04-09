"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Lang } from "@/lib/i18n";
import { translations } from "@/lib/i18n";
import { GOVERNORATES, isInLebanon } from "@/lib/validation";
import type { SubmissionType } from "@/lib/validation";

type FormData = {
  type: SubmissionType | null;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  name: string;
  name_ar: string;
  governorate: string;
  contact_phone: string;
  notes: string;
  submitter_email: string;
};

type Step = 1 | 2 | 3 | "success" | "error" | "ratelimit";

type SubmitModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lang: Lang;
  userLat: number | null;
  userLng: number | null;
};

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

const TYPE_OPTIONS: { value: SubmissionType; emoji: string; fr: string; ar: string }[] = [
  { value: "shelter", emoji: "🏠", fr: "Abri", ar: "ملجأ" },
  { value: "food", emoji: "🍞", fr: "Nourriture", ar: "غذاء" },
  { value: "health", emoji: "🏥", fr: "Santé", ar: "صحة" },
  { value: "pharmacy", emoji: "💊", fr: "Pharmacie", ar: "صيدلية" },
  { value: "other", emoji: "📍", fr: "Autre", ar: "أخرى" },
];

const INITIAL_FORM: FormData = {
  type: null,
  lat: null,
  lng: null,
  locationLabel: "",
  name: "",
  name_ar: "",
  governorate: "",
  contact_phone: "",
  notes: "",
  submitter_email: "",
};

function ProgressBar({ step }: { step: Step }) {
  const pct = step === 1 ? 33 : step === 2 ? 66 : step === 3 ? 100 : 100;
  const label = step === 1 ? "1 / 3" : step === 2 ? "2 / 3" : "3 / 3";
  if (typeof step !== "number") return null;
  return (
    <div className="w-full mb-4">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#CC0001] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function SubmitModal({
  isOpen,
  onClose,
  lang,
  userLat,
  userLng,
}: SubmitModalProps) {
  const t = translations[lang];
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setForm(INITIAL_FORM);
      setGpsLoading(false);
      setGpsError("");
      setSearchQuery("");
      setSearchResults([]);
      setSubmitting(false);
      setSubmitError("");
    }
  }, [isOpen]);

  // Debounced Nominatim search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&countrycodes=lb&format=json&limit=5`;
        const res = await fetch(url, {
          headers: { "Accept-Language": lang === "ar" ? "ar" : "fr" },
        });
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, lang]);

  const handleGPS = useCallback(() => {
    // If user coords are already available from props, use them directly
    if (userLat !== null && userLng !== null) {
      setForm((f) => ({ ...f, lat: userLat, lng: userLng, locationLabel: "" }));
      setGpsError("");
      return;
    }
    if (!navigator.geolocation) {
      setGpsError("Géolocalisation non supportée par votre navigateur.");
      return;
    }
    setGpsLoading(true);
    setGpsError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          locationLabel: "",
        }));
        setGpsLoading(false);
      },
      () => {
        setGpsError(t.locationError);
        setGpsLoading(false);
      },
      { timeout: 10000 }
    );
  }, [userLat, userLng, t.locationError]);

  const handleSelectResult = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setForm((f) => ({ ...f, lat, lng, locationLabel: result.display_name }));
    setSearchResults([]);
    setSearchQuery("");
  };

  const coordsOutsideLebanon =
    form.lat !== null && form.lng !== null && !isInLebanon(form.lat, form.lng);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const body = {
        type: form.type,
        lat: form.lat,
        lng: form.lng,
        name: form.name || null,
        name_ar: form.name_ar || null,
        governorate: form.governorate,
        contact_phone: form.contact_phone || null,
        notes: form.notes || null,
        submitter_email: form.submitter_email || null,
      };
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        setStep("success");
      } else if (res.status === 429) {
        setStep("ratelimit");
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? t.submitError);
        setStep("error");
      }
    } catch {
      setSubmitError(t.submitError);
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.submitPlace}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="bg-white w-full max-w-lg rounded-t-2xl shadow-xl flex flex-col max-h-[92dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-base">
            {typeof step === "number"
              ? [t.step1of3, t.step2of3, t.step3of3][step - 1]
              : step === "success"
              ? t.submitSuccess
              : t.submitPlace}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label={lang === "ar" ? "إغلاق" : "Fermer"}
          >
            ×
          </button>
        </div>

        {typeof step === "number" && (
          <div className="px-5 flex-shrink-0">
            <ProgressBar step={step} />
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* ── STEP 1: Type selection ── */}
          {step === 1 && (
            <div>
              <p className="text-sm text-gray-500 mb-4">{t.chooseType}</p>
              <div className="grid grid-cols-2 gap-3">
                {TYPE_OPTIONS.map((opt, idx) => {
                  const isLast = idx === TYPE_OPTIONS.length - 1;
                  const isSelected = form.type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                      className={`
                        flex flex-col items-center justify-center gap-1 p-4 rounded-xl border-2 transition-all
                        ${isLast ? "col-span-2 sm:col-span-1 sm:col-start-1" : ""}
                        ${
                          isSelected
                            ? "border-[#CC0001] bg-red-50"
                            : "border-gray-200 bg-gray-50 hover:border-gray-300"
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <span className="text-3xl">{opt.emoji}</span>
                      <span className="text-sm font-semibold text-gray-800">{opt.fr}</span>
                      <span className="text-xs text-gray-500" dir="rtl">{opt.ar}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={!form.type}
                className="mt-5 w-full py-3 rounded-xl bg-[#CC0001] text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700 active:scale-95 transition-all"
              >
                {t.next}
              </button>
            </div>
          )}

          {/* ── STEP 2: Location ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">{t.localize}</p>

              {/* GPS button */}
              <button
                onClick={handleGPS}
                disabled={gpsLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-700 hover:border-[#CC0001] hover:text-[#CC0001] transition-all disabled:opacity-50"
              >
                {gpsLoading ? (
                  <span className="text-sm">{t.locating}</span>
                ) : (
                  <>
                    <span className="text-lg">📍</span>
                    <span className="text-sm font-medium">{t.useMyLocation}</span>
                  </>
                )}
              </button>
              {gpsError && (
                <p className="text-xs text-red-600">{gpsError}</p>
              )}

              {/* Text search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchCity}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[#CC0001] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {searchResults.length > 0 && (
                  <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {searchResults.map((r) => (
                      <li key={r.place_id}>
                        <button
                          onClick={() => handleSelectResult(r)}
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 last:border-none"
                        >
                          {r.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Coordinates display */}
              {form.lat !== null && form.lng !== null && (
                <div
                  className={`rounded-xl p-3 text-sm ${
                    coordsOutsideLebanon
                      ? "bg-red-50 border border-red-200 text-red-700"
                      : "bg-green-50 border border-green-200 text-green-700"
                  }`}
                >
                  {coordsOutsideLebanon ? (
                    <p className="font-medium">{t.outsideLebanon}</p>
                  ) : (
                    <>
                      <p className="font-medium text-green-800">
                        {form.locationLabel || `${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`}
                      </p>
                      <p className="text-xs text-green-600 mt-0.5">
                        {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
                >
                  {t.back}
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={
                    form.lat === null || form.lng === null || coordsOutsideLebanon
                  }
                  className="flex-1 py-3 rounded-xl bg-[#CC0001] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700 active:scale-95 transition-all"
                >
                  {t.next}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Details ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Governorate — required */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.governorate} <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.governorate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, governorate: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent bg-white"
                  required
                >
                  <option value="">{t.governorate}…</option>
                  {Array.from(GOVERNORATES).map((gov) => (
                    <option key={gov} value={gov}>
                      {gov}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name FR */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.nameOptional}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t.nameOptional}
                  maxLength={100}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent"
                />
              </div>

              {/* Name AR */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" dir="rtl">
                  الاسم بالعربية (اختياري)
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.name_ar}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name_ar: e.target.value }))
                  }
                  placeholder="الاسم (اختياري)"
                  maxLength={100}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.phoneOptional}
                </label>
                <input
                  type="tel"
                  value={form.contact_phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contact_phone: e.target.value }))
                  }
                  placeholder="+961 …"
                  maxLength={20}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.notesOptional}
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => {
                    if (e.target.value.length <= 300) {
                      setForm((f) => ({ ...f, notes: e.target.value }));
                    }
                  }}
                  placeholder={t.notesOptional}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 text-right mt-1">
                  {form.notes.length} / 300
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.emailOptional}
                </label>
                <input
                  type="email"
                  value={form.submitter_email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, submitter_email: e.target.value }))
                  }
                  placeholder={t.emailOptional}
                  maxLength={200}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0001] focus:border-transparent"
                />
              </div>

              {/* Navigation */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
                >
                  {t.back}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.governorate || submitting}
                  className="flex-1 py-3 rounded-xl bg-[#CC0001] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{t.send}…</span>
                    </>
                  ) : (
                    t.send
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl">
                ✓
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {lang === "ar" ? "شكراً لك!" : "Merci pour votre signalement"}
              </h3>
              <p className="text-sm text-gray-500">
                {lang === "ar"
                  ? "سيتم التحقق منه ونشره قريباً."
                  : "Il sera vérifié et publié sous peu."}
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-8 py-3 rounded-xl bg-[#CC0001] text-white font-semibold hover:bg-red-700 active:scale-95 transition-all"
              >
                {lang === "ar" ? "العودة إلى الخريطة" : "Retour à la carte"}
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === "error" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center text-4xl text-red-600">
                ✕
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {lang === "ar" ? "حدث خطأ" : "Une erreur s'est produite"}
              </h3>
              <p className="text-sm text-red-600">
                {submitError || t.submitError}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
                >
                  {lang === "ar" ? "العودة إلى الخريطة" : "Retour à la carte"}
                </button>
                <button
                  onClick={() => {
                    setSubmitError("");
                    setStep(3);
                  }}
                  className="flex-1 py-3 rounded-xl bg-[#CC0001] text-white font-semibold text-sm hover:bg-red-700 active:scale-95 transition-all"
                >
                  {lang === "ar" ? "إعادة المحاولة" : "Réessayer"}
                </button>
              </div>
            </div>
          )}

          {/* ── RATE LIMIT ── */}
          {step === "ratelimit" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center text-4xl">
                ⚠️
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {lang === "ar" ? "حد الإرسال" : "Limite atteinte"}
              </h3>
              <p className="text-sm text-orange-700">
                {t.submitRateLimit}
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-8 py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 active:scale-95 transition-all"
              >
                {lang === "ar" ? "العودة إلى الخريطة" : "Retour à la carte"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
