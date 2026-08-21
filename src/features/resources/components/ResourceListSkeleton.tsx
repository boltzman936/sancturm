import { Skeleton } from "@/components/shared/Skeleton";

// Mirrors ResourceCard's own row shape (rounded-lg border bg-card p-4,
// title line + meta line on the left, icon-button column on the
// right) so the loading state doesn't jump/reflow once real cards
// swap in. Shared by Notes and PYQs — both list resources this way.
export function ResourceListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 lg:gap-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3 max-w-xs" />
            <Skeleton className="h-3 w-1/3 max-w-[10rem]" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
