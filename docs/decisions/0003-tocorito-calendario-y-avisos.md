# 0003 — Tocorito con acceso al calendario y recordatorios

**Estado:** aceptada

## Contexto

El usuario quiere decirle a Tocorito "pon tal cosa tal día y recuérdame X minutos antes",
y que el calendario tenga alarmas. Las anotaciones viven hoy en el dispositivo (sin cuentas).

## Decisión

**Acceso de Tocorito (`web/src/lib/chat-actions.ts`):**
- Con cada mensaje, el navegador manda un resumen del calendario: fecha/hora actual, zona
  horaria y hasta 40 elementos de los próximos 60 días (solo fecha, hora, tipo, título y materia).
- Tocorito escribe bloques `[[CALENDARIO]]{...}[[/CALENDARIO]]` cuando le piden anotar algo.
  El servidor los extrae, los valida con `validateEntry` y devuelve `actions`; el navegador los
  guarda y muestra una tarjeta con **Deshacer**.
- Funciona igual con OpenAI y con Claude local (no depende de "tool calling" de un proveedor).
- Tocorito solo puede **crear**; borrar o editar se hace en la pestaña Calendario.

**Recordatorios (`web/src/lib/reminders.ts`, `ReminderCenter`):**
- Cada anotación tiene `reminder` (minutos antes o null). En "todo el día" cuenta desde las 08:00.
- En la web: aviso dentro de la app + notificación del sistema si el usuario da permiso.
  **Solo suenan con la app abierta.**

## Consecuencias

- Para la App Store: cambiar `ReminderCenter` por notificaciones locales nativas
  (p. ej. `@capacitor/local-notifications`), que suenan con la app cerrada.
- El resumen del calendario se envía al proveedor de IA: es el mínimo necesario
  (sin descripciones de Canvas ni notas). Revisar con la skill `minor-privacy`.
- Cuando haya cuentas, las anotaciones pasan a la base de datos y se sincronizan.
