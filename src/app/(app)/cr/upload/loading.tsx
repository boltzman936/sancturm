export default function UploadLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="h-8 w-52 animate-pulse rounded-md bg-card" />
        <div className="mt-2 h-5 w-64 animate-pulse rounded-md bg-card" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-background" />
        ))}
      </div>
    </div>
  );
}
