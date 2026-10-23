// Conversaciones en Supabase (base de datos real). Implementa la misma interfaz que el almacén de
// archivos, así la API no cambia. Cada consulta va con la sesión del usuario: las reglas RLS de la
// base de datos garantizan que solo vea y cambie lo suyo (el userId que recibe es solo informativo).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UiMessage } from "../conversations";
import { encodeCursor, PAGE_SIZE, type ConversationMeta, type ConversationStore } from "./conversation-store";

type Row = { id: string; user_id: string; title: string; titled: boolean; created_at: string; updated_at: string };
type MessageRow = { role: "user" | "assistant" | "action"; content: string; images: string[] | null; payload: unknown };

const toMeta = (r: Row): ConversationMeta => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  titled: r.titled,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Mensaje de la app → fila para la función save_conversation_messages. */
export function toRow(m: UiMessage) {
  if (m.role === "action") return { role: "action", content: "", payload: { change: m.change, entry: m.entry, undone: m.undone } };
  return { role: m.role, content: m.content, images: m.images ?? [] };
}

/** Fila → mensaje de la app. */
export function fromRow(r: MessageRow): UiMessage | null {
  if (r.role === "action") {
    const p = r.payload as { change?: "added" | "removed"; entry?: unknown; undone?: boolean } | null;
    if (!p?.entry || (p.change !== "added" && p.change !== "removed")) return null;
    return { role: "action", change: p.change, entry: p.entry as Extract<UiMessage, { role: "action" }>["entry"], undone: Boolean(p.undone) };
  }
  return r.images?.length ? { role: r.role, content: r.content, images: r.images } : { role: r.role, content: r.content };
}

export class SupabaseConversationStore implements ConversationStore {
  constructor(private db: SupabaseClient) {}

  async list(_userId: string, opts: { limit?: number; cursor?: string | null } = {}) {
    const limit = Math.min(opts.limit ?? PAGE_SIZE, 100);
    let q = this.db
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (opts.cursor) {
      const [updatedAt, id] = Buffer.from(opts.cursor, "base64url").toString().split("|");
      q = q.or(`updated_at.lt."${updatedAt}",and(updated_at.eq."${updatedAt}",id.lt."${id}")`);
    }
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Pick<Row, "id" | "title" | "updated_at">[];
    const page = rows.slice(0, limit).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
    const last = page[page.length - 1];
    return { conversations: page, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
  }

  async create(_userId: string, init: { title?: string; createdAt?: string; updatedAt?: string; messages?: UiMessage[] } = {}) {
    const titled = Boolean(init.title && init.title !== "Nuevo chat");
    const { data, error } = await this.db
      .from("conversations")
      .insert({ ...(init.title ? { title: init.title } : {}), titled, ...(init.createdAt ? { created_at: init.createdAt } : {}) })
      .select()
      .single();
    if (error) throw error;
    let meta = toMeta(data as Row);
    if (init.messages?.length) {
      await this.saveMessages(_userId, meta.id, init.messages);
      // Al importar chats viejos se conserva su fecha de uso.
      if (init.updatedAt) {
        const upd = await this.db.from("conversations").update({ updated_at: init.updatedAt }).eq("id", meta.id).select().single();
        if (!upd.error) meta = toMeta(upd.data as Row);
      }
    }
    return meta;
  }

  async get(_userId: string, id: string) {
    const { data } = await this.db.from("conversations").select().eq("id", id).maybeSingle();
    return data ? toMeta(data as Row) : null;
  }

  async messages(userId: string, id: string) {
    if (!(await this.get(userId, id))) return null;
    const { data, error } = await this.db.from("messages").select("role, content, images, payload").eq("conversation_id", id).order("position");
    if (error) throw error;
    return ((data ?? []) as MessageRow[]).flatMap((r) => fromRow(r) ?? []);
  }

  async saveMessages(_userId: string, id: string, messages: UiMessage[]) {
    const { error } = await this.db.rpc("save_conversation_messages", { p_conversation_id: id, p_messages: messages.map(toRow) });
    if (error) {
      if (/Chat no encontrado/.test(error.message)) return null;
      throw error;
    }
    return this.get(_userId, id);
  }

  async setTitle(_userId: string, id: string, title: string) {
    const { data } = await this.db.from("conversations").update({ title, titled: true }).eq("id", id).select().maybeSingle();
    return data ? toMeta(data as Row) : null;
  }

  async remove(_userId: string, id: string) {
    const { data } = await this.db.from("conversations").delete().eq("id", id).select("id");
    return Boolean(data?.length);
  }
}
