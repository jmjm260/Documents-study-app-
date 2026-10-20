---
name: canvas-integration
description: Qué está permitido y qué no al obtener datos de Canvas (feed iCal, correos, extensión). Úsala al tocar cualquier código o diseño que lea datos de Canvas.
---

# Integración con Canvas

## Permitido
- **Feed iCal**: URL privada que el estudiante copia en Canvas → *Calendario* → *Feed de calendario*.
  Termina en `.ics` y suele tener la forma `https://<escuela>.instructure.com/feeds/calendars/user_<id>.ics`.
- **Correos de notificación** que el estudiante reenvía o autoriza leer.
- **Extensión de navegador** que lee la página de la tarea *mientras el estudiante la tiene abierta* y él pulsa "importar".
- **Captura o texto** que el estudiante comparte manualmente.

## Prohibido
- Pedir usuario/contraseña de Canvas o de la escuela, o automatizar el inicio de sesión.
- Pedir tokens de acceso personal o claves de desarrollador.
- Scraping en segundo plano con la sesión del estudiante sin acción explícita suya.

## Tratamiento del feed iCal
- La URL del feed **es una credencial**: quien la tiene ve el calendario. No la registres en logs,
  no la pongas en query strings, cífrala si se guarda.
- Solo descargar por `https`, con timeout y límite de tamaño, y solo a hosts que parezcan Canvas
  (`*.instructure.com` o el dominio que el estudiante confirme) para evitar SSRF.
- Cada tarea que salga del feed empieza en nivel `solo_titulo` o `parcial` (ver skill `tutor-context-levels`).
