import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MissingBlock, ReportStatus, TemplateVersionDefinition } from '@dps/shared';
import { environment } from '../../../environments/environment';

export interface FotoInforme {
  readonly id: string;
  readonly s3Key: string;
  readonly thumbKey?: string | null;
  caption?: string | null;
  /** Lo calcula el servidor desde el orden de los bloques (RN-06). Nunca se envía. */
  readonly numeroFigura?: number | null;
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
