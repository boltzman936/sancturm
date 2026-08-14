// One search box matched against a handful of fields (title,
// description, subject name, formatted date, ...) — every listing
// page builds its own field list (those legitimately differ) but
// shares this join/lowercase/includes primitive.
export function matchesQuery(fields: (string | null | undefined)[], query: string): boolean {
  if (!query.trim()) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
