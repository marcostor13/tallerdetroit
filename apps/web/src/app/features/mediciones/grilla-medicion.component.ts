import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import {
  claveDeCelda,
  distribuirPegado,
  resolveGrid,
  type AppliedSpec,
  type CeldaMedicion,
  type EngineGridDimensions,
  type MeasurementTemplate,
  type ValoresCapturados,
} from '@dps/shared';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/** Qué dice el semáforo, en palabras. */
const VEREDICTO_EN_TEXTO: Record<string, string> = {
  ok: 'dentro de tolerancia',
  alerta: 'en alerta, cerca del límite',
  fuera: 'fuera de tolerancia',
};

/**
 * Grilla de captura de mediciones (§12.4, §7.3 del sistema de diseño).
 *
 * Es el componente que decide si el módulo se usa. El técnico introduce entre
 * cuarenta y ochenta valores seguidos, de pie junto al motor y a menudo con
 * guantes: **si hay que tocar el ratón entre celda y celda, vuelve al papel.**
 * De ahí que el teclado no sea una alternativa accesible sino la vía principal,
 * y que el criterio de F2 sea capturar 11 × 3 en menos de un minuto.
 *
 * El color nunca es el único portador del veredicto (WCAG 1.4.1): cada celda
 * lleva icono y su `aria-label` dice en palabras si está dentro, en alerta o
 * fuera. Un informe técnico se imprime, se fotocopia y lo leen personas con
 * daltonismo.
 */
@Component({
  selector: 'dps-grilla-medicion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="flex flex-col gap-3" [attr.aria-labelledby]="tituloId">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 [id]="tituloId" class="text-title-sm">{{ grilla().nombre }}</h3>

        <p class="flex items-center gap-3 font-mono text-label-sm text-secondary">
          <span>{{ grilla().resumen.capturadas }} / {{ grilla().resumen.esperadas }}</span>
          @if (grilla().resumen.fueraTolerancia > 0) {
            <span class="flex items-center gap-1 text-error">
              <dps-icon name="error" [size]="14" aria-hidden="true" />
              {{ grilla().resumen.fueraTolerancia }} fuera de tolerancia
            </span>
          }
        </p>
      </header>

      <!--
        La referencia va arriba y siempre visible: sin ella el técnico no sabe
        contra qué está midiendo, y la grilla se convierte en una hoja de
        números sin significado.
      -->
      @if (grilla().especificacion; as spec) {
        <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm">
          <span class="font-mono">
            Nominal <strong>{{ spec.nominal }}</strong> {{ spec.unidad }}
          </span>
          <span class="font-mono text-secondary">
            Tolerancia {{ spec.tolInf > 0 ? '+' : '' }}{{ spec.tolInf }} /
            {{ spec.tolSup > 0 ? '+' : '' }}{{ spec.tolSup }}
          </span>
          @if (spec.provisional) {
            <span class="dps-chip" [title]="'Fuente: ' + spec.fuente">
              <dps-icon name="warning" [size]="12" aria-hidden="true" />
              Provisional
            </span>
          }
        </p>
      } @else {
        <p class="flex items-start gap-2 text-body-sm text-secondary" role="status">
          <dps-icon name="info" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
          Sin especificación cargada para este motor: se captura igual, pero no se evalúa contra
          ninguna tolerancia.
        </p>
      }

      <!--
        El scroll va aquí dentro y no en la página: a 360 px una grilla de once
        columnas no cabe de ninguna manera, y lo que no puede pasar es que
        arrastre al documento entero en dos ejes.
      -->
      <div class="max-w-full overflow-auto rounded border border-subtle">
        <table class="border-collapse">
          <caption class="sr-only">
            {{
              grilla().nombre
            }}. Usa las flechas para moverte, Enter para bajar una fila y Control+V para pegar un
            rango desde Excel.
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                class="dps-grilla__esquina sticky left-0 top-0 z-20 bg-surface-container-low"
              >
                <span class="sr-only">Fila</span>
              </th>
              @for (columna of grilla().columnas; track columna) {
                <th
                  scope="col"
                  class="sticky top-0 z-10 bg-surface-container-low px-2 py-1.5 font-mono text-label-sm uppercase"
                >
                  {{ columna }}
                </th>
              }
            </tr>
          </thead>

          <tbody>
            @for (fila of grilla().filas; track fila; let f = $index) {
              <tr>
                <th
                  scope="row"
                  class="sticky left-0 z-10 whitespace-nowrap bg-surface-container-low px-2 py-1 text-left font-mono text-label-sm uppercase"
                >
                  {{ fila }}
                  @if (esCalculada(fila)) {
                    <dps-icon
                      name="lock"
                      [size]="12"
                      class="ml-1 align-[-2px] text-secondary"
                      aria-hidden="true"
                    />
                  }
                </th>

                @for (columna of grilla().columnas; track columna; let c = $index) {
                  @let celda = celdaDe(fila, columna);
                  <td class="p-0.5">
                    @if (celda.calculado) {
                      <!-- Calculada: ni editable ni alcanzable con Tab. Que
                           parezca un campo invitaría a teclear en ella. -->
                      <output
                        class="dps-cell dps-cell--calculated block leading-9"
                        [attr.aria-label]="etiquetaDe(celda)"
                      >
                        {{ mostrar(celda.valor) }}
                      </output>
                    } @else {
                      <input
                        #celdaInput
                        type="text"
                        inputmode="decimal"
                        class="dps-cell"
                        [class.dps-cell--ok]="celda.estado === 'ok'"
                        [class.dps-cell--warn]="celda.estado === 'alerta'"
                        [class.dps-cell--out]="celda.estado === 'fuera'"
                        [attr.data-fila]="f"
                        [attr.data-columna]="c"
                        [attr.aria-label]="etiquetaDe(celda)"
                        [attr.aria-invalid]="celda.estado === 'fuera' || null"
                        [disabled]="soloLectura()"
                        [value]="textoDe(celda)"
                        (input)="alEscribir(fila, columna, $event)"
                        (keydown)="alTeclear($event, f, c)"
                        (paste)="alPegar($event, fila, columna)"
                        (focus)="activa.set({ fila, columna })"
                        (blur)="editando.set(null)"
                      />
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!--
        El estado de la celda activa, también en texto. El color y el icono
        están dentro de la celda; quien navega con lector de pantalla necesita
        oírlo al llegar, no deducirlo.
      -->
      <p class="sr-only" role="status" aria-live="polite">{{ anuncio() }}</p>

      <p class="text-body-sm text-secondary">
        Flechas para moverte · Enter baja una fila · Control+V pega un rango desde Excel · Escape
        deshace la celda
      </p>
    </section>
  `,
})
export class GrillaMedicionComponent {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly celdas = viewChildren<ElementRef<HTMLInputElement>>('celdaInput');

  readonly plantilla = input.required<MeasurementTemplate>();
  readonly motor = input.required<EngineGridDimensions>();
  readonly valores = input<ValoresCapturados>({});
  readonly especificacion = input<AppliedSpec | null>(null);
  readonly soloLectura = input(false);

  /** Cambios de la grilla: `{ 'a|1': 171.02 }`. Se emiten en lote al pegar. */
  readonly cambio = output<Record<string, number | null>>();

  protected readonly tituloId = `dps-grilla-${Math.random().toString(36).slice(2, 8)}`;
  protected readonly activa = signal<{ fila: string; columna: string } | null>(null);

  /** Valor previo de la celda en edición, para poder deshacer con Escape. */
  private anterior: number | null = null;

  /**
   * Texto en crudo de la celda que se está tecleando.
   *
   * Sin esto, la celda reescribe lo que el técnico escribe: al llegar a
   * `171.0` el modelo ya vale 171, el campo se reformatea a `171.000` y los
   * dígitos que faltan acaban donde no deben. Mientras la celda tiene el foco
   * manda lo tecleado; al salir vuelve a mandar el modelo, ya formateado.
   */
  protected readonly editando = signal<{ clave: string; texto: string } | null>(null);

  protected readonly grilla = computed(() =>
    resolveGrid(this.plantilla(), this.motor(), this.valores(), this.especificacion()),
  );

  private readonly porClave = computed(
    () => new Map(this.grilla().celdas.map((c) => [claveDeCelda(c.fila, c.columna), c])),
  );

  protected readonly anuncio = computed(() => {
    const activa = this.activa();
    if (!activa) return '';
    const celda = this.porClave().get(claveDeCelda(activa.fila, activa.columna));
    return celda ? this.etiquetaDe(celda) : '';
  });

  protected celdaDe(fila: string, columna: string): CeldaMedicion {
    return (
      this.porClave().get(claveDeCelda(fila, columna)) ?? {
        fila,
        columna,
        valor: null,
        calculado: false,
        estado: null,
      }
    );
  }

  protected esCalculada(fila: string): boolean {
    return this.grilla().filasCalculadas.includes(fila);
  }

  /** Lo que se ve en la celda: lo tecleado si está en edición, si no el modelo. */
  protected textoDe(celda: CeldaMedicion): string {
    const editando = this.editando();
    const clave = claveDeCelda(celda.fila, celda.columna);
    return editando?.clave === clave ? editando.texto : this.mostrar(celda.valor);
  }

  protected mostrar(valor: number | null): string {
    if (valor === null) return '';
    // Tres decimales: es la precisión con la que se mide un encaje de camisa.
    return valor.toFixed(3);
  }

  /**
   * Lo que oye un lector de pantalla al llegar a la celda.
   *
   * Incluye el veredicto **en palabras**. El color y el icono no le sirven de
   * nada a quien no ve la pantalla, y el color solo tampoco a quien no lo
   * distingue (WCAG 1.4.1).
   */
  protected etiquetaDe(celda: CeldaMedicion): string {
    const donde = `${celda.fila}, columna ${celda.columna}`;
    const valor = celda.valor === null ? 'sin capturar' : this.mostrar(celda.valor);

    if (celda.calculado) return `${donde}, calculado, ${valor}`;
    if (!celda.estado) return `${donde}, ${valor}`;

    return `${donde}, ${valor}, ${VEREDICTO_EN_TEXTO[celda.estado] ?? celda.estado}`;
  }

  // ------------------------------------------------------------------ edición

  protected alEscribir(fila: string, columna: string, evento: Event): void {
    const clave = claveDeCelda(fila, columna);
    const escrito = (evento.target as HTMLInputElement).value;
    this.editando.set({ clave, texto: escrito });

    const bruto = escrito.trim().replace(',', '.');

    if (bruto === '') {
      this.cambio.emit({ [clave]: null });
      return;
    }

    // `Number('171.')` da 171, así que quedarse solo con `isNaN` haría que a
    // media escritura de `171.020` se emitiera 171 y el semáforo parpadeara en
    // rojo mientras el técnico sigue tecleando. Se espera a que el número esté
    // completo. El signo también: `-` solo aún no es nada.
    if (!/^-?\d+(\.\d+)?$/.test(bruto)) return;

    this.cambio.emit({ [clave]: Number(bruto) });
  }

  /**
   * Pegado desde Excel (§12.4.5).
   *
   * Se intercepta el pegado nativo porque el navegador metería todo el bloque
   * en una sola celda. El reparto lo hace `libs/shared`, la misma función que
   * valida el backend.
   */
  protected alPegar(evento: ClipboardEvent, fila: string, columna: string): void {
    const texto = evento.clipboardData?.getData('text/plain');
    if (!texto?.includes('\t') && !texto?.includes('\n')) return;

    evento.preventDefault();

    this.editando.set(null);
    const reparto = distribuirPegado(texto, this.grilla(), { fila, columna });
    if (Object.keys(reparto).length) this.cambio.emit(reparto);
  }

  // ------------------------------------------------------------------ teclado

  protected alTeclear(evento: KeyboardEvent, fila: number, columna: number): void {
    const filas = this.grilla().filas.length;
    const columnas = this.grilla().columnas.length;

    switch (evento.key) {
      case 'ArrowUp':
        this.mover(evento, fila - 1, columna);
        break;
      case 'ArrowDown':
      case 'Enter':
        // Enter baja una fila y no envía nada: dentro de una grilla de ochenta
        // valores, enviar el formulario a media captura sería desastroso.
        this.mover(evento, fila + 1, columna);
        break;
      case 'ArrowLeft':
        // Solo salta de celda si el cursor está al principio del texto; si no,
        // la flecha mueve el cursor, que es lo que espera quien corrige un dígito.
        if (this.cursorAlInicio(evento)) this.mover(evento, fila, columna - 1);
        break;
      case 'ArrowRight':
        if (this.cursorAlFinal(evento)) this.mover(evento, fila, columna + 1);
        break;
      case 'Home':
        this.mover(evento, fila, 0);
        break;
      case 'End':
        this.mover(evento, fila, columnas - 1);
        break;
      case 'Escape':
        evento.preventDefault();
        (evento.target as HTMLInputElement).value = this.mostrar(this.anterior);
        break;
      default:
        if (filas > 0) this.anterior = this.valorActual(evento);
        break;
    }
  }

  private valorActual(evento: KeyboardEvent): number | null {
    const bruto = (evento.target as HTMLInputElement).value.trim().replace(',', '.');
    return bruto === '' ? null : Number(bruto);
  }

  /**
   * ¿Está la celda «recién llegada» en vez de en edición?
   *
   * Al moverse a una celda se selecciona su contenido, igual que en una hoja de
   * cálculo. En ese estado las flechas laterales navegan a la celda vecina; solo
   * cuando el técnico ha puesto el cursor dentro del texto pasan a mover el
   * cursor, que es lo que espera quien está corrigiendo un dígito.
   *
   * Sin esta distinción la captura seguida se rompe: al llegar a una celda con
   * el texto seleccionado, la flecha derecha se limitaba a deseleccionar y el
   * recorrido no avanzaba de columna.
   */
  private todoSeleccionado(input: HTMLInputElement): boolean {
    return (
      input.value.length > 0 &&
      input.selectionStart === 0 &&
      input.selectionEnd === input.value.length
    );
  }

  private cursorAlInicio(evento: KeyboardEvent): boolean {
    const input = evento.target as HTMLInputElement;
    if (this.todoSeleccionado(input)) return true;
    return input.selectionStart === 0 && input.selectionEnd === 0;
  }

  private cursorAlFinal(evento: KeyboardEvent): boolean {
    const input = evento.target as HTMLInputElement;
    if (this.todoSeleccionado(input)) return true;
    return input.selectionStart === input.value.length;
  }

  /**
   * Mueve el foco saltándose las filas calculadas.
   *
   * Que el recorrido se detuviera en una celda bloqueada rompería la captura
   * seguida, que es justo lo que hace viable meter ochenta valores sin ratón.
   */
  private mover(evento: KeyboardEvent, fila: number, columna: number): void {
    const destino = this.host.nativeElement.querySelector<HTMLInputElement>(
      `input[data-fila="${fila}"][data-columna="${columna}"]`,
    );
    if (!destino) return;

    evento.preventDefault();
    // Al salir de la celda vuelve a mandar el modelo: el valor se ve formateado
    // con sus tres decimales, no como quedó tecleado.
    this.editando.set(null);
    destino.focus();
    destino.select();
  }

  /** Enfoca la primera celda editable. Lo usa el editor al abrir la grilla. */
  enfocarPrimera(): void {
    this.celdas()[0]?.nativeElement.focus();
  }
}
