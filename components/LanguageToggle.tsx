"use client";

import type { Lang } from "@/lib/i18n";

type LanguageToggleProps = {
  lang: Lang;
  onChange: (lang: Lang) => void;
};

export default function LanguageToggle({ lang, onChange }: LanguageToggleProps) {
  return (
    <button
      onClick={() => onChange(lang === "fr" ? "ar" : "fr")}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium text-white hover:bg-white/20 transition-colors"
      aria-label="Toggle language"
    >
      <span className={lang === "fr" ? "opacity-100" : "opacity-50"}>FR</span>
      <span className="text-white/50">/</span>
      <span className={lang === "ar" ? "opacity-100" : "opacity-50"}>AR</span>
    </button>
  );
}
