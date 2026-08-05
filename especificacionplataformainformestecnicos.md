# Plataforma Corporativa de Informes Técnicos — Especificación completa

**Cliente:** Detroit Power System Perú
**Producto:** Módulo de Informes Técnicos (MIT) — evolución a plataforma corporativa
**Versión del documento:** 1.0
**Fecha:** agosto 2026

**Fuentes que consolida este documento:**

| Fuente | Aporta |
|---|---|
| `Presentación de módulo IT 2.pptx` (10 slides) | Visión, estado actual, arquitectura propuesta, roles, requerimientos de TI, beneficios |
| `01. SERFOR002 EVALUACIÓN OT746.docx` | Estructura real del informe — evaluación W6-1, motor MTU 16V4000C21 |
| `2. SERFOR002 EVALUACIÓN MOTOR ITSTE26898.docx` | Estructura real del informe — evaluación QL4, motor MTU 20V4000C23 |
| `Modulo IT.html` (prototipo v6.0) | Formulario implementado, exportación PDF/Word, historial |
| Análisis previo (`analisis-plataforma-informes-tecnicos.md`) | Motor de formularios, 35 maestros, módulo de mediciones |

**Stack definido por el cliente:** Angular 22 · NestJS 11 · MongoDB Atlas · AWS S3 · GitHub Actions · Coolify (self-hosted PaaS para frontend y backend).

---

# PARTE I — CONTEXTO Y VISIÓN

## 1. El problema de negocio

Detroit Power System Perú presta servicios de mantenimiento, evaluación y reparación de motores industriales (MTU, Caterpillar) y grupos electrógenos para clientes como SPCC Toquepala, TASA y Lima Airports Partners. Cada servicio genera un **informe técnico bajo el formato controlado SER-FOR-002 (Versión 01, F. Emisión 13/05/2021)**.

Hoy ese informe se produce en Word: 20–40 páginas, decenas de fotografías, tablas de medición dimensional con tolerancias de centésimas de milímetro. Un solo archivo pesa hasta 17.8 MB. La consecuencia, en palabras del propio deck (slide 2, Fase 1):

> Manual · Lento · Inconsistente · Alto riesgo de errores

Pero el costo real no es el tiempo de tipeo. Es que **toda la información técnica generada en campo muere dentro de un .docx**. No hay forma de responder preguntas como: *¿cómo ha evolucionado el juego axial del cigüeñal del motor 5272012973 en sus últimas tres intervenciones?* o *¿qué componente cambiamos más en motores 4000 durante 2026?*

## 2. La visión (slide 10)

> **"El objetivo no es únicamente generar informes más rápido. El objetivo es transformar la información técnica en un activo estratégico."**

Secuencia declarada en el deck:

```
PROCESO MANUAL → DIGITALIZACIÓN → ESTANDARIZACIÓN → TRAZABILIDAD → GESTIÓN DEL CONOCIMIENTO → TRANSFORMACIÓN DIGITAL
```

Los cuatro verbos rectores de la portada (slide 1): **ESTANDARIZAR** procesos y formatos · **AUTOMATIZAR** tareas repetitivas · **OPTIMIZAR** tiempo, calidad y productividad · **MEJORAR** consistencia y valor de la información.

## 3. Dónde está el proyecto hoy

El deck (slide 2) describe cuatro etapas de evolución. **Tres ya ocurrieron.**

| Etapa | Estado | Contenido |
|---|---|---|
| **Fase 1 — Proceso tradicional** | ✅ Superada | Word manual |
| **Fase 2 — Prototipo HTML** | ✅ Superada | Automatización básica, generación de PDF, validación de flujo con usuarios (`Modulo IT.html`) |
| **Fase 3 — Implementación PWA** | ✅ **Operativa y validada con informes técnicos reales** (slide 3) | App web progresiva, instalable, trabajo offline, generación PDF/Word, códigos ITS automáticos, almacenamiento local |
| **Fase 4 — Plataforma corporativa** | 🎯 **Objeto de este documento** | Centralización, seguridad, trazabilidad, integración corporativa |

> **Implicancia clave para el plan:** esto **no es un proyecto greenfield**. Existe una PWA funcional, validada por técnicos con informes reales, y un formato de salida ya aceptado. El riesgo dominante no es técnico sino de **continuidad operativa**: la plataforma nueva no puede ser peor que lo que los técnicos ya usan, ni puede obligarlos a un corte abrupto. Esto condiciona la fase F1 del plan (§23) y la estrategia de migración (§28).

## 4. Qué ya funciona y debe preservarse (slide 3 y 6)

| Capacidad | Detalle |
|---|---|
| **Datos generales** | Cliente, equipo, motor, servicio, OT |
| **Gestión de trabajos** | Creación ilimitada de actividades, descripción técnica detallada, incorporación de fotografías, organización estructurada de evidencias |
| **Gestión de fotografías** | Captura desde dispositivo, galería organizada, asociación a actividades, evidencias claras y validadas |
| **Documentación** | Generación automática de PDF y Word, formato corporativo estandarizado |
| **Almacenamiento** | Borradores automáticos, historial de informes, recuperación de información |
| **Movilidad** | Android, iOS, computadoras, interfaz responsive, online y offline |
| **Códigos automáticos** | Generación automática de códigos ITS, estandarización corporativa |
| **Offline** | Trabajo sin conexión, caché de datos, sincronización automática al recuperar conexión |

## 5. Las limitaciones que justifican la Fase 4 (slide 4)

Arquitectura actual: `TÉCNICO → APLICACIÓN PWA → PROCESAMIENTO LOCAL → GENERACIÓN PDF/WORD → ALMACENAMIENTO LOCAL`

| Ventajas actuales | Limitaciones actuales |
|---|---|
| Rapidez | **Información distribuida** (cada técnico tiene su copia) |
| Independencia de conexión | **No existe repositorio central** |
| Facilidad de implementación | **No existe trazabilidad corporativa** |
| | **No existe control de usuarios** |

A esto, el análisis de los informes reales agrega tres limitaciones no listadas en el deck pero igual de determinantes:

1. **Todo es texto libre.** Los informes reales ya muestran el daño: `KOMATZU` vs `KOMATSU`, `TOQUEPALA` vs `SPCC. TOQUEPALA`, horas como `18, 760`. Sin maestros no hay analítica posible.
2. **Las mediciones dimensionales no están digitalizadas.** Es la información más valiosa del informe (y la más propensa a error humano) y hoy se captura como texto en una tabla de Word, sin validación contra tolerancias.
3. **El formulario es fijo, pero los informes no lo son.** El OT746 y el OT898 comparten cabecera y cierre pero difieren en ~40% del cuerpo. El OT746 tiene seguidores, varillas, balancines y prueba hidrostática de CAC; el OT898 tiene turbos, housing posterior y trabajos tercerizados.

## 6. Arquitectura objetivo (slide 5)

```
1. TÉCNICO                      Ingreso y gestión de informes
        ↓
2. APLICACIÓN WEB PROGRESIVA    Interfaz responsive y multiplataforma
        ↓
3. API BACKEND CORPORATIVA      Servicios, reglas de negocio y validaciones
        ↓
4. BASE DE DATOS CENTRALIZADA   Almacenamiento estructurado y seguro
        ↓
5. REPOSITORIO DOCUMENTAL       Almacenamiento de PDF, Word y fotografías
        ↓
6. DASHBOARD DE GESTIÓN         Indicadores, reportes y trazabilidad
        ↓
7. GERENCIA / SUPERVISIÓN       Toma de decisiones basada en información
```

Beneficios declarados: información centralizada · mayor seguridad · escalabilidad · integración futura · disponibilidad corporativa.

## 7. Requerimientos para TI (slide 7) — traducidos a decisiones

El deck plantea cinco frentes como preguntas abiertas a TI. Con el stack ya definido, quedan así:

| Frente | Planteado en el deck | Resolución con el stack elegido |
|---|---|---|
| **Infraestructura** | Servidor de aplicaciones, servidor de BD, dominio corporativo, certificados SSL, políticas de respaldo | Coolify (VPS propio) para frontend y backend · MongoDB Atlas (gestionado) · dominio corporativo + Let's Encrypt automático vía Coolify · backups de Atlas + versionado S3 |
| **Almacenamiento** | Ubicación de PDF, ubicación de fotografías, capacidad inicial, estrategia de crecimiento | AWS S3 con prefijos por tenant/año/informe · ciclo de vida a S3 Infrequent Access a los 12 meses · dimensionamiento en §21.4 |
| **Seguridad** | Login corporativo, gestión de contraseñas, control de sesiones, roles y permisos, auditoría de accesos | JWT + refresh rotativo · Argon2id · sesiones revocables · RBAC de 4 roles (slide 8) · colección `audit_logs` inmutable · SSO corporativo previsto en F6 |
| **Respaldo** | Backups automáticos, recuperación ante desastres, versionamiento documental | Atlas continuous backup (PITR) · S3 versioning + réplica cross-region · versionado de documentos generados con hash |
| **Integraciones** | OT, SharePoint, Power BI, otros sistemas corporativos | API REST documentada (OpenAPI) · webhooks · conector SharePoint para publicar PDF aprobados · vistas de solo lectura / export para Power BI (F6) |

## 8. Roles definidos por el negocio (slide 8)

| Rol | Permisos declarados en el deck |
|---|---|
| **Administrador** | Gestión de usuarios · Configuración del sistema · Acceso total a la información · Reportes y auditoría |
| **Técnico** | Crear y editar trabajos · Capturar fotografías y evidencias · Generar informes · Ver información asignada |
| **Supervisor** | Revisar trabajos · Validar información y evidencias · Aprobar informes · Reportes y seguimiento |
| **Visor** | Consultar información · Ver informes aprobados · **Sin permisos de edición** |

Controles transversales exigidos: autenticación segura · sesiones controladas · registro de actividades · políticas de contraseñas.

**Objetivo declarado:** *"Garantizar que cada usuario tenga el acceso correcto, en el momento adecuado, con total seguridad y trazabilidad."*

> Estos 4 roles son el **núcleo obligatorio**. El sistema debe soportar RBAC extensible porque el análisis del proceso real revela dos funciones adicionales que hoy hace alguien informalmente: **Calidad** (dueño del formato SER-FOR-002 y sus versiones) y **Planificación** (crea las OT y asigna técnicos). Se implementan como roles opcionales desde F3.

## 9. Beneficios comprometidos (slide 9)

Centralización de información · Mayor seguridad y control · Mejor toma de decisiones · Mayor eficiencia operativa · Acceso desde cualquier lugar · Estandarización documental · Reducción de costos · Colaboración y transparencia · Cumplimiento y auditoría.

Estos beneficios se traducen en los **KPIs medibles** de §25.

---

# PARTE II — ESPECIFICACIÓN FUNCIONAL

## 10. Alcance del producto

### 10.1 Dentro de alcance

| # | Módulo | Descripción |
|---|---|---|
| M1 | **Autenticación y usuarios** | Login, sesiones, roles, permisos, política de contraseñas, auditoría |
| M2 | **Maestros** | 35 catálogos (§13) con CRUD, búsqueda, importación y merge de duplicados |
| M3 | **Órdenes de trabajo** | Contenedor de servicio; una OT puede tener 1..n informes |
| M4 | **Motor de plantillas** | Plantillas versionadas de informe compuestas por secciones y bloques tipados |
| M5 | **Editor de informes** | Wizard de captura con bloques ordenables, fotos y mediciones |
| M6 | **Mediciones dimensionales** | Grillas parametrizadas por modelo de motor con validación por tolerancia |
| M7 | **Evidencia fotográfica** | Captura, compresión, caption, numeración automática de figuras, almacenamiento S3 |
| M8 | **Flujo de aprobación** | Borrador → revisión → observado → aprobado → emitido → anulado, con firmas |
| M9 | **Generación documental** | PDF y DOCX corporativos, inmutables, con hash y QR de verificación |
| M10 | **Repositorio documental** | Búsqueda, filtros, descarga, versiones |
| M11 | **Ficha 360° de equipo/motor** | Historial de intervenciones, horas, mediciones, fotos |
| M12 | **Dashboard y analítica** | Indicadores operativos y tendencias de desgaste |
| M13 | **PWA offline** | Captura sin conexión y sincronización |
| M14 | **Integraciones** | API pública, SharePoint, Power BI, sistema de OT |
| M15 | **Administración** | Configuración, series de correlativos, plantillas de salida, notificaciones |

### 10.2 Fuera de alcance (declarado explícitamente)

- Gestión de inventario/almacén y valorización de repuestos (solo se registra consumo).
- Cotización y facturación.
- Planificación de mano de obra y costeo de horas-hombre.
- Telemetría en tiempo real desde ECU de motores.
- App nativa iOS/Android (se usa PWA instalable, como ya funciona hoy).

## 11. Motor de plantillas y bloques

### 11.1 Modelo conceptual

```
PLANTILLA (SER-FOR-002)
  └── VERSIÓN (v01, v02…)   ← versionada, publicable, inmutable una vez usada
        └── SECCIÓN (I…IX)   ← con regla de visibilidad
              └── BLOQUE     ← unidad tipada de captura y de render
                                ↓ instanciación
INFORME  = snapshot de la versión + valores + evidencia
                                ↓ render
DOCUMENTO PDF / DOCX
```

**Regla de inmutabilidad:** al emitir un informe se congela el `templateSnapshot`. Si Calidad publica SER-FOR-002 v02, los informes emitidos con v01 se siguen renderizando idénticos, para siempre. Esto es requisito de un formato controlado.

### 11.2 Catálogo de tipos de bloque

| Tipo | Uso en los informes reales | Configuración |
|---|---|---|
| `header_meta` | I. Datos generales | Campos mapeados a maestros |
| `equipment_meta` | II. Datos del equipo / motor | Autocompleta en cascada Cliente→Equipo→Motor |
| `rich_text` | Antecedentes | Editor con viñetas y negrita |
| `bullet_list` | Conclusiones, Recomendaciones | Biblioteca de frases sugeridas |
| `work_task` | Cada bloque "DESMONTAJE DE …" | Fecha, título, descripción, veredicto, fotos, mediciones |
| `photo_grid` | Registro fotográfico | N columnas, caption obligatorio, numeración automática |
| `measurement_grid` | Todas las tablas dimensionales | Plantilla de medición + tolerancias (§12) |
| `key_value_table` | Piñones intermedios, eje de levas | Filas/columnas fijas |
| `items_table` | Repuestos, instrumentos, tercerizados | Filas con autocompletado desde maestro |
| `checklist` | Inventario de desarmado (SER-T-FOR-002) | Ítems desde maestro, estado OK/Falta/Averiado |
| `parameters_panel` | Parámetros ECU (grupos electrógenos) | Set de parámetros por tipo de equipo |
| `signature_block` | Realizado por / Revisado por | Firma con usuario, fecha y hash |
| `attachment` | Anexos y hojas de medición | Archivo S3 o referencia a otro informe |

### 11.3 Visibilidad condicional

Reglas declarativas evaluadas contra el contexto del informe:

```json
{ "seccion": "Parámetros ECU",           "si": "equipo.categoria == 'grupo_electrogeno'" }
{ "bloque":  "Prueba hidrostática CAC",  "si": "motor.tieneCac == true" }
{ "bloque":  "Desmontaje de turbos",     "si": "intervencion.codigo in ['QL4','OVERHAUL']" }
{ "seccion": "Componentes tercerizados", "si": "informe.tercerizados.length > 0" }
```

Esto resuelve el problema detectado en el prototipo: el panel "Parámetros ECU" (rpm, kW, aislamiento de generador, frecuencia) se muestra siempre, aunque es irrelevante para la evaluación de un motor de camión minero.

### 11.4 Plantillas del catálogo inicial

| Código | Nombre | Prioridad |
|---|---|---|
| `SER-FOR-002` | Informe técnico general | **F1** — reproduce OT746 y OT898 |
| `SER-T-FOR-002` | Inventario y desarmado de motor | F2 (como checklist anexo) |
| `SER-FOR-002-GE` | Mantenimiento preventivo de grupo electrógeno | F3 (usa `parameters_panel`) |
| Nuevos | Definidos por Calidad sin intervención de desarrollo | F3 en adelante |

## 12. Módulo de mediciones dimensionales

### 12.1 Por qué es el diferenciador

Es la única funcionalidad de la plataforma que **no existe ni en el Word ni en la PWA actual**, y es la que convierte los informes en datos. Hoy el técnico escribe once valores de ±0.01 mm en una tabla de Word y compara mentalmente contra el manual del fabricante.

### 12.2 Hallazgo estructural: la grilla depende del motor

| Parámetro | MTU 16V4000C21 (OT746) | MTU 20V4000C23 (OT898) |
|---|---|---|
| Cilindros | 16 | 20 |
| Cilindros por banco (A/B) | 8 | 10 |
| Apoyos de bancada | 9 | 11 |
| ⌀ nominal encaje superior | 196.000 mm | 196.000 mm |
| ⌀ nominal encaje inferior | **189.000 mm** | **193.000 mm** |
| Máximo encaje superior | +0.15 mm | +0.15 mm |
| Máximo encaje inferior | +0.08 mm | +0.08 mm |
| ⌀ túnel de bancada | — | 171.000 mm (0 / +0.025) |

**Por lo tanto: el número de columnas de cada grilla y sus tolerancias se derivan del modelo de motor, no se escriben a mano.** Al seleccionar el motor por su número de serie, la plataforma ya sabe que debe pedir 11 apoyos y validar contra 193.000 mm.

### 12.3 Plantillas de medición

| Plantilla | Forma | Filas | Columnas | Origen de la dimensión |
|---|---|---|---|---|
| Juego axial del cigüeñal | escalar | 1 | 1 | — |
| Muñón de bancada | vector | 1 | `motor.apoyosBancada` | modelo |
| Muñón de biela banco A | vector | 1 | `motor.cilindros / 2` | modelo |
| Muñón de biela banco B | vector | 1 | `motor.cilindros / 2` | modelo |
| Coaxialidad del cigüeñal | vector | 1 | `motor.apoyosBancada` (extremos = `APOYO`) | modelo |
| Encaje de camisa superior | matriz | `L`, `T` | cilindros/banco × banco A y B | modelo |
| Encaje de camisa inferior | matriz | `L`, `T` | cilindros/banco × banco A y B | modelo |
| Túnel de bancada | matriz | `a`, `b1`, `b2`, **`Ovalidad` (calc.)** | `motor.apoyosBancada` | modelo |
| Piñones intermedios | matriz | Axial, Contragolpe | Piñón A, Piñón B | fija |
| Eje de levas | matriz | Axial, Contragolpe | 1 | fija |

### 12.4 Comportamiento requerido

1. **Semáforo por celda en tiempo real:** 🟢 dentro de tolerancia · 🟡 en el 10% superior del rango (alerta preventiva) · 🔴 fuera de tolerancia.
2. **Campos calculados bloqueados:** `Ovalidad = |b − a|` se calcula, nunca se pide.
3. **Denormalización de la tolerancia aplicada:** cada valor guarda el `nominal`, `tolInf` y `tolSup` vigentes al momento de la captura. Si mañana Calidad corrige la especificación, los informes ya emitidos conservan el criterio con el que fueron evaluados.
4. **Veredicto automático del bloque:** a partir de las mediciones se propone `operativo` / `reparar` / `cambiar`, que alimenta la sección de Conclusiones (el patrón textual real es *"El cigüeñal se encuentra operativo. (Pulir cigüeñal)."*).
5. **Captura optimizada para teclado:** se ingresan 40–80 valores seguidos. Navegación por `Tab`/flechas, pegado desde Excel, sin necesidad de mouse.
6. **Serie histórica por número de serie de motor:** el mismo parámetro medido en intervenciones sucesivas alimenta una curva de desgaste. Este es el activo de datos que hoy se pierde.
7. **Exportación del anexo "hoja de mediciones"** como documento independiente.

### 12.5 Especificaciones a cargar (maestro `engineSpecs`)

| modeloMotor | parametro | nominal | tolInf | tolSup | unidad | fuente |
|---|---|---|---|---|---|---|
| 16V4000C21 | `encaje_camisa_superior` | 196.000 | 0 | +0.15 | mm | Informe OT746 |
| 16V4000C21 | `encaje_camisa_inferior` | 189.000 | 0 | +0.08 | mm | Informe OT746 |
| 20V4000C23 | `encaje_camisa_superior` | 196.000 | 0 | +0.15 | mm | Informe OT898 |
| 20V4000C23 | `encaje_camisa_inferior` | 193.000 | 0 | +0.08 | mm | Informe OT898 |
| 20V4000C23 | `camisa_encaje_superior` | — | — | −0.05 | mm | Informe OT898 |
| 20V4000C23 | `taladro_tunel_bancada` | 171.000 | 0 | +0.025 | mm | Informe OT898 |

> ⚠️ **Estos valores provienen de los informes, no del manual MTU.** Antes de F2 deben validarse contra la documentación del fabricante y completarse los rangos faltantes (juego axial de cigüeñal, muñones, coaxialidad, piñones intermedios). Ver §27, decisión abierta D1.

## 13. Maestros y CRUDs

### 13.1 Catálogo completo

**Maestros de negocio**

| # | Colección | Campos clave | Evidencia en las fuentes |
|---|---|---|---|
| 1 | `clients` | razón social, nombre corto, RUC, contacto, logo | `TOQUEPALA` vs `SPCC. TOQUEPALA` |
| 2 | `sites` | cliente, nombre, ciudad, tipo | `TALLER - LIMA`, `Callao – Lima` |
| 3 | `equipments` | código, cliente, sede, categoría, marca, modelo, motor actual | `VQT-33`, `VQT-130`, `Facility 1220`, `EP. TASA 411` |
| 4 | `equipmentBrands` | nombre | `KOMATSU` / typo `KOMATZU` |
| 5 | `equipmentModels` | marca, denominación | `930E4-SE` |
| 6 | `engineBrands` | nombre | `MTU`, `CAT` |
| 7 | `engineModels` ⭐ | marca, denominación, **cilindros**, **configuración**, **apoyosBancada**, potencia, rpm, tieneCac, tieneTurbos | `16V4000C21`, `20V4000C23`, `8V4000M60R`, `10V1600G80S` |
| 8 | `engines` ⭐ | **N° serie (clave natural)**, modelo, equipo actual, horas, estado | `5272012973`, `5282011236` |
| 9 | `engineSpecs` ⭐ | modelo, parámetro, nominal, tolInf, tolSup, unidad, fuente | §12.5 |
| 10 | `interventionTypes` | código, descripción, alcance, plantilla sugerida, periodicidad | `QL4`, `W6`, `W6-1` |
| 11 | `serviceReasons` | descripción, tipo asociado | `EVALUACIÓN DE MOTOR W6` |
| 12 | `technicians` | nombre, DNI, cargo, categoría, especialidad, firma | `REYNALDO CACERES / TÉCNICO SENIOR` |
| 13 | `positions` | denominación, nivel | `SUPERVISOR C`, `JEFE DE TALLER` |
| 14 | `businessUnits` | código, nombre, prefijo de OT | `TAL` (taller), `SCA` (servicio campo) |
| 15 | `spareParts` | N/P, descripción, marca, aplicación, unidad | `X57518300024` |
| 16 | `engineComponents` ⭐ | nombre, familia, aplica a modelos, bloque asociado | pistones, bielas, metales, camisas, turbos, housing, eje de levas, seguidores, varillas, balancines, culatas, CAC |
| 17 | `instruments` ⭐ | código, equipo, marca, modelo, serie, **calibración y vencimiento** | `MEGDPS01 / FLUKE 1587 FC / 51290323` |
| 18 | `suppliers` | razón social, servicios | metalizado, evaluación de cigüeñal, insertos |
| 19 | `outsourcedServices` | descripción, proveedor habitual | "Metalizado de 02 carcazas de turbo" |
| 20 | `testTypes` | nombre, método, criterio | NDT líquidos penetrantes, Magnaflux, hidrostática |
| 21 | `units` | símbolo, magnitud, factor SI | mm, °C, psi, bar, HP, kW, rpm, MΩ, l/h |
| 22 | `componentVerdicts` | nombre, color, acción sugerida | Operativo · Reutilizable · Reparar · Cambiar |

**Maestros documentales**

| # | Colección | Campos clave |
|---|---|---|
| 23 | `reportTemplates` ⭐ | código (`SER-FOR-002`), nombre, versiones |
| 24 | `templateVersions` | plantilla, versión, fecha emisión, estado, secciones embebidas |
| 25 | `blockTypes` | tipo, nombre, esquema JSON, renderer |
| 26 | `measurementTemplates` | nombre, forma, filas, origen de columnas, unidad |
| 27 | `phraseLibrary` | categoría, texto, usos, autor |
| 28 | `sequences` ⭐ | tipo, patrón, contador, año |
| 29 | `checklists` | nombre, ítems, aplica a modelos |
| 30 | `outputLayouts` | formato, márgenes, cabecera, pie, tipografías |

**Maestros de administración**

| # | Colección | Campos clave |
|---|---|---|
| 31 | `users` | email, técnico asociado, rol, activo, MFA |
| 32 | `roles` | nombre, matriz de permisos |
| 33 | `organization` | razón social, RUC, logo, colores |
| 34 | `settings` | configuración global |
| 35 | `notificationTemplates` | evento, asunto, cuerpo, destinatarios |

### 13.2 Priorización

| Fase | Maestros |
|---|---|
| **F1** | 1, 2, 3, 6, 7, 8, 10, 12, 13, 14, 23, 24, 28, 31, 32, 33 |
| **F2** | 4, 5, 9, 16, 21, 22, 25, 26 |
| **F3** | 11, 17, 20, 27, 29, 30, 34, 35 |
| **F5** | 15, 18, 19 |

### 13.3 Requisitos de UX transversales a todos los CRUDs

1. **Creación inline desde el formulario.** Si el técnico no encuentra `VQT-131`, un botón "+ Crear" abre un modal mínimo sin perder el informe. El registro nace como `pendienteValidacion: true` y Admin lo completa después. **Sin esto, los usuarios vuelven al texto libre y el proyecto fracasa.**
2. **Búsqueda tolerante a errores** (índice de texto + normalización): `KOMATZU` debe sugerir `KOMATSU`.
3. **Merge de duplicados** para Administrador, reasignando todas las referencias.
4. **Importación masiva por Excel/CSV** para la carga inicial de flota, repuestos e instrumentos.
5. **Soft delete + auditoría.** Nada se borra si tiene informes asociados.
6. **Vista de uso:** al abrir un equipo, ver sus informes; al abrir un instrumento, ver dónde se usó y si estaba calibrado en esa fecha.

## 14. Flujo funcional del informe

### 14.1 Wizard de captura

```
Paso 0  Seleccionar plantilla          SER-FOR-002
Paso 1  Identificación                 Cliente ▸ Sede ▸ Equipo ▸ Motor (cascada con autocompletado)
                                       · N° informe y N° OT generados automáticamente
                                       · Al elegir el motor: cilindros, apoyos, nominales y tolerancias quedan resueltos
Paso 2  Contexto                       Motivo, tipo de intervención, horas, garantía, antecedentes
Paso 3  Trabajos  (80% del tiempo)     Agregar bloques del catálogo · reordenar por drag&drop
                                       · fotos por bloque con caption obligatorio y Fig.NN automática
                                       · mediciones con validación en vivo
Paso 4  Repuestos, instrumentos, tercerizados
Paso 5  Conclusiones y recomendaciones (pre-pobladas desde veredictos + biblioteca de frases)
Paso 6  Vista previa fiel → Enviar a revisión
```

### 14.2 Máquina de estados

```
                  ┌──────────── observado ◄───────┐
                  ▼                                │
borrador ──► en_revision ──► aprobado ──► emitido  │
    ▲             │                          │     │
    └─────────────┘                          ▼     │
                                          anulado ─┘
```

| Transición | Rol habilitado | Efecto |
|---|---|---|
| crear → `borrador` | Técnico | Reserva número de informe |
| `borrador` → `en_revision` | Técnico | Valida completitud obligatoria |
| `en_revision` → `observado` | Supervisor | Requiere ≥1 comentario anclado a un bloque |
| `observado` → `en_revision` | Técnico | Reenvío |
| `en_revision` → `aprobado` | Supervisor | Registra firma de revisión |
| `aprobado` → `emitido` | Supervisor / Admin | **Congela snapshot, genera PDF+DOCX, calcula hash** |
| cualquiera → `anulado` | Administrador | Motivo obligatorio, conserva historial |

### 14.3 Reglas de negocio críticas

| ID | Regla |
|---|---|
| RN-01 | El número de informe se asigna al crear el borrador y **nunca se reutiliza**, incluso si el informe se anula. |
| RN-02 | Un informe `emitido` es inmutable. Cualquier corrección genera una **nueva versión** que referencia a la anterior. |
| RN-03 | No se puede emitir un informe con mediciones fuera de tolerancia sin una justificación textual del supervisor. |
| RN-04 | No se puede emitir un informe que use un instrumento con calibración vencida a la fecha del servicio (advertencia bloqueante, salvable por Administrador con motivo). |
| RN-05 | Las horas totales del motor no pueden ser menores que las del informe anterior del mismo motor (advertencia). |
| RN-06 | Toda foto debe tener caption; la numeración `Fig.NN` es calculada y se recalcula al reordenar bloques. |
| RN-07 | El técnico solo ve y edita informes donde es participante; el supervisor ve los de su unidad de negocio. |
| RN-08 | Al emitir se persiste `templateSnapshot`; el render posterior nunca consulta la plantilla viva. |

### 14.4 UX que decide la adopción

| # | Requisito | Razón |
|---|---|---|
| UX-01 | **Autoguardado cada 20–30 s** con indicador "Guardado hace X" | Un informe toma horas; perderlo es inaceptable |
| UX-02 | **Offline first** (ya existe en la PWA actual — no puede perderse) | Taller y mina tienen conectividad intermitente |
| UX-03 | **Captura móvil de fotos + edición en desktop en la misma sesión** (vinculación por QR) | El técnico fotografía con el celular y redacta en PC |
| UX-04 | **Compresión de imágenes en el cliente** (máx. 1600 px, JPEG q80) antes de subir | Los DOCX originales pesan 17.8 MB por no hacerlo |
| UX-05 | **Duplicar informe anterior del mismo motor** como punto de partida | El caso real W6 → W6-1 del OT746 |
| UX-06 | **Vista previa WYSIWYG** idéntica al PDF, en panel lateral | El técnico piensa en términos del documento final |
| UX-07 | **Validación con lista de campos faltantes navegables**, no un alert genérico | |
| UX-08 | **Comentarios de revisión anclados al bloque** | Hoy la corrección se hace por WhatsApp |
| UX-09 | **Biblioteca de frases buscable por bloque** | Las recomendaciones se repiten literalmente entre informes |
| UX-10 | **Modo oscuro** | El prototipo actual ya es dark; los técnicos lo conocen así |

---

# PARTE III — ESPECIFICACIÓN TÉCNICA

## 15. Arquitectura de la solución

### 15.1 Stack

| Capa | Tecnología | Notas |
|---|---|---|
| **Frontend** | **Angular 22** (standalone components, signals, control flow `@if/@for`, SSR opcional off) | PWA con `@angular/service-worker` |
| **UI** | Angular Material o PrimeNG + Tailwind | Definir en F0; el prototipo actual es dark con Rajdhani / IBM Plex |
| **Estado** | Signals + NgRx SignalStore para el editor de informes | El editor tiene estado complejo (bloques, orden, dirty tracking) |
| **Offline** | IndexedDB (Dexie.js) + Background Sync API | Reemplaza el `localStorage` actual |
| **Backend** | **NestJS 11** (REST + OpenAPI, class-validator, Mongoose) | Arquitectura modular por dominio |
| **Base de datos** | **MongoDB Atlas** (M10+ en producción) | Réplica set, PITR, Atlas Search |
| **Object storage** | **AWS S3** | Fotos, PDF, DOCX, firmas, adjuntos |
| **Render de documentos** | Playwright/Chromium headless (PDF) + docxtemplater (DOCX) | Ejecuta en worker separado |
| **Colas** | BullMQ + Redis | Generación de documentos, thumbnails, notificaciones |
| **CI/CD** | **GitHub Actions** | Lint, test, build, imagen Docker → GHCR → deploy |
| **Hosting** | **Coolify** (VPS propio) | Frontend, backend, worker, Redis; SSL automático |
| **Observabilidad** | Pino + Sentry + healthchecks de Coolify | |

### 15.2 Topología de despliegue

```
                    Internet
                        │
                  ┌─────▼──────┐
                  │  Coolify   │  Traefik + Let's Encrypt
                  │  (VPS)     │  informes.detroitpower.pe
                  └─────┬──────┘
        ┌───────────────┼────────────────┬──────────────┐
        ▼               ▼                ▼              ▼
 ┌────────────┐  ┌────────────┐   ┌────────────┐  ┌─────────┐
 │ web        │  │ api        │   │ worker     │  │ redis   │
 │ Angular 22 │  │ NestJS 11  │   │ NestJS     │  │ BullMQ  │
 │ (nginx)    │  │ REST       │   │ + Chromium │  │         │
 └────────────┘  └─────┬──────┘   └─────┬──────┘  └─────────┘
                       │                │
              ┌────────┴────────┬───────┘
              ▼                 ▼
      ┌───────────────┐   ┌──────────┐
      │ MongoDB Atlas │   │  AWS S3  │
      │  (gestionado) │   │ (bucket) │
      └───────────────┘   └──────────┘
```

> **Nota sobre el worker:** la generación de PDF con Chromium consume 300–600 MB de RAM por render. Debe ser un **servicio separado** en Coolify, no un hilo dentro de la API; de lo contrario un informe de 60 fotos puede tumbar la API para todos.

### 15.3 Módulos del backend (NestJS)

```
src/
├── common/          guards, interceptors, filters, pipes, decoradores RBAC
├── config/          configuración tipada por entorno
├── auth/            login, refresh, sesiones, política de contraseñas
├── users/           usuarios, roles, permisos
├── masters/         módulo genérico de CRUD + 35 sub-módulos
├── work-orders/     órdenes de trabajo
├── templates/       plantillas, versiones, bloques, publicación
├── reports/         informes, bloques, máquina de estados, snapshot
├── measurements/    plantillas de medición, validación, serie histórica
├── media/           subida a S3, derivados, EXIF, deduplicación
├── documents/       render PDF/DOCX, versiones, hash, QR
├── sequences/       generación de correlativos (transaccional)
├── sync/            endpoints de sincronización offline
├── analytics/       dashboard, ficha 360°, tendencias
├── audit/           registro inmutable de acciones
├── notifications/   email y push
└── integrations/    webhooks, SharePoint, export Power BI
```

## 16. Modelo de datos (MongoDB)

### 16.1 Principios de modelado

| Principio | Aplicación |
|---|---|
| **El informe es el agregado** | Bloques, fotos (metadatos) y mediciones se **embeben** en el documento del informe: se leen y escriben siempre juntos |
| **Los maestros son referencias + snapshot** | Se guarda `clientId` (ObjectId) **y** `clientNombre` (string al momento). El informe emitido debe seguir diciendo lo que decía aunque el maestro cambie |
| **Los binarios nunca van a Mongo** | Solo la clave S3 y los metadatos. Nada de base64 (el error del prototipo actual) |
| **Analítica en colección aparte** | `measurementFacts` desnormalizada para consultas transversales sin recorrer informes |
| **Límite de 16 MB por documento** | Con fotos como referencias, un informe de 80 fotos y 10 grillas ≈ 300–600 KB. Holgado |

### 16.2 Colecciones núcleo

**`reports`**

```js
{
  _id: ObjectId,
  numeroInforme: "ITS-T-E-26-003-0898",     // único, índice
  numeroOt: "LIM-TAL-000898",
  workOrderId: ObjectId,

  templateId: ObjectId,
  templateVersionId: ObjectId,
  templateSnapshot: { /* congelado al emitir */ },

  // Referencias + snapshot denormalizado
  cliente:  { id: ObjectId, nombre: "SPCC. TOQUEPALA" },
  sede:     { id: ObjectId, nombre: "TALLER - LIMA" },
  equipo:   { id: ObjectId, codigo: "VQT-130", marca: "KOMATSU", modelo: "930E4-SE" },
  motor:    { id: ObjectId, serie: "5282011236", marca: "MTU", modelo: "20V4000C23",
              cilindros: 20, apoyosBancada: 11, potencia: "3400 HP / 2500 KW @ 1800 rpm" },

  tipoServicio: "evaluacion",
  tipoIntervencion: { id: ObjectId, codigo: "QL4" },
  motivo: "QL4 / W6-1",

  fechaEmision: ISODate, fechaInicio: ISODate, fechaFin: ISODate,
  horasTotales: 17694, horasParciales: 17694,
  garantia: { enGarantia: false, inicio: null, fin: null },
  informeAnteriorId: ObjectId,               // reemplaza el texto "W6" / "---"
  antecedentes: "Motor desmontado del camión VQT-130...",

  participantes: [
    { rol: "elaborado_por", tecnicoId: ObjectId, nombre: "JOSÉ LUIS ESTRELLA", cargo: "SUPERVISOR C" },
    { rol: "dirigido_a",    tecnicoId: ObjectId, nombre: "KEITH BECERRA",      cargo: "JEFE DE TALLER" }
  ],

  bloques: [ /* ver 16.3 */ ],

  repuestos:    [ { sparePartId, descripcion, np, cantidad } ],
  instrumentos: [ { instrumentId, equipo, codigo, marca, serie, calibracionVigente: true } ],
  tercerizados: [ { descripcion, supplierId, proveedor } ],
  conclusiones:    [ { texto, componenteId, veredicto, accion } ],
  recomendaciones: [ { texto } ],

  estado: "emitido",
  historialEstados: [ { de, a, usuarioId, fecha, comentario } ],
  firmas: [ { tipo: "realizado_por", usuarioId, fecha, s3Key, hash } ],
  documentos: [ { formato: "pdf", version: 1, s3Key, hash, generadoEn } ],

  organizacionId: ObjectId,
  unidadNegocioId: ObjectId,
  createdBy, updatedBy, createdAt, updatedAt, deletedAt
}
```

**Índices:** `{numeroInforme:1}` único · `{numeroOt:1}` · `{"motor.id":1, fechaEmision:-1}` · `{"equipo.id":1, fechaEmision:-1}` · `{"cliente.id":1, estado:1}` · `{estado:1, unidadNegocioId:1, fechaEmision:-1}` · Atlas Search sobre `numeroInforme`, `antecedentes`, `bloques.titulo`, `bloques.texto`.

**Bloque embebido (`reports.bloques[]`)**

```js
{
  _id: ObjectId,
  orden: 3,
  tipo: "work_task",
  titulo: "DESMONTAJE DE PISTONES",
  fechaTrabajo: ISODate("2026-06-13"),
  texto: "Se desmontan los pistones y se observan desgaste en las faldas...",
  componenteId: ObjectId,
  veredicto: "cambiar",
  accionRecomendada: "Cambiar los 20 pistones",
  fotos: [
    { s3Key: "org/2026/rep-.../foto-01.jpg", thumbKey, printKey,
      caption: "pistones desgastados en los recubrimientos",
      numeroFigura: 7, ancho: 1600, alto: 1200, tomadaEn: ISODate, hash: "sha256:..." }
  ],
  mediciones: [ /* ver 16.4 */ ],
  visible: true
}
```

**Grilla de medición embebida**

```js
{
  templateId: ObjectId,
  nombre: "Diámetro túnel de bancada",
  unidad: "mm",
  filas: ["a", "b1", "b2", "Ovalidad"],
  columnas: ["1","2","3","4","5","6","7","8","9","10","11"],
  valores: [
    { fila: "a",        columna: "1", valor: 0.02,  estado: "ok",  calculado: false },
    { fila: "Ovalidad", columna: "1", valor: 0.01,  estado: "ok",  calculado: true  }
  ],
  especificacion: { nominal: 171.000, tolInf: 0, tolSup: 0.025, fuente: "Manual MTU S4000" },
  resumen: { fueraTolerancia: 0, alertas: 0, veredicto: "operativo" }
}
```

### 16.3 Colección analítica

**`measurementFacts`** — una fila por valor medido, escrita al emitir el informe. Permite responder consultas transversales sin recorrer informes.

```js
{
  reportId, numeroInforme, fechaEmision,
  motorId, motorSerie: "5282011236", modeloMotor: "20V4000C23",
  equipoId, equipoCodigo: "VQT-130", clienteId,
  parametro: "tunel_bancada", fila: "a", columna: "5",
  valor: 0.03, unidad: "mm",
  nominal: 171.000, tolInf: 0, tolSup: 0.025, estado: "ok",
  horasMotor: 17694
}
```

**Índices:** `{motorSerie:1, parametro:1, fechaEmision:1}` · `{modeloMotor:1, parametro:1}` · `{estado:1, fechaEmision:-1}`

> Consulta objetivo: *"evolución del juego axial del cigüeñal del motor 5282011236"* → un solo índice, milisegundos.

### 16.4 Otras colecciones relevantes

| Colección | Notas de modelado |
|---|---|
| `templateVersions` | Secciones y bloques **embebidos**; se lee siempre completa |
| `engineModels` | `cilindros`, `apoyosBancada`, `bancos`, `tieneCac`, `tieneTurbos` — alimentan las grillas |
| `engineSpecs` | Índice compuesto `{engineModelId:1, parametro:1}` único |
| `engines` | `serie` único; `historialInstalaciones[]` embebido (qué motor estuvo en qué equipo) |
| `sequences` | Actualización atómica con `findOneAndUpdate` + `$inc` — **nunca leer-incrementar-escribir** |
| `auditLogs` | Append-only; TTL de 7 años; sin update ni delete a nivel de rol de BD |
| `syncQueue` | Operaciones offline pendientes por dispositivo, con `clientOpId` para idempotencia |

### 16.5 Estrategia de correlativos

Patrones observados en las fuentes:

| Documento | Ejemplo | Patrón inferido |
|---|---|---|
| Informe taller/evaluación | `ITS-T-E-26-003-0898` | `ITS-{sede}-{tipo}-{aa}-{serie}-{correlativo}` |
| Informe campo/grupo electrógeno | `ITS-C-G-25-0001-001398` | mismo patrón, distinta sede y tipo |
| Orden de trabajo taller | `LIM-TAL-000898` | `{ciudad}-{unidad}-{correlativo}` |
| Orden de trabajo campo | `LIM-SCA-001398` | ídem |

Implementación: colección `sequences` con `{tipo, patron, contadorPorAnio: {2026: 898}}` y asignación atómica. **Ver §27, decisión abierta D3** — la semántica exacta de cada segmento debe confirmarla el negocio antes de codificar el generador.

## 17. API REST (principales endpoints)

Base: `/api/v1` · Auth: `Authorization: Bearer <jwt>` · Documentación: OpenAPI en `/api/docs`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Devuelve access + refresh token |
| `POST` | `/auth/refresh` | Rotación de refresh token |
| `POST` | `/auth/logout` | Revoca sesión |
| `GET` | `/masters/:collection` | Listado paginado con búsqueda difusa |
| `POST` | `/masters/:collection` | Crear (soporta `?inline=true` → `pendienteValidacion`) |
| `PATCH` | `/masters/:collection/:id` | Actualizar |
| `POST` | `/masters/:collection/merge` | Fusionar duplicados (Admin) |
| `POST` | `/masters/:collection/import` | Importación masiva CSV/XLSX |
| `GET` | `/templates` · `/templates/:id/versions/:v` | Plantillas y versiones |
| `POST` | `/templates/:id/versions/:v/publish` | Publicar versión (Calidad) |
| `POST` | `/reports` | Crear borrador (asigna correlativo) |
| `GET` | `/reports` | Bandeja con filtros: estado, cliente, equipo, motor, técnico, rango de fechas |
| `GET` | `/reports/:id` | Informe completo |
| `PATCH` | `/reports/:id` | Autoguardado parcial (JSON Patch) |
| `POST` | `/reports/:id/blocks` · `PATCH` · `DELETE` | Gestión de bloques |
| `PATCH` | `/reports/:id/blocks/reorder` | Reordenar (recalcula figuras) |
| `POST` | `/reports/:id/duplicate` | Duplicar como base de uno nuevo |
| `POST` | `/reports/:id/transition` | `{ a: "en_revision" \| "aprobado" \| ... , comentario }` |
| `POST` | `/reports/:id/documents` | Encola generación PDF/DOCX |
| `GET` | `/reports/:id/documents/:formato` | URL firmada de descarga |
| `GET` | `/reports/:id/preview` | HTML de vista previa fiel |
| `POST` | `/media/presign` | URL prefirmada de subida a S3 |
| `POST` | `/media/confirm` | Confirma subida, dispara derivados |
| `GET` | `/measurements/templates/:id/grid?engineId=` | **Grilla resuelta con dimensiones y tolerancias del motor** |
| `POST` | `/measurements/validate` | Valida un set y devuelve estados por celda |
| `GET` | `/analytics/engines/:serie/trend?parametro=` | Serie histórica |
| `GET` | `/analytics/dashboard` | KPIs |
| `POST` | `/sync/pull` · `/sync/push` | Sincronización offline idempotente |
| `GET` | `/audit` | Consulta de auditoría (Admin) |

**Convenciones:** paginación por cursor · errores RFC 7807 (`application/problem+json`) · `If-Match`/`ETag` para control de concurrencia optimista en informes · rate limiting por usuario.

## 18. PWA y sincronización offline

Requisito heredado y **no negociable**: la PWA actual ya funciona offline y los técnicos dependen de ello.

| Aspecto | Decisión |
|---|---|
| **Caché de app** | Angular Service Worker, estrategia `freshness` para API, `performance` para assets |
| **Datos locales** | IndexedDB vía Dexie: informes en edición, maestros más usados, cola de operaciones |
| **Maestros offline** | Sincronización delta al iniciar sesión y cada 4 h: clientes, sedes, equipos, motores, modelos, specs, técnicos, componentes |
| **Fotos offline** | Se guardan como Blob en IndexedDB con `clientOpId`; se suben a S3 al recuperar conexión |
| **Cola de operaciones** | Append-only con `clientOpId` UUID; el backend deduplica por ese id (idempotencia) |
| **Resolución de conflictos** | Último escritor gana **por bloque**, no por informe. Si dos usuarios tocaron el mismo bloque, se marca conflicto y se pide resolución manual |
| **Límite práctico** | Advertir al usuario si hay >500 MB en IndexedDB o >5 informes sin sincronizar |
| **Indicador visible** | Chip permanente: `● En línea` / `● Sin conexión — 3 cambios pendientes` |

## 19. Generación documental

| Aspecto | Decisión | Razón |
|---|---|---|
| **Motor PDF** | HTML + CSS Paged Media renderizado con Playwright/Chromium **en el servidor** | El jsPDF del prototipo obliga a recalcular paginación a mano (`keepTogether`, `drawJustifiedLine`); con CSS es declarativo y fiel |
| **Motor DOCX** | `docxtemplater` sobre plantilla `.dotx` corporativa | El export actual es HTML renombrado a `.doc`: se rompe al editar. Con `.dotx`, Calidad edita el machote sin tocar código |
| **Cabecera** | Código, versión y fecha de emisión leídos de `templateVersions` | Hoy `SER-FOR-002 / Versión 01 / 13/05/2021` está hardcodeado |
| **Numeración de figuras** | Calculada en el render | Hoy el técnico escribe `Fig.01` a mano |
| **Paginación** | Mantener juntos: título de bloque + primer párrafo · fila de fotos + su caption · tabla de medición completa | Replica el comportamiento del Word original |
| **Marca de agua** | "BORRADOR" en diagonal mientras no esté aprobado | |
| **Inmutabilidad** | Al emitir se genera el PDF, se calcula SHA-256 y se guarda en S3 con Object Lock; reimprimir devuelve el mismo archivo | Requisito de formato controlado |
| **QR de verificación** | En el pie, hacia la vista pública del informe | Valor percibido por el cliente final |
| **Rendimiento objetivo** | < 45 s para un informe de 60 fotos | Se ejecuta en cola, con notificación al terminar |

## 20. Seguridad

| Control | Implementación |
|---|---|
| Autenticación | JWT access (15 min) + refresh rotativo (7 d) en cookie `httpOnly`, `Secure`, `SameSite=Strict` |
| Contraseñas | Argon2id · mínimo 12 caracteres · bloqueo tras 5 intentos · expiración configurable |
| MFA | TOTP opcional; obligatorio para rol Administrador |
| Autorización | RBAC por rol + scoping por unidad de negocio (RN-07); guards de NestJS con decoradores `@Permissions()` |
| Sesiones | Listado de sesiones activas por usuario, revocables por Admin (slide 8: "sesiones controladas") |
| Transporte | TLS 1.2+ obligatorio, HSTS, certificados Let's Encrypt gestionados por Coolify |
| Almacenamiento | S3 con cifrado SSE-S3, bucket privado, acceso solo por URL prefirmada de 15 min |
| Base de datos | MongoDB Atlas con cifrado en reposo, IP allowlist hacia el VPS de Coolify, usuario de app sin permisos DDL |
| Auditoría | `auditLogs` append-only: actor, acción, entidad, antes/después, IP, user-agent, timestamp (slide 7: "auditoría de accesos") |
| Secretos | Variables de entorno gestionadas en Coolify; nunca en el repositorio; rotación documentada |
| Datos personales | Nombres, DNI y firmas de técnicos → cumplimiento de la Ley 29733 de Protección de Datos Personales (Perú) |
| Dependencias | `npm audit` + Dependabot en el pipeline; build falla ante vulnerabilidad crítica |

## 21. Infraestructura, entornos y CI/CD

### 21.1 Entornos

| Entorno | Frontend | Backend | BD | S3 | Propósito |
|---|---|---|---|---|---|
| `dev` | local | local | Atlas M0 | bucket `-dev` | Desarrollo |
| `staging` | Coolify | Coolify | Atlas M10 | bucket `-stg` | UAT con datos anonimizados |
| `prod` | Coolify | Coolify | Atlas M10+ | bucket `-prod` | Producción |

### 21.2 Pipeline de GitHub Actions

```yaml
# .github/workflows/ci.yml  (resumen conceptual)
on: [pull_request, push a main]

jobs:
  quality:      lint (ESLint) · format (Prettier) · typecheck
  test-api:     unit (Jest) + integración (mongodb-memory-server) · cobertura ≥ 70%
  test-web:     unit (Jest/Vitest) · e2e (Playwright) contra stack docker-compose
  build:        docker build web / api / worker → push a ghcr.io con tag = SHA
  deploy-stg:   (rama main) llamada al webhook de despliegue de Coolify → staging
  deploy-prod:  (tag vX.Y.Z, con aprobación manual) webhook de Coolify → producción
  migrate:      migraciones de Mongo (migrate-mongo) antes del cambio de tráfico
```

**Reglas:** rama `main` protegida · PR con revisión obligatoria · versionado semántico con tags · rollback = redeploy del tag anterior en Coolify (las imágenes quedan en GHCR).

### 21.3 Servicios en Coolify

| Servicio | Imagen | Recursos sugeridos | Escalado |
|---|---|---|---|
| `web` | nginx + build Angular | 0.5 vCPU / 512 MB | horizontal simple |
| `api` | Node 22 + NestJS | 1 vCPU / 1 GB | 2 réplicas en prod |
| `worker` | Node 22 + Chromium | 1 vCPU / **2 GB** | 1–2 réplicas |
| `redis` | redis:7-alpine | 0.5 vCPU / 512 MB | persistencia AOF |

**VPS recomendado para producción:** 4 vCPU / 8 GB RAM / 100 GB SSD como punto de partida.

### 21.4 Dimensionamiento de almacenamiento (respuesta al slide 7)

Supuestos: 60 informes/mes · 45 fotos por informe · 250 KB por foto tras compresión.

| Concepto | Por informe | Por mes | Por año |
|---|---|---|---|
| Fotos (3 derivados) | ~14 MB | 840 MB | ~10 GB |
| PDF + DOCX | ~8 MB | 480 MB | ~5.8 GB |
| Documentos en Mongo | ~500 KB | 30 MB | 360 MB |
| **Total S3** | | **~1.3 GB** | **~16 GB** |

**Capacidad inicial recomendada:** 100 GB en S3 (≈ 6 años) con política de ciclo de vida a S3 Infrequent Access a los 12 meses y a Glacier Instant Retrieval a los 36. Migrar el histórico de informes en Word consume una única carga adicional estimada en 20–40 GB.

## 22. Requisitos no funcionales

| ID | Requisito | Meta |
|---|---|---|
| NFR-01 | Tiempo de carga inicial de la PWA | < 3 s en 4G |
| NFR-02 | Autoguardado percibido | < 500 ms |
| NFR-03 | Generación de PDF (60 fotos) | < 45 s |
| NFR-04 | Disponibilidad | 99.5% en horario laboral |
| NFR-05 | RPO / RTO | RPO ≤ 1 h · RTO ≤ 4 h |
| NFR-06 | Capacidad concurrente | 30 usuarios simultáneos sin degradación |
| NFR-07 | Retención de auditoría | 7 años |
| NFR-08 | Navegadores | Chrome/Edge/Safari últimas 2 versiones · Android 10+ · iOS 15+ |
| NFR-09 | Accesibilidad | WCAG 2.1 AA en formularios y navegación |
| NFR-10 | Idioma | Español (Perú); arquitectura i18n-ready |
| NFR-11 | Cobertura de pruebas | ≥ 70% backend · ≥ 50% frontend · e2e sobre los 5 flujos críticos |

---

# PARTE IV — PLAN DE CONSTRUCCIÓN POR FASES

## 23. Cómo leer este plan

El deck usa "Fase 1–4" para describir la **evolución histórica** del proyecto. Para evitar confusión, las fases de construcción se numeran **F0–F6**. Todas ellas ocurren *dentro* de la Fase 4 del deck.

```
Deck:  Fase 1 (Word) → Fase 2 (HTML) → Fase 3 (PWA) → ─────── Fase 4: Plataforma corporativa ───────
                                                              │                                    │
Plan:                                                         F0 F1 F2 F3 F4 F5 F6
```

**Supuestos de estimación** (declarados explícitamente para poder discutirlos):

| Supuesto | Valor |
|---|---|
| Equipo | 1 tech lead full-stack · 1 dev Angular · 1 dev NestJS · PO del negocio a medio tiempo · QA a medio tiempo |
| Semana | 5 días hábiles, capacidad efectiva 80% |
| Diseño UI | Se reutiliza el lenguaje visual de la PWA actual; no hay rediseño desde cero |
| Contenido de maestros | Lo provee el negocio en Excel; el equipo construye el importador, no digita datos |
| Especificaciones MTU | Disponibles antes del inicio de F2 (bloqueante — ver riesgo R2) |
| Los rangos son órdenes de magnitud | ±25%, a refinar tras F0 |

**Duración total estimada: 32–42 semanas (8–10 meses).** Las fases F4 y F5 pueden solaparse parcialmente.

---

## F0 — Fundaciones

**Objetivo:** que exista un esqueleto desplegado, con pipeline funcionando, antes de escribir una sola pantalla de negocio.

| | |
|---|---|
| **Duración** | 2–3 semanas |
| **Depende de** | Acceso a VPS, cuenta AWS, cuenta Atlas, dominio corporativo |

### Alcance

| Épica | Historias |
|---|---|
| **Repositorio y estándares** | Monorepo (Nx o workspaces) `apps/web`, `apps/api`, `apps/worker`, `libs/shared` · ESLint + Prettier + Husky · convención de commits |
| **Infraestructura** | Provisión de VPS con Coolify · MongoDB Atlas (3 entornos) · buckets S3 con política de ciclo de vida · dominio + SSL |
| **CI/CD** | Workflows de GitHub Actions (§21.2) · registro GHCR · despliegue automático a staging |
| **Esqueleto de la app** | Angular 22 con shell, routing, layout y tema · NestJS con config tipada, Mongoose, healthcheck, OpenAPI |
| **Auth base** | Login, JWT + refresh, guard de rutas, 4 roles del slide 8 con permisos declarativos |
| **Observabilidad** | Pino estructurado · Sentry · healthchecks |

### Criterios de aceptación

- [ ] Un `git push` a `main` despliega automáticamente a staging en < 10 min.
- [ ] `https://staging.<dominio>` responde con SSL válido y la app carga.
- [ ] Un usuario `admin` puede iniciar sesión; un usuario sin rol recibe 403 en una ruta protegida.
- [ ] `/api/docs` muestra el OpenAPI generado.
- [ ] Rollback probado: redeploy del tag anterior restaura la versión previa.

---

## F1 — Núcleo de informes (MVP operativo)

**Objetivo:** que un técnico pueda producir, de punta a punta y en la plataforma central, un informe **equivalente al que hoy produce en Word**.

Esta es la fase que define el éxito del proyecto. Si el PDF que sale de aquí no es tan bueno como el Word actual, los técnicos no migran.

| | |
|---|---|
| **Duración** | 7–9 semanas |
| **Depende de** | F0 · maestros base cargados en Excel por el negocio |

### Alcance

| Épica | Historias principales |
|---|---|
| **E1.1 Maestros base** | CRUD genérico + UI de tabla/formulario · maestros 1, 2, 3, 6, 7, 8, 10, 12, 13, 14, 31, 32, 33 · **creación inline** desde el formulario · búsqueda difusa · importador CSV/XLSX |
| **E1.2 Motor de plantillas (runtime)** | Modelo `templateVersions` · carga de SER-FOR-002 v01 como semilla · renderizado del formulario desde la definición · visibilidad condicional |
| **E1.3 Órdenes de trabajo** | CRUD mínimo de OT · relación OT ↔ informes |
| **E1.4 Correlativos** | `sequences` con asignación atómica · patrones `ITS-…` y `LIM-…` |
| **E1.5 Editor de informes** | Wizard de 6 pasos · pasos 1–2 con cascada Cliente→Sede→Equipo→Motor · autoguardado · bloques `work_task` ordenables (drag & drop) · `rich_text` · `bullet_list` · `items_table` |
| **E1.6 Evidencia fotográfica** | Subida directa a S3 con URL prefirmada · compresión en cliente · caption obligatorio · numeración `Fig.NN` automática y recalculada al reordenar · derivados thumb/web/print en el worker |
| **E1.7 Generación de PDF** | Render servidor con Playwright · réplica fiel de la cabecera SER-FOR-002 · tablas de datos generales y equipo · bloques con fotos en pares · reglas de paginación |
| **E1.8 Bandeja e historial** | Listado con filtros (estado, cliente, equipo, motor, técnico, fecha) · búsqueda · descarga |
| **E1.9 Estados básicos** | `borrador` → `emitido` (el flujo de revisión completo llega en F3) |

### Criterios de aceptación

- [ ] **Prueba de fidelidad:** un técnico reproduce íntegramente el informe **OT746** en la plataforma; en una comparación ciega, un supervisor no identifica cuál PDF salió del Word y cuál de la plataforma.
- [ ] Lo mismo con el informe **OT898**, sin cambiar código — solo componiendo bloques distintos.
- [ ] Un informe con 45 fotos genera su PDF en < 45 s.
- [ ] El número de informe se asigna sin colisiones con 5 usuarios creando borradores simultáneamente.
- [ ] Al reordenar bloques, la numeración de figuras se recalcula correctamente en pantalla y en el PDF.
- [ ] Un técnico puede crear un equipo nuevo desde el formulario sin perder el borrador en curso.
- [ ] El tamaño del documento del informe en Mongo es < 1 MB con 45 fotos.

### Entregables

Plataforma en staging usable por 2–3 técnicos piloto · manual breve de usuario · maestros base cargados.

---

## F2 — Mediciones dimensionales

**Objetivo:** digitalizar la información que hoy no existe como dato, y con ello justificar toda la inversión posterior en analítica.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F1 · **especificaciones y tolerancias validadas contra el manual MTU** (bloqueante) |

### Alcance

| Épica | Historias principales |
|---|---|
| **E2.1 Maestros técnicos** | `engineModels` con cilindros/apoyos/bancos/CAC/turbos · `engineSpecs` · `engineComponents` · `units` · `componentVerdicts` |
| **E2.2 Plantillas de medición** | Las 10 plantillas de §12.3 · resolución de dimensiones desde el modelo de motor · campos calculados |
| **E2.3 Grilla de captura** | Componente de grilla con navegación por teclado, pegado desde Excel, semáforo en vivo, columna/fila con etiquetas fijas (`APOYO`, `L`, `T`) |
| **E2.4 Validación** | Motor de tolerancias en backend (fuente de verdad) y espejo en frontend para feedback inmediato · denormalización de la especificación aplicada |
| **E2.5 Veredicto y conclusiones asistidas** | Propuesta automática de veredicto por bloque · pre-poblado de la sección Conclusiones · biblioteca de frases |
| **E2.6 Render de mediciones** | Tablas dimensionales en PDF y DOCX con el formato del Word original · anexo "hoja de mediciones" independiente |
| **E2.7 Checklist de desarmado** | Bloque `checklist` para el anexo SER-T-FOR-002 |
| **E2.8 Hechos analíticos** | Escritura de `measurementFacts` al emitir |

### Criterios de aceptación

- [ ] Al seleccionar el motor `5282011236`, la grilla de muñón de bancada aparece con **11 columnas** y la de biela A con **10**, sin configuración manual.
- [ ] Al seleccionar `5272012973` (16V), las mismas grillas aparecen con **9** y **8** columnas.
- [ ] La grilla de encaje de camisa inferior valida contra **193.000 mm** para el 20V4000C23 y contra **189.000 mm** para el 16V4000C21.
- [ ] Un valor de +0.16 mm en encaje superior se marca 🔴 y bloquea la emisión sin justificación del supervisor (RN-03).
- [ ] La `Ovalidad` se calcula y no es editable.
- [ ] Un técnico captura las 11 columnas × 3 filas del túnel de bancada usando solo el teclado, en < 60 s.
- [ ] Las tablas del PDF generado son visualmente equivalentes a las del OT898.

---

## F3 — Flujo de aprobación, documentos y gobierno del formato

**Objetivo:** cerrar el ciclo de control interno que hoy no existe (slide 4: *"no existe trazabilidad corporativa"*).

| | |
|---|---|
| **Duración** | 5–7 semanas |
| **Depende de** | F1 (F2 recomendable pero no bloqueante) |

### Alcance

| Épica | Historias principales |
|---|---|
| **E3.1 Máquina de estados completa** | Las 7 transiciones de §14.2 con permisos por rol |
| **E3.2 Revisión colaborativa** | Comentarios anclados a bloque · marcar resuelto · notificación al técnico |
| **E3.3 Firmas** | Bloque `signature_block` · firma con usuario+fecha+hash · imagen de firma desde `technicians` |
| **E3.4 Inmutabilidad y versiones** | Snapshot al emitir · hash SHA-256 · S3 Object Lock · versión correctiva que referencia a la anterior |
| **E3.5 Export DOCX real** | `docxtemplater` sobre plantilla `.dotx` corporativa |
| **E3.6 Marca de agua y QR** | "BORRADOR" mientras no esté aprobado · QR de verificación en el pie · vista pública de verificación |
| **E3.7 Editor de plantillas (Calidad)** | UI para componer secciones y bloques · versionar y publicar · rol Calidad |
| **E3.8 Auditoría** | `auditLogs` append-only · consulta filtrable para Administrador |
| **E3.9 Notificaciones** | Email en: enviado a revisión, observado, aprobado, emitido |
| **E3.10 Maestros restantes** | `instruments` con control de calibración (RN-04) · `testTypes` · `phraseLibrary` · `outputLayouts` · `settings` |

### Criterios de aceptación

- [ ] Un informe recorre `borrador → en_revision → observado → en_revision → aprobado → emitido` con los roles correctos y queda registrado en auditoría.
- [ ] Un supervisor no puede aprobar sin resolver los comentarios abiertos.
- [ ] Reimprimir un informe emitido devuelve un archivo con el mismo hash que la primera generación.
- [ ] El `.docx` exportado abre en Word sin advertencias y es editable con estilos correctos.
- [ ] Calidad publica SER-FOR-002 **v02** agregando una sección, y los informes emitidos con v01 se siguen renderizando idénticos.
- [ ] Un informe que usa un instrumento con calibración vencida muestra advertencia bloqueante.
- [ ] Escanear el QR de un PDF abre la vista de verificación con los datos del informe.

---

## F4 — PWA, movilidad y offline

**Objetivo:** igualar y superar la experiencia offline que los técnicos **ya tienen hoy**. Hasta que esta fase esté lista, la PWA actual sigue siendo el respaldo operativo.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F1 · F2 (para poder capturar mediciones offline) |

### Alcance

| Épica | Historias principales |
|---|---|
| **E4.1 Service worker e instalación** | Angular SW · manifest · instalable en Android, iOS y escritorio |
| **E4.2 Caché de maestros** | Sincronización delta al iniciar sesión y cada 4 h |
| **E4.3 Edición offline** | Informes en IndexedDB (Dexie) · fotos como Blob · indicador de estado permanente |
| **E4.4 Cola y sincronización** | `clientOpId` idempotente · `POST /sync/push` y `/sync/pull` · reintentos con backoff |
| **E4.5 Conflictos** | Resolución por bloque · UI de comparación cuando hay conflicto real |
| **E4.6 Captura móvil** | Cámara nativa desde el navegador · compresión · vinculación desktop↔móvil por QR |
| **E4.7 Responsive** | Editor usable en tablet; captura de fotos y mediciones optimizada para móvil |

### Criterios de aceptación

- [ ] Con el modo avión activado, un técnico crea un informe completo con 20 fotos y 3 grillas de medición.
- [ ] Al recuperar conexión, todo se sincroniza sin duplicados y sin pérdida de captions.
- [ ] Reenviar la misma operación dos veces (doble tap, reintento) no crea dos informes.
- [ ] Dos usuarios editan bloques distintos del mismo informe offline; al sincronizar, ambos cambios se conservan.
- [ ] La app instalada abre en < 3 s sin conexión.

---

## F5 — Analítica y gestión del conocimiento

**Objetivo:** entregar la promesa central del deck — *"transformar la información técnica en un activo estratégico"*.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F2 (`measurementFacts`) · volumen mínimo de ~30 informes emitidos |

### Alcance

| Épica | Historias principales |
|---|---|
| **E5.1 Dashboard operativo** | Informes por estado · tiempo promedio de emisión · motores en taller · informes por técnico y por cliente |
| **E5.2 Ficha 360° de motor** | Por número de serie: historial de intervenciones, horas, fotos, documentos, componentes cambiados |
| **E5.3 Tendencias de desgaste** | Curva de un parámetro por motor a lo largo del tiempo · comparación contra la flota del mismo modelo |
| **E5.4 Alertas** | Mediciones fuera de tolerancia · instrumentos por vencer calibración · motores que superan horas de mantenimiento |
| **E5.5 Consumo de repuestos** | Maestros 15, 18, 19 · consumo por informe, equipo y periodo |
| **E5.6 Búsqueda avanzada** | Atlas Search sobre texto de bloques, conclusiones y recomendaciones |
| **E5.7 Exportaciones** | Excel de mediciones, consumo y bandeja de informes |

### Criterios de aceptación

- [ ] La ficha del motor `5282011236` muestra sus intervenciones ordenadas y su curva de juego axial.
- [ ] La consulta *"todos los encajes de camisa fuera de tolerancia en motores 4000 durante 2026"* responde en < 2 s.
- [ ] El dashboard carga en < 3 s con 500 informes en base.
- [ ] Una alerta de instrumento por vencer llega por email 30 días antes.

---

## F6 — Integración corporativa

**Objetivo:** cerrar el frente "Integraciones" del slide 7.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F3 · definición de TI sobre qué sistemas integrar realmente |

### Alcance

| Épica | Historias principales |
|---|---|
| **E6.1 SSO corporativo** | Entra ID / Google Workspace vía OIDC · aprovisionamiento de usuarios |
| **E6.2 API pública** | OpenAPI documentada · API keys por sistema · webhooks de eventos (`informe.emitido`) |
| **E6.3 SharePoint** | Publicación automática del PDF aprobado en la biblioteca documental corporativa |
| **E6.4 Power BI** | Endpoint/vista de solo lectura o export programado a un dataset |
| **E6.5 Sistema de OT** | Importación de órdenes de trabajo desde el sistema corporativo (si existe — ver D7) |
| **E6.6 Portal de cliente** *(opcional)* | Acceso restringido para que el cliente descargue los informes aprobados de sus equipos |

### Criterios de aceptación

- [ ] Un usuario inicia sesión con su cuenta corporativa sin contraseña propia de la plataforma.
- [ ] Al emitir un informe, el PDF aparece automáticamente en la biblioteca de SharePoint acordada.
- [ ] Power BI consume el dataset y reproduce el dashboard de F5.

---

## 24. Cronograma y dependencias

```
Semana   0    4    8   12   16   20   24   28   32   36   40
         │    │    │    │    │    │    │    │    │    │    │
F0  ███──┘
F1       ████████████████──┐
F2                         ██████████──┐
F3            (paralelizable desde F1) ████████████──┐
F4                                      ██████████───┤
F5                                          ██████████──┐
F6                                                  ██████████
```

| Fase | Bloquea a | Puede solaparse con |
|---|---|---|
| F0 | Todas | — |
| F1 | F2, F3, F4 | — |
| F2 | F5 | F3 |
| F3 | F6 | F2, F4 |
| F4 | — | F3, F5 |
| F5 | — | F4, F6 |

**Hito de valor mínimo:** al final de **F1** (semana ~11) la plataforma ya reemplaza el Word. Todo lo posterior agrega control y conocimiento, pero el ahorro operativo empieza ahí.

**Estrategia de puesta en producción recomendada:** salida a producción al final de F1 con 2–3 técnicos piloto y convivencia con la PWA actual; adopción total al cerrar F3 (cuando existe flujo de aprobación y DOCX editable); apagado de la PWA local al cerrar F4.

## 25. Indicadores de éxito

| KPI | Línea base actual | Meta | Se mide desde |
|---|---|---|---|
| Horas para elaborar un informe de evaluación | A determinar en F0 (estimado 6–10 h) | −50% | F1 |
| Informes con datos maestros inconsistentes | Alta (evidencia: `KOMATZU`, `SPCC. TOQUEPALA`) | < 2% | F1 |
| Tiempo desde fin de servicio hasta informe emitido | A determinar | ≤ 3 días hábiles | F3 |
| Informes con retrabajo por observación de supervisor | No medible hoy | < 15% | F3 |
| Mediciones fuera de tolerancia detectadas en captura (no en revisión) | 0% | > 90% | F2 |
| Informes accesibles desde repositorio central | 0% | 100% | F1 |
| Adopción (informes emitidos en plataforma / total) | 0% | > 95% al cierre de F4 | F1 |

## 26. Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Rechazo de los técnicos** si la plataforma es más lenta o más rígida que la PWA actual | Media | **Alto** | Piloto desde F1 con los mismos técnicos que validaron la PWA · convivencia · no forzar corte · UX-01 a UX-10 son requisitos, no adornos |
| R2 | **Especificaciones MTU no disponibles** a tiempo | Media | **Alto** | Iniciar la recopilación en F0 · si no llegan, F2 arranca con las tolerancias inferidas de los informes, marcadas como "provisional" |
| R3 | **Maestros mal cargados** al inicio (flota, motores, modelos) | Alta | Medio | Importador con validación y reporte de errores · creación inline · proceso de merge de duplicados |
| R4 | Fidelidad del PDF insuficiente frente al Word | Media | Alto | Prueba ciega como criterio de aceptación de F1 · presupuestar 1–2 semanas de ajuste fino |
| R5 | Costo de S3 y Atlas subestimado | Baja | Medio | Compresión obligatoria en cliente · ciclo de vida S3 · alertas de presupuesto en AWS |
| R6 | El worker de Chromium consume la RAM del VPS | Media | Medio | Servicio separado con límite de memoria · cola con concurrencia 1–2 · monitoreo |
| R7 | Alcance creciente (nuevas plantillas pedidas durante la construcción) | Alta | Medio | El editor de plantillas de F3 es precisamente la respuesta: Calidad crea plantillas sin desarrollo |
| R8 | Dependencia de Coolify (self-hosted) para disponibilidad | Media | Medio | Documentar el runbook de recuperación · imágenes en GHCR permiten redeploy en cualquier host · backups fuera del VPS |
| R9 | Pérdida de datos en sincronización offline | Baja | **Alto** | Idempotencia por `clientOpId` · cola append-only · nunca borrar local hasta confirmar servidor · pruebas específicas en F4 |

## 27. Decisiones abiertas

| ID | Decisión | Necesaria antes de | Responsable |
|---|---|---|---|
| D1 | **Rangos de tolerancia oficiales** por modelo de motor según manual MTU (juego axial de cigüeñal, muñones, coaxialidad, piñones intermedios) | F2 | Jefatura técnica |
| D2 | **Semántica del signo** en las mediciones de muñones (−0.01, −0.02): ¿desviación respecto al nominal, submedida o clase de rectificado? Define si se captura valor absoluto o desviación | F2 | Jefatura técnica |
| D3 | **Convención exacta de codificación** de `ITS-T-E-26-003-0898` y `LIM-TAL-000898`: qué significa cada segmento y quién asigna el correlativo | F1 | Calidad / Administración |
| D4 | **Alcance del anexo SER-T-FOR-002**: ¿checklist dentro del informe o adjunto? | F2 | Calidad |
| D5 | **Multi-empresa**: ¿la plataforma emitirá informes con logo y numeración de más de una razón social? | F0 (afecta el modelo) | Gerencia |
| D6 | **Tipo de firma**: imagen escaneada, firma dibujada en pantalla o firma digital con certificado (relevante si el informe respalda garantías) | F3 | Legal / Calidad |
| D7 | **Sistema de OT existente**: ¿hay un ERP del que deban leerse las órdenes de trabajo, o se crean en la plataforma? | F1 | TI |
| D8 | **Migración del histórico**: ¿se cargan los informes en Word anteriores? ¿Cuántos años? ¿Solo como PDF adjunto o con extracción de datos? | F5 | Gerencia |
| D9 | **Portal de cliente**: ¿se habilita acceso externo a SPCC, TASA, LAP? | F6 | Gerencia comercial |
| D10 | **Glosario controlado**: normalizar términos mixtos (housing, contragolpe, magnaflux) para la biblioteca de frases | F3 | Jefatura técnica |

## 28. Estrategia de migración y convivencia

| Etapa | Qué pasa con la PWA actual |
|---|---|
| Durante F0–F1 | Sigue siendo el sistema oficial. Nadie cambia nada. |
| Cierre de F1 | Piloto con 2–3 técnicos en la plataforma nueva. La PWA sigue disponible para el resto. |
| Cierre de F3 | La plataforma pasa a ser el sistema oficial para informes **nuevos**. La PWA queda en modo solo lectura. |
| Cierre de F4 | Se apaga la PWA. Antes, se exporta cualquier informe local pendiente. |
| F5 | Se decide (D8) si el histórico en Word se carga como adjunto indexado o se extraen sus datos. |

**Recomendación sobre el histórico:** cargar los PDF/DOCX existentes como adjuntos indexados asociados a su equipo y motor es barato y da valor inmediato (búsqueda y trazabilidad). Extraer sus mediciones a `measurementFacts` es caro y solo se justifica si el negocio quiere curvas de desgaste retroactivas — decidirlo con datos reales de esfuerzo tras F5.

---

## Anexo A — Trazabilidad: cada requisito y su origen

| Requisito | Origen |
|---|---|
| Centralización, seguridad, trazabilidad, integración | Deck slide 2 (Fase 4) |
| 7 capas de arquitectura | Deck slide 5 |
| 10 grupos de funcionalidades | Deck slide 6 |
| Infraestructura, almacenamiento, seguridad, respaldo, integraciones | Deck slide 7 |
| 4 roles y controles de seguridad | Deck slide 8 |
| 9 beneficios organizacionales | Deck slide 9 |
| Visión de gestión del conocimiento | Deck slide 10 |
| Estructura del informe (9 secciones) | DOCX OT746 y OT898 |
| Bloques de trabajo variables | Comparación OT746 vs OT898 |
| 10 tipos de tabla de medición | DOCX OT746 y OT898 |
| Dimensiones dependientes del motor (9 vs 11 apoyos) | DOCX OT746 vs OT898 |
| Nominales 189.000 vs 193.000 mm | DOCX OT746 vs OT898 |
| Necesidad de maestros | Typos reales en ambos DOCX |
| Formulario, wizard, tablas dinámicas | `Modulo IT.html` |
| Repuestos, instrumentos, parámetros ECU | `Modulo IT.html` |
| Exportación PDF/Word | `Modulo IT.html` + deck slide 3 |
| Offline y códigos automáticos | Deck slides 3 y 6 |

## Anexo B — Mapa de campos: DOCX → prototipo → plataforma

| Campo del informe | Hoy en `Modulo IT.html` | En la plataforma |
|---|---|---|
| N° de Informe | `f-ni` texto libre | Generado por `sequences` |
| N° O/T | `f-ot` texto libre | Referencia a `workOrders` |
| Ubicación/Locación | `f-ubic` texto libre | Referencia a `sites` |
| Motivo | no existe | Referencia a `serviceReasons` |
| Cliente | `f-cliente` texto libre | Referencia a `clients` |
| Elaborado por + Cargo | `f-tec1`, `f-tec2` (nombre y cargo juntos) | N referencias a `technicians`, cargo autocompletado |
| Equipo / Marca / Modelo | 3 campos de texto libre | Referencia a `equipments` con autocompletado en cascada |
| Motor Marca / Modelo / Serie | 3 campos de texto libre | Referencia a `engines` por número de serie |
| Potencia | `f-pot` texto libre | Derivado de `engineModels` |
| Horas totales/parciales | texto libre (`18, 760`) | Numérico con validación contra el informe anterior |
| Último mantenimiento | `f-ultmant` fecha | Referencia al informe anterior |
| Tipo de reparación | select de 3 opciones | Referencia a `interventionTypes` (QL4, W6, W6-1…) |
| Antecedentes | `f-ant` | Bloque `rich_text` |
| Parámetros ECU | siempre visible | Bloque `parameters_panel` **condicional** |
| Trabajos realizados | `WORK_TASKS[]` | Bloques `work_task` ordenables |
| **Tablas de medición** | **ausente** | **Módulo de mediciones (§12)** |
| Componentes tercerizados | ausente | Bloque `items_table` + `suppliers` |
| Repuestos | tabla dinámica libre | `items_table` + `spareParts` |
| Registro fotográfico | base64 en `localStorage` | S3 con 3 derivados + metadatos |
| Instrumentos | tabla dinámica libre | `items_table` + `instruments` con control de calibración |
| Conclusiones / Recomendaciones | 3 textareas | Bloques `bullet_list` + biblioteca de frases + veredictos |
| Firmas | ausente | Bloque `signature_block` + flujo de aprobación |

---

*Documento de especificación consolidado a partir de la presentación corporativa, dos informes técnicos reales y el prototipo funcional.*
