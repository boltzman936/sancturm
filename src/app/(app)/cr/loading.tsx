export default function CRDashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="h-8 w-56 animate-pulse rounded-md bg-card" />
        <div className="mt-2 h-5 w-72 animate-pulse rounded-md bg-card" />
      </div>
      <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />
      <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
