# 0006 — Historial de chats en el servidor, panel lateral y títulos con IA

**Estado:** aceptada (almacenamiento provisional hasta elegir base de datos)

## Contexto

El historial vivía solo en el navegador (`localStorage`). Se pidió un historial como el de ChatGPT
en móvil: panel lateral desde la izquierda, títulos automáticos con IA, orden por actividad y
**persistencia en el backend**. La app todavía **no tiene base de datos ni cuentas** (fase 3 pendiente).

## Decisión

- **API** (`web/src/app/api/conversations/…`):
  - `GET /api/conversations?limit=30&cursor=…` → solo `{ id, title, updatedAt }`, orden `updatedAt DESC`, paginado.
  - `POST /api/conversations` → crea `{ id: "chat_…", title: "Nuevo chat" }` (o importa un chat viejo).
  - `GET|PUT /api/conversations/:id/messages` → mensajes de un chat (solo al abrirlo) / guardar (sube `updatedAt`).
  - `POST /api/conversations/:id/title` → la IA genera un título de 3-7 palabras y se guarda.
  - `DELETE /api/conversations/:id`.
- **Almacenamiento**: interfaz `ConversationStore` (`web/src/lib/server/conversation-store.ts`).
  Implementación **provisional**: archivos JSON en `web/.data/` (fuera de Git), uno por usuario,
  con escritura atómica y en cola. Cambiar a Supabase = otra implementación de la misma interfaz.
- **Identidad**: sin cuentas, cada dispositivo tiene un id anónimo en cookie `httpOnly`
  (`web/src/lib/server/identity.ts`). Con login, ese será el `userId` real. Nadie ve chats de otro id.
- **Títulos**: `generateTitle` usa la capa de proveedores existente (`ChatProvider`, nivel instantáneo,
  tarea suelta `oneOff` que no gasta los procesos pre-calentados). Se limpia y valida; si la IA falla,
  título de respaldo a partir del mensaje.
- **Interfaz**: `ChatSidebar` (82% del ancho, máx. 340 px), sale desde la izquierda; se abre con ☰ o
  deslizando desde el borde izquierdo (< 20 px, umbral 35%); se cierra tocando fuera, arrastrando a
  la izquierda o con Escape. Solo "Nuevo chat" + lista (mantener pulsado para borrar). Lógica separada
  en `useConversations`.
- Los chats que había en el navegador se suben al servidor una vez (migración automática).

## Consecuencias

- **Railway**: su disco es efímero; antes de publicar hay que pasar a base de datos (Supabase) y
  añadir cuentas. Hasta entonces, el historial es por dispositivo/navegador.
- Las fotos se guardan en miniatura (320 px). Los chats contienen datos de estudiantes (posibles
  menores): revisar con `minor-privacy` al pasar a base de datos (cifrado, borrado de cuenta, retención).
