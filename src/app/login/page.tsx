"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import Logo from "@/components/Logo";
import { Field } from "@/components/ui";

function Form() {
  const params = useSearchParams();
  const setup = params.get("setup") === "1";
  const next = params.get("next") ?? "/";
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, remember }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Échec");
      // Navigation dure : elle vide le cache client du routeur, qui pourrait
      // sinon resservir une page rendue avant la connexion.
      else window.location.href = next;
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 22 }}>
          <Logo size={30} />
          <div>
            <div className="wordmark">PRISTINE</div>
            <div className="wordmark-sub">Console de revente</div>
          </div>
        </div>

        {setup ? (
          <div className="alertbox">
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <AlertTriangle size={16} color="var(--coral)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="tiny" style={{ lineHeight: 1.6 }}>
                <strong>Aucun mot de passe configuré.</strong><br />
                Ajoute <code className="mono">APP_PASSWORD</code> dans <code className="mono">.env.local</code>
                {" "}ou dans les variables d&apos;environnement Vercel, puis redéploie.
                Tant qu&apos;elle est absente, l&apos;application reste fermée.
              </div>
            </div>
          </div>
        ) : (
          <>
            <Field label="Mot de passe">
              <input className="inp" type="password" autoFocus autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
            </Field>
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", marginBottom: 14 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13 }}>Se souvenir de cet appareil
                <span className="tiny dim" style={{ display: "block", marginTop: 2 }}>
                  Connexion conservée 60 jours. Décoche sur un appareil qui n&apos;est pas le tien :
                  la session se ferme alors avec le navigateur.
                </span>
              </span>
            </label>
            {error && <div className="tiny" style={{ color: "var(--coral)", marginBottom: 10 }}>{error}</div>}
            <button className="btn btn-gold btn-block" onClick={submit} disabled={busy || !password}>
              {busy ? <Loader2 size={15} className="spin" /> : <Lock size={15} />} Entrer
            </button>
            <p className="tiny dim" style={{ marginTop: 18, lineHeight: 1.5 }}>
              Changer <code className="mono">APP_PASSWORD</code> déconnecte immédiatement
              tous les appareils, partout.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={<div className="auth"><Loader2 size={22} className="spin" /></div>}><Form /></Suspense>;
}
