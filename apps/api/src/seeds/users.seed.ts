/**
 * Siembra las cuentas iniciales y las unidades de negocio.
 *
 *   npm run seed:users -w @dps/api                    # usa MONGODB_URI del entorno
 *   MONGODB_URI=... npm run seed:users -w @dps/api    # contra otra base
 *   npm run seed:users -w @dps/api -- --purge         # borra las cuentas de prueba
 *
 * Es idempotente: vuelve a ejecutarlo cuantas veces quieras. Las cuentas ya
 * existentes se actualizan sin tocar su contraseña.
 *
 * Las contraseñas se pasan por `SEED_PASSWORD` o se generan al azar y se
 * imprimen UNA sola vez. Nunca se escriben en el repositorio.
 */
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import mongoose from 'mongoose';
import { ROLE_PERMISSIONS, type Role } from '@dps/shared';
import { UserSchema } from '../users/schemas/user.schema';
import { BusinessUnitSchema } from '../masters/schemas/business-unit.schema';
import { OrganizationSchema } from '../masters/schemas/organization.schema';

/** Parámetros Argon2id recomendados por OWASP para contraseñas interactivas. */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

interface SeedUser {
  readonly email: string;
  readonly nombre: string;
  readonly rol: Role;
  readonly cargo: string | null;
  readonly unidad: 'TAL' | 'SCA' | null;
  readonly mfaHabilitado: boolean;
  readonly nota: string;
}

/**
 * Las personas y cargos salen de los informes reales OT-746 y OT-898, para que
 * las pruebas se parezcan a la operación y no a datos inventados.
 */
const SEED_USERS: readonly SeedUser[] = [
  {
    email: 'admin@detroitpower.pe',
    nombre: 'Administrador del Sistema',
    rol: 'administrador',
    cargo: 'ADMINISTRADOR TI',
    unidad: null,
    // §20: el MFA es obligatorio para este rol. Se marca desde ya; la
    // inscripción del TOTP llega con el flujo de auth completo.
    mfaHabilitado: true,
    nota: 'Acceso total, auditoría y configuración',
  },
  {
    email: 'kbecerra@detroitpower.pe',
    nombre: 'KEITH BECERRA',
    rol: 'supervisor',
    cargo: 'JEFE DE TALLER',
    unidad: 'TAL',
    mfaHabilitado: false,
    nota: 'Destinatario del OT-898 ("dirigido a")',
  },
  {
    email: 'jestrella@detroitpower.pe',
    nombre: 'JOSÉ LUIS ESTRELLA',
    rol: 'supervisor',
    cargo: 'SUPERVISOR C',
    unidad: 'TAL',
    mfaHabilitado: false,
    nota: 'Elaboró el informe OT-898',
  },
  {
    email: 'rcaceres@detroitpower.pe',
    nombre: 'REYNALDO CÁCERES',
    rol: 'tecnico',
    cargo: 'TÉCNICO SENIOR',
    unidad: 'TAL',
    mfaHabilitado: false,
    nota: 'Técnico de taller; solo ve los informes donde participa (RN-07)',
  },
  {
    email: 'mcampos@detroitpower.pe',
    nombre: 'MARIO CAMPOS',
    rol: 'tecnico',
    cargo: 'TÉCNICO DE CAMPO',
    unidad: 'SCA',
    mfaHabilitado: false,
    nota: 'Segundo técnico, en otra unidad: sirve para probar el alcance de RN-07',
  },
  {
    email: 'calidad@detroitpower.pe',
    nombre: 'Responsable de Calidad',
    rol: 'calidad',
    cargo: 'JEFE DE CALIDAD',
    unidad: null,
    mfaHabilitado: false,
    nota: 'Dueño del formato SER-FOR-002; publica versiones de plantilla',
  },
  {
    email: 'gerencia@detroitpower.pe',
    nombre: 'Consulta Gerencia',
    rol: 'visor',
    cargo: 'GERENCIA',
    unidad: null,
    mfaHabilitado: false,
    nota: 'Solo lectura de informes aprobados; sin permisos de edición',
  },
];

/**
 * Decisión D5: la plataforma emite informes de más de una razón social. Se
 * siembra la propia para que exista una predeterminada; las demás se dan de
 * alta manualmente desde administración.
 */
const ORGANIZATIONS = [
  {
    razonSocial: 'DETROIT POWER SYSTEM PERÚ S.A.C.',
    nombreCorto: 'Detroit Power System',
    ruc: '20100000001',
    prefijoInforme: 'ITS',
    esPredeterminada: true,
  },
];

const BUSINESS_UNITS = [
  { codigo: 'TAL', nombre: 'Taller Lima', prefijoOt: 'TAL', ciudad: 'LIM' },
  { codigo: 'SCA', nombre: 'Servicio de Campo', prefijoOt: 'SCA', ciudad: 'LIM' },
];

/** Contraseña legible pero conforme a la política (≥ 12 caracteres). */
function generatePassword(): string {
  return `Dps.${randomBytes(6).toString('base64url')}.26`;
}

export async function seedUsers(uri: string, purge = false): Promise<void> {
  // Conexión propia, no la global de mongoose: si usara `mongoose.connect` y
  // luego `disconnect`, se llevaría por delante la conexión de cualquier
  // aplicación que estuviera corriendo en el mismo proceso.
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 20000 });
  await connection.asPromise();
  console.log(`Base de datos: ${connection.name}\n`);

  const UserModel = connection.model('User', UserSchema);
  const BusinessUnitModel = connection.model('BusinessUnit', BusinessUnitSchema);
  const OrganizationModel = connection.model('Organization', OrganizationSchema);

  if (purge) {
    const { deletedCount } = await UserModel.deleteMany({ esDePrueba: true });
    console.log(`Cuentas de prueba eliminadas: ${deletedCount}`);
    await connection.close();
    return;
  }

  // --- Organizaciones (D5: multi-empresa) ----------------------------------
  let organizacionId: mongoose.Types.ObjectId | null = null;
  for (const org of ORGANIZATIONS) {
    const doc = await OrganizationModel.findOneAndUpdate(
      { ruc: org.ruc },
      { $set: org },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    if (org.esPredeterminada) organizacionId = doc._id as mongoose.Types.ObjectId;
    console.log(`empresa ${org.nombreCorto} (RUC ${org.ruc})`);
  }

  // --- Unidades de negocio -------------------------------------------------
  const unitIds = new Map<string, mongoose.Types.ObjectId>();
  for (const unit of BUSINESS_UNITS) {
    const doc = await BusinessUnitModel.findOneAndUpdate(
      { codigo: unit.codigo },
      { $set: { ...unit, organizacionId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    unitIds.set(unit.codigo, doc._id as mongoose.Types.ObjectId);
    console.log(`unidad  ${unit.codigo.padEnd(4)} ${unit.nombre}`);
  }

  // --- Usuarios ------------------------------------------------------------
  const fixedPassword = process.env['SEED_PASSWORD'];
  const credentials: { email: string; password: string | null; rol: string }[] = [];

  console.log('');
  for (const user of SEED_USERS) {
    const existing = await UserModel.findOne({ email: user.email }).lean();

    const base = {
      nombre: user.nombre,
      rol: user.rol,
      cargo: user.cargo,
      unidadNegocioId: user.unidad ? (unitIds.get(user.unidad) ?? null) : null,
      mfaHabilitado: user.mfaHabilitado,
      organizacionId,
      activo: true,
      esDePrueba: true,
    };

    if (existing) {
      // No se toca la contraseña de una cuenta que ya existe.
      await UserModel.updateOne({ email: user.email }, { $set: base });
      credentials.push({ email: user.email, password: null, rol: user.rol });
      console.log(`actualizado  ${user.email.padEnd(30)} ${user.rol}`);
      continue;
    }

    const password = fixedPassword ?? generatePassword();
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    await UserModel.create({
      ...base,
      email: user.email,
      passwordHash,
      seguridad: {
        intentosFallidos: 0,
        bloqueadoHasta: null,
        ultimoAcceso: null,
        passwordActualizadaEn: new Date(),
        // Cuentas de prueba: no se fuerza el cambio, o no se podrían usar.
        debeCambiarPassword: false,
      },
      preferencias: { tema: 'system' },
    });

    credentials.push({ email: user.email, password, rol: user.rol });
    console.log(`creado       ${user.email.padEnd(30)} ${user.rol}`);
  }

  // --- Resumen -------------------------------------------------------------
  console.log('\n' + '='.repeat(78));
  console.log('CREDENCIALES — se muestran una sola vez, no quedan guardadas en claro');
  console.log('='.repeat(78));
  for (const c of credentials) {
    const permisos = ROLE_PERMISSIONS[c.rol as Role].length;
    console.log(
      `${c.email.padEnd(30)} ${c.password ?? '(sin cambios)'.padEnd(16)} ` +
        `${c.rol.padEnd(15)} ${permisos} permisos`,
    );
  }
  console.log('='.repeat(78));
  console.log('Cambia estas contraseñas antes de exponer la plataforma a usuarios reales.');

  await connection.close();
}

// Ejecución directa desde la línea de comandos.
if (require.main === module) {
  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    console.error('Falta MONGODB_URI.');
    process.exit(1);
  }
  seedUsers(uri, process.argv.includes('--purge')).catch((error: unknown) => {
    console.error('La siembra falló:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
