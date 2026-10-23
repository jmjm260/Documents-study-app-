// Se ejecuta antes de cada página/petición:
// 1) Renueva la sesión de Supabase (si caduca, la refresca en las cookies).
// 2) Si llegamos desde el enlace del correo (?code=…), lo cambia por la sesión y limpia la URL.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/api")) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("code");
    if (error) clean.searchParams.set("login", "error");
    const redirect = NextResponse.redirect(clean);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Todo menos archivos estáticos e imágenes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|jpg|jpeg|svg|ico)$).*)"],
};
