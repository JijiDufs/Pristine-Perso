/* Verrou d'accès à un seul utilisateur : toi.
   Le cookie porte un jeton signé (HMAC-SHA256) et une date d'expiration.
   La clé de signature dérive du mot de passe : le changer invalide donc
   toutes les sessions ouvertes, ce qui est exactement le comportement voulu. */

export const COOKIE = "pristine_auth";
const DAYS = 30;

const enc = new TextEncoder();

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

export async function digest(value: string) {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

/** Comparaison à durée constante : une comparaison naïve laisse fuiter le
 *  mot de passe caractère par caractère via le temps de réponse. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(secret: string) {
  const exp = String(Date.now() + DAYS * 86400_000);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifyToken(token: string | undefined, secret: string) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret, exp));
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DAYS * 86400,
};
