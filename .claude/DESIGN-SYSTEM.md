# Sistema de diseño — "Industrial Precision" · Detroit Power System Perú

> **Este documento es normativo.** Toda pantalla, componente o estilo nuevo debe salir de aquí.
> Si algo no está definido, se deriva de los tokens; **nunca se inventan colores, tamaños ni radios ad-hoc**.
>
> Fuente original: `stitch_minimalist_white_ui_kit/industrial_precision/DESIGN.md` + los 8 prototipos HTML del kit.
> Este archivo **extiende** esa fuente con: paleta oscura, colores semánticos (semáforo de mediciones),
> correcciones de accesibilidad WCAG 2.1 AA y patrones de aplicación (no de landing page).

---

## 0. Reglas de oro (si solo lees una sección, lee esta)

1. **Blanco como material principal.** El aire es el recurso de diseño, no un espacio a rellenar. Ante la duda: menos elementos, más espacio.
2. **El rojo es un láser, no una pintura.** `primary-container` se reserva para la acción primaria de la pantalla, el estado crítico y el acento de marca. Si hay dos rojos compitiendo en una vista, uno sobra.
3. **Profundidad por tono y borde, nunca por sombra.** Solo los elementos flotantes (menús, popovers, toasts) llevan la *Technical Shadow*. Cards, paneles y tablas: `1px` de borde o cambio de superficie.
4. **Tres tipografías, tres trabajos.** Montserrat = títulos. Hanken Grotesk = prosa. JetBrains Mono = **todo dato técnico** (medidas, series, códigos, N/P, tolerancias, correlativos). Un número medido nunca va en Hanken.
5. **Rejilla de 8 px.** Todo espaciado, alto y offset es múltiplo de 8 (se admite 4 para ajustes ópticos internos).
6. **Radio 4 px por defecto.** Es un instrumento de precisión, no una app de consumo. Nada de píldoras salvo chips y el switch.
7. **Mobile first, y en móvil se comporta como app**: barra inferior de navegación, cabecera fija, gestos, objetivos táctiles ≥ 44 px.
8. **Light y dark son ciudadanos iguales.** Ninguna pantalla se diseña solo en claro. Ver §3.
9. **Accesibilidad AA no es opcional** (NFR-09). Ver §9 antes de elegir un gris.

---

## 1. Identidad de marca

### Activos

| Activo | Ruta | Uso |
|---|---|---|
| Logotipo completo (lockup) | `apps/web/public/brand/logo-detroit.png` · `@3x.png` | Login, cabecera desktop, PDF/DOCX, correos |
| Logotipo para fondo oscuro | `apps/web/public/brand/logo-detroit-dark.png` · `@3x.png` | Lo mismo, en tema oscuro |
| Isotipo vectorial (engranaje) | `apps/web/public/brand/isotipo.svg` | Favicon SVG, cabecera móvil, splash, marcas de agua |
| Isotipo raster 1024 | `apps/web/public/brand/isotipo-1024.png` | Origen de todos los iconos derivados |
| Favicons | `apps/web/public/favicon.ico` · `favicon.svg` · `favicon-{16,32,48,64}x{…}.png` | Navegador |
| Iconos PWA | `apps/web/public/icons/icon-{192,256,384,512}.png` | `manifest.webmanifest`, purpose `any` |
| Iconos maskable | `apps/web/public/icons/icon-maskable-{192,512}.png` | Android adaptive icons (zona segura 80%) |
| Apple touch icon | `apps/web/public/icons/apple-touch-icon-180.png` | iOS "Añadir a inicio" |

> El `isotipo.svg` es un **retrazado vectorial** del engranaje del logo original (14 dientes, corte
> diagonal a 15° de la vertical, doble barra diagonal). Es el único activo de marca escalable:
> úsalo siempre que el destino no sea de tamaño fijo.

### Colores exactos del logo

| | Hex | Uso |
|---|---|---|
| Rojo del engranaje | `#983128` | `--brand-red` · `theme_color` del manifest · marca de agua del PDF |
| Gris del engranaje | `#676669` | `--brand-gray` |
| Tinta del wordmark | `#231F20` | Solo dentro del logotipo |

> Ojo: el **rojo de marca** (`#983128`) y el **rojo de UI** (`primary-container` `#A32A26`) son
> distintos por diseño. El de marca solo aparece dentro de activos de marca; el de UI gobierna
> botones, estados y acentos. No los mezcles en el mismo componente.

### Área de protección y tamaños mínimos

- Lockup: margen libre ≥ altura del engranaje ÷ 2 en los cuatro lados. Ancho mínimo **120 px** (por debajo, usar isotipo).
- Isotipo: tamaño mínimo **20 px**.
- Nunca: rotar, deformar, recolorear, aplicar sombra, ni colocar sobre foto sin caja sólida detrás.

---

## 2. Paleta — tema claro

Tokens Material 3 tal como vienen del kit. **Se usan por nombre semántico, jamás por hex literal en un componente.**

### Superficies y texto

| Token | Hex | Uso |
|---|---|---|
| `surface` | `#F9F9F9` | Fondo de la aplicación |
| `surface-container-lowest` | `#FFFFFF` | Cards, paneles, filas de tabla, inputs |
| `surface-container-low` | `#F3F3F3` | Secciones "escenario", cabeceras de tabla, celdas de solo lectura |
| `surface-container` | `#EEEEEE` | Hover de fila, chips neutros, pistas de progreso |
| `surface-container-high` | `#E8E8E8` | Superficie activa/seleccionada |
| `surface-container-highest` | `#E2E2E2` | Estado presionado |
| `on-surface` | `#1A1C1C` | Texto principal — **17.1:1** sobre blanco |
| `on-surface-variant` | `#58413F` | Texto secundario cálido (etiquetas de spec) |
| `secondary` | `#5F5E5E` | **Texto secundario por defecto** — 6.5:1 sobre blanco |
| `gray-medium` | `#7A7A7A` | ⚠️ 4.3:1 — **solo texto ≥ 24 px o ≥ 18.7 px bold**, o decorativo |
| `inverse-surface` | `#2F3131` | Bandas oscuras, tooltips, snackbars |
| `inverse-on-surface` | `#F1F1F1` | Texto sobre `inverse-surface` |

### Bordes

| Token | Hex | Contraste vs blanco | Uso |
|---|---|---|---|
| `border-subtle` | `#E5E5E5` | 1.26:1 | **Solo decorativo**: divisores, borde de card, líneas guía. Nunca como único límite de un control interactivo |
| `outline` | `#8C716E` | 4.47:1 | **Borde de controles interactivos**: inputs, selects, checkboxes, celdas de grilla editables |
| `outline-variant` | `#E0BFBB` | — | Divisores cálidos dentro de bloques de marca |

### Marca y acentos

| Token | Hex | Uso |
|---|---|---|
| `primary` | `#821012` | Texto/icono de marca sobre claro (10.3:1) · hover del botón primario |
| `primary-container` | `#A32A26` | **Relleno del botón primario**, acento activo, barras de dato (7.2:1 con blanco) |
| `on-primary` / `on-primary-container` | `#FFFFFF` / `#FFBEB7` | Texto sobre los anteriores |
| `primary-fixed` / `primary-fixed-dim` | `#FFDAD6` / `#FFB4AC` | Fondos suaves de alerta de marca |
| `secondary-container` | `#E4E2E1` | Chips y botones terciarios |
| `tertiary` | `#00465B` | Información neutra no crítica (10.4:1) |
| `tertiary-container` | `#005F7A` | Badges informativos |
| `error` | `#BA1A1A` | Errores de validación (6.5:1) |
| `error-container` / `on-error-container` | `#FFDAD6` / `#93000A` | Fondo de mensaje de error (7.2:1) |

### Semánticos añadidos (no venían en el kit)

Necesarios para el **semáforo de mediciones** (§12.4 de la especificación) y los estados del informe.

| Token | Claro | `on-` | Container | `on-container` |
|---|---|---|---|---|
| `success` (dentro de tolerancia 🟢) | `#146B3A` | `#FFFFFF` | `#A8F0C1` | `#00210F` |
| `warning` (10% superior del rango 🟡) | `#8A5300` | `#FFFFFF` | `#FFDDB3` | `#2C1700` |
| `danger` (fuera de tolerancia 🔴) | `#BA1A1A` (= `error`) | `#FFFFFF` | `#FFDAD6` | `#93000A` |

Contrastes verificados: 6.6:1 · 6.3:1 · 6.5:1 sobre blanco; 13.0:1 · 13.2:1 · 7.2:1 en variante *container*.

---

## 3. Paleta — tema oscuro

Derivada de los tonos `*-fixed` / `inverse-*` del kit siguiendo Material 3. **Nunca es un simple `invert`.**

| Token | Oscuro | Contraste vs `surface` |
|---|---|---|
| `surface` | `#131313` | — |
| `surface-container-lowest` | `#0E0E0E` | — |
| `surface-container-low` | `#1B1C1C` | — |
| `surface-container` | `#1F2020` | — |
| `surface-container-high` | `#2A2A2A` | — |
| `surface-container-highest` | `#353535` | — |
| `on-surface` | `#E2E2E2` | **14.3:1** |
| `on-surface-variant` / `secondary` | `#C8C6C6` | 10.9:1 |
| `outline` (bordes interactivos) | `#929090` | 5.9:1 |
| `outline-variant` (decorativo) | `#474747` | 2.0:1 |
| `inverse-surface` / `inverse-on-surface` | `#E2E2E2` / `#2F3131` | — |
| `primary` | `#FFB4AC` | 11.0:1 |
| `on-primary` | `#690005` | 7.7:1 sobre `primary` |
| `primary-container` | `#8B1818` | — |
| `on-primary-container` | `#FFDAD6` | 7.3:1 sobre su container |
| `tertiary` / `on-tertiary` | `#8BD0EF` / `#00364A` | 10.9:1 |
| `tertiary-container` / `on-` | `#004D64` / `#BDE9FF` | — |
| `error` / `on-error` | `#FFB4AB` / `#690005` | 10.9:1 |
| `error-container` / `on-` | `#93000A` / `#FFDAD6` | 7.2:1 |
| `success` / `on-` / container / `on-` | `#8CD9A8` / `#003919` / `#005226` / `#A8F0C1` | 11.2:1 · 7.1:1 |
| `warning` / `on-` / container / `on-` | `#FFB95C` / `#492900` / `#683C00` / `#FFDDB3` | 10.9:1 · 7.3:1 |
| `border-subtle` (decorativo) | `#2E2E2E` | — |

**Reglas específicas de dark:**

- El botón primario en oscuro usa `primary-container #8B1818` con texto `#FFDAD6`; **no** el rojo claro `#FFB4AC` de fondo (deslumbra).
- Nunca blanco puro (`#FFFFFF`) como texto: usar `on-surface #E2E2E2`.
- Nunca negro puro (`#000000`) como fondo: usar `surface #131313`.
- Las fotos del informe se muestran sobre `surface-container-lowest #0E0E0E` con borde `outline-variant`, sin filtro ni atenuación (son evidencia técnica: jamás alterar su apariencia).
- El logotipo cambia a `logo-detroit-dark.png`.

### Implementación del tema

Requisito de `especificaciones.md`: **auto según el navegador + switch en el header.**

```
Orden de precedencia:   localStorage('dps-theme')  →  prefers-color-scheme  →  'light'
Valores del switch:     'light' | 'dark' | 'system'   (tri-estado, por defecto 'system')
```

- Los tokens viven como **CSS custom properties** en `:root` y se sobrescriben en `:root[data-theme="dark"]`.
- El bloque `@media (prefers-color-scheme: dark)` aplica cuando `data-theme="system"`.
- El atributo `data-theme` lo estampa un **script inline en `index.html` antes de pintar**, para no producir *flash* de tema claro.
- `<meta name="theme-color">` se actualiza en caliente: `#F9F9F9` en claro, `#131313` en oscuro.
- Persistencia por usuario en `users.preferencias.tema` cuando hay sesión; `localStorage` como caché local.

---

## 4. Tipografía

Fuentes **autoalojadas** (`apps/web/public/fonts/`), nunca desde Google Fonts CDN — la PWA debe funcionar offline (§18 de la especificación). Formato `woff2`, `font-display: swap`, subconjunto `latin` + `latin-ext`.

| Rol | Familia | Pesos |
|---|---|---|
| Titulares | **Montserrat** | 600, 700, 900 |
| Cuerpo | **Hanken Grotesk** | 400, 500, 600 |
| Datos técnicos | **JetBrains Mono** | 500, 700 |

### Escala

| Token | Familia | px / line-height | Tracking | Uso |
|---|---|---|---|---|
| `headline-xl` | Montserrat 700 | 64 / 72 | −0.02em | Hero de landing (solo público) |
| `headline-lg` | Montserrat 700 | 40 / 48 | −0.01em | Título de página en desktop |
| `headline-lg-mobile` | Montserrat 700 | 32 / 40 | — | Título de página en móvil |
| `headline-md` | Montserrat 600 | 24 / 32 | — | Título de card, sección, modal |
| `title-sm` *(añadido)* | Montserrat 600 | 18 / 24 | — | Título de bloque dentro del editor |
| `body-lg` | Hanken Grotesk 400 | 18 / 28 | — | Texto introductorio |
| `body-md` | Hanken Grotesk 400 | 16 / 24 | — | **Cuerpo por defecto** y valor de input |
| `body-sm` *(añadido)* | Hanken Grotesk 400 | 14 / 20 | — | Texto de apoyo, ayuda de campo |
| `label-md` | JetBrains Mono 500 | 14 / 20 | 0.05em | **Etiquetas de formulario**, encabezados de columna |
| `label-sm` | JetBrains Mono 500 | 12 / 16 | 0.1em | Metadatos, códigos, `Fig.NN`, timestamps |
| `data-md` *(añadido)* | JetBrains Mono 500 | 16 / 24 | 0 | **Valores medidos y numéricos en grillas** |

### Reglas

- Etiquetas de formulario y encabezados de tabla: `label-md` **en MAYÚSCULAS**.
- Botones: Montserrat 600, MAYÚSCULAS, tracking `0.05em`.
- **Todo número que se compara, mide o identifica va en JetBrains Mono** con `font-variant-numeric: tabular-nums`. Aplica a: mediciones, tolerancias, N° de informe, N° de OT, N° de serie, horas de motor, N/P de repuesto, códigos de instrumento.
- Longitud de línea de prosa: máximo **75 caracteres** (`max-w-[68ch]`).
- Nunca justificar texto en pantalla (sí en el PDF, que replica el Word).

---

## 5. Layout y espaciado

| Token | Valor |
|---|---|
| `base` | 8 px (unidad de la rejilla) |
| `gutter` | 24 px (canaleta desktop / padding lateral) |
| `margin-mobile` | 20 px (padding lateral móvil) |
| `container-max` | 1280 px |
| `section-gap` | 120 px — **solo en páginas públicas**. Dentro de la app: 48 px (desktop) / 32 px (móvil) |

### Breakpoints y rejilla

| | Ancho | Columnas | Comportamiento |
|---|---|---|---|
| `base` (móvil) | < 640 px | 4 | Una columna. Nav inferior. Cabecera fija. |
| `sm` | ≥ 640 px | 4 | Cards en 2 columnas |
| `md` (tablet) | ≥ 768 px | 8 | Aparece el rail lateral colapsado |
| `lg` (desktop) | ≥ 1024 px | 12 | Sidebar expandido, editor a 2 paneles |
| `xl` | ≥ 1280 px | 12 | Ancho máximo alcanzado, se centra |

### Densidad

La app tiene dos densidades y **se elige por contexto, no por preferencia**:

- **Cómoda** (por defecto): formularios, wizard, lectura. Alto de fila 48 px.
- **Compacta**: grillas de medición, bandeja de informes, maestros. Alto de fila 36 px, padding 8 px.

---

## 6. Forma, elevación y movimiento

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` | 2 px | Chips, badges, celdas |
| `rounded` (DEFAULT) | **4 px** | Botones, inputs, cards pequeñas |
| `rounded-lg` | 8 px | Contenedores principales, módulos de imagen |
| `rounded-xl` | 12 px | Hojas modales (bottom sheets) |
| `rounded-full` | 9999 px | Solo avatar, switch de tema y chip de estado de conexión |

**Elevación — un solo nivel:**

```css
--shadow-technical: 0 4px 20px rgba(0, 0, 0, 0.05);   /* claro */
--shadow-technical-dark: 0 4px 20px rgba(0, 0, 0, 0.45); /* oscuro */
```

Se aplica **únicamente** a: dropdowns, popovers, menús contextuales, toasts, modales y la cabecera al hacer scroll. Cards, paneles y tablas nunca llevan sombra.

**Movimiento:** 150 ms para feedback táctil (`active:scale-95`), 200 ms para color/borde, 250 ms para entrada de paneles. Curva `cubic-bezier(0.2, 0, 0, 1)`. Todo bajo `@media (prefers-reduced-motion: reduce) { transition: none }`.

---

## 7. Componentes

### 7.1 Botones

| Variante | Claro | Oscuro |
|---|---|---|
| **Primario** | fondo `primary-container` · texto blanco · hover `primary` | fondo `primary-container #8B1818` · texto `#FFDAD6` · hover `#A32A26` |
| **Secundario** | borde 1px `on-surface` · sin relleno · hover fondo `surface-container` | borde 1px `on-surface` · hover `surface-container-high` |
| **Terciario / texto** | texto `primary` · hover fondo `surface-container` | texto `primary #FFB4AC` |
| **Destructivo** | fondo `error` · texto blanco | fondo `error-container` · texto `on-error-container` |

- Alturas: `sm` 36 px · `md` **44 px (por defecto)** · `lg` 56 px (CTA de ancho completo en móvil).
- Texto Montserrat 600 MAYÚSCULAS, radio 4 px, padding horizontal 32 px.
- Estado de carga: spinner + el texto se mantiene (no colapsa el ancho).
- **Objetivo táctil mínimo 44 × 44 px**, incluso si el botón se ve más pequeño.

### 7.2 Campos de formulario

Es el componente más crítico del producto: un informe son cientos de campos.

```
┌ ETIQUETA EN MONO MAYÚSCULAS ─────────────────  (label-md, color secondary)
│ ┌──────────────────────────────────────────┐
│ │ valor                                    │   borde 1px outline, radio 4, alto 44
│ └──────────────────────────────────────────┘
└ texto de ayuda o error                        (body-sm)
```

| Estado | Borde | Otros |
|---|---|---|
| Reposo | `outline` (`#8C716E` / dark `#929090`) | fondo `surface-container-lowest` |
| Hover | `on-surface` | — |
| Foco | `on-surface` + **anillo de 2 px `primary-container`** con 2 px de separación | `outline: none` propio del navegador desactivado, reemplazado |
| Error | `error` 2 px | mensaje con icono, `aria-invalid="true"`, `aria-describedby` |
| Éxito | `success` 1px | check discreto a la derecha (solo tras validación asíncrona) |
| Deshabilitado | `border-subtle` | fondo `surface-container-low`, texto `gray-medium`, `cursor: not-allowed` |
| Solo lectura / calculado | sin borde | fondo `surface-container-low`, texto mono, icono de candado |

**Obligatorio en todos los campos:**

- `<label>` real asociado por `for`/`id` — nunca un placeholder como etiqueta.
- El placeholder muestra **formato de ejemplo**, no la instrucción (`0.00 mm`, no `Ingrese la medida`).
- Error **debajo** del campo, con texto que dice cómo corregir, no solo qué falló.
- Campos numéricos: `inputmode="decimal"`, alineación derecha, `tabular-nums`.
- Los campos obligatorios se marcan; los opcionales se etiquetan `(opcional)` cuando la mayoría es obligatoria.
- Autoguardado: indicador `Guardado hace X` en `label-sm` junto al título del paso (UX-01).

### 7.3 Grilla de mediciones (componente insignia)

| Elemento | Especificación |
|---|---|
| Encabezados | `label-sm` MAYÚSCULAS, fondo `surface-container-low`, sticky en ambos ejes |
| Celda editable | 88 × 36 px, `data-md`, alineación derecha, borde `outline` de 1px |
| Celda calculada | fondo `surface-container-low`, no focusable, icono candado 12 px |
| 🟢 dentro de tolerancia | borde izquierdo 3 px `success` + fondo `success-container` al 24% |
| 🟡 alerta (10% superior) | borde izquierdo 3 px `warning` + fondo `warning-container` al 24% |
| 🔴 fuera de tolerancia | borde izquierdo 3 px `danger` + fondo `error-container` al 32% + icono ⚠ |
| Fila de referencia | nominal y tolerancia visibles arriba, en `label-sm` |

**El color nunca es el único portador de significado** (WCAG 1.4.1): cada estado lleva además icono
(`check_circle` / `warning` / `error`) y el `aria-label` de la celda incluye el veredicto en texto.

Teclado (§12.4.5 — se capturan 40–80 valores seguidos, sin mouse):

| Tecla | Acción |
|---|---|
| `Tab` / `Shift+Tab` | Celda siguiente / anterior en orden de lectura |
| `↑ ↓ ← →` | Movimiento por la matriz |
| `Enter` | Baja una fila (misma columna) |
| `Ctrl+V` | Pega un rango desde Excel y lo distribuye desde la celda activa |
| `Esc` | Revierte la edición de la celda |

### 7.4 Cards y paneles

- Fondo `surface-container-lowest`, borde 1px `border-subtle`, radio 4 px, **sin sombra**.
- El efecto "escenario" se logra colocando la card sobre `surface-container-low`, no con sombra.
- Cabecera de card: icono `primary` 24 px + `headline-md` + divisor de 1px `border-subtle`.
- Card interactiva (enlace): hover cambia fondo a `surface-container-low` y el título a `primary-container`. Sin `translateY`.

### 7.5 Tablas y listas de datos

- Encabezado: `label-md` MAYÚSCULAS sobre `surface-container-low`, sticky.
- Filas alternas: **no** usar cebra. Separar con 1px `border-subtle`.
- Hover de fila: fondo `surface-container`.
- Columnas numéricas alineadas a la derecha en JetBrains Mono.
- **Lista de especificaciones técnicas**: usar líder punteado entre atributo y valor (evoca el manual de ingeniería).
  ```css
  .spec-row { display:flex; justify-content:space-between; padding:12px 0;
              border-bottom:1px dotted var(--border-subtle); }
  ```
- En móvil, las tablas de más de 3 columnas se convierten en **lista de cards**, no en scroll horizontal — salvo las grillas de medición, que sí hacen scroll con encabezado fijo.

### 7.6 Chips, badges y estados del informe

Fondo `surface-container-low`, borde 1px `border-subtle`, texto `label-sm` MAYÚSCULAS, radio 2 px.

| Estado del informe | Color | Icono |
|---|---|---|
| `borrador` | `secondary-container` / `on-surface` | `edit_note` |
| `en_revision` | `tertiary-container` / `on-tertiary-container` | `hourglass_top` |
| `observado` | `warning-container` / `on-warning-container` | `error_outline` |
| `aprobado` | `success-container` / `on-success-container` | `verified` |
| `emitido` | `primary-container` / blanco | `lock` |
| `anulado` | `surface-container-high` / `gray-medium` + tachado | `block` |

### 7.7 Navegación

**Móvil (< 768 px) — se comporta como app nativa:**
- Cabecera fija 64 px: isotipo + título de la vista + acción contextual. Fondo `surface`, borde inferior `border-subtle`.
- **Barra inferior fija** 64 px, 5 destinos máximo: Inicio · Informes · Nuevo · Equipos · Perfil.
  Activo en `primary` con icono relleno (`FILL 1`); inactivo `secondary`.
- `padding-bottom` del contenido ≥ 80 px + `env(safe-area-inset-bottom)`.
- Sub-navegación por *bottom sheet*, no por menús desplegables.
- Retroceso por gesto y por botón físico deben salir del flujo sin perder el borrador.

**Desktop (≥ 1024 px):**
- Sidebar fijo de 264 px (colapsable a 72 px), fondo `surface-container-low`, ítem activo con barra izquierda de 3 px `primary-container`.
- Cabecera de 64 px: breadcrumb + buscador global + estado de conexión + switch de tema + avatar.

### 7.8 Switch de tema (header)

Control de 3 estados en un solo botón segmentado: `Claro | Auto | Oscuro`, iconos `light_mode` / `brightness_auto` / `dark_mode`.
Implementado como `role="radiogroup"` con `aria-label="Tema de la interfaz"`. En móvil vive en Perfil, no en la cabecera.

### 7.9 Retroalimentación

| Patrón | Uso |
|---|---|
| **Toast** (abajo derecha desktop / arriba móvil) | Confirmaciones no bloqueantes. 4 s. Con acción "Deshacer" cuando aplica |
| **Banner** en cabecera de la vista | Estado persistente: sin conexión, informe observado, calibración vencida |
| **Modal** | Solo decisiones destructivas o irreversibles. Verbo explícito en el botón ("Anular informe", nunca "Aceptar") |
| **Panel de validación** | Lista de campos faltantes **navegables por clic** (UX-07), nunca un alert genérico |
| **Skeleton** | Carga de listas y cards. Nunca spinner de página completa salvo en el arranque |
| **Estado vacío** | Ilustración de línea + qué es + botón de la acción principal |

### 7.10 Chip de conexión (PWA)

Siempre visible: `● En línea` (texto `success`) / `● Sin conexión — 3 cambios pendientes` (fondo `warning-container`). Radio completo, `label-sm`. Al pulsarlo abre el detalle de la cola de sincronización.

### 7.11 Iconografía

**Material Symbols Outlined**, autoalojado. `FILL 0, wght 400, GRAD 0, opsz 24` por defecto; `FILL 1` marca el estado activo en la navegación. Tamaños 20 / 24 / 32 / 40 px. Todo icono sin texto acompañante necesita `aria-label`; los decorativos llevan `aria-hidden="true"`.

---

## 8. Documentos generados (PDF / DOCX)

El documento **no** usa el tema oscuro ni el layout de la app: replica el formato controlado SER-FOR-002.

- Papel A4, márgenes 25 mm, siempre fondo blanco.
- Cabecera: `logo-detroit.png` a la izquierda + código, versión y fecha leídos de `templateVersions`.
- Títulos de sección en Montserrat 600 MAYÚSCULAS con regla inferior `#231F20`.
- Cuerpo en Hanken Grotesk 11 pt justificado.
- Tablas de medición en JetBrains Mono 9 pt, `tabular-nums`, valores fuera de tolerancia en **negrita** (no solo en rojo — el informe puede imprimirse en blanco y negro).
- Marca de agua diagonal "BORRADOR" en `#983128` al 8% mientras el informe no esté aprobado.
- Pie: `Fig.NN`, paginación `X de Y`, hash SHA-256 abreviado y QR de verificación.

---

## 9. Accesibilidad (WCAG 2.1 AA — NFR-09)

**Verificado y obligatorio:**

1. Texto normal ≥ **4.5:1**; texto grande y componentes de UI ≥ **3:1**.
   - ⚠️ `gray-medium #7A7A7A` da 4.3:1 → **no usar para texto pequeño**. Usar `secondary #5F5E5E` (6.5:1).
   - ⚠️ `border-subtle #E5E5E5` da 1.26:1 → **no puede ser el único límite visible de un control interactivo**. Los inputs usan `outline`.
2. **Foco siempre visible**: anillo de 2 px `primary-container` (claro) / `primary` (oscuro), con 2 px de separación. Nunca `outline: none` sin reemplazo.
3. **Todo operable por teclado**, incluido el drag & drop de bloques (alternativa: botones "Subir/Bajar" + `aria-live` que anuncia la nueva posición).
4. **El color nunca es el único canal**: el semáforo lleva icono y texto; los estados llevan etiqueta.
5. Objetivos táctiles ≥ 44 × 44 px con ≥ 8 px de separación.
6. Jerarquía de encabezados sin saltos; una sola `<h1>` por vista; *landmarks* `header`/`nav`/`main`/`footer`.
7. Formularios: `aria-invalid`, `aria-describedby`, `aria-required`; resumen de errores al inicio con enlaces al campo; `role="alert"` en el resumen.
8. Zoom hasta 200 % sin scroll horizontal ni pérdida de contenido.
9. `prefers-reduced-motion` respetado en toda animación.
10. `lang="es-PE"` en `<html>`; textos en español de Perú, arquitectura i18n-ready.

---

## 10. Implementación técnica

### Estructura de tokens

```
apps/web/src/styles/
├── _tokens.css      variables CSS: :root (claro) + :root[data-theme="dark"]
├── _typography.css  @font-face autoalojado + clases de escala
├── _base.css        reset, focus-visible, scrollbars, safe-area
└── styles.css       punto de entrada
```

- Tailwind lee los tokens desde las variables CSS (`colors: { primary: 'var(--primary)' }`), de forma que **un solo juego de clases sirve para ambos temas**. No se usan variantes `dark:` para color salvo casos puntuales (p. ej. cambiar el `src` del logo).
- `darkMode: ['selector', '[data-theme="dark"]']`.
- Los tokens compartidos con el backend (colores de estado, semáforo) viven en `libs/shared/src/design/tokens.ts` para que el render del PDF use exactamente los mismos valores.

### Checklist antes de dar por terminada una pantalla

- [ ] Se ve correcta en claro **y** en oscuro
- [ ] Funciona a 360 px de ancho y a 1920 px
- [ ] Ningún hex literal en el componente: todo por token
- [ ] Recorrido completo con `Tab` con foco siempre visible
- [ ] Todo dato técnico en JetBrains Mono con `tabular-nums`
- [ ] Estados de carga, vacío y error resueltos (no solo el camino feliz)
- [ ] Espaciados múltiplos de 8
- [ ] Objetivos táctiles ≥ 44 px
- [ ] Sin sombras fuera de los elementos flotantes
- [ ] Textos en español de Perú, sin cadenas hardcodeadas fuera del archivo de i18n
