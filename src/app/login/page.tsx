"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import Logo from "@/components/Logo";
import { Field } from "@/components/ui";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const setup = params.get("setup") === "1";
  const next = params.get("next") ?? "/";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Échec");
      else { router.push(next); router.refresh(); }
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
            {error && <div className="tiny" style={{ color: "var(--coral)", marginBottom: 10 }}>{error}</div>}
            <button className="btn btn-gold btn-block" onClick={submit} disabled={busy || !password}>
              {busy ? <Loader2 size={15} className="spin" /> : <Lock size={15} />} Entrer
            </button>
            <p className="tiny dim" style={{ marginTop: 18, lineHeight: 1.5 }}>
              La session reste ouverte 30 jours sur cet appareil. Changer le mot de passe
              déconnecte immédiatement partout ailleurs.
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
