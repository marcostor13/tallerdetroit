# Análisis funcional y de datos — Plataforma web de generación de informes técnicos

**Cliente/contexto:** Detroit Power System Perú
**Fuentes analizadas:**

1. `01. SERFOR002 EVALUACIÓN OT746.docx` — Informe de evaluación W6-1, motor MTU 16V4000C21, equipo VQT-33 (SPCC Toquepala)
2. `2. SERFOR002 EVALUACIÓN MOTOR ITSTE26898 TOQUEPALA REVISADO.docx` — Informe de evaluación QL4, motor MTU 20V4000C23, equipo VQT-130 (Toquepala)
3. `Modulo IT.html` — Prototipo funcional "Sistema de Mantenimientos v6.0" (single-file, localStorage, export PDF/Word)

**Alcance acordado:** motor multi-formulario desde el inicio (SER-FOR-002 como primera plantilla de un catálogo), con análisis funcional + modelo de datos, e incluyendo el módulo de mediciones dimensionales con tolerancias.

---

## 1. Resumen ejecutivo

Los tres archivos describen el mismo problema desde tres ángulos: el DOCX es el **output** que hoy se produce a mano, el HTML es un **primer intento de digitalizar** ese output, y la diferencia entre ambos informes DOCX revela que **no existe "un" formulario: existe una plantilla con secciones variables**.

Cinco conclusiones que condicionan todo el diseño:

| #   | Hallazgo                                                                                                                                                                         | Consecuencia de diseño                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Los dos informes comparten cabecera y cierre idénticos, pero el cuerpo difiere en ~40% de sus secciones (uno tiene turbos, el otro tiene seguidores, varillas, balancines y CAC) | El cuerpo debe ser una **secuencia ordenable de bloques**, no un formulario fijo                                                 |
| 2   | Las tablas de medición cambian de dimensión según el motor: 16V → 9 apoyos de bancada / 8 cilindros por banco; 20V → 11 apoyos / 10 cilindros por banco                          | El **número de cilindros y apoyos debe derivarse del modelo de motor** (maestro), y generar la grilla de captura automáticamente |
| 3   | Los valores nominales y tolerancias también dependen del modelo: encaje inferior 189.000 mm (16V4000C21) vs 193.000 mm (20V4000C23); máximos +0.15 / +0.08 mm                    | Se necesita un maestro de **especificaciones técnicas por modelo de motor**, no valores escritos a mano en el informe            |
| 4   | Datos maestros escritos libremente producen inconsistencias reales: `KOMATZU` vs `KOMATSU`, `TOQUEPALA` vs `SPCC. TOQUEPALA`                                                     | Todo dato repetible debe venir de un **CRUD maestro con autocompletado**, no de un `<input type=text>`                           |
| 5   | El prototipo HTML tiene secciones "Parámetros ECU" (rpm, kW, aislamiento de generador, frecuencia) que **no aplican** a una evaluación de motor de camión minero                 | Las secciones deben ser **condicionales por tipo de servicio / tipo de equipo**                                                  |

**Recomendación central:** construir un **motor de plantillas de informe** (template engine) donde SER-FOR-002 es la primera plantilla publicada. El técnico no "llena un formulario"; instancia una plantilla y arma un informe con bloques tipados. Esto resuelve simultáneamente el crecimiento del sistema de calidad (SER-FOR-003, 004…) y la variabilidad entre tipos de servicio.

---

## 2. Anatomía de los informes actuales

### 2.1 Estructura común (invariante)

Ambos DOCX siguen exactamente la misma columna vertebral:

```
[Cabecera corporativa: logo | "INFORME TÉCNICO" | Código SER-FOR-002, Versión 01, F. Emisión 13/05/2021]

I.    DATOS GENERALES              → tabla 2x4 clave/valor
II.   DATOS DEL EQUIPO / MOTOR     → tabla en 2 sub-bloques (EQUIPO / MOTOR) + garantía
III.  ANTECEDENTES                 → párrafo(s) libres
IV.   TRABAJOS REALIZADOS          → secuencia cronológica: fecha → hallazgo → foto(s) → tabla(s)
V.    COMPONENTES PARA TRABAJOS TERCERIZADOS   (solo doc 2)
VI.   CONCLUSIONES                 → lista de bullets
VII.  RECOMENDACIÓN                → lista de bullets
[Firmas: Realizado por / Revisado por — imágenes de firma]
```

### 2.2 Campos de cabecera (I y II) — comparativa literal

| Campo                     | OT746 (doc 1)                     | OT898 (doc 2)                     | Observación para el diseño                                                                                     |
| ------------------------- | --------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| N° de Informe             | `ITS-T-E-25-003-746`              | `ITS-T-E-26-003-0898`             | Código compuesto → **generar automáticamente**                                                                 |
| Ubicación / Locación      | TALLER - LIMA                     | TALLER - LIMA                     | Maestro de sedes/locaciones                                                                                    |
| Motivo                    | EVALUACIÓN DE MOTOR W6            | QL4 / W6-1                        | Maestro de motivos + tipo de intervención                                                                      |
| Cliente                   | SPCC. TOQUEPALA                   | TOQUEPALA                         | **Mismo cliente, dos escrituras** → maestro obligatorio                                                        |
| N° O/T                    | LIM-TAL-000746                    | LIM-TAL-000898                    | Prefijo `LIM-TAL` = sede + área. El HTML usa `LIM-SCA` (servicio campo) → **maestro de series de correlativo** |
| Fecha                     | 18/07/2025                        | 22/06/2026                        | Fecha de emisión, distinta de las fechas de trabajo                                                            |
| Elaborado por / Cargo     | REYNALDO CACERES / TÉCNICO SENIOR | JOSÉ LUIS ESTRELLA / SUPERVISOR C | Maestro de personal (cargo se autocompleta)                                                                    |
| Para / Cargo              | KEITH BECERRA S. / JEFE TALLER    | KEITH BECERRA / JEFE DE TALLER    | Mismo destinatario, dos escrituras y dos cargos                                                                |
| Equipo                    | VQT-33                            | VQT-130                           | Maestro de equipos (flota del cliente)                                                                         |
| Marca / Modelo equipo     | KOMATSU / _(vacío)_               | KOMATZU / 930E4-SE                | **Typo real** + campo vacío                                                                                    |
| Marca / Modelo motor      | MTU / 16V4000C21                  | MTU / 20V4000C23                  | Maestro de modelos de motor                                                                                    |
| N° de Serie               | 5272012973                        | 5282011236                        | **Clave natural del motor** → historial por serie                                                              |
| Potencia                  | _(vacío)_                         | 3400 HP / 2500 KW @ 1800 rpm      | Debe venir del modelo, no tipearse                                                                             |
| Horas totales / parciales | 18, 760 / 18, 760                 | 17694 / 17694                     | Formato inconsistente → campo numérico                                                                         |
| Último mantenimiento      | W6                                | `---`                             | Debería ser referencia a un informe anterior                                                                   |
| Tipo de reparación        | W6-1                              | QL4                               | Maestro de tipos de intervención MTU                                                                           |
| Garantía                  | No ☒                              | No ☒                              | Booleano + fechas inicio/fin                                                                                   |

### 2.3 Cuerpo — bloques de trabajo observados

Cada bloque tiene la misma anatomía: **título en mayúsculas → 1..n hallazgos en texto → 0..n fotos con pie de figura numerado (`Fig.01`, `Fig.02`…) → 0..n tablas de medición**.

| Bloque                                       | Doc 1 (16V, W6-1) |   Doc 2 (20V, QL4)   |
| -------------------------------------------- | :---------------: | :------------------: |
| Recepción del motor (fecha)                  |        ✅         |          ✅          |
| Inventario y desarmado (anexo SER-T-FOR-002) |        ✅         |          ✅          |
| Juego axial del cigüeñal                     |      0.48 mm      |       0.51 mm        |
| Componentes faltantes                        |        ✅         |          ✅          |
| Componentes averiados                        |         —         |          ✅          |
| Desmontaje de turbos                         |         —         |          ✅          |
| Desmontaje de pistones                       |      ✅ (16)      |       ✅ (20)        |
| Desmontaje de bielas y metales               |      ✅ (16)      |       ✅ (20)        |
| Desmontaje de cilindros / camisas            |        ✅         |          ✅          |
| Housing delantero inferior (piñones A/B)     |        ✅         |          ✅          |
| Housing posterior                            |         —         |          ✅          |
| Cigüeñal y metales de bancada                |        ✅         |          ✅          |
| Eje de levas (axial / contragolpe)           |        ✅         |          ✅          |
| Bloque de motor (NDT, encajes, túnel)        |        ✅         |          ✅          |
| Desmontaje de seguidores                     |        ✅         |          —           |
| Varillas de seguidor                         |        ✅         |          —           |
| Balancines y reguladores                     |        ✅         |          —           |
| Prueba hidrostática CAC                      |        ✅         |          —           |
| Culatas                                      |        ✅         | ✅ (en conclusiones) |
| Componentes tercerizados                     |         —         |          ✅          |

> **Esto es la prueba de que el cuerpo debe ser componible.** Ninguno de los dos informes es "el formulario"; ambos son subconjuntos ordenados de un catálogo de bloques.

### 2.4 Tablas de medición identificadas

| Medición                              | Estructura                  | Dimensión                             | Nominal / tolerancia observada                      |
| ------------------------------------- | --------------------------- | ------------------------------------- | --------------------------------------------------- |
| Juego axial del cigüeñal              | escalar                     | 1                                     | mm                                                  |
| Piñones intermedios                   | matriz 2×2                  | Axial / Contragolpe × Piñón A / B     | doc1: 0.67 / 0.55, 0.25 / 0.30                      |
| Muñón de bancada                      | vector                      | **N apoyos** (9 en 16V, 11 en 20V)    | desviación en mm (−0.01, −0.02)                     |
| Muñón de biela A                      | vector                      | **N cil/banco** (8 en 16V, 10 en 20V) | −0.02                                               |
| Muñón de biela B                      | vector                      | ídem                                  | −0.02                                               |
| Coaxialidad / concentricidad cigüeñal | vector con extremos `APOYO` | N apoyos                              | 0.02–0.11                                           |
| Eje de levas                          | 2 escalares                 | Axial / Contragolpe                   | 0.09 / 0.29 mm y 0.16 / 0.25 mm                     |
| Encaje de camisa superior             | matriz 2×N por banco        | (L, T) × cilindros × bancos A/B       | ⌀196.000 mm, máx **+0.15**                          |
| Encaje de camisa inferior             | matriz 2×N por banco        | ídem                                  | ⌀**189.000** (16V) vs ⌀**193.000** (20V), máx +0.08 |
| Túnel de bancada                      | matriz 4×N                  | a, b1, b2, Ovalidad × apoyos          | ⌀171.000, dif. 0 / +0.025                           |

**Ovalidad es un valor calculado** (b − a), no capturado: la plataforma debe calcularlo, no pedirlo.

### 2.5 Cierre

- **Conclusiones**: lista de bullets. Patrón recurrente `<componente> <estado>. (<acción>)` — ej. _"El cigüeñal se encuentra operativo. (Pulir cigüeñal)."_ Esto sugiere que las conclusiones podrían **auto-proponerse** a partir del veredicto de cada bloque.
- **Recomendación**: lista de bullets, con 2–3 frases que se repiten literalmente entre informes → **biblioteca de frases reutilizables**.
- **Firmas**: dos imágenes (Realizado por / Revisado por) → flujo de aprobación real.

---

## 3. Diagnóstico del prototipo `Modulo IT.html`

### 3.1 Lo que ya está bien resuelto (conservar)

- **Navegación y layout**: sidebar con Dashboard / Equipos / Nueva OT / Historial / Alertas / Técnicos. La estructura de módulos es correcta.
- **Trabajos como lista ordenable** (`WORK_TASKS` con `moveWorkTask` subir/bajar, título + descripción + imágenes) — esta es la mejor decisión del prototipo y coincide exactamente con lo que exige el DOCX.
- **Fotos con pie de foto** (máx. 6 por trabajo, caption 500 caracteres) y renderizado en pares en el PDF, replicando el layout `Fig.0X | Fig.0Y` del Word.
- **Tablas dinámicas** de repuestos (descripción, N/P, cantidad) e instrumentos (equipo, código, marca, serie).
- **Doble exportación** PDF (jsPDF + autoTable, con cabecera SER-FOR-002 y justificado de texto) y Word (.doc vía HTML).
- **Estado borrador / cerrado** en el historial.

### 3.2 Brechas críticas

| Brecha                                                                | Impacto                                                             | Prioridad     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| `localStorage` como persistencia + `FIXED_HIST` hardcodeado           | No hay multiusuario, ni respaldo, ni historial real por equipo      | 🔴 Bloqueante |
| Módulos Equipos / Técnicos / Alertas vacíos ("pendiente de conectar") | Todo se retipea en cada informe                                     | 🔴 Bloqueante |
| **Ningún** campo maestro: todo es texto libre                         | Genera los typos ya observados (KOMATZU) e impide reportería        | 🔴 Bloqueante |
| **No existe módulo de mediciones**                                    | La parte más valiosa y más propensa a error del informe queda fuera | 🔴 Bloqueante |
| Secciones fijas y no condicionales (ECU siempre visible)              | Formulario largo e irrelevante para el 60% de los casos             | 🟠 Alta       |
| Imágenes en base64 dentro del registro                                | Un informe con 40 fotos = decenas de MB; insostenible               | 🟠 Alta       |
| Sin numeración automática de figuras                                  | El técnico escribe "Fig.01" a mano y se desordena al reordenar      | 🟠 Alta       |
| Sin flujo de revisión/aprobación ni firmas                            | El DOCX real tiene "Revisado por"                                   | 🟠 Alta       |
| Export Word es HTML renombrado a `.doc`                               | Se rompe al editar; no respeta plantilla corporativa                | 🟡 Media      |
| Sin correlativo automático de N° informe / OT                         | Riesgo de duplicados                                                | 🟡 Media      |
| Sin trazabilidad ni auditoría                                         | Requisito típico ISO para formatos controlados                      | 🟡 Media      |

---

## 4. Arquitectura propuesta del formulario

### 4.1 Modelo conceptual en 3 capas

```
PLANTILLA (Template)          ← lo define Calidad/Admin, versionado
   └── SECCIÓN (Section)      ← I, II, III… con visibilidad condicional
         └── BLOQUE (Block)   ← unidad tipada de captura
               └── CAMPO / GRILLA / MEDIA
                          ↓ instanciación
INFORME (Report)              ← lo llena el técnico
   └── snapshot de la plantilla + valores + evidencia
                          ↓ render
DOCUMENTO (PDF / DOCX)        ← salida controlada por un layout renderer
```

Regla de oro: **un informe emitido guarda el snapshot de la versión de plantilla con la que se creó**. Si Calidad publica SER-FOR-002 v02, los informes v01 siguen renderizando idénticos.

### 4.2 Catálogo de tipos de bloque

Este es el corazón del sistema. Cada bloque es un componente reusable con su propio editor y su propio renderer a PDF/DOCX.

| Tipo de bloque     | Uso en los informes analizados             | Configuración                                            |
| ------------------ | ------------------------------------------ | -------------------------------------------------------- |
| `header_meta`      | I. Datos generales                         | campos mapeados a maestros                               |
| `equipment_meta`   | II. Datos del equipo/motor                 | autocompleta desde maestro Equipo → Motor                |
| `rich_text`        | Antecedentes                               | editor con viñetas, negrita                              |
| `bullet_list`      | Conclusiones, Recomendaciones              | + biblioteca de frases sugeridas                         |
| `work_task`        | Cada "DESMONTAJE DE …"                     | fecha, título, descripción, veredicto, fotos, mediciones |
| `photo_grid`       | Registro fotográfico                       | n columnas, caption obligatorio, numeración auto         |
| `measurement_grid` | Todas las tablas de medición               | **plantilla de medición** + tolerancias (§5)             |
| `key_value_table`  | Piñones, eje de levas                      | filas/columnas fijas                                     |
| `items_table`      | Repuestos, instrumentos, tercerizados      | filas desde maestro con autocompletado                   |
| `checklist`        | Inventario de desarmado (SER-T-FOR-002)    | ítems desde maestro, estado OK/Falta/Averiado            |
| `parameters_panel` | Parámetros ECU (grupos electrógenos)       | set de parámetros por tipo de equipo                     |
| `signature_block`  | Realizado por / Revisado por               | firma digital o imagen, con fecha y usuario              |
| `attachment`       | Anexos (SER-T-FOR-002, hoja de mediciones) | archivo o referencia a otro informe                      |

### 4.3 Secciones condicionales

La visibilidad se resuelve con reglas declarativas sobre el contexto del informe:

```
mostrar sección "Parámetros ECU"        si equipo.categoria == "Grupo electrógeno"
mostrar bloque  "Prueba hidrostática CAC" si motor.tiene_cac == true
mostrar bloque  "Desmontaje de turbos"   si intervencion.tipo in ["QL4","Overhaul"]
mostrar sección "Componentes tercerizados" si existen items tercerizados
```

### 4.4 Wizard de captura (flujo del técnico)

```
Paso 0  Seleccionar plantilla        → SER-FOR-002 Evaluación de motor
Paso 1  Identificación               → Cliente ▸ Sede ▸ Equipo ▸ Motor (autocompletado en cascada)
        · N° informe y N° OT se generan solos
        · Al elegir el motor, el sistema ya sabe: 20 cilindros, 11 apoyos, nominales y tolerancias
Paso 2  Contexto                     → Motivo, tipo de intervención, horas, garantía, antecedentes
Paso 3  Trabajos (el 80% del tiempo) → agregar bloques desde el catálogo, arrastrar para ordenar
        · fotos por bloque, caption obligatorio, numeración Fig.NN automática
        · mediciones con validación en vivo (verde/ámbar/rojo)
Paso 4  Repuestos, instrumentos y tercerizados
Paso 5  Conclusiones y recomendaciones (pre-pobladas desde veredictos + biblioteca de frases)
Paso 6  Vista previa fiel + enviar a revisión
```

### 4.5 Decisiones de UX que marcan la diferencia

1. **Autoguardado cada 20–30 s** + indicador "Guardado hace X". El técnico trabaja en taller, no puede perder 2 h de captura.
2. **Modo offline / PWA.** Taller y mina tienen conectividad intermitente. Captura local con cola de sincronización.
3. **Captura desde móvil para las fotos**, edición del texto en desktop. Una sola sesión, dos dispositivos (código QR para vincular).
4. **Compresión de imágenes en el cliente** antes de subir (máx. 1600 px, JPEG q80) — los DOCX originales pesan 17 MB por esta razón.
5. **Numeración automática de figuras** que se recalcula al reordenar bloques.
6. **Duplicar informe anterior del mismo motor** como punto de partida (el caso W6 → W6-1 del doc 1 es exactamente esto).
7. **Validación en vivo con semáforo** en mediciones: el valor se pinta rojo si excede tolerancia, con el nominal visible al lado.
8. **Barra de progreso por sección** y bloqueo de emisión con lista de campos faltantes (no un alert genérico).
9. **Vista previa WYSIWYG** idéntica al PDF final, en panel lateral.
10. **Atajos de teclado y navegación por Tab** en las grillas de medición: se capturan 40–80 valores seguidos; el mouse es el enemigo.
11. **Biblioteca de frases** por bloque, buscable, alimentada por lo que más escriben los técnicos.
12. **Comentarios de revisión ancla­dos al bloque**, no un campo global de observaciones.

---

## 5. Módulo de mediciones (el diferenciador)

### 5.1 Problema

Hoy el técnico escribe en Word una tabla de 11 columnas con valores de ±0.01 mm, y **compara mentalmente contra el manual del fabricante**. No hay validación, no hay histórico, no hay tendencia.

### 5.2 Solución: plantillas de medición parametrizadas

Una `MeasurementTemplate` define **qué se mide y cómo**; el número de columnas se resuelve en tiempo de ejecución desde la configuración del motor.

| Plantilla                  | Forma   | Filas                           | Columnas                      | Fuente de la dimensión        |
| -------------------------- | ------- | ------------------------------- | ----------------------------- | ----------------------------- |
| Juego axial cigüeñal       | escalar | 1                               | 1                             | —                             |
| Muñón de bancada           | vector  | 1                               | `motor.apoyos_bancada`        | modelo de motor               |
| Muñón de biela (banco A/B) | vector  | 1                               | `motor.cilindros / 2`         | modelo de motor               |
| Coaxialidad cigüeñal       | vector  | 1                               | `motor.apoyos_bancada`        | extremos marcados APOYO       |
| Encaje de camisa           | matriz  | L, T                            | `motor.cilindros / 2` × banco | 2 tablas (sup/inf) × 2 bancos |
| Túnel de bancada           | matriz  | a, b1, b2, **Ovalidad (calc.)** | `motor.apoyos_bancada`        | modelo de motor               |
| Piñones intermedios        | matriz  | Axial, Contragolpe              | Piñón A, Piñón B              | fija                          |
| Eje de levas               | matriz  | Axial, Contragolpe              | 1                             | fija                          |

### 5.3 Especificaciones y tolerancias

Maestro `EngineSpec` — una fila por (modelo de motor × parámetro medible):

| modelo_motor   | parametro              | nominal | tol_inf | tol_sup | unidad |
| -------------- | ---------------------- | ------- | ------- | ------- | ------ |
| 16V4000C21     | encaje_camisa_superior | 196.000 | 0       | +0.15   | mm     |
| 16V4000C21     | encaje_camisa_inferior | 189.000 | 0       | +0.08   | mm     |
| 20V4000C23     | encaje_camisa_superior | 196.000 | 0       | +0.15   | mm     |
| 20V4000C23     | encaje_camisa_inferior | 193.000 | 0       | +0.08   | mm     |
| 20V4000C23     | camisa_encaje_superior | —       | —       | −0.05   | mm     |
| _(común 4000)_ | taladro_tunel_bancada  | 171.000 | 0       | +0.025  | mm     |
| _(común)_      | juego_axial_ciguenal   | —       | 0.20    | 0.50    | mm     |

> Los rangos de juego axial de cigüeñal deben confirmarse contra el manual MTU: el doc 1 reporta 0.48 mm como aceptable y el doc 2 reporta 0.51 mm sin observación explícita. **Punto a validar con el área técnica antes de codificar la regla.**

### 5.4 Comportamiento

- Semáforo por celda: 🟢 dentro de tolerancia · 🟡 en el 10% superior del rango (alerta preventiva) · 🔴 fuera.
- Campos **calculados** (Ovalidad = b − a) bloqueados para edición.
- **Veredicto automático del bloque** ("Operativo" / "Reutilizable con reparación" / "Cambiar") a partir de las mediciones → alimenta la sección de Conclusiones.
- **Historial por número de serie del motor**: gráfico de evolución del juego axial y desgastes entre intervenciones sucesivas. Este es el activo de datos que hoy se pierde en los .docx.
- Exportación del anexo "hoja de mediciones" como documento independiente.

---

## 6. Maestros y CRUDs

### 6.1 Maestros de negocio

| #   | Maestro                                | Campos clave                                                                                                                   | Justificación en las fuentes                                                                                                       |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Clientes**                           | razón social, nombre corto, RUC, contacto, logo                                                                                | `TOQUEPALA` vs `SPCC. TOQUEPALA`                                                                                                   |
| 2   | **Sedes / Locaciones del cliente**     | cliente, nombre, ciudad, tipo (mina/planta/puerto)                                                                             | `TALLER - LIMA`, `Callao – Lima`                                                                                                   |
| 3   | **Equipos (flota)**                    | código (`VQT-130`), cliente, sede, categoría, marca, modelo, año, N° serie, motor asociado                                     | `VQT-33`, `VQT-130`, `Facility 1220`, `EP. TASA 411`                                                                               |
| 4   | **Marcas de equipo**                   | nombre, país                                                                                                                   | `KOMATSU` / typo `KOMATZU`                                                                                                         |
| 5   | **Modelos de equipo**                  | marca, denominación                                                                                                            | `930E4-SE`                                                                                                                         |
| 6   | **Marcas de motor**                    | nombre                                                                                                                         | `MTU`, `CAT`                                                                                                                       |
| 7   | **Modelos de motor** ⭐                | marca, denominación, **N° cilindros**, **config (V/L)**, **apoyos de bancada**, potencia nominal, rpm, tiene CAC, tiene turbos | 16V4000C21 / 20V4000C23 / 8V4000M60R / 10V1600G80S                                                                                 |
| 8   | **Motores (unidades físicas)** ⭐      | N° serie, modelo, equipo actual, horas totales, estado, historial                                                              | `5272012973`, `5282011236` — clave para trazabilidad                                                                               |
| 9   | **Especificaciones técnicas** ⭐       | modelo de motor, parámetro, nominal, tol. inf/sup, unidad, fuente (manual, versión)                                            | §5.3                                                                                                                               |
| 10  | **Tipos de intervención**              | código, descripción, alcance, plantilla sugerida, periodicidad en horas                                                        | `QL4`, `W6`, `W6-1`, preventivo, correctivo                                                                                        |
| 11  | **Motivos de servicio**                | descripción, tipo asociado                                                                                                     | `EVALUACIÓN DE MOTOR W6`                                                                                                           |
| 12  | **Personal / Técnicos**                | nombre, DNI, cargo, categoría, especialidad, firma, activo                                                                     | `REYNALDO CACERES / TÉCNICO SENIOR`, `JOSÉ LUIS ESTRELLA / SUPERVISOR C`                                                           |
| 13  | **Cargos**                             | denominación, nivel                                                                                                            | `TÉCNICO SENIOR`, `SUPERVISOR C`, `JEFE DE TALLER`                                                                                 |
| 14  | **Áreas / Unidades de negocio**        | código, nombre, prefijo de OT                                                                                                  | `TAL` (taller), `SCA` (servicio campo)                                                                                             |
| 15  | **Repuestos / Part numbers**           | N/P, descripción, marca, aplicación (modelos), unidad                                                                          | `X57518300024`                                                                                                                     |
| 16  | **Componentes de motor** ⭐            | nombre, familia, aplica a modelos, bloque de informe asociado                                                                  | pistones, bielas, metales de biela/bancada, camisas, turbos, housing, eje de levas, seguidores, varillas, balancines, culatas, CAC |
| 17  | **Instrumentos de medición** ⭐        | código interno, equipo, marca, modelo, N° serie, **fecha de calibración**, vencimiento, certificado                            | `MEGDPS01 / FLUKE 1587 FC / 51290323`                                                                                              |
| 18  | **Proveedores / Terceros**             | razón social, servicios que presta                                                                                             | metalizado de carcazas, evaluación de cigüeñal, insertos                                                                           |
| 19  | **Servicios tercerizados**             | descripción, proveedor habitual, unidad                                                                                        | "Metalizado de 02 carcazas de turbo"                                                                                               |
| 20  | **Tipos de prueba / ensayo**           | nombre, método, criterio                                                                                                       | NDT líquidos penetrantes, Magnaflux, hidrostática, rugosidad                                                                       |
| 21  | **Unidades de medida**                 | símbolo, magnitud, factor SI                                                                                                   | mm, °C, psi, bar, HP, kW, rpm, MΩ, l/h                                                                                             |
| 22  | **Estados / Veredictos de componente** | nombre, color, acción sugerida                                                                                                 | Operativo · Reutilizable · Reparar · Cambiar                                                                                       |

### 6.2 Maestros del sistema documental

| #   | Maestro                            | Campos clave                                                                | Justificación                                         |
| --- | ---------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| 23  | **Plantillas de informe** ⭐       | código (`SER-FOR-002`), nombre, versión, fecha emisión, estado, secciones   | Cabecera del DOCX y del PDF                           |
| 24  | **Secciones de plantilla**         | plantilla, orden, título, obligatoria, condición                            | I…IX                                                  |
| 25  | **Catálogo de bloques**            | tipo, nombre, esquema, renderer                                             | §4.2                                                  |
| 26  | **Plantillas de medición**         | nombre, forma, filas, fuente de columnas, unidad                            | §5.2                                                  |
| 27  | **Biblioteca de frases**           | categoría, texto, veces usada, autor                                        | Recomendaciones repetidas literalmente entre informes |
| 28  | **Series de correlativos** ⭐      | tipo doc, patrón (`ITS-{sede}-{tipo}-{aa}-{serie}-{correl}`), contador, año | `ITS-T-E-26-003-0898`, `LIM-TAL-000898`               |
| 29  | **Checklists de desarmado**        | nombre, ítems, aplica a modelos                                             | Anexo SER-T-FOR-002                                   |
| 30  | **Plantillas de layout de salida** | formato (PDF/DOCX), márgenes, cabecera, pie, tipografías                    | Réplica de la cabecera SER-FOR-002 v01                |

### 6.3 Maestros de administración

| #   | Maestro                                   | Campos clave                                             |
| --- | ----------------------------------------- | -------------------------------------------------------- |
| 31  | **Usuarios**                              | email, nombre, técnico asociado, rol, activo, MFA        |
| 32  | **Roles y permisos**                      | nombre, matriz de permisos por módulo/acción             |
| 33  | **Organización / Empresa emisora**        | razón social, RUC, logo, dirección, colores corporativos |
| 34  | **Parámetros del sistema**                | claves de configuración global                           |
| 35  | **Notificaciones / Plantillas de correo** | evento, asunto, cuerpo, destinatarios                    |

### 6.4 Priorización de CRUDs

| Fase                                 | Maestros                                     |
| ------------------------------------ | -------------------------------------------- |
| **MVP** (bloquean el primer informe) | 1, 2, 3, 6, 7, 8, 10, 12, 13, 23, 28, 31, 32 |
| **Fase 2** (calidad del dato)        | 4, 5, 9, 11, 14, 16, 17, 21, 22, 24, 25, 26  |
| **Fase 3** (productividad)           | 15, 18, 19, 20, 27, 29, 30, 33, 34, 35       |

### 6.5 UX de los CRUDs

- **Creación inline desde el formulario.** Si el técnico no encuentra el equipo `VQT-131`, un botón "+ Crear" abre un modal mínimo sin perder el informe. El registro nace en estado _"pendiente de validación"_ y Admin lo completa después. Sin esto, los usuarios vuelven al texto libre.
- **Búsqueda difusa** que tolere `KOMATZU` → sugiera `KOMATSU`.
- **Merge de duplicados** para Admin (fusionar `TOQUEPALA` y `SPCC. TOQUEPALA` reasignando referencias).
- **Importación masiva por Excel** para la carga inicial de flota, repuestos e instrumentos.
- **Soft delete + auditoría** en todos los maestros: nada se borra si tiene informes asociados.
- **Vista de "uso"**: al abrir un equipo, ver sus informes; al abrir un instrumento, ver en qué informes se usó y si estaba calibrado.

---

## 7. Modelo de datos

### 7.1 Entidades y relaciones (resumen)

```
Organizacion 1─n Usuario n─1 Rol
Organizacion 1─n Cliente 1─n Sede
Cliente 1─n Equipo n─1 ModeloEquipo n─1 MarcaEquipo
Equipo 1─n MotorInstalacion n─1 Motor          (histórico de qué motor estuvo en qué equipo)
Motor n─1 ModeloMotor n─1 MarcaMotor
ModeloMotor 1─n EngineSpec                      (nominales y tolerancias)
ModeloMotor 1─n ModeloMotorParametro            (cilindros, apoyos, bancos)

PlantillaInforme 1─n PlantillaVersion 1─n Seccion 1─n BloqueDefinicion
Seccion         n─1 CondicionVisibilidad

Informe n─1 PlantillaVersion
Informe n─1 Equipo, n─1 Motor, n─1 Cliente, n─1 Sede
Informe n─1 TipoIntervencion, n─1 OrdenTrabajo
Informe 1─n InformeParticipante n─1 Tecnico     (elaborado por / revisado por / para)
Informe 1─n BloqueInstancia (orden, tipo, payload JSON)
BloqueInstancia 1─n Foto (url, caption, orden, num_figura, exif)
BloqueInstancia 1─n MedicionSet n─1 PlantillaMedicion
MedicionSet 1─n MedicionValor (fila, columna, valor, calculado, estado_tolerancia)
Informe 1─n RepuestoUtilizado n─1 Repuesto
Informe 1─n InstrumentoUsado n─1 Instrumento
Informe 1─n ServicioTercerizado n─1 Proveedor
Informe 1─n ConclusionItem / RecomendacionItem
Informe 1─n Adjunto
Informe 1─n Firma n─1 Usuario
Informe 1─n EventoAuditoria
Informe 1─n VersionDocumento (pdf_url, docx_url, hash, generado_en)
```

### 7.2 Tablas núcleo (campos principales)

**`informes`**

| Campo                                    | Tipo         | Notas                                                             |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------- |
| id                                       | uuid         |                                                                   |
| numero_informe                           | string único | generado por serie                                                |
| numero_ot                                | string       |                                                                   |
| plantilla_version_id                     | fk           | snapshot                                                          |
| tipo_servicio                            | enum/fk      | preventivo, correctivo, evaluación, emergencia                    |
| tipo_intervencion_id                     | fk           | QL4, W6-1                                                         |
| motivo                                   | text         |                                                                   |
| cliente_id, sede_id, equipo_id, motor_id | fk           |                                                                   |
| fecha_emision, fecha_inicio, fecha_fin   | date         |                                                                   |
| horas_totales, horas_parciales           | int          |                                                                   |
| en_garantia                              | bool         |                                                                   |
| garantia_inicio, garantia_fin            | date         |                                                                   |
| ultimo_mantenimiento_informe_id          | fk self      | reemplaza el texto `W6` / `---`                                   |
| antecedentes                             | text         |                                                                   |
| estado                                   | enum         | borrador · en_revision · observado · aprobado · emitido · anulado |
| creado_por, revisado_por, aprobado_por   | fk usuario   |                                                                   |
| snapshot_json                            | jsonb        | render inmutable al emitir                                        |

**`bloques_instancia`**

| Campo                 | Tipo                                        |
| --------------------- | ------------------------------------------- |
| id, informe_id, orden |                                             |
| tipo_bloque           | enum (§4.2)                                 |
| titulo                | string                                      |
| fecha_trabajo         | date (opcional, para trabajos cronológicos) |
| contenido             | text/jsonb                                  |
| componente_id         | fk (opcional)                               |
| veredicto             | enum (operativo/reparar/cambiar)            |
| accion_recomendada    | text                                        |

**`mediciones_valor`**

| Campo                              | Tipo                                              |
| ---------------------------------- | ------------------------------------------------- |
| id, medicion_set_id                |                                                   |
| etiqueta_fila                      | string (`a`, `b1`, `L`, `T`, `AXIAL`)             |
| etiqueta_columna                   | string (`A1`…`A10`, `1`…`11`)                     |
| valor                              | decimal(8,3)                                      |
| es_calculado                       | bool                                              |
| estado                             | enum (ok / alerta / fuera_tolerancia / no_aplica) |
| nominal_aplicado, tol_inf, tol_sup | decimal (denormalizado al capturar)               |

> Denormalizar la tolerancia en el valor es intencional: si mañana cambia la especificación, los informes ya emitidos deben conservar el criterio con el que se evaluaron.

### 7.3 Almacenamiento de imágenes

- **Nunca base64 en la base de datos.** Object storage (S3 / R2 / Blob) + URL firmada.
- Tres derivados por foto: `thumb` (300 px), `web` (1200 px), `print` (1600 px, ~200 KB).
- Metadatos: EXIF (fecha real de captura, GPS opcional), autor, hash para deduplicar.
- Ahorro estimado: los DOCX fuente pesan 17.8 MB y 2.1 MB; con este esquema, un informe equivalente queda en 2–4 MB de storage y KB en base de datos.

---

## 8. Generación de documentos

| Aspecto                    | Recomendación                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Motor**                  | Renderizado **en servidor** (no jsPDF en navegador): HTML+CSS Paged Media → PDF (Playwright/Chromium o WeasyPrint). Garantiza tipografías, paginación y consistencia. |
| **DOCX**                   | Generar `.docx` real desde plantilla `.dotx` corporativa (docxtemplater / python-docx), no HTML renombrado. Permite que Calidad edite el machote sin tocar código.    |
| **Numeración de figuras**  | Calculada en el render, nunca escrita por el usuario.                                                                                                                 |
| **Paginación inteligente** | Mantener juntos: título de bloque + primer párrafo; fila de fotos + su caption; tabla de medición completa. (El prototipo ya lo intenta con `keepTogether`.)          |
| **Cabecera controlada**    | Código, versión y fecha de emisión leídos del maestro de plantillas — no hardcodeados.                                                                                |
| **Marca de agua**          | "BORRADOR" en diagonal mientras el informe no esté aprobado.                                                                                                          |
| **Inmutabilidad**          | Al emitir, se congela un PDF con hash; reimprimir devuelve exactamente el mismo archivo.                                                                              |
| **QR de verificación**     | En el pie, apuntando a la vista pública del informe. Útil para el cliente.                                                                                            |

---

## 9. Roles y permisos

| Rol                             | Puede                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Técnico**                     | Crear y editar sus informes en borrador, subir fotos, capturar mediciones, enviar a revisión            |
| **Supervisor / Jefe de taller** | Todo lo anterior + revisar, observar, aprobar informes de su área, ver dashboard del área               |
| **Calidad**                     | Gestionar plantillas, secciones, bloques, plantillas de medición, layouts de salida, versionar formatos |
| **Planificador**                | Crear OT, asignar técnicos, ver programación y vencimientos                                             |
| **Administrador**               | Maestros, usuarios, roles, merge de duplicados, auditoría                                               |
| **Cliente (portal, opcional)**  | Ver y descargar únicamente los informes aprobados de sus equipos                                        |

Flujo de estados: `borrador → en_revision → (observado ⟲) → aprobado → emitido` (+ `anulado` con motivo obligatorio).

---

## 10. Módulos de la plataforma

| Módulo                 | Contenido                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard**          | Informes por estado, tiempo promedio de emisión, motores en taller, alertas de tolerancia, instrumentos por vencer calibración |
| **Órdenes de trabajo** | OT como contenedor: puede tener 1..n informes (evaluación → reparación → prueba)                                               |
| **Informes**           | Bandeja por estado, filtros por cliente/equipo/motor/técnico/fecha, búsqueda full-text                                         |
| **Equipos y motores**  | Ficha 360°: historial de intervenciones, horas, mediciones históricas, fotos, documentos                                       |
| **Mediciones**         | Consulta transversal: "todos los juegos axiales de cigüeñal de motores 4000 en 2026"                                           |
| **Repuestos**          | Consumo por informe, por equipo, por periodo; base para cotización                                                             |
| **Instrumentos**       | Control de calibración con alertas de vencimiento                                                                              |
| **Maestros**           | §6                                                                                                                             |
| **Plantillas**         | Editor de plantillas para Calidad                                                                                              |
| **Reportes / BI**      | Componentes más cambiados por modelo, MTBF por motor, técnico vs. tiempo de informe                                            |
| **Auditoría**          | Quién cambió qué y cuándo                                                                                                      |

---

## 11. Roadmap sugerido

| Fase                     | Entregable                                                                                                                                                                                               | Objetivo verificable                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **F1 — Núcleo**          | Auth, maestros MVP (§6.4), motor de plantillas con SER-FOR-002, bloques `header_meta`/`equipment_meta`/`rich_text`/`work_task`/`photo_grid`/`bullet_list`, render PDF servidor, estados borrador→emitido | Reproducir el informe **OT746** completo desde la plataforma y que el PDF sea indistinguible del DOCX |
| **F2 — Mediciones**      | Plantillas de medición, `EngineSpec`, validación por tolerancia, veredictos, anexo hoja de mediciones                                                                                                    | Reproducir **OT898** con sus 8 tablas dimensionales y semáforos correctos                             |
| **F3 — Flujo y calidad** | Revisión/aprobación, firmas, comentarios por bloque, export DOCX real, auditoría, biblioteca de frases                                                                                                   | Un informe completa el ciclo técnico → supervisor → emitido                                           |
| **F4 — Movilidad**       | PWA offline, captura móvil de fotos, sincronización                                                                                                                                                      | Capturar un informe completo sin conexión en taller                                                   |
| **F5 — Inteligencia**    | Ficha 360° del motor, tendencias de desgaste, dashboards, alertas de mantenimiento por horas, portal de cliente                                                                                          | Gráfico de evolución del juego axial por N° de serie                                                  |

---

## 12. Decisiones abiertas para validar con el área técnica

1. **Rangos de tolerancia oficiales** por modelo de motor (manual MTU): juego axial de cigüeñal, muñones, coaxialidad, piñones intermedios. Los informes solo declaran "dentro de especificación" sin citar el rango.
2. **Semántica del signo** en las mediciones de muñones (−0.01, −0.02): ¿desviación respecto al nominal, submedida o clase de rectificado? Determina si se captura el valor absoluto o la desviación.
3. **Convención de codificación** exacta de `ITS-T-E-26-003-0898` y `LIM-TAL-000898` (qué significa cada segmento y quién asigna el correlativo).
4. **Alcance del anexo SER-T-FOR-002** (inventario de desarmado): ¿se digitaliza como checklist dentro del informe o sigue siendo archivo adjunto?
5. **Multi-cliente / multi-empresa**: ¿la plataforma emitirá informes con logo y numeración de más de una razón social?
6. **Firmas**: ¿imagen de firma escaneada, firma dibujada en pantalla, o firma digital con certificado (requisito legal si el informe respalda garantías)?
7. **Integración con ERP** para OT, repuestos y horas — ¿existe un sistema del que deban leerse las OT en lugar de crearlas aquí?
8. **Idioma**: los informes tienen términos mixtos (housing, contragolpe, magnaflux). Definir glosario controlado para la biblioteca de frases.

---

## Anexo A — Mapa de campos: DOCX → prototipo HTML → plataforma propuesta

| Campo DOCX                                     | ID en `Modulo IT.html`                               | Propuesta                                                   |
| ---------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| N° de Informe                                  | `f-ni` (texto libre)                                 | Generado por serie de correlativos (maestro 28)             |
| N° O/T                                         | `f-ot` (texto libre)                                 | FK a Orden de Trabajo                                       |
| Ubicación/Locación                             | `f-ubic` (texto libre)                               | FK Sede (maestro 2)                                         |
| Motivo                                         | _(no existe)_                                        | FK Motivo (maestro 11)                                      |
| Cliente                                        | `f-cliente` (texto libre)                            | FK Cliente (maestro 1)                                      |
| Fecha                                          | `f-fecha`                                            | date                                                        |
| Elaborado por + Cargo                          | `f-tec1`, `f-tec2` (nombre y cargo en un solo campo) | n FK Técnico, cargo autocompletado                          |
| Para + Cargo                                   | `f-para`, `f-cargo`                                  | FK Técnico/Usuario                                          |
| Equipo / Marca / Modelo                        | `f-equipo`, `f-meq`, `f-modeq`                       | FK Equipo → autocompleta marca y modelo                     |
| Motor Marca / Modelo / Serie                   | `f-mmot`, `f-modmot`, `f-serie`                      | FK Motor (por N° serie) → autocompleta el resto             |
| Potencia                                       | `f-pot` (texto libre)                                | Derivado de ModeloMotor                                     |
| Horas totales / parciales                      | `f-horas`, `f-hpar` (texto)                          | int, con validación contra lectura anterior                 |
| Último mantenimiento                           | `f-ultmant` (date)                                   | FK a informe anterior                                       |
| Tipo de reparación                             | `f-tiporep` (3 opciones)                             | FK TipoIntervencion (QL4, W6, W6-1…)                        |
| Garantía Sí/No + fechas                        | `f-gar-*`                                            | bool + dates                                                |
| Antecedentes                                   | `f-ant`                                              | bloque `rich_text`                                          |
| Parámetros ECU                                 | `f-rpm`…`f-i2`                                       | bloque `parameters_panel` **condicional**                   |
| Trabajos realizados                            | `WORK_TASKS[]`                                       | bloques `work_task` ordenables + `measurement_grid`         |
| _(tablas de medición)_                         | **ausente**                                          | **módulo de mediciones (§5)**                               |
| Componentes tercerizados                       | _(ausente)_                                          | bloque `items_table` + maestro 19                           |
| Repuestos                                      | `rep-tbody`                                          | `items_table` + FK Repuesto (maestro 15)                    |
| Registro fotográfico                           | `IMGS[]` base64                                      | `photo_grid` + object storage                               |
| Instrumentos                                   | `inst-tbody`                                         | `items_table` + FK Instrumento con calibración (maestro 17) |
| Observaciones / Recomendaciones / Conclusiones | `f-obs`, `f-rec`, `f-conc`                           | bloques `bullet_list` + biblioteca de frases                |
| Firmas Realizado/Revisado por                  | _(ausente)_                                          | bloque `signature_block` + flujo de aprobación              |

---

_Documento de análisis — generado a partir de los tres archivos fuente proporcionados._
