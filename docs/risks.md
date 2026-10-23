# Riesgos abiertos

| Riesgo | Por qué importa | Próximo paso | Estado |
|---|---|---|---|
| Datos de menores de 13–17 (RGPD: edad de consentimiento 13–16 según el país; leyes estatales de EE. UU. para adolescentes) | La app es para 13+ y adultos, pero los de 13–17 siguen siendo menores; los menores de 13 activarían COPPA | Verificación de edad al registrarse (bloquear < 13) y consentimiento parental donde la ley lo pida para 13–16 | abierto |
| Términos de Canvas / de cada escuela | Automatizar acceso puede violar términos | Solo usar lo que el estudiante exporta o autoriza (iCal, correos, extensión) | abierto |
| Bloqueo de apps en iOS/Android | Apple exige Screen Time API (Family Controls); Android, permisos de accesibilidad/uso | Investigar en fase 6 | abierto |
| Grabaciones de clase | Leyes de consentimiento de grabación (uno o todos los participantes) | Fuera del MVP | aplazado |
| Costo de IA por estudiante | Puede superar el precio de la suscripción | Medir tokens por sesión, límites por plan, caché de prompts | abierto: el chat aún no tiene límite por usuario; no publicar sin rate limit |
| SSRF en `/api/calendar/preview` | El servidor descarga URLs que da el usuario | Ya validamos https, ruta de feed, IPs privadas y sin redirecciones. Falta: fijar la IP resuelta (DNS rebinding) antes de producción | mitigado parcialmente |
| URL del feed iCal es secreta | Quien la tenga ve el calendario del estudiante | Tratarla como credencial: cifrada en BD, nunca en logs . Hoy se guarda en localStorage del navegador (solo pruebas); en la app irá a Keychain/Keystore | abierto |
| Recordatorios en la web | Solo suenan con la app abierta; en móvil web las notificaciones son limitadas | En la app nativa usar notificaciones locales del sistema (Capacitor) | abierto |
| Fotos enviadas a la IA | Pueden incluir caras, nombres o datos de otras personas | No se guardan en servidor; Tocorito no comenta datos personales; avisar en la app y revisar con minor-privacy | abierto |
| Historial guardado en archivos del servidor | Provisional: en Railway el disco es efímero y no hay cuentas (historial por dispositivo) | Elegir base de datos (Supabase) y login antes de publicar (ADR 0006) | abierto |
