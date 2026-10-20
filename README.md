# Study App

Asistente de estudio con IA para estudiantes que usan Canvas. Ver [docs/vision.md](docs/vision.md).

## Arrancar

```bash
cd web
npm install
npm run dev
```

Abre http://localhost:3000, pega la URL del feed de calendario de Canvas (o sube un `.ics`)
y verás qué tareas y datos trae.

## Comprobar antes de subir cambios

```bash
cd web
npm test && npm run lint && npm run build
```
