// Guardado de conversaciones en el SERVIDOR (no en el navegador).
// Hoy: archivos JSON en .data/ (uno por usuario/dispositivo). Mañana: base de datos (p. ej. Supabase).
// Toda la app usa la interfaz ConversationStore, así que cambiar de almacenamiento no toca la API ni la UI.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UiMessage } from "../conversations";

export type ConversationMeta = {
  id: string;
  userId: string;
  title: string;
  /** true cuando el título ya lo puso la IA (no se vuelve a generar). */
  titled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationListItem = Pick<ConversationMeta, "id" | "title" | "updatedAt">;

export interface ConversationStore {
  list(userId: string, opts?: { limit?: number; cursor?: string | null }): Promise<{ conversations: ConversationListItem[]; nextCursor: string | null }>;
  create(userId: string, init?: { title?: string; createdAt?: string; updatedAt?: string; messages?: UiMessage[] }): Promise<ConversationMeta>;
  get(userId: string, id: string): Promise<ConversationMeta | null>;
  messages(userId: string, id: string): Promise<UiMessage[] | null>;
  /** Guarda la lista completa de mensajes y sube la conversación arriba (updatedAt = ahora). */
  saveMessages(userId: string, id: string, messages: UiMessage[]): Promise<ConversationMeta | null>;
  setTitle(userId: string, id: string, title: string): Promise<ConversationMeta | null>;
  remove(userId: string, id: string): Promise<boolean>;
}

export const DEFAULT_TITLE = "Nuevo chat";
export const PAGE_SIZE = 30;
const USER_RE = /^[A-Za-z0-9-]{8,64}$/;
export const CONVERSATION_ID_RE = /^chat_[A-Za-z0-9-]{8,64}$/;

/** Orden del historial: lo usado más recientemente primero (updatedAt DESC, y por id si empatan). */
export function sortConversations<T extends { updatedAt: string; id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
}

export function encodeCursor(item: { updatedAt: string; id: string }): string {
  return Buffer.from(`${item.updatedAt}|${item.id}`).toString("base64url");
}

/** Página de la lista ya ordenada, empezando justo después del cursor. */
export function paginate<T extends { updatedAt: string; id: string }>(sorted: T[], limit: number, cursor?: string | null) {
  let start = 0;
  if (cursor) {
    const [updatedAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
    const idx = sorted.findIndex((c) => c.updatedAt === updatedAt && c.id === id);
    start = idx >= 0 ? idx + 1 : sorted.length;
  }
  const page = sorted.slice(start, start + limit);
  const nextCursor = start + limit < sorted.length && page.length ? encodeCursor(page[page.length - 1]) : null;
  return { page, nextCursor };
}

type UserFile = { conversations: Record<string, ConversationMeta>; messages: Record<string, UiMessage[]> };

class FileConversationStore implements ConversationStore {
  // Escrituras en cola por usuario: nunca dos a la vez sobre el mismo archivo.
  private queues = new Map<string, Promise<unknown>>();

  constructor(private dir: string) {}

  private file(userId: string) {
    if (!USER_RE.test(userId)) throw new Error("userId no válido");
    return join(this.dir, `${userId}.json`);
  }

  private async read(userId: string): Promise<UserFile> {
    try {
      return JSON.parse(await readFile(this.file(userId), "utf8")) as UserFile;
    } catch {
      return { conversations: {}, messages: {} };
    }
  }

  private async write(userId: string, data: UserFile) {
    await mkdir(this.dir, { recursive: true });
    const target = this.file(userId);
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(data), "utf8");
    await rename(tmp, target); // escritura atómica: o el archivo viejo o el nuevo, nunca a medias
  }

  private mutate<T>(userId: string, fn: (data: UserFile) => T): Promise<T> {
    const run = (this.queues.get(userId) ?? Promise.resolve()).then(async () => {
      const data = await this.read(userId);
      const result = fn(data);
      await this.write(userId, data);
      return result;
    });
    this.queues.set(userId, run.catch(() => {}));
    return run;
  }

  async list(userId: string, opts: { limit?: number; cursor?: string | null } = {}) {
    const data = await this.read(userId);
    const sorted = sortConversations(Object.values(data.conversations));
    const { page, nextCursor } = paginate(sorted, Math.min(opts.limit ?? PAGE_SIZE, 100), opts.cursor);
    return { conversations: page.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })), nextCursor };
  }

  create(userId: string, init: { title?: string; createdAt?: string; updatedAt?: string; messages?: UiMessage[] } = {}) {
    return this.mutate(userId, (data) => {
      const now = new Date().toISOString();
      const meta: ConversationMeta = {
        id: `chat_${randomUUID()}`,
        userId,
        title: init.title || DEFAULT_TITLE,
        titled: Boolean(init.title && init.title !== DEFAULT_TITLE),
        createdAt: init.createdAt ?? now,
        updatedAt: init.updatedAt ?? now,
      };
      data.conversations[meta.id] = meta;
      data.messages[meta.id] = init.messages ?? [];
      return meta;
    });
  }

  async get(userId: string, id: string) {
    return (await this.read(userId)).conversations[id] ?? null;
  }

  async messages(userId: string, id: string) {
    const data = await this.read(userId);
    return data.conversations[id] ? (data.messages[id] ?? []) : null;
  }

  saveMessages(userId: string, id: string, messages: UiMessage[]) {
    return this.mutate(userId, (data) => {
      const meta = data.conversations[id];
      if (!meta) return null;
      data.messages[id] = messages;
      meta.updatedAt = new Date().toISOString();
      return meta;
    });
  }

  setTitle(userId: string, id: string, title: string) {
    return this.mutate(userId, (data) => {
      const meta = data.conversations[id];
      if (!meta) return null;
      meta.title = title;
      meta.titled = true;
      return meta;
    });
  }

  remove(userId: string, id: string) {
    return this.mutate(userId, (data) => {
      if (!data.conversations[id]) return false;
      delete data.conversations[id];
      delete data.messages[id];
      return true;
    });
  }
}

const g = globalThis as unknown as { __conversationStore?: ConversationStore };

/** El almacén que usa la app. Para cambiar a base de datos, se devuelve otra implementación aquí. */
export function getConversationStore(): ConversationStore {
  return (g.__conversationStore ??= new FileConversationStore(process.env.DATA_DIR || join(process.cwd(), ".data", "conversations")));
}

/** Solo para pruebas: un almacén en otra carpeta. */
export function createFileStore(dir: string): ConversationStore {
  return new FileConversationStore(dir);
}
