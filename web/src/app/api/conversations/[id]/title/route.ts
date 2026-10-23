// POST /api/conversations/:id/title → la IA pone un título corto (3-7 palabras) al chat y se guarda.
// Se llama después de la primera respuesta de Tocorito. Si ya tiene título de IA, lo devuelve sin gastar.
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/ai/providers";
import { generateTitle } from "@/lib/ai/title";
import { conversationContext } from "@/lib/server/conversation-context";
import { CONVERSATION_ID_RE } from "@/lib/server/conversation-store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const meta = CONVERSATION_ID_RE.test(id) ? await ctx.store.get(ctx.userId, id) : null;
  if (!meta) return ctx.json({ error: "Chat no encontrado." }, { status: 404 });
  if (meta.titled) return ctx.json({ title: meta.title });

  const messages = (await ctx.store.messages(ctx.userId, id)) ?? [];
  const chat = messages.flatMap((m) => (m.role === "user" || m.role === "assistant" ? [m] : []));
  if (chat.length === 0) return ctx.json({ title: meta.title });

  let title: string;
  try {
    title = await generateTitle(getProvider(), chat);
  } catch {
    return ctx.json({ title: meta.title });
  }
  const updated = await ctx.store.setTitle(ctx.userId, id, title);
  return ctx.json({ title: updated?.title ?? title });
}
