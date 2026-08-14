// A term's label is "1st Year - Semester 1" — everywhere that only
// needs the year part (page subtitles, filter dropdowns coarser than
// an exact semester) shortens it to "1st Year" this same way. One
// shared place so a label-format change only needs fixing once.
export function shortTermLabel(term: { label: string } | null | undefined): string {
  return term?.label.split(" - ")[0] ?? "";
}

// The term's real, ABSOLUTE semester_number (2nd Year is Semester 3/4,
// not 1/2) — a Semester filter must show this, not a per-year-relative
// ordinal, or "3rd Semester" and "1st Semester" both read as "Semester
// 1" once you're not in 1st Year. Deliberately takes the raw number,
// not a term object, so callers can't accidentally pass year_number
// or an index by mistake.
export function ordinalSemesterLabel(semesterNumber: number): string {
  const suffix =
    semesterNumber % 100 >= 11 && semesterNumber % 100 <= 13
      ? "th"
      : semesterNumber % 10 === 1
        ? "st"
        : semesterNumber % 10 === 2
          ? "nd"
          : semesterNumber % 10 === 3
            ? "rd"
            : "th";
  return `${semesterNumber}${suffix} Semester`;
}
