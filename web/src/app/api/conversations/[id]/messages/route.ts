// GET /api/conversations/:id/messages → { messages } de ese chat (solo al abrirlo).
// PUT /api/conversations/:id/messages { messages } → guarda el chat y lo sube arriba del historial.
import { CONVERSATION_ID_RE, getConversationStore } from "@/lib/server/conversation-store";
import { identify, jsonFor } from "@/lib/server/identity";
import { sanitizeMessages } from "@/lib/server/validate-messages";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const who = identify(request);
  const { id } = await params;
  const messages = CONVERSATION_ID_RE.test(id) ? await getConversationStore().messages(who.userId, id) : null;
  if (!messages) return jsonFor(who, { error: "Chat no encontrado." }, { status: 404 });
  return jsonFor(who, { messages });
}

export async function PUT(request: Request, { params }: Ctx) {
  const who = identify(request);
  const { id } = await params;
  if (!CONVERSATION_ID_RE.test(id)) return jsonFor(who, { error: "Chat no encontrado." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return jsonFor(who, { error: "Mensajes no válidos." }, { status: 400 });
  const meta = await getConversationStore().saveMessages(who.userId, id, messages);
  if (!meta) return jsonFor(who, { error: "Chat no encontrado." }, { status: 404 });
  return jsonFor(who, { id: meta.id, title: meta.title, updatedAt: meta.updatedAt });
}
