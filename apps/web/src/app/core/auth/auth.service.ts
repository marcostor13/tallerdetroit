import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Permission } from '@dps/shared';
import { environment } from '../../../environments/environment';
import type { AuthUser, LoginRequest, LoginResponse } from './auth.models';

/**
 * Sesión del usuario.
 *
 * El *refresh token* vive en una cookie `httpOnly`/`Secure`/`SameSite=Strict` que
 * JavaScript no puede leer (§20). Aquí solo se guarda el *access token* en memoria:
 * no va a `localStorage` para no exponerlo a XSS. Al recargar la página se
 * recupera la sesión con `/auth/refresh`, que usa la cookie.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly accessToken = signal<string | null>(null);

  readonly user = signal<AuthUser | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  /** `null` mientras aún no se ha intentado restaurar la sesión al arrancar. */
  readonly initialized = signal(false);

  token(): string | null {
    return this.accessToken();
  }

  can(permission: Permission): boolean {
    return this.user()?.permisos.includes(permission) ?? false;
  }

  canAny(permissions: readonly Permission[]): boolean {
    return permissions.some((p) => this.can(p));
  }

  async login(credentials: LoginRequest): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, credentials, {
        withCredentials: true,
      }),
    );
    this.accessToken.set(res.accessToken);
    this.user.set(res.user);
  }

  /**
   * Intenta restaurar la sesión con la cookie de refresh. Se llama al arrancar
   * la app; un fallo aquí es normal (usuario no autenticado), no un error.
   */
  async restore(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>(
          `${environment.apiUrl}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );
      this.accessToken.set(res.accessToken);
      this.user.set(res.user);
    } catch {
      this.accessToken.set(null);
      this.user.set(null);
    } finally {
      this.initialized.set(true);
    }
  }

  async refresh(): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>(
          `${environment.apiUrl}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );
      this.accessToken.set(res.accessToken);
      this.user.set(res.user);
      return res.accessToken;
    } catch {
      this.clear();
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true }),
      );
    } catch {
      // Aunque el servidor falle, la sesión local se cierra igual.
    }
    this.clear();
    await this.router.navigate(['/login']);
  }

  clear(): void {
    this.accessToken.set(null);
    this.user.set(null);
  }
}
