"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Package, Search, MapPin, ShoppingBag, Loader2 } from "lucide-react";
import { StatusTag } from "@/components/ui";
import { eur } from "@/lib/format";
import { db, type Card } from "@/lib/db";

export default function Stock() {
  const [cards, setCards] = useState<Card[]>([]);
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, images] = await Promise.all([db.cards.all(), db.images.all()]);
      c.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      setCards(c);
      const map: Record<string, string> = {};
      images.forEach((i) => { if (i.front) map[i.id] = i.front; });
      setImgs(map);
      setReady(true);
    })();
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards
      .filter((c) => filter === "all" || c.status === filter)
      .filter((c) => !s || [c.name, c.set, c.number, c.location].some((f) => (f ?? "").toLowerCase().includes(s)));
  }, [cards, q, filter]);

  const counts = {
    all: cards.length,
    stock: cards.filter((c) => c.status === "stock").length,
    listed: cards.filter((c) => c.status === "listed").length,
    sold: cards.filter((c) => c.status === "sold").length,
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="eyebrow">Classeur</div>
        <h1>Stock</h1>
        <p>Chaque pochette porte son emplacement physique : quand une carte se vend, tu sais où la trouver.</p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 210 }}>
          <Search size={15} color="var(--dim)" style={{ position: "absolute", left: 12, top: 11 }} />
          <input className="inp" style={{ paddingLeft: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, numéro, extension, emplacement…" />
        </div>
        <div className="chips">
          {([["all", "Tout"], ["stock", "En stock"], ["listed", "En ligne"], ["sold", "Vendues"]] as const).map(([id, lbl]) => (
            <button key={id} className={"chip" + (filter === id ? " on" : "")} onClick={() => setFilter(id)}>
              {lbl} <span className="mono" style={{ opacity: .65 }}>{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {!ready ? <div className="empty"><Loader2 size={20} className="spin" /></div>
        : rows.length === 0 ? (
        <div className="empty">
          <Package size={30} style={{ marginBottom: 12, opacity: .5 }} />
          <h3>{cards.length ? "Aucune carte ne correspond" : "Le classeur est vide"}</h3>
          <p>{cards.length ? "Change de filtre ou vide la recherche." : "Passe par le Scanner pour ajouter ta première carte."}</p>
          {!cards.length && <Link className="btn btn-gold" style={{ marginTop: 16 }} href="/scan">Scanner une carte</Link>}
        </div>
      ) : (
        <div className="binder">
          {rows.map((c) => (
            <Link className="pocket" key={c.id} href={`/stock/${c.id}`}>
              <div className="pocket-img">
                {imgs[c.id] ? <img src={`data:image/jpeg;base64,${imgs[c.id]}`} alt="" />
                  : c.imageUrl ? <img src={c.imageUrl} alt="" />
                  : <Package size={22} color="var(--dim)" />}
              </div>
              <div>
                <div className="pocket-name">{c.name}</div>
                <div className="pocket-meta"><span className="mono">{c.number ?? "—"}</span><span>{c.lang} · {c.condition}</span></div>
                {c.location && <div className="pocket-meta" style={{ marginTop: 3 }}><MapPin size={10} /><span style={{ flex: 1 }}>{c.location}</span></div>}
              </div>
              <div className="pocket-foot">
                {c.lotId && c.status !== "sold" ? <span className="tag tag-listed"><ShoppingBag size={10} /> En lot</span> : <StatusTag status={c.status} />}
                <span className="pocket-price mono">{c.askPrice ? eur(c.askPrice) : "—"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
