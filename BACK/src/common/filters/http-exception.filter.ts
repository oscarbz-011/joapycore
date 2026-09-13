import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface MappedError {
  status: number;
  message: string;
  error: string;
}

// Errores de Prisma que son consecuencia esperable de datos concurrentes o
// inexistentes, no fallas del servidor: antes llegaban como 500 genérico.
// El mensaje es fijo a propósito — el meta de Prisma nombra tablas/columnas.
const PRISMA_ERRORS: Record<string, MappedError> = {
  // Unique constraint (ej. dos facturas o códigos emitidos a la vez)
  P2002: {
    status: HttpStatus.CONFLICT,
    message:
      'Ya existe un registro con esos datos. Actualizá la pantalla e intentá de nuevo.',
    error: 'Conflict',
  },
  // Foreign key: se referencia algo que no existe o se borra algo en uso
  P2003: {
    status: HttpStatus.CONFLICT,
    message:
      'La operación no se puede completar porque el registro está relacionado con otros datos.',
    error: 'Conflict',
  },
  // Registro requerido no encontrado (update/delete sobre algo que ya no está)
  P2025: {
    status: HttpStatus.NOT_FOUND,
    message: 'El registro no existe o ya fue modificado.',
    error: 'NotFound',
  },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.map(exception, request);

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private map(
    exception: unknown,
    request: Request,
  ): { status: number; message: string | string[]; error: string } {
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        message: this.extractHttpMessage(exception),
        error: exception.name,
      };
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      PRISMA_ERRORS[exception.code]
    ) {
      this.logger.warn(
        `Prisma ${exception.code} on ${request.method} ${request.url}: ${exception.message}`,
      );
      return PRISMA_ERRORS[exception.code];
    }

    // Non-HTTP exceptions (crashes, etc.) must never leak internal details
    // to the client — log them server-side only.
    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor. Intentá de nuevo más tarde.',
      error: 'InternalServerError',
    };
  }

  private extractHttpMessage(exception: HttpException): string | string[] {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null && 'message' in res) {
      return (res as { message: string | string[] }).message;
    }
    return exception.message;
  }
}
