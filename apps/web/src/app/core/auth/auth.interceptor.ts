import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Rutas que no llevan token y no deben disparar el reintento con refresh. */
const PUBLIC_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/health', '/verificar'];

function isPublic(url: string): boolean {
  return PUBLIC_PATHS.some((p) => url.includes(p));
}

/**
 * Adjunta el access token y, ante un 401, intenta una única renovación con la
 * cookie de refresh antes de rendirse. El refresh es rotativo (§20), así que un
 * segundo 401 significa sesión realmente expirada.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api/');
  if (!isApi || isPublic(req.url)) return next(req);

  const token = auth.token();
  const authorized = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` }, withCredentials: true })
    : req.clone({ withCredentials: true });

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return from(auth.refresh()).pipe(
        switchMap((fresh) => {
          if (!fresh) {
            void router.navigate(['/login'], {
              queryParams: { redirectTo: router.url },
            });
            return throwError(() => error);
          }
          return next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${fresh}` },
              withCredentials: true,
            }),
          );
        }),
      );
    }),
  );
};
