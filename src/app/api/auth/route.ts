import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, digest, issueToken, safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "APP_PASSWORD n'est pas configurée sur le serveur." }, { status: 500 });
  }

  const { password: given } = await req.json().catch(() => ({ password: "" }));

  // On compare les empreintes, pas les chaînes : longueurs égales garanties.
  const ok = safeEqual(await digest(String(given ?? "")), await digest(password));

  // Petite temporisation sur échec : rend une attaque par force brute
  // pénible. La vraie protection reste un mot de passe long.
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await issueToken(password), cookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
