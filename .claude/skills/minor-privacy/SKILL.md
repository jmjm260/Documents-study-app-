---
name: minor-privacy
description: Lista de verificación de privacidad para datos de menores (COPPA/RGPD). Úsala al diseñar modelos de datos, formularios, logs, analítica o integraciones con terceros.
---

# Privacidad para menores — checklist

Antes de dar por terminado un cambio que toque datos de usuarios, verifica:

- [ ] **Minimización**: ¿guardamos solo lo imprescindible? ¿Se puede no guardarlo?
- [ ] **Logs**: ningún dato personal, contenido de tareas, URL de feed ni correo en logs o errores.
- [ ] **URLs**: nada personal en query strings ni rutas.
- [ ] **Terceros**: ¿se envía algo a un servicio externo (IA, analítica)? Documentar qué y por qué. Sin analítica publicitaria.
- [ ] **IA**: enviar a la API solo el contexto necesario para la respuesta; sin nombre real ni correo.
- [ ] **Retención**: ¿cuándo se borra? El usuario debe poder borrar su cuenta y todos sus datos.
- [ ] **Edad**: menores de 13 (EE. UU.) requieren consentimiento parental verificable; en la UE la edad de consentimiento varía (13–16). Hasta tener el flujo, no abrir cuentas a menores de 13.
- [ ] **Cifrado**: en tránsito (https) siempre; en reposo para credenciales como la URL del feed.

Si algún punto no se cumple, dilo explícitamente y añade la fila correspondiente en `docs/risks.md`.
