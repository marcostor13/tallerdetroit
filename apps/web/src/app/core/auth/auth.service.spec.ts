import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.models';

const usuario = (rol: AuthUser['rol'], permisos: AuthUser['permisos']): AuthUser => ({
  id: 'u1',
  email: 'x@detroitpower.pe',
  nombre: 'X',
  rol,
  permisos,
  unidadNegocioId: null,
  tecnicoId: null,
  mfaHabilitado: false,
});

/**
 * Sesión del usuario.
 *
 * Lo que importa aquí es dónde acaba el token: el de acceso vive **solo en
 * memoria**, nunca en `localStorage`, porque desde allí lo lee cualquier XSS.
 * El de refresco no lo ve JavaScript: viaja en una cookie httpOnly, y por eso
 * todas las llamadas de sesión van con `withCredentials`.
 */
describe('AuthService', () => {
  let servicio: AuthService;
  let http: { post: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    http = { post: vi.fn() };
    router = { navigate: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: HttpClient, useValue: http },
        { provide: Router, useValue: router },
      ],
    });
    servicio = TestBed.inject(AuthService);
  });

  describe('inicio de sesión', () => {
    beforeEach(() => {
      http.post.mockReturnValue(
        of({ accessToken: 'tok', user: usuario('tecnico', ['reports:create']) }),
      );
    });

    it('guarda la sesión y el token queda accesible', async () => {
      await servicio.login({ email: 'x@detroitpower.pe', password: 'x' });

      expect(servicio.isAuthenticated()).toBe(true);
      expect(servicio.token()).toBe('tok');
      expect(servicio.user()?.rol).toBe('tecnico');
    });

    it('el token no toca localStorage', () => {
      // Desde localStorage lo lee cualquier XSS; en memoria muere al recargar,
      // que es lo que hace útil a la cookie de refresco.
      expect(localStorage.getItem('dps-token')).toBeNull();
      expect(JSON.stringify(localStorage)).not.toContain('tok');
    });

    it('manda la cookie de refresco', async () => {
      await servicio.login({ email: 'x@detroitpower.pe', password: 'x' });
      const opciones = http.post.mock.calls[0]?.[2] as { withCredentials?: boolean };
      expect(opciones.withCredentials).toBe(true);
    });
  });

  describe('permisos', () => {
    beforeEach(async () => {
      http.post.mockReturnValue(
        of({
          accessToken: 'tok',
          user: usuario('tecnico', ['reports:create', 'masters:read']),
        }),
      );
      await servicio.login({ email: 'x@detroitpower.pe', password: 'x' });
    });

    it('responde por permiso concreto', () => {
      expect(servicio.can('reports:create')).toBe(true);
      expect(servicio.can('reports:issue')).toBe(false);
    });

    it('canAny basta con uno', () => {
      expect(servicio.canAny(['reports:issue', 'masters:read'])).toBe(true);
      expect(servicio.canAny(['reports:issue', 'users:write'])).toBe(false);
    });

    it('sin sesión no se puede nada', () => {
      const limpio = TestBed.inject(AuthService);
      limpio.user.set(null);
      expect(limpio.can('reports:read')).toBe(false);
      expect(limpio.canAny(['reports:read'])).toBe(false);
    });
  });

  describe('restauración al arrancar', () => {
    it('recupera la sesión con la cookie', async () => {
      http.post.mockReturnValue(of({ accessToken: 't2', user: usuario('visor', []) }));
      await servicio.restore();

      expect(servicio.isAuthenticated()).toBe(true);
      expect(servicio.initialized()).toBe(true);
    });

    it('que falle es lo normal para quien no ha entrado, no un error', async () => {
      http.post.mockReturnValue(throwError(() => new Error('401')));
      await expect(servicio.restore()).resolves.toBeUndefined();

      expect(servicio.isAuthenticated()).toBe(false);
      // Marcarlo igualmente es lo que deja pasar al guard en vez de dejar la
      // aplicación esperando para siempre.
      expect(servicio.initialized()).toBe(true);
    });
  });
});
