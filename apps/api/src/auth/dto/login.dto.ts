import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'tecnico@detroitpower.pe' })
  @IsEmail({}, { message: 'El correo debe tener el formato nombre@empresa.com.' })
  email!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'La contraseña tiene al menos 12 caracteres.' })
  password!: string;

  @ApiPropertyOptional({ description: 'Código TOTP de 6 dígitos, si la cuenta tiene MFA' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'El código de verificación son 6 dígitos.' })
  totp?: string;
}
