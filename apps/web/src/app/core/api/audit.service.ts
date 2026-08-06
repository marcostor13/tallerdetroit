import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RegistroDeAuditoria {
  readonly _id: string;
  readonly actorEmail: string;
  readonly actorRol: string | null;
  readonly entidad: string;
  readonly entidadId: string;
  readonly accion: string;
  readonly etiqueta: string | null;
  readonly antes: unknown;
  readonly despues: unknown;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly fecha: string;
}

export interface FiltroDeAuditoria {
  readonly actorId?: string;
  readonly entidad?: string;
  readonly entidadId?: string;
  readonly accion?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
  readonly skip?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/audit`;

  consultar(filtro: FiltroDeAuditoria = {}) {
    let params = new HttpParams();
    for (const [campo, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(campo, String(valor));
      }
    }

    return firstValueFrom(
      this.http.get<{ total: number; items: RegistroDeAuditoria[] }>(this.base, { params }),
    );
  }
}
