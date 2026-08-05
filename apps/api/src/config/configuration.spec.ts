import {
  EnvironmentVariables,
  mailTransport,
  parseCorsOrigins,
  validateEnv,
} from './configuration';

const BASE_ENV = {
  NODE_ENV: 'production',
  PORT: '3000',
  MONGODB_URI: 'mongodb://localhost:27017/dps',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  CORS_ORIGINS: 'https://tallerdetroit.tecdidata.com',
};

describe('parseCorsOrigins', () => {
  it('separa por comas y limpia espacios', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com ,https://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('acepta un único origen', () => {
    expect(parseCorsOrigins('https://tallerdetroit.tecdidata.com')).toEqual([
      'https://tallerdetroit.tecdidata.com',
    ]);
  });

  it('descarta entradas vacías por comas de más', () => {
    expect(parseCorsOrigins('https://a.com,,https://b.com,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  // Esta es la regresión concreta: en main.ts se pasaba el ConfigService en vez
  // del valor, la propiedad llegaba undefined y el arranque moría con
  // "Cannot read properties of undefined (reading 'split')".
  it('no revienta con undefined ni con cadena vacía', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins('   ')).toEqual([]);
  });
});

describe('validateEnv', () => {
  it('acepta una configuración correcta y aplica los valores por defecto', () => {
    const config = validateEnv(BASE_ENV);
    expect(config.PORT).toBe(3000);
    expect(config.JWT_ACCESS_TTL).toBe('15m');
    expect(config.PASSWORD_MIN_LENGTH).toBe(12);
    expect(config.MAIL_FROM).toContain('detroitpower.pe');
  });

  it('convierte a número los campos numéricos que llegan como texto', () => {
    const config = validateEnv({ ...BASE_ENV, PORT: '8080', LOGIN_MAX_ATTEMPTS: '3' });
    expect(config.PORT).toBe(8080);
    expect(config.LOGIN_MAX_ATTEMPTS).toBe(3);
  });

  it('rechaza secretos JWT demasiado cortos (§20)', () => {
    expect(() => validateEnv({ ...BASE_ENV, JWT_ACCESS_SECRET: 'corto' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('exige MONGODB_URI', () => {
    const { MONGODB_URI: _omitido, ...sinMongo } = BASE_ENV;
    expect(() => validateEnv(sinMongo)).toThrow(/MONGODB_URI/);
  });

  it('ignora las variables ajenas del entorno del contenedor', () => {
    const config = validateEnv({ ...BASE_ENV, PATH: '/usr/bin', HOSTNAME: 'abc123' });
    expect(config.CORS_ORIGINS).toBe(BASE_ENV.CORS_ORIGINS);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(() => validateEnv({ ...BASE_ENV, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});

describe('mailTransport', () => {
  function config(overrides: Partial<EnvironmentVariables>): EnvironmentVariables {
    return validateEnv({ ...BASE_ENV, ...overrides } as Record<string, unknown>);
  }

  it('con gmail usa la contraseña de aplicación', () => {
    const transport = mailTransport(
      config({ EMAIL_PROVIDER: 'gmail', USER_EMAIL: 'a@b.com', PASSWORD_EMAIL: 'clave' }),
    );
    expect(transport).toEqual({ service: 'gmail', auth: { user: 'a@b.com', pass: 'clave' } });
  });

  it('con gmail sin credenciales falla de forma explícita', () => {
    expect(() => mailTransport(config({ EMAIL_PROVIDER: 'gmail' }))).toThrow(/USER_EMAIL/);
  });

  it('con smtp exige SMTP_URL', () => {
    expect(() => mailTransport(config({ EMAIL_PROVIDER: 'smtp' }))).toThrow(/SMTP_URL/);
    expect(mailTransport(config({ EMAIL_PROVIDER: 'smtp', SMTP_URL: 'smtp://x:1025' }))).toEqual({
      url: 'smtp://x:1025',
    });
  });

  it('sin proveedor no configura transporte', () => {
    expect(mailTransport(config({ EMAIL_PROVIDER: 'none' }))).toBeNull();
    expect(mailTransport(config({}))).toBeNull();
  });
});
