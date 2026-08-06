import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AppliedSpec,
  ChecklistCapturado,
  ChecklistItem,
  ConclusionPropuesta,
  MeasurementState,
  MissingBlock,
  ReportStatus,
  TemplateVersionDefinition,
} from '@dps/shared';
import { environment } from '../../../environments/environment';

export interface FotoInforme {
  readonly id: string;
  readonly s3Key: string;
  readonly thumbKey?: string | null;
  caption?: string | null;
  /** Lo calcula el servidor desde el orden de los bloques (RN-06). Nunca se envía. */
  readonly numeroFigura?: number | null;
}

/**
 * Grilla tal como la devuelve el servidor (§12.4.3).
 *
 * Los estados, el veredicto y la especificación aplicada los calcula el
 * backend; aquí llegan ya congelados. El cliente los reevalúa en vivo mientras
 * se teclea, pero lo que vale es esto.
 */
export interface GrillaGuardada {
  readonly plantilla: string;
  readonly nombre: string;
  readonly unidad: string;
  readonly filas: readonly string[];
  readonly columnas: readonly string[];
  readonly valores: readonly {
    readonly fila: string;
    readonly columna: string;
    readonly valor: number | null;
    readonly estado: MeasurementState | null;
    readonly calculado: boolean;
  }[];
  readonly especificacion: AppliedSpec | null;
  readonly resumen: {
    readonly capturadas?: number;
    readonly esperadas?: number;
    readonly alertas?: number;
    readonly fueraTolerancia?: number;
    readonly veredicto?: string | null;
  };
  readonly justificacion?: string | null;
}

export interface BloqueInforme {
  readonly id: string;
  readonly clave: string;
  readonly tipo: string;
  orden: number;
  titulo?: string | null;
  texto?: string | null;
  fechaTrabajo?: string | null;
  veredicto?: string | null;
  accionRecomendada?: string | null;
  fotos?: FotoInforme[];
  mediciones?: GrillaGuardada[];
  /** Inventario de desarmado del bloque `checklist` (D4). */
  checklist?: {
    clave?: string | null;
    items?: ChecklistItem[];
    capturado?: ChecklistCapturado[];
  } | null;
  datos?: unknown;
  visible?: boolean;
}

export interface Informe {
  readonly _id: string;
  numeroInforme: string;
  numeroOt?: string | null;
  workOrderId?: string | null;
  readonly templateCodigo: string;
  readonly templateVersion: string;
  readonly templateSnapshot?: TemplateVersionDefinition | null;
  cliente?: { id?: string | null; nombre?: string | null };
  sede?: { id?: string | null; nombre?: string | null };
  equipo?: Record<string, unknown>;
  motor?: Record<string, unknown>;
  datos?: Record<string, unknown>;
  bloques: BloqueInforme[];
  readonly estado: ReportStatus;
  readonly fechaEmision?: string | null;
  readonly updatedAt?: string;
}

export interface ResumenInforme {
  readonly _id: string;
  readonly numeroInforme: string;
  readonly numeroOt?: string | null;
  readonly estado: ReportStatus;
  readonly cliente?: { nombre?: string | null };
  readonly equipo?: Record<string, unknown>;
  readonly fechaEmision?: string | null;
  readonly updatedAt?: string;
}

export interface Validacion {
  readonly emitible: boolean;
  readonly faltan: MissingBlock[];
}

export interface Guardado {
  readonly guardadoEn: string;
  readonly informe: Informe;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/reports`;

  list(filtros: Record<string, string | null | undefined> = {}) {
    let params = new HttpParams();
    for (const [campo, valor] of Object.entries(filtros)) {
      if (valor) params = params.set(campo, valor);
    }
    return firstValueFrom(
      this.http.get<{ total: number; items: ResumenInforme[] }>(this.base, { params }),
    );
  }

  findById(id: string): Promise<Informe> {
    return firstValueFrom(this.http.get<Informe>(`${this.base}/${id}`));
  }

  create(datos: Record<string, unknown>): Promise<Informe> {
    return firstValueFrom(this.http.post<Informe>(this.base, datos));
  }

  /** Autoguardado: solo los campos que cambiaron (NFR-02). */
  patch(id: string, cambios: Record<string, unknown>): Promise<Guardado> {
    return firstValueFrom(this.http.patch<Guardado>(`${this.base}/${id}`, cambios));
  }

  validate(id: string): Promise<Validacion> {
    return firstValueFrom(this.http.get<Validacion>(`${this.base}/${id}/validacion`));
  }

  addBlock(id: string, bloque: Record<string, unknown>): Promise<Informe> {
    return firstValueFrom(this.http.post<Informe>(`${this.base}/${id}/bloques`, bloque));
  }

  updateBlock(id: string, bloqueId: string, cambios: Record<string, unknown>): Promise<Informe> {
    return firstValueFrom(
      this.http.patch<Informe>(`${this.base}/${id}/bloques/${bloqueId}`, cambios),
    );
  }

  removeBlock(id: string, bloqueId: string): Promise<Informe> {
    return firstValueFrom(this.http.delete<Informe>(`${this.base}/${id}/bloques/${bloqueId}`));
  }

  /**
   * Guarda una grilla de medición del bloque (E2.4).
   *
   * Solo van los valores en crudo. Los estados y la tolerancia aplicada los
   * calcula el servidor: si el cliente pudiera enviarlos, una petición hecha a
   * mano dejaría un motor fuera de tolerancia registrado como correcto.
   */
  guardarMedicion(
    id: string,
    bloqueId: string,
    captura: {
      plantilla: string;
      valores: Record<string, number | null>;
      justificacion?: string | null;
    },
  ): Promise<Informe> {
    return firstValueFrom(
      this.http.post<Informe>(`${this.base}/${id}/bloques/${bloqueId}/mediciones`, captura),
    );
  }

  /**
   * Guarda el inventario de desarmado del bloque (E2.7).
   *
   * Solo viaja lo encontrado: el catálogo lo copia el servidor desde el maestro
   * y lo congela en el informe.
   */
  guardarChecklist(
    id: string,
    bloqueId: string,
    captura: { clave?: string | null; capturado: ChecklistCapturado[] },
  ): Promise<Informe> {
    return firstValueFrom(
      this.http.post<Informe>(`${this.base}/${id}/bloques/${bloqueId}/checklist`, captura),
    );
  }

  quitarMedicion(id: string, bloqueId: string, plantilla: string): Promise<Informe> {
    return firstValueFrom(
      this.http.delete<Informe>(`${this.base}/${id}/bloques/${bloqueId}/mediciones/${plantilla}`),
    );
  }

  /** Conclusiones propuestas desde las mediciones y frases ya usadas (E2.5). */
  conclusionesSugeridas(
    id: string,
  ): Promise<{ propuestas: ConclusionPropuesta[]; frecuentes: { texto: string; usos: number }[] }> {
    return firstValueFrom(
      this.http.get<{
        propuestas: ConclusionPropuesta[];
        frecuentes: { texto: string; usos: number }[];
      }>(`${this.base}/${id}/conclusiones-sugeridas`),
    );
  }

  /** Por índices: es lo que producen tanto el arrastre como el teclado. */
  reorder(id: string, desde: number, hasta: number): Promise<Informe> {
    return firstValueFrom(
      this.http.post<Informe>(`${this.base}/${id}/bloques/reordenar`, { desde, hasta }),
    );
  }

  transition(id: string, estado: ReportStatus, comentario?: string): Promise<Informe> {
    return firstValueFrom(
      this.http.post<Informe>(`${this.base}/${id}/estado`, { estado, comentario }),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class TemplatesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/templates`;

  vigente(codigo: string): Promise<TemplateVersionDefinition> {
    return firstValueFrom(
      this.http.get<TemplateVersionDefinition>(`${this.base}/${codigo}/vigente`),
    );
  }

  version(codigo: string, version: string): Promise<TemplateVersionDefinition> {
    return firstValueFrom(
      this.http.get<TemplateVersionDefinition>(`${this.base}/${codigo}/versiones/${version}`),
    );
  }
}
