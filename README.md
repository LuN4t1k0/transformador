# Previley Excel Transformer

Base inicial para una plataforma privada y deterministica de transformacion Excel mediante plantillas versionadas.

## Estado actual

Incluye:

- SDD inicial en `docs/SDD.md`.
- Diseño frontend MVP: rutas, pantallas, estados, contratos API, realtime y criterios de aceptacion.
- App web Next.js + Tailwind en `apps/web`: `/jobs/new`, `/jobs/:jobId` (hoja, plantilla, columnas, salida, vista previa, generación con progreso realtime y descarga), `/jobs` y `/templates` (lista, detalle con versiones, crear, editar, duplicar, archivar).
- Plantillas dinámicas creadas por usuarios (ver `docs/plantillas-dinamicas.md`): orígenes por columna, formatos de RUT/fecha/número/texto, salida XLSX, texto delimitado o ancho fijo, versiones inmutables y reconocimiento de encabezados por alias.
- API Node en `apps/api`: endpoints de jobs y plantillas del SDD, subida multipart, Socket.IO por room `job:{jobId}` con verificación de acceso, descarga con purga posterior.
- Worker BullMQ en `apps/worker`: colas `analysis`, `transformation` (progreso y cancelación) y `cleanup` (expiración cada 10 minutos).
- Lectura XLSX en streaming propia (`packages/excel-engine/src/xlsx-reader.js`: zip con acceso aleatorio + SAX) con detección de fila de encabezados, límites de filas, columnas, hojas y tamaño descomprimido; escritura con `exceljs`.
- Filas rechazadas entregadas en un Excel aparte, re-descarga hasta la expiración, purga manual y expiración que se extiende con la actividad.
- Auditoría en `audit_events` (sin valores de filas), visible como actividad del job; `x-request-id` y logs estructurados de duración por solicitud y por proceso.
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
- `TemporaryStorage` compartido (S3) para separar API y worker en contenedores distintos.
