// DELETE /api/conversations/:id → borra el chat y sus mensajes (solo si es de este usuario).
import { CONVERSATION_ID_RE, getConversationStore } from "@/lib/server/conversation-store";
import { identify, jsonFor } from "@/lib/server/identity";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = identify(request);
  const { id } = await params;
  if (!CONVERSATION_ID_RE.test(id)) return jsonFor(who, { error: "Chat no encontrado." }, { status: 404 });
  const ok = await getConversationStore().remove(who.userId, id);
  return jsonFor(who, ok ? { ok: true } : { error: "Chat no encontrado." }, { status: ok ? 200 : 404 });
}
