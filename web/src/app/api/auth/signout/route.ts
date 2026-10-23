// POST /api/auth/signout → cierra la sesión en este dispositivo.
import { NextResponse } from "next/server";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  }
  return NextResponse.json({ ok: true });
}
