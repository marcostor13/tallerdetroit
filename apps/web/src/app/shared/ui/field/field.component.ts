import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

let nextId = 0;

/**
 * Envoltorio de campo de formulario.
 *
 * Concentra aquí lo que §7.2 del sistema de diseño exige en TODOS los campos, para
 * que no dependa de que cada pantalla se acuerde:
 *  · `<label>` real asociado por `for`/`id` — el placeholder nunca hace de etiqueta
 *  · marca de opcional en vez de asterisco de obligatorio
 *  · mensaje de error debajo, enlazado por `aria-describedby`
 *  · texto de ayuda persistente
 *
 * El control se proyecta y recibe el id por `fieldId`:
 *
 *   <dps-field label="N° de serie" [error]="err()" #f>
 *     <input class="dps-input" [id]="f.fieldId" [attr.aria-invalid]="!!err() || null" />
 *   </dps-field>
 */
@Component({
  selector: 'dps-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="flex flex-col gap-2">
      <label
        [attr.for]="fieldId"
        class="font-mono text-label-md uppercase tracking-[0.05em] text-secondary"
      >
        {{ label() }}
        @if (!required()) {
          <span class="normal-case tracking-normal text-gray-medium">(opcional)</span>
        }
      </label>

      <ng-content />

      @if (error()) {
        <p
          [id]="errorId"
          class="flex items-start gap-1.5 text-body-sm text-error"
          role="alert"
        >
          <dps-icon name="error" [size]="16" class="mt-0.5 shrink-0" />
          <span>{{ error() }}</span>
        </p>
      } @else if (hint()) {
        <p [id]="hintId" class="text-body-sm text-secondary">{{ hint() }}</p>
      }
    </div>
  `,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly required = input(true);
  readonly hint = input('');
  /** Mensaje de error. Debe decir CÓMO corregir, no solo qué falló. */
  readonly error = input('');

  private readonly uid = `dps-f${nextId++}`;

  /** Id que el control proyectado debe usar. */
  readonly fieldId = this.uid;
  readonly errorId = `${this.uid}-err`;
  readonly hintId = `${this.uid}-hint`;

  /** Valor listo para `aria-describedby` del control proyectado. */
  readonly describedBy = computed(() =>
    this.error() ? this.errorId : this.hint() ? this.hintId : null,
  );
}
