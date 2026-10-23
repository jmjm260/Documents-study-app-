// Quién es el usuario. Todavía no hay cuentas: cada dispositivo recibe un id anónimo en una cookie
// (httpOnly, no la puede leer el JavaScript de la página). Cuando haya login, aquí se devolverá
// el id real de la cuenta y el resto de la API no cambia.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const COOKIE = "tocorito_device";
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const TWO_YEARS = 60 * 60 * 24 * 365 * 2;

export function identify(request: Request): { userId: string; isNew: boolean } {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const existing = match?.[1];
  if (existing && ID_RE.test(existing)) return { userId: existing, isNew: false };
  return { userId: randomUUID(), isNew: true };
}

/** Respuesta JSON que, si el dispositivo es nuevo, también guarda su id en la cookie. */
export function jsonFor(identity: { userId: string; isNew: boolean }, body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  if (identity.isNew) {
    res.cookies.set(COOKIE, identity.userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TWO_YEARS,
    });
  }
  return res;
}
