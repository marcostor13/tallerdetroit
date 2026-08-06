import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Configuración tipada y validada al arrancar.
 *
 * Si falta un secreto o es demasiado corto, el proceso **no arranca**. Es
 * preferible un fallo ruidoso en el despliegue a un servicio en producción
 * firmando tokens con una clave débil.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL = 'info';

  @IsString()
  @MinLength(10)
  MONGODB_URI!: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  JWT_REFRESH_TTL = '7d';

  @IsInt()
  @Min(8)
  PASSWORD_MIN_LENGTH = 12;

  @IsInt()
  @Min(1)
  LOGIN_MAX_ATTEMPTS = 5;

  @IsInt()
  @Min(1)
  LOGIN_LOCKOUT_MINUTES = 15;

  /** Orígenes permitidos para CORS, separados por coma. */
  @IsString()
  CORS_ORIGINS = 'http://localhost:4200';

  /**
   * Dónde vive la app pública. De aquí sale la URL del QR de verificación.
   *
   * Se declara aparte de `CORS_ORIGINS` aunque hoy coincidan: el QR va impreso
   * en un documento que dura años, y no puede depender de cuál sea el primer
   * origen de una lista que alguien reordene un día.
   */
  @IsString()
  PUBLIC_APP_URL = 'http://localhost:4200';

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsBoolean()
  S3_FORCE_PATH_STYLE = false;

  @IsOptional()
  @IsString()
  AWS_REGION?: string;

  @IsOptional()
  @IsString()
  AWS_S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  AWS_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsInt()
  @Min(60)
  S3_SIGNED_URL_TTL = 900;

  // --- Correo saliente ---
  // `gmail` usa una contraseña de aplicación; `smtp` usa SMTP_URL.
  @IsOptional()
  @IsIn(['gmail', 'smtp', 'none'])
  EMAIL_PROVIDER?: 'gmail' | 'smtp' | 'none';

  @IsOptional()
  @IsString()
  USER_EMAIL?: string;

  @IsOptional()
  @IsString()
  PASSWORD_EMAIL?: string;

  @IsOptional()
  @IsString()
  SMTP_URL?: string;

  @IsString()
  MAIL_FROM = 'Informes Técnicos DPS <no-reply@detroitpower.pe>';

  /**
   * Expone `/api/docs`. Se separa de NODE_ENV a propósito: los contenedores
   * corren con `production` también en develop, donde sí queremos la
   * documentación. Sin definir, se expone solo fuera de producción.
   */
  @IsOptional()
  @IsBoolean()
  ENABLE_API_DOCS?: boolean;

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;
}

/**
 * Configuración del transporte de correo a partir del proveedor elegido.
 * Las notificaciones (envío a revisión, observado, aprobado, emitido) llegan en
 * F3; esto deja resuelta la configuración desde ahora.
 */
export function mailTransport(config: EnvironmentVariables) {
  if (config.EMAIL_PROVIDER === 'gmail') {
    if (!config.USER_EMAIL || !config.PASSWORD_EMAIL) {
      throw new Error('EMAIL_PROVIDER=gmail requiere USER_EMAIL y PASSWORD_EMAIL.');
    }
    return {
      service: 'gmail',
      auth: { user: config.USER_EMAIL, pass: config.PASSWORD_EMAIL },
    } as const;
  }
  if (config.EMAIL_PROVIDER === 'smtp') {
    if (!config.SMTP_URL) throw new Error('EMAIL_PROVIDER=smtp requiere SMTP_URL.');
    return { url: config.SMTP_URL } as const;
  }
  return null;
}

const NUMERIC_KEYS = new Set([
  'PORT',
  'PASSWORD_MIN_LENGTH',
  'LOGIN_MAX_ATTEMPTS',
  'LOGIN_LOCKOUT_MINUTES',
  'S3_SIGNED_URL_TTL',
]);
const BOOLEAN_KEYS = new Set(['S3_FORCE_PATH_STYLE', 'ENABLE_API_DOCS']);

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === '') continue;
    if (NUMERIC_KEYS.has(key)) coerced[key] = Number(value);
    else if (BOOLEAN_KEYS.has(key)) coerced[key] = value === 'true' || value === true;
    else coerced[key] = value;
  }

  const config = plainToInstance(EnvironmentVariables, coerced, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  · ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${detail}`);
  }

  return config;
}

/**
 * Convierte la lista separada por comas de `CORS_ORIGINS` en un array.
 *
 * Recibe la cadena y no el objeto de configuración a propósito: antes aceptaba
 * `EnvironmentVariables` y en `main.ts` se le pasaba el `ConfigService`, que no
 * tiene esa propiedad. Con un tipo primitivo el error es imposible de cometer.
 */
export function parseCorsOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
