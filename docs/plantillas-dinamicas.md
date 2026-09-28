# Plantillas dinámicas

Estado: aprobado (2026-09-28). Complementa `docs/SDD.md`.

## Objetivo

El transformador recibe un Excel, identifica la hoja y sus encabezados, y genera un archivo en el formato que pide un destino (AFP, TGR, otra entidad o servicio interno). Los formatos cambian en el tiempo y existen muchos destinos y procesos (licencias PAGEX, moras presuntas, etc.), por lo que las plantillas las crean y editan los usuarios desde la interfaz, no el código.

## Decisiones

- Plantillas compartidas entre todos los usuarios; se registra quién creó cada versión.
- Editar una plantilla crea una versión nueva e inmutable. Cada job registra la versión con que se generó.
- Clasificación con dos etiquetas libres con autocompletado: **destino** (PlanVital, TGR…) y **proceso** (Licencias PAGEX, Moras presuntas…).
- Formatos de salida elegibles por plantilla: XLSX, texto delimitado (CSV/TXT) y TXT de ancho fijo.
- Ninguna plantilla ejecuta código: solo operaciones de una lista permitida, validadas en el servidor.

## Flujo del job

1. **Subir** el `.xlsx` (sin elegir plantilla).
2. **Hoja**: si hay más de una hoja con datos, el usuario debe elegir. Con una sola, se selecciona automáticamente.
3. **Plantilla**: plantillas guardadas con cuántas columnas reconocen en esta hoja; filtros por destino y proceso. Alternativa: crear una plantilla nueva desde los encabezados del archivo.
4. **Columnas**: editor de columnas de salida con valor de ejemplo en vivo.
5. **Salida**: formato del archivo.
6. **Vista previa**: el archivo final tal como se generará, para algunas filas.
7. **Generar**: guardar (solo este archivo / nueva versión / plantilla nueva), transformar, descargar.

## Modelo de plantilla (`template_versions.configuration`)

```js
{
  name, description, destination, process,
  input: { sheet: 'RESUMEN', headerRow: 1 },          // sheet es solo una sugerencia
  output: {
    format: 'XLSX' | 'DELIMITED' | 'FIXED_WIDTH',
    sheetName: 'DATOS',                               // XLSX
    delimiter: ';' | ',' | '|' | '\t',                // DELIMITED
    extension: 'csv' | 'txt',                         // DELIMITED / FIXED_WIDTH
    includeHeaders: true,                             // DELIMITED / FIXED_WIDTH
    encoding: 'UTF-8' | 'LATIN1',
    lineEnding: 'CRLF' | 'LF'
  },
  columns: [{
    id, position, outputName, required,
    reviewed: true,                                   // origen ambiguo ya confirmado por un usuario
    aliases: ['Rut trabajador'],                      // otros nombres de encabezado ya vistos
    source:
      { type: 'COLUMN', column } |
      { type: 'CONSTANT', value } |
      { type: 'EMPTY' } |
      { type: 'CONCAT', parts: [{ type: 'COLUMN', column } | { type: 'CONSTANT', value }], separator } |
      { type: 'SPLIT_WORD', column, index } |
      { type: 'SPLIT_WORD_RANGE', column, start, end? },
    transformations: [
      { type: 'RUT_FORMAT', format: 'NO_DOTS_NO_DASH' | 'NO_DOTS_DASH' | 'DOTS_DASH' | 'BODY' | 'DV' },
      { type: 'DATE_FORMAT', inputFormat: 'AUTO' | …, outputFormat: 'DD/MM/YYYY' | … },
      { type: 'TEXT', operation: 'TRIM' | 'UPPERCASE' | 'LOWERCASE' | 'NORMALIZE_SPACES' | 'REMOVE_ACCENTS' },
      { type: 'NUMBER', integer?, round?, fixedDecimals?, absolute?, decimalSeparator? }
    ],
    validations: [{ type: 'VALID_RUT' } | { type: 'INTEGER' }],
    fixedWidth: { length, align: 'LEFT' | 'RIGHT', padChar: ' ' | '0' }   // solo FIXED_WIDTH
  }]
}
```

Reglas: `outputName` único; como máximo 200 columnas; `id` único; el orden del arreglo define la posición. `VALID_RUT` valida el RUT de origen, aunque la salida conserve solo el número o el dígito verificador. En ancho fijo, un valor más largo que `length` es un error de validación (`TOO_LONG`), no se trunca.

## Reconocimiento automático

Al aplicar una plantilla a una hoja, cada origen de columna única (`COLUMN`, `SPLIT_*`) se resuelve contra los encabezados por: nombre exacto, nombre normalizado (sin tildes ni mayúsculas) o alias. Al guardar una versión nueva desde un job, el nombre anterior pasa a los alias, para que la plantilla reconozca ambos nombres.

Estados por columna: `OK`; `REQUIERE_CONFIRMACION` (separar por palabras, o una columna de origen usada por varios campos, salvo que la columna esté marcada `reviewed`; al guardar desde un job, las columnas confirmadas quedan `reviewed`, y duplicar una columna en el editor se considera confirmado); `FALTANTE` (campo obligatorio sin origen, o su columna no está en el archivo). Una columna opcional cuya columna de origen no existe queda vacía, con una nota.

## Estado del job

`transformation_jobs` guarda la hoja elegida, la plantilla base (`template_id`, `template_version_id`, que pueden ser nulos para una plantilla nueva) y `working_template`, la configuración con la que se trabaja. Guardarla como versión o como plantilla nueva actualiza la plantilla base del job.

## Vista previa

`GET /jobs/:id/sample` entrega al dueño del job hasta 5 filas de la hoja, sin persistirlas. La web ejecuta el mismo `template-engine` en el navegador para mostrar ejemplos en vivo mientras se edita.

## API

- `GET /templates`, `GET /templates/:id`, `GET /templates/:id/versions/:versionId`
- `POST /templates`, `POST /templates/:id/versions`, `POST /templates/:id/duplicate`
- `POST /templates/:id/archive`, `POST /templates/:id/unarchive`
- `POST /jobs` (solo archivo), `PATCH /jobs/:id/sheet`, `GET /jobs/:id/template-matches`
- `POST /jobs/:id/template` (`{ templateId }` o `{ blank: true }`), `PATCH /jobs/:id/working-template`
- `POST /jobs/:id/template/save` (`{ mode: 'NEW_VERSION' }` o `{ mode: 'NEW_TEMPLATE', name, destination, process, description }`)
- `GET /jobs/:id/sample`, `POST /jobs/:id/transform`, `POST /jobs/:id/cancel`, `GET /jobs/:id/download`

## Etapas

1. Motor y API de plantillas: esquema, validación, versiones, formatos de salida.
2. Flujo del job: hoja obligatoria, elegir o crear plantilla, editor con vista previa.
3. Páginas de plantillas: lista, detalle, versiones, duplicar, archivar y editar sin archivo.
