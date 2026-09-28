# SDD - Excel Transformation Platform

## Resumen ejecutivo

La plataforma transforma archivos Excel tabulares a formatos definidos por plantillas versionadas. Los archivos son transitorios; el activo persistente es la plantilla de transformacion y la metadata no sensible de jobs. El motor es deterministico y no usa IA, embeddings, modelos externos ni ejecucion de codigo arbitrario.

## Arquitectura propuesta

Monorepo JavaScript:

- `apps/web`: Next.js para UI privada, upload, mapping, preview y descarga.
- `apps/api`: Node.js para sesiones SSO, uploads, jobs, Socket.IO y API interna.
- `apps/worker`: workers BullMQ para analisis, transformacion y cleanup.
- `packages/excel-engine`: lectura/escritura Excel y protecciones de archivo.
- `packages/template-engine`: ejecucion de reglas de plantilla.
- `packages/transformations`: transformaciones deterministicas reutilizables.
- `packages/detectors`: detectores fisicos y semanticos por registry.
- `packages/storage`: `TemporaryStorage` local y futura implementacion S3.
- `packages/shared`: contratos, estados, configuracion y plantillas seed.

La primera version puede desplegar API y worker en un mismo servicio Railway si comparten `/tmp`, con separacion logica desde el codigo. Al separar contenedores, `TemporaryStorage` debe cambiar a S3 u otro storage temporal compartido.

## Decision de backend separado

Se propone backend Node separado de Next.js porque Socket.IO, BullMQ, uploads, limites operacionales y workers tienen ciclos de vida distintos a la UI. Esto mejora aislamiento, mantenibilidad y crecimiento en Railway, sin impedir que al inicio se despliegue de forma simple.

## Jobs

Estados:

- `QUEUED_ANALYSIS`
- `ANALYZING`
- `READY`
- `QUEUED_TRANSFORMATION`
- `TRANSFORMING`
- `VALIDATING`
- `GENERATING`
- `READY_TO_DOWNLOAD`
- `DOWNLOADED`
- `PURGED`
- `FAILED`
- `CANCELLED`
- `EXPIRED`

Colas BullMQ:

- `analysis`: analiza workbook, hojas, encabezados y muestras.
- `transformation`: transforma y valida todas las filas.
- `cleanup`: purga archivos y jobs expirados.

Los eventos Socket.IO se publican por room `job:{jobId}` y nunca contienen valores sensibles de filas.

## Plantillas

Las plantillas viven en PostgreSQL con versiones inmutables en JSONB. Una columna de salida declara posicion, fuente, transformaciones, validaciones y si es requerida. El engine solo entiende primitivas genericas; PlanVital es una plantilla seed.

## Archivo PAGEX inspeccionado

Archivo: `/Users/cristianvenegas/Desktop/EjemploPagex.xlsx`.

Hojas:

- `RESUMEN`: rango `A1:AG4`.
- `DETALLE_CADENAS`: rango `A1:AB40`.

Columnas relevantes detectadas:

- `RUT`
- `Nombre completo`
- `Remuneracion`
- `Cod.`
- `Periodo`
- `Fecha Inicio`
- `Fecha Termino`
- `AFP`
- `dias_licencia`
- `dias_pagados`
- `base_utilizada`
- `monto_rem_dias`
- `aporte_pension`
- `comision_afp`
- `total_aporte_afp`

Ambiguedades para PlanVital:

- Apellidos y nombres vienen como `Nombre completo`; separar nombres chilenos no es deterministico perfecto. La plantilla seed usa split configurable como punto de partida y debe pasar por preview.
- `N.º LICENCIA` no aparece como columna directa. Queda como `EMPTY` hasta que se defina una fuente.
- `AFP ACTUAL` puede mapearse inicialmente desde `AFP`, pero debe confirmarse si difiere de `AFP ORIGEN`.

## Pruebas

La base actual cubre unitariamente:

- RUT chileno: normalizacion, DV y formatos.
- Texto, numeros y fechas.
- Detectores deterministicos.
- Ejecucion de plantilla PlanVital sobre una fila de muestra.

