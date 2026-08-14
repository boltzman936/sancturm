// A term's label is "1st Year - Semester 1" — everywhere that only
// needs the year part (page subtitles, filter dropdowns coarser than
// an exact semester) shortens it to "1st Year" this same way. One
// shared place so a label-format change only needs fixing once.
export function shortTermLabel(term: { label: string } | null | undefined): string {
  return term?.label.split(" - ")[0] ?? "";
}
