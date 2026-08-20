"use client";
import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { centeringRatio, fmtRatio, estimateGrade, GRADERS, num, type Margins } from "@/lib/domain";
import { eur } from "@/lib/format";
import { ai } from "@/lib/ai";
import type { Card, Settings } from "@/lib/db";

export function Sparkline({ data }: { data?: { d: string; v: number }[] }) {
  if (!data || data.length < 2) return null;
  const vals = data.map((d) => d.v);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = data.map((d, i) => `${((i / (data.length - 1)) * 100).toFixed(2)},${(26 - ((d.v - min) / span) * 22).toFixed(2)}`);
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "var(--mint)" : "var(--coral)";
  return (
    <div>
      <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
        <polyline points={`0,30 ${pts.join(" ")} 100,30`} fill={up ? "var(--t-sold)" : "var(--t-alert)"} stroke="none" />
        <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="viz-row">
        <span className="dim">{data[0].d.slice(5)} · {eur(vals[0])}</span>
        <span className="mono" style={{ color: stroke }}>
          {up ? "+" : ""}{(((vals[vals.length - 1] - vals[0]) / (vals[0] || 1)) * 100).toFixed(0)} %
        </span>
        <span className="dim">{eur(vals[vals.length - 1])}</span>
      </div>
    </div>
  );
}

export function CenteringViz({ m, label }: { m: Margins; label: string }) {
  const r = centeringRatio(m);
  if (!r || !m) return (
    <div className="viz">
      <div className="viz-card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="tiny dim" style={{ padding: 10, textAlign: "center" }}>Non mesurable</span>
      </div>
      <div className="viz-row"><span className="dim">{label}</span></div>
    </div>
  );
  return (
    <div className="viz">
      <div className="viz-card">
        <div className="viz-inner" style={{ inset: `${num(m.top)}% ${num(m.right)}% ${num(m.bottom)}% ${num(m.left)}%` }} />
      </div>
      <div className="viz-row"><span className="dim">{label}</span><span className="mono">↔ {fmtRatio(r.h)}</span></div>
      <div className="viz-row"><span className="dim">vertical</span><span className="mono">↕ {fmtRatio(r.v)}</span></div>
    </div>
  );
}

export function GradingPanel({ card, settings, onQuote, onError }: {
  card: Pick<Card, "centering" | "checks" | "lang" | "marketPrice" | "name" | "number" | "set" | "variant" | "condition" | "gradingQuote">;
  settings: Settings;
  onQuote?: (q: Record<string, unknown>) => void;
  onError?: (m: string) => void;
}) {
  const est = estimateGrade(card);
  const [quote, setQuote] = useState<any>(card.gradingQuote ?? null);
  const [busy, setBusy] = useState(false);
  if (!est) return null;

  const isFR = card.lang === "FR";
  const raw = quote && num(quote.raw) ? num(quote.raw) : num(card.marketPrice);

  const routes = GRADERS.filter((g) => !g.frOnly || isFR).map((g) => {
    const cost = num((settings as any)[g.id + "Fee"]) + num((settings as any)[g.id + "Ship"]);
    const weeks = num((settings as any)[g.id + "Weeks"]) || 1;
    const low = quote ? num(quote[g.id + "Low"]) : 0;
    const high = quote ? num(quote[g.id + "High"]) : 0;
    const gainLow = low ? low - raw - cost : null;
    const gainHigh = high ? high - raw - cost : null;
    return { ...g, cost, weeks, low, high, gainLow, gainHigh, perMonth: gainLow != null ? gainLow / (weeks / 4.33) : null };
  });

  const priced = routes.filter((r) => r.gainLow != null);
  const best = priced.length ? priced.reduce((a, b) => (b.gainLow! > a.gainLow! ? b : a)) : null;

  const run = async () => {
    setBusy(true);
    try {
      const d = await ai<Record<string, unknown>>("graded", { card, grade: est.high });
      setQuote(d); onQuote?.(d);
    } catch (e) { onError?.((e as Error).message); }
    setBusy(false);
  };

  let verdict: { tone: string; text: string } | null = null;
  if (best) {
    if (best.gainLow! > 0) verdict = { tone: "pos", text: `${best.label} est le bon choix : rentable dès la note ${est.high}, soit ${eur(best.gainLow)} nets au minimum, pour ${best.weeks} semaines d'immobilisation.` };
    else if (priced.some((r) => (r.gainHigh ?? 0) > 0)) {
      const g = priced.filter((r) => (r.gainHigh ?? 0) > 0).reduce((a, b) => (b.gainHigh! > a.gainHigh! ? b : a));
      verdict = { tone: "gold", text: `C'est un pari. Chez ${g.label}, tu ne gagnes que si elle sort en ${Math.min(10, est.high + 1)} (${eur(g.gainHigh)}) ; en ${est.high} tu perds ${eur(Math.abs(g.gainLow!))}.` };
    } else verdict = { tone: "neg", text: "Aucune voie n'est rentable à cette valeur. Revends-la brute." };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="grade">
        <div className="grade-n">{est.low}–{est.high}</div>
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 13 }}>Fourchette estimée, plafonnée par {est.limiter}.</div>
          <div className="tiny dim" style={{ marginTop: 3 }}>
            {est.partial ? "Mesure partielle : ajoute le verso pour affiner." : "Estimation indicative — un grader officiel peut trancher autrement."}
          </div>
        </div>
        <button className="btn btn-sm" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={13} className="spin" /> : <Search size={13} />} {quote ? "Réactualiser" : "Vaut-il le coup ?"}
        </button>
      </div>

      {quote && (
        <>
          <div className="ledger" style={{ padding: "0 2px" }}>
            <span className="dim">Valeur brute de référence</span><span className="mono">{eur(raw)}</span>
          </div>
          <div className="graders">
            {routes.map((r) => (
              <div className={"grader" + (best && best.id === r.id && r.gainLow! > 0 ? " best" : "")} key={r.id}>
                <div className="grader-h"><strong>{r.label}</strong><span>{r.country} · {r.weeks} sem.</span></div>
                <div className="ledger"><span className="dim">Coût total</span><span className="mono neg">−{eur(r.cost)}</span></div>
                <div className="ledger"><span className="dim">Note {est.high}</span><span className="mono">{r.low ? eur(r.low) : "—"}</span></div>
                <div className="ledger"><span className="dim">Note {Math.min(10, est.high + 1)}</span><span className="mono">{r.high ? eur(r.high) : "—"}</span></div>
                <hr className="hr" style={{ margin: "9px 0" }} />
                <div className="ledger" style={{ fontWeight: 600 }}>
                  <span>Gain net</span>
                  <span className="mono">
                    {r.gainLow == null ? "—" : (
                      <>
                        <span className={r.gainLow >= 0 ? "pos" : "neg"}>{r.gainLow >= 0 ? "+" : ""}{eur(r.gainLow)}</span>
                        {r.gainHigh != null && <><span className="dim"> → </span><span className={r.gainHigh >= 0 ? "pos" : "neg"}>{r.gainHigh >= 0 ? "+" : ""}{eur(r.gainHigh)}</span></>}
                      </>
                    )}
                  </span>
                </div>
                {r.perMonth != null && (
                  <div className="ledger"><span className="dim">Par mois immobilisé</span>
                    <span className={"mono " + (r.perMonth >= 0 ? "pos" : "neg")}>{r.perMonth >= 0 ? "+" : ""}{eur(r.perMonth)}</span></div>
                )}
                <div className="tiny dim" style={{ marginTop: 8, lineHeight: 1.45 }}>{r.note}</div>
              </div>
            ))}
          </div>
          {verdict && <div className={"tiny " + verdict.tone} style={{ fontWeight: 600, lineHeight: 1.55 }}>{verdict.text}</div>}
          {!isFR && <div className="tiny dim">Carte non française : PCA n&apos;est pas proposé, sa cote se fait surtout sur le marché francophone.</div>}
        </>
      )}
    </div>
  );
}
