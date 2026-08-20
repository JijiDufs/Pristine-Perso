import { NextResponse } from "next/server";
import { claude, modelName } from "@/lib/anthropic";

/* Diagnostic : vérifie d'un coup la clé, le modèle et la connexion. */
export async function GET() {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
    return NextResponse.json({ ok: false, model: modelName(), erreur: "ANTHROPIC_API_KEY absente des variables d'environnement." }, { status: 500 });
  }
  try {
    const text = await claude("Réponds exactement : OK", { maxTokens: 20 });
    return NextResponse.json({ ok: true, model: modelName(), reponse: text.slice(0, 40) });
  } catch (e) {
    return NextResponse.json({ ok: false, model: modelName(), erreur: (e as Error).message }, { status: 502 });
  }
}
