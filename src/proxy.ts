import { NextResponse, type NextRequest } from "next/server";

/**
 * Cookie funcional de sesión de invitado (httpOnly), necesaria para que solo quien preparó una consulta pueda verla.
 * Se crea únicamente al entrar al carrito: antes de poder preparar una consulta ya existe, así un doble envío
 * simultáneo comparte la misma sesión. No se usa para analítica ni seguimiento.
 */
export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("consulta_sid")) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    res.cookies.set("consulta_sid", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return res;
}

export const config = { matcher: ["/carrito", "/carrito/:path*"] };
