"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Loader2, Package, Trash2, Euro, Copy, Check } from "lucide-react";
import { Field, Chips, Modal, StatusTag, useToast } from "@/components/ui";
import { CHANNELS, num } from "@/lib/domain";
import { eur, dateFr } from "@/lib/format";
import { db, getLots, saveLots, getSales, saveSales, getSettings, type Card, type Lot, type Settings } from "@/lib/db";
import { ai } from "@/lib/ai";
import { useFx } from "@/components/Fx";
import { XP } from "@/lib/game";

export default function Lots() {
  const { toast, node } = useToast();
  const { grant } = useFx();
  const [cards, setCards] = useState<Card[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [selling, setSelling] = useState<Lot | null>(null);
  const [sale, setSale] = useState({ channel: "vinted", price: "", shipCollected: "", shipCost: "", consumables: "" });

  const load = async () => {
    const [c, l, s, images] = await Promise.all([db.cards.all(), getLots(), getSettings(), db.images.all()]);
    setCards(c); setLots(l); setSettings(s);
    const m: Record<string, string> = {};
    images.forEach((i) => { if (i.front) m[i.id] = i.front; });
    setImgs(m);
  };
  useEffect(() => { load(); }, []);

  const dormant = useMemo(() => {
    if (!settings) return [];
    const cut = Date.now() - num(settings.dormantDays) * 86400000;
    return cards.filter((c) => {
      if (c.status !== "listed") return false;
      const d = Object.values(c.listings ?? {}).filter((l) => l?.status === "listed").map((l) => new Date(l.listedAt ?? 0).getTime());
      return d.length && Math.min(...d) < cut;
    }).map((c) => {
      const d = Object.values(c.listings ?? {}).filter((l) => l?.status === "listed").map((l) => new Date(l.listedAt ?? 0).getTime());
      return { ...c, days: Math.floor((Date.now() - Math.min(...d)) / 86400000) };
    }).sort((a, b) => b.days - a.days);
  }, [cards, settings]);

  const groups = useMemo(() => {
    if (!settings) return [];
    const free = cards.filter((c) => c.status === "stock" && !c.lotId && c.askPrice > 0 && c.askPrice < settings.minPrice);
    const by: Record<string, Card[]> = {};
    free.forEach((c) => { const k = c.set || `Cartes ${c.lang}`; (by[k] = by[k] ?? []).push(c); });
    return Object.entries(by).filter(([, v]) => v.length >= 3).map(([k, v]) => {
      const sum = v.reduce((a, c) => a + c.askPrice, 0);
      return { key: k, cards: v, sum, price: Math.max(settings.minPrice, Math.round(sum * (1 - settings.bundleDiscount / 100) * 100) / 100) };
    }).sort((a, b) => b.cards.length - a.cards.length);
  }, [cards, settings]);

  if (!settings) return <div className="page"><div className="empty"><Loader2 size={20} className="spin" /></div></div>;

  const build = async (g: { key: string; cards: Card[]; price: number }) => {
    setBuilding(g.key);
    let texts: any = {};
    try { texts = await ai<any>("bundle", { card: { cards: g.cards.map((c) => ({ name: c.name, number: c.number, lang: c.lang, condition: c.condition })), price: g.price } }); }
    catch (e) { toast("Textes non générés : " + (e as Error).message, "err"); }
    const lot: Lot = {
      id: crypto.randomUUID(), name: `Lot ${g.key} — ${g.cards.length} cartes`,
      cardIds: g.cards.map((c) => c.id), count: g.cards.length, price: g.price,
      buyPrice: g.cards.reduce((a, c) => a + c.buyPrice, 0),
      titles: { vinted: texts.titleVinted ?? "", leboncoin: texts.titleLeboncoin ?? "", ebay: texts.titleEbay ?? "" },
      description: texts.description ?? "", keywords: texts.keywords ?? [],
      status: "stock", createdAt: new Date().toISOString(),
    };
    await saveLots([lot, ...lots]);
    for (const c of g.cards) await db.cards.put({ ...c, lotId: lot.id });
    setBuilding(null); load();
    await grant(XP.lot, lots.length === 0 ? ["firstLot"] : []);
    toast("Lot créé");
  };

  const dropPrice = async (c: Card, price: number) => {
    const listings = { ...c.listings };
    Object.keys(listings).forEach((k) => { if (listings[k]?.status === "listed") listings[k] = { ...listings[k], price }; });
    await db.cards.put({ ...c, askPrice: price, listings });
    load(); toast(`Prix ramené à ${eur(price)} — corrige-le sur les annonces`);
  };

  const dissolve = async (l: Lot) => {
    await saveLots(lots.filter((x) => x.id !== l.id));
    for (const id of l.cardIds) { const c = await db.cards.get(id); if (c) await db.cards.put({ ...c, lotId: null }); }
    load(); toast("Lot dissous, les cartes retournent au stock");
  };

  const confirmLotSale = async () => {
    const l = selling!;
    const ch = CHANNELS.find((c) => c.id === sale.channel)!;
    const price = num(sale.price) || l.price;
    const sales = await getSales();
    await saveSales([...sales, {
      id: crypto.randomUUID(), lotId: l.id, label: l.name, channel: ch.id, price,
      shipCollected: num(sale.shipCollected),
      shipCost: num(sale.shipCost) || settings.shipDefault,
      consumables: num(sale.consumables) || settings.consumables,
      commission: price * (ch.id === "ebay" ? settings.ebayFee / 100 : ch.fee),
      buyPrice: l.buyPrice, soldAt: new Date().toISOString(),
    }]);
    await saveLots(lots.map((x) => (x.id === l.id ? { ...x, status: "sold", soldAt: new Date().toISOString() } : x)));
    for (const id of l.cardIds) { const c = await db.cards.get(id); if (c) await db.cards.put({ ...c, status: "sold", soldAt: new Date().toISOString() }); }
    setSelling(null); load(); toast("Lot vendu, les cartes sont sorties du stock");
  };

  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast("Copié"), () => toast("Copie impossible", "err"));

  return (
    <div className="page">
      {node}
      <div className="page-head">
        <div className="eyebrow">Optimisation</div>
        <h1>Lots et invendus</h1>
        <p>Une carte listée depuis des semaines ne se vendra pas au même prix. Une carte à 2 € ne se vend pas seule. Les deux se règlent ici.</p>
      </div>

      <div className="panel" style={{ marginBottom: 22, borderColor: dormant.length ? "var(--alert-line)" : "var(--line)" }}>
        <div className="panel-h" style={{ borderColor: dormant.length ? "var(--alert-line)" : "var(--line)" }}>
          <AlertTriangle size={15} color={dormant.length ? "var(--coral)" : "var(--dim)"} />
          <h3>Cartes qui dorment</h3>
          <span className="tiny dim" style={{ marginLeft: "auto" }}>en ligne depuis plus de {settings.dormantDays} jours</span>
        </div>
        {dormant.length === 0 ? <div className="empty" style={{ padding: "34px 20px" }}><h3>Rien ne traîne</h3><p>Aucune annonce ne dépasse le seuil.</p></div> : (
          <div>
            {dormant.map((c) => {
              const cut = Math.round(c.askPrice * 0.85 * 100) / 100;
              return (
                <div className="line" key={c.id}>
                  <div className="line-thumb">{imgs[c.id] && <img src={`data:image/jpeg;base64,${imgs[c.id]}`} alt="" />}</div>
                  <div className="line-main">
                    <div className="line-title">{c.name}</div>
                    <div className="line-sub mono">{c.days} jours en ligne · {eur(c.askPrice)} → {eur(cut)}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => dropPrice(c, cut)}>Baisser de 15 %</button>
                  <Link className="btn btn-ghost btn-sm" href={`/stock/${c.id}`}><ChevronRight size={14} /></Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lots.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>Tes lots</h2>
          <div className="lotgrid" style={{ marginBottom: 26 }}>
            {lots.map((l) => (
              <div className="lotcard" key={l.id}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 13.5 }}>{l.name}</strong>
                    <div className="tiny dim mono">{l.count} cartes · achat {eur(l.buyPrice)}</div>
                  </div>
                  <StatusTag status={l.status} />
                </div>
                <div className="miniset">
                  {l.cardIds.slice(0, 12).map((id) => <div className="mini" key={id}>{imgs[id] && <img src={`data:image/jpeg;base64,${imgs[id]}`} alt="" />}</div>)}
                </div>
                <div className="ledger"><span className="dim">Prix du lot</span><span className="mono gold">{eur(l.price)}</span></div>
                <div className="ledger"><span className="dim">Marge brute</span><span className={"mono " + (l.price - l.buyPrice >= 0 ? "pos" : "neg")}>{eur(l.price - l.buyPrice)}</span></div>
                {l.description && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="tiny dim" style={{ cursor: "pointer" }}>Voir les textes</summary>
                    <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 7 }}>
                      {CHANNELS.map((ch) => l.titles[ch.id] ? (
                        <button className="btn btn-sm" key={ch.id} onClick={() => copy(l.titles[ch.id])}><Copy size={12} /> Titre {ch.label}</button>
                      ) : null)}
                      <button className="btn btn-sm" onClick={() => copy([l.description, "", settings.signature].join("\n"))}><Copy size={12} /> Description + signature</button>
                    </div>
                  </details>
                )}
                <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                  {l.status === "stock" && (
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={async () => { await saveLots(lots.map((x) => x.id === l.id ? { ...x, status: "listed", listedAt: new Date().toISOString() } : x)); load(); }}>
                      Marquer en ligne
                    </button>
                  )}
                  {l.status === "listed" && (
                    <button className="btn btn-sm btn-gold" style={{ flex: 1 }} onClick={() => { setSelling(l); setSale((s) => ({ ...s, price: String(l.price) })); }}>
                      <Euro size={13} /> Lot vendu
                    </button>
                  )}
                  {l.status === "sold" && <span className="tiny dim" style={{ flex: 1 }}>Vendu le {dateFr(l.soldAt)}</span>}
                  <button className="btn btn-ghost btn-sm" onClick={() => dissolve(l)} aria-label="Dissoudre le lot"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 17, marginBottom: 4 }}>Lots suggérés</h2>
      <p className="tiny muted" style={{ marginTop: 0, marginBottom: 14, maxWidth: "62ch" }}>
        Regroupement des cartes en stock sous {eur(settings.minPrice)}, par extension, avec {settings.bundleDiscount} % de remise sur la somme des prix unitaires.
      </p>
      {groups.length === 0 ? (
        <div className="empty" style={{ padding: "40px 20px" }}>
          <h3>Aucun lot à proposer</h3><p>Il faut au moins trois cartes de la même extension sous le prix plancher.</p>
        </div>
      ) : (
        <div className="lotgrid">
          {groups.map((g) => (
            <div className="lotcard" key={g.key}>
              <strong style={{ fontSize: 13.5 }}>{g.key}</strong>
              <div className="tiny dim mono">{g.cards.length} cartes</div>
              <div className="miniset">{g.cards.slice(0, 12).map((c) => <div className="mini" key={c.id}>{imgs[c.id] && <img src={`data:image/jpeg;base64,${imgs[c.id]}`} alt="" />}</div>)}</div>
              <div className="ledger"><span className="dim">Somme à l&apos;unité</span><span className="mono">{eur(g.sum)}</span></div>
              <div className="ledger"><span className="dim">Prix du lot</span><span className="mono gold">{eur(g.price)}</span></div>
              <button className="btn btn-gold btn-block" style={{ marginTop: 12 }} onClick={() => build(g)} disabled={building === g.key}>
                {building === g.key ? <Loader2 size={14} className="spin" /> : <Package size={14} />} Créer ce lot
              </button>
            </div>
          ))}
        </div>
      )}

      {selling && (
        <Modal title={`Vendre « ${selling.name} »`} subtitle={`${selling.count} cartes · achat ${eur(selling.buyPrice)}`} onClose={() => setSelling(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setSelling(null)}>Annuler</button>
            <button className="btn btn-gold" onClick={confirmLotSale}><Check size={15} /> Enregistrer la vente</button>
          </>}>
          <Field label="Canal"><Chips options={CHANNELS.map((c) => [c.id, c.label])} value={sale.channel} onChange={(v) => setSale({ ...sale, channel: v })} /></Field>
          <div className="grid2">
            <Field label="Prix de vente"><input className="inp mono" value={sale.price} onChange={(e) => setSale({ ...sale, price: e.target.value })} /></Field>
            <Field label="Port encaissé"><input className="inp mono" value={sale.shipCollected} onChange={(e) => setSale({ ...sale, shipCollected: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Coût réel d'envoi"><input className="inp mono" value={sale.shipCost} onChange={(e) => setSale({ ...sale, shipCost: e.target.value })} placeholder={String(settings.shipDefault)} /></Field>
            <Field label="Consommables"><input className="inp mono" value={sale.consumables} onChange={(e) => setSale({ ...sale, consumables: e.target.value })} placeholder={String(settings.consumables)} /></Field>
          </div>
          <div className="tiny dim">Les {selling.count} cartes du lot passeront en vendues.</div>
        </Modal>
      )}
    </div>
  );
}
