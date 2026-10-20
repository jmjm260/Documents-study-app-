// Descarga segura del feed iCal de Canvas (solo servidor).
// La URL del feed es una credencial: nunca la registres en logs.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export class FeedError extends Error {}

/** Solo URLs https con la forma de un feed de Canvas: /feeds/calendars/<algo>.ics */
export function validateFeedUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new FeedError("Eso no parece una URL.");
  }
  if (url.protocol !== "https:") throw new FeedError("La URL debe empezar con https://");
  if (url.username || url.password) throw new FeedError("La URL no puede incluir usuario o contraseña.");
  if (url.port && url.port !== "443") throw new FeedError("Puerto no permitido.");
  if (!/^\/feeds\/calendars\/[^/]+\.ics$/.test(url.pathname)) {
    throw new FeedError("No es un feed de calendario de Canvas (debe terminar en /feeds/calendars/….ics).");
  }
  return url;
}

/** Evita SSRF: no dejamos que el servidor descargue de redes internas. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

export async function fetchFeed(input: string): Promise<string> {
  const url = validateFeedUrl(input);

  const addresses = await lookup(url.hostname, { all: true }).catch(() => {
    throw new FeedError("No se encontró el servidor de esa URL.");
  });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new FeedError("Esa dirección no está permitida.");
  }

  const res = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "text/calendar" },
  }).catch(() => {
    throw new FeedError("No se pudo descargar el feed (tiempo agotado o red).");
  });
  if (res.status >= 300 && res.status < 400) throw new FeedError("El feed redirigió a otro sitio; revisa la URL.");
  if (!res.ok || !res.body) throw new FeedError(`Canvas respondió con error ${res.status}.`);

  // Leemos por partes para cortar si el archivo es demasiado grande.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FeedError("El feed es demasiado grande.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.includes("BEGIN:VCALENDAR")) throw new FeedError("La respuesta no es un calendario iCal.");
  return text;
}
