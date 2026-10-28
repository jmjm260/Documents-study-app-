// SOLO DESARROLLO: cambiar este navegador a una identidad de PRUEBA (y volver), para probar el SAT sin tocar
// el historial real. Guarda la identidad real en otra cookie para restaurarla. No sabe respuestas ni toca el reloj.
// Bloqueada fuera de `next dev` y de localhost.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const COOKIE = "tocorito_device";
const SAVED = "tocorito_device_real";

function allowed(request: Request) {
  const host = new URL(request.url).hostname;
  return process.env.NODE_ENV === "development" && (host === "localhost" || host === "127.0.0.1");
}

const read = (request: Request, name: string) => request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;

export async function POST(request: Request) {
  if (!allowed(request)) return NextResponse.json({ error: "No disponible." }, { status: 404 });
  const { action } = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string };
  const res = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 };
  if (action === "test") {
    const real = read(request, SAVED) ?? read(request, COOKIE);
    if (real) res.cookies.set(SAVED, real, opts);
    res.cookies.set(COOKIE, `test-${randomUUID()}`, opts);
  } else if (action === "restore") {
    const real = read(request, SAVED);
    if (!real) return NextResponse.json({ error: "No hay identidad real guardada." }, { status: 400 });
    res.cookies.set(COOKIE, real, { ...opts, maxAge: 60 * 60 * 24 * 365 * 2 });
    res.cookies.delete(SAVED);
  } else {
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }
  return res;
}
