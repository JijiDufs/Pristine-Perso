import { LANG_NAME } from "./domain";

type Card = {
  name?: string; nameEn?: string; set?: string; number?: string;
  lang?: string; variant?: string; condition?: string; marketPrice?: number | string;
};

const q = (c: Card) =>
  [c.name, c.number, c.set, `version ${LANG_NAME[c.lang ?? "FR"] ?? c.lang}`, c.variant].filter(Boolean).join(" ");

export const SYSTEM_EXPERT =
  "Tu es un expert en cartes Pokémon et TCG. Tu réponds exclusivement en JSON valide.";
export const SYSTEM_GRADER =
  "Tu es un expert en gradation de cartes à collectionner (PSA, PCA, CGC). Tu mesures, tu ne devines pas. Tu réponds exclusivement en JSON valide.";
export const SYSTEM_SELLER =
  "Tu es un vendeur expérimenté de cartes à collectionner sur Vinted et eBay France. Tu réponds exclusivement en JSON valide.";

export const identifyPrompt = () =>
  "Identifie cette carte à collectionner.\n\n" +
  "MÉTHODE OBLIGATOIRE, dans cet ordre :\n" +
  "1. Lis le numéro de collection imprimé en bas de la carte (format 020/189, SV045, XY12...).\n" +
  "2. Repère le symbole et le nom d'extension.\n" +
  "3. Déduis la langue depuis le texte imprimé : FR, EN, JP (kana/kanji), KR (hangul), CN (chinois traditionnel), DE, ES, IT.\n" +
  "4. Repère la variante : foil sur l'illustration seule = Holo, foil sur le fond = Reverse Holo, illustration pleine carte = Full Art ou Alt Art.\n\n" +
  "N'invente JAMAIS un numéro ou une extension. Si tu ne peux pas lire, mets null et baisse la confiance.\n\n" +
  'Réponds UNIQUEMENT ce JSON : {"found":true,"name":"","nameEn":"","set":"","number":"","lang":"FR","variant":"Holo","year":2020,"confidence":0.0,"note":""}';

export const pricePrompt = (c: Card) =>
  `Cherche la cote actuelle en euros de cette carte :\n${q(c)}\n\n` +
  "SOURCES À PRIVILÉGIER, dans cet ordre — le marché de référence est francophone :\n" +
  "1. Cardmarket (cardmarket.com/fr), la référence européenne\n" +
  "2. PokeValue.fr, argus français basé sur les ventes réalisées\n" +
  "3. Upcards.fr, moyennes de ventes eBay sur 1 an, 6 mois et 1 mois\n" +
  "4. PkmCards.fr, Cardmarket ajusté par langue, rareté et effet\n" +
  "5. Ventes conclues sur eBay France\n" +
  "PriceCharting en dernier recours seulement : marché américain, dollars, cartes françaises mal couvertes.\n\n" +
  "La langue, la variante et l'état changent radicalement le prix : écarte tout résultat qui ne correspond pas exactement.\n" +
  "Retiens comme trend la valeur la plus représentative du marché français en état Near Mint. Convertis en euros si nécessaire.\n\n" +
  "Réponds UNIQUEMENT ce JSON. Quatre sources maximum, note de 12 mots maximum :\n" +
  '{"low":0.00,"trend":0.00,"currency":"EUR","confidence":0.0,"note":"","sources":[{"name":"","price":0.00,"url":""}]}';

export const centeringPrompt = (hasBack: boolean, hasRaking: boolean, framed: boolean) =>
  `Image 1 = recto.${hasBack ? " Image 2 = verso." : ""}${hasRaking ? " Dernière image = recto en lumière rasante." : ""}\n` +
  (framed
    ? "Ces images ont été découpées exactement sur les arêtes de la carte : le bord de l'image EST le bord de la carte. Mesure les marges à partir du bord de l'image.\n\n"
    : "Ces images n'ont pas été recadrées : commence par localiser les arêtes de la carte dans l'image.\n\n") +
  "Mesure le centrage de l'impression. Pour chaque face, donne l'épaisseur des quatre marges — de l'arête de la carte jusqu'au début du cadre imprimé — en pourcentage de la largeur (gauche/droite) ou de la hauteur (haut/bas) de la carte.\n" +
  "Si la carte est full art sans bordure imprimée, ou si l'angle empêche toute mesure fiable, mets null pour cette face.\n" +
  "Décris ensuite ce que tu vois réellement sur les coins, les bords et la surface. Reste factuel.\n\n" +
  'Réponds UNIQUEMENT ce JSON : {"front":{"left":0.0,"right":0.0,"top":0.0,"bottom":0.0},"back":null,"corners":"","edges":"","surface":"","confidence":0.0}';

export const gradedPrompt = (c: Card, grade: number) => {
  const isFR = c.lang === "FR";
  const g2 = Math.min(10, grade + 1);
  return (
    `Cherche les prix de vente récents en euros de cette carte, brute et gradée :\n${q(c)}\n\n` +
    `Il me faut : le prix brut non gradé, le prix en PSA ${grade} et en PSA ${g2}` +
    (isFR ? `, ainsi que le prix en PCA ${grade} et en PCA ${g2}.` : ".") + "\n" +
    (isFR
      ? "La carte est française : cherche les ventes sur Cardmarket, eBay France et les groupes de revente francophones. Les slabs PCA se négocient presque exclusivement sur le marché francophone, les slabs PSA partout.\n"
      : "Cherche les ventes internationales et convertis en euros.\n") +
    "Si tu ne trouves pas un prix, mets null plutôt que d'estimer.\n" +
    "Sois bref. Réponds UNIQUEMENT ce JSON, note de 12 mots maximum :\n" +
    '{"raw":0.00,"psaLow":0.00,"psaHigh":0.00,"pcaLow":null,"pcaHigh":null,"currency":"EUR","source":"","confidence":0.0,"note":""}'
  );
};

export const textsPrompt = (c: Card) =>
  "Rédige une annonce de revente pour cette carte, en français.\n\n" +
  `Nom : ${c.name}${c.nameEn ? ` (EN : ${c.nameEn})` : ""}\n` +
  `Extension : ${c.set || "inconnue"}\nNuméro : ${c.number || "inconnu"}\n` +
  `Langue : ${c.lang}\nVariante : ${c.variant}\nÉtat : ${c.condition}\n` +
  `Cote de référence : ${c.marketPrice ? c.marketPrice + " €" : "inconnue"}\n\n` +
  "Contraintes strictes :\n" +
  "- titleVinted : 60 caractères MAX, saturé de mots-clés de recherche\n" +
  "- titleLeboncoin : 50 caractères MAX\n" +
  "- titleEbay : 80 caractères MAX, nom FR + nom EN + numéro\n" +
  "- description : 600 à 900 caractères. Annonce l'état honnêtement. Décris la carte, son intérêt, la protection à l'envoi. Ne mentionne AUCUN prix, ne signe pas, ne conclus pas par un appel à visiter le profil.\n" +
  "- keywords : 10 à 14 mots-clés de recherche\n\n" +
  "Ton : direct, factuel, chaleureux. Pas de superlatifs creux.\n" +
  'Réponds UNIQUEMENT ce JSON : {"titleVinted":"","titleLeboncoin":"","titleEbay":"","description":"","keywords":[]}';

export const lotPrompt = () =>
  "Ces photos montrent un lot de cartes mis en vente. Recense les cartes identifiables.\n\n" +
  "Pour chacune, lis le numéro de collection si tu le vois. Ne devine pas : si tu distingues une carte sans pouvoir la nommer, ne l'inclus pas et compte-la dans unreadable.\n" +
  "Limite-toi aux 20 cartes les plus visibles. Ne compte jamais deux fois la même carte vue sur deux photos.\n\n" +
  'Réponds UNIQUEMENT ce JSON : {"cards":[{"name":"","nameEn":"","number":"","set":"","lang":"FR","variant":"Normale","confidence":0.0}],"unreadable":0,"note":""}';

export const bundlePrompt = (lot: { cards: { name: string; number?: string; lang: string; condition: string }[]; price: number }) => {
  const list = lot.cards.slice(0, 25).map((c) => `- ${c.name} ${c.number ?? ""} (${c.lang}, ${c.condition})`).join("\n");
  return (
    `Rédige une annonce de revente en français pour ce lot de ${lot.cards.length} cartes, vendu ${lot.price} € :\n${list}\n\n` +
    "Contraintes : titleVinted 60 caractères max, titleLeboncoin 50 max, titleEbay 80 max. " +
    "La description fait 500 à 800 caractères, annonce le nombre de cartes, les extensions représentées, l'état général, et précise que la liste complète est disponible sur demande. Ne mentionne pas de prix et ne signe pas.\n" +
    'Réponds UNIQUEMENT ce JSON : {"titleVinted":"","titleLeboncoin":"","titleEbay":"","description":"","keywords":[]}'
  );
};
