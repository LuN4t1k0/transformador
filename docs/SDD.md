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

## Frontend Application Design

### Objetivo

El frontend debe permitir transformar Excel mediante plantillas sin exponer complejidad tecnica innecesaria. La UI debe guiar al usuario por un flujo operacional claro: subir archivo, revisar analisis, resolver mapping, previsualizar, validar, generar y descargar. La aplicacion es privada y no debe mostrar pantallas de signup, login propio ni recuperacion de password.

### Stack frontend

- Next.js.
- React.
- JavaScript.
- CSS Modules o una capa CSS simple del proyecto.
- Consumo de API Node separada mediante HTTP.
- Consumo de progreso en tiempo real mediante Socket.IO.

No usar TypeScript en el MVP para mantener alineacion con el stack solicitado.

### Rutas propuestas

- `/`: redirecciona a `/jobs/new` si existe sesion local valida.
- `/auth/callback`: recibe resultado de Previley Internal SSO y crea sesion local mediante API.
- `/jobs/new`: flujo principal de upload y configuracion.
- `/jobs/:jobId`: estado del job, analisis, mapping, preview, validacion, generacion y descarga.
- `/templates`: listado de plantillas compartidas.
- `/templates/new`: crear plantilla.
- `/templates/:templateId`: ver plantilla activa y versiones.
- `/templates/:templateId/edit`: editar creando nueva version.
- `/templates/:templateId/versions/:versionId`: ver version historica de solo lectura.

### Layout

La aplicacion debe sentirse como herramienta interna de trabajo: densa, clara y predecible. Evitar hero pages, marketing copy, cards decorativas o pantallas introductorias. La primera pantalla util despues de autenticacion debe ser el flujo de carga o el ultimo job activo.

Estructura base:

- barra superior compacta con nombre de aplicacion, usuario y acciones globales;
- navegacion lateral o superior simple con `Nuevo job`, `Plantillas`, `Historial`;
- area central de trabajo;
- panel lateral contextual para warnings, errores, progreso y acciones.

### Pantalla: nuevo job

Responsabilidades:

- cargar archivo `.xlsx`;
- validar extension y tamano antes de enviar;
- mostrar limites configurados;
- iniciar job de analisis;
- redirigir a `/jobs/:jobId`.

Estados:

- idle;
- archivo seleccionado;
- subiendo;
- error de validacion local;
- error de API;
- job creado.

La UI no debe intentar leer datos sensibles del Excel en navegador mas alla de validaciones basicas de archivo.

### Pantalla: detalle de job

Debe ser una pantalla por pasos, pero no necesariamente un wizard bloqueante. El usuario debe ver en todo momento:

- estado actual del job;
- hoja seleccionada;
- plantilla seleccionada;
- progreso real;
- errores/warnings;
- accion siguiente disponible.

Secciones:

- `Archivo`: metadata no sensible, nombre original, tamano, expiracion.
- `Hojas`: listado de hojas detectadas con dimensiones.
- `Analisis`: encabezados, tipo fisico, tipo semantico y evidencia.
- `Plantilla`: seleccionar plantilla existente o crear una nueva.
- `Mapping`: resolver columnas esperadas contra columnas del archivo.
- `Preview`: muestra entrada/salida de pocas filas.
- `Validacion`: conteos de filas validas, errores y warnings.
- `Descarga`: generar y descargar output.

### Selector de hoja

Debe mostrar:

- nombre de hoja;
- rango/dimension;
- cantidad aproximada de filas y columnas si esta disponible;
- advertencias de hoja oculta, vacia, encabezados duplicados o columnas vacias.

La seleccion de hoja debe quedar asociada al job, no a la plantilla global, salvo que el usuario guarde esa decision en una nueva version.

### Analisis de columnas

Tabla de columnas detectadas:

- encabezado original;
- posicion;
- tipo fisico;
- tipo semantico sugerido;
- confianza deterministica;
- evidencia resumida;
- muestras anonimizadas o enmascaradas solo si son necesarias para operacion.

Para datos sensibles, la UI debe preferir ejemplos transformados o enmascarados. No debe persistir muestras en frontend fuera del estado efimero del job.

### Mapping

La UI debe resolver tres casos:

- match automatico deterministico;
- match con baja confianza que requiere confirmacion;
- campo faltante que requiere seleccion manual, constante, vacio o regla.

Cada fila de mapping debe mostrar:

- columna esperada por plantilla;
- tipo esperado;
- columna origen asignada;
- indicador de requerido;
- transformaciones aplicadas;
- estado: `OK`, `REQUIERE_CONFIRMACION`, `FALTANTE`, `INVALIDO`.

Si el usuario corrige un mapping, puede optar por:

- aplicar solo al job actual;
- guardar como nueva version de plantilla;
- agregar alias a la plantilla.

### Editor de plantilla

El editor debe crear una version nueva al guardar. Nunca debe modificar una version historica.

Campos por columna:

- nombre de salida;
- posicion;
- required;
- tipo semantico esperado;
- fuente: columna, constante, vacio, concat, split;
- transformaciones;
- validaciones;
- preview de resultado.

Controles esperados:

- menus para seleccionar columnas y operaciones;
- toggles para required y validaciones binarias;
- inputs para constantes, separadores y formatos;
- controles de orden para mover columnas;
- botones iconicos para duplicar, eliminar y reordenar.

No permitir editor de JavaScript, expresiones libres ejecutables, `eval`, SQL ni formulas arbitrarias.

### Transformaciones soportadas en UI MVP

- RUT: `12.345.678-5`, `12345678-5`, `123456785`.
- Texto: trim, uppercase, lowercase, normalizar espacios, remover acentos.
- Fecha: `DD-MM-YYYY`, `DD/MM/YYYY`, serial Excel, `YYYYMM` con dia explicito configurado.
- Numero: entero, decimal, redondeo, decimales fijos, absoluto solo si esta configurado.
- Estructura: seleccionar, renombrar, ordenar, duplicar, concat, split por palabras.

### Preview

La preview debe comparar entrada y salida antes de transformar el archivo completo.

Debe mostrar:

- filas de muestra;
- valor transformado;
- warnings por celda;
- errores por celda;
- transformacion responsable.

La preview no reemplaza la validacion final. La transformacion completa debe validar todas las filas.

### Validacion

La UI debe mostrar resumen:

- total de filas;
- filas procesadas;
- filas validas;
- cantidad de warnings;
- cantidad de errores;
- modo `STRICT` o `LENIENT`.

Errores:

- fila;
- columna;
- regla;
- codigo;
- mensaje.

Si el error incluye valores sensibles, estos deben estar enmascarados o ausentes.

### Progreso realtime

El frontend se suscribe a `job:{jobId}` solo despues de confirmar que el usuario tiene acceso al job.

Eventos consumidos:

- `job:queued`;
- `job:started`;
- `job:stage`;
- `job:progress`;
- `job:completed`;
- `job:failed`;
- `job:cancelled`;
- `job:purged`.

El progreso visual debe representar trabajo real reportado por worker. No usar barra artificial basada en timers.

### Descarga y purga

La descarga debe usar URL o endpoint autenticado de un output temporal. Al completar descarga:

- marcar job como `DOWNLOADED`;
- solicitar purga del output si la politica del job es eliminar post-descarga;
- actualizar UI a estado descargado/purgado.

Si el usuario no descarga, el output expira por TTL y la UI debe mostrar `EXPIRED`.

### Contratos API consumidos por frontend

Endpoints conceptuales:

- `GET /session`: sesion local.
- `POST /auth/sso/callback`: validar SSO y crear sesion.
- `POST /jobs`: crear job con upload.
- `GET /jobs/:jobId`: metadata del job.
- `POST /jobs/:jobId/analyze`: encolar analisis si corresponde.
- `PATCH /jobs/:jobId/sheet`: seleccionar hoja.
- `PATCH /jobs/:jobId/mapping`: guardar mapping efimero del job.
- `POST /jobs/:jobId/preview`: generar preview.
- `POST /jobs/:jobId/transform`: encolar transformacion.
- `GET /jobs/:jobId/download`: descargar output temporal.
- `POST /jobs/:jobId/cancel`: cancelar job.
- `GET /templates`: listar plantillas.
- `POST /templates`: crear plantilla.
- `GET /templates/:templateId`: obtener plantilla.
- `POST /templates/:templateId/versions`: crear nueva version.
- `GET /templates/:templateId/versions/:versionId`: obtener version.

Ningun endpoint debe devolver filas completas persistidas desde PostgreSQL. Preview y errores detallados pertenecen a la vida efimera del job.

### Estados de UI

Cada pantalla debe manejar:

- loading;
- empty;
- success;
- validation error;
- job failed;
- job cancelled;
- job expired;
- disconnected realtime;
- unauthorized;
- forbidden.

La desconexion Socket.IO no debe perder el estado: la UI debe rehidratar desde `GET /jobs/:jobId` y volver a suscribirse.

### Accesibilidad y usabilidad

- tablas navegables por teclado;
- labels visibles para inputs;
- mensajes de error accionables;
- contraste suficiente;
- botones deshabilitados con razon visible;
- no depender solo de color para estados;
- columnas y paneles con ancho estable para evitar saltos de layout.

### Criterios de aceptacion frontend MVP

1. usuario autenticado por SSO puede entrar a la app;
2. usuario puede subir un `.xlsx`;
3. UI muestra hojas detectadas;
4. usuario selecciona hoja;
5. UI muestra columnas, tipos fisicos y semanticos;
6. usuario selecciona plantilla PlanVital;
7. UI muestra mapping requerido;
8. usuario corrige campos ambiguos o faltantes;
9. usuario configura formato RUT, fechas y mayusculas;
10. usuario ve preview entrada/salida;
11. usuario ejecuta transformacion;
12. UI muestra progreso real via Socket.IO;
13. UI muestra resumen de validacion;
14. usuario descarga XLSX generado;
15. UI refleja descarga/purga;
16. recargar la pagina conserva metadata del job pero no persiste filas sensibles.

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

- `RESUMEN`: rango `A1:AG4` (3 filas, 33 columnas).
- `DETALLE_CADENAS`: rango `A1:AB40` (39 filas, 28 columnas). Las fechas vienen como celdas de fecha de Excel, no como texto.

Columnas relevantes detectadas:

- `RUT`
- `Nombre completo`
- `Remuneracion`
- `Cod.`
- `Periodo`
- `Fecha Inicio`
- `Fecha Término`
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
