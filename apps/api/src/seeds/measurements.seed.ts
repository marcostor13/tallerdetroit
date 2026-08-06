/**
 * Siembra los catálogos del módulo de mediciones y las especificaciones que
 * conocemos (§12.5).
 *
 *   npm run seed:measurements -w @dps/api
 *
 * Es idempotente.
 *
 * ⚠️ **Las seis tolerancias salen de los informes OT-746 y OT-898, no del
 * manual MTU.** Se cargan porque sin ellas no hay nada contra lo que validar y
 * F2 no se puede probar, pero van marcadas `provisional: true` y así deben
 * seguir hasta que Jefatura técnica las contraste (decisión D1). Faltan además
 * las de juego axial, muñones, coaxialidad y piñones intermedios: esas no se
 * inventan aquí.
 */
import mongoose from 'mongoose';
import { EngineBrandSchema } from '../masters/schemas/catalogs.schema';
import { EngineModelSchema } from '../masters/schemas/engine-model.schema';
import { EngineSpecSchema } from '../masters/schemas/engine-spec.schema';
import {
  ComponentVerdictSchema,
  EngineComponentSchema,
  UnitSchema,
} from '../masters/schemas/measurement-catalogs.schema';

/** Unidades con su factor a la base de su magnitud. */
const UNIDADES = [
  {
    simbolo: 'mm',
    denominacion: 'Milímetro',
    magnitud: 'longitud',
    esBase: true,
    factorABase: 1,
    decimales: 3,
  },
  {
    simbolo: 'in',
    denominacion: 'Pulgada',
    magnitud: 'longitud',
    esBase: false,
    factorABase: 25.4,
    decimales: 4,
  },
  {
    simbolo: '°C',
    denominacion: 'Grado Celsius',
    magnitud: 'temperatura',
    esBase: true,
    factorABase: 1,
    decimales: 1,
  },
  {
    simbolo: 'bar',
    denominacion: 'Bar',
    magnitud: 'presion',
    esBase: true,
    factorABase: 1,
    decimales: 2,
  },
  {
    simbolo: 'psi',
    denominacion: 'Libra por pulgada cuadrada',
    magnitud: 'presion',
    esBase: false,
    factorABase: 0.0689476,
    decimales: 1,
  },
  {
    simbolo: 'N·m',
    denominacion: 'Newton metro',
    magnitud: 'par',
    esBase: true,
    factorABase: 1,
    decimales: 1,
  },
  {
    simbolo: 'h',
    denominacion: 'Hora',
    magnitud: 'tiempo',
    esBase: true,
    factorABase: 1,
    decimales: 0,
  },
];

/** Los cuatro veredictos de §12.4.4, ordenados de menos a más grave. */
const VEREDICTOS = [
  {
    clave: 'operativo',
    denominacion: 'Operativo',
    accionSugerida: 'Se reinstala sin intervención',
    tono: 'success',
    gravedad: 0,
  },
  {
    clave: 'reutilizable',
    denominacion: 'Reutilizable',
    accionSugerida: 'Se reinstala tras limpieza e inspección',
    tono: 'success',
    gravedad: 1,
  },
  {
    clave: 'reparar',
    denominacion: 'Reparar',
    accionSugerida: 'Requiere rectificado o reparación en taller',
    tono: 'warning',
    gravedad: 2,
  },
  {
    clave: 'cambiar',
    denominacion: 'Cambiar',
    accionSugerida: 'Se reemplaza por componente nuevo',
    tono: 'danger',
    gravedad: 3,
  },
];

/** Componentes que aparecen en los informes reales. */
const COMPONENTES = [
  { clave: 'bloque', denominacion: 'Bloque de motor', grupo: 'bloque', cantidadPorMotor: 1 },
  {
    clave: 'tunel_bancada',
    denominacion: 'Túnel de bancada',
    grupo: 'bloque',
    cantidadDerivadaDe: 'apoyosBancada',
  },
  {
    clave: 'camisa',
    denominacion: 'Camisa de cilindro',
    grupo: 'bloque',
    cantidadDerivadaDe: 'cilindros',
  },
  { clave: 'cigueñal', denominacion: 'Cigüeñal', grupo: 'tren_alternativo', cantidadPorMotor: 1 },
  {
    clave: 'muñon_bancada',
    denominacion: 'Muñón de bancada',
    grupo: 'tren_alternativo',
    cantidadDerivadaDe: 'apoyosBancada',
  },
  {
    clave: 'muñon_biela',
    denominacion: 'Muñón de biela',
    grupo: 'tren_alternativo',
    cantidadDerivadaDe: 'cilindros',
  },
  {
    clave: 'piston',
    denominacion: 'Pistón',
    grupo: 'tren_alternativo',
    cantidadDerivadaDe: 'cilindros',
  },
  {
    clave: 'biela',
    denominacion: 'Biela',
    grupo: 'tren_alternativo',
    cantidadDerivadaDe: 'cilindros',
  },
  { clave: 'culata', denominacion: 'Culata', grupo: 'culatas', cantidadDerivadaDe: 'cilindros' },
  { clave: 'eje_levas', denominacion: 'Eje de levas', grupo: 'distribucion', cantidadPorMotor: 2 },
  {
    clave: 'piñon_intermedio',
    denominacion: 'Piñón intermedio',
    grupo: 'distribucion',
    cantidadPorMotor: 2,
  },
  { clave: 'turbo', denominacion: 'Turbocompresor', grupo: 'admision_escape', cantidadPorMotor: 2 },
  {
    clave: 'cac',
    denominacion: 'Enfriador de aire de carga (CAC)',
    grupo: 'admision_escape',
    cantidadPorMotor: 1,
  },
];

/** Modelos de motor de los dos informes reales, con su geometría. */
const MODELOS = [
  {
    denominacion: '20V4000C23',
    cilindros: 20,
    bancos: 2,
    apoyosBancada: 11,
    configuracion: '20V',
    potencia: '3400 HP / 2500 KW @ 1800 rpm',
    rpm: 1800,
    tieneCac: true,
    tieneTurbos: true,
  },
  {
    denominacion: '16V4000C21',
    cilindros: 16,
    bancos: 2,
    apoyosBancada: 9,
    configuracion: '16V',
    potencia: '2700 HP / 2000 KW @ 1800 rpm',
    rpm: 1800,
    tieneCac: true,
    tieneTurbos: true,
  },
];

/** §12.5, tal cual. Nada de aquí está validado contra el manual del fabricante. */
const ESPECIFICACIONES = [
  {
    modelo: '16V4000C21',
    parametro: 'encaje_camisa_superior',
    denominacion: 'Encaje de camisa superior',
    nominal: 196.0,
    tolInf: 0,
    tolSup: 0.15,
    unidad: 'mm',
    fuente: 'Informe OT746',
  },
  {
    modelo: '16V4000C21',
    parametro: 'encaje_camisa_inferior',
    denominacion: 'Encaje de camisa inferior',
    nominal: 189.0,
    tolInf: 0,
    tolSup: 0.08,
    unidad: 'mm',
    fuente: 'Informe OT746',
  },
  {
    modelo: '20V4000C23',
    parametro: 'encaje_camisa_superior',
    denominacion: 'Encaje de camisa superior',
    nominal: 196.0,
    tolInf: 0,
    tolSup: 0.15,
    unidad: 'mm',
    fuente: 'Informe OT898',
  },
  {
    modelo: '20V4000C23',
    parametro: 'encaje_camisa_inferior',
    denominacion: 'Encaje de camisa inferior',
    nominal: 193.0,
    tolInf: 0,
    tolSup: 0.08,
    unidad: 'mm',
    fuente: 'Informe OT898',
  },
  // El nominal de este no aparece en el informe: solo el límite superior. Se
  // deja en 0 con modo `desviacion`, que es como está anotado allí.
  {
    modelo: '20V4000C23',
    parametro: 'camisa_encaje_superior',
    denominacion: 'Camisa, encaje superior',
    nominal: 0,
    tolInf: -0.05,
    tolSup: 0,
    unidad: 'mm',
    fuente: 'Informe OT898',
    modo: 'desviacion' as const,
  },
  {
    modelo: '20V4000C23',
    parametro: 'taladro_tunel_bancada',
    denominacion: 'Taladro del túnel de bancada',
    nominal: 171.0,
    tolInf: 0,
    tolSup: 0.025,
    unidad: 'mm',
    fuente: 'Informe OT898',
  },
];

export async function seedMeasurements(uri: string): Promise<void> {
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 20000 });
  await connection.asPromise();

  const Unit = connection.model('Unit', UnitSchema);
  const Verdict = connection.model('ComponentVerdictMaster', ComponentVerdictSchema);
  const Component = connection.model('EngineComponent', EngineComponentSchema);
  const Brand = connection.model('EngineBrand', EngineBrandSchema);
  const Model = connection.model('EngineModel', EngineModelSchema);
  const Spec = connection.model('EngineSpec', EngineSpecSchema);

  try {
    for (const unidad of UNIDADES) {
      await Unit.findOneAndUpdate(
        { simbolo: unidad.simbolo },
        { $set: unidad },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    console.log(`unidades: ${UNIDADES.length}`);

    for (const veredicto of VEREDICTOS) {
      await Verdict.findOneAndUpdate(
        { clave: veredicto.clave },
        { $set: veredicto },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    console.log(`veredictos: ${VEREDICTOS.length}`);

    for (const componente of COMPONENTES) {
      await Component.findOneAndUpdate(
        { clave: componente.clave },
        { $set: componente },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    console.log(`componentes: ${COMPONENTES.length}`);

    const mtu = await Brand.findOneAndUpdate(
      { nombre: 'MTU' },
      { $set: { nombre: 'MTU' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const modelosPorNombre = new Map<string, mongoose.Types.ObjectId>();
    for (const modelo of MODELOS) {
      const doc = await Model.findOneAndUpdate(
        { marcaId: mtu._id, denominacion: modelo.denominacion },
        { $set: { ...modelo, marcaId: mtu._id } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      modelosPorNombre.set(modelo.denominacion, doc._id as mongoose.Types.ObjectId);
      console.log(
        `modelo ${modelo.denominacion}: ${modelo.cilindros} cilindros, ` +
          `${modelo.apoyosBancada} apoyos → ${modelo.cilindros / modelo.bancos} por banco`,
      );
    }

    let provisionales = 0;
    for (const spec of ESPECIFICACIONES) {
      const engineModelId = modelosPorNombre.get(spec.modelo);
      if (!engineModelId) continue;

      const { modelo, ...resto } = spec;
      void modelo;

      await Spec.findOneAndUpdate(
        { engineModelId, parametro: spec.parametro },
        { $set: { ...resto, engineModelId, provisional: true } },
        { upsert: true, setDefaultsOnInsert: true },
      );
      provisionales++;
    }

    console.log(
      `\nespecificaciones: ${provisionales}, TODAS marcadas provisional.\n` +
        'Salen de los informes OT-746 y OT-898, no del manual MTU: Jefatura\n' +
        'técnica tiene que contrastarlas antes de emitir con ellas (D1).\n' +
        'Faltan juego axial, muñones, coaxialidad y piñones intermedios.',
    );
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    console.error('Falta MONGODB_URI.');
    process.exit(1);
  }
  seedMeasurements(uri)
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
