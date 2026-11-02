export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-chip bg-elevated/70 ${className ?? ""}`} />;
}

export function SkeletonRows({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={className} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="w-3 h-3 rounded-full" />
          <Skeleton className="h-3 flex-1 max-w-[45%]" />
        </div>
      ))}
    </div>
  );
}
