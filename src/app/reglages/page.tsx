"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Download, Upload, Trash2, RotateCcw } from "lucide-react";
import { Field, useToast } from "@/components/ui";
import { num } from "@/lib/domain";
import { getDemo, saveDemo, getGame, saveGame } from "@/lib/db";
import { BADGES, GAME_DEFAULT, levelOf, type Game } from "@/lib/game";
import { readUsage, type Usage } from "@/lib/ai";
import {
  db, getSettings, saveSettings, getSales, saveSales, getWishlist, saveWishlist,
  getLots, saveLots, saveMoves, type Settings, type Card,
} from "@/lib/db";

const NUMERIC: [keyof Settings, string, string][] = [
  ["consumables", "Consommables par envoi (€)", "Sleeve + toploader + enveloppe rigide"],
  ["shipDefault", "Port réel par défaut (€)", ""],
  ["ebayFee", "Commission eBay (%)", ""],
  ["minPrice", "Prix plancher à l'unité (€)", "En dessous, mets la carte en lot"],
  ["dormantDays", "Carte qui dort au bout de (jours)", ""],
  ["bundleDiscount", "Remise sur les lots (%)", ""],
  ["autoBatch", "Cotes rafraîchies à l'ouverture", "Nombre de cartes vérifiées en arrière-plan"],
  ["pcaFee", "PCA — tarif par carte (€)", ""],
  ["pcaShip", "PCA — port aller-retour (€)", ""],
  ["pcaWeeks", "PCA — délai (semaines)", "Annoncé 6 à 12 semaines, souvent dépassé"],
  ["psaFee", "PSA — coût total par carte (€)", "Via un concessionnaire français, tout compris"],
  ["psaShip", "PSA — port supplémentaire (€)", ""],
  ["psaWeeks", "PSA — délai (semaines)", "Compter 6 mois entre l'envoi et le retour"],
];

export default function Reglages() {
  const { toast, node } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [armedSales, setArmedSales] = useState(false);
  const [armedGame, setArmedGame] = useState(false);
  const [demo, setDemo] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(setS);
    getDemo().then(setDemo);
    getGame().then(setGame);
    readUsage().then(setUsage);
  }, []);
  if (!s) return <div className="page"><div className="empty"><Loader2 size={20} className="spin" /></div></div>;

  const save = async () => {
    setBusy(true);
    const next = { ...s };
    NUMERIC.forEach(([k]) => { (next as any)[k] = num((s as any)[k]); });
    await saveSettings(next); setS(next);
    toast("Réglages enregistrés"); setBusy(false);
  };

  const exportAll = async () => {
    const [cards, images, sales, wishlist, lots] = await Promise.all([
      db.cards.all(), db.images.all(), getSales(), getWishlist(), getLots(),
    ]);
    const imgMap = Object.fromEntries(images.map((i) => [i.id, i]));
    const payload = {
      app: "pristine", version: 1, exportedAt: new Date().toISOString(),
      settings: s, sales, wishlist, lots,
      cards: cards.map((c) => ({ ...c, thumb: imgMap[c.id]?.front ?? null, thumbBack: imgMap[c.id]?.back ?? null })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" }));
    a.download = `pristine-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast("Sauvegarde téléchargée");
  };

  const importAll = async (file: File) => {
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.cards)) throw new Error("Fichier non reconnu");
      for (const raw of data.cards) {
        const { thumb, thumbBack, ...card } = raw;
        const id = card.id ?? crypto.randomUUID();
        await db.cards.put({ ...card, id } as Card);
        if (thumb || thumbBack) await db.images.put({ id, front: thumb ?? undefined, back: thumbBack ?? undefined });
      }
      if (data.settings) { const merged = { ...s, ...data.settings }; await saveSettings(merged); setS(merged); }
      if (Array.isArray(data.sales)) await saveSales(data.sales);
      if (Array.isArray(data.wishlist)) await saveWishlist(data.wishlist);
      if (Array.isArray(data.lots)) await saveLots(data.lots);
      toast(`${data.cards.length} carte(s) importée(s)`);
    } catch (e) { toast("Import impossible : " + (e as Error).message, "err"); }
    setBusy(false);
  };

  /* Remise à zéro des ventes seule : le stock est conservé, les cartes vendues
     repassent en stock. C'est ce qu'il faut après une série de tests. */
  const resetSales = async () => {
    await saveSales([]);
    const cards = await db.cards.all();
    for (const c of cards) {
      if (c.status !== "sold") continue;
      const listings = { ...c.listings };
      Object.keys(listings).forEach((k) => {
        if (listings[k]?.status === "sold") listings[k] = { ...listings[k], status: "removed" };
      });
      await db.cards.put({ ...c, status: "stock", soldAt: undefined, listings });
    }
    const lots = await getLots();
    await saveLots(lots.map((l) => (l.status === "sold" ? { ...l, status: "stock", soldAt: undefined } : l)));
    setArmedSales(false);
    toast("Ventes effacées — les cartes vendues sont revenues en stock");
  };

  const resetGame = async () => {
    await saveGame({ ...GAME_DEFAULT });
    setGame({ ...GAME_DEFAULT });
    setArmedGame(false);
    toast("Progression remise à zéro");
  };

  const reset = async () => {
    const cards = await db.cards.all();
    for (const c of cards) { await db.cards.remove(c.id); await db.images.remove(c.id); }
    await saveSales([]); await saveWishlist([]); await saveLots([]); await saveMoves([]);
    setArmed(false); toast("Données effacées");
  };

  return (
    <div className="page">
      {node}
      <div className="page-head">
        <div className="eyebrow">Configuration</div>
        <h1>Réglages</h1>
        <p>Ta signature et tes coûts réels. Ils alimentent les prix conseillés, le calcul de marge et le conseil de gradation.</p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><h3>Analyses et dépense</h3></div>
        <div className="panel-b">
          <div className="themeswitch" style={{ maxWidth: 340, marginBottom: 14 }}>
            <button className={demo ? "on" : ""} onClick={async () => { await saveDemo(true); setDemo(true); toast("Mode démo — plus aucun appel facturé"); }}>
              🧪 Démo
            </button>
            <button className={!demo ? "on" : ""} onClick={async () => { await saveDemo(false); setDemo(false); toast("Mode réel — les analyses sont désormais facturées", "err"); }}>
              ⚡ Réel
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            En <strong>démo</strong>, les analyses renvoient des données d&apos;exemple : instantanées, gratuites, parfaites pour
            explorer l&apos;application. En <strong>réel</strong>, chaque analyse appelle l&apos;API et t&apos;est facturée par Anthropic.
          </p>
          {usage && (
            <div className="ledger" style={{ marginTop: 10 }}>
              <span className="dim">Appels réels aujourd&apos;hui</span>
              <span className="mono">{usage.calls} · environ {usage.cost.toFixed(2)} €</span>
            </div>
          )}
        </div>
      </div>

      {game && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h">
            <h3>Progression</h3>
            <span className="tiny mono dim" style={{ marginLeft: "auto" }}>
              {game.xp} XP · {levelOf(game.xp).name}{game.streak > 1 ? ` · 🔥 ${game.streak} j` : ""}
            </span>
          </div>
          <div className="panel-b">
            <div className="badges">
              {BADGES.map((b) => {
                const on = game.badges.includes(b.id);
                return (
                  <div className={"badge " + (on ? "on" : "off")} key={b.id} title={b.hint}>
                    <div className="badge-i">{on ? b.icon : "🔒"}</div>
                    <div className="badge-n">{on ? b.name : "???"}</div>
                    <div className="badge-h">{b.hint}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><h3>Signature et filigrane</h3></div>
        <div className="panel-b">
          <Field label="Signature ajoutée à chaque description copiée">
            <textarea className="inp" rows={5} value={s.signature} onChange={(e) => setS({ ...s, signature: e.target.value })} />
          </Field>
          <Field label="Filigrane des photos">
            <input className="inp" value={s.watermark} placeholder="@ton_pseudo" onChange={(e) => setS({ ...s, watermark: e.target.value })} />
          </Field>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={s.autoRefresh} onChange={(e) => setS({ ...s, autoRefresh: e.target.checked })} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13 }}>Actualiser les cotes à l&apos;ouverture
              <span className="tiny dim" style={{ display: "block", marginTop: 2 }}>
                Les cartes dont la cote a plus de 20 h sont vérifiées en arrière-plan. Chaque vérification est un appel d&apos;API facturé.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><h3>Coûts, commissions et gradation</h3></div>
        <div className="panel-b">
          <div className="grid2">
            {NUMERIC.map(([k, label, hint]) => (
              <Field key={String(k)} label={label}>
                <input className="inp mono" value={String((s as any)[k] ?? "")} onChange={(e) => setS({ ...s, [k]: e.target.value } as Settings)} />
                {hint && <div className="tiny dim" style={{ marginTop: 5 }}>{hint}</div>}
              </Field>
            ))}
          </div>
        </div>
      </div>

      <button className="btn btn-gold" style={{ marginBottom: 22 }} onClick={save} disabled={busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Enregistrer
      </button>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h"><h3>Remises à zéro</h3></div>
        <div className="panel-b">
          <p className="tiny muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            Deux remises à zéro ciblées, utiles après une série de tests. Elles ne touchent
            pas à ton stock : les cartes restent, seules les données dérivées disparaissent.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {armedSales ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="tiny" style={{ color: "var(--coral)" }}>Historique et profits effacés —</span>
                <button className="btn btn-danger btn-sm" onClick={resetSales}>Confirmer</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setArmedSales(false)}>Annuler</button>
              </div>
            ) : (
              <button className="btn" onClick={() => setArmedSales(true)}>
                <RotateCcw size={14} /> Réinitialiser les ventes
              </button>
            )}
            {armedGame ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="tiny" style={{ color: "var(--coral)" }}>XP et badges perdus —</span>
                <button className="btn btn-danger btn-sm" onClick={resetGame}>Confirmer</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setArmedGame(false)}>Annuler</button>
              </div>
            ) : (
              <button className="btn" onClick={() => setArmedGame(true)}>
                <RotateCcw size={14} /> Réinitialiser la progression
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Tes données</h3></div>
        <div className="panel-b">
          <p className="tiny muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            Tout est stocké dans ce navigateur, sur cet appareil. Vider les données de navigation efface ton stock.
            Exporte régulièrement : ce fichier est ta seule sauvegarde, et c&apos;est aussi lui qui te servira à changer de machine.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" onClick={exportAll}><Download size={14} /> Exporter (JSON)</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Importer</button>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = ""; }} />
            {armed ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
                <span className="tiny" style={{ color: "var(--coral)" }}>Tout le stock sera perdu —</span>
                <button className="btn btn-danger" onClick={reset}>Confirmer</button>
                <button className="btn btn-ghost" onClick={() => setArmed(false)}>Annuler</button>
              </div>
            ) : (
              <button className="btn btn-danger" style={{ marginLeft: "auto" }} onClick={() => setArmed(true)}><Trash2 size={14} /> Tout effacer</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
