import type { Permission, Role } from '@dps/shared';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
  readonly rol: Role;
  readonly permisos: readonly Permission[];
  readonly unidadNegocioId: string | null;
  readonly tecnicoId: string | null;
  readonly mfaHabilitado: boolean;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly totp?: string;
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly user: AuthUser;
}

/** Error RFC 7807 (`application/problem+json`) — formato de error de la API. */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  /** Errores por campo, para pintarlos junto al input que corresponde. */
  readonly errors?: Readonly<Record<string, readonly string[]>>;
}
