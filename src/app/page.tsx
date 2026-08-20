"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Info, ScanLine, RefreshCw, Loader2, Sparkles, ArrowUpRight, ArrowDownRight, Download } from "lucide-react";
import { Stat, useToast } from "@/components/ui";
import { CHANNELS, num } from "@/lib/domain";
import { eur, dateFr } from "@/lib/format";
import { db, getSales, getSettings, getMoves, saveMoves, pushHistory, type Card, type Sale, type Settings } from "@/lib/db";
import { ai } from "@/lib/ai";

export default function Dashboard() {
  const { toast, node } = useToast();
  const [cards, setCards] = useState<Card[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [moves, setMoves] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, s, st, mv] = await Promise.all([db.cards.all(), getSales(), getSettings(), getMoves()]);
      setCards(c); setSales(s); setSettings(st); setMoves(mv); setReady(true);
      if (st.autoRefresh && c.length) refresh(false, c, st);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async (manual: boolean, list?: Card[], conf?: Settings) => {
    const st = conf ?? settings!;
    const source = list ?? cards;
    const now = Date.now();
    const stale = (c: Card) => !c.marketDate || now - new Date(c.marketDate).getTime() > 20 * 3600 * 1000;
    const targets = source
      .filter((c) => c.status !== "sold" && c.name)
      .filter((c) => (manual ? true : stale(c)))
      .sort((a, b) => (a.marketDate ?? "").localeCompare(b.marketDate ?? ""))
      .slice(0, manual ? 30 : st.autoBatch);
    if (!targets.length) { if (manual) toast("Toutes les cotes sont déjà à jour"); return; }

    setRefreshing({ done: 0, total: targets.length });
    const found: any[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const r = await ai<any>("price", { card: t });
        const nv = Number(r?.trend);
        if (nv > 0) {
          const old = num(t.marketPrice);
          const fresh = await db.cards.get(t.id);
          if (fresh) {
            await db.cards.put({
              ...fresh, marketPrev: old || null, marketPrice: nv, marketDate: new Date().toISOString(),
              marketSources: r.sources ?? fresh.marketSources, priceHistory: pushHistory(fresh.priceHistory, nv),
            });
          }
          if (old > 0) {
            const pct = ((nv - old) / old) * 100;
            if (Math.abs(pct) >= 10) found.push({ id: t.id, name: t.name, number: t.number, old, now: nv, pct });
          }
        }
      } catch { /* carte introuvable : on passe */ }
      setRefreshing({ done: i + 1, total: targets.length });
    }
    found.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    setMoves(found); await saveMoves(found);
    setCards(await db.cards.all());
    setRefreshing(null);
    toast(found.length ? `${found.length} mouvement${found.length > 1 ? "s" : ""} de cote` : "Cotes à jour");
  };

  if (!ready || !settings) return <div className="page"><div className="empty"><Loader2 size={22} className="spin" /></div></div>;

  const revenue = sales.reduce((s, x) => s + x.price, 0);
  const shipIn = sales.reduce((s, x) => s + x.shipCollected, 0);
  const commission = sales.reduce((s, x) => s + x.commission, 0);
  const shipOut = sales.reduce((s, x) => s + x.shipCost, 0);
  const consum = sales.reduce((s, x) => s + x.consumables, 0);
  const cogs = sales.reduce((s, x) => s + x.buyPrice, 0);
  const gross = revenue + shipIn;
  const net = gross - commission - shipOut - consum - cogs;
  const held = cards.filter((c) => c.status !== "sold");
  const stockCost = held.reduce((s, c) => s + num(c.buyPrice), 0);
  const stockValue = held.reduce((s, c) => s + num(c.marketPrice), 0);
  const toRemove = cards.filter((c) => c.status === "sold" && Object.values(c.listings ?? {}).some((l) => l?.status === "listed"));
  const byChannel = CHANNELS.map((ch) => ({ ...ch, total: sales.filter((s) => s.channel === ch.id).reduce((a, b) => a + b.price, 0) }));
  const maxCh = Math.max(1, ...byChannel.map((c) => c.total));

  const exportCsv = () => {
    const head = ["date", "libelle", "canal", "prix", "port_encaisse", "port_reel", "consommables", "commission", "achat", "profit_net"];
    const rows = sales.map((s) => [
      new Date(s.soldAt).toISOString().slice(0, 10), s.label, s.channel, s.price, s.shipCollected,
      s.shipCost, s.consumables, s.commission.toFixed(2), s.buyPrice,
      (s.price + s.shipCollected - s.commission - s.shipCost - s.consumables - s.buyPrice).toFixed(2),
    ]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `pristine-ventes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="page">
      {node}
      <div className="page-head" style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <div className="eyebrow">Aujourd&apos;hui</div>
          <h1>Tableau de bord</h1>
          <p>{held.length} carte{held.length > 1 ? "s" : ""} en stock, {cards.filter((c) => c.status === "listed").length} en ligne, {sales.length} vendue{sales.length > 1 ? "s" : ""}.</p>
        </div>
        <button className="btn" onClick={() => refresh(true)} disabled={!!refreshing}>
          {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {refreshing ? `Cotes ${refreshing.done}/${refreshing.total}` : "Actualiser les cotes"}
        </button>
      </div>

      {refreshing && <div className="progress" style={{ marginBottom: 20 }}><div style={{ width: `${(refreshing.done / refreshing.total) * 100}%` }} /></div>}

      {toRemove.length > 0 && (
        <div className="alertbox" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <AlertTriangle size={17} color="var(--coral)" />
          <div style={{ flex: 1, minWidth: 180 }}>
            <strong style={{ fontSize: 13.5 }}>{toRemove.length} annonce{toRemove.length > 1 ? "s" : ""} à retirer</strong>
            <div className="tiny muted" style={{ marginTop: 2 }}>{toRemove.slice(0, 3).map((c) => c.name).join(", ")}{toRemove.length > 3 ? "…" : ""}</div>
          </div>
          <Link className="btn btn-sm" href="/annonces">Traiter <ChevronRight size={13} /></Link>
        </div>
      )}

      {moves.length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-h">
            <Sparkles size={15} color="var(--gold)" /><h3>Mouvements de cote</h3>
            <span className="tiny dim" style={{ marginLeft: "auto" }}>variation d&apos;au moins 10 %</span>
          </div>
          <div>
            {moves.map((mv) => (
              <div className="move" key={mv.id}>
                <span className={"pct " + (mv.pct > 0 ? "up" : "down")}>{mv.pct > 0 ? "+" : ""}{mv.pct.toFixed(0)} %</span>
                <div className="line-main">
                  <div className="line-title">{mv.name}</div>
                  <div className="line-sub mono">{mv.number} · {eur(mv.old)} → {eur(mv.now)}</div>
                </div>
                {mv.pct > 0 ? <ArrowUpRight size={15} color="var(--mint)" /> : <ArrowDownRight size={15} color="var(--coral)" />}
                <Link className="btn btn-ghost btn-sm" href={`/stock/${mv.id}`}><ChevronRight size={14} /></Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 && (
        <div className="empty" style={{ padding: "44px 20px", marginBottom: 20 }}>
          <h3>Ton stock est vide</h3>
          <p>Photographie une carte : identification, cote et annonce suivent.</p>
          <Link className="btn btn-gold" style={{ marginTop: 16 }} href="/scan"><ScanLine size={15} /> Scanner une carte</Link>
        </div>
      )}

      <div className="stats" style={{ marginBottom: 14 }}>
        <Stat label="Profit net" value={eur(net)} tone={net >= 0 ? "pos" : "neg"}
          sub={`marge ${gross ? ((net / gross) * 100).toFixed(1) : "0.0"} % sur ${sales.length} vente${sales.length > 1 ? "s" : ""}`} />
        <Stat label="Encaissé" value={eur(gross)} sub={`dont ${eur(shipIn)} de port`} />
        <Stat label="Frais totaux" value={eur(commission + shipOut + consum)} sub={`${eur(commission)} commissions · ${eur(shipOut + consum)} envois`} />
        <Stat label="Panier moyen" value={eur(sales.length ? revenue / sales.length : 0)} sub="hors frais de port" />
      </div>

      <div className="stats" style={{ marginBottom: 22 }}>
        <Stat label="Investi en stock" value={eur(stockCost)} sub={`${held.length} cartes non vendues`} />
        <Stat label="Valeur à la cote" value={eur(stockValue)} tone="gold" sub={`plus-value latente ${eur(stockValue - stockCost)}`} />
      </div>

      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="panel">
          <div className="panel-h"><h3>Par canal</h3>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={exportCsv} disabled={!sales.length}><Download size={13} /> CSV</button>
          </div>
          <div className="panel-b">
            {sales.length === 0 ? <div className="dim tiny">Aucune vente enregistrée.</div> : byChannel.map((c) => (
              <div className="bar-row" key={c.id}>
                <span className="bar-lbl">{c.label}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.total / maxCh) * 100}%` }} /></div>
                <span className="bar-val mono">{eur(c.total)}</span>
              </div>
            ))}
            <hr className="hr" />
            <div className="tiny dim" style={{ display: "flex", gap: 7 }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Vinted et eBay transmettent tes ventes au fisc (DAC7) au-delà de 30 transactions ou 2 000 € par an.</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Dernières ventes</h3></div>
          {sales.length === 0 ? <div className="empty" style={{ padding: "36px 20px" }}><h3>Pas encore de vente</h3><p>Marque une carte comme vendue depuis sa fiche.</p></div> : (
            <div>
              {[...sales].reverse().slice(0, 8).map((s) => {
                const n = s.price + s.shipCollected - s.commission - s.shipCost - s.consumables - s.buyPrice;
                return (
                  <div className="line" key={s.id}>
                    <div className="line-main">
                      <div className="line-title">{s.label}</div>
                      <div className="line-sub mono">{dateFr(s.soldAt)} · {CHANNELS.find((c) => c.id === s.channel)?.label} · {eur(s.price)}</div>
                    </div>
                    <span className={"mono " + (n >= 0 ? "pos" : "neg")}>{n >= 0 ? "+" : ""}{eur(n)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
