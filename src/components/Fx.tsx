"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { levelOf, award, BADGES, type BadgeId, type Game } from "@/lib/game";
import { getGame, saveGame } from "@/lib/db";

type Fx = {
  game: Game | null;
  /** Attribue de l'XP et déclenche les animations correspondantes. */
  grant: (amount: number, badges?: BadgeId[]) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Fx>({ game: null, grant: async () => {}, refresh: async () => {} });
export const useFx = () => useContext(Ctx);

const PALETTE = ["#7FE3FF", "#A98CFF", "#FF9AD5", "#FFD98E", "#8FF0C4", "#E5B45C"];

export function FxProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<Game | null>(null);
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const [confetti, setConfetti] = useState(0);
  const [banner, setBanner] = useState<{ big: string; sub: string; icon?: string } | null>(null);

  const refresh = useCallback(async () => setGame(await getGame()), []);
  useEffect(() => { refresh(); }, [refresh]);

  const grant = useCallback(async (amount: number, badges: BadgeId[] = []) => {
    const current = await getGame();
    const r = award(current, amount, badges);
    await saveGame(r.game);
    setGame(r.game);

    const id = Date.now();
    setPops((p) => [...p, { id, text: `+${r.gained} XP` }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1900);

    if (r.levelUp) {
      setConfetti((c) => c + 1);
      setBanner({ big: r.levelUp.name, sub: "Nouveau palier atteint", icon: "🎉" });
      setTimeout(() => setBanner(null), 3400);
    } else if (r.badges.length) {
      const b = BADGES.find((x) => x.id === r.badges[0])!;
      setConfetti((c) => c + 1);
      setBanner({ big: b.name, sub: "Badge débloqué", icon: b.icon });
      setTimeout(() => setBanner(null), 3200);
    }
  }, []);

  return (
    <Ctx.Provider value={{ game, grant, refresh }}>
      {children}
      <div className="fx-layer" aria-live="polite">
        {pops.map((p) => <div className="fx-xp" key={p.id}>{p.text}</div>)}
        {confetti > 0 && Array.from({ length: 34 }).map((_, i) => (
          <span className="fx-confetti" key={`${confetti}-${i}`}
            style={{
              left: `${Math.random() * 100}%`,
              background: PALETTE[i % PALETTE.length],
              animationDelay: `${Math.random() * 0.5}s`,
              animationDuration: `${1.9 + Math.random() * 1.1}s`,
            }} />
        ))}
      </div>
      {banner && (
        <div className="fx-banner" role="status">
          <div style={{ fontSize: 30 }}>{banner.icon}</div>
          <div className="big gold" style={{ marginTop: 6 }}>{banner.big}</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>{banner.sub}</div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Barre de progression du palier, affichée dans la barre latérale. */
export function XpBar({ game }: { game: Game | null }) {
  if (!game) return null;
  const l = levelOf(game.xp);
  return (
    <div className="xp">
      <div className="xp-head">
        <span className="xp-rank" style={{ color: l.color }}>{l.name}</span>
        <span className="mono dim">{game.xp} XP</span>
      </div>
      <div className="xp-track">
        <div className="xp-fill" style={{ width: `${l.ratio * 100}%`, background: l.color }} />
      </div>
      <div className="xp-head" style={{ marginTop: 5, marginBottom: 0 }}>
        <span className="dim">{l.max ? "Palier maximal" : `${l.toNext} XP avant ${LEVEL_NEXT(l.index)}`}</span>
        {game.streak > 1 && <span className="streak">🔥 {game.streak} j</span>}
      </div>
    </div>
  );
}

import { LEVELS } from "@/lib/game";
const LEVEL_NEXT = (i: number) => LEVELS[i + 1]?.name ?? "";
