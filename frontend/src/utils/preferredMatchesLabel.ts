const PREFERRED_GENDER_LABELS: Record<string, string> = {
  Man: "Men",
  Woman: "Women",
  Everyone: "Everyone",
};

/** Human-readable label for who someone wants to connect with (browse / match cards). */
export function formatPreferredMatchesFromGenders(genders: string[] | null | undefined): string {
  if (!genders?.length) return "Everyone";
  const arr = genders.filter((g) => g === "Man" || g === "Woman" || g === "Everyone");
  if (!arr.length || arr.includes("Everyone")) return "Everyone";
  return arr.map((g) => PREFERRED_GENDER_LABELS[g] ?? g).join(", ");
}
