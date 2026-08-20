"use client";
import { useEffect, useState } from "react";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/* Deux surprises, discrètes : la séquence Konami passe l'interface en
   chromatique, et trois tapes sur le logo font briller la carte. */
export function useKonami(onFound: () => void) {
  useEffect(() => {
    let i = 0;
    const h = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === KONAMI[i]) { i++; if (i === KONAMI.length) { i = 0; onFound(); } }
      else i = k === KONAMI[0] ? 1 : 0;
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFound]);
}

export function useTripleTap(onFound: () => void) {
  const [taps, setTaps] = useState<number[]>([]);
  const tap = () => {
    const now = Date.now();
    const recent = [...taps, now].filter((t) => now - t < 900);
    setTaps(recent);
    if (recent.length >= 3) { setTaps([]); onFound(); }
  };
  return tap;
}
