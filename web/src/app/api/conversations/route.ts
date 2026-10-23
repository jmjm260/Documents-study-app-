// GET  /api/conversations?limit=30&cursor=…  → { conversations: [{ id, title, updatedAt }], nextCursor }
//      Solo metadatos (nunca los mensajes): rápido aunque haya muchos chats.
// POST /api/conversations  → crea un chat vacío con título "Nuevo chat".
//      Opcional { title, createdAt, updatedAt, messages } para traer chats viejos.
import { NextResponse } from "next/server";
import { conversationContext } from "@/lib/server/conversation-context";
import { sanitizeMessages } from "@/lib/server/validate-messages";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 30, 100));
  const cursor = url.searchParams.get("cursor");
  return ctx.json(await ctx.store.list(ctx.userId, { limit, cursor }));
}

export async function POST(request: Request) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
  let messages;
  if (body.messages !== undefined) {
    messages = sanitizeMessages(body.messages);
    if (!messages) return ctx.json({ error: "Mensajes no válidos." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 60) : undefined;
  const meta = await ctx.store.create(ctx.userId, {
    title,
    createdAt: isDate(body.createdAt) ? new Date(body.createdAt).toISOString() : undefined,
    updatedAt: isDate(body.updatedAt) ? new Date(body.updatedAt).toISOString() : undefined,
    messages,
  });
  return ctx.json({ id: meta.id, title: meta.title, updatedAt: meta.updatedAt }, { status: 201 });
}
