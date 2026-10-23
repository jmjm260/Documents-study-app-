// GET /api/auth/me → { configured, user: { email } | null }
// La app lo usa para decidir si enseña la pantalla de inicio de sesión.
import { NextResponse } from "next/server";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ configured: false, user: null });
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  return NextResponse.json({ configured: true, user: data.user ? { email: data.user.email ?? null } : null });
}
