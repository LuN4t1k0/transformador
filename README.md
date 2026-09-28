# Previley Excel Transformer

Base inicial para una plataforma privada y deterministica de transformacion Excel mediante plantillas versionadas.

## Estado actual

Incluye:

- SDD inicial en `docs/SDD.md`.
- Diseño frontend MVP: rutas, pantallas, estados, contratos API, realtime y criterios de aceptacion.
- App web Next.js + Tailwind en `apps/web`: `/jobs/new`, `/jobs/:jobId` (hoja, mapeo, vista previa, generación con progreso realtime y descarga), `/jobs` y `/templates`.
- API Node en `apps/api`: endpoints de jobs y plantillas del SDD, subida multipart, Socket.IO por room `job:{jobId}` con verificación de acceso, descarga con purga posterior.
- Worker BullMQ en `apps/worker`: colas `analysis`, `transformation` (progreso y cancelación) y `cleanup` (expiración cada 10 minutos).
- Lectura y escritura XLSX real con `exceljs` en `packages/excel-engine`, con límites de filas, columnas y hojas.
- PostgreSQL con migraciones en `packages/shared/db/migrations` (se aplican al iniciar API y worker). Solo guarda metadata: hojas, encabezados, tipos detectados, mapeo por nombre de columna y conteos de validación.
- Motor de transformacion por plantilla en `packages/template-engine`.
- Transformaciones reutilizables de RUT, texto, numero y fecha.
- Detectores deterministicos fisicos y semanticos.
- Plantilla seed `PlanVital - PAGEX` sin hardcodear reglas en el engine.
- Abstraccion `TemporaryStorage` con implementacion local en `/tmp`.
- Contratos iniciales de SSO, eventos Socket.IO y colas.

## Comandos

```bash
npm test
npm run dev
npm run stop
```

La web queda disponible en `http://localhost:3000` y la API en `http://localhost:4000`. Por defecto Docker expone PostgreSQL en `5434` y Redis en `6380` para evitar conflictos con servicios locales comunes.

## Autenticación

`AUTH_MODE=dev` autentica todas las solicitudes como el usuario `DEV_USER_*`. Con cualquier otro valor la API responde 401 hasta implementar el adaptador de Previley SSO (`apps/api/src/auth/previley-sso.js`) y `POST /auth/sso/callback`.

## Siguiente fase

- Adaptador Previley SSO y sesiones.
- Lectura XLSX en streaming: hoy el libro se carga en memoria (unos 830 MB para 100.000 filas), porque el lector en streaming de `exceljs` no es determinista cuando `sharedStrings.xml` viene después de las hojas.
- `TemporaryStorage` compartido (S3) para separar API y worker en contenedores distintos.
