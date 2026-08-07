import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConnectionService } from '../connection/connection.service';
import { esFalloDeRed } from '../http/network-error';
import { MastersCacheService } from '../sync/masters-cache.service';

export interface MasterItem {
  readonly _id: string;
  readonly pendienteValidacion?: boolean;
  readonly [campo: string]: unknown;
}

export interface MasterList {
  readonly total: number;
  readonly items: MasterItem[];
}

/**
 * Acceso a los maestros de §13.
 *
 * El servidor ya devuelve los resultados ordenados por parecido, así que aquí no
 * se vuelve a filtrar: reordenar en el cliente con otro criterio produciría una
 * lista distinta de la que el propio servidor considera la mejor.
 */
@Injectable({ providedIn: 'root' })
export class MastersService {
  private readonly http = inject(HttpClient);
  private readonly conexion = inject(ConnectionService);
  private readonly cache = inject(MastersCacheService);
  private readonly base = `${environment.apiUrl}/masters`;

  /**
   * Busca en el maestro.
   *
   * Con red pregunta al servidor; sin red —o si la petición muere en el
   * intento— responde la caché del dispositivo (E4.2). La pantalla no se entera
   * de la diferencia, que es la única forma de que el desplegable de cliente
   * siga funcionando en el socavón sin escribir dos veces cada formulario.
   */
  async search(
    coleccion: string,
    opciones: {
      q?: string;
      limit?: number;
      filtros?: Record<string, string | null | undefined>;
    } = {},
  ): Promise<MasterList> {
    if (!this.conexion.online()) return this.cache.buscar(coleccion, opciones);

    let params = new HttpParams();
    if (opciones.q?.trim()) params = params.set('q', opciones.q.trim());
    if (opciones.limit) params = params.set('limit', String(opciones.limit));

    for (const [campo, valor] of Object.entries(opciones.filtros ?? {})) {
      if (valor) params = params.set(campo, valor);
    }

    try {
      return await firstValueFrom(
        this.http.get<MasterList>(`${this.base}/${coleccion}`, { params }),
      );
    } catch (error: unknown) {
      if (!esFalloDeRed(error)) throw error;
      return this.cache.buscar(coleccion, opciones);
    }
  }

  async findById(coleccion: string, id: string): Promise<MasterItem> {
    if (this.conexion.online()) {
      try {
        return await firstValueFrom(this.http.get<MasterItem>(`${this.base}/${coleccion}/${id}`));
      } catch (error: unknown) {
        if (!esFalloDeRed(error)) throw error;
      }
    }

    const guardado = await this.cache.porId(coleccion, id);
    if (!guardado) throw new Error('Ese registro no está guardado en este dispositivo.');
    return guardado;
  }

  /**
   * Alta rápida desde el propio formulario del informe (§13.3.1).
   *
   * Es el requisito del que depende que los maestros se usen: si el técnico no
   * encuentra la sede y tiene que salir del informe a darla de alta, vuelve al
   * texto libre y el catálogo deja de servir.
   */
  createInline(coleccion: string, datos: Record<string, unknown>): Promise<MasterItem> {
    return firstValueFrom(
      this.http.post<MasterItem>(`${this.base}/${coleccion}?inline=true`, datos),
    );
  }
}
