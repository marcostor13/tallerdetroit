import mongoose from 'mongoose';
import * as argon2 from 'argon2';
import { ROLE_PERMISSIONS } from '@dps/shared';
import { seedUsers } from './users.seed';
import { testUri } from '../test-setup/test-uri';

/**
 * La siembra escribe cuentas con las que se entra a la plataforma: si se
 * equivoca en el hash, en el rol o en la unidad de negocio, el error solo se
 * descubre intentando iniciar sesión. Estas pruebas lo cierran antes.
 */
describe('seedUsers', () => {
  let uri: string;

  beforeAll(async () => {
    uri = testUri('dps-informes-test');
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });

  afterEach(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });

  async function connect() {
    await mongoose.connect(uri);
    return mongoose.connection;
  }

  it('crea las unidades de negocio y las 7 cuentas iniciales', async () => {
    process.env['SEED_PASSWORD'] = 'ContrasenaDePrueba2026';
    await seedUsers(uri);

    const db = await connect();
    expect(await db.collection('businessUnits').countDocuments()).toBe(2);
    expect(await db.collection('users').countDocuments()).toBe(7);
  }, 60_000);

  it('crea la organización emisora y enlaza usuarios y unidades a ella (D5)', async () => {
    const db = await connect();

    const orgs = await db.collection('organizations').find().toArray();
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ ruc: '20100000001', esPredeterminada: true });

    const orgId = String(orgs[0]!['_id']);

    // El modelo es multi-empresa desde el principio: todo cuelga de una
    // organización, aunque hoy solo exista una.
    const usuarios = await db.collection('users').find().toArray();
    for (const u of usuarios) expect(String(u['organizacionId'])).toBe(orgId);

    const unidades = await db.collection('businessUnits').find().toArray();
    for (const b of unidades) expect(String(b['organizacionId'])).toBe(orgId);
  });

  it('el RUC de la organización es único', async () => {
    const db = await connect();
    await expect(
      db.collection('organizations').insertOne({ ruc: '20100000001', razonSocial: 'Otra' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('cubre los cuatro roles obligatorios del negocio más Calidad', async () => {
    const db = await connect();
    const roles = await db.collection('users').distinct('rol');

    for (const rol of ['administrador', 'supervisor', 'tecnico', 'visor', 'calidad']) {
      expect(roles).toContain(rol);
    }
  });

  it('guarda la contraseña como hash Argon2id verificable, nunca en claro', async () => {
    const db = await connect();
    const user = await db.collection('users').findOne({ email: 'admin@detroitpower.pe' });

    expect(user).toBeTruthy();
    expect(user!['passwordHash']).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(user)).not.toContain('ContrasenaDePrueba2026');
    expect(await argon2.verify(user!['passwordHash'] as string, 'ContrasenaDePrueba2026')).toBe(
      true,
    );
    expect(await argon2.verify(user!['passwordHash'] as string, 'otra-cosa')).toBe(false);
  }, 30_000);

  it('el administrador queda con MFA habilitado (§20)', async () => {
    const db = await connect();
    const admin = await db.collection('users').findOne({ email: 'admin@detroitpower.pe' });
    expect(admin!['mfaHabilitado']).toBe(true);
  });

  it('asigna unidad de negocio a los técnicos y supervisores, para RN-07', async () => {
    const db = await connect();
    const unidades = await db.collection('businessUnits').find().toArray();
    const tal = unidades.find((u) => u['codigo'] === 'TAL');
    const sca = unidades.find((u) => u['codigo'] === 'SCA');

    const caceres = await db.collection('users').findOne({ email: 'rcaceres@detroitpower.pe' });
    const campos = await db.collection('users').findOne({ email: 'mcampos@detroitpower.pe' });

    expect(String(caceres!['unidadNegocioId'])).toBe(String(tal!['_id']));
    expect(String(campos!['unidadNegocioId'])).toBe(String(sca!['_id']));

    // Dos técnicos en unidades distintas: es lo que permite probar el alcance.
    expect(String(caceres!['unidadNegocioId'])).not.toBe(String(campos!['unidadNegocioId']));
  });

  it('el visor no tiene ningún permiso de escritura (slide 8)', () => {
    const permisos = ROLE_PERMISSIONS['visor'];
    expect(permisos.some((p) => p.includes(':write') || p.includes(':create'))).toBe(false);
    expect(permisos).toContain('reports:read');
  });

  it('marca las cuentas como de prueba para poder purgarlas', async () => {
    const db = await connect();
    expect(await db.collection('users').countDocuments({ esDePrueba: true })).toBe(7);
  });

  it('es idempotente: repetir la siembra no duplica ni cambia la contraseña', async () => {
    let db = await connect();
    const antes = await db.collection('users').findOne({ email: 'admin@detroitpower.pe' });
    await mongoose.disconnect();

    process.env['SEED_PASSWORD'] = 'UnaContrasenaDistinta2026';
    await seedUsers(uri);

    db = await connect();
    expect(await db.collection('users').countDocuments()).toBe(7);

    const despues = await db.collection('users').findOne({ email: 'admin@detroitpower.pe' });
    expect(despues!['passwordHash']).toBe(antes!['passwordHash']);
  }, 60_000);

  it('el email es único: no se pueden crear dos cuentas iguales', async () => {
    const db = await connect();
    await expect(
      db.collection('users').insertOne({ email: 'admin@detroitpower.pe', passwordHash: 'x' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('--purge elimina solo las cuentas de prueba', async () => {
    let db = await connect();
    await db.collection('users').insertOne({
      email: 'real@detroitpower.pe',
      passwordHash: 'x',
      rol: 'tecnico',
      esDePrueba: false,
    });
    await mongoose.disconnect();

    await seedUsers(uri, true);

    db = await connect();
    expect(await db.collection('users').countDocuments()).toBe(1);
    expect(await db.collection('users').findOne({})).toMatchObject({
      email: 'real@detroitpower.pe',
    });
  }, 60_000);
});
