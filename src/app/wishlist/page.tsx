"use client";
import { useEffect, useState } from "react";
import { Star, Plus, Check, Search, Loader2, Trash2, ShoppingBag, Info } from "lucide-react";
import { db, getSettings, getWishlist, saveWishlist, emptyCard, pushHistory, type Wish, type Settings } from "@/lib/db";
import { Field, Chips, useToast } from "@/components/ui";
import { LANGS, VARIANTS, num, condMult } from "@/lib/domain";
import { ai } from "@/lib/ai";
import { useFx } from "@/components/Fx";
import { XP, type BadgeId } from "@/lib/game";
import { eur } from "@/lib/format";

const blank = () => ({ name: "", set_name: "", number: "", lang: "FR", variant: "Normale", image_url: "", target_buy: "", market_price: "", note: "" });

export default function Wishlist() {
  const { toast, node } = useToast();
  const { grant } = useFx();
  const [items, setItems] = useState<Wish[]>([]);
  const [profile, setProfile] = useState<Settings | null>(null);
  const [form, setForm] = useState(blank());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const [w, s] = await Promise.all([getWishlist(), getSettings()]);
    setItems(w); setProfile(s);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const lookup = async (card: any, apply: (p: Record<string, unknown>) => void, key: string) => {
    if (!card.name) { toast("Indique au moins le nom", "err"); return; }
    setBusy(key);
    try {
      const result = await ai<any>("price", { card: { ...card, set: card.set_name ?? card.set } });
      if (result?.trend) { apply({ marketPrice: num(result.trend), marketDate: new Date().toISOString() }); toast(`Cote : ${eur(result.trend)}`); }
      else toast("Aucune cote fiable trouvée", "err");
    } catch (e) { toast((e as Error).message, "err"); }
    setBusy(null);
  };

  const add = async () => {
    await saveWishlist([{
      id: crypto.randomUUID(), name: form.name, set: form.set_name, number: form.number,
      lang: form.lang, variant: form.variant, imageUrl: form.image_url,
      targetBuy: num(form.target_buy), marketPrice: num(form.market_price),
      note: form.note, createdAt: new Date().toISOString(),
    }, ...items]);
    setForm(blank()); setOpen(false); load();
    const badges: BadgeId[] = items.length + 1 >= 10 ? ["hunter"] : [];
    await grant(XP.wish, badges);
    toast("Cible ajoutée");
  };

  const buy = async (it: Wish) => {
    await db.cards.put({
      ...emptyCard(), name: it.name, set: it.set, number: it.number,
      lang: it.lang, variant: it.variant, imageUrl: it.imageUrl,
      buyPrice: it.targetBuy, marketPrice: it.marketPrice, marketDate: it.marketDate,
      priceHistory: it.marketPrice ? pushHistory([], it.marketPrice) : [],
      askPrice: Number((it.marketPrice * condMult("NM")).toFixed(2)), notes: it.note,
    });
    await saveWishlist(items.filter((w) => w.id !== it.id));
    load(); toast("Ajoutée au stock — note son état et son emplacement");
  };

  const margin = (it: Wish) => {
    const cote = Number(it.marketPrice), buyP = Number(it.targetBuy);
    if (!cote) return null;
    const net = cote - buyP - Number(profile?.consumables ?? 0);
    return { net, roi: buyP > 0 ? (net / buyP) * 100 : null };
  };

  return (
    <div className="page">
      {node}
      <div className="page-head" style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <div className="eyebrow">Repérages</div>
          <h1>Wishlist</h1>
          <p>Les cartes que tu vises à l&apos;achat. Colle le lien de la photo, indique le prix demandé, la marge nette s&apos;affiche avant que tu ne sortes la carte bleue.</p>
        </div>
        <button className="btn btn-gold" onClick={() => setOpen(!open)}><Plus size={15} /> Ajouter une cible</button>
      </div>

      {open && (
        <div className="panel" style={{ marginBottom: 22 }}>
          <div className="panel-h"><Star size={15} color="var(--gold)" /><h3>Nouvelle cible</h3></div>
          <div className="panel-b">
            <div className="grid2">
              <Field label="Nom de la carte"><input className="inp" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Numéro"><input className="inp mono" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
              <Field label="Extension"><input className="inp" value={form.set_name} onChange={(e) => setForm({ ...form, set_name: e.target.value })} /></Field>
              <Field label="Lien de la photo"><input className="inp" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" /></Field>
            </div>
            <Field label="Langue"><Chips options={LANGS} value={form.lang} onChange={(v) => setForm({ ...form, lang: v })} /></Field>
            <Field label="Variante"><Chips options={VARIANTS} value={form.variant} onChange={(v) => setForm({ ...form, variant: v })} /></Field>
            <div className="grid2">
              <Field label="Prix demandé (€)"><input className="inp mono" value={form.target_buy} onChange={(e) => setForm({ ...form, target_buy: e.target.value })} /></Field>
              <Field label="Cote estimée (€)">
                <div className="row">
                  <input className="inp mono" value={form.market_price} onChange={(e) => setForm({ ...form, market_price: e.target.value })} />
                  <button className="btn" style={{ flex: "0 0 auto" }} disabled={busy === "form"}
                    onClick={() => lookup(form, (p: any) => setForm((f) => ({ ...f, market_price: String(p.marketPrice ?? "") })), "form")}>
                    {busy === "form" ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                  </button>
                </div>
              </Field>
            </div>
            <Field label="Note"><input className="inp" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn btn-gold" disabled={!form.name} onClick={add}><Check size={15} /> Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <Star size={30} style={{ marginBottom: 12, opacity: .5 }} />
          <h3>Aucune cible</h3>
          <p>Quand tu repères une carte sous-cotée, ajoute-la ici avant de l&apos;acheter.</p>
        </div>
      ) : (
        <div className="wish">
          {items.map((it) => {
            const mg = margin(it);
            return (
              <div className="wish-card" key={it.id}>
                <div className="wish-img">
                  {it.imageUrl ? <img src={it.imageUrl} alt="" /> : <Star size={22} color="var(--dim)" />}
                </div>
                <div className="wish-b">
                  <div>
                    <div className="pocket-name">{it.name}</div>
                    <div className="tiny dim mono">{[it.number, it.lang, it.variant].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div>
                    <div className="ledger"><span className="dim">Prix demandé</span><span>{eur(it.targetBuy)}</span></div>
                    <div className="ledger"><span className="dim">Cote</span><span className="gold">{it.marketPrice ? eur(it.marketPrice) : "—"}</span></div>
                    {mg && (
                      <>
                        <div className="ledger" style={{ marginTop: 5, fontWeight: 600 }}>
                          <span>Marge nette</span>
                          <span className={mg.net >= 0 ? "pos" : "neg"}>{mg.net >= 0 ? "+" : ""}{eur(mg.net)}</span>
                        </div>
                        {mg.roi != null && <div className="ledger"><span className="dim">Rentabilité</span><span className={mg.roi >= 0 ? "pos" : "neg"}>{mg.roi.toFixed(0)} %</span></div>}
                      </>
                    )}
                  </div>
                  {it.note && <div className="tiny muted">{it.note}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 4 }}>
                    <button className="btn btn-sm" style={{ flex: 1 }} disabled={busy === it.id}
                      onClick={() => lookup(it, async (p: any) => { await saveWishlist(items.map((w) => w.id === it.id ? { ...w, ...p } : w)); load(); }, it.id)}>
                      {busy === it.id ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
                    </button>
                    <button className="btn btn-sm btn-gold" style={{ flex: 2 }} onClick={() => buy(it)}><ShoppingBag size={13} /> Achetée</button>
                    <button className="btn btn-ghost btn-sm" aria-label="Supprimer"
                      onClick={async () => { await saveWishlist(items.filter((w) => w.id !== it.id)); load(); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="tiny dim" style={{ marginTop: 18, display: "flex", gap: 7, maxWidth: "64ch" }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>La marge nette déduit {eur(profile?.consumables ?? 0)} de consommables. Elle ne déduit ni commission ni port : sur eBay retire encore {profile?.ebayFee ?? 11} %.</span>
        </div>
      )}
    </div>
  );
}
