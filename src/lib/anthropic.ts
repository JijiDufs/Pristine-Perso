/* Appels Anthropic. Uniquement côté serveur : la clé ne doit jamais partir
   dans le navigateur. */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

type ApiBlock = { type: string; text?: string };
type ApiResponse = {
  content?: ApiBlock[];
  stop_reason?: string;
  error?: { message?: string };
  model?: string;
};

async function call(content: string | Block[], opts: { system?: string; search?: boolean }, maxTokens: number) {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  };
  if (opts.system) body.system = opts.system;
  if (opts.search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  let data: ApiResponse;
  try { data = (await res.json()) as ApiResponse; }
  catch { throw new Error(`Réponse illisible de l'API (HTTP ${res.status})`); }

  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Erreur API Anthropic (HTTP ${res.status}) — vérifie ANTHROPIC_API_KEY et ANTHROPIC_MODEL.`);
  }

  const blocks = data.content ?? [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
  return { text, stop: data.stop_reason, kinds: [...new Set(blocks.map((b) => b.type))] };
}

export async function claude(
  content: string | Block[],
  opts: { system?: string; search?: boolean; maxTokens?: number } = {}
): Promise<string> {
  const budget = opts.maxTokens ?? 2000;
  let out = await call(content, opts, budget);

  /* Aucun texte alors que le plafond de jetons a été atteint : la réponse a été
     coupée avant d'être écrite. On relance une fois avec le double de marge
     plutôt que de renvoyer une erreur incompréhensible à l'utilisateur. */
  if (!out.text && out.stop === "max_tokens" && budget <= 2000) {
    out = await call(content, opts, Math.min(budget * 2, 4000));
  }

  if (!out.text) {
    throw new Error(
      `Le modèle n'a renvoyé aucun texte (arrêt : ${out.stop ?? "inconnu"}, blocs : ${out.kinds.join(", ") || "aucun"}). ` +
      "Vérifie ANTHROPIC_MODEL et le solde de ton compte Anthropic."
    );
  }
  return out.text;
}

export function extractJson<T = Record<string, unknown>>(text: string): T {
  if (!text) throw new Error("Réponse vide");
  const t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1) {
    throw new Error(`Format inattendu — le modèle a répondu : « ${t.slice(0, 120)}… »`);
  }
  try { return JSON.parse(t.slice(a, b + 1)) as T; }
  catch { throw new Error("JSON incomplet — la réponse a probablement été tronquée. Réessaie."); }
}

export const img = (data: string): Block => ({
  type: "image",
  source: { type: "base64", media_type: "image/jpeg", data },
});

export const modelName = () => MODEL;
