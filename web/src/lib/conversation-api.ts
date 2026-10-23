// Llamadas del navegador a la API de conversaciones (el historial vive en el servidor).
import type { UiMessage } from "./conversations";

export type ConversationSummary = { id: string; title: string; updatedAt: string };

async function json<T>(res: Response): Promise<T> {
  // La sesión caducó: recargar enseña la pantalla de inicio de sesión.
  if (res.status === 401 && typeof window !== "undefined") window.location.reload();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error del servidor.");
  return data as T;
}

export async function listConversations(cursor?: string | null) {
  const qs = new URLSearchParams({ limit: "30", ...(cursor ? { cursor } : {}) });
  return json<{ conversations: ConversationSummary[]; nextCursor: string | null }>(await fetch(`/api/conversations?${qs}`));
}

export async function createConversation(init?: { title?: string; createdAt?: string; updatedAt?: string; messages?: UiMessage[] }) {
  return json<ConversationSummary>(
    await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init ?? {}) })
  );
}

export async function loadMessages(id: string) {
  return (await json<{ messages: UiMessage[] }>(await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`))).messages;
}

/** Guarda el chat (fotos en miniatura) y devuelve su nuevo updatedAt. */
export async function saveMessages(id: string, messages: UiMessage[]) {
  const stored = messages.map((m) => {
    if (m.role !== "user" || !m.images?.length) return m;
    const { thumbs, ...rest } = m;
    return { ...rest, images: thumbs ?? [] };
  });
  return json<ConversationSummary>(
    await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: stored }),
    })
  );
}

export async function deleteConversation(id: string) {
  await json(await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export async function requestTitle(id: string) {
  return (await json<{ title: string }>(await fetch(`/api/conversations/${encodeURIComponent(id)}/title`, { method: "POST" }))).title;
}
