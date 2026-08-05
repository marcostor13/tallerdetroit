export const environment = {
  production: false,
  name: 'local' as const,
  apiUrl: '/api/v1',
  /** Autoguardado del editor de informes (UX-01: cada 20–30 s). */
  autosaveIntervalMs: 20_000,
  /** Compresión de imágenes en cliente antes de subir a S3 (UX-04). */
  imageMaxDimension: 1600,
  imageQuality: 0.8,
  /** Sincronización delta de maestros para el modo offline (§18). */
  mastersSyncIntervalMs: 4 * 60 * 60 * 1000,
  sentryDsn: '',
};
