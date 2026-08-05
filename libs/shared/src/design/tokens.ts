/**
 * Tokens de color compartidos entre la app y el render de documentos.
 *
 * El worker genera el PDF con Chromium a partir de HTML: debe usar exactamente
 * los mismos valores que la interfaz para que la vista previa WYSIWYG (UX-06)
 * sea fiel. Fuente normativa: `.claude/DESIGN-SYSTEM.md`.
 */

export const BRAND = {
  red: '#983128',
  gray: '#676669',
  ink: '#231F20',
} as const;

export const LIGHT = {
  surface: '#F9F9F9',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F3F3F3',
  surfaceContainer: '#EEEEEE',
  onSurface: '#1A1C1C',
  secondary: '#5F5E5E',
  grayMedium: '#7A7A7A',
  borderSubtle: '#E5E5E5',
  outline: '#8C716E',
  primary: '#821012',
  primaryContainer: '#A32A26',
  success: '#146B3A',
  successContainer: '#A8F0C1',
  warning: '#8A5300',
  warningContainer: '#FFDDB3',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
} as const;

export const DARK = {
  surface: '#131313',
  surfaceContainerLowest: '#0E0E0E',
  surfaceContainerLow: '#1B1C1C',
  surfaceContainer: '#1F2020',
  onSurface: '#E2E2E2',
  secondary: '#C8C6C6',
  grayMedium: '#929090',
  borderSubtle: '#2E2E2E',
  outline: '#929090',
  primary: '#FFB4AC',
  primaryContainer: '#8B1818',
  success: '#8CD9A8',
  successContainer: '#005226',
  warning: '#FFB95C',
  warningContainer: '#683C00',
  error: '#FFB4AB',
  errorContainer: '#93000A',
} as const;

/**
 * El documento generado NUNCA usa el tema oscuro: replica el formato controlado
 * SER-FOR-002, que es siempre sobre papel blanco.
 */
export const DOCUMENT_STYLE = {
  page: { size: 'A4', margin: '25mm' },
  background: '#FFFFFF',
  ink: LIGHT.onSurface,
  rule: BRAND.ink,
  headingFont: 'Montserrat',
  bodyFont: 'Hanken Grotesk',
  dataFont: 'JetBrains Mono',
  bodySizePt: 11,
  tableSizePt: 9,
  watermark: { text: 'BORRADOR', color: BRAND.red, opacity: 0.08 },
} as const;

/** Color del semáforo por estado, para pantalla y para documento. */
export const MEASUREMENT_COLORS = {
  ok: { light: LIGHT.success, dark: DARK.success, icon: 'check_circle' },
  alerta: { light: LIGHT.warning, dark: DARK.warning, icon: 'warning' },
  fuera: { light: LIGHT.error, dark: DARK.error, icon: 'error' },
} as const;

/**
 * En el PDF el color no basta: el informe puede imprimirse en blanco y negro.
 * Los valores fuera de tolerancia van además en negrita.
 */
export const DOCUMENT_MEASUREMENT_STYLE = {
  ok: { fontWeight: 500 },
  alerta: { fontWeight: 500, textDecoration: 'underline' },
  fuera: { fontWeight: 700, color: LIGHT.error },
} as const;
