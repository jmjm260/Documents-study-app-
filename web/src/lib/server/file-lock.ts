// Candado de archivo ENTRE PROCESOS (no solo dentro de uno): crear un directorio es atómico en el sistema
// de archivos, así que solo un proceso a la vez puede tener "<archivo>.lock". Sirve para varios procesos de
// Node en la MISMA máquina. Con varias máquinas hará falta una base de datos con transacciones.
import { mkdir, rename, rm, stat } from "node:fs/promises";

/**
 * Reemplazo atómico (renombrar el temporal sobre el destino). En Windows falla con EPERM/EBUSY/EACCES si en ese
 * instante alguien está LEYENDO el destino: se reintenta unas veces con una pausa corta.
 */
export async function renameWithRetry(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 8 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
      await new Promise((r) => setTimeout(r, 10 * (attempt + 1)));
    }
  }
}
import { dirname } from "node:path";

const STALE_MS = 15_000; // un candado más viejo que esto es de un proceso que murió
const WAIT_MS = 10_000;

export async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const lock = `${path}.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (err) {
      // En Windows, crear el candado mientras otro proceso lo está borrando da EPERM/EACCES: también es "ocupado".
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") throw err;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > STALE_MS) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > WAIT_MS) throw new Error("No pude obtener el candado del archivo (ocupado).");
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 20));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
