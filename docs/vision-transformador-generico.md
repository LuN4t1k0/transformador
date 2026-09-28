# Visión: transformador genérico de Excel

Estado: acordado (2026-09-28). Orienta la evolución después de `docs/plantillas-dinamicas.md`.

## Idea central

La herramienta no es "previsional": es un **transformador genérico de tablas**. Entra un Excel con cualquier conjunto de columnas y sale otra tabla con la forma que alguien necesita. Lo específico de un dominio (RUT, AFP, UF, formatos de una entidad) vive en **paquetes de dominio** que se activan sobre un núcleo neutro.

## Estructura de una plantilla (hacia dónde vamos)

Hoy una plantilla es una lista de columnas de salida. Las herramientas maduras (Power Query, Alteryx) modelan una secuencia de pasos; aquí se expresa en cuatro secciones fijas, fáciles de entender:

1. **Preparar la entrada**: rellenar hacia abajo, saltar filas de título o totales, despivotar, juntar hojas.
2. **Filas**: filtrar, quitar duplicados, agrupar y resumir, ordenar, cruzar con otra tabla.
3. **Columnas**: cómo se calcula cada columna de salida (lo que existe hoy, ampliado).
4. **Salida**: formato, encabezado y totales, formatos de celda, dividir en varios archivos, nombre con variables.

## Mapa de capacidades

### 1. Columnas

| Capacidad | Estado |
|---|---|
| Copiar, renombrar, reordenar | Hecho |
| Valor fijo | Hecho |
| Unir columnas con separador | Hecho |
| Separar por palabras | Hecho; falta separar por cualquier separador |
| Aritmética (%, +, −, ×, ÷, promedio, redondeo) | Hecho; faltan mínimo, máximo y valor absoluto |
| Condiciones (si / entonces / si no, varias ramas) | Etapa 1 |
| Tabla de equivalencias ("M" → "Masculino") | Etapa 1 |
| Primer valor no vacío entre varias columnas | Etapa 1 |
| Texto con variables (`{Nombre} {Apellido} - {Código}`) | Etapa 1 |
| Texto: reemplazar, rellenar, extraer parte, solo dígitos, nombre propio | Etapa 1 |
| Fechas: días entre fechas, sumar días/meses, año/mes/día, inicio/fin de mes, fecha de proceso | Etapa 1 |
| Número correlativo | Etapa 1 |
| Fórmulas anidadas en una sola columna | Mediante columnas intermedias |

### 2. Filas

Filtrar, ordenar, quitar duplicados, agrupar y resumir (suma, conteo, mínimo, máximo), pivotar y despivotar, rellenar hacia abajo, saltar filas de subtotales, una fila en varias.

### 3. Varias tablas

Juntar hojas o archivos con la misma estructura, cruzar con otra tabla (tipo BUSCARV), tablas de referencia guardadas y reutilizables.

### 4. Salida

Varias salidas (un archivo por valor, varias hojas), encabezado y pie, filas de totales, formatos de celda (porcentaje, moneda, fecha, anchos), nombre de archivo con variables, otros formatos (JSON, XML) para sistemas.

### 5. Transversal

- Validaciones genéricas: obligatorio, único, rango, lista permitida, patrón, comparación entre columnas; como error o advertencia.
- Parámetros al ejecutar ("¿período?", "¿cliente?") usables en columnas, filtros y nombre de archivo.
- Pruebas de plantilla con un ejemplo de entrada y el resultado esperado.
- Exportar e importar plantillas.
- Automatización: API, casilla de correo, carpetas vigiladas.
- Corrección de errores en una grilla editable en pantalla.
- Asistencia al diseño (opcional): describir en lenguaje natural y convertirlo en una regla estructurada revisable; la ejecución sigue siendo determinista.

### 6. Paquetes de dominio

El núcleo no conoce RUT, AFP ni UF. Un paquete aporta formatos, validaciones, detectores y tablas de referencia. Primer paquete: Chile/previsional (RUT, detectores de AFP y periodo, indicadores). Otros posibles: identificadores de otros países, correos y teléfonos, monedas.

## Principios

- Sin código ni fórmulas libres: solo operaciones de una lista permitida, validadas en el servidor.
- Referencias solo hacia atrás (una columna usa columnas anteriores), así no hay ciclos.
- Todo lo que se configura se puede aprender desde ejemplos cuando sea posible, y siempre se puede ajustar a mano.
- La vista previa muestra el efecto de cada regla con filas reales antes de procesar.

## Etapas

1. Funciones de columna genéricas (condiciones, equivalencias, primer no vacío, texto con variables, texto, fechas, correlativo, mínimo/máximo/absoluto, separar por cualquier separador).
2. Paso de filas: filtrar, ordenar, quitar duplicados, agrupar, rellenar hacia abajo.
   Hecho: sección opcional `rowSteps` de la plantilla, en orden fijo: rellenar hacia abajo (columnas del Excel) → columnas → filtro (quitar o mantener, con columnas del Excel o de la plantilla; las filas filtradas no se validan) → rechazo de filas con errores → quitar duplicados (primera o última) → agrupar (suma, promedio, mínimo, máximo, cantidad, primer/último valor, lista) → ordenar → correlativo según el orden final. Sumas y orden usan el valor antes del formato. Sin pasos de filas, el archivo se escribe en streaming como antes.
3. Parámetros al ejecutar y salida en varios archivos; diseño de salida (encabezado, totales, formatos, nombre).
4. Separar el paquete Chile del núcleo.
5. Varias tablas, validaciones genéricas, corrección en grilla y automatización.
