"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Radio, ExternalLink, ChevronRight, Loader2 } from "lucide-react";
import { CHANNELS } from "@/lib/domain";
import { eur, dateFr } from "@/lib/format";
import { db, type Card } from "@/lib/db";

export default function Annonces() {
  const [cards, setCards] = useState<Card[] | null>(null);
  useEffect(() => { db.cards.all().then(setCards); }, []);
  if (!cards) return <div className="page"><div className="empty"><Loader2 size={20} className="spin" /></div></div>;

  const rows: { card: Card; channel: typeof CHANNELS[number]; listing: Card["listings"][string] }[] = [];
  cards.forEach((c) => CHANNELS.forEach((ch) => {
    const l = c.listings?.[ch.id];
    if (l?.status === "listed") rows.push({ card: c, channel: ch, listing: l });
  }));
  const toRemove = rows.filter((r) => r.card.status === "sold");
  const live = rows.filter((r) => r.card.status !== "sold");

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Multi-canal</div>
        <h1>Annonces</h1>
        <p>Vinted et leboncoin n&apos;ouvrent pas leur API : le retrait reste manuel. Ce tableau te dit quoi retirer, où, et avec le lien direct.</p>
      </div>

      {toRemove.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--alert-line)", marginBottom: 20 }}>
          <div className="panel-h" style={{ borderColor: "var(--alert-line)" }}>
            <AlertTriangle size={16} color="var(--coral)" /><h3>À retirer maintenant</h3>
            <span className="mono tiny" style={{ marginLeft: "auto", color: "var(--coral)" }}>{toRemove.length}</span>
          </div>
          <div>
            {toRemove.map((r, i) => (
              <div className="line" key={i}>
                <div className="line-main">
                  <div className="line-title">{r.card.name}</div>
                  <div className="line-sub mono">{r.card.number} · vendue ailleurs · toujours en ligne sur {r.channel.label}</div>
                </div>
                {r.listing.url && <a className="btn btn-sm" href={r.listing.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
                <Link className="btn btn-sm" href={`/stock/${r.card.id}`}>Traiter <ChevronRight size={13} /></Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-h">
          <Radio size={15} color="var(--gold)" /><h3>En ligne</h3>
          <span className="mono tiny dim" style={{ marginLeft: "auto" }}>{live.length}</span>
        </div>
        {live.length === 0 ? (
          <div className="empty" style={{ padding: "40px 20px" }}>
            <h3>Rien en ligne</h3><p>Ouvre une carte du stock, onglet Canaux, puis « Publier ».</p>
          </div>
        ) : (
          <div>
            {live.map((r, i) => (
              <div className="line" key={i}>
                <div className="line-main">
                  <div className="line-title">{r.card.name}</div>
                  <div className="line-sub mono">{r.channel.label} · depuis le {dateFr(r.listing.listedAt)}</div>
                </div>
                <span className="mono gold">{eur(r.listing.price ?? r.card.askPrice)}</span>
                {r.listing.url && <a className="btn btn-ghost btn-sm" href={r.listing.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
                <Link className="btn btn-ghost btn-sm" href={`/stock/${r.card.id}`}><ChevronRight size={14} /></Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
