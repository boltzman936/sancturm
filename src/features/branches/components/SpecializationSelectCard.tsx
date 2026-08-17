"use client";

import { useSpecializations } from "@/features/branches/queries";
import { SelectCard } from "@/components/shared/SelectCard";

export function SpecializationSelectCard({
  branchId,
  onSelect,
  className,
}: {
  branchId: string;
  onSelect: (slug: string) => void;
  className?: string;
}) {
  // Same reasoning as BranchSelectCard's own useBranches() call — reads
  // from the `specializations` table, not a hardcoded list, so a new
  // CSE specialization shows up here with zero code change.
  // IntroExperience prefetches this for every has_specializations
  // branch the moment the branch list itself resolves, so by the time
  // a visitor picks CSE this is usually already cached too.
  const { data: specializations, isLoading, isError, refetch } = useSpecializations(branchId);

  return (
    <SelectCard
      title="select your specialization"
      items={specializations}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      onSelect={(specialization) => onSelect(specialization.slug)}
      getKey={(specialization) => specialization.slug}
      getLabel={(specialization) => specialization.name}
      skeletonCount={3}
      loadingLabel="Loading specializations"
      errorLabel="Couldn't load specializations."
      className={className}
    />
  );
}
