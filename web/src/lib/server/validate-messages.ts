// Valida lo que el navegador quiere guardar en una conversación (nunca guardamos cualquier cosa).
import type { UiMessage } from "../conversations";
import { validateEntry } from "../entries";

export const MAX_STORED_MESSAGES = 400;
const MAX_TEXT = 8000;
const MAX_THUMB_CHARS = 200_000; // las fotos se guardan en miniatura
const THUMB_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const ENTRY_ID_RE = /^[A-Za-z0-9-]{1,80}$/;

export function sanitizeMessages(input: unknown): UiMessage[] | null {
  if (!Array.isArray(input) || input.length > MAX_STORED_MESSAGES) return null;
  const out: UiMessage[] = [];
  for (const raw of input) {
    const m = raw as Record<string, unknown>;
    if (m?.role === "user" || m?.role === "assistant") {
      if (typeof m.content !== "string" || m.content.length > MAX_TEXT) return null;
      const images = Array.isArray(m.images) ? m.images : [];
      if (images.length > 4 || images.some((i) => typeof i !== "string" || i.length > MAX_THUMB_CHARS || !THUMB_RE.test(i))) return null;
      out.push(images.length && m.role === "user" ? { role: m.role, content: m.content, images: images as string[] } : { role: m.role, content: m.content });
    } else if (m?.role === "action") {
      const entry = m.entry as Record<string, unknown> | undefined;
      // Lo de Canvas que se ocultó puede ser un "evento": se valida como nota y se le devuelve su tipo.
      const isEvent = entry?.kind === "evento";
      const valid = validateEntry(isEvent ? { ...entry, kind: "nota" } : entry);
      if (!valid.ok || typeof entry?.id !== "string" || !ENTRY_ID_RE.test(entry.id)) return null;
      if (m.change !== "added" && m.change !== "removed") return null;
      const value = isEvent ? { ...valid.value, kind: "evento" as unknown as typeof valid.value.kind } : valid.value;
      out.push({ role: "action", change: m.change, entry: { ...value, id: entry.id }, undone: Boolean(m.undone) });
    } else {
      return null;
    }
  }
  return out;
}
