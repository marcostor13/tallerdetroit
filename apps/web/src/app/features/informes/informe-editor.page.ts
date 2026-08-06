import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { MissingBlock } from '@dps/shared';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { AutocompleteComponent } from '../../shared/ui/autocomplete/autocomplete.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { InformeStore } from './informe.store';
import { IndicadorGuardadoComponent } from './ui/indicador-guardado.component';
import { ListaTrabajosComponent } from './ui/lista-trabajos.component';

/** Campo simple declarado en la configuración de un bloque de la plantilla. */
interface CampoDeBloque {
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: string;
  readonly requerido?: boolean;
}

/** Rótulos de los pasos de §14.1. */
const NOMBRES_DE_PASO: Record<number, string> = {
  1: 'Identificación',
  2: 'Contexto',
  3: 'Trabajos',
  4: 'Repuestos',
  5: 'Conclusiones',
  6: 'Vista previa',
};

/**
 * Wizard de captura del informe (§14.1).
 *
 * Los pasos no están escritos a mano: salen de la plantilla, agrupando sus
 * secciones por el paso que cada una declara. Es lo que permite que Calidad
 * publique un formato distinto sin que haya que tocar el frontend.
 *
 * Todo se maneja con teclado, incluida la reordenación de bloques (T2), y la
 * disposición es de una columna hasta `md` para que sea usable a 360 px (T3).
 */
@Component({
  selector: 'dps-informe-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InformeStore],
  imports: [
    RouterLink,
    IconComponent,
    FieldComponent,
    AutocompleteComponent,
    IndicadorGuardadoComponent,
    ListaTrabajosComponent,
  ],
  templateUrl: './informe-editor.page.html',
})
export class InformeEditorPage implements OnDestroy {
  protected readonly store = inject(InformeStore);
  private readonly ruta = inject(ActivatedRoute);
  private readonly trabajos = viewChild(ListaTrabajosComponent);

  protected readonly paso = signal(1);
  protected readonly cargando = signal(true);
  protected readonly emitiendo = signal(false);
  protected readonly mostrarFaltantes = signal(false);

  protected readonly nombreDePaso = (n: number) => NOMBRES_DE_PASO[n] ?? `Paso ${n}`;

  protected readonly seccionesDelPaso = computed(() =>
    this.store.secciones().filter((s) => s.paso === this.paso()),
  );

  /** Lo que falta en el paso actual, para avisar sin salir de él. */
  protected readonly faltanAqui = computed(() =>
    this.store.faltan().filter((f) => f.paso === this.paso()),
  );

  protected readonly esUltimo = computed(() => {
    const pasos = this.store.pasos();
    return this.paso() >= (pasos[pasos.length - 1] ?? 6);
  });

  constructor() {
    const id = this.ruta.snapshot.paramMap.get('id');
    if (id) void this.iniciar(id);
  }

  ngOnDestroy(): void {
    // Lo pendiente se manda antes de irse: cerrar la pestaña no debe costarle
    // al técnico los últimos veinte segundos de trabajo.
    void this.store.guardar();
    this.store.destruir();
  }

  private async iniciar(id: string): Promise<void> {
    try {
      await this.store.cargar(id);
    } finally {
      this.cargando.set(false);
    }
  }

  // ------------------------------------------------------------------ pasos

  protected async irAPaso(n: number): Promise<void> {
    // Se guarda al cambiar de paso: es el momento en que el técnico da por
    // terminado lo anterior, y esperar al siguiente ciclo sería arriesgarlo.
    await this.store.guardar();
    await this.store.revalidar();
    this.paso.set(n);
  }

  protected siguiente(): void {
    const pasos = this.store.pasos();
    const actual = pasos.indexOf(this.paso());
    const destino = pasos[actual + 1];
    if (destino) void this.irAPaso(destino);
  }

  protected anterior(): void {
    const pasos = this.store.pasos();
    const actual = pasos.indexOf(this.paso());
    const destino = pasos[actual - 1];
    if (destino) void this.irAPaso(destino);
  }

  /** Lleva al punto que falta y le pone el foco (UX-07). */
  protected async irA(falta: MissingBlock): Promise<void> {
    await this.irAPaso(falta.paso);
    this.mostrarFaltantes.set(false);

    queueMicrotask(() => {
      const destino = document.querySelector<HTMLElement>(`[data-bloque="${falta.clave}"]`);
      destino?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      destino?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    });
  }

  // ---------------------------------------------------------------- campos

  protected cambiar(campo: string, valor: unknown): void {
    this.store.cambiar(campo, valor);
  }

  /** Campos declarados por un bloque `header_meta` en su configuración. */
  protected camposDe(bloque: { config?: Record<string, unknown> }): CampoDeBloque[] {
    return (bloque.config?.['campos'] as CampoDeBloque[]) ?? [];
  }

  protected desdeEvento(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected valorDe(ruta: string): string {
    const informe = this.store.informe();
    if (!informe) return '';

    let actual: unknown = informe;
    for (const tramo of ruta.split('.')) {
      if (actual === null || typeof actual !== 'object') return '';
      actual = (actual as Record<string, unknown>)[tramo];
    }
    return actual === null || actual === undefined ? '' : String(actual);
  }

  // --------------------------------------------------------------- bloques

  protected async agregarTrabajo(): Promise<void> {
    await this.store.agregarBloque('trabajos', { titulo: 'NUEVO TRABAJO', texto: '' });
  }

  protected async mover(evento: { desde: number; hasta: number }): Promise<void> {
    const posicion = await this.store.moverBloque(evento.desde, evento.hasta);
    // El foco sigue al bloque: si no, la siguiente pulsación movería otro.
    this.trabajos()?.enfocarFila(posicion);
  }

  protected async quitar(bloqueId: string): Promise<void> {
    await this.store.quitarBloque(bloqueId);
  }

  protected async editarTexto(bloqueId: string, evento: Event): Promise<void> {
    await this.store.editarBloque(bloqueId, { texto: this.desdeEvento(evento) });
  }

  protected async editarTitulo(bloqueId: string, evento: Event): Promise<void> {
    await this.store.editarBloque(bloqueId, { titulo: this.desdeEvento(evento) });
  }

  // --------------------------------------------------------------- emisión

  protected async emitir(): Promise<void> {
    this.emitiendo.set(true);
    try {
      const { ok, faltan } = await this.store.emitir();
      // Con errores se muestra la lista, no un aviso: el requisito es que se
      // pueda ir a cada punto con un clic (UX-07).
      if (!ok && faltan.length) this.mostrarFaltantes.set(true);
    } finally {
      this.emitiendo.set(false);
    }
  }
}
