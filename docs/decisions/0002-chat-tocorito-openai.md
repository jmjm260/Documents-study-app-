# 0002 — Chat con Tocorito usando la API de OpenAI

**Estado:** aceptada

## Contexto

El dueño del proyecto quiere un chat donde responda Tocorito, la mascota de la app
(un tocororo azul, blanco y rojo con gafas y café), y tiene una clave de OpenAI.

## Decisión

- Página principal `/` = chat con Tocorito. El inspector de calendario pasa a `/calendario`.
- El navegador llama a `/api/chat` (nuestro servidor), que llama a OpenAI con `fetch`.
  **La clave nunca llega al navegador**: vive en `web/.env.local` como `OPENAI_API_KEY`.
- Sin SDK nuevo (0 dependencias añadidas). Modelo configurable con `OPENAI_MODEL`
  (por defecto `gpt-4.1-mini`, barato).
- Personalidad y reglas del tutor en `web/src/lib/chat.ts` (`TOCORITO_PROMPT`).
- Límites: 20 mensajes de historial, 2000 caracteres por mensaje, 600 tokens por respuesta.

## Consecuencias

- Cada mensaje cuesta dinero en la cuenta de OpenAI. Antes de publicar: límite por usuario
  (rate limit) y cuentas, para que nadie gaste la clave desde fuera.
- El historial se manda entero en cada pregunta (no se guarda en el servidor).
- Se envía texto del estudiante a un tercero (OpenAI): revisar con la skill `minor-privacy`
  antes de abrir a menores.

## Actualización: proveedor local de pruebas

Mientras la cuenta de OpenAI no tenga saldo, `CHAT_PROVIDER=claude` hace que Tocorito
responda usando Claude Code instalado en la computadora (`web/src/lib/claude-local.ts`),
con la sesión del dueño. Solo funciona en desarrollo (bloqueado en producción) y corre en
una carpeta temporal vacía, sin herramientas ni acceso al proyecto. Para volver a OpenAI:
quitar esa línea de `web/.env.local` o poner `CHAT_PROVIDER=openai`.
