# 0007 — Supabase como base de datos y cuentas por correo

**Estado:** aceptada

## Contexto

El historial vivía en archivos del servidor y sin cuentas (ADR 0006). Para publicar hace falta una
base de datos real y que cada estudiante tenga su cuenta. El dueño eligió Supabase (plan gratis).

## Decisión

- **Proyecto**: `study-app` (`eruxsxskateixvzigyzr`), región **us-east-1**, plan **Free ($0/mes)**.
- **Tablas** (migración `chats_y_perfiles`):
  - `profiles` (id, `birth_year`, `birth_month`): solo lo mínimo para la regla 13+.
  - `conversations` (id `chat_…`, user_id, title, titled, created_at, updated_at) + índice por usuario y fecha.
  - `messages` (conversation_id, user_id, position, role, content, images, payload).
  - Función `save_conversation_messages` guarda todos los mensajes de un chat en una transacción.
- **Seguridad (RLS)**: cada usuario solo ve y cambia sus propias filas; no se puede crear un chat sin
  perfil. Se usa solo la clave **pública** (`sb_publishable_…`): la seguridad la pone RLS. No hay
  clave secreta (service_role) en la app.
- **13+**: lo comprueba la API **y** la base de datos (trigger al crear el usuario). Menores de 13: no se crea la cuenta.
- **Login**: enlace por correo, sin contraseñas (`signInWithOtp`). Cuenta nueva → se pide mes y año.
  El enlace vuelve a la app y el *middleware* convierte el código en sesión (cookies httpOnly, `@supabase/ssr`).
- La API de conversaciones no cambia: `SupabaseConversationStore` implementa `ConversationStore`.
  Sin Supabase configurado (desarrollo) se sigue usando el almacén de archivos.
- Con cuentas activas, `/api/chat` exige sesión (nadie gasta créditos de IA desde fuera).
- Al iniciar sesión, los chats que el dispositivo tenía sin cuenta pasan a la cuenta.

## Límites del plan gratis (a vigilar)

- El proyecto **se pausa tras ~1 semana sin uso** (se reactiva desde el panel).
- 500 MB de base de datos, 50.000 usuarios activos al mes, sin copias de seguridad automáticas.
- **Correos**: el servidor de correo incluido manda muy pocos por hora y es solo para pruebas.
  Antes de publicar: SMTP propio (p. ej. Resend) y plan Pro (~25 $/mes) para copias y sin pausas.

## Pendiente

- Anotaciones del calendario y preferencias siguen en el dispositivo: pasarlas a la base de datos.
- App nativa (Capacitor): el enlace del correo debe abrir la app (deep link) o usar código de 6 dígitos.
- Borrar cuenta y todos sus datos desde la app (requisito de privacidad y de la App Store).
- Inicio de sesión con Apple/Google (si se ofrece Google, Apple exige "Sign in with Apple").
