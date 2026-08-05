import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ROLE_PERMISSIONS, type Permission } from '@dps/shared';
import { User, type UserDocument } from './schemas/user.schema';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/** Usuario con su hash, para el proceso de autenticación. */
export type UserWithSecret = UserDocument & { passwordHash: string };

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<UserDocument>) {}

  /**
   * Busca por email incluyendo el hash, que el schema excluye por defecto.
   * Solo debe usarlo el flujo de autenticación.
   */
  findByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    return this.model
      .findOne({ email: email.toLowerCase().trim(), deletedAt: null })
      .select('+passwordHash')
      .exec() as Promise<UserWithSecret | null>;
  }

  findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findOne({ _id: id, deletedAt: null }).exec();
  }

  /** Suma un intento fallido y bloquea la cuenta al alcanzar el límite (§20). */
  async registerFailedAttempt(
    id: Types.ObjectId,
    maxAttempts: number,
    lockoutMinutes: number,
  ): Promise<{ bloqueada: boolean }> {
    const user = await this.model.findByIdAndUpdate(
      id,
      { $inc: { 'seguridad.intentosFallidos': 1 } },
      { new: true },
    );

    if (!user) return { bloqueada: false };

    if (user.seguridad.intentosFallidos >= maxAttempts) {
      await this.model.updateOne(
        { _id: id },
        {
          $set: {
            'seguridad.bloqueadoHasta': new Date(Date.now() + lockoutMinutes * 60_000),
            'seguridad.intentosFallidos': 0,
          },
        },
      );
      return { bloqueada: true };
    }

    return { bloqueada: false };
  }

  /** Login correcto: limpia el contador y deja constancia del acceso. */
  async registerSuccessfulLogin(id: Types.ObjectId): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          'seguridad.intentosFallidos': 0,
          'seguridad.bloqueadoHasta': null,
          'seguridad.ultimoAcceso': new Date(),
        },
      },
    );
  }

  /**
   * Convierte el documento en el usuario que viaja en la petición.
   *
   * Los permisos se resuelven aquí contra `ROLE_PERMISSIONS`, no se leen de la
   * base: así un cambio en la matriz alcanza también a las cuentas ya creadas.
   */
  toAuthUser(user: UserDocument): AuthUser {
    return {
      id: String(user._id),
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      permisos: [...(ROLE_PERMISSIONS[user.rol] ?? [])] as Permission[],
      unidadNegocioId: user.unidadNegocioId ? String(user.unidadNegocioId) : null,
      tecnicoId: user.tecnicoId ? String(user.tecnicoId) : null,
    };
  }
}
