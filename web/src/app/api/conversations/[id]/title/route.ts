// POST /api/conversations/:id/title → la IA pone un título corto (3-7 palabras) al chat y se guarda.
// Se llama después de la primera respuesta de Tocorito. Si ya tiene título de IA, lo devuelve sin gastar.
import { getProvider } from "@/lib/ai/providers";
import { generateTitle } from "@/lib/ai/title";
import { CONVERSATION_ID_RE, getConversationStore } from "@/lib/server/conversation-store";
import { identify, jsonFor } from "@/lib/server/identity";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = identify(request);
  const { id } = await params;
  const store = getConversationStore();
  const meta = CONVERSATION_ID_RE.test(id) ? await store.get(who.userId, id) : null;
  if (!meta) return jsonFor(who, { error: "Chat no encontrado." }, { status: 404 });
  if (meta.titled) return jsonFor(who, { title: meta.title });

  const messages = (await store.messages(who.userId, id)) ?? [];
  const chat = messages.flatMap((m) => (m.role === "user" || m.role === "assistant" ? [m] : []));
  if (chat.length === 0) return jsonFor(who, { title: meta.title });

  let title: string;
  try {
    title = await generateTitle(getProvider(), chat);
  } catch {
    return jsonFor(who, { title: meta.title });
  }
  const updated = await store.setTitle(who.userId, id, title);
  return jsonFor(who, { title: updated?.title ?? title });
}
