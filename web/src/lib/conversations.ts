// Historial de chats con Tocorito, guardado en el dispositivo (con cuentas irá a la base de datos).
// Así no se pierde la conversación al cambiar de pestaña, y se pueden abrir, crear y borrar chats.
import type { ChatMessage } from "./chat";
import type { Entry } from "./entries";

/** Lo que se ve en el chat: mensajes y tarjetas de lo que Tocorito hizo en el calendario. */
export type UiMessage =
  | (ChatMessage & { thumbs?: string[] })
  | { role: "action"; change: "added" | "removed"; entry: Entry; undone: boolean };

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UiMessage[];
};

const KEY = "tocorito.chats.v1";
const CURRENT_KEY = "tocorito.currentChat";
export const MAX_CONVERSATIONS = 50;
const TITLE_LENGTH = 48;

export function newConversation(now = Date.now()): Conversation {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`;
  return { id, title: "Nuevo chat", createdAt: now, updatedAt: now, messages: [] };
}

/** Título a partir del primer mensaje del estudiante. */
export function titleFor(messages: UiMessage[]): string {
  const first = messages.find((m): m is ChatMessage => m.role === "user");
  if (!first) return "Nuevo chat";
  const text = first.content.replace(/\s+/g, " ").trim();
  if (!text) return first.images?.length ? "Foto" : "Nuevo chat";
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : text;
}

/**
 * Versión para guardar: las fotos se guardan en miniatura (las grandes no caben en el almacenamiento
 * del navegador) y no se guardan conversaciones vacías.
 */
export function toStored(conv: Conversation): Conversation {
  return {
    ...conv,
    title: titleFor(conv.messages),
    messages: conv.messages.map((m) => {
      if (m.role !== "user" || !m.images?.length) return m;
      const { thumbs, ...rest } = m;
      return { ...rest, images: thumbs ?? [] };
    }),
  };
}

/** Lista ordenada (la más reciente primero) y recortada. */
export function upsert(list: Conversation[], conv: Conversation): Conversation[] {
  const others = list.filter((c) => c.id !== conv.id);
  if (conv.messages.length === 0) return others;
  return [toStored(conv), ...others].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
}

export function loadConversations(): Conversation[] {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(data) ? data.filter((c) => typeof c?.id === "string" && Array.isArray(c.messages)) : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]) {
  // Si no cabe, quitamos las más viejas hasta que quepa.
  for (let n = list.length; n >= 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, n)));
      return;
    } catch {
      // seguir recortando
    }
  }
}

export function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function saveCurrentId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // sin almacenamiento
  }
}

/** "Hoy 14:05", "Ayer", "12 oct". */
export function whenLabel(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Hoy ${d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
  if (sameDay(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}
