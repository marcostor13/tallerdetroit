import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Maestro 33 (`organizations`) del §13.1.
 *
 * Decisión D5, resuelta por el negocio: **la plataforma emite informes de más
 * de una razón social**. Por eso el informe no puede asumir un emisor único; en
 * F1 llevará `organizacion: { id, razonSocial, ruc }` como referencia más
 * snapshot, igual que el resto de maestros: un informe emitido debe seguir
 * diciendo lo que decía aunque la razón social cambie de nombre después.
 *
 * «Se ingresa manualmente por ahora» significa que el alta se hace desde
 * administración y no se importa de ningún sistema externo. El modelo ya
 * soporta varias desde el principio, que es lo caro de añadir más tarde.
 */
@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ type: String, required: true, trim: true })
  razonSocial!: string;

  /** Nombre corto para la interfaz, cuando la razón social es larga. */
  @Prop({ type: String, required: true, trim: true })
  nombreCorto!: string;

  @Prop({ type: String, required: true, trim: true })
  ruc!: string;

  @Prop({ type: String, default: null })
  direccion!: string | null;

  /** Clave S3 del logotipo que se estampa en la cabecera del PDF (§19). */
  @Prop({ type: String, default: null })
  logoS3Key!: string | null;

  /** Prefijo propio del correlativo de informes, si esta razón social usa uno. */
  @Prop({ type: String, default: null, uppercase: true, trim: true })
  prefijoInforme!: string | null;

  /** La que se propone al crear un informe si no se elige otra. */
  @Prop({ type: Boolean, default: false })
  esPredeterminada!: boolean;

  @Prop({ type: Boolean, default: true })
  activa!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export type OrganizationDocument = Organization & Document;

export const OrganizationSchema = SchemaFactory.createForClass(Organization);

OrganizationSchema.index({ ruc: 1 }, { unique: true });
OrganizationSchema.index({ activa: 1 });
// Como mucho una predeterminada entre las activas.
OrganizationSchema.index(
  { esPredeterminada: 1 },
  { unique: true, partialFilterExpression: { esPredeterminada: true, deletedAt: null } },
);
