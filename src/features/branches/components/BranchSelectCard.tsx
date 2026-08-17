"use client";

import { useBranches } from "@/features/branches/queries";
import { SelectCard } from "@/components/shared/SelectCard";

export function BranchSelectCard({
  onSelect,
  className,
}: {
  onSelect: (slug: string) => void;
  className?: string;
}) {
  // Reads from the `branches` table, not a hardcoded list — adding a
  // new branch/department is a database INSERT, nothing here needs to
  // change. IntroExperience prefetches this the moment the intro
  // starts, so by the time this card actually appears (after the
  // typing animation) the data is USUALLY already sitting in cache —
  // but "usually" isn't "always" (a slow or flaky connection can still
  // have this in flight), and rendering nothing but the header with no
  // loading or error state left a real visitor looking at an
  // apparently-broken, empty card with no way forward.
  const { data: branches, isLoading, isError, refetch } = useBranches();

  return (
    <SelectCard
      title="select your branch"
      items={branches}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      onSelect={(branch) => onSelect(branch.slug)}
      getKey={(branch) => branch.slug}
      getLabel={(branch) => branch.name}
      skeletonCount={3}
      loadingLabel="Loading branches"
      errorLabel="Couldn't load branches."
      className={className}
    />
  );
}
