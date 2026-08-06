import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  ChecklistCapturado,
  ComentarioDeRevision,
  MissingBlock,
  ReportStatus,
  TemplateVersionDefinition,
} from '@dps/shared';
import { resolveTemplate, transitionsFrom } from '@dps/shared';
import {
  ReportsService,
  TemplatesService,
  type BloqueInforme,
  type Informe,
  type Validacion,
} from '../../core/api/reports.service';

export type EstadoGuardado = 'limpio' | 'pendiente' | 'guardando' | 'guardado' | 'error';

/** Cada cuánto se manda lo pendiente. §14.1 pide entre 20 y 30 segundos. */
const INTERVALO_AUTOGUARDADO = 20_000;
/** Tras dejar de escribir se guarda antes: 20 s de trabajo perdido duelen. */
const ESPERA_TRAS_ESCRIBIR = 1_500;

/**
 * Estado del informe en edición.
 *
 * El wizard escribe aquí y este almacén decide cuándo hablar con el servidor.
 * La razón de que los cambios se acumulen en vez de mandarse uno a uno es que
 * el técnico teclea sin parar: una petición por pulsación saturaría la conexión
 * del taller, y las respuestas llegarían desordenadas pisándose entre sí.
 */
@Injectable()
export class InformeStore {
  private readonly api = inject(ReportsService);
  private readonly plantillasApi = inject(TemplatesService);

  readonly informe = signal<Informe | null>(null);
  readonly plantilla = signal<TemplateVersionDefinition | null>(null);
  readonly validacion = signal<Validacion | null>(null);
  readonly estadoGuardado = signal<EstadoGuardado>('limpio');
  readonly guardadoEn = signal<Date | null>(null);
  readonly error = signal<string | null>(null);

  /** Secciones que le tocan a este informe según §11.3. */
  readonly secciones = computed(() => {
    const plantilla = this.plantilla();
    const informe = this.informe();
    if (!plantilla || !informe) return [];
    return resolveTemplate(plantilla, this.contexto(informe));
  });

  readonly pasos = computed(() => {
    const pasos = new Set(this.secciones().map((s) => s.paso));
    return [...pasos].sort((a, b) => a - b);
  });

  readonly soloLectura = computed(() => {
    const estado = this.informe()?.estado;
    return estado === 'emitido' || estado === 'anulado';
  });

  readonly faltan = computed<MissingBlock[]>(() => this.validacion()?.faltan ?? []);

  private pendientes: Record<string, unknown> = {};
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private periodico: ReturnType<typeof setInterval> | null = null;

  async cargar(id: string): Promise<void> {
    const informe = await this.api.findById(id);
    this.informe.set(informe);

    // Un informe emitido se pinta con su copia congelada: si se usara la
    // versión vigente, un documento ya firmado cambiaría de forma al publicar
    // Calidad una versión nueva (§11.1).
    this.plantilla.set(
      informe.templateSnapshot ??
        (await this.plantillasApi.version(informe.templateCodigo, informe.templateVersion)),
    );

    await this.revalidar();
    this.arrancarAutoguardado();
  }

  /**
   * Registra un cambio. No va al servidor de inmediato.
   *
   * `campo` admite rutas: `datos.horasTotales`. El servidor las aplica con `$set`
   * sobre esa ruta concreta, de forma que dos pestañas editando campos distintos
   * del mismo paso no se pisen.
   */
  cambiar(campo: string, valor: unknown): void {
    if (this.soloLectura()) return;

    this.pendientes[campo] = valor;
    this.aplicarEnLocal(campo, valor);
    this.estadoGuardado.set('pendiente');

    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.guardar(), ESPERA_TRAS_ESCRIBIR);
  }

  /** Fuerza el envío. Se llama al cambiar de paso y antes de emitir. */
  async guardar(): Promise<void> {
    const id = this.informe()?._id;
    const cambios = this.pendientes;

    if (!id || !Object.keys(cambios).length) {
      if (this.estadoGuardado() === 'pendiente') this.estadoGuardado.set('guardado');
      return;
    }

    // Se vacía antes de la llamada: lo que el técnico escriba mientras tanto
    // entra en el siguiente envío en vez de perderse al terminar este.
    this.pendientes = {};
    this.estadoGuardado.set('guardando');

    try {
      const { guardadoEn, informe } = await this.api.patch(id, cambios);

      // El informe del servidor no conoce lo que el técnico haya escrito
      // mientras la petición estaba en vuelo. Sustituirlo a secas hace que esos
      // cambios desaparezcan de la pantalla —aunque sigan en la cola y se
      // guarden después—, y lo que el técnico ve es que lo suyo se ha perdido.
      this.informe.set(informe);
      for (const [campo, valor] of Object.entries(this.pendientes)) {
        this.aplicarEnLocal(campo, valor);
      }

      this.guardadoEn.set(new Date(guardadoEn));
      this.estadoGuardado.set('guardado');
      this.error.set(null);
    } catch (e: unknown) {
      // Los cambios vuelven a la cola: perderlos por un corte de red sería
      // perder trabajo del técnico, que es lo que esta plataforma viene a evitar.
      this.pendientes = { ...cambios, ...this.pendientes };
      this.estadoGuardado.set('error');
      this.error.set(this.mensaje(e, 'No se pudo guardar. Se reintentará solo.'));
    }
  }

  // ------------------------------------------------------------------ bloques

  async agregarBloque(clave: string, datos: Record<string, unknown> = {}): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;
    await this.guardar();
    this.informe.set(await this.api.addBlock(id, { clave, ...datos }));
    await this.revalidar();
  }

  async editarBloque(bloqueId: string, cambios: Record<string, unknown>): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;
    this.informe.set(await this.api.updateBlock(id, bloqueId, cambios));
    await this.revalidar();
  }

  async quitarBloque(bloqueId: string): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;
    this.informe.set(await this.api.removeBlock(id, bloqueId));
    await this.revalidar();
  }

  /**
   * Mueve un bloque. Devuelve la nueva posición para poder devolverle el foco.
   *
   * Sin eso, mover con el teclado deja el foco en el sitio de antes y el
   * siguiente movimiento actúa sobre otro bloque: la reordenación por teclado
   * sería inservible, y es requisito (T2).
   */
  async moverBloque(desde: number, hasta: number): Promise<number> {
    const id = this.informe()?._id;
    const bloques = this.bloquesOrdenados();
    if (!id || hasta < 0 || hasta >= bloques.length || desde === hasta) return desde;

    this.informe.set(await this.api.reorder(id, desde, hasta));
    return hasta;
  }

  bloquesOrdenados(): BloqueInforme[] {
    return [...(this.informe()?.bloques ?? [])].sort((a, b) => a.orden - b.orden);
  }

  bloquesDe(clave: string): BloqueInforme[] {
    return this.bloquesOrdenados().filter((b) => b.clave === clave);
  }

  // --------------------------------------------------------------- mediciones

  /**
   * Manda una grilla al servidor y se queda con lo que él devuelve (E2.4).
   *
   * Va aparte del autoguardado por rutas: una grilla no es un campo suelto sino
   * un conjunto que hay que evaluar entero contra la tolerancia. Y el informe
   * que vuelve trae los estados ya calculados por el backend, que es la única
   * versión que cuenta.
   */
  async guardarMedicion(
    bloqueId: string,
    captura: {
      plantilla: string;
      valores: Record<string, number | null>;
      justificacion?: string | null;
    },
  ): Promise<void> {
    const id = this.informe()?._id;
    if (!id || this.soloLectura()) return;

    try {
      this.informe.set(await this.api.guardarMedicion(id, bloqueId, captura));
      this.error.set(null);
      await this.revalidar();
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo guardar la tabla dimensional.'));
    }
  }

  async quitarMedicion(bloqueId: string, plantilla: string): Promise<void> {
    const id = this.informe()?._id;
    if (!id || this.soloLectura()) return;

    try {
      this.informe.set(await this.api.quitarMedicion(id, bloqueId, plantilla));
      await this.revalidar();
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo quitar la tabla dimensional.'));
    }
  }

  /** Inventario de desarmado del bloque (E2.7). */
  async guardarChecklist(bloqueId: string, capturado: ChecklistCapturado[]): Promise<void> {
    const id = this.informe()?._id;
    if (!id || this.soloLectura()) return;

    try {
      this.informe.set(await this.api.guardarChecklist(id, bloqueId, { capturado }));
      this.error.set(null);
      await this.revalidar();
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo guardar el inventario de desarmado.'));
    }
  }

  // ---------------------------------------------------------- revisión (E3.2)

  readonly comentarios = computed<readonly ComentarioDeRevision[]>(
    () => this.informe()?.comentarios ?? [],
  );

  /**
   * Transiciones que este informe admite ahora mismo.
   *
   * Salen de la misma tabla que aplica el backend (§14.2), de forma que la
   * pantalla no puede ofrecer una acción que el servidor va a rechazar.
   */
  transicionesPosibles(puede: (permiso: string) => boolean) {
    const estado = this.informe()?.estado;
    if (!estado) return [];
    return transitionsFrom(estado).filter((t) => puede(t.permission));
  }

  async comentar(comentario: { bloqueId: string | null; texto: string }): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;

    try {
      this.informe.set(await this.api.comentar(id, comentario));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo guardar el comentario.'));
    }
  }

  async resolverComentario(comentarioId: string, resuelto: boolean): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;

    try {
      this.informe.set(await this.api.resolverComentario(id, comentarioId, resuelto));
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo actualizar el comentario.'));
    }
  }

  // -------------------------------------------------------------- validación

  async revalidar(): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;
    try {
      this.validacion.set(await this.api.validate(id));
    } catch {
      // Que falle la validación no debe impedir seguir escribiendo; el envío la
      // vuelve a comprobar en el servidor de todas formas.
      this.validacion.set(null);
    }
  }

  async emitir(): Promise<{ ok: boolean; faltan: MissingBlock[] }> {
    return this.transicionar('emitido');
  }

  /**
   * Mueve el informe a otro estado del flujo (E3.1).
   *
   * Devuelve lo que falta en vez de solo fallar: el aviso tiene que ser
   * navegable por clic, no un «no se pudo» que obliga a buscar el motivo por
   * seis pasos (UX-07).
   */
  async transicionar(
    destino: ReportStatus,
    comentario?: string,
  ): Promise<{ ok: boolean; faltan: MissingBlock[] }> {
    const id = this.informe()?._id;
    if (!id) return { ok: false, faltan: [] };

    await this.guardar();

    try {
      this.informe.set(await this.api.transition(id, destino, comentario));
      this.error.set(null);
      await this.revalidar();
      return { ok: true, faltan: [] };
    } catch (e: unknown) {
      const cuerpo = (e as { error?: { faltan?: MissingBlock[]; detail?: string } }).error;
      const faltan = cuerpo?.faltan ?? [];
      this.validacion.set({ emitible: false, faltan });
      this.error.set(cuerpo?.detail ?? 'No se pudo cambiar el estado del informe.');
      return { ok: false, faltan };
    }
  }

  destruir(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    if (this.periodico) clearInterval(this.periodico);
    this.temporizador = null;
    this.periodico = null;
  }

  // ------------------------------------------------------------------ apoyo

  private arrancarAutoguardado(): void {
    if (this.periodico) return;
    this.periodico = setInterval(() => {
      if (this.estadoGuardado() === 'pendiente' || this.estadoGuardado() === 'error') {
        void this.guardar();
      }
    }, INTERVALO_AUTOGUARDADO);
  }

  /**
   * Refleja el cambio en la copia local antes de que el servidor conteste.
   *
   * Sin esto el campo parpadea: se escribe, el valor no está en el modelo, y
   * vuelve al valor viejo hasta que llega la respuesta.
   */
  private aplicarEnLocal(campo: string, valor: unknown): void {
    const informe = this.informe();
    if (!informe) return;

    const copia = structuredClone(informe) as unknown as Record<string, unknown>;
    const tramos = campo.split('.');
    let actual = copia;

    for (const tramo of tramos.slice(0, -1)) {
      if (typeof actual[tramo] !== 'object' || actual[tramo] === null) actual[tramo] = {};
      actual = actual[tramo] as Record<string, unknown>;
    }
    actual[tramos[tramos.length - 1] as string] = valor;

    this.informe.set(copia as unknown as Informe);
  }

  /** Contexto para las reglas de visibilidad de §11.3. */
  private contexto(informe: Informe): Record<string, unknown> {
    return {
      equipo: informe.equipo ?? {},
      motor: informe.motor ?? {},
      cliente: informe.cliente ?? {},
      intervencion: (informe.datos?.['intervencion'] as Record<string, unknown>) ?? {},
      informe: {
        ...informe.datos,
        tercerizados: (informe.datos?.['tercerizados'] as unknown[]) ?? [],
        mediciones: informe.bloques.filter((b) => b.tipo === 'measurement_grid'),
      },
    };
  }

  private mensaje(error: unknown, porDefecto: string): string {
    const detalle = (error as { error?: { detail?: string } }).error?.detail;
    return detalle ?? porDefecto;
  }
}
