import { NextResponse } from "next/server";
import { claude, extractJson, img } from "@/lib/anthropic";
import * as P from "@/lib/prompts";

// Plafond de durée de la fonction. 60 s est le maximum du plan gratuit Vercel ;
// au-delà, la valeur est ignorée et la fonction est coupée bien plus tôt.
export const maxDuration = 60;

/* Point d'entrée unique des analyses. La clé Anthropic ne quitte jamais le serveur. */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY absente — renseigne-la dans .env.local ou sur Vercel." }, { status: 500 });
  }

  let body: { action?: string; card?: Record<string, unknown>; images?: string[]; framed?: boolean; grade?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }

  const { action, card = {}, images = [], framed, grade = 8 } = body;

  try {
    let raw: string;
    switch (action) {
      case "identify":
        if (!images[0]) throw new Error("Photo manquante");
        raw = await claude([img(images[0]), { type: "text", text: P.identifyPrompt() }], { system: P.SYSTEM_EXPERT });
        break;
      case "centering":
        if (!images[0]) throw new Error("Photo manquante");
        raw = await claude(
          [...images.filter(Boolean).map(img), { type: "text", text: P.centeringPrompt(images.length > 1, images.length > 2, !!framed) }],
          { system: P.SYSTEM_GRADER });
        break;
      case "price":
        raw = await claude(P.pricePrompt(card), { search: true });
        break;
      case "graded":
        raw = await claude(P.gradedPrompt(card, grade), { search: true });
        break;
      case "texts":
        raw = await claude(P.textsPrompt(card), { system: P.SYSTEM_SELLER, maxTokens: 3000 });
        break;
      case "bundle":
        raw = await claude(P.bundlePrompt(card as never), { system: P.SYSTEM_SELLER, maxTokens: 3000 });
        break;
      case "lot":
        if (!images.length) throw new Error("Photos manquantes");
        raw = await claude([...images.map(img), { type: "text", text: P.lotPrompt() }], { system: P.SYSTEM_EXPERT, maxTokens: 3000 });
        break;
      default:
        return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }

    const result = extractJson<Record<string, unknown>>(raw);
    if (action === "price" && Array.isArray(result.sources)) {
      result.sources = (result.sources as { name?: string }[]).filter((s) => s?.name).slice(0, 4);
    }
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
