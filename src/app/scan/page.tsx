"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, ImagePlus, Loader2, Check, Search, Sparkles, X, AlertTriangle, Pencil, Plus, Star } from "lucide-react";
import Camera, { fileToShot, type Shot } from "@/components/Camera";
import { Field, Chips, useToast } from "@/components/ui";
import { CenteringViz, GradingPanel } from "@/components/Viz";
import { ai } from "@/lib/ai";
import { eur } from "@/lib/format";
import { CHANNELS, CONDITIONS, LANGS, VARIANTS, CHECKS, VERIFY, condMult, gradeFromChecks, num } from "@/lib/domain";
import { db, emptyCard, getSettings, getWishlist, saveWishlist, pushHistory, getDemo, type Card, type Settings } from "@/lib/db";
import { useFx } from "@/components/Fx";
import { XP, rollShiny, type BadgeId } from "@/lib/game";
import { readUsage, type Usage } from "@/lib/ai";

const SHOTS = [
  { id: "front", label: "Recto", hint: "Bien à plat, numéro lisible", required: true, tip: "Aligne les bords de la carte sur le cadre" },
  { id: "back", label: "Verso", hint: "Pour le centrage arrière", required: true, tip: "Même cadrage, téléphone bien au-dessus" },
  { id: "raking", label: "Lumière rasante", hint: "Optionnel — révèle les rayures", required: false, tip: "Incline la carte pour capter le reflet d'une lampe" },
];

type Draft = Card & { front?: Shot; back?: Shot; identFailed?: boolean; identNote?: string; confidence?: number; priceNote?: string };

export default function Scan() {
  const router = useRouter();
  const { toast, node } = useToast();
  const { grant } = useFx();
  const [demo, setDemo] = useState(true);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [shiny, setShiny] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<"quick" | "deep" | "lot">("quick");
  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [camera, setCamera] = useState<typeof SHOTS[number] | null>(null);
  const [queue, setQueue] = useState<Shot[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [confirmBad, setConfirmBad] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camFallback = useRef<HTMLInputElement>(null);

  // mode lot
  const [lotShots, setLotShots] = useState<Shot[]>([]);
  const [lotAsk, setLotAsk] = useState("");
  const [lotFound, setLotFound] = useState<any>(null);
  const [lotSel, setLotSel] = useState<Record<number, boolean>>({});
  const [lotPhase, setLotPhase] = useState<{ label: string; done?: number; total?: number } | null>(null);
  const lotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    getDemo().then(setDemo);
    readUsage().then(setUsage);
  }, []);

  const build = async (front: Shot, extras: Partial<Draft> = {}): Promise<Draft> => {
    const d: Draft = { ...emptyCard(), ...extras, front };
    setPhase("Lecture de la carte…");
    try {
      const r = await ai<any>("identify", { images: [front.big] });
      if (r?.found !== false) {
        Object.assign(d, {
          name: r.name ?? "", nameEn: r.nameEn ?? "", set: r.set ?? "", number: r.number ?? "",
          lang: LANGS.includes(r.lang) ? r.lang : "FR",
          variant: VARIANTS.includes(r.variant) ? r.variant : "Normale",
          confidence: r.confidence, identNote: r.note ?? "",
        });
      } else { d.identFailed = true; d.identNote = r?.note ?? ""; }
    } catch (e) { d.identFailed = true; d.identNote = (e as Error).message; }

    if (d.name) {
      setPhase("Recherche de la cote…");
      try {
        const r = await ai<any>("price", { card: d });
        if (r?.trend) {
          d.marketPrice = num(r.trend);
          d.marketLow = num(r.low);
          d.marketSources = r.sources ?? [];
          d.marketSource = (r.sources ?? []).map((s: any) => s.name).join(", ");
          d.marketDate = new Date().toISOString();
          d.priceHistory = pushHistory([], num(r.trend));
          d.priceNote = r.note ?? "";
          d.askPrice = Number((num(r.trend) * condMult(d.condition)).toFixed(2));
        }
      } catch (e) { d.priceNote = (e as Error).message; }
    }
    return d;
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const out: Shot[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) continue;
      try { out.push(await fileToShot(f)); } catch { toast("Image ignorée", "err"); }
    }
    if (!out.length) return;
    setQueue((q) => [...q, ...out.slice(1)]);
    setDraft(await build(out[0]));
    setPhase(null);
  };

  const analyzeDeep = async () => {
    if (!shots.front) { toast("Le recto est indispensable", "err"); return; }
    const bad = SHOTS.map((s) => shots[s.id]).filter((x) => x?.quality?.warnings.length);
    if (bad.length && !confirmBad) {
      setConfirmBad(true);
      toast("Une photo est signalée : refais-la, ou relance pour analyser quand même", "err");
      return;
    }
    setConfirmBad(false);
    const extras: Partial<Draft> = { back: shots.back };
    setPhase("Mesure du centrage…");
    try {
      const images = [shots.front.big, shots.back?.big, shots.raking?.big].filter(Boolean) as string[];
      const framed = !!(shots.front.framed && (!shots.back || shots.back.framed));
      const r = await ai<any>("centering", { images, framed });
      extras.centering = { front: r.front ?? null, back: r.back ?? null };
      extras.gradeNotes = { corners: r.corners ?? "", edges: r.edges ?? "", surface: r.surface ?? "" };
    } catch (e) { toast("Centrage non mesurable : " + (e as Error).message, "err"); }
    try { setDraft(await build(shots.front, extras)); setShots({}); }
    catch (e) { toast((e as Error).message, "err"); }
    setPhase(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const { front, back, identFailed, identNote, confidence, priceNote, ...card } = draft;
      await db.cards.put({ ...card, qty: Math.max(1, num(card.qty) || 1) } as Card);
      if (front || back) await db.images.put({ id: card.id, front: front?.thumb, back: back?.thumb });

      const all = await db.cards.all();
      const badges: BadgeId[] = [];
      if (all.length === 1) badges.push("first");
      if (all.length === 10) badges.push("ten");
      if (all.length === 100) badges.push("hundred");
      if (new Set(all.map((c) => c.lang)).size >= 5) badges.push("polyglot");
      const isShiny = rollShiny();
      if (isShiny) { badges.push("shiny"); setShiny(true); setTimeout(() => setShiny(false), 4000); }
      await grant(XP.scan + (isShiny ? XP.shiny : 0), badges);
      if (isShiny) toast("✨ Carte chromatique ! Bonus d'expérience", "ok");
      const next = queue[0];
      setQueue((q) => q.slice(1));
      if (next) { setDraft(await build(next)); setPhase(null); toast(`Enregistrée — ${queue.length - 1} en attente`); }
      else { setDraft(null); toast("Carte enregistrée"); router.push("/stock"); }
    } catch (e) { toast("Enregistrement impossible : " + (e as Error).message, "err"); }
    setSaving(false);
  };

  const setCheck = (id: string, v: number) => setDraft((d) => {
    const checks = { ...d!.checks, [id]: v };
    const g = gradeFromChecks(checks);
    return { ...d!, checks, condition: g ?? d!.condition, askPrice: g && d!.marketPrice ? Number((d!.marketPrice * condMult(g)).toFixed(2)) : d!.askPrice };
  });

  /* ---- mode lot ---- */
  const readLot = async () => {
    if (!lotShots.length) return;
    setLotPhase({ label: "Recensement des cartes…" });
    try {
      const r = await ai<any>("lot", { images: lotShots.map((s) => s.big) });
      const cards = (r.cards ?? []).map((c: any, i: number) => ({ ...c, key: i, condition: "NM" }));
      setLotFound({ ...r, cards });
      const sel: Record<number, boolean> = {};
      cards.slice(0, 12).forEach((c: any) => { sel[c.key] = true; });
      setLotSel(sel);
      if (!cards.length) toast("Aucune carte identifiable sur ces photos", "err");
    } catch (e) { toast((e as Error).message, "err"); }
    setLotPhase(null);
  };

  const priceLot = async () => {
    const picks = lotFound.cards.filter((c: any) => lotSel[c.key]).slice(0, 12);
    if (!picks.length) { toast("Sélectionne au moins une carte", "err"); return; }
    const out: any[] = [];
    for (let i = 0; i < picks.length; i++) {
      setLotPhase({ label: "Cotes", done: i, total: picks.length });
      try { const p = await ai<any>("price", { card: picks[i] }); out.push({ ...picks[i], marketPrice: num(p?.trend) }); }
      catch { out.push({ ...picks[i], marketPrice: 0 }); }
    }
    setLotFound((f: any) => ({ ...f, priced: out }));
    setLotPhase(null);
  };

  const importLot = async () => {
    const priced = (lotFound.priced ?? []).filter((c: any) => c.marketPrice > 0);
    const total = priced.reduce((a: number, c: any) => a + c.marketPrice, 0);
    const ask = num(lotAsk);
    for (const c of priced) {
      await db.cards.put({
        ...emptyCard(),
        name: c.name, nameEn: c.nameEn ?? "", set: c.set ?? "", number: c.number ?? "",
        lang: LANGS.includes(c.lang) ? c.lang : "FR",
        variant: VARIANTS.includes(c.variant) ? c.variant : "Normale",
        marketPrice: c.marketPrice, marketSource: "Scan de lot", marketDate: new Date().toISOString(),
        priceHistory: pushHistory([], c.marketPrice),
        askPrice: Number((c.marketPrice * condMult("NM")).toFixed(2)),
        // Le prix du lot est ventilé au prorata de la cote : c'est le seul PRU juste.
        buyPrice: total > 0 ? Number(((c.marketPrice / total) * ask).toFixed(2)) : 0,
        notes: "Issue d'un lot — état à vérifier à réception",
      });
    }
    setLotFound(null); setLotShots([]); setLotAsk(""); setLotSel({});
    toast(`${priced.length} carte(s) ajoutées, coût d'achat ventilé au prorata de la cote`);
  };

  if (!settings) return <div className="page"><div className="empty"><Loader2 size={22} className="spin" /></div></div>;

  /* ================= formulaire ================= */
  if (draft) {
    const base = num(draft.askPrice);
    const tooLow = base > 0 && base < settings.minPrice;
    const hasTexts = !!draft.description;
    const hasCentering = draft.centering && (draft.centering.front || draft.centering.back);
    return (
      <div className="page">
        {node}
        <div className="page-head">
          <div className="eyebrow">Fiche carte{queue.length ? ` · ${queue.length} en attente` : ""}</div>
          <h1>{draft.name || "Carte non identifiée"}</h1>
          {draft.identFailed && <p style={{ color: "var(--coral)" }}>Identification impossible{draft.identNote ? ` : ${draft.identNote}` : ""}. Saisis les infos à la main.</p>}
          {!draft.identFailed && draft.confidence != null && draft.confidence < 0.75 && (
            <p style={{ color: "var(--gold)" }}>Lecture incertaine ({Math.round(draft.confidence * 100)} %). Vérifie le numéro et l&apos;extension.</p>
          )}
        </div>

        <div className="scanlayout" style={{ display: "grid", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {([draft.front, draft.back].filter(Boolean) as Shot[]).map((s, i) => (
              <div className={"foil" + (shiny ? " holo-card" : "")} key={i} style={{ aspectRatio: "63/88", flex: 1, maxWidth: 170 }}>
                <img src={`data:image/jpeg;base64,${s.thumb}`} alt="" />
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="panel">
              <div className="panel-h"><span className="step-n mono">01</span><h3>Identité</h3></div>
              <div className="panel-b">
                <div className="grid2">
                  <Field label="Nom (FR)"><input className="inp" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Dracaufeu VMAX" /></Field>
                  <Field label="Nom (EN)"><input className="inp" value={draft.nameEn ?? ""} onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })} /></Field>
                  <Field label="Extension"><input className="inp" value={draft.set ?? ""} onChange={(e) => setDraft({ ...draft, set: e.target.value })} /></Field>
                  <Field label="Numéro"><input className="inp mono" value={draft.number ?? ""} onChange={(e) => setDraft({ ...draft, number: e.target.value })} placeholder="020/189" /></Field>
                </div>
                <Field label="Langue"><Chips options={LANGS} value={draft.lang} onChange={(v) => setDraft({ ...draft, lang: v })} /></Field>
                <Field label="Variante"><Chips options={VARIANTS} value={draft.variant} onChange={(v) => setDraft({ ...draft, variant: v })} /></Field>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <span className="step-n mono">02</span><h3>État{hasCentering ? " et centrage" : ""}</h3>
                <span className="tiny dim" style={{ marginLeft: "auto" }}>Tu tranches, pas l&apos;IA</span>
              </div>
              <div className="panel-b">
                {hasCentering && (
                  <>
                    <div className="viz-wrap" style={{ marginBottom: 14 }}>
                      <CenteringViz m={draft.centering!.front} label="Recto" />
                      <CenteringViz m={draft.centering!.back} label="Verso" />
                      <div style={{ flex: 2, minWidth: 200 }}>
                        <GradingPanel card={draft} settings={settings}
                          onQuote={(q) => setDraft((d) => ({ ...d!, gradingQuote: q }))}
                          onError={(m) => toast(m, "err")} />
                      </div>
                    </div>
                    {draft.gradeNotes?.corners && (
                      <div className="tiny muted" style={{ marginBottom: 12, lineHeight: 1.6 }}>
                        <div><strong>Coins :</strong> {draft.gradeNotes.corners}</div>
                        {draft.gradeNotes.edges && <div><strong>Bords :</strong> {draft.gradeNotes.edges}</div>}
                        {draft.gradeNotes.surface && <div><strong>Surface :</strong> {draft.gradeNotes.surface}</div>}
                      </div>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setTuning(!tuning)} style={{ marginBottom: 14 }}>
                      <Pencil size={13} /> {tuning ? "Masquer les marges" : "Ajuster les marges à la main"}
                    </button>
                    {tuning && (["front", "back"] as const).map((face) => (
                      <div key={face} style={{ marginBottom: 12 }}>
                        <div className="copybox-lbl" style={{ marginBottom: 6 }}>{face === "front" ? "Recto" : "Verso"} — marges en % de la carte</div>
                        <div className="grid2">
                          {(["left", "right", "top", "bottom"] as const).map((sd) => (
                            <input key={sd} className="inp mono" placeholder={sd}
                              value={draft.centering?.[face]?.[sd] ?? ""}
                              onChange={(e) => setDraft({ ...draft, centering: { ...draft.centering, [face]: { ...(draft.centering?.[face] ?? {}), [sd]: e.target.value } } })} />
                          ))}
                        </div>
                      </div>
                    ))}
                    <hr className="hr" />
                  </>
                )}
                {CHECKS.map((c) => (
                  <Field key={c.id} label={c.label}>
                    <Chips options={c.opts.map(([l, v]) => [v as number, l as string])} value={draft.checks[c.id]} onChange={(v) => setCheck(c.id, Number(v))} />
                  </Field>
                ))}
                <hr className="hr" />
                <Field label="Note commerciale">
                  <Chips options={CONDITIONS.map((c) => [c.code, `${c.code} — ${c.label}`])} value={draft.condition}
                    onChange={(v) => setDraft({ ...draft, condition: v, askPrice: draft.marketPrice ? Number((draft.marketPrice * condMult(v)).toFixed(2)) : draft.askPrice })} />
                </Field>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <span className="step-n mono">03</span><h3>Prix</h3>
                <button className="btn btn-sm" style={{ marginLeft: "auto" }} disabled={pricing}
                  onClick={async () => {
                    setPricing(true);
                    try {
                      const r = await ai<any>("price", { card: draft });
                      setDraft((d) => ({ ...d!, marketPrice: num(r.trend) || d!.marketPrice, marketLow: num(r.low), marketSources: r.sources ?? d!.marketSources, marketDate: new Date().toISOString(), askPrice: r.trend ? Number((num(r.trend) * condMult(d!.condition)).toFixed(2)) : d!.askPrice }));
                      toast("Cote mise à jour");
                    } catch (e) { toast((e as Error).message, "err"); }
                    setPricing(false);
                  }}>
                  {pricing ? <Loader2 size={13} className="spin" /> : <Search size={13} />} Chercher la cote
                </button>
              </div>
              <div className="panel-b">
                <div className="grid3">
                  <Field label="Cote (trend)"><input className="inp mono" value={draft.marketPrice || ""} onChange={(e) => setDraft({ ...draft, marketPrice: num(e.target.value) })} /></Field>
                  <Field label="Cote basse"><input className="inp mono" value={draft.marketLow || ""} onChange={(e) => setDraft({ ...draft, marketLow: num(e.target.value) })} /></Field>
                  <Field label="Prix net visé"><input className="inp mono" value={draft.askPrice || ""} onChange={(e) => setDraft({ ...draft, askPrice: num(e.target.value) })} /></Field>
                </div>
                {draft.priceNote && <div className="tiny dim" style={{ marginBottom: 12 }}>{draft.priceNote}</div>}
                {tooLow && (
                  <div className="tag tag-alert" style={{ padding: "8px 11px", marginBottom: 12, display: "flex", gap: 8 }}>
                    <AlertTriangle size={14} /> Sous {eur(settings.minPrice)}, les frais d&apos;envoi mangent la marge. Mets-la de côté pour un lot.
                  </div>
                )}
                <div className="grid3">
                  {CHANNELS.map((ch) => (
                    <div key={ch.id} style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                      <div className="tiny dim">{ch.label}</div>
                      <div className="mono gold" style={{ fontSize: 16, marginTop: 3 }}>{base ? eur(base / (1 - (ch.id === "ebay" ? settings.ebayFee / 100 : ch.fee))) : "—"}</div>
                    </div>
                  ))}
                </div>
                <hr className="hr" />
                {(draft.marketSources ?? []).length > 0 && (
                  <div className="srcs" style={{ marginBottom: 11 }}>
                    {draft.marketSources!.map((s, i) => (
                      <a className="src" key={i} href={s.url || "#"} target="_blank" rel="noreferrer">
                        <span className="src-n">{s.name}</span><span className="mono gold">{s.price ? eur(s.price) : "—"}</span>
                      </a>
                    ))}
                  </div>
                )}
                <div className="copybox-lbl" style={{ marginBottom: 7 }}>Vérifier par toi-même</div>
                <div className="verify">
                  {VERIFY.map((v) => <a key={v.label} href={v.url(draft)} target="_blank" rel="noreferrer"><Search size={12} />{v.label}</a>)}
                </div>
                <hr className="hr" />
                <div className="grid3">
                  <Field label="Prix d'achat"><input className="inp mono" value={draft.buyPrice || ""} onChange={(e) => setDraft({ ...draft, buyPrice: num(e.target.value) })} /></Field>
                  <Field label="Quantité"><input className="inp mono" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: num(e.target.value) })} /></Field>
                  <Field label="Emplacement"><input className="inp" value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Classeur 2 · p.7 · slot 3" /></Field>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <span className="step-n mono">04</span><h3>Annonces</h3>
                <button className="btn btn-sm" style={{ marginLeft: "auto" }} disabled={gen}
                  onClick={async () => {
                    if (!draft.name) { toast("Renseigne au moins le nom", "err"); return; }
                    setGen(true);
                    try {
                      const r = await ai<any>("texts", { card: draft });
                      setDraft((d) => ({ ...d!, titles: { vinted: r.titleVinted ?? "", leboncoin: r.titleLeboncoin ?? "", ebay: r.titleEbay ?? "" }, description: r.description ?? "", keywords: Array.isArray(r.keywords) ? r.keywords : [] }));
                    } catch (e) { toast((e as Error).message, "err"); }
                    setGen(false);
                  }}>
                  {gen ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {hasTexts ? "Régénérer" : "Générer"}
                </button>
              </div>
              <div className="panel-b">
                {!hasTexts && !gen && <div className="dim tiny">Génère titres, description et mots-clés une fois l&apos;identité validée.</div>}
                {hasTexts && (
                  <>
                    {CHANNELS.map((ch) => (
                      <Field key={ch.id} label={`Titre ${ch.label}`}>
                        <input className="inp" value={draft.titles[ch.id] ?? ""} onChange={(e) => setDraft({ ...draft, titles: { ...draft.titles, [ch.id]: e.target.value } })} />
                        <div className={"tiny mono " + ((draft.titles[ch.id] ?? "").length > ch.titleMax ? "neg" : "dim")} style={{ marginTop: 4 }}>
                          {(draft.titles[ch.id] ?? "").length}/{ch.titleMax}
                        </div>
                      </Field>
                    ))}
                    <Field label="Description"><textarea className="inp" rows={8} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
                    <Field label="Mots-clés"><input className="inp" value={draft.keywords.join(", ")} onChange={(e) => setDraft({ ...draft, keywords: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
                  </>
                )}
              </div>
            </div>

            <div className="stickybar">
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>Abandonner</button>
              <button className="btn btn-gold" onClick={save} disabled={!draft.name || saving}>
                {saving ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Enregistrer{queue.length ? " et suivante" : ""}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ================= capture ================= */
  return (
    <div className="page">
      {node}
      <div className="page-head">
        <div className="eyebrow">Scanner</div>
        <h1>Photographie, on s&apos;occupe du reste</h1>
        <p>Le numéro de collection en bas de la carte doit être lisible : c&apos;est lui qui permet l&apos;identification.</p>
      </div>

      {demo ? (
        <div className="demo-bar">
          <span>🧪</span>
          <span style={{ flex: 1 }}>
            <strong>Mode démo actif.</strong> Les analyses renvoient des données d&apos;exemple, instantanées et gratuites.
            Bascule en réel dans Réglages quand tu scannes pour de bon.
          </span>
        </div>
      ) : usage && usage.calls > 0 ? (
        <div className="meter" style={{ marginBottom: 16 }}>
          <span>●</span> {usage.calls} appel{usage.calls > 1 ? "s" : ""} aujourd&apos;hui · environ {usage.cost.toFixed(2)} €
        </div>
      ) : null}

      <div className="chips" style={{ marginBottom: 20 }}>
        <button className={"chip" + (mode === "quick" ? " on" : "")} onClick={() => setMode("quick")}>Rapide — en lot</button>
        <button className={"chip" + (mode === "deep" ? " on" : "")} onClick={() => setMode("deep")}>Expertise — recto/verso</button>
        <button className={"chip" + (mode === "lot" ? " on" : "")} onClick={() => setMode("lot")}>Lot — estimer une annonce</button>
      </div>

      {camera && (
        <Camera label={camera.label} tip={camera.tip}
          onClose={() => setCamera(null)}
          onFallback={() => { setCamera(null); setTimeout(() => camFallback.current?.click(), 60); }}
          onCapture={async (s) => {
            setCamera(null);
            if (mode === "quick") { setDraft(await build(s)); setPhase(null); }
            else setShots((p) => ({ ...p, [camera.id]: s }));
          }} />
      )}

      {phase && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-b" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Loader2 size={16} className="spin" color="var(--gold)" /><span className="tiny">{phase}</span>
          </div>
        </div>
      )}

      {mode === "lot" ? (
        <>
          <p className="muted" style={{ marginTop: -8, marginBottom: 16, maxWidth: "64ch", fontSize: 13.5 }}>
            Photographie ou capture l&apos;annonce du lot que tu convoites. Pristine recense les cartes lisibles, cherche leur cote, et compare au prix demandé.
          </p>
          <div className="grid2" style={{ marginBottom: 16, alignItems: "end" }}>
            <Field label="Prix demandé par le vendeur (€)"><input className="inp mono" value={lotAsk} onChange={(e) => setLotAsk(e.target.value)} placeholder="0.00" /></Field>
            <div style={{ display: "flex", gap: 9, marginBottom: 14 }}>
              <button className="btn" onClick={() => lotRef.current?.click()}><ImagePlus size={14} /> Ajouter des photos</button>
              <input ref={lotRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={async (e) => {
                  const picked = Array.from(e.target.files ?? []).slice(0, 4); e.target.value = "";
                  for (const f of picked) { try { const s = await fileToShot(f); setLotShots((p) => [...p, s]); } catch { /* ignorée */ } }
                }} />
              {lotShots.length > 0 && <button className="btn btn-ghost" onClick={() => { setLotShots([]); setLotFound(null); }}>Vider</button>}
            </div>
          </div>

          {lotShots.length > 0 && (
            <div className="shots" style={{ marginBottom: 16 }}>
              {lotShots.map((s, i) => <div className="shot filled" key={i} style={{ aspectRatio: "1/1" }}><img src={`data:image/jpeg;base64,${s.thumb}`} alt="" /></div>)}
            </div>
          )}

          <button className="btn btn-gold" onClick={readLot} disabled={!lotShots.length || !!lotPhase} style={{ marginBottom: 20 }}>
            {lotPhase ? <Loader2 size={15} className="spin" /> : <ScanLine size={15} />}
            {lotPhase ? (lotPhase.total ? `${lotPhase.label} ${lotPhase.done}/${lotPhase.total}` : lotPhase.label) : "Recenser les cartes"}
          </button>

          {lotFound?.cards?.length > 0 && (
            <div className="panel">
              <div className="panel-h"><h3>{lotFound.cards.length} carte(s) identifiée(s)</h3>
                {lotFound.unreadable > 0 && <span className="tiny dim" style={{ marginLeft: "auto" }}>{lotFound.unreadable} illisible(s)</span>}
              </div>
              <div>
                {lotFound.cards.map((c: any) => {
                  const pr = (lotFound.priced ?? []).find((x: any) => x.key === c.key);
                  return (
                    <div className="line" key={c.key}>
                      <input type="checkbox" checked={!!lotSel[c.key]} onChange={(e) => setLotSel({ ...lotSel, [c.key]: e.target.checked })} />
                      <div className="line-main">
                        <div className="line-title">{c.name}</div>
                        <div className="line-sub mono">{[c.number, c.lang, c.variant].filter(Boolean).join(" · ")}</div>
                      </div>
                      {pr && <span className="mono gold">{pr.marketPrice ? eur(pr.marketPrice) : "—"}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="panel-b" style={{ borderTop: "1px solid var(--line)" }}>
                {!lotFound.priced ? (
                  <button className="btn btn-gold" onClick={priceLot} disabled={!!lotPhase}>
                    {lotPhase ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Estimer la valeur (12 max)
                  </button>
                ) : (() => {
                  const total = lotFound.priced.reduce((a: number, c: any) => a + c.marketPrice, 0);
                  const ask = num(lotAsk), gain = total - ask, ratio = ask > 0 ? total / ask : null;
                  return (
                    <>
                      <div className="ledger"><span className="dim">Valeur cumulée ({lotFound.priced.length} cartes)</span><span className="mono gold">{eur(total)}</span></div>
                      <div className="ledger"><span className="dim">Prix demandé</span><span className="mono">{eur(ask)}</span></div>
                      <div className="ledger" style={{ fontWeight: 600, marginTop: 5 }}>
                        <span>Écart</span><span className={"mono " + (gain >= 0 ? "pos" : "neg")}>{gain >= 0 ? "+" : ""}{eur(gain)}</span>
                      </div>
                      {ratio && (
                        <div className={"tiny " + (ratio >= 1.6 ? "pos" : ratio >= 1.15 ? "gold" : "neg")} style={{ marginTop: 10, fontWeight: 600, lineHeight: 1.5 }}>
                          {ratio >= 1.6 ? `Le lot vaut ${ratio.toFixed(1)}× son prix. Une bonne affaire, sous réserve de l'état réel.`
                            : ratio >= 1.15 ? `Le lot vaut ${ratio.toFixed(1)}× son prix. Marge mince une fois les frais et les invendus déduits — négocie.`
                            : "Le prix demandé dépasse la valeur estimée. Passe ton chemin ou fais une contre-offre."}
                        </div>
                      )}
                      <div className="tiny dim" style={{ marginTop: 8 }}>Cotes en Near Mint. Sur un lot photographié, l&apos;état réel est presque toujours en dessous.</div>
                      <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
                        <button className="btn btn-gold" onClick={importLot}><Check size={14} /> Je l&apos;ai acheté — tout ajouter au stock</button>
                        <button className="btn" onClick={async () => {
                          const wl = await getWishlist();
                          await saveWishlist([{
                            id: crypto.randomUUID(), name: `Lot ${lotFound.priced.length} cartes`, lang: "FR", variant: "Normale",
                            targetBuy: ask, marketPrice: total, marketDate: new Date().toISOString(),
                            note: lotFound.priced.map((c: any) => c.name).slice(0, 6).join(", "), createdAt: new Date().toISOString(),
                          }, ...wl]);
                          toast("Lot ajouté à la wishlist");
                        }}><Star size={14} /> Mettre en wishlist</button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      ) : mode === "deep" ? (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-h"><ScanLine size={15} color="var(--gold)" /><h3>Réussir la prise de vue</h3></div>
            <div className="panel-b">
              <ul className="rules">
                <li><b>1.</b> Carte à plat sur une surface unie, téléphone <b>parfaitement au-dessus</b> — une photo de biais fausse la mesure de centrage.</li>
                <li><b>2.</b> Aligne les quatre bords sur le cadre : c&apos;est ce cadre qui est découpé.</li>
                <li><b>3.</b> Lumière indirecte. Le flash crée des reflets sur le foil.</li>
                <li><b>4.</b> Vérifie que le numéro de collection reste net avant de déclencher.</li>
              </ul>
            </div>
          </div>

          <div className="shots" style={{ marginBottom: 16 }}>
            {SHOTS.map((sh) => (
              <div key={sh.id} style={{ position: "relative" }}>
                <button className={"shot" + (shots[sh.id] ? " filled" : sh.required ? " req" : "")} onClick={() => setCamera(sh)}>
                  {shots[sh.id] ? <img src={`data:image/jpeg;base64,${shots[sh.id].thumb}`} alt="" /> : (
                    <><ImagePlus size={20} /><strong style={{ fontSize: 12.5, color: "var(--paper)" }}>{sh.label}</strong><span>{sh.hint}</span></>
                  )}
                  {shots[sh.id] && <span className="shot-tag">{sh.label}</span>}
                </button>
                {shots[sh.id] && (
                  <button className="shot-x" aria-label={`Retirer ${sh.label}`}
                    onClick={() => setShots((s) => { const n = { ...s }; delete n[sh.id]; return n; })}><X size={13} /></button>
                )}
                {shots[sh.id]?.quality?.warnings[0] && (
                  <div className="warn"><AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />{shots[sh.id].quality.warnings[0]}</div>
                )}
              </div>
            ))}
          </div>

          <input ref={camFallback} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0]; const target = camera; e.target.value = "";
              if (!f || !target) return;
              try { const s = await fileToShot(f); setShots((p) => ({ ...p, [target.id]: s })); } catch { toast("Photo illisible", "err"); }
            }} />

          <button className="btn btn-gold" onClick={analyzeDeep} disabled={!shots.front || !!phase}>
            <ScanLine size={15} /> {confirmBad ? "Analyser quand même" : "Analyser cette carte"}
          </button>
        </>
      ) : (
        <>
          <div className="hero-scan" style={{ marginBottom: 16 }}>
            <button className="shutter" aria-label="Scanner une carte"
              onClick={() => setCamera(SHOTS[0])}>
              <ScanLine size={38} />
            </button>
            <div>
              <h2>Scanne une carte</h2>
              <p>Le viseur cale la carte dans un cadre au bon format et découpe sur ses arêtes — c&apos;est ce qui rend l&apos;identification et la mesure de centrage fiables.</p>
            </div>
          </div>
          <div className="drop">
            <ImagePlus size={30} color="var(--gold)" style={{ marginBottom: 12 }} />
            <h3>Ou dépose des photos</h3>
            <p>Une carte ou cinquante — elles sont traitées à la chaîne et tu valides chaque fiche à la suite.</p>
            <button className="btn btn-gold" onClick={() => fileRef.current?.click()}><Plus size={15} /> Choisir des photos</button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...emptyCard() } as Draft)}>
                <Pencil size={13} /> Ou saisir une carte à la main
              </button>
            </div>
          </div>
          {queue.length > 0 && <div className="tiny dim" style={{ marginTop: 14 }}>{queue.length} photo(s) en attente.</div>}
        </>
      )}
    </div>
  );
}
