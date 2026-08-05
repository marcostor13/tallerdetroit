export const environment = {
  production: true,
  name: 'production' as const,
  apiUrl: 'https://tallerdetroitapi.tecdidata.com/api/v1',
  autosaveIntervalMs: 20_000,
  imageMaxDimension: 1600,
  imageQuality: 0.8,
  mastersSyncIntervalMs: 4 * 60 * 60 * 1000,
  sentryDsn: '',
};
