"use client";

import { translations, type Lang } from "@/lib/i18n";

type StatusBadgeProps = {
  status: string;
  lang: Lang;
};

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  open: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  active: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  operational: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
  full: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  limited: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
  closed: { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
  inactive: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

export default function StatusBadge({ status, lang }: StatusBadgeProps) {
  const t = translations[lang];
  const config = statusConfig[status] ?? statusConfig.closed;
  const label = t[status as keyof typeof t] ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {label}
    </span>
  );
}
