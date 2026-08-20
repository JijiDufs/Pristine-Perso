/* Gamification. Les paliers reprennent la hiérarchie de rareté des cartes :
   c'est le langage du domaine, pas un vernis plaqué. */

export const LEVELS = [
  { xp: 0, name: "Commune", color: "#8A94AE" },
  { xp: 100, name: "Peu commune", color: "#6FA8DC" },
  { xp: 260, name: "Rare", color: "#7FE3FF" },
  { xp: 520, name: "Holo", color: "#A98CFF" },
  { xp: 900, name: "Reverse", color: "#C58CFF" },
  { xp: 1500, name: "Full Art", color: "#FF9AD5" },
  { xp: 2400, name: "Alt Art", color: "#FF8FA3" },
  { xp: 3600, name: "Secrète", color: "#FFC46B" },
  { xp: 5200, name: "Arc-en-ciel", color: "#8FF0C4" },
  { xp: 7500, name: "Dorée", color: "#E5B45C" },
];

export const XP = {
  scan: 10, listing: 5, sale: 25, wish: 3, lot: 15, grading: 8,
  firstOfDay: 20, shiny: 100,
} as const;

export function levelOf(xp: number) {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k;
  const cur = LEVELS[i], next = LEVELS[i + 1];
  return {
    index: i, name: cur.name, color: cur.color,
    into: xp - cur.xp,
    span: next ? next.xp - cur.xp : 1,
    toNext: next ? next.xp - xp : 0,
    ratio: next ? Math.min(1, (xp - cur.xp) / (next.xp - cur.xp)) : 1,
    max: !next,
  };
}

export type BadgeId =
  | "first" | "ten" | "hundred" | "firstSale" | "tenSales" | "grand"
  | "firstLot" | "sharpEye" | "polyglot" | "hunter" | "streak7" | "shiny";

export const BADGES: { id: BadgeId; name: string; hint: string; icon: string }[] = [
  { id: "first", name: "Première pochette", hint: "Enregistrer une carte", icon: "🃏" },
  { id: "ten", name: "Classeur ouvert", hint: "10 cartes en stock", icon: "📒" },
  { id: "hundred", name: "Marchand", hint: "100 cartes enregistrées", icon: "🏪" },
  { id: "firstSale", name: "Premier envoi", hint: "Vendre une carte", icon: "📮" },
  { id: "tenSales", name: "Habitué de La Poste", hint: "10 ventes", icon: "🚚" },
  { id: "grand", name: "Mille", hint: "1 000 € encaissés", icon: "💶" },
  { id: "firstLot", name: "Groupeur", hint: "Créer un lot", icon: "📦" },
  { id: "sharpEye", name: "Œil de lynx", hint: "Un centrage meilleur que 55/45", icon: "🎯" },
  { id: "polyglot", name: "Polyglotte", hint: "Cinq langues différentes en stock", icon: "🌍" },
  { id: "hunter", name: "Chasseur", hint: "10 cibles en wishlist", icon: "🔭" },
  { id: "streak7", name: "Sept jours", hint: "Une semaine d'affilée", icon: "🔥" },
  { id: "shiny", name: "Chromatique", hint: "…", icon: "✨" },
];

export type Game = {
  xp: number;
  badges: BadgeId[];
  streak: number;
  lastDay: string;
  scans: number;
  shinies: number;
};

export const GAME_DEFAULT: Game = { xp: 0, badges: [], streak: 0, lastDay: "", scans: 0, shinies: 0 };

export const today = () => new Date().toISOString().slice(0, 10);

/** Renvoie l'état mis à jour et ce qui vient d'être gagné, pour l'animer. */
export function award(game: Game, amount: number, newBadges: BadgeId[] = []) {
  const g: Game = { ...game, badges: [...game.badges] };
  const day = today();
  let bonus = 0;

  if (g.lastDay !== day) {
    const y = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    g.streak = g.lastDay === y ? g.streak + 1 : 1;
    g.lastDay = day;
    bonus = XP.firstOfDay;
    if (g.streak >= 7 && !g.badges.includes("streak7")) newBadges = [...newBadges, "streak7"];
  }

  const before = levelOf(g.xp).index;
  g.xp += amount + bonus;
  const after = levelOf(g.xp).index;

  const gained = newBadges.filter((b) => !g.badges.includes(b));
  g.badges.push(...gained);

  return { game: g, gained: amount + bonus, badges: gained, levelUp: after > before ? levelOf(g.xp) : null, dailyBonus: bonus > 0 };
}

/** Un clin d'œil aux chances de chromatique. Assez rare pour surprendre,
 *  assez fréquent pour arriver vraiment. */
export const rollShiny = () => Math.floor(Math.random() * 64) === 0;
