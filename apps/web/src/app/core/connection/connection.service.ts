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

  constructor() {
    const win = this.document.defaultView;
    win?.addEventListener('online', () => this.online.set(true));
    win?.addEventListener('offline', () => this.online.set(false));
  }

  setPending(count: number): void {
    this.pendingOperations.set(Math.max(0, count));
  }
}
