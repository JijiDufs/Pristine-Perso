/* Mode démo : réponses réalistes, instantanées, gratuites.
   Il existe pour une raison précise — mettre au point l'interface ne doit
   jamais coûter un appel d'API. */

const CARDS = [
  { name: "Dracaufeu VMAX", nameEn: "Charizard VMAX", set: "Voltage Éclatant", number: "020/189", variant: "Full Art", price: 74.9 },
  { name: "Pikachu VMAX", nameEn: "Pikachu VMAX", set: "Voltage Éclatant", number: "044/185", variant: "Holo", price: 28.5 },
  { name: "Mewtwo EX", nameEn: "Mewtwo EX", set: "Poing Furieux", number: "062/111", variant: "Reverse Holo", price: 12.4 },
  { name: "Ectoplasma V", nameEn: "Gengar V", set: "Origine Perdue", number: "155/196", variant: "Alt Art", price: 96.0 },
  { name: "Ronflex", nameEn: "Snorlax", set: "Épée et Bouclier", number: "131/202", variant: "Normale", price: 3.2 },
  { name: "Lugia V", nameEn: "Lugia V", set: "Tempête Argentée", number: "186/195", variant: "Alt Art", price: 148.0 },
];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const jitter = (n: number, pct = 0.12) => Math.round(n * (1 + (Math.random() * 2 - 1) * pct) * 100) / 100;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoAnswer(action: string, payload: Record<string, unknown>): Promise<unknown> {
  await wait(500 + Math.random() * 700); // latence plausible, sans l'attente réelle
  const card = (payload.card ?? {}) as Record<string, unknown>;

  switch (action) {
    case "identify": {
      const c = pick(CARDS);
      return { found: true, ...c, lang: "FR", year: 2021, confidence: 0.82 + Math.random() * 0.15, note: "" };
    }
    case "price": {
      const base = CARDS.find((c) => c.name === card.name)?.price ?? jitter(18);
      return {
        low: Math.round(base * 0.78 * 100) / 100,
        trend: jitter(base, 0.06),
        currency: "EUR",
        confidence: 0.8,
        note: "Données de démonstration",
        sources: [
          { name: "Cardmarket", price: jitter(base, 0.05), url: "https://www.cardmarket.com/fr/Pokemon" },
          { name: "PokeValue.fr", price: jitter(base, 0.1), url: "https://www.pokevalue.fr" },
          { name: "Upcards.fr", price: jitter(base, 0.14), url: "https://www.upcards.fr" },
        ],
      };
    }
    case "centering": {
      const m = () => ({
        left: Math.round((3 + Math.random() * 3) * 10) / 10,
        right: Math.round((3 + Math.random() * 3) * 10) / 10,
        top: Math.round((3 + Math.random() * 3) * 10) / 10,
        bottom: Math.round((3 + Math.random() * 3) * 10) / 10,
      });
      return {
        front: m(), back: m(),
        corners: "Coins nets, très léger émoussement en bas à droite.",
        edges: "Quelques points de blanchiment sur le bord supérieur.",
        surface: "Foil intact, deux micro-rayures visibles sous lumière rasante.",
        confidence: 0.7,
      };
    }
    case "graded": {
      const raw = Number(card.marketPrice) || 40;
      return {
        raw, psaLow: jitter(raw * 2.1), psaHigh: jitter(raw * 4.2),
        pcaLow: jitter(raw * 1.5), pcaHigh: jitter(raw * 2.6),
        currency: "EUR", source: "Démonstration", confidence: 0.6, note: "Données de démonstration",
      };
    }
    case "texts": {
      const n = String(card.name ?? "Carte"), num = String(card.number ?? ""), set = String(card.set ?? "");
      return {
        titleVinted: `${n} ${num} ${set} FR ${card.condition ?? "NM"}`.slice(0, 60),
        titleLeboncoin: `Carte Pokémon ${n} ${num}`.slice(0, 50),
        titleEbay: `Carte Pokémon ${n} / ${card.nameEn ?? n} ${num} ${set} Française`.slice(0, 80),
        description:
          `${n} de l'extension ${set || "—"}, numéro ${num || "—"}, version française.\n\n` +
          `État ${card.condition ?? "NM"} : la carte a été conservée en classeur, sous pochette, à l'abri de la lumière. ` +
          `Le centrage et les coins sont visibles sur les photos, qui font partie intégrante de la description.\n\n` +
          `Envoi sous sleeve et toploader, dans une enveloppe rigide. Expédition sous 24 h ouvrées.`,
        keywords: ["carte pokemon", n.toLowerCase(), String(card.nameEn ?? "").toLowerCase(), num, set.toLowerCase(), "française", "tcg", "collection"].filter(Boolean),
      };
    }
    case "bundle":
      return {
        titleVinted: "Lot de cartes Pokémon FR — bon état",
        titleLeboncoin: "Lot cartes Pokémon françaises",
        titleEbay: "Lot de cartes Pokémon françaises — extensions variées, bon état général",
        description: "Lot de cartes Pokémon françaises issues de plusieurs extensions. État général bon à très bon, conservation en classeur. Liste complète disponible sur demande. Envoi soigné et protégé.",
        keywords: ["lot cartes pokemon", "français", "tcg", "collection"],
      };
    case "lot": {
      const n = 3 + Math.floor(Math.random() * 5);
      return {
        cards: Array.from({ length: n }, (_, i) => ({ ...pick(CARDS), lang: "FR", confidence: 0.7, key: i })),
        unreadable: Math.floor(Math.random() * 4),
        note: "Données de démonstration",
      };
    }
    default:
      throw new Error("Action inconnue");
  }
}
