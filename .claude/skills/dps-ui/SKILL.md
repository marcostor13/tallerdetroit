---
name: dps-ui
description: Construir o revisar cualquier pantalla, componente o estilo del frontend Angular de la plataforma Detroit Power System. Úsalo SIEMPRE antes de escribir CSS, crear un componente visual, maquetar una vista o ajustar layout/colores/tipografía. Cubre tokens, light/dark, mobile-first, formularios accesibles y la grilla de mediciones.
---

# Construir UI de la plataforma DPS

## 1. Antes de escribir una línea

Lee `.claude/DESIGN-SYSTEM.md` completo si no lo tienes en contexto. Es normativo.

Luego responde estas tres preguntas **por escrito** antes de maquetar:

1. ¿Cuál es la acción primaria de esta pantalla? (solo una lleva botón `primary-container`)
2. ¿Qué datos de esta vista son técnicos? (van en JetBrains Mono con `tabular-nums`)
3. ¿Cómo se ve esto a 360 px? (se diseña primero el móvil, después se ensancha)

## 2. Estructura de un componente

```ts
@Component({
  selector: 'dps-report-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [/* solo lo que usa */],
  templateUrl: './report-header.html',
})
export class ReportHeaderComponent {
  readonly report = input.required<Report>();
  readonly save = output<void>();
  protected readonly isDirty = signal(false);
}
```

Reglas:
- Standalone siempre. `OnPush` siempre. `input()` / `output()` / `model()`, no decoradores viejos.
- Control flow `@if` / `@for` / `@switch`. Nada de `*ngIf` / `*ngFor`.
- Estado local con `signal`, derivado con `computed`, efectos solo cuando hay side-effect real.
- El editor de informes usa `NgRx SignalStore`, no signals sueltos.
- Un componente que solo pinta no habla con servicios: recibe `input()` y emite `output()`.

## 3. Estilos

**Prohibido**: cualquier valor de color, tamaño de fuente, radio o sombra escrito a mano.

```html
<!-- MAL -->
<div class="bg-[#ffffff] border border-[#e5e5e5] text-[#7A7A7A] rounded-[4px]">

<!-- BIEN -->
<div class="bg-surface-container-lowest border border-subtle text-secondary rounded">
```

- Los tokens funcionan en ambos temas por variables CSS: **no** añadas variantes `dark:` para color.
  La única excepción legítima es cambiar el `src` del logo.
- Espaciados: múltiplos de 8 (`p-2 p-3 p-4 p-6 p-8` = 8/12/16/24/32). El 12 solo para ajuste óptico.
- Sombra: únicamente en dropdown, popover, toast, modal y header con scroll. En nada más.

## 4. Formularios (lo más crítico del producto)

Plantilla mínima de un campo:

```html
<div class="flex flex-col gap-2">
  <label class="font-mono text-label-md uppercase text-secondary" [for]="id">
    {{ label }} @if (!required()) { <span class="normal-case">(opcional)</span> }
  </label>
  <input
    [id]="id"
    class="dps-input"
    [attr.aria-invalid]="hasError() || null"
    [attr.aria-describedby]="hasError() ? id + '-err' : null"
    [attr.aria-required]="required() || null"
    [attr.inputmode]="numeric() ? 'decimal' : null" />
  @if (hasError()) {
    <p [id]="id + '-err'" class="text-body-sm text-error flex items-center gap-1">
      <span class="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
      {{ errorMessage() }}
    </p>
  }
</div>
```

Checklist obligatorio por campo:
- [ ] `<label>` real asociado por `for`/`id`. El placeholder **no** es etiqueta.
- [ ] Placeholder = formato de ejemplo (`0.00 mm`), no instrucción.
- [ ] Mensaje de error dice **cómo corregir**, no solo qué falló.
- [ ] Numéricos: `inputmode="decimal"`, alineados a la derecha, `tabular-nums`.
- [ ] Alto ≥ 44 px.
- [ ] Al enviar con errores: resumen navegable arriba con `role="alert"` y enlaces a cada campo (UX-07).
- [ ] Autoguardado visible: `Guardado hace X` en `label-sm` (UX-01).

## 5. Móvil = app

- Cabecera fija 64 px + barra inferior fija 64 px con ≤ 5 destinos.
- `padding-bottom` del contenido ≥ 80 px + `env(safe-area-inset-bottom)`.
- Sub-navegación en *bottom sheet*, no en dropdown.
- Tabla de > 3 columnas → lista de cards. Excepción: grillas de medición (scroll con encabezado fijo).
- Objetivos táctiles ≥ 44 × 44 px con ≥ 8 px de separación.

## 6. Grilla de mediciones

Si tocas la grilla, además:
- Semáforo con **icono + color + `aria-label` textual**. El color nunca solo.
- Celdas calculadas (`Ovalidad`) no focusables, con candado y fondo `surface-container-low`.
- Teclado completo: `Tab`, flechas, `Enter` baja fila, `Ctrl+V` pega rango de Excel, `Esc` revierte.
- Encabezados sticky en ambos ejes.
- La validación de tolerancia que se muestra es un **espejo** de la del backend, nunca la única.

## 7. Antes de cerrar

Ejecuta el checklist de §10 de `.claude/DESIGN-SYSTEM.md`. Si algún punto falla, no está terminado.

Si el cambio es visual y relevante, lanza el agente `dps-design-reviewer` para auditarlo.
