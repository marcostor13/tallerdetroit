import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ROLES, type Role } from '@dps/shared';

/**
 * Estado de seguridad de la cuenta (§20).
 * Vive embebido porque siempre se lee y escribe junto con el usuario.
 */
@Schema({ _id: false })
export class UserSecurity {
  /** Intentos fallidos consecutivos; se reinicia con un login correcto. */
  @Prop({ type: Number, default: 0 })
  intentosFallidos!: number;

  /** Bloqueo temporal tras superar LOGIN_MAX_ATTEMPTS. */
  @Prop({ type: Date, default: null })
  bloqueadoHasta!: Date | null;

  @Prop({ type: Date, default: null })
  ultimoAcceso!: Date | null;

  @Prop({ type: Date, default: null })
  passwordActualizadaEn!: Date | null;

  /** Obliga a cambiar la contraseña en el siguiente inicio de sesión. */
  @Prop({ type: Boolean, default: false })
  debeCambiarPassword!: boolean;
}

@Schema({ _id: false })
export class UserPreferences {
  /** Tema de la interfaz. `system` sigue la preferencia del navegador. */
  @Prop({ type: String, enum: ['light', 'dark', 'system'], default: 'system' })
  tema!: 'light' | 'dark' | 'system';
}

/**
 * Maestro 31 (`users`) del §13.1.
 *
 * El rol determina los permisos: NO se almacenan aquí, se resuelven contra
 * `ROLE_PERMISSIONS` de `@dps/shared` al iniciar sesión. Guardarlos duplicados
 * haría que un cambio en la matriz no llegara a los usuarios ya creados.
 */
@Schema({ collection: 'users', timestamps: true })
export class User {
  // El índice único se declara una sola vez, más abajo con `schema.index()`:
  // ponerlo también aquí con `unique: true` hace que Mongoose lo cree por
  // duplicado y avise en cada arranque.
  @Prop({ type: String, required: true, lowercase: true, trim: true })
  email!: string;

  /** Hash Argon2id. Nunca sale de la base: el servicio lo excluye siempre. */
  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, required: true, enum: ROLES })
  rol!: Role;

  @Prop({ type: Boolean, default: true })
  activo!: boolean;

  /** Obligatorio para el rol administrador (§20). */
  @Prop({ type: Boolean, default: false })
  mfaHabilitado!: boolean;

  @Prop({ type: String, default: null, select: false })
  mfaSecret!: string | null;

  /** Técnico asociado; permite firmar informes con su firma registrada. */
  @Prop({ type: Types.ObjectId, ref: 'Technician', default: null })
  tecnicoId!: Types.ObjectId | null;

  /** Cargo denormalizado, tal como aparece en el informe (p. ej. `SUPERVISOR C`). */
  @Prop({ type: String, default: null })
  cargo!: string | null;

  /** RN-07: acota qué informes ve el supervisor. */
  @Prop({ type: Types.ObjectId, ref: 'BusinessUnit', default: null })
  unidadNegocioId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organizacionId!: Types.ObjectId | null;

  @Prop({ type: UserSecurity, default: () => ({}) })
  seguridad!: UserSecurity;

  @Prop({ type: UserPreferences, default: () => ({}) })
  preferencias!: UserPreferences;

  /** Marca las cuentas sembradas para pruebas, de modo que se puedan purgar. */
  @Prop({ type: Boolean, default: false })
  esDePrueba!: boolean;

  /** Soft delete: nada se borra si tiene informes asociados (§13.3.5). */
  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ rol: 1, activo: 1 });
UserSchema.index({ unidadNegocioId: 1, activo: 1 });
UserSchema.index({ deletedAt: 1 });
