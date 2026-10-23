// POST /api/conversations/import-device → al iniciar sesión, los chats que este dispositivo tenía
// guardados sin cuenta (archivos en .data/) pasan a la cuenta y se borran de los archivos.
// Se puede llamar varias veces: si ya no queda nada, no hace nada.
import { NextResponse } from "next/server";
import { conversationContext } from "@/lib/server/conversation-context";
import { getConversationStore } from "@/lib/server/conversation-store";
import { identify } from "@/lib/server/identity";
import { supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ imported: 0 });
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const device = identify(request);
  if (device.isNew) return ctx.json({ imported: 0 });

  const files = getConversationStore();
  let imported = 0;
  for (;;) {
    const { conversations } = await files.list(device.userId, { limit: 50 });
    if (!conversations.length) break;
    for (const c of conversations) {
      const meta = await files.get(device.userId, c.id);
      const messages = (await files.messages(device.userId, c.id)) ?? [];
      if (meta && messages.length) {
        await ctx.store.create(ctx.userId, {
          title: meta.titled ? meta.title : undefined,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          messages,
        });
        imported++;
      }
      await files.remove(device.userId, c.id);
    }
  }
  return ctx.json({ imported });
}
