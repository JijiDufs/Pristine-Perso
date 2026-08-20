"use client";

/* Stockage local (IndexedDB). Toute lecture/écriture passe par ici :
   pour basculer un jour vers une vraie base, ce fichier est le seul à réécrire. */

const DB = "pristine";
const VERSION = 1;

export type Listing = { status: "listed" | "removed" | "sold"; url?: string; price?: number; listedAt?: string };
export type Card = {
  id: string;
  name: string; nameEn?: string; set?: string; number?: string;
  lang: string; variant: string; condition: string;
  checks: Record<string, number>;
  centering?: { front?: any; back?: any } | null;
  gradeNotes?: { corners?: string; edges?: string; surface?: string } | null;
  gradingQuote?: Record<string, unknown> | null;
  qty: number; location?: string;
  buyPrice: number; marketPrice: number; marketLow?: number;
  marketSource?: string; marketSources?: { name: string; price?: number; url?: string }[];
  marketDate?: string; marketPrev?: number | null;
  priceHistory?: { d: string; v: number }[];
  askPrice: number;
  titles: Record<string, string>; description?: string; keywords: string[];
  status: "stock" | "listed" | "sold";
  listings: Record<string, Listing>;
  lotId?: string | null; notes?: string; imageUrl?: string;
  soldAt?: string; createdAt: string;
};
export type Sale = {
  id: string; cardId?: string | null; lotId?: string | null; label: string;
  channel: string; price: number; shipCollected: number; shipCost: number;
  consumables: number; commission: number; buyPrice: number; soldAt: string;
};
export type Wish = {
  id: string; name: string; set?: string; number?: string; lang: string; variant: string;
  imageUrl?: string; targetBuy: number; marketPrice: number; marketDate?: string;
  note?: string; createdAt: string;
};
export type Lot = {
  id: string; name: string; cardIds: string[]; count: number;
  price: number; buyPrice: number; titles: Record<string, string>;
  description?: string; keywords: string[];
  status: "stock" | "listed" | "sold"; listedAt?: string; soldAt?: string; createdAt: string;
};

let handle: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (handle) return handle;
  handle = new Promise((res, rej) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("cards")) d.createObjectStore("cards", { keyPath: "id" });
      if (!d.objectStoreNames.contains("images")) d.createObjectStore("images", { keyPath: "id" });
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv", { keyPath: "key" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return handle;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then((d) => new Promise<T>((res, rej) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => res(req.result as T);
    req.onerror = () => rej(req.error);
  }));
}

export const db = {
  cards: {
    all: () => run<Card[]>("cards", "readonly", (s) => s.getAll()),
    get: (id: string) => run<Card | undefined>("cards", "readonly", (s) => s.get(id)),
    put: (c: Card) => run<IDBValidKey>("cards", "readwrite", (s) => s.put(c)),
    remove: (id: string) => run<undefined>("cards", "readwrite", (s) => s.delete(id)),
  },
  images: {
    get: (id: string) => run<{ id: string; front?: string; back?: string } | undefined>("images", "readonly", (s) => s.get(id)),
    all: () => run<{ id: string; front?: string; back?: string }[]>("images", "readonly", (s) => s.getAll()),
    put: (v: { id: string; front?: string; back?: string }) => run<IDBValidKey>("images", "readwrite", (s) => s.put(v)),
    remove: (id: string) => run<undefined>("images", "readwrite", (s) => s.delete(id)),
  },
  async kvGet<T>(key: string, fallback: T): Promise<T> {
    const row = await run<{ key: string; value: T } | undefined>("kv", "readonly", (s) => s.get(key));
    return row ? row.value : fallback;
  },
  kvSet: <T,>(key: string, value: T) => run<IDBValidKey>("kv", "readwrite", (s) => s.put({ key, value })),
};

export const SETTINGS_DEFAULT = {
  signature:
    "✨ Envoi rapide et soigné : carte sous sleeve + toploader, calée dans une enveloppe rigide.\n👉 Jetez un œil à mon profil, j'ai d'autres cartes en vente et je fais des lots sur demande !",
  watermark: "",
  theme: "dark",
  consumables: 1.4,
  shipDefault: 2.2,
  ebayFee: 11,
  minPrice: 4,
  dormantDays: 45,
  bundleDiscount: 20,
  pcaFee: 12.9, pcaShip: 12, pcaWeeks: 10,
  psaFee: 100, psaShip: 0, psaWeeks: 26,
  autoRefresh: true,
  autoBatch: 12,
};
export type Settings = typeof SETTINGS_DEFAULT;

export const getSettings = async (): Promise<Settings> => ({
  ...SETTINGS_DEFAULT, ...(await db.kvGet<Partial<Settings>>("settings", {})),
});
export const saveSettings = (s: Settings) => db.kvSet("settings", s);

export const getSales = () => db.kvGet<Sale[]>("sales", []);
export const saveSales = (v: Sale[]) => db.kvSet("sales", v);
export const getWishlist = () => db.kvGet<Wish[]>("wishlist", []);
export const saveWishlist = (v: Wish[]) => db.kvSet("wishlist", v);
export const getLots = () => db.kvGet<Lot[]>("lots", []);
export const saveLots = (v: Lot[]) => db.kvSet("lots", v);
import { GAME_DEFAULT, type Game } from "./game";
export const getGame = async (): Promise<Game> => ({ ...GAME_DEFAULT, ...(await db.kvGet<Partial<Game>>("game", {})) });
export const saveGame = (g: Game) => db.kvSet("game", g);
export const getDemo = () => db.kvGet<boolean>("demo", true);
export const saveDemo = (v: boolean) => db.kvSet("demo", v);

export const getMoves = () => db.kvGet<{ id: string; name: string; number?: string; old: number; now: number; pct: number }[]>("moves", []);
export const saveMoves = (v: unknown) => db.kvSet("moves", v);

export function pushHistory(hist: { d: string; v: number }[] | undefined, v: number) {
  const arr = Array.isArray(hist) ? [...hist] : [];
  const day = new Date().toISOString().slice(0, 10);
  if (arr.length && arr[arr.length - 1].d === day) arr[arr.length - 1] = { d: day, v };
  else arr.push({ d: day, v });
  return arr.slice(-90);
}

export const emptyCard = (): Card => ({
  id: crypto.randomUUID(),
  name: "", lang: "FR", variant: "Normale", condition: "NM", checks: {},
  qty: 1, buyPrice: 0, marketPrice: 0, askPrice: 0,
  titles: {}, keywords: [], status: "stock", listings: {},
  priceHistory: [], createdAt: new Date().toISOString(),
});
