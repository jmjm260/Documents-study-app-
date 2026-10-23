// Para cada petición de la API de conversaciones: ¿quién es y dónde se guardan sus chats?
// - Con Supabase configurado: hace falta haber iniciado sesión; los chats van a la base de datos.
// - Sin Supabase (solo desarrollo): id anónimo del dispositivo y archivos en .data/.
import { NextResponse } from "next/server";
import { createSupabaseServer, supabaseConfigured } from "../supabase/server";
import { getConversationStore, type ConversationStore } from "./conversation-store";
import { identify, jsonFor } from "./identity";
import { SupabaseConversationStore } from "./supabase-store";

export type ConversationContext = {
  store: ConversationStore;
  userId: string;
  json: (body: unknown, init?: ResponseInit) => NextResponse;
};

export async function conversationContext(request: Request): Promise<ConversationContext | NextResponse> {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión para ver tus chats." }, { status: 401 });
    return { store: new SupabaseConversationStore(supabase), userId: data.user.id, json: (b, i) => NextResponse.json(b, i) };
  }
  const who = identify(request);
  return { store: getConversationStore(), userId: who.userId, json: (b, i) => jsonFor(who, b, i) };
}
