import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  MEASUREMENT_TEMPLATES,
  claveDeCelda,
  findMeasurementTemplate,
  type AppliedSpec,
  type EngineGridDimensions,
  type MeasurementTemplate,
  type ValoresCapturados,
} from '@dps/shared';
import type { GrillaGuardada } from '../../core/api/reports.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { GrillaMedicionComponent } from './grilla-medicion.component';

/** Lo que se manda al servidor cuando cambia una grilla. */
export interface CapturaDeGrilla {
  readonly plantilla: string;
  readonly valores: Record<string, number | null>;
  readonly justificacion?: string | null;
}

/**
 * Espera tras la última tecla antes de mandar la grilla.
 *
 * Más corta que el autoguardado del wizard (20 s) y más larga que una pulsación:
 * el técnico teclea treinta valores seguidos y lo que no puede pasar es una
 * petición por celda. Con esto, una captura completa del túnel de bancada son
 * una o dos peticiones, no treinta y tres.
 */
const ESPERA_TRAS_TECLEAR = 1_200;

/**
 * Tablas dimensionales de un bloque de trabajo (E2.3 + E2.4).
 *
 * Es lo que convierte a F2 en algo que un técnico puede usar: hasta aquí la
 * grilla existía y el backend sabía validarla, pero no había forma de capturar
 * una medición dentro de un informe.
 *
 * Tres cosas se deciden aquí:
 *
 * · **Las columnas no se configuran.** Salen del motor del informe (§12.2). Si
 *   el informe no tiene el motor resuelto no se ofrece ninguna grilla, porque
 *   una tabla con un número de columnas inventado es peor que ninguna tabla.
 *
 * · **El semáforo que se ve mientras se teclea es un espejo.** Se calcula en el
 *   cliente con las mismas funciones de `libs/shared` para que la respuesta sea
 *   inmediata, pero lo que queda guardado lo evalúa el servidor. Por eso la
 *   tolerancia con la que pinta el espejo es la que devolvió el servidor en el
 *   último guardado, no una que el cliente adivine.
 *
 * · **La justificación es del supervisor, pero se escribe aquí** (RN-03). Un
 *   valor fuera de tolerancia no impide medir: impide emitir sin explicar.
 */
@Component({
  selector: 'dps-mediciones-bloque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FieldComponent, GrillaMedicionComponent],
  template: `
    <section class="flex flex-col gap-5" aria-labelledby="dps-mediciones-titulo">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="dps-mediciones-titulo" class="text-title-sm">Tablas dimensionales</h4>
        @if (dimensiones(); as motor) {
          <p class="font-mono text-label-sm text-secondary">
            {{ motor.cilindros }} cilindros · {{ motor.apoyosBancada }} apoyos
          </p>
        }
      </div>

      @if (!dimensiones()) {
        <!--
          Mismo mensaje que da el backend, y por la misma razón: sin el modelo
          del motor no se sabe cuántas columnas pide la grilla.
        -->
        <p class="flex items-start gap-2 text-body-sm text-secondary" role="status">
          <dps-icon name="info" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
          Este informe todavía no tiene el motor resuelto. Elige el motor por su número de serie en
          el paso de identificación y aquí aparecerán las tablas con sus columnas.
        </p>
      } @else {
        @for (grilla of grillas(); track grilla.plantilla) {
          @if (plantillaDe(grilla.plantilla); as plantilla) {
            <div class="flex flex-col gap-3 rounded-lg border border-subtle p-3">
              <dps-grilla-medicion
                [plantilla]="plantilla"
                [motor]="dimensiones()!"
                [valores]="valoresDe(grilla)"
                [especificacion]="especificacionDe(grilla)"
                [soloLectura]="soloLectura()"
                (cambio)="alCambiar(grilla.plantilla, $event)"
              />

              <!--
                RN-03. Aparece solo cuando hace falta y dice qué pasa si no se
                rellena: un aviso que no explica la consecuencia se ignora.
              -->
              @if ((grilla.resumen.fueraTolerancia ?? 0) > 0) {
                <dps-field
                  label="Justificación de los valores fuera de tolerancia"
                  [hint]="
                    'Sin esto el informe no se puede emitir (RN-03). Explica por qué se acepta: por ejemplo, que la pieza se rectifica o se reemplaza.'
                  "
                  [error]="grilla.justificacion ? '' : 'Falta justificar para poder emitir.'"
                  #fJustifica
                >
                  <textarea
                    class="dps-input min-h-20 resize-y py-2"
                    [id]="fJustifica.fieldId"
                    [disabled]="soloLectura()"
                    [value]="grilla.justificacion ?? ''"
                    (change)="alJustificar(grilla.plantilla, $event)"
                  ></textarea>
                </dps-field>
              }

              <div class="flex items-center justify-between gap-3">
                <p class="font-mono text-label-sm text-secondary" role="status" aria-live="polite">
                  @if (pendientes().includes(grilla.plantilla)) {
                    Sin guardar
                  } @else {
                    Guardado
                  }
                </p>

                @if (!soloLectura()) {
                  <button
                    type="button"
                    class="dps-btn dps-btn--tertiary text-error"
                    (click)="quitar.emit(grilla.plantilla)"
                  >
                    <dps-icon name="delete" [size]="18" aria-hidden="true" />
                    Quitar «{{ grilla.nombre }}»
                  </button>
                }
              </div>
            </div>
          }
        }

        @if (!soloLectura() && disponibles().length) {
          <div class="flex flex-wrap items-end gap-3">
            <dps-field label="Añadir tabla dimensional" [required]="false" #fNueva>
              <select
                class="dps-input"
                [id]="fNueva.fieldId"
                [value]="elegida()"
                (change)="elegir($event)"
              >
                @for (t of disponibles(); track t.codigo) {
                  <option [value]="t.codigo">{{ t.nombre }}</option>
                }
              </select>
            </dps-field>

            <button type="button" class="dps-btn dps-btn--secondary" (click)="anadir()">
              <dps-icon name="add" [size]="18" aria-hidden="true" />
              Añadir
            </button>
          </div>
        } @else if (!soloLectura()) {
          <p class="text-body-sm text-secondary">
            Este bloque ya tiene las diez tablas dimensionales del formato.
          </p>
        }
      }
    </section>
  `,
})
export class MedicionesBloqueComponent {
  readonly grillas = input<readonly GrillaGuardada[]>([]);
  /** El motor denormalizado del informe. De él salen las columnas (§12.2). */
  readonly motor = input<Record<string, unknown>>({});
  readonly soloLectura = input(false);

  readonly guardar = output<CapturaDeGrilla>();
  readonly quitar = output<string>();

  protected readonly elegida = signal<string>('');
  /** Grillas con cambios todavía sin mandar al servidor. */
  protected readonly pendientes = signal<readonly string[]>([]);

  /**
   * Lo tecleado desde la última carga, por plantilla.
   *
   * Se mantiene aparte de lo que devuelve el servidor porque las dos cosas
   * conviven: mientras una petición está en vuelo el técnico sigue capturando,
   * y pintar la respuesta a secas le borraría de la pantalla los valores que
   * acaba de escribir.
   */
  private readonly borrador = signal<Record<string, ValoresCapturados>>({});

  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

  protected readonly dimensiones = computed<EngineGridDimensions | null>(() => {
    const motor = this.motor();
    const cilindros = Number(motor['cilindros']);
    const apoyosBancada = Number(motor['apoyosBancada']);
    if (!cilindros || !apoyosBancada) return null;
    return { cilindros, apoyosBancada, bancos: Number(motor['bancos']) || 2 };
  });

  /** Plantillas que este bloque todavía no tiene. */
  protected readonly disponibles = computed<readonly MeasurementTemplate[]>(() => {
    const puestas = new Set(this.grillas().map((g) => g.plantilla));
    return MEASUREMENT_TEMPLATES.filter((t) => !puestas.has(t.codigo));
  });

  protected plantillaDe(codigo: string): MeasurementTemplate | null {
    return findMeasurementTemplate(codigo) ?? null;
  }

  /**
   * Valores con los que se pinta la grilla.
   *
   * Manda el borrador local si lo hay; si no, lo que vino del servidor. Las
   * calculadas no se siembran: las deriva la propia grilla.
   */
  protected valoresDe(grilla: GrillaGuardada): ValoresCapturados {
    const local = this.borrador()[grilla.plantilla];
    if (local) return local;

    const valores: Record<string, number | null> = {};
    for (const celda of grilla.valores) {
      if (celda.calculado) continue;
      valores[claveDeCelda(celda.fila, celda.columna)] = celda.valor;
    }
    return valores;
  }

  /** La tolerancia con la que evalúa el espejo: la que congeló el servidor. */
  protected especificacionDe(grilla: GrillaGuardada): AppliedSpec | null {
    return grilla.especificacion ?? null;
  }

  protected elegir(evento: Event): void {
    this.elegida.set((evento.target as HTMLSelectElement).value);
  }

  protected anadir(): void {
    const codigo = this.elegida() || this.disponibles()[0]?.codigo;
    if (!codigo) return;

    // Se crea vacía a propósito: el servidor resuelve columnas y tolerancia y
    // las devuelve, de forma que el semáforo del espejo ya tiene contra qué
    // comparar desde la primera tecla.
    this.guardar.emit({ plantilla: codigo, valores: {} });
    this.elegida.set('');
  }

  protected alCambiar(plantilla: string, cambios: Record<string, number | null>): void {
    const grilla = this.grillas().find((g) => g.plantilla === plantilla);
    if (!grilla) return;

    const base = this.borrador()[plantilla] ?? this.valoresDe(grilla);
    this.borrador.update((b) => ({ ...b, [plantilla]: { ...base, ...cambios } }));
    this.marcar(plantilla, true);

    const anterior = this.temporizadores.get(plantilla);
    if (anterior) clearTimeout(anterior);
    this.temporizadores.set(
      plantilla,
      setTimeout(() => this.mandar(plantilla), ESPERA_TRAS_TECLEAR),
    );
  }

  protected alJustificar(plantilla: string, evento: Event): void {
    const justificacion = (evento.target as HTMLTextAreaElement).value;
    const grilla = this.grillas().find((g) => g.plantilla === plantilla);
    if (!grilla) return;

    this.guardar.emit({
      plantilla,
      valores: { ...this.valoresDe(grilla) },
      justificacion,
    });
  }

  /** Manda lo pendiente de una grilla. Lo llama el temporizador y el destructor. */
  private mandar(plantilla: string): void {
    const valores = this.borrador()[plantilla];
    if (!valores) return;

    const grilla = this.grillas().find((g) => g.plantilla === plantilla);

    this.marcar(plantilla, false);

    this.guardar.emit({
      plantilla,
      valores: { ...valores },
      // La justificación ya escrita viaja con cada guardado: el endpoint
      // reemplaza la grilla entera, así que omitirla la borraría.
      justificacion: grilla?.justificacion ?? null,
    });
  }

  private marcar(plantilla: string, dentro: boolean): void {
    this.pendientes.update((actual) =>
      dentro
        ? actual.includes(plantilla)
          ? actual
          : [...actual, plantilla]
        : actual.filter((p) => p !== plantilla),
    );
  }

  /** Manda lo que quede pendiente. El editor lo llama al cambiar de paso. */
  volcar(): void {
    for (const [plantilla, temporizador] of this.temporizadores) {
      clearTimeout(temporizador);
      if (this.pendientes().includes(plantilla)) this.mandar(plantilla);
    }
    this.temporizadores.clear();
  }
}
