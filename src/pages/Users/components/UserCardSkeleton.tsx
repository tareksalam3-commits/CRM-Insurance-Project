export function UserCardSkeleton() {
  return (
    <div className="card p-0 overflow-hidden animate-pulse">
      <div className="flex items-start gap-3 p-4">
        <div className="w-14 h-14 rounded-full bg-secondary-200 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="h-4 bg-secondary-200 rounded w-2/3" />
            <div className="h-4 bg-secondary-200 rounded-full w-12" />
          </div>
          <div className="h-4 bg-secondary-200 rounded-full w-20" />
          <div className="h-3 bg-secondary-100 rounded w-1/2 mt-2.5" />
          <div className="h-3 bg-secondary-100 rounded w-3/4" />
        </div>
      </div>
      <div className="flex items-center gap-1 px-2 pb-2 pt-1 border-t border-secondary-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 h-9 rounded-lg bg-secondary-100" />
        ))}
      </div>
    </div>
  );
}
