"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ScanLine, Package, Radio, Star, ImagePlus,
  ShoppingBag, Settings2, Plus, ChevronRight, Sun, Moon, LogOut,
} from "lucide-react";
import Logo from "./Logo";
import { db, getSettings, saveSettings, getDemo, type Settings } from "@/lib/db";
import { FxProvider, XpBar, useFx } from "./Fx";
import { useKonami, useTripleTap } from "./Eggs";
import { eur } from "@/lib/format";

const NAV = [
  { href: "/", label: "Accueil", full: "Tableau de bord", icon: LayoutDashboard },
  { href: "/scan", label: "Scanner", full: "Scanner", icon: ScanLine },
  { href: "/stock", label: "Stock", full: "Stock", icon: Package },
  { href: "/annonces", label: "Annonces", full: "Annonces", icon: Radio },
  { href: "/lots", label: "Lots", full: "Lots et invendus", icon: ShoppingBag },
  { href: "/wishlist", label: "Wishlist", full: "Wishlist", icon: Star },
  { href: "/studio", label: "Studio", full: "Studio photo", icon: ImagePlus },
  { href: "/reglages", label: "Réglages", full: "Réglages", icon: Settings2 },
];
const PRIMARY = ["/", "/scan", "/stock", "/annonces"];

export default function Shell({ children }: { children: React.ReactNode }) {
  return <FxProvider><Inner>{children}</Inner></FxProvider>;
}

function Inner({ children }: { children: React.ReactNode }) {
  const { game } = useFx();
  const [chroma, setChroma] = useState(false);
  const [spin, setSpin] = useState(false);
  const [demo, setDemo] = useState(true);
  useKonami(() => setChroma((c) => !c));
  const tapLogo = useTripleTap(() => { setSpin(true); setTimeout(() => setSpin(false), 600); });
  const path = usePathname();
  const [plus, setPlus] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [stock, setStock] = useState({ value: 0, held: 0, total: 0 });

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setTheme(s.theme);
      setDemo(await getDemo());
      const cards = await db.cards.all();
      const held = cards.filter((c) => c.status !== "sold");
      setStock({ value: held.reduce((a, c) => a + Number(c.marketPrice || 0), 0), held: held.length, total: cards.length });
    })();
  }, [path]);

  const setT = async (t: string) => {
    setTheme(t);
    const s: Settings = await getSettings();
    await saveSettings({ ...s, theme: t });
  };

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE", cache: "no-store" });
    // Rechargement complet : vide le cache du routeur et celui du navigateur,
    // pour qu'aucune page protégée ne puisse être resservie après coup.
    window.location.replace("/login");
  };

  // La page de connexion n'a ni barre latérale ni navigation.
  if (path === "/login") return <div className="app" data-theme={theme}>{children}</div>;

  const logoFx = { animation: spin ? "flip .6s ease" : undefined, filter: chroma ? "hue-rotate(140deg) saturate(1.5)" : undefined };

  return (
    <div className="app" data-theme={theme}>
      <div className="shell">
        <aside className="rail">
          <div className="rail-top" style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span onClick={tapLogo} style={{ cursor: "pointer", lineHeight: 0, ...logoFx }}><Logo size={30} /></span>
            <div style={{ flex: 1 }}>
              <div className="wordmark">PRISTINE</div>
              <div className="wordmark-sub">Console de revente</div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={"nav-item" + (path === n.href ? " on" : "")}>
                <n.icon size={16} />{n.full}<span className="nav-bar" />
              </Link>
            ))}
          </nav>
          <div className="rail-foot">
            <div className="rail-foot-lbl">Valeur du stock</div>
            <div className="rail-foot-val display mono">{eur(stock.value)}</div>
            <div className="tiny dim mono" style={{ marginTop: 3 }}>
              {String(stock.held).padStart(3, "0")}/{String(stock.total).padStart(3, "0")} cartes
            </div>
            <XpBar game={game} />
            {demo && <div className="tiny gold" style={{ marginTop: 10 }}>● Mode démo — aucun appel facturé</div>}
            <div className="themeswitch" style={{ marginTop: 13 }}>
              <button className={theme === "dark" ? "on" : ""} onClick={() => setT("dark")}><Moon size={13} /> Nuit</button>
              <button className={theme === "light" ? "on" : ""} onClick={() => setT("light")}><Sun size={13} /> Jour</button>
            </div>
            <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 9 }} onClick={logout}>
              <LogOut size={13} /> Verrouiller
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <span onClick={tapLogo} style={{ cursor: "pointer", lineHeight: 0, ...logoFx }}><Logo size={24} /></span>
            <div className="wordmark" style={{ flex: 1 }}>PRISTINE</div>
            {game && <span className="tiny mono" style={{ color: "var(--gold)" }}>{game.xp} XP</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => setT(theme === "dark" ? "light" : "dark")} aria-label="Changer de thème">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </header>
          {children}
        </main>
      </div>

      <nav className="tabbar">
        {NAV.filter((n) => PRIMARY.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} className={"tab" + (path === n.href ? " on" : "")}>
            <n.icon size={18} />{n.label}
          </Link>
        ))}
        <button className={"tab" + (!PRIMARY.includes(path) ? " on" : "")} onClick={() => setPlus(true)}>
          <Plus size={18} />Plus
        </button>
      </nav>

      {plus && (
        <div className="sheet" onMouseDown={(e) => e.target === e.currentTarget && setPlus(false)}>
          <div className="sheet-in">
            <div className="sheet-grab" />
            {NAV.filter((n) => !PRIMARY.includes(n.href)).map((n) => (
              <Link key={n.href} href={n.href} className={"nav-item" + (path === n.href ? " on" : "")} onClick={() => setPlus(false)}>
                <n.icon size={17} />{n.full}
                <ChevronRight size={15} style={{ marginLeft: "auto", opacity: .4 }} />
              </Link>
            ))}
            <button className="nav-item" onClick={logout}><LogOut size={17} />Verrouiller</button>
          </div>
        </div>
      )}
    </div>
  );
}
