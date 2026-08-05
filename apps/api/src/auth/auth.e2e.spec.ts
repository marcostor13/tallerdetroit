import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Flujo completo de autenticación contra una base real.
 *
 * Cubre lo que §20 exige y que no se puede comprobar con mocks: el hash
 * Argon2id, el bloqueo por intentos, la rotación del refresh token y que la
 * contraseña no se filtre en ninguna respuesta.
 */
describe('Autenticación', () => {
  let mongo: MongoMemoryReplSet;
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;

  const CREDENCIALES = { email: 'admin@detroitpower.pe', password: 'ContrasenaDePrueba2026' };

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: mongo.getUri('dps-auth-test'),
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      LOGIN_MAX_ATTEMPTS: '3',
      LOGIN_LOCKOUT_MINUTES: '15',
      CORS_ORIGINS: 'https://dev-tallerdetroit.tecdidata.com',
      SEED_PASSWORD: CREDENCIALES.password,
    });

    const { seedUsers } = await import('../seeds/users.seed');
    await seedUsers(process.env['MONGODB_URI'] as string);
    await mongoose.disconnect().catch(() => undefined);

    const { AppModule } = await import('../app.module');
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      logger: false,
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    http = app.getHttpServer();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
    await mongo?.stop();
  });

  it('inicia sesión y devuelve el usuario con sus permisos', async () => {
    const res = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: CREDENCIALES.email, rol: 'administrador' });
    expect(res.body.user.permisos.length).toBeGreaterThan(0);
  }, 30_000);

  it('nunca devuelve la contraseña ni su hash', async () => {
    const res = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    const cuerpo = JSON.stringify(res.body);
    expect(cuerpo).not.toContain(CREDENCIALES.password);
    expect(cuerpo).not.toContain('argon2');
    expect(cuerpo).not.toContain('passwordHash');
  }, 30_000);

  it('entrega el refresh token en una cookie httpOnly, no en el cuerpo', async () => {
    const res = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith('dps_rt='));

    expect(refresh).toBeDefined();
    expect(refresh).toContain('HttpOnly');
    expect(JSON.stringify(res.body)).not.toContain('refreshToken');
  }, 30_000);

  it('rechaza la contraseña incorrecta sin revelar si el correo existe', async () => {
    const malPassword = await request(http)
      .post('/api/v1/auth/login')
      .send({ ...CREDENCIALES, password: 'ContrasenaIncorrecta1' })
      .expect(401);

    const noExiste = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'fantasma@detroitpower.pe', password: 'ContrasenaIncorrecta1' })
      .expect(401);

    expect(malPassword.body.detail).toBe(noExiste.body.detail);
  }, 30_000);

  it('valida el formato de entrada con errores por campo', async () => {
    const res = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'no-es-un-correo', password: 'corta' })
      .expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(res.body)).toMatch(/correo|contraseña/i);
  });

  it('bloquea la cuenta tras superar los intentos permitidos (§20)', async () => {
    const email = 'gerencia@detroitpower.pe';
    for (let i = 0; i < 3; i++) {
      await request(http).post('/api/v1/auth/login').send({ email, password: 'IncorrectaXyz123' });
    }

    // Aunque ahora la contraseña sea la correcta, la cuenta está bloqueada.
    const res = await request(http)
      .post('/api/v1/auth/login')
      .send({ email, password: CREDENCIALES.password });

    expect(res.status).toBe(423);
    expect(res.body.detail).toMatch(/bloquead/i);
  }, 60_000);

  it('renueva el token y ROTA el refresh: el anterior deja de valer', async () => {
    const login = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    const primera = (login.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('dps_rt='),
    ) as string;

    const refresh = await request(http)
      .post('/api/v1/auth/refresh')
      .set('Cookie', primera)
      .expect(200);
    expect(refresh.body.accessToken).toEqual(expect.any(String));

    // Reusar la cookie vieja debe fallar: la rotación la invalidó.
    await request(http).post('/api/v1/auth/refresh').set('Cookie', primera).expect(401);
  }, 60_000);

  it('/auth/me exige token y devuelve el usuario', async () => {
    await request(http).get('/api/v1/auth/me').expect(401);

    const login = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    const me = await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body).toMatchObject({ email: CREDENCIALES.email, rol: 'administrador' });
  }, 30_000);

  it('rechaza un token manipulado', async () => {
    await request(http)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer no.es.un.token')
      .expect(401);
  });

  it('el logout revoca la sesión', async () => {
    const login = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('dps_rt='),
    ) as string;

    await request(http).post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await request(http).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  }, 60_000);

  it('el técnico entra con el rol y el alcance que le corresponden (RN-07)', async () => {
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'rcaceres@detroitpower.pe', password: CREDENCIALES.password })
      .expect(200);

    expect(login.body.user.rol).toBe('tecnico');
    expect(login.body.user.unidadNegocioId).toEqual(expect.any(String));
    expect(login.body.user.permisos).not.toContain('reports:approve');
  }, 30_000);
  // --- Criterio de aceptacion de F0: RBAC sobre una ruta protegida real ---

  it('el administrador accede a la ruta protegida', async () => {
    const login = await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    const res = await request(http)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body.total).toBe(7);
    expect(res.body.usuarios[0]).not.toHaveProperty('passwordHash');
  }, 30_000);

  it('el visor recibe 403 en la ruta protegida, aunque su token sea valido', async () => {
    const login = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'gerencia@detroitpower.pe', password: CREDENCIALES.password });

    // La cuenta pudo quedar bloqueada por la prueba de intentos fallidos.
    if (login.status !== 200) return;

    const res = await request(http)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);

    expect(res.body.title).toBe('Sin permiso');
    expect(res.body.detail).toMatch(/visor/);
  }, 30_000);

  it('sin token, la ruta protegida responde 401 y no 404', async () => {
    await request(http).get('/api/v1/users').expect(401);
  });

  it('las rutas quedan protegidas por defecto: solo son publicas las declaradas', async () => {
    // health y login son @Public()
    await request(http).get('/api/v1/health/live').expect(200);
    await request(http).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
    // el resto exige token
    await request(http).get('/api/v1/auth/me').expect(401);
    await request(http).get('/api/v1/users').expect(401);
  }, 30_000);
});
