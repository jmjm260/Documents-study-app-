// GET /api/conversations/:id/messages → { messages } de ese chat (solo al abrirlo).
// PUT /api/conversations/:id/messages { messages } → guarda el chat y lo sube arriba del historial.
import { NextResponse } from "next/server";
import { conversationContext } from "@/lib/server/conversation-context";
import { CONVERSATION_ID_RE } from "@/lib/server/conversation-store";
import { sanitizeMessages } from "@/lib/server/validate-messages";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const messages = CONVERSATION_ID_RE.test(id) ? await ctx.store.messages(ctx.userId, id) : null;
  if (!messages) return ctx.json({ error: "Chat no encontrado." }, { status: 404 });
  return ctx.json({ messages });
}

export async function PUT(request: Request, { params }: Ctx) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  if (!CONVERSATION_ID_RE.test(id)) return ctx.json({ error: "Chat no encontrado." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return ctx.json({ error: "Mensajes no válidos." }, { status: 400 });
  const meta = await ctx.store.saveMessages(ctx.userId, id, messages);
  if (!meta) return ctx.json({ error: "Chat no encontrado." }, { status: 404 });
  return ctx.json({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt });
}
