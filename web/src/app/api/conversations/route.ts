// GET  /api/conversations?limit=30&cursor=…  → { conversations: [{ id, title, updatedAt }], nextCursor }
//      Solo metadatos (nunca los mensajes): rápido aunque haya muchos chats.
// POST /api/conversations  → crea un chat vacío con título "Nuevo chat".
//      Opcional { title, createdAt, updatedAt, messages } para traer chats viejos guardados en el dispositivo.
import { getConversationStore } from "@/lib/server/conversation-store";
import { identify, jsonFor } from "@/lib/server/identity";
import { sanitizeMessages } from "@/lib/server/validate-messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const who = identify(request);
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 30, 100));
  const cursor = url.searchParams.get("cursor");
  const result = await getConversationStore().list(who.userId, { limit, cursor });
  return jsonFor(who, result);
}

export async function POST(request: Request) {
  const who = identify(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
  let messages;
  if (body.messages !== undefined) {
    messages = sanitizeMessages(body.messages);
    if (!messages) return jsonFor(who, { error: "Mensajes no válidos." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 60) : undefined;
  const meta = await getConversationStore().create(who.userId, {
    title,
    createdAt: isDate(body.createdAt) ? new Date(body.createdAt).toISOString() : undefined,
    updatedAt: isDate(body.updatedAt) ? new Date(body.updatedAt).toISOString() : undefined,
    messages,
  });
  return jsonFor(who, { id: meta.id, title: meta.title, updatedAt: meta.updatedAt }, { status: 201 });
}
