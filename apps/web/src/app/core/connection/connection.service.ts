import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/**
 * Estado de conexión y cola de sincronización pendiente.
 *
 * El chip de estado es permanente y visible (§18): el técnico trabaja en taller y
 * mina con conectividad intermitente y necesita saber, sin buscarlo, si lo que
 * acaba de capturar ya llegó al servidor.
 *
 * En F4 este servicio se conecta a la cola real de IndexedDB. Hasta entonces
 * expone el estado de red, que ya es lo que gobierna la UI.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly document = inject(DOCUMENT);

  readonly online = signal(this.document.defaultView?.navigator.onLine ?? true);
  /** Operaciones capturadas sin conexión y aún no confirmadas por el servidor. */
  readonly pendingOperations = signal(0);

  readonly label = computed(() => {
    if (this.online()) return 'En línea';
    const n = this.pendingOperations();
    if (n === 0) return 'Sin conexión';
    return `Sin conexión — ${n} ${n === 1 ? 'cambio pendiente' : 'cambios pendientes'}`;
  });

  /** Lo que hay que hacer en cuanto vuelve la red. */
  private readonly alVolver: (() => void)[] = [];

  constructor() {
    const win = this.document.defaultView;
    win?.addEventListener('online', () => {
      this.online.set(true);
      // Es el momento en que el técnico sale del socavón y mira el teléfono:
      // esperar al siguiente ciclo sería tenerlo mirando «pendientes» con
      // cobertura de sobra.
      for (const escucha of this.alVolver) escucha();
    });
    win?.addEventListener('offline', () => this.online.set(false));
  }

  /** Se llama al recuperar la conexión. Lo usa la cola de sincronización. */
  alRecuperarConexion(escucha: () => void): void {
    this.alVolver.push(escucha);
  }

  setPending(count: number): void {
    this.pendingOperations.set(Math.max(0, count));
  }
}
