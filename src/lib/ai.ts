"use client";
import { demoAnswer } from "./demo";
import { db } from "./db";

const TIMEOUT_MS = 70_000;

/* Coût indicatif d'un appel, en euros. Sert uniquement à afficher un ordre
   de grandeur : ce n'est pas une facture, c'est un garde-fou. */
const COST: Record<string, number> = {
  identify: 0.005, price: 0.035, texts: 0.008, centering: 0.007, graded: 0.035, bundle: 0.008, lot: 0.012,
};

export type Usage = { day: string; calls: number; cost: number };

export async function readUsage(): Promise<Usage> {
  const day = new Date().toISOString().slice(0, 10);
  const u = await db.kvGet<Usage>("usage", { day, calls: 0, cost: 0 });
  return u.day === day ? u : { day, calls: 0, cost: 0 };
}

async function bump(action: string) {
  const u = await readUsage();
  await db.kvSet("usage", { ...u, calls: u.calls + 1, cost: u.cost + (COST[action] ?? 0.01) });
}

export const isDemo = () => db.kvGet<boolean>("demo", true);

export async function ai<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (await isDemo()) return (await demoAnswer(action, payload)) as T;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  const started = Date.now();
  const secs = () => Math.round((Date.now() - started) / 1000);

  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      signal: abort.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new Error(`Délai dépassé après ${secs()} s. Réessaie.`);
    throw new Error("Connexion au serveur impossible : " + (e as Error).message);
  }
  clearTimeout(timer);
  await bump(action);

  // Une fonction interrompue par l'hébergeur renvoie du HTML, pas du JSON.
  const body = await res.text();
  let data: { result?: T; error?: string };
  try { data = JSON.parse(body); }
  catch {
    throw new Error(res.status === 504 || res.status === 502
      ? `Le serveur a coupé la requête après ${secs()} s (HTTP ${res.status}).`
      : `Réponse inattendue du serveur (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(data.error || `Échec de la requête (HTTP ${res.status})`);
  return data.result as T;
}
