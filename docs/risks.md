# Riesgos abiertos

| Riesgo | Por qué importa | Próximo paso | Estado |
|---|---|---|---|
| Datos de menores (COPPA en EE. UU., RGPD/edad de consentimiento en UE) | Menores de 13 (EE. UU.) requieren consentimiento parental verificable | Decidir edad mínima y flujo de consentimiento antes de abrir cuentas | abierto |
| Términos de Canvas / de cada escuela | Automatizar acceso puede violar términos | Solo usar lo que el estudiante exporta o autoriza (iCal, correos, extensión) | abierto |
| Bloqueo de apps en iOS/Android | Apple exige Screen Time API (Family Controls); Android, permisos de accesibilidad/uso | Investigar en fase 6 | abierto |
| Grabaciones de clase | Leyes de consentimiento de grabación (uno o todos los participantes) | Fuera del MVP | aplazado |
| Costo de IA por estudiante | Puede superar el precio de la suscripción | Medir tokens por sesión, límites por plan, caché de prompts | abierto: el chat aún no tiene límite por usuario; no publicar sin rate limit |
| SSRF en `/api/calendar/preview` | El servidor descarga URLs que da el usuario | Ya validamos https, ruta de feed, IPs privadas y sin redirecciones. Falta: fijar la IP resuelta (DNS rebinding) antes de producción | mitigado parcialmente |
| URL del feed iCal es secreta | Quien la tenga ve el calendario del estudiante | Tratarla como credencial: cifrada en BD, nunca en logs | abierto |
