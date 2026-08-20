export const eur = (n: unknown) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

export const dateFr = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
