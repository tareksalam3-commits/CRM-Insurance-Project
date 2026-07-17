export function DetailRow({ label, value, dir }: { label: string; value: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-secondary-500">{label}</span>
      <span className="font-medium text-secondary-900 truncate" dir={dir}>{value}</span>
    </div>
  );
}
