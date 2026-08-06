/**
 * Siembra el catálogo de plantillas y publica SER-FOR-002 v01.
 *
 *   npm run seed:templates -w @dps/api
 *   MONGODB_URI=... npm run seed:templates -w @dps/api
 *
 * Es idempotente. Si v01 ya está publicada no se toca: una versión publicada es
 * inmutable (§11.1) y puede estar dentro de informes ya emitidos. Para cambiar
 * el formato se publica v02.
 */
import mongoose from 'mongoose';
import { SER_FOR_002_V01, validateTemplate } from '@dps/shared';
import { ReportTemplateSchema, TemplateVersionSchema } from '../templates/schemas/template.schema';

export async function seedTemplates(uri: string): Promise<void> {
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 20000 });
  await connection.asPromise();

  const TemplateModel = connection.model('ReportTemplate', ReportTemplateSchema);
  const VersionModel = connection.model('TemplateVersion', TemplateVersionSchema);

  try {
    // Se comprueba antes de escribir: sembrar una plantilla incoherente dejaría
    // la base en un estado que el endpoint de publicación habría rechazado.
    const errores = validateTemplate(SER_FOR_002_V01);
    if (errores.length) {
      throw new Error(`SER-FOR-002 v01 no es coherente:\n· ${errores.join('\n· ')}`);
    }

    const plantilla = await TemplateModel.findOneAndUpdate(
      { codigo: SER_FOR_002_V01.codigo },
      {
        $set: {
          codigo: SER_FOR_002_V01.codigo,
          nombre: SER_FOR_002_V01.nombre,
          descripcion: 'Formato controlado por Calidad. Reproduce los informes OT-746 y OT-898.',
          activo: true,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const yaPublicada = await VersionModel.findOne({
      codigo: SER_FOR_002_V01.codigo,
      version: SER_FOR_002_V01.version,
      estado: 'publicada',
    }).lean();

    if (yaPublicada) {
      console.log(`${SER_FOR_002_V01.codigo} ${SER_FOR_002_V01.version} ya estaba publicada.`);
      return;
    }

    await VersionModel.findOneAndUpdate(
      { codigo: SER_FOR_002_V01.codigo, version: SER_FOR_002_V01.version },
      {
        $set: {
          templateId: plantilla._id,
          codigo: SER_FOR_002_V01.codigo,
          version: SER_FOR_002_V01.version,
          nombre: SER_FOR_002_V01.nombre,
          estado: 'publicada',
          secciones: SER_FOR_002_V01.secciones,
          fechaPublicacion: new Date(),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    const secciones = SER_FOR_002_V01.secciones.length;
    const bloques = SER_FOR_002_V01.secciones.reduce((n, s) => n + s.bloques.length, 0);
    console.log(
      `${SER_FOR_002_V01.codigo} ${SER_FOR_002_V01.version} publicada: ` +
        `${secciones} secciones, ${bloques} bloques.`,
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
  seedTemplates(uri)
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
