"use client";

// Lógica del historial de chats, separada de la pantalla del chat:
// lista (solo metadatos), chat activo, crear, abrir, guardar, borrar, título automático y orden.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation,
  deleteConversation,
  listConversations,
  loadMessages,
  requestTitle,
  saveMessages,
  type ConversationSummary,
} from "@/lib/conversation-api";
import { loadConversations, loadCurrentId, saveCurrentId, type UiMessage } from "@/lib/conversations";

const DEFAULT_TITLE = "Nuevo chat";
const MIGRATED_KEY = "tocorito.chats.migrated";

// En desarrollo React arranca los efectos dos veces: compartir la misma promesa evita subir los chats duplicados.
let migrating: Promise<void> | null = null;

/** Una sola vez: los chats que estaban guardados solo en este navegador se suben al servidor. */
function migrateLocalChats() {
  migrating ??= doMigrate().finally(() => (migrating = null));
  return migrating;
}

async function doMigrate() {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const local = loadConversations();
    // Del más viejo al más nuevo, para conservar el orden.
    for (const c of [...local].reverse()) {
      await createConversation({ title: c.title, createdAt: new Date(c.createdAt).toISOString(), updatedAt: new Date(c.updatedAt).toISOString(), messages: c.messages });
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Si falla, se intentará la próxima vez.
  }
}

export function useConversations() {
  const [list, setList] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);

  const select = useCallback((id: string | null) => {
    activeRef.current = id;
    setActiveId(id);
    saveCurrentId(id);
  }, []);

  /** Sube un chat a la cabeza del historial (tras escribir en él). */
  const touch = useCallback((id: string, patch: Partial<ConversationSummary> = {}) => {
    setList((current) => {
      const found = current.find((c) => c.id === id);
      if (!found) return current;
      return [{ ...found, updatedAt: new Date().toISOString(), ...patch }, ...current.filter((c) => c.id !== id)];
    });
  }, []);

  /** Chats viejos que aún se llaman "Nuevo chat" pero ya tienen mensajes: la IA les pone título. */
  const titleIfNeeded = useCallback((id: string, msgs: UiMessage[], currentTitle?: string) => {
    if (currentTitle !== DEFAULT_TITLE || !msgs.some((m) => m.role === "assistant")) return;
    requestTitle(id)
      .then((title) => setList((all) => all.map((c) => (c.id === id ? { ...c, title } : c))))
      .catch(() => {});
  }, []);

  // Al abrir la app: traer chats viejos del dispositivo, cargar la lista y abrir el último chat.
  useEffect(() => {
    (async () => {
      try {
        await migrateLocalChats();
        const { conversations, nextCursor } = await listConversations();
        setList(conversations);
        setNextCursor(nextCursor);
        const last = loadCurrentId();
        if (last && conversations.some((c) => c.id === last)) {
          const loaded = await loadMessages(last);
          setMessages(loaded);
          select(last);
          titleIfNeeded(last, loaded, conversations.find((c) => c.id === last)?.title);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pude cargar tus chats.");
      } finally {
        setReady(true);
      }
    })();
  }, [select, titleIfNeeded]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const page = await listConversations(nextCursor);
    setList((current) => [...current, ...page.conversations.filter((c) => !current.some((x) => x.id === c.id))]);
    setNextCursor(page.nextCursor);
  }, [nextCursor]);

  /** "Nuevo chat": si el chat abierto ya está vacío, se reutiliza (no se llenan de chats vacíos). */
  const newChat = useCallback(async () => {
    if (activeRef.current && messages.length === 0) return activeRef.current;
    const created = await createConversation();
    setList((current) => [created, ...current]);
    setMessages([]);
    select(created.id);
    return created.id;
  }, [messages.length, select]);

  /** Abre un chat existente: descarga solo sus mensajes. Nunca crea uno nuevo. */
  const open = useCallback(
    async (id: string) => {
      if (id === activeRef.current) return;
      const loaded = await loadMessages(id);
      setMessages(loaded);
      select(id);
      titleIfNeeded(id, loaded, list.find((c) => c.id === id)?.title);
    },
    [select, titleIfNeeded, list]
  );

  /** El chat activo, creándolo si todavía no existe (primer mensaje). */
  const ensureActive = useCallback(async () => activeRef.current ?? (await newChat()), [newChat]);

  /** Guarda el chat en el servidor y lo sube arriba del historial. */
  const persist = useCallback(
    async (id: string, msgs: UiMessage[]) => {
      if (!msgs.length) return;
      try {
        const saved = await saveMessages(id, msgs);
        touch(id, { updatedAt: saved.updatedAt });
      } catch {
        setError("No pude guardar el chat. Revisa tu conexión.");
      }
    },
    [touch]
  );

  /** Tras una respuesta de Tocorito: guardar y, si el chat aún se llama "Nuevo chat", pedir título a la IA. */
  const afterReply = useCallback(
    async (id: string, msgs: UiMessage[]) => {
      await persist(id, msgs);
      const current = list.find((c) => c.id === id);
      if (current && current.title !== DEFAULT_TITLE) return;
      try {
        const title = await requestTitle(id);
        setList((all) => all.map((c) => (c.id === id ? { ...c, title } : c)));
      } catch {
        // Sin título nuevo no pasa nada: se intentará tras la próxima respuesta.
      }
    },
    [list, persist]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      setList((current) => current.filter((c) => c.id !== id));
      if (id === activeRef.current) {
        setMessages([]);
        select(null);
      }
    },
    [select]
  );

  return { list, hasMore: Boolean(nextCursor), loadMore, activeId, messages, setMessages, ready, error, newChat, open, ensureActive, persist, afterReply, remove };
}
