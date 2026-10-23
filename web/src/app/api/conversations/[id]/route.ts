// DELETE /api/conversations/:id → borra el chat y sus mensajes (solo si es de este usuario).
import { NextResponse } from "next/server";
import { conversationContext } from "@/lib/server/conversation-context";
import { CONVERSATION_ID_RE } from "@/lib/server/conversation-store";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const ok = CONVERSATION_ID_RE.test(id) && (await ctx.store.remove(ctx.userId, id));
  return ctx.json(ok ? { ok: true } : { error: "Chat no encontrado." }, { status: ok ? 200 : 404 });
}
