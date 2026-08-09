export default function ManageLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="h-8 w-40 animate-pulse rounded-md bg-card" />
        <div className="mt-2 h-5 w-80 animate-pulse rounded-md bg-card" />
      </div>
      <div className="h-40 animate-pulse rounded-lg border border-border bg-card/40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
