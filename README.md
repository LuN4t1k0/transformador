# Previley Excel Transformer

Base inicial para una plataforma privada y deterministica de transformacion Excel mediante plantillas versionadas.

## Estado actual

Incluye:

- SDD inicial en `docs/SDD.md`.
- Motor de transformacion por plantilla en `packages/template-engine`.
- Transformaciones reutilizables de RUT, texto, numero y fecha.
- Detectores deterministicos fisicos y semanticos.
- Plantilla seed `PlanVital - PAGEX` sin hardcodear reglas en el engine.
- Abstraccion `TemporaryStorage` con implementacion local en `/tmp`.
- Schema PostgreSQL conceptual para usuarios, plantillas, versiones, jobs y auditoria.
- Contratos iniciales de SSO, eventos Socket.IO y colas.

## Comandos

```bash
npm test
npm run dev
npm run stop
```

La API queda disponible en `http://localhost:4000`. Por defecto Docker expone PostgreSQL en `5434` y Redis en `6380` para evitar conflictos con servicios locales comunes.

## Siguiente fase

Conectar API Node, worker BullMQ, PostgreSQL, Redis y lectura/escritura XLSX real. La implementacion debe mantener procesamiento efimero: no persistir contenido de filas en PostgreSQL ni Redis.
