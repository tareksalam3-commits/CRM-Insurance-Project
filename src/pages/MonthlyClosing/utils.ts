// ─── helpers ─────────────────────────────────────────────
export const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

// آخر 6 أرقام فقط من رقم الوثيقة
export const last6 = (policyNumber: string) => {
  const digits = (policyNumber || '').toString();
  return digits.length > 6 ? digits.slice(-6) : digits;
};
