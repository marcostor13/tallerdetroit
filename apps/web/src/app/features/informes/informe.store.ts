import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  ChecklistCapturado,
  ComentarioDeRevision,
  MissingBlock,
  ReportStatus,
  TemplateVersionDefinition,
} from '@dps/shared';
import { esIdLocal, resolveBlocks, resolveTemplate, transitionsFrom } from '@dps/shared';
import {
  ReportsService,
  TemplatesService,
  type BloqueInforme,
  type Informe,
  type Validacion,
} from '../../core/api/reports.service';
import { InformesOfflineService } from '../../core/sync/informes-offline.service';
import { ConnectionService } from '../../core/connection/connection.service';

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
  private readonly offline = inject(InformesOfflineService);
  private readonly conexion = inject(ConnectionService);

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
    // Con red manda el servidor; sin ella, la copia del dispositivo. Es lo que
    // permite abrir el informe en el socavón, donde no hay a quién pedírselo.
    const informe = await this.traer(id);
    this.informe.set(informe);
    void this.offline.guardarLocal(informe);

    // Un informe emitido se pinta con su copia congelada: si se usara la
    // versión vigente, un documento ya firmado cambiaría de forma al publicar
    // Calidad una versión nueva (§11.1).
    const plantilla =
      informe.templateSnapshot ??
      (esIdLocal(informe._id)
        ? await this.offline.ultimaPlantilla()
        : await this.plantillasApi.version(informe.templateCodigo, informe.templateVersion));

    if (!plantilla) throw new Error('No hay ninguna plantilla guardada en este dispositivo.');
    this.plantilla.set(plantilla);

    // Se guarda para poder crear un informe sin red: para cuando el técnico
    // baja a la mina, la última vigente ya está en el dispositivo.
    void this.offline.guardarPlantilla(plantilla);

    await this.revalidar();
    this.arrancarAutoguardado();
  }

  /**
   * El informe, de donde se pueda.
   *
   * Si el servidor no contesta se usa lo guardado en el dispositivo. Solo se
   * rinde cuando no hay ninguna de las dos: sin red y sin copia local no hay
   * nada que enseñar, y fingir un informe vacío sería peor.
   */
  private async traer(id: string): Promise<Informe> {
    // Un informe con id local no existe en el servidor todavía: pedírselo sería
    // un 404 seguro y un rodeo por la red que no hace falta.
    if (esIdLocal(id)) {
      const local = await this.offline.leerLocal(id);
      if (!local) throw new Error('Ese informe ya no está en el dispositivo.');
      return local;
    }

    if (this.conexion.online()) {
      try {
        return await this.api.findById(id);
      } catch (e: unknown) {
        const local = await this.offline.leerLocal(id);
        if (!local) throw e;
        this.error.set('Sin conexión: se muestra la última copia guardada en este dispositivo.');
        return local;
      }
    }

    const local = await this.offline.leerLocal(id);
    if (!local) throw new Error('Este informe no está descargado en el dispositivo.');
    return local;
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
      const respuesta = await this.offline.ejecutar('editar-informe', id, cambios, null, () =>
        this.api.patch(id, cambios),
      );

      if (respuesta) {
        // El informe del servidor no conoce lo que el técnico haya escrito
        // mientras la petición estaba en vuelo. Sustituirlo a secas hace que esos
        // cambios desaparezcan de la pantalla —aunque sigan en la cola y se
        // guarden después—, y lo que el técnico ve es que lo suyo se ha perdido.
        this.informe.set(respuesta.informe);
        for (const [campo, valor] of Object.entries(this.pendientes)) {
          this.aplicarEnLocal(campo, valor);
        }
        this.guardadoEn.set(new Date(respuesta.guardadoEn));
      } else {
        // Quedó en la cola: lo escrito ya está aplicado en la copia local desde
        // `cambiar()`, así que aquí solo se marca la hora. Para el técnico está
        // guardado —en su dispositivo—, y el chip dice cuánto falta por subir.
        this.guardadoEn.set(new Date());
      }

      void this.offline.guardarLocal(this.informe() as Informe);
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

  /**
   * Añade un bloque.
   *
   * El identificador lo genera el cliente, no el servidor. Sin eso, un bloque
   * creado sin red no tendría nombre al que referirse: las ediciones y las
   * fotos que el técnico haga a continuación quedarían apuntando a un id que el
   * servidor todavía no ha inventado, y al sincronizar se perderían. El backend
   * respeta el id que llega y descarta la repetición.
   */
  async agregarBloque(clave: string, datos: Record<string, unknown> = {}): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;
    await this.guardar();

    const bloque = { id: crypto.randomUUID(), clave, ...datos };
    const respuesta = await this.offline.ejecutar('agregar-bloque', id, bloque, bloque.id, () =>
      this.api.addBlock(id, bloque),
    );

    if (respuesta) this.informe.set(respuesta);
    else this.agregarEnLocal(bloque);

    void this.offline.guardarLocal(this.informe() as Informe);
    await this.revalidar();
  }

  async editarBloque(bloqueId: string, cambios: Record<string, unknown>): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;

    const respuesta = await this.offline.ejecutar('editar-bloque', id, cambios, bloqueId, () =>
      this.api.updateBlock(id, bloqueId, cambios),
    );

    if (respuesta) this.informe.set(respuesta);
    else this.aplicarEnBloque(bloqueId, cambios);

    void this.offline.guardarLocal(this.informe() as Informe);
    await this.revalidar();
  }

  async quitarBloque(bloqueId: string): Promise<void> {
    const id = this.informe()?._id;
    if (!id) return;

    const respuesta = await this.offline.ejecutar('quitar-bloque', id, {}, bloqueId, () =>
      this.api.removeBlock(id, bloqueId),
    );

    if (respuesta) this.informe.set(respuesta);
    else this.quitarEnLocal(bloqueId);

    void this.offline.guardarLocal(this.informe() as Informe);
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

    // Reordenar no se encola. La operación va por posiciones, y al aplicarla más
    // tarde sobre un informe donde entretanto se añadieron o quitaron bloques
    // movería otro distinto del que el técnico arrastró.
    if (esIdLocal(id) || !this.conexion.online()) {
      this.error.set('Reordenar los bloques necesita conexión. El resto de la edición no.');
      return desde;
    }

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
      const respuesta = await this.offline.ejecutar(
        'guardar-medicion',
        id,
        captura as unknown as Record<string, unknown>,
        bloqueId,
        () => this.api.guardarMedicion(id, bloqueId, captura),
      );

      // Sin respuesta, la grilla se queda con lo que el técnico tecleó: el
      // semáforo del espejo ya lo evaluó contra la tolerancia congelada, y el
      // servidor lo recalculará cuando la operación suba.
      if (respuesta) this.informe.set(respuesta);

      void this.offline.guardarLocal(this.informe() as Informe);
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
      const respuesta = await this.offline.ejecutar(
        'guardar-checklist',
        id,
        { capturado },
        bloqueId,
        () => this.api.guardarChecklist(id, bloqueId, { capturado }),
      );

      // Sin respuesta se aplica en local sobre el catálogo que ya estaba: lo
      // que el servidor añade es el catálogo, y ese no cambia por inventariar.
      if (respuesta) this.informe.set(respuesta);
      else this.aplicarEnChecklist(bloqueId, capturado);

      void this.offline.guardarLocal(this.informe() as Informe);
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

    // Un informe que solo existe en el dispositivo no se puede validar contra el
    // servidor: preguntarle es un 404 seguro. Y tampoco haría falta, porque
    // emitir exige conexión de todas formas.
    if (esIdLocal(id) || !this.conexion.online()) {
      this.validacion.set(null);
      return;
    }

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

  /**
   * Añade el bloque a la copia local cuando la operación quedó encolada.
   *
   * El tipo y el título salen de la plantilla, que es de donde los saca también
   * el servidor: así el bloque se pinta igual antes y después de sincronizar.
   */
  private agregarEnLocal(bloque: Record<string, unknown>): void {
    const informe = this.informe();
    const plantilla = this.plantilla();
    if (!informe || !plantilla) return;

    const definicion = resolveBlocks(plantilla, this.contexto(informe)).find(
      (b) => b.clave === bloque['clave'],
    );
    if (!definicion) return;

    this.informe.set({
      ...informe,
      bloques: [
        ...informe.bloques,
        {
          tipo: definicion.tipo,
          titulo: definicion.titulo,
          ...bloque,
          orden: informe.bloques.length + 1,
          visible: true,
        } as unknown as BloqueInforme,
      ],
    });
  }

  private quitarEnLocal(bloqueId: string): void {
    const informe = this.informe();
    if (!informe) return;

    this.informe.set({
      ...informe,
      bloques: informe.bloques.filter((b) => b.id !== bloqueId),
    });
  }

  /**
   * Aplica en la copia local un cambio de bloque que quedó encolado.
   *
   * Hace falta porque sin red no llega ninguna respuesta que traiga el informe
   * actualizado, y el técnico tiene que seguir viendo lo que acaba de escribir.
   */
  private aplicarEnBloque(bloqueId: string, cambios: Record<string, unknown>): void {
    const informe = this.informe();
    if (!informe) return;

    this.informe.set({
      ...informe,
      bloques: informe.bloques.map((b) =>
        b.id === bloqueId ? ({ ...b, ...cambios } as BloqueInforme) : b,
      ),
    });
  }

  /** Lo mismo para el inventario: se sustituye lo capturado, no el catálogo. */
  private aplicarEnChecklist(bloqueId: string, capturado: ChecklistCapturado[]): void {
    const informe = this.informe();
    if (!informe) return;

    this.informe.set({
      ...informe,
      bloques: informe.bloques.map((b) =>
        b.id === bloqueId ? { ...b, checklist: { ...(b.checklist ?? {}), capturado } } : b,
      ),
    });
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
