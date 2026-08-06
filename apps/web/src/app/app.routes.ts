import type { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/auth/auth.guard';
import { environment } from '../environments/environment';

/**
 * Bancos de prueba de componentes, para verificarlos en un navegador real
 * antes de que la pantalla que los usa exista.
 *
 * **Fuera del artefacto de producción.** Con `production` en true el array
 * queda vacío y el `loadComponent` nunca se evalúa, así que el componente ni
 * siquiera entra en el bundle.
 */
const rutasDePrueba: Routes = environment.production
  ? []
  : [
      {
        path: 'pruebas/grilla',
        title: 'Banco de pruebas — grilla de medición',
        loadComponent: () =>
          import('./features/mediciones/banco-grilla.page').then((m) => m.BancoGrillaPage),
      },
    ];

/**
 * Rutas de la aplicación.
 *
 * Todo se carga de forma diferida salvo el shell: la meta de carga inicial es
 * < 3 s en 4G (NFR-01), así que el bundle inicial solo lleva lo imprescindible.
 * Las rutas de negocio se van habilitando por fase según `PLAN.md`.
 */
export const routes: Routes = [
  ...rutasDePrueba,
  /**
   * Verificación pública (E3.6): el destino del QR del documento.
   *
   * Fuera del shell y sin `authGuard` a propósito. Un QR impreso que exige
   * iniciar sesión no lo escanea nadie, y quien lo escanea suele ser el
   * cliente o un auditor, que no tienen cuenta.
   */
  {
    path: 'v/:numero',
    title: 'Verificación de informe — Detroit Power System',
    loadComponent: () =>
      import('./features/verificacion/verificacion.page').then((m) => m.VerificacionPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión — Informes Técnicos DPS',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio — Informes Técnicos DPS',
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'informes',
        canActivate: [permissionGuard(['reports:read'])],
        title: 'Informes — DPS',
        loadComponent: () => import('./features/informes/bandeja.page').then((m) => m.BandejaPage),
      },
      {
        path: 'informes/:id',
        canActivate: [permissionGuard(['reports:read'])],
        title: 'Editor de informe — DPS',
        loadComponent: () =>
          import('./features/informes/informe-editor.page').then((m) => m.InformeEditorPage),
      },
      {
        path: 'equipos',
        canActivate: [permissionGuard(['masters:read'])],
        title: 'Equipos y motores — DPS',
        loadComponent: () => import('./features/errors/error.page').then((m) => m.ErrorPage),
        data: {
          code: 'F1',
          title: 'Equipos y motores',
          message: 'Se habilita en la fase F1 del plan de construcción.',
          icon: 'construction',
        },
      },
      {
        path: 'maestros',
        canActivate: [permissionGuard(['masters:read'])],
        title: 'Maestros — DPS',
        loadComponent: () => import('./features/errors/error.page').then((m) => m.ErrorPage),
        data: {
          code: 'F1',
          title: 'Maestros',
          message: 'Se habilita en la fase F1 del plan de construcción.',
          icon: 'construction',
        },
      },
      {
        path: 'plantillas',
        canActivate: [permissionGuard(['templates:read'])],
        title: 'Formato del informe — DPS',
        loadComponent: () =>
          import('./features/plantillas/plantillas.page').then((m) => m.PlantillasPage),
      },
      {
        path: 'analitica',
        canActivate: [permissionGuard(['analytics:read'])],
        title: 'Analítica — DPS',
        loadComponent: () => import('./features/errors/error.page').then((m) => m.ErrorPage),
        data: {
          code: 'F5',
          title: 'Analítica',
          message: 'Se habilita en la fase F5 del plan de construcción.',
          icon: 'construction',
        },
      },
      {
        path: 'auditoria',
        canActivate: [permissionGuard(['audit:read'])],
        title: 'Auditoría — DPS',
        loadComponent: () =>
          import('./features/auditoria/auditoria.page').then((m) => m.AuditoriaPage),
      },
      {
        path: 'administracion',
        canActivate: [permissionGuard(['users:read', 'settings:write'])],
        title: 'Administración — DPS',
        loadComponent: () => import('./features/errors/error.page').then((m) => m.ErrorPage),
        data: {
          code: 'F0',
          title: 'Administración',
          message: 'Gestión de usuarios y configuración del sistema.',
          icon: 'construction',
        },
      },
      {
        path: 'perfil',
        title: 'Mi perfil — DPS',
        loadComponent: () => import('./features/perfil/perfil.page').then((m) => m.PerfilPage),
      },
      {
        path: 'sin-permiso',
        title: 'Sin permiso — DPS',
        loadComponent: () => import('./features/errors/error.page').then((m) => m.ErrorPage),
        data: {
          code: '403',
          title: 'No tienes permiso',
          message:
            'Tu rol no incluye acceso a esta sección. Si crees que es un error, contacta al administrador.',
          icon: 'lock',
        },
      },
      {
        path: '**',
        title: 'No encontrado — DPS',
        loadComponent: () => import('./features/errors/error.page').then((m) => m.ErrorPage),
      },
    ],
  },
];
