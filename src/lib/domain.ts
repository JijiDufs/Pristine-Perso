/* Constantes et calculs métier — partagés client et serveur. */

export const CHANNELS = [
  { id: "vinted", label: "Vinted", fee: 0, titleMax: 60, newUrl: "https://www.vinted.fr/items/new" },
  { id: "leboncoin", label: "leboncoin", fee: 0, titleMax: 50, newUrl: "https://www.leboncoin.fr/deposer-une-annonce" },
  { id: "ebay", label: "eBay", fee: 0.11, titleMax: 80, newUrl: "https://www.ebay.fr/sl/sell" },
] as const;

export const CONDITIONS = [
  { code: "NM", label: "Near Mint", mult: 1.0 },
  { code: "EX", label: "Excellent", mult: 0.85 },
  { code: "GD", label: "Good", mult: 0.7 },
  { code: "LP", label: "Light Played", mult: 0.55 },
  { code: "PL", label: "Played", mult: 0.4 },
];

export const LANGS = ["FR", "EN", "JP", "KR", "CN", "DE", "ES", "IT"];
export const LANG_NAME: Record<string, string> = {
  FR: "français", EN: "anglais", JP: "japonais", KR: "coréen",
  CN: "chinois", DE: "allemand", ES: "espagnol", IT: "italien",
};
export const VARIANTS = ["Normale", "Holo", "Reverse Holo", "Full Art", "Alt Art", "Secrète / Rainbow", "Promo", "1st Edition"];

export const CHECKS = [
  { id: "centering", label: "Centrage", opts: [["Parfait", 0], ["Léger décalage", 1], ["Net décalage", 2]] },
  { id: "edges", label: "Bords", opts: [["Aucun blanchiment", 0], ["Quelques points blancs", 1], ["Blanchiment visible", 2]] },
  { id: "surface", label: "Surface", opts: [["Impeccable", 0], ["Micro-rayures sous lumière", 1], ["Rayures visibles", 2]] },
  { id: "corners", label: "Coins", opts: [["Nets", 0], ["Légèrement émoussés", 1], ["Émoussés ou pliés", 2]] },
  { id: "back", label: "Dos", opts: [["Propre", 0], ["Marques légères", 1], ["Marques nettes", 2]] },
] as const;

export const GRADERS = [
  { id: "pca", label: "PCA", country: "France", frOnly: true, note: "Français, pas de douane, cote solide sur le marché francophone" },
  { id: "psa", label: "PSA", country: "États-Unis", frOnly: false, note: "Référence mondiale, la prime de revente la plus élevée" },
];

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const condMult = (code: string) => CONDITIONS.find((c) => c.code === code)?.mult ?? 1;

export function gradeFromChecks(checks: Record<string, number>): string | null {
  const vals = CHECKS.map((c) => checks?.[c.id]).filter((v) => typeof v === "number") as number[];
  if (vals.length < CHECKS.length) return null;
  const s = vals.reduce((a, b) => a + b, 0);
  if (s === 0) return "NM";
  if (s <= 2) return "EX";
  if (s <= 4) return "GD";
  if (s <= 7) return "LP";
  return "PL";
}

export type Margins = { left: number; right: number; top: number; bottom: number } | null;

export function centeringRatio(m: Margins) {
  if (!m) return null;
  const h = num(m.left) + num(m.right), v = num(m.top) + num(m.bottom);
  if (h <= 0 || v <= 0) return null;
  const hx = (Math.max(num(m.left), num(m.right)) / h) * 100;
  const vx = (Math.max(num(m.top), num(m.bottom)) / v) * 100;
  return { h: hx, v: vx, worst: Math.max(hx, vx) };
}

export const fmtRatio = (r: number) => `${Math.round(r)}/${100 - Math.round(r)}`;

/* Seuils de centrage PSA : le plus grand des deux bords, en % de la marge totale. */
const capFront = (w: number) => (w <= 55 ? 10 : w <= 60 ? 9 : w <= 65 ? 8 : w <= 70 ? 7 : w <= 75 ? 6 : w <= 80 ? 5 : 4);
const capBack = (w: number) => (w <= 75 ? 10 : w <= 90 ? 9 : 7);
const capChecks = (s: number) => [10, 9, 8, 7, 7, 6, 6, 5, 5, 4, 4][Math.min(s, 10)];

export function estimateGrade(card: {
  centering?: { front?: Margins; back?: Margins } | null;
  checks?: Record<string, number> | null;
}) {
  const c = card.centering ?? {};
  const f = centeringRatio(c.front ?? null), b = centeringRatio(c.back ?? null);
  const caps: { v: number; why: string }[] = [];
  if (f) caps.push({ v: capFront(f.worst), why: `le centrage recto (${fmtRatio(f.worst)})` });
  if (b) caps.push({ v: capBack(b.worst), why: `le centrage verso (${fmtRatio(b.worst)})` });
  const vals = CHECKS.map((x) => card.checks?.[x.id]).filter((v) => typeof v === "number") as number[];
  if (vals.length === CHECKS.length) {
    caps.push({ v: capChecks(vals.reduce((a, x) => a + x, 0)), why: "l'état des coins, bords et surface" });
  }
  if (!caps.length) return null;
  const top = Math.min(...caps.map((x) => x.v));
  return { high: top, low: Math.max(1, top - 1), limiter: caps.find((x) => x.v === top)!.why, partial: !f || !b };
}

/* Liens de vérification gratuits : un clic vers la source, aucune API. */
export const VERIFY = [
  { label: "Cardmarket", url: (c: { name?: string; number?: string }) => `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent([c.name, c.number].filter(Boolean).join(" "))}` },
  { label: "eBay FR vendus", url: (c: { name?: string; number?: string }) => `https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(["carte pokemon", c.name, c.number].filter(Boolean).join(" "))}&LH_Sold=1&LH_Complete=1` },
  { label: "PriceCharting", url: (c: { name?: string; number?: string }) => `https://www.pricecharting.com/fr/search-products?type=prices&q=${encodeURIComponent([c.name, c.number].filter(Boolean).join(" "))}` },
];
