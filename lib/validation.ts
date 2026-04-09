export const LEBANON_BBOX = {
  latMin: 33.05,
  latMax: 34.69,
  lngMin: 35.10,
  lngMax: 36.62,
} as const;

export const GOVERNORATES = [
  "Beyrouth",
  "Mont-Liban",
  "Liban-Nord",
  "Akkar",
  "Liban-Sud",
  "Nabatieh",
  "Bekaa",
  "Baalbek-Hermel",
] as const;

export type Governorate = typeof GOVERNORATES[number];

export function isInLebanon(lat: number, lng: number): boolean {
  return (
    lat >= LEBANON_BBOX.latMin &&
    lat <= LEBANON_BBOX.latMax &&
    lng >= LEBANON_BBOX.lngMin &&
    lng <= LEBANON_BBOX.lngMax
  );
}

export function sanitizeText(input: string, maxLength = 300): string {
  return input
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[<>&"']/g, "") // strip remaining dangerous chars
    .trim()
    .slice(0, maxLength);
}

export const SUBMISSION_TYPES = ["shelter", "food", "health", "pharmacy", "other"] as const;
export type SubmissionType = typeof SUBMISSION_TYPES[number];
