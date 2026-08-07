import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  MAESTROS_EN_CACHE,
  describirCache,
  fuzzySearch,
  mezclarDelta,
  seCachea,
  tocaSincronizar,
  type EstadoDeMaestro,
  type RegistroDeMaestro,
} from '@dps/shared';
import { environment } from '../../../environments/environment';
import { BASE_LOCAL } from './sync.db';
import { AuthService } from '../auth/auth.service';
import { ConnectionService } from '../connection/connection.service';
import type { MasterItem, MasterList } from '../api/masters.service';

/** Campos por los que se busca en cada maestro cacheado, como en el servidor. */
const CAMPOS_DE_BUSQUEDA: Record<string, readonly string[]> = {
  clients: ['razonSocial', 'nombreCorto', 'ruc'],
  sites: ['nombre', 'ciudad'],
  equipments: ['codigoInterno', 'placa', 'serie'],
  engines: ['serie', 'codigoInterno'],
  engineModels: ['nombre', 'codigo'],
  engineSpecs: ['nombre', 'codigo'],
  technicians: ['nombre', 'documento'],
  engineComponents: ['nombre', 'clave'],
  units: ['nombre', 'simbolo'],
  instruments: ['nombre', 'codigo', 'serie'],
  interventionTypes: ['nombre', 'clave'],
  componentVerdicts: ['nombre', 'clave'],
};

/** Cuántos resultados devuelve la búsqueda local si nadie dice otra cosa. */
const LIMITE_POR_DEFECTO = 50;

/** Cada cuánto se comprueba si algún maestro venció su plazo. */
const REPASO = 30 * 60 * 1000;

/**
 * Caché de maestros en el dispositivo (E4.2).
 *
 * Sin ella, un informe empezado sin red se queda a medias: se puede escribir el
 * texto, pero los desplegables de cliente, sede, equipo y motor no tienen nada
 * que ofrecer — y esos campos son justo los que enlazan el informe con el resto
 * del sistema. Escribirlos a mano en texto libre es lo que esta plataforma
 * viene a eliminar.
 *
 * La sincronización es **delta**: se pide lo que cambió desde la última vez.
 * Bajar los catálogos enteros cada cuatro horas por datos móviles es la clase
 * de coste que hace que el técnico desactive la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class MastersCacheService {
  private readonly http = inject(HttpClient);
  private readonly conexion = inject(ConnectionService);
  private readonly auth = inject(AuthService);
  private readonly base = inject(BASE_LOCAL);

  /** Lo que se le enseña al técnico en Perfil antes de bajar a la mina. */
  readonly resumen = signal<string | null>(null);
  readonly sincronizando = signal(false);

  constructor() {
    // Al iniciar sesión —y al restaurarla al arrancar— se baja lo que falte.
    // Es el único momento garantizado antes de que el técnico salga a campo.
    effect(() => {
      if (this.auth.isAuthenticated()) void this.sincronizar();
    });

    // Al recuperar la red se pone al día sin esperar al siguiente ciclo: es el
    // momento en que el técnico sale del socavón con el teléfono en la mano.
    this.conexion.alRecuperarConexion(() => void this.sincronizar());

    // El repaso es frecuente y el trabajo no: `sincronizar` mira maestro por
    // maestro si le toca, así que despertarse cada media hora no son dos
    // descargas por hora, sino una comprobación barata que reparte el gasto en
    // vez de acumular cuatro horas de cambios en una sola petición.
    setInterval(() => void this.sincronizar(), REPASO);
  }

  /**
   * Pone al día lo que toque.
   *
   * Se llama al iniciar sesión y cada cuatro horas. Solo baja los maestros cuyo
   * plazo venció: abrir la app seis veces en una mañana no puede significar
   * seis descargas.
   */
  async sincronizar(forzar = false): Promise<void> {
    if (this.sincronizando() || !this.conexion.online()) return;
    this.sincronizando.set(true);

    try {
      for (const coleccion of MAESTROS_EN_CACHE) {
        const estado = await this.estadoDe(coleccion);
        if (!forzar && !tocaSincronizar(estado, new Date())) continue;

        await this.traerDelta(coleccion, estado);
      }
      await this.refrescarResumen();
    } catch {
      // Un fallo aquí deja la caché como estaba, que es lo peor que puede pasar:
      // el técnico trabaja con los datos de la última vez. Bloquear la app por
      // no poder refrescar un catálogo sería mucho peor.
    } finally {
      this.sincronizando.set(false);
    }
  }

  /**
   * Busca en la caché del dispositivo.
   *
   * Usa el **mismo `fuzzySearch` que el servidor** (`libs/shared`), de forma que
   * el técnico obtiene el mismo orden de resultados con red y sin ella. Con dos
   * implementaciones distintas, «KOMATZU» encontraría la marca en el taller y
   * no en la mina, y eso es peor que no tener caché: es una caché en la que no
   * se puede confiar.
   */
  async buscar(
    coleccion: string,
    opciones: { q?: string; limit?: number; filtros?: Record<string, string | null | undefined> },
  ): Promise<MasterList> {
    if (!seCachea(coleccion)) return { total: 0, items: [] };

    const guardados = await this.registrosDe(coleccion);
    const limit = opciones.limit ?? LIMITE_POR_DEFECTO;

    // Los filtros de cascada se aplican antes de buscar, igual que el servidor:
    // buscar «TALLER» sin acotar por cliente devolvería las sedes de otro.
    const filtrados = guardados.filter((registro) =>
      Object.entries(opciones.filtros ?? {}).every(
        ([campo, valor]) => !valor || String(registro[campo] ?? '') === valor,
      ),
    );

    if (!opciones.q?.trim()) {
      return { total: filtrados.length, items: filtrados.slice(0, limit) as MasterItem[] };
    }

    const campos = CAMPOS_DE_BUSQUEDA[coleccion] ?? ['nombre'];
    const encontrados = fuzzySearch(
      opciones.q,
      filtrados,
      (item) => campos.map((campo) => item[campo] as string | null | undefined),
      { limit },
    );

    return {
      total: encontrados.length,
      items: encontrados.map((m) => m.item) as MasterItem[],
    };
  }

  /** Un registro concreto, para pintar lo que el informe ya tenía elegido. */
  async porId(coleccion: string, id: string): Promise<MasterItem | null> {
    try {
      const fila = await this.base.maestros.get(`${coleccion}:${id}`);
      return (fila?.datos as MasterItem) ?? null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- privado

  /**
   * Baja un maestro por lotes.
   *
   * Se repite mientras el servidor diga que quedan más: un catálogo que nunca
   * se ha sincronizado no cabe en una sola respuesta, y quedarse con el primer
   * lote dejaría al técnico con los primeros quinientos repuestos y sin saberlo.
   */
  private async traerDelta(coleccion: string, desde: string | null): Promise<void> {
    let corte = desde;

    for (let lote = 0; lote < 40; lote++) {
      let params = new HttpParams();
      if (corte) params = params.set('desde', corte);

      const respuesta = await firstValueFrom(
        this.http.get<{
          items: RegistroDeMaestro[];
          hasta: string;
          hayMas: boolean;
        }>(`${environment.apiUrl}/masters/${coleccion}/delta`, { params }),
      );

      await this.aplicar(coleccion, respuesta.items);
      await this.base.maestrosEstado.put({ coleccion, sincronizadoHasta: respuesta.hasta });

      corte = respuesta.hasta;
      if (!respuesta.hayMas) return;
    }
  }

  /** Guarda lo vigente y quita lo que dejó de estarlo. */
  private async aplicar(coleccion: string, items: readonly RegistroDeMaestro[]): Promise<void> {
    const { guardar, borrar } = mezclarDelta(items);

    if (guardar.length) {
      await this.base.maestros.bulkPut(
        guardar.map((registro) => ({
          clave: `${coleccion}:${registro._id}`,
          coleccion,
          registroId: registro._id,
          datos: registro as unknown as Record<string, unknown>,
        })),
      );
    }

    if (borrar.length) {
      await this.base.maestros.bulkDelete(borrar.map((id) => `${coleccion}:${id}`));
    }
  }

  private async estadoDe(coleccion: string): Promise<string | null> {
    try {
      return (await this.base.maestrosEstado.get(coleccion))?.sincronizadoHasta ?? null;
    } catch {
      return null;
    }
  }

  private async registrosDe(coleccion: string): Promise<Record<string, unknown>[]> {
    try {
      const filas = await this.base.maestros.where('coleccion').equals(coleccion).toArray();
      return filas.map((f) => f.datos);
    } catch {
      return [];
    }
  }

  private async refrescarResumen(): Promise<void> {
    try {
      const estados = await this.base.maestrosEstado.toArray();
      const descripcion = describirCache(estados as EstadoDeMaestro[], new Date());
      this.resumen.set(descripcion.texto);
    } catch {
      this.resumen.set(null);
    }
  }
}
