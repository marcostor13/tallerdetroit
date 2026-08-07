import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { TipoDeOperacion } from '@dps/shared';
import { baseLocal } from './sync.db';
import { SyncService } from './sync.service';
import { ConnectionService } from '../connection/connection.service';
import type { Informe } from '../api/reports.service';

/**
 * Puerta de entrada de las escrituras del editor cuando puede no haber red
 * (E4.3).
 *
 * El wizard no decide si hay conexión: llama aquí y esto resuelve. Con red se
 * habla con la API como siempre; sin red —o si la petición muere en el
 * intento— la operación se encola y el editor aplica el cambio en local.
 *
 * **Un error de validación no se encola.** Un 400 no es un problema de
 * conectividad: reintentarlo cada dos minutos durante una semana no lo va a
 * arreglar, y dejaría al técnico con un pendiente eterno que no puede resolver.
 * Solo se encola lo que falla por la red.
 */
@Injectable({ providedIn: 'root' })
export class InformesOfflineService {
  private readonly cola = inject(SyncService);
  private readonly conexion = inject(ConnectionService);

  /**
   * Ejecuta una escritura.
   *
   * Devuelve el informe que contestó el servidor, o `null` si la operación
   * quedó encolada — en cuyo caso el editor tiene que aplicar el cambio en su
   * copia local, porque no va a llegar ninguna respuesta que lo traiga.
   */
  async ejecutar<T>(
    tipo: TipoDeOperacion,
    informeId: string,
    datos: Record<string, unknown>,
    bloqueId: string | null,
    enLinea: () => Promise<T>,
  ): Promise<T | null> {
    if (!this.conexion.online()) {
      await this.cola.encolar(tipo, informeId, datos, bloqueId);
      return null;
    }

    try {
      return await enLinea();
    } catch (error: unknown) {
      if (!this.esFalloDeRed(error)) throw error;

      await this.cola.encolar(tipo, informeId, datos, bloqueId);
      return null;
    }
  }

  /**
   * Guarda el informe en el dispositivo.
   *
   * Se llama tras cada carga y cada cambio: es lo que permite abrir el informe
   * en el socavón, donde no hay a quién pedírselo. Un fallo aquí no se propaga
   * —la app funciona igual con red— pero sí deja al técnico sin respaldo, así
   * que no se silencia del todo: queda en la consola.
   */
  async guardarLocal(informe: Informe): Promise<void> {
    try {
      await baseLocal.informes.put({
        id: informe._id,
        numeroInforme: informe.numeroInforme,
        datos: informe as unknown as Record<string, unknown>,
        actualizadoEn: new Date().toISOString(),
      });
    } catch (e: unknown) {
      console.warn('No se pudo guardar el informe en el dispositivo:', e);
    }
  }

  /** El informe tal como quedó en el dispositivo, o `null` si no está. */
  async leerLocal(id: string): Promise<Informe | null> {
    try {
      const guardado = await baseLocal.informes.get(id);
      return (guardado?.datos as unknown as Informe) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * ¿Falló por la red?
   *
   * `status === 0` es lo que da el navegador cuando la petición ni salió: sin
   * conexión, DNS caído, CORS que ni llegó. Un 5xx también cuenta —el servidor
   * está, pero no puede— y reintentarlo tiene sentido. Un 4xx no: eso es que la
   * petición está mal y volverá a estarlo.
   */
  private esFalloDeRed(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) return false;
    return error.status === 0 || error.status >= 500;
  }
}
