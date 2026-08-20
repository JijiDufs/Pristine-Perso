"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, ExternalLink, Trash2, Euro, Loader2, Search, Sparkles } from "lucide-react";
import { Field, Chips, Modal, StatusTag, useToast } from "@/components/ui";
import { CenteringViz, GradingPanel, Sparkline } from "@/components/Viz";
import { CHANNELS, CONDITIONS, LANGS, VARIANTS, VERIFY, condMult, num, estimateGrade } from "@/lib/domain";
import { eur, dateFr } from "@/lib/format";
import { db, getSales, saveSales, getSettings, type Card, type Settings } from "@/lib/db";
import { ai } from "@/lib/ai";
import { useFx } from "@/components/Fx";
import { XP, type BadgeId } from "@/lib/game";
import { centeringRatio } from "@/lib/domain";

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast, node } = useToast();
  const { grant } = useFx();
  const [card, setCard] = useState<Card | null>(null);
  const [imgs, setImgs] = useState<{ front?: string; back?: string }>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState("annonces");
  const [preparing, setPreparing] = useState<string | null>(null);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [selling, setSelling] = useState<string | null>(null);
  const [sale, setSale] = useState({ price: "", shipCollected: "", shipCost: "", consumables: "" });
  const [confirmDel, setConfirmDel] = useState(false);
  const [gen, setGen] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, i, s] = await Promise.all([db.cards.get(id), db.images.get(id), getSettings()]);
      setCard(c ?? null); setImgs(i ?? {}); setSettings(s);
    })();
  }, [id]);

  if (!card || !settings) return <div className="page"><div className="empty"><Loader2 size={20} className="spin" /></div></div>;

  const patch = async (fields: Partial<Card>) => {
    const next = { ...card, ...fields };
    setCard(next);
    await db.cards.put(next);
  };

  const copy = async (t: string, key: string) => {
    try { await navigator.clipboard.writeText(t); setCopied((c) => ({ ...c, [key]: true })); toast("Copié"); }
    catch { toast("Copie impossible", "err"); }
  };

  const setListing = async (channel: string, fields: Partial<Card["listings"][string]>) => {
    const listings = { ...card.listings, [channel]: { ...(card.listings[channel] ?? { status: "listed" }), ...fields } };
    const live = Object.values(listings).some((l) => l?.status === "listed");
    await patch({ listings, status: card.status === "sold" ? "sold" : live ? "listed" : "stock" });
  };

  const confirmSale = async () => {
    const ch = CHANNELS.find((c) => c.id === selling)!;
    const price = num(sale.price);
    if (!price) { toast("Indique le prix de vente", "err"); return; }
    const sales = await getSales();
    await saveSales([...sales, {
      id: crypto.randomUUID(), cardId: card.id, label: card.name, channel: ch.id, price,
      shipCollected: num(sale.shipCollected),
      shipCost: num(sale.shipCost) || settings.shipDefault,
      consumables: num(sale.consumables) || settings.consumables,
      commission: price * (ch.id === "ebay" ? settings.ebayFee / 100 : ch.fee),
      buyPrice: card.buyPrice, soldAt: new Date().toISOString(),
    }]);
    const listings = { ...card.listings, [ch.id]: { ...(card.listings[ch.id] ?? {}), status: "sold" as const } };
    await patch({ status: "sold", soldAt: new Date().toISOString(), listings });
    setSelling(null);
    const allSales = await getSales();
    const badges: BadgeId[] = [];
    if (allSales.length === 1) badges.push("firstSale");
    if (allSales.length === 10) badges.push("tenSales");
    if (allSales.reduce((a, x) => a + x.price, 0) >= 1000) badges.push("grand");
    await grant(XP.sale, badges);
    const others = Object.entries(listings).filter(([k, l]) => k !== ch.id && l?.status === "listed");
    toast(others.length ? `Vendue — retire l'annonce sur ${others.map(([k]) => CHANNELS.find((c) => c.id === k)?.label).join(" et ")}` : "Vente enregistrée",
      others.length ? "err" : "ok");
  };

  const fullDesc = [card.description, "", settings.signature].filter(Boolean).join("\n");
  const stillLive = Object.entries(card.listings).filter(([, l]) => l?.status === "listed");

  return (
    <div className="page">
      {node}
      <div className="page-head">
        <div className="eyebrow">Fiche</div>
        <h1>{card.name}</h1>
        <p className="mono tiny">{[card.number, card.set, card.lang, card.variant, card.condition].filter(Boolean).join("  ·  ")}</p>
      </div>

      <div style={{ display: "flex", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {([imgs.front, imgs.back].filter(Boolean) as string[]).map((b, i) => (
            <div className="foil" key={i} style={{ aspectRatio: "63/88", width: 116 }}><img src={`data:image/jpeg;base64,${b}`} alt="" /></div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }}>
          <div><div className="stat-lbl">Cote</div><div className="mono gold" style={{ fontSize: 17 }}>{eur(card.marketPrice)}</div><div className="tiny dim">{dateFr(card.marketDate)}</div></div>
          <div><div className="stat-lbl">Prix visé</div><div className="mono" style={{ fontSize: 17 }}>{eur(card.askPrice)}</div></div>
          <div><div className="stat-lbl">Achat</div><div className="mono" style={{ fontSize: 17 }}>{eur(card.buyPrice)}</div></div>
          <div><div className="stat-lbl">Statut</div><div style={{ marginTop: 5 }}><StatusTag status={card.status} /></div></div>
        </div>
      </div>

      {(card.priceHistory?.length ?? 0) > 1 && (
        <div style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 11, padding: "12px 14px", marginBottom: 16 }}>
          <div className="copybox-lbl" style={{ marginBottom: 4 }}>Évolution de la cote</div>
          <Sparkline data={card.priceHistory} />
        </div>
      )}

      {card.status === "sold" && stillLive.length > 0 && (
        <div className="alertbox" style={{ marginBottom: 16 }}>
          <strong style={{ fontSize: 13.5 }}>Vendue ailleurs — retire ces annonces</strong>
          {stillLive.map(([k, l]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
              <span style={{ fontSize: 13, flex: 1 }}>{CHANNELS.find((c) => c.id === k)?.label}</span>
              {l.url && <a className="btn btn-sm" href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
              <button className="btn btn-sm" onClick={() => setListing(k, { status: "removed" })}><Check size={12} /> Retirée</button>
            </div>
          ))}
        </div>
      )}

      <div className="chips" style={{ marginBottom: 16 }}>
        <button className={"chip" + (tab === "annonces" ? " on" : "")} onClick={() => setTab("annonces")}>Canaux</button>
        <button className={"chip" + (tab === "textes" ? " on" : "")} onClick={() => setTab("textes")}>Textes</button>
        <button className={"chip" + (tab === "fiche" ? " on" : "")} onClick={() => setTab("fiche")}>Fiche</button>
        {estimateGrade(card) && <button className={"chip" + (tab === "grad" ? " on" : "")} onClick={() => setTab("grad")}>Gradation</button>}
      </div>

      {tab === "annonces" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {CHANNELS.map((ch) => {
            const l = card.listings[ch.id];
            const live = l?.status === "listed";
            return (
              <div key={ch.id} style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 11, padding: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <strong style={{ fontSize: 13.5, flex: 1 }}>{ch.label}</strong>
                  {live ? <span className="tag tag-listed">En ligne</span>
                    : l?.status === "removed" ? <span className="tag tag-stock">Retirée</span>
                    : <span className="tiny dim">Pas en ligne</span>}
                  {card.status !== "sold" && (live ? (
                    <>
                      <button className="btn btn-sm" onClick={() => { setSelling(ch.id); setSale((s) => ({ ...s, price: String(card.askPrice || "") })); }}><Euro size={12} /> Vendue ici</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setListing(ch.id, { status: "removed" })}>Retirer</button>
                    </>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setPreparing(preparing === ch.id ? null : ch.id)}>{preparing === ch.id ? "Fermer" : "Publier"}</button>
                  ))}
                </div>
                {live && (
                  <div className="row" style={{ marginTop: 11 }}>
                    <input className="inp" placeholder="Lien de l'annonce" defaultValue={l?.url ?? ""} onBlur={(e) => setListing(ch.id, { url: e.target.value })} />
                    <input className="inp mono" style={{ maxWidth: 120 }} placeholder="Prix" defaultValue={l?.price ?? ""} onBlur={(e) => setListing(ch.id, { price: num(e.target.value) })} />
                  </div>
                )}
                {!live && card.status !== "sold" && preparing === ch.id && (
                  <div className="pub">
                    {[
                      { k: "t", label: card.titles[ch.id] || "Aucun titre généré", text: card.titles[ch.id] },
                      { k: "d", label: "Description + signature", text: card.description ? fullDesc : "" },
                      { k: "kw", label: card.keywords.join(", ") || "Aucun mot-clé", text: card.keywords.join(", ") },
                    ].map((st, i) => (
                      <div className="pub-step" key={st.k}>
                        <span className={"pub-n" + (copied[ch.id + st.k] ? " done" : "")}>{copied[ch.id + st.k] ? <Check size={11} /> : i + 1}</span>
                        <span className={"pub-lbl" + (st.text ? "" : " dim")}>{st.label}</span>
                        <button className="btn btn-ghost btn-sm" disabled={!st.text} onClick={() => copy(st.text!, ch.id + st.k)}><Copy size={12} /> Copier</button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                      <a className="btn btn-sm" href={ch.newUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Ouvrir {ch.label}</a>
                      <button className="btn btn-sm btn-gold" onClick={() => { setPreparing(null); setListing(ch.id, { status: "listed", listedAt: new Date().toISOString(), price: card.askPrice }); }}>
                        <Check size={13} /> C&apos;est en ligne
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "textes" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button className="btn btn-sm" disabled={gen} onClick={async () => {
              setGen(true);
              try {
                const r = await ai<any>("texts", { card });
                await patch({ titles: { vinted: r.titleVinted ?? "", leboncoin: r.titleLeboncoin ?? "", ebay: r.titleEbay ?? "" }, description: r.description ?? "", keywords: r.keywords ?? [] });
                toast("Textes régénérés");
              } catch (e) { toast((e as Error).message, "err"); }
              setGen(false);
            }}>{gen ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {card.description ? "Régénérer" : "Générer"}</button>
          </div>
          {CHANNELS.map((ch) => (
            <Field key={ch.id} label={`Titre ${ch.label}`}>
              <div className="row">
                <input className="inp" defaultValue={card.titles[ch.id] ?? ""} onBlur={(e) => patch({ titles: { ...card.titles, [ch.id]: e.target.value } })} />
                <button className="btn" style={{ flex: "0 0 auto" }} disabled={!card.titles[ch.id]} onClick={() => copy(card.titles[ch.id], "x" + ch.id)}><Copy size={13} /></button>
              </div>
            </Field>
          ))}
          <Field label="Description">
            <textarea className="inp" rows={8} defaultValue={card.description ?? ""} onBlur={(e) => patch({ description: e.target.value })} />
          </Field>
          <button className="btn btn-sm" onClick={() => copy(fullDesc, "desc")}><Copy size={13} /> Copier avec la signature</button>
          <Field label="Mots-clés">
            <input className="inp" defaultValue={card.keywords.join(", ")} onBlur={(e) => patch({ keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </Field>
        </div>
      )}

      {tab === "fiche" && (
        <div>
          <div className="grid2">
            <Field label="Nom"><input className="inp" defaultValue={card.name} onBlur={(e) => patch({ name: e.target.value })} /></Field>
            <Field label="Extension"><input className="inp" defaultValue={card.set ?? ""} onBlur={(e) => patch({ set: e.target.value })} /></Field>
            <Field label="Numéro"><input className="inp mono" defaultValue={card.number ?? ""} onBlur={(e) => patch({ number: e.target.value })} /></Field>
            <Field label="Emplacement"><input className="inp" defaultValue={card.location ?? ""} onBlur={(e) => patch({ location: e.target.value })} placeholder="Classeur 2 · p.7 · slot 3" /></Field>
          </div>
          <Field label="Langue"><Chips options={LANGS} value={card.lang} onChange={(v) => patch({ lang: v })} /></Field>
          <Field label="Variante"><Chips options={VARIANTS} value={card.variant} onChange={(v) => patch({ variant: v })} /></Field>
          <Field label="État">
            <Chips options={CONDITIONS.map((c) => [c.code, `${c.code} — ${c.label}`])} value={card.condition}
              onChange={(v) => patch({ condition: v, askPrice: Number((card.marketPrice * condMult(v)).toFixed(2)) })} />
          </Field>
          <div className="grid2">
            <Field label="Cote (€)"><input className="inp mono" defaultValue={card.marketPrice} onBlur={(e) => patch({ marketPrice: num(e.target.value) })} /></Field>
            <Field label="Prix visé (€)"><input className="inp mono" defaultValue={card.askPrice} onBlur={(e) => patch({ askPrice: num(e.target.value) })} /></Field>
            <Field label="Prix d'achat (€)"><input className="inp mono" defaultValue={card.buyPrice} onBlur={(e) => patch({ buyPrice: num(e.target.value) })} /></Field>
            <Field label="Quantité"><input className="inp mono" defaultValue={card.qty} onBlur={(e) => patch({ qty: num(e.target.value) || 1 })} /></Field>
          </div>
          <div className="tiny dim">Chaque champ est enregistré quand tu en sors.</div>
          <hr className="hr" />
          {(card.marketSources ?? []).length > 0 && (
            <div className="srcs" style={{ marginBottom: 11 }}>
              {card.marketSources!.map((s, i) => (
                <a className="src" key={i} href={s.url || "#"} target="_blank" rel="noreferrer">
                  <span className="src-n">{s.name}</span><span className="mono gold">{s.price ? eur(s.price) : "—"}</span>
                </a>
              ))}
            </div>
          )}
          <div className="copybox-lbl" style={{ marginBottom: 7 }}>Vérifier la cote</div>
          <div className="verify">
            {VERIFY.map((v) => <a key={v.label} href={v.url(card)} target="_blank" rel="noreferrer"><Search size={12} />{v.label}</a>)}
          </div>
        </div>
      )}

      {tab === "grad" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="viz-wrap">
            <CenteringViz m={card.centering?.front} label="Recto" />
            <CenteringViz m={card.centering?.back} label="Verso" />
          </div>
          <GradingPanel card={card} settings={settings}
            onQuote={(q) => {
              patch({ gradingQuote: q });
              const f = centeringRatio(card.centering?.front ?? null);
              grant(XP.grading, f && f.worst <= 55 ? ["sharpEye"] : []);
            }}
            onError={(m) => toast(m, "err")} />
          {card.gradeNotes?.corners && (
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              <div><strong>Coins :</strong> {card.gradeNotes.corners}</div>
              {card.gradeNotes.edges && <div><strong>Bords :</strong> {card.gradeNotes.edges}</div>}
              {card.gradeNotes.surface && <div><strong>Surface :</strong> {card.gradeNotes.surface}</div>}
            </div>
          )}
        </div>
      )}

      <hr className="hr" />
      {confirmDel ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="tiny" style={{ color: "var(--coral)" }}>Définitif —</span>
          <button className="btn btn-danger btn-sm" onClick={async () => { await db.cards.remove(card.id); await db.images.remove(card.id); router.push("/stock"); }}>Confirmer</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(false)}>Annuler</button>
        </div>
      ) : (
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel(true)}><Trash2 size={13} /> Supprimer</button>
      )}

      {selling && (
        <Modal title={`Vente sur ${CHANNELS.find((c) => c.id === selling)?.label}`} onClose={() => setSelling(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setSelling(null)}>Annuler</button>
            <button className="btn btn-gold" onClick={confirmSale}><Check size={15} /> Enregistrer</button>
          </>}>
          <div className="grid2">
            <Field label="Prix de vente"><input className="inp mono" autoFocus value={sale.price} onChange={(e) => setSale({ ...sale, price: e.target.value })} /></Field>
            <Field label="Port encaissé"><input className="inp mono" value={sale.shipCollected} onChange={(e) => setSale({ ...sale, shipCollected: e.target.value })} placeholder="0.00" /></Field>
            <Field label="Coût réel d'envoi"><input className="inp mono" value={sale.shipCost} onChange={(e) => setSale({ ...sale, shipCost: e.target.value })} placeholder={String(settings.shipDefault)} /></Field>
            <Field label="Consommables"><input className="inp mono" value={sale.consumables} onChange={(e) => setSale({ ...sale, consumables: e.target.value })} placeholder={String(settings.consumables)} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
