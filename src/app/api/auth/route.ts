import { NextResponse } from "next/server";
import { COOKIE, NO_STORE, SESSION_DAYS, cookieOptions, digest, issueToken, safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "APP_PASSWORD n'est pas configurée sur le serveur." }, { status: 500 });
  }

  const { password: given, remember } = await req.json().catch(() => ({ password: "", remember: false }));

  // On compare les empreintes, pas les chaînes : longueurs égales garanties.
  const ok = safeEqual(await digest(String(given ?? "")), await digest(password));

  // Temporisation sur échec : rend une attaque par force brute pénible.
  // La vraie protection reste un mot de passe long.
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  const keep = !!remember;
  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", NO_STORE);
  res.cookies.set(COOKIE, await issueToken(password, keep ? SESSION_DAYS.remember : SESSION_DAYS.session), cookieOptions(keep));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", NO_STORE);
  // Effacement en deux temps : certains navigateurs ignorent l'un ou l'autre.
  res.cookies.set(COOKIE, "", { ...cookieOptions(true), maxAge: 0, expires: new Date(0) });
  res.cookies.delete(COOKIE);
  return res;
}
