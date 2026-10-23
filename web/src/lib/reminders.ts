// Recordatorios en la web: notificación del sistema (si el usuario da permiso) + aviso dentro de la app.
// LÍMITE WEB: solo suenan con la app abierta. En la app nativa esto se reemplaza por notificaciones
// locales del sistema (p. ej. @capacitor/local-notifications), que suenan aunque la app esté cerrada.
import { describeReminder, KIND_INFO, reminderAt, type Entry } from "./entries";

const FIRED_KEY = "tocorito.firedReminders.v1";

export type DueReminder = { key: string; entry: Entry; at: Date };

/** Recordatorios que ya tocaba avisar (hasta `graceMs` tarde) y que aún no se han mostrado. */
export function dueReminders(entries: Entry[], now: Date, fired: Set<string>, graceMs = 15 * 60_000): DueReminder[] {
  return entries.flatMap((entry) => {
    const at = reminderAt(entry);
    if (!at) return [];
    const key = `${entry.id}@${at.toISOString()}`;
    const late = now.getTime() - at.getTime();
    return late >= 0 && late <= graceMs && !fired.has(key) ? [{ key, entry, at }] : [];
  });
}

/** El próximo aviso pendiente, para programar el temporizador justo a esa hora. */
export function nextReminderAt(entries: Entry[], now: Date): Date | null {
  let next: Date | null = null;
  for (const entry of entries) {
    const at = reminderAt(entry);
    if (at && at > now && (!next || at < next)) next = at;
  }
  return next;
}

export function reminderText(entry: Entry): { title: string; body: string } {
  const when = entry.time ? `a las ${entry.time}` : "hoy";
  const kind = KIND_INFO[entry.kind].label;
  return {
    title: `⏰ ${kind}: ${entry.title}`,
    body: entry.reminderSec === 0 ? `Es ahora (${when}).` : `Empieza ${when} · aviso ${describeReminder(entry.reminderSec ?? 0)}.`,
  };
}

export function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveFired(fired: Set<string>) {
  try {
    // Guardamos solo los últimos 200 para que no crezca sin fin.
    localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-200)));
  } catch {
    // Sin almacenamiento: como mucho, un aviso se repetiría.
  }
}

/** Pide permiso para notificaciones del sistema. Llamar tras una acción del usuario. */
export function requestNotificationPermission() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function showSystemNotification(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/tocorito-idle.webp", tag: title });
  } catch {
    // Algunos navegadores móviles solo permiten notificaciones desde un service worker.
  }
}
