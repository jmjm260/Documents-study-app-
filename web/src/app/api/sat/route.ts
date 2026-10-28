// API del entrenamiento SAT.
//   GET  /api/sat                                  → estado (sin claves de respuesta) + quién eres (invitado / vinculado / cuenta)
//   POST /api/sat { action: "start", roundId }     → empezar una ronda cronometrada ya preparada
//   POST /api/sat { action: "reveal", roundId, position }            → mostrar la pregunta (empieza su tiempo)
//   POST /api/sat { action: "answer", roundId, position, choice, nonce } → respuesta confirmada (una sola vez)
//   POST /api/sat { action: "ack" }                → visto el reinicio, seguir
//   POST /api/sat { action: "restore" }            → recuperar la ronda que anuló una pregunta defectuosa
//   POST /api/sat { action: "report", itemId, reason, contest }      → reportar / impugnar (la revisión va aparte)
//   POST /api/sat { action: "link-create" }        → código para vincular otro dispositivo
//   POST /api/sat { action: "link-redeem", code }  → vincular este dispositivo con un código
// La clave correcta nunca viaja al navegador antes de responder. No registramos el contenido de las respuestas.
import { join } from "node:path";
import { NextResponse } from "next/server";
import { accountForDevice, createLinkCode, devicesOf, redeemLinkCode } from "@/lib/server/device-link";
import { identify, jsonFor } from "@/lib/server/identity";
import { SAT_DATA_DIR, satService } from "@/lib/server/sat-service";
import { SatError } from "@/lib/sat/engine";
import { OPTION_IDS, type OptionId } from "@/lib/sat/items";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const ACCOUNTS_BASE = join(SAT_DATA_DIR, "..");

type Who = {
  subject: string;
  deviceId: string | null;
  identity: { mode: "invitado" | "vinculado" | "cuenta"; devices: number };
  json: (body: unknown, init?: ResponseInit) => NextResponse;
};

/** ¿De quién es el historial? Cuenta con sesión (Supabase) > cuenta de dispositivos vinculados > invitado. */
async function whoIs(request: Request): Promise<Who | NextResponse> {
  if (supabaseConfigured()) {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión para entrenar." }, { status: 401 });
    return { subject: `u-${data.user.id}`, deviceId: null, identity: { mode: "cuenta", devices: 0 }, json: (b, i) => NextResponse.json(b, i) };
  }
  const who = identify(request);
  const account = await accountForDevice(ACCOUNTS_BASE, who.userId);
  return {
    subject: account ?? who.userId,
    deviceId: who.userId,
    identity: account ? { mode: "vinculado", devices: await devicesOf(ACCOUNTS_BASE, account) } : { mode: "invitado", devices: 1 },
    json: (b, i) => jsonFor(who, b, i),
  };
}

export async function GET(request: Request) {
  const who = await whoIs(request);
  if (who instanceof NextResponse) return who;
  try {
    return who.json({ ...(await satService().view(who.subject)), identity: who.identity });
  } catch (err) {
    console.error("sat: GET falló:", err instanceof Error ? err.message : err);
    return who.json({ error: "No pude cargar tu entrenamiento." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const who = await whoIs(request);
  if (who instanceof NextResponse) return who;
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const roundId = typeof b.roundId === "string" && ID_RE.test(b.roundId) ? b.roundId : "";
  const position = Number.isInteger(b.position) ? (b.position as number) : -1;
  const svc = satService();
  const withIdentity = async <T extends object>(p: Promise<T>) => who.json({ ...(await p), identity: who.identity });
  try {
    switch (b.action) {
      case "start":
        return withIdentity(svc.start(who.subject, roundId));
      case "reveal":
        return withIdentity(svc.revealQuestion(who.subject, roundId, position));
      case "answer": {
        const choice = String(b.choice ?? "").toUpperCase() as OptionId;
        const nonce = typeof b.nonce === "string" && ID_RE.test(b.nonce) ? b.nonce : "";
        if (!OPTION_IDS.includes(choice) || !nonce) return who.json({ error: "Respuesta no válida." }, { status: 400 });
        return who.json(await svc.submitAnswer(who.subject, { roundId, position, choice, nonce }));
      }
      case "ack":
        return withIdentity(svc.acknowledge(who.subject));
      case "restore":
        return withIdentity(svc.restore(who.subject));
      case "report": {
        const itemId = typeof b.itemId === "string" && ID_RE.test(b.itemId) ? b.itemId : "";
        if (!itemId) return who.json({ error: "Falta la pregunta." }, { status: 400 });
        return who.json(await svc.report(who.subject, { itemId, reason: typeof b.reason === "string" ? b.reason : "", contest: b.contest === true }));
      }
      case "link-create": {
        if (!who.deviceId) return who.json({ error: "Con cuenta, tu historial ya está en todos tus dispositivos." }, { status: 400 });
        const link = await createLinkCode(ACCOUNTS_BASE, who.deviceId);
        // Si era invitado, su historial pasa a la nueva cuenta (sin perder nada).
        if (link.fromGuest) await svc.mergeSubjects(who.deviceId, link.accountId);
        return who.json({ code: link.code, expiresAt: link.expiresAt });
      }
      case "link-redeem": {
        if (!who.deviceId) return who.json({ error: "Con cuenta no hace falta vincular." }, { status: 400 });
        const code = typeof b.code === "string" ? b.code.slice(0, 20) : "";
        const r = await redeemLinkCode(ACCOUNTS_BASE, who.deviceId, code);
        if (!r.ok) {
          const msg = {
            invalid: "Ese código no es válido.",
            expired: "Ese código caducó. Genera otro.",
            rate: "Demasiados intentos. Espera unos minutos.",
            same: "Este dispositivo ya está vinculado a esa cuenta.",
            linked: "Este dispositivo ya está vinculado a otra cuenta.",
          }[r.reason];
          return who.json({ error: msg }, { status: 400 });
        }
        // Lo que este dispositivo tenía como invitado se une a la cuenta (unión de vistas; métricas sumadas).
        await svc.mergeSubjects(who.deviceId, r.accountId);
        return who.json({ ok: true });
      }
      default:
        return who.json({ error: "Acción desconocida." }, { status: 400 });
    }
  } catch (err) {
    // Desincronización (otra pestaña, doble clic, ronda que ya cambió): no es un error académico.
    if (err instanceof SatError) return who.json({ error: err.message, code: err.code }, { status: 409 });
    console.error("sat: POST falló:", err instanceof Error ? err.message : err);
    return who.json({ error: "Problema técnico: no cuenta como error. Inténtalo otra vez." }, { status: 500 });
  }
}
