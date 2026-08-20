import { type NextRequest, NextResponse } from "next/server";
import { COOKIE, verifyToken } from "@/lib/auth";

/* Tout est verrouillé, y compris /api/ai — sinon un inconnu pourrait faire
   tourner la facture Anthropic sans jamais voir l'interface. */
const OPEN = ["/login", "/api/auth"];

export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const path = request.nextUrl.pathname;

  if (OPEN.some((p) => path.startsWith(p))) return NextResponse.next();

  // Aucun mot de passe configuré : on ferme plutôt que d'ouvrir par défaut.
  if (!password) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("setup", "1");
    return NextResponse.redirect(url);
  }

  if (await verifyToken(request.cookies.get(COOKIE)?.value, password)) {
    return NextResponse.next();
  }

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
