export function UploadProgress({ fraction }: { fraction: number }) {
  const percent = Math.round(fraction * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-mono text-xs text-subtle-foreground">Uploading… {percent}%</p>
    </div>
  );
}
