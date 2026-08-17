"use client";

import { useCurrentTermsByYear } from "@/features/terms/queries";
import { SelectCard } from "@/components/shared/SelectCard";
import type { AcademicTerm } from "@/types/database";

export function TermSelectCard({
  onSelect,
  className,
}: {
  onSelect: (slug: string) => void;
  className?: string;
}) {
  // Same reasoning as BranchSelectCard's identical change: no loading
  // or error fallback here meant a slow/flaky connection landed on an
  // empty card with just a header and no way forward.
  //
  // useCurrentTermsByYear, not useTerms() — a year can now have
  // multiple terms (Sem 1 and Sem 2, across batches), and this picker
  // still only ever asks "which year", resolving to whichever term is
  // actually current for it. IntroExperience prefetches this exact
  // query during the intro's typing animation, so it's normally
  // already cached by the time this card appears.
  const { data: terms, isLoading, isError, refetch } = useCurrentTermsByYear();

  return (
    <SelectCard<AcademicTerm>
      title="select your year"
      items={terms}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      onSelect={(term) => onSelect(term.slug)}
      getKey={(term) => term.slug}
      // Shown as just "1st Year" — sem isn't asked separately since
      // each year currently maps to exactly one semester (Sem 2/4 come
      // later once these cohorts progress).
      getLabel={(term) => term.label.split(" - ")[0]}
      skeletonCount={2}
      loadingLabel="Loading years"
      errorLabel="Couldn't load years."
      className={className}
    />
  );
}
