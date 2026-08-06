import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  agotoLosIntentos,
  aplicarRespuesta,
  avisoDeAlmacenamiento,
  esperaDeReintento,
  idLocal,
  operacionesPendientes,
  ordenarParaEnvio,
  purgarConfirmadas,
  resumirCola,
  type OperacionOffline,
  type ResultadoDeOperacion,
  type TipoDeOperacion,
} from '@dps/shared';
import { environment } from '../../../environments/environment';
import { baseLocal } from './sync.db';
import { ConnectionService } from '../connection/connection.service';

/** Cuántas operaciones van en cada envío. */
const TAMANO_DE_LOTE = 25;

/**
 * Cola de sincronización del dispositivo (E4.4).
 *
 * Todo lo que el técnico captura pasa por aquí: se guarda en IndexedDB y se
 * intenta enviar. **Nada se borra en local hasta que el servidor confirma.**
 *
 * El `clientOpId` lo genera este servicio y viaja con la operación. Es lo que
 * hace que un doble toque, un reintento tras un timeout o una pestaña duplicada
 * no creen dos informes: el servidor reconoce la repetición y contesta con el
 * resultado de la primera.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly conexion = inject(ConnectionService);

  private readonly cola = signal<readonly OperacionOffline[]>([]);
  private readonly sincronizando = signal(false);

  readonly resumen = computed(() => resumirCola([...this.cola()]));
  readonly aviso = signal<string | null>(null);

  /** Temporizador del próximo reintento, para no encadenar varios. */
  private reintento: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.cargar();

    // Al recuperar la conexión se vacía la cola sin esperar al siguiente ciclo:
    // es el momento en que el técnico sale del socavón y mira el teléfono.
    this.conexion.alRecuperarConexion(() => void this.sincronizar());
  }

  /** Un identificador local para un informe creado sin red. */
  nuevoIdLocal(): string {
    return idLocal(crypto.randomUUID());
  }

  /**
   * Encola una operación y trata de mandarla.
   *
   * Devuelve en cuanto está guardada en local, no cuando llega al servidor: lo
   * que el técnico necesita saber es que su trabajo está a salvo, y esperar a
   * la red convertiría cada tecla en una espera.
   */
  async encolar(
    tipo: TipoDeOperacion,
    informeId: string,
    datos: Record<string, unknown>,
    bloqueId?: string | null,
  ): Promise<OperacionOffline> {
    const operacion: OperacionOffline = {
      clientOpId: crypto.randomUUID(),
      tipo,
      informeId,
      bloqueId: bloqueId ?? null,
      datos,
      capturadaEn: new Date().toISOString(),
      estado: 'pendiente',
      intentos: 0,
    };

    await baseLocal.operaciones.put(operacion);
    this.cola.update((actual) => [...actual, operacion]);
    this.refrescarChip();

    if (this.conexion.online()) void this.sincronizar();
    return operacion;
  }

  /**
   * Manda lo pendiente.
   *
   * Se envía en lotes y **en orden**: crear el informe antes que sus bloques, y
   * dentro del informe por orden de captura. Aplicarlo al revés dejaría el
   * informe distinto de como lo dejó el técnico.
   */
  async sincronizar(): Promise<void> {
    if (this.sincronizando() || !this.conexion.online()) return;

    const pendientes = ordenarParaEnvio(
      operacionesPendientes([...this.cola()]).filter((o) => !agotoLosIntentos(o)),
    );
    if (!pendientes.length) return;

    this.sincronizando.set(true);

    try {
      const lote = pendientes.slice(0, TAMANO_DE_LOTE);
      const { resultados } = await firstValueFrom(
        this.http.post<{ resultados: ResultadoDeOperacion[] }>(`${environment.apiUrl}/sync/push`, {
          operaciones: lote.map((o) => ({
            clientOpId: o.clientOpId,
            tipo: o.tipo,
            informeId: o.informeId,
            bloqueId: o.bloqueId,
            datos: o.datos,
            capturadaEn: o.capturadaEn,
          })),
        }),
      );

      await this.asentar(aplicarRespuesta([...this.cola()], resultados));

      // Si queda algo, se sigue de inmediato: el resto del lote no tiene por qué
      // esperar al siguiente reintento.
      if (operacionesPendientes([...this.cola()]).length) {
        this.sincronizando.set(false);
        void this.sincronizar();
        return;
      }
    } catch {
      // Un fallo de red no marca nada como fallido: la operación sigue
      // pendiente y se reintenta. Marcarla haría que un socavón se pareciera a
      // un error de datos.
      this.programarReintento();
    } finally {
      this.sincronizando.set(false);
    }
  }

  /** Lo que queda por mandar de un informe. Lo usa la pantalla del editor. */
  pendientesDe(informeId: string): readonly OperacionOffline[] {
    return this.cola().filter((o) => o.informeId === informeId && o.estado !== 'confirmada');
  }

  // ---------------------------------------------------------------- privado

  private async cargar(): Promise<void> {
    try {
      const guardadas = await baseLocal.operaciones.toArray();
      this.cola.set(guardadas);
      this.refrescarChip();
      if (this.conexion.online() && guardadas.length) void this.sincronizar();
    } catch {
      // Sin IndexedDB —modo privado de algunos navegadores— la app sigue
      // funcionando con red. Lo que no puede es no arrancar.
      this.cola.set([]);
    }
  }

  /** Guarda el estado nuevo, purga lo confirmado y refresca el chip. */
  private async asentar(actualizada: readonly OperacionOffline[]): Promise<void> {
    const confirmadas = actualizada.filter((o) => o.estado === 'confirmada');
    const quedan = purgarConfirmadas(actualizada);

    await baseLocal.transaction('rw', baseLocal.operaciones, async () => {
      await baseLocal.operaciones.bulkDelete(confirmadas.map((o) => o.clientOpId));
      await baseLocal.operaciones.bulkPut([...quedan]);
    });

    this.cola.set(quedan);
    this.refrescarChip();
  }

  private programarReintento(): void {
    if (this.reintento) return;

    const intentos = Math.max(...this.cola().map((o) => o.intentos), 0) + 1;
    this.reintento = setTimeout(() => {
      this.reintento = null;
      void this.sincronizar();
    }, esperaDeReintento(intentos));
  }

  /**
   * Actualiza el chip de conexión y el aviso de almacenamiento.
   *
   * El chip dice el número exacto de cambios pendientes, no «hay cambios»: el
   * técnico decide si puede irse del sitio con cobertura mirando ese número.
   */
  private refrescarChip(): void {
    const resumen = this.resumen();
    this.conexion.setPending(resumen.pendientes + resumen.fallidas);

    void this.medirAlmacenamiento(resumen.informes);
  }

  private async medirAlmacenamiento(informesSinSincronizar: number): Promise<void> {
    let bytes = 0;
    try {
      bytes = (await navigator.storage?.estimate?.())?.usage ?? 0;
    } catch {
      bytes = 0;
    }

    this.aviso.set(avisoDeAlmacenamiento({ bytes, informesSinSincronizar }));
  }
}
