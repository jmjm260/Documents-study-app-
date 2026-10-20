// Parser mínimo de iCalendar (RFC 5545), suficiente para los feeds de Canvas.
// Sin dependencias para que sea fácil de leer y de probar.

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string;
  url: string;
  /** Fecha en ISO 8601. Si el feed trae solo fecha (día completo), es "YYYY-MM-DD". */
  start: string | null;
  end: string | null;
  allDay: boolean;
  /** Todas las propiedades tal cual llegaron, para inspeccionar qué trae el feed. */
  raw: Record<string, string>;
};

/** Une las líneas "dobladas": una línea que empieza con espacio o tab continúa la anterior. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** "20261020" → "2026-10-20"; "20261020T235900Z" → "2026-10-20T23:59:00Z" (sin Z = hora local del feed). */
export function parseIcsDate(value: string): { iso: string; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { iso: `${y}-${mo}-${d}`, allDay: true };
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${z ?? ""}`, allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(toEvent(current));
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    // "DTSTART;VALUE=DATE" → nombre "DTSTART"; ignoramos los parámetros salvo para inspección.
    const name = line.slice(0, colon).split(";")[0].toUpperCase();
    current[name] = line.slice(colon + 1);
  }
  return events;
}

function toEvent(props: Record<string, string>): IcsEvent {
  const start = props.DTSTART ? parseIcsDate(props.DTSTART) : null;
  const end = props.DTEND ? parseIcsDate(props.DTEND) : null;
  return {
    uid: props.UID ?? "",
    summary: unescapeText(props.SUMMARY ?? ""),
    description: unescapeText(props.DESCRIPTION ?? ""),
    url: props.URL ?? "",
    start: start?.iso ?? null,
    end: end?.iso ?? null,
    allDay: start?.allDay ?? false,
    raw: props,
  };
}
