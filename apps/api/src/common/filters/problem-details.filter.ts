import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  /** Miembros de extensión: RFC 7807 §3.2 los admite explícitamente. */
  [extension: string]: unknown;
}

/** Claves que ya tienen su sitio en el problema y no se copian como extensión. */
const CLAVES_PROPIAS = new Set(['message', 'error', 'statusCode']);

const TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto',
  412: 'Precondición fallida',
  422: 'Entidad no procesable',
  423: 'Cuenta bloqueada',
  429: 'Demasiadas solicitudes',
  500: 'Error interno del servidor',
};

/**
 * Convierte cualquier excepción al formato RFC 7807 (`application/problem+json`),
 * que es lo que el frontend espera (§17).
 *
 * En producción no se filtra el mensaje interno de un 500: se registra completo
 * en el log y al cliente solo le llega un texto genérico.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? 'Error',
      status,
      instance: request.url,
    };

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        problem.detail = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        if (typeof record['message'] === 'string') {
          problem.detail = record['message'];
        } else if (Array.isArray(record['message'])) {
          // Salida de ValidationPipe: se agrupa por campo para que el frontend
          // pueda pintar cada error junto a su input (UX-07).
          problem.detail = 'Revisa los campos marcados.';
          problem.errors = groupValidationMessages(record['message'] as string[]);
        }
        if (typeof record['error'] === 'string' && !problem.detail) {
          problem.detail = record['error'];
        }

        // Todo lo demás pasa tal cual. Sin esto, un error que además del texto
        // trae datos estructurados —la lista de campos que faltan para emitir,
        // por ejemplo— llegaría al frontend convertido en una frase suelta, y
        // el aviso navegable por clic de UX-07 sería imposible de pintar.
        for (const [clave, valor] of Object.entries(record)) {
          if (CLAVES_PROPIAS.has(clave) || clave in problem) continue;
          problem[clave] = valor;
        }
      }
    } else {
      this.logger.error(
        `Excepción no controlada en ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      problem.detail = 'Ocurrió un error inesperado. El incidente quedó registrado.';
    }

    response.status(status).type('application/problem+json').send(problem);
  }
}

/** `"email must be an email"` → `{ email: ["email must be an email"] }` */
function groupValidationMessages(messages: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const message of messages) {
    const field = message.split(' ')[0] ?? '_';
    (grouped[field] ??= []).push(message);
  }
  return grouped;
}
