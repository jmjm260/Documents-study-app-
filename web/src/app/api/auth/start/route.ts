// POST /api/auth/start { email, birthYear?, birthMonth? }
// Manda el enlace de acceso por correo (sin contraseñas).
// 1) Sin fecha: solo sirve si la cuenta ya existe → si no existe responde { needsBirth: true }.
// 2) Con fecha: comprueba 13+ y crea la cuenta (la base de datos lo vuelve a comprobar).
// Nunca registramos el correo en los logs.
import { NextResponse } from "next/server";
import { isOldEnough, validBirth } from "@/lib/age";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "Las cuentas no están configuradas." }, { status: 500 });
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; birthYear?: unknown; birthMonth?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });

  const withBirth = body.birthYear !== undefined || body.birthMonth !== undefined;
  if (withBirth) {
    if (!validBirth(body.birthYear, body.birthMonth)) return NextResponse.json({ error: "Elige tu mes y año de nacimiento." }, { status: 400 });
    if (!isOldEnough(body.birthYear as number, body.birthMonth as number)) {
      return NextResponse.json({ error: "Para usar la app hay que tener 13 años o más." }, { status: 403 });
    }
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // El enlace vuelve a esta misma app; el middleware convierte el código en sesión.
      emailRedirectTo: new URL(request.url).origin,
      shouldCreateUser: withBirth,
      ...(withBirth ? { data: { birth_year: body.birthYear, birth_month: body.birthMonth } } : {}),
    },
  });

  if (error) {
    const msg = `${error.code ?? ""} ${error.message}`;
    if (!withBirth && /otp_disabled|signups not allowed|user not found/i.test(msg)) {
      return NextResponse.json({ needsBirth: true });
    }
    if (error.status === 429 || /rate limit|over_email_send_rate_limit/i.test(msg)) {
      return NextResponse.json({ error: "Se mandaron demasiados correos. Espera unos minutos y vuelve a intentarlo." }, { status: 429 });
    }
    if (/13 años|database error saving new user/i.test(msg)) {
      return NextResponse.json({ error: "Para usar la app hay que tener 13 años o más." }, { status: 403 });
    }
    console.error("auth/start: fallo al enviar el enlace:", error.code ?? error.status);
    return NextResponse.json({ error: "No pude enviar el correo. Inténtalo de nuevo." }, { status: 502 });
  }
  return NextResponse.json({ sent: true });
}
