import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { esIdLocal, type TipoDeOperacion } from '@dps/shared';
import { BASE_LOCAL } from './sync.db';
import { SyncService } from './sync.service';
import { ConnectionService } from '../connection/connection.service';
import type { Informe } from '../api/reports.service';
import type { TemplateVersionDefinition } from '@dps/shared';

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
  private readonly base = inject(BASE_LOCAL);

  constructor() {
    this.cola.alReasignarId((local, definitivo) => void this.renombrarLocal(local, definitivo));
  }

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
      await this.base.informes.put({
        id: informe._id,
        numeroInforme: informe.numeroInforme,
        datos: informe as unknown as Record<string, unknown>,
        actualizadoEn: new Date().toISOString(),
      });
    } catch (e: unknown) {
      console.warn('No se pudo guardar el informe en el dispositivo:', e);
    }
  }

  /**
   * Guarda la plantilla para poder crear un informe sin red.
   *
   * Se llama al abrir cualquier informe con conexión: para cuando el técnico
   * baja a la mina, la última vigente ya está en el dispositivo.
   */
  async guardarPlantilla(definicion: TemplateVersionDefinition): Promise<void> {
    try {
      await this.base.plantillas.put({
        clave: `${definicion.codigo}:${definicion.version}`,
        codigo: definicion.codigo,
        version: definicion.version,
        definicion: definicion as unknown as Record<string, unknown>,
        guardadaEn: new Date().toISOString(),
      });
    } catch {
      // Sin plantilla guardada solo se pierde poder crear offline; editar los
      // informes ya descargados sigue funcionando.
    }
  }

  /** La última plantilla guardada, o `null` si nunca se abrió un informe. */
  async ultimaPlantilla(): Promise<TemplateVersionDefinition | null> {
    try {
      const guardadas = await this.base.plantillas
        .orderBy('guardadaEn')
        .reverse()
        .limit(1)
        .toArray();
      return (guardadas[0]?.definicion as unknown as TemplateVersionDefinition) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Crea un informe, con red o sin ella (E4.3).
   *
   * La decisión no la toma la bandeja: aquí se sabe qué errores son de red y
   * cuáles no. Un número duplicado tiene que llegar a la pantalla como error;
   * un socavón, en cambio, no puede impedir empezar el informe.
   */
  async crear(numeroInforme: string, enLinea: () => Promise<Informe>): Promise<Informe> {
    if (!this.conexion.online()) return this.crearLocal(numeroInforme);

    try {
      return await enLinea();
    } catch (error: unknown) {
      if (!this.esFalloDeRed(error)) throw error;
      return this.crearLocal(numeroInforme);
    }
  }

  /**
   * Crea un informe en el dispositivo (E4.3).
   *
   * Nace con un **id local** y con la plantilla que hubiera guardada: el
   * servidor le dará el definitivo cuando la operación suba, y hasta entonces
   * el informe existe solo aquí. Sin plantilla guardada no se puede: el editor
   * no sabría qué secciones pintar, y una pantalla en blanco es peor que un
   * «no se puede crear sin conexión todavía».
   */
  async crearLocal(numeroInforme: string): Promise<Informe> {
    const plantilla = await this.ultimaPlantilla();
    if (!plantilla) {
      throw new Error(
        'Todavía no se puede crear un informe sin conexión: abre uno con red al menos una vez ' +
          'para que la plantilla quede guardada en este dispositivo.',
      );
    }

    const informe = {
      _id: this.cola.nuevoIdLocal(),
      numeroInforme,
      templateCodigo: plantilla.codigo,
      templateVersion: plantilla.version,
      templateSnapshot: null,
      estado: 'borrador',
      bloques: [],
      comentarios: [],
      datos: {},
    } as unknown as Informe;

    await this.guardarLocal(informe);
    await this.cola.encolar('crear-informe', informe._id, { numeroInforme }, null);

    return informe;
  }

  /**
   * Informes que solo existen en el dispositivo, para la bandeja.
   *
   * Un informe local del que ya no queda ninguna operación en la cola es uno
   * que el servidor confirmó: se borra la copia con id local en lugar de
   * listarla. Si no, seguiría apareciendo como «sin sincronizar» para siempre,
   * duplicando en la bandeja el informe que sí está en el servidor.
   *
   * La cola se lee de la base, no del servicio: al arrancar la app, el estado en
   * memoria todavía está vacío y borraría lo que aún no se ha subido.
   */
  async informesLocales(): Promise<Informe[]> {
    try {
      const [guardados, operaciones] = await Promise.all([
        this.base.informes.toArray(),
        this.base.operaciones.toArray(),
      ]);

      const conPendientes = new Set(operaciones.map((o) => o.informeId));
      const locales = guardados.filter((i) => esIdLocal(i.id));

      const huerfanos = locales.filter((i) => !conPendientes.has(i.id));
      if (huerfanos.length) await this.base.informes.bulkDelete(huerfanos.map((i) => i.id));

      return locales
        .filter((i) => conPendientes.has(i.id))
        .map((i) => i.datos as unknown as Informe);
    } catch {
      return [];
    }
  }

  /**
   * Renombra la copia local con el id que asignó el servidor.
   *
   * Se llama en cuanto la creación se confirma. La copia se conserva bajo el id
   * nuevo en vez de borrarse: el técnico puede seguir sin cobertura justo
   * después de sincronizar, y perder la copia lo dejaría sin poder abrir el
   * informe que acaba de subir.
   */
  private async renombrarLocal(local: string, definitivo: string): Promise<void> {
    try {
      const guardado = await this.base.informes.get(local);
      if (!guardado) return;

      const informe = { ...(guardado.datos as Record<string, unknown>), _id: definitivo };
      await this.base.informes.put({ ...guardado, id: definitivo, datos: informe });
      await this.base.informes.delete(local);
    } catch {
      // Lo que importa ya está en el servidor. La copia vieja se limpia sola en
      // el siguiente listado de la bandeja.
    }
  }

  /** El informe tal como quedó en el dispositivo, o `null` si no está. */
  async leerLocal(id: string): Promise<Informe | null> {
    try {
      const guardado = await this.base.informes.get(id);
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
