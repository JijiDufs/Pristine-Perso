"use client";
import { useId } from "react";

/* Une carte dont le foil traverse la diagonale, un P évidé dedans. */
export default function Logo({ size = 26 }: { size?: number }) {
  const raw = useId().replace(/:/g, "");
  return (
    <svg width={size} height={Math.round(size * 1.16)} viewBox="0 0 44 51" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`g${raw}`} x1="2" y1="48" x2="42" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7FE3FF" />
          <stop offset=".34" stopColor="#A98CFF" />
          <stop offset=".68" stopColor="#FF9AD5" />
          <stop offset="1" stopColor="#FFD98E" />
        </linearGradient>
        <clipPath id={`c${raw}`}><rect x="3.2" y="3.2" width="37.6" height="44.6" rx="6" /></clipPath>
      </defs>
      <rect x="3.2" y="3.2" width="37.6" height="44.6" rx="6" fill="var(--slate)" stroke="var(--gold)" strokeWidth="2.4" />
      <g clipPath={`url(#c${raw})`}>
        <path d="M-8 38 L28 -6 L46 9 L10 53 Z" fill={`url(#g${raw})`} opacity=".9" />
      </g>
      <path d="M16 35V16h7a5.5 5.5 0 0 1 0 11h-7" stroke="var(--slate)" strokeWidth="3.4"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
