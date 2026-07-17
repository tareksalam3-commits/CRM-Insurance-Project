// ─── helpers ─────────────────────────────────────────────
export const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

export const monthStartStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

export function achievementColor(rate: number) {
  if (rate >= 100) return 'bg-success-500';
  if (rate >= 50) return 'bg-warning-500';
  return 'bg-error-500';
}
