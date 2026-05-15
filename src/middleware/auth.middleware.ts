import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from './error.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    // Support token in Authorization header or query string (for Socket.io)
    const authHeader = req.headers.authorization;
    const queryToken = req.query.access_token as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

    if (!token) throw new UnauthorizedError('Token no proporcionado.');

    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new UnauthorizedError('Token inválido o expirado.'));
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Se requiere rol: ${roles.join(' o ')}.`));
    }
    next();
  };
}
