import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: number | string) {
    super(404, id !== undefined ? `${entity} con id '${id}' no encontrado.` : `${entity} no encontrado.`);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado.') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado.') {
    super(403, message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    type: 'https://tools.ietf.org/html/rfc7231#section-6.5.4',
    title: 'Not Found',
    status: 404,
    detail: `La ruta ${req.method} ${req.path} no existe.`,
  });
}

export const errorHandler = errorMiddleware;

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(`${req.method} ${req.path} — ${err.message}`, { stack: err.stack });

  if (err instanceof ZodError) {
    res.status(422).json({
      type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
      title: 'Validation Error',
      status: 422,
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      type: 'https://tools.ietf.org/html/rfc7231#section-6.5.1',
      title: err.name,
      status: err.statusCode,
      detail: err.message,
    });
    return;
  }

  res.status(500).json({
    type: 'https://tools.ietf.org/html/rfc7231#section-6.6.1',
    title: 'Server Error',
    status: 500,
    detail: env.isDev ? err.message : 'Ocurrió un error interno del servidor.',
  });
}
