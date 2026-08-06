import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import {
  componerAviso,
  destinatariosDe,
  type DestinatarioDeAviso,
  type InformeParaAviso,
  type ReportStatus,
} from '@dps/shared';
import { mailTransport, type EnvironmentVariables } from '../config/configuration';

/**
 * Avisos por correo del flujo de aprobación (E3.9).
 *
 * **Nunca bloquea ni deshace la transición.** Un informe aprobado lo está
 * aunque el servidor de correo no responda; negar la aprobación por eso sería
 * dejar el flujo a merced de un servicio que ni siquiera es nuestro. Lo que
 * falla queda en el log de la aplicación.
 *
 * Sin `EMAIL_PROVIDER` configurado la plataforma arranca igual y los avisos se
 * escriben en el log en vez de enviarse: en desarrollo se trabaja sobre el resto
 * del flujo sin necesidad de un servidor SMTP, y en el compose local está
 * Mailpit para cuando haga falta verlos de verdad.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporte: Transporter | null;
  private readonly remitente: string;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    this.remitente = this.config.get('MAIL_FROM', { infer: true });

    const opciones = mailTransport(this.config as unknown as EnvironmentVariables);
    if (!opciones) {
      this.transporte = null;
      this.logger.warn('Sin EMAIL_PROVIDER: los avisos del flujo se escribirán en el log.');
      return;
    }

    this.transporte =
      'url' in opciones ? createTransport(opciones.url) : createTransport({ ...opciones });
  }

  /**
   * Avisa del cambio de estado a quien le toque.
   *
   * Devuelve a cuántos se avisó, que es lo que se registra en el log: sin ese
   * número, un fallo de configuración que deja a todo el mundo sin avisos pasa
   * desapercibido hasta que alguien pregunta por qué nadie revisa.
   */
  async avisarDeTransicion(
    estado: ReportStatus,
    informe: InformeParaAviso,
    participantes: {
      autor?: DestinatarioDeAviso | null;
      revisores?: readonly DestinatarioDeAviso[];
    },
    actorEmail?: string | null,
  ): Promise<number> {
    const aviso = componerAviso(estado, informe);
    if (!aviso) return 0;

    const destinos = destinatariosDe(estado, participantes, actorEmail);
    if (!destinos.length) return 0;

    const enlace = `${this.baseDeLaApp()}${aviso.ruta}`;
    const cuerpo = `${aviso.cuerpo}\n\n${enlace}\n`;

    if (!this.transporte) {
      this.logger.log(
        `[sin correo] «${aviso.asunto}» a ${destinos.map((d) => d.email).join(', ')}`,
      );
      return destinos.length;
    }

    let enviados = 0;
    for (const destino of destinos) {
      try {
        await this.transporte.sendMail({
          from: this.remitente,
          to: destino.nombre ? `${destino.nombre} <${destino.email}>` : destino.email,
          subject: aviso.asunto,
          text: cuerpo,
        });
        enviados++;
      } catch (e: unknown) {
        // Uno a uno y no en copia: si un buzón rebota, los demás sí reciben.
        // Con un solo envío en copia, un correo mal escrito en el maestro deja
        // sin aviso a todo el equipo.
        this.logger.error(`No se pudo avisar a ${destino.email}: ${String(e)}`);
      }
    }

    return enviados;
  }

  private baseDeLaApp(): string {
    return (this.config.get('PUBLIC_APP_URL', { infer: true }) ?? '').replace(/\/+$/, '');
  }
}
