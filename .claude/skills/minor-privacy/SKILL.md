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
- [ ] **Edad**: la app es para 13+ y adultos. Bloquear el registro a menores de 13 (evita COPPA). Para 13–17: en la UE la edad de consentimiento digital va de 13 a 16 según el país, y por debajo de ella hace falta consentimiento parental.
- [ ] **Cifrado**: en tránsito (https) siempre; en reposo para credenciales como la URL del feed.

Si algún punto no se cumple, dilo explícitamente y añade la fila correspondiente en `docs/risks.md`.
