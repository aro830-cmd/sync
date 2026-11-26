// Plain module so server and client components share number formatting.
export const inr = (n?: number | null) => `₹${Math.round(n ?? 0).toLocaleString("en-IN")}`;
/** ₹1.2L / ₹45k style for tight spots. */
export const inrShort = (n: number) => (n >= 100_000 ? `₹${(n / 100_000).toFixed(n % 100_000 ? 1 : 0)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);
