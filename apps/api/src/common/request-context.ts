import { AsyncLocalStorage } from 'node:async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

/** Lo que se sabe de la petición en curso sin tener que pasarlo por parámetro. */
export interface ContextoDePeticion {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

const almacen = new AsyncLocalStorage<ContextoDePeticion>();

/**
 * IP y user-agent de la petición en curso.
 *
 * La auditoría los pide (§20) y llegan hasta el último servicio de la cadena.
 * Pasarlos por parámetro obligaría a añadir un argumento a una veintena de
 * métodos de dominio que no tienen nada que ver con HTTP, y el primero que se
 * olvidara dejaría registros sin origen sin que nada fallara.
 *
 * Fuera de una petición —una semilla, una tarea de cola— devuelve nulos, que es
 * la respuesta correcta: no hubo navegador.
 */
export function contextoActual(): ContextoDePeticion {
  return almacen.getStore() ?? { ip: null, userAgent: null };
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();

    const peticion = contexto.switchToHttp().getRequest<Request>();

    // Detrás de nginx y de Coolify, `req.ip` es la del proxy. La primera de
    // `x-forwarded-for` es la del cliente, que es la que interesa en un log de
    // auditoría; `trust proxy` en Express hace lo mismo pero solo si está
    // configurado, y aquí no puede depender de eso.
    const reenviada = peticion.headers['x-forwarded-for'];
    const ip =
      (typeof reenviada === 'string' ? reenviada.split(',')[0]?.trim() : reenviada?.[0]) ||
      peticion.ip ||
      null;

    return almacen.run({ ip, userAgent: peticion.headers['user-agent'] ?? null }, () =>
      siguiente.handle(),
    );
  }
}
