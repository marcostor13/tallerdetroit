import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  findMeasurementTemplate,
  MEASUREMENT_TEMPLATES,
  type AppliedSpec,
  type EngineGridDimensions,
  type ValoresCapturados,
} from '@dps/shared';
import { GrillaMedicionComponent } from './grilla-medicion.component';

/** MTU 20V4000C23, el motor del informe OT-898 (§12.2). */
const MTU_20V: EngineGridDimensions = { cilindros: 20, apoyosBancada: 11, bancos: 2 };
const MTU_16V: EngineGridDimensions = { cilindros: 16, apoyosBancada: 9, bancos: 2 };

/** §12.5. Provisional, como todas: sale del informe, no del manual. */
const SPEC_TUNEL: AppliedSpec = {
  nominal: 171.0,
  tolInf: 0,
  tolSup: 0.025,
  unidad: 'mm',
  fuente: 'Informe OT898',
  provisional: true,
};

/**
 * Banco de pruebas de la grilla de medición.
 *
 * Existe para poder verificar en un navegador de verdad lo que ninguna prueba
 * unitaria alcanza: el recorrido real del foco, el tiempo de captura de los 33
 * valores del túnel de bancada y el comportamiento a 360 px. El editor de
 * informes todavía no incorpora la grilla —eso llega con E2.4—, y esperar a
 * entonces significaría no medir el componente hasta que ya no se pueda
 * cambiar sin coste.
 *
 * **No se registra en el build de producción.** La ruta solo existe cuando
 * `environment.production` es falso; en el artefacto que se despliega, este
 * componente ni siquiera se carga.
 */
@Component({
  selector: 'dps-banco-grilla',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GrillaMedicionComponent],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header class="flex flex-col gap-2">
        <h1 class="text-title-lg">Banco de pruebas — grilla de medición</h1>
        <p class="text-body-sm text-secondary">
          Página de verificación. No forma parte de la aplicación desplegada.
        </p>
      </header>

      <div class="flex flex-wrap gap-4">
        <label class="flex flex-col gap-1">
          <span class="font-mono text-label-sm uppercase text-secondary">Plantilla</span>
          <select class="dps-input" (change)="cambiarPlantilla($event)">
            @for (t of plantillas; track t.codigo) {
              <option [value]="t.codigo">{{ t.nombre }}</option>
            }
          </select>
        </label>

        <label class="flex flex-col gap-1">
          <span class="font-mono text-label-sm uppercase text-secondary">Motor</span>
          <select class="dps-input" (change)="cambiarMotor($event)">
            <option value="20V">MTU 20V4000C23 — 20 cil., 11 apoyos</option>
            <option value="16V">MTU 16V4000C21 — 16 cil., 9 apoyos</option>
          </select>
        </label>
      </div>

      <dps-grilla-medicion
        [plantilla]="plantilla()"
        [motor]="motor()"
        [valores]="valores()"
        [especificacion]="spec()"
        (cambio)="aplicar($event)"
      />
    </div>
  `,
})
export class BancoGrillaPage {
  protected readonly plantillas = MEASUREMENT_TEMPLATES;

  protected readonly plantilla = signal(
    findMeasurementTemplate('tunel_bancada') ?? MEASUREMENT_TEMPLATES[0]!,
  );
  protected readonly motor = signal(MTU_20V);
  protected readonly valores = signal<ValoresCapturados>({});
  protected readonly spec = signal<AppliedSpec | null>(SPEC_TUNEL);

  protected aplicar(cambio: Record<string, number | null>): void {
    this.valores.update((v) => ({ ...v, ...cambio }));
  }

  protected cambiarPlantilla(evento: Event): void {
    const codigo = (evento.target as HTMLSelectElement).value;
    const t = findMeasurementTemplate(codigo);
    if (!t) return;

    this.plantilla.set(t);
    this.valores.set({});
    // Solo el túnel de bancada tiene tolerancia cargada; las demás se capturan
    // sin semáforo, que es exactamente lo que pasa hoy con D1 abierta.
    this.spec.set(codigo === 'tunel_bancada' ? SPEC_TUNEL : null);
  }

  protected cambiarMotor(evento: Event): void {
    this.motor.set((evento.target as HTMLSelectElement).value === '16V' ? MTU_16V : MTU_20V);
    this.valores.set({});
  }
}
