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
      { type: 'SPLIT_WORD_RANGE', column, start, end? } |
      { type: 'CALC', op: 'PERCENT' | 'SUM' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'AVERAGE',
        value?,                                        // porcentaje, solo en PERCENT (ej. 10 o 1.44)
        operands: [{ type: 'COLUMN', column } | { type: 'OUTPUT', columnId } | { type: 'NUMBER', value }],
        round: { mode: 'ROUND' | 'FLOOR' | 'CEIL' | 'NONE', decimals } },
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

Cálculos: sin fórmulas libres, solo esas operaciones. `OUTPUT` referencia a una columna anterior de la misma plantilla (sin ciclos); el motor evalúa primero los orígenes simples y luego los cálculos en orden. Operandos no numéricos generan `INVALID_NUMBER` y la división por cero `DIVISION_BY_ZERO`.

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

## Crear plantillas

`/templates/new` ofrece tres caminos:

1. **Desde un ejemplo** (`POST /templates/draft`, multipart `input` y/o `output`): con el Excel que se recibe y un ejemplo del archivo que pide el destino (mismas filas), `template-engine/src/infer.js` deduce por cada columna de salida el formato (RUT, fecha, número, mayúsculas, valor fijo) y el origen que reproduce el ejemplo fila a fila (columna, palabra N o desde la palabra N), con al menos 80% de coincidencia. Si las filas no corresponden a las mismas personas, se alinean por RUT; si no hay RUT en común, se sugiere el origen por nombres de columna parecidos (abreviaturas y sinónimos) con formato compatible. Las columnas numéricas del ejemplo de destino se prueban como cálculos entre sí (suma de dos columnas o porcentaje constante de otra, con tolerancia ±1 por redondeo); si la relación se cumple en todas las filas se aplica, y si se cumple en al menos 85% se sugiere indicando las excepciones. Lo que no se puede deducir queda vacío y se informa; cada columna se puede asignar a mano desde su fila. Con solo el Excel de origen, parte con una columna por encabezado; con solo el ejemplo de destino, usa sus nombres. Los archivos se borran al terminar; las filas de muestra solo vuelven al navegador para la vista previa.
2. **A partir de otra plantilla** (`/templates/new?from=<id>`): copia la versión vigente para modificarla y guardarla como plantilla nueva; la original no cambia.
3. **Desde cero.**

En cualquier formulario de plantilla, «Probar con un Excel» carga encabezados y filas de muestra para elegir orígenes reales y ver la vista previa.

## Uso frecuente (modo simple)

- Inicio (`/`): zona de carga (uno o varios archivos), últimas conversiones con «Repetir con otro archivo» y plantillas del usuario con «Usar con un archivo» y «Excel de ejemplo».
- Un archivo puede subirse con `reuseFromJobId` (copia hoja, plantilla de trabajo y confirmaciones de una conversión anterior) o con `templateId` (aplica la versión vigente de una plantilla). El worker lo aplica al terminar el análisis.
- Si la plantilla usada la última vez reconoce todas las columnas, se aplica sola. Si no, se recomiendan las que calzan completas.
- Filas rechazadas: se descargan con motivo y pista de corrección, y al subirlas corregidas («Subir corregidas») se procesan con la misma configuración.
- Carga múltiple: varios archivos con la misma plantilla, uno tras otro; los que requieren revisión quedan marcados con enlace.
- `GET /templates/:id/example` entrega un Excel de ejemplo con los encabezados esperados, una fila de ejemplo y una hoja de instrucciones.
- El modo avanzado (preferencia por navegador) muestra el editor de 6 pasos y la edición de plantillas; debería pasar a depender del rol cuando exista el SSO.

## Etapas

1. Motor y API de plantillas: esquema, validación, versiones, formatos de salida.
2. Flujo del job: hoja obligatoria, elegir o crear plantilla, editor con vista previa.
3. Páginas de plantillas: lista, detalle, versiones, duplicar, archivar y editar sin archivo.
