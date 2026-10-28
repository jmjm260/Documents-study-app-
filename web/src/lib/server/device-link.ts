// Identidad para el historial del SAT, entre dispositivos.
// - Con cuentas activadas (Supabase): el usuario de la sesión. Su historial es el mismo en cualquier dispositivo.
// - Sin cuentas (hoy en desarrollo): cada dispositivo es "invitado" (cookie tocorito_device). Para usar el mismo
//   historial en otro dispositivo se VINCULAN con un código de un solo uso que se genera en el primero:
//   eso es la verificación (solo quien ve la pantalla del primero puede tenerlo). Sin correo ni contraseñas.
// Los códigos se guardan cifrados (hash), caducan a los 10 minutos y se limitan los intentos.
import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameWithRetry, withFileLock } from "./file-lock";

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5; // por dispositivo y ventana de 10 minutos
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin 0/O ni 1/I para que no se confundan

type Index = {
  /** dispositivo → cuenta */
  devices: Record<string, string>;
  /** hash del código → cuenta y caducidad */
  codes: Record<string, { accountId: string; expiresAt: number }>;
  /** intentos fallidos recientes por dispositivo */
  attempts: Record<string, number[]>;
};

export function accountsDir(base: string) {
  return join(base, "accounts");
}

const hashCode = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

async function readIndex(dir: string): Promise<Index> {
  try {
    return JSON.parse(await readFile(join(dir, "index.json"), "utf8")) as Index;
  } catch {
    return { devices: {}, codes: {}, attempts: {} };
  }
}

async function writeIndex(dir: string, data: Index) {
  await mkdir(dir, { recursive: true });
  const target = join(dir, "index.json");
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data), "utf8");
  await renameWithRetry(tmp, target);
}

async function withIndex<T>(base: string, fn: (idx: Index) => T | Promise<T>): Promise<T> {
  const dir = accountsDir(base);
  return withFileLock(join(dir, "index.json"), async () => {
    const idx = await readIndex(dir);
    const out = await fn(idx);
    await writeIndex(dir, idx);
    return out;
  });
}

/** ¿A qué cuenta pertenece este dispositivo? null = invitado. */
export async function accountForDevice(base: string, deviceId: string): Promise<string | null> {
  return (await readIndex(accountsDir(base))).devices[deviceId] ?? null;
}

/**
 * Genera un código para vincular OTRO dispositivo. Si este aún es invitado, se le crea la cuenta
 * (y el llamador mueve su historial de invitado a la cuenta: `fromGuest`).
 */
export async function createLinkCode(base: string, deviceId: string, now = Date.now()): Promise<{ code: string; expiresAt: number; accountId: string; fromGuest: boolean }> {
  return withIndex(base, (idx) => {
    let accountId = idx.devices[deviceId];
    const fromGuest = !accountId;
    if (!accountId) {
      accountId = `acct-${randomUUID()}`;
      idx.devices[deviceId] = accountId;
    }
    for (const [h, c] of Object.entries(idx.codes)) if (c.expiresAt < now) delete idx.codes[h];
    const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    idx.codes[hashCode(code)] = { accountId, expiresAt: now + CODE_TTL_MS };
    return { code, expiresAt: now + CODE_TTL_MS, accountId, fromGuest };
  });
}

export type RedeemResult = { ok: true; accountId: string } | { ok: false; reason: "invalid" | "expired" | "rate" | "same" | "linked" };

/** Canjea el código en el segundo dispositivo. Un solo uso. Tras canjear, el llamador une su historial. */
export async function redeemLinkCode(base: string, deviceId: string, code: string, now = Date.now()): Promise<RedeemResult> {
  return withIndex(base, (idx): RedeemResult => {
    const recent = (idx.attempts[deviceId] ?? []).filter((t) => now - t < CODE_TTL_MS);
    if (recent.length >= MAX_ATTEMPTS) return { ok: false, reason: "rate" };
    const entry = idx.codes[hashCode(code)];
    if (!entry || entry.expiresAt < now) {
      idx.attempts[deviceId] = [...recent, now];
      return { ok: false, reason: entry ? "expired" : "invalid" };
    }
    const previousAccount = idx.devices[deviceId] ?? null;
    if (previousAccount === entry.accountId) return { ok: false, reason: "same" };
    // Un dispositivo que ya es de OTRA cuenta no se une (podría arrastrar el historial de otra persona).
    if (previousAccount) return { ok: false, reason: "linked" };
    delete idx.codes[hashCode(code)];
    idx.devices[deviceId] = entry.accountId;
    idx.attempts[deviceId] = [];
    return { ok: true, accountId: entry.accountId };
  });
}

/** Cuántos dispositivos tiene la cuenta (para mostrarlo). */
export async function devicesOf(base: string, accountId: string): Promise<number> {
  const idx = await readIndex(accountsDir(base));
  return Object.values(idx.devices).filter((a) => a === accountId).length;
}
