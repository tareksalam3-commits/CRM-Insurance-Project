export function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <div className="h-6 w-32 bg-secondary-200 rounded-md animate-pulse" />
        <div className="h-4 w-48 bg-secondary-100 rounded-md animate-pulse mt-2" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi-card animate-pulse">
            <div className="h-3.5 w-20 bg-secondary-200 rounded" />
            <div className="h-6 w-14 bg-secondary-200 rounded mt-3" />
          </div>
        ))}
      </div>
      <div className="card">
        <div className="h-4 w-24 bg-secondary-200 rounded animate-pulse mb-4" />
        <div className="h-3 w-full bg-secondary-100 rounded-full animate-pulse mb-6" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-secondary-50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="h-4 w-24 bg-secondary-200 rounded animate-pulse mb-4" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 bg-secondary-50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
