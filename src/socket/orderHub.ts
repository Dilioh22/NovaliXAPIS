import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { env } from '../config/env';

let io: SocketServer | null = null;

export function getIO(): SocketServer | null { return io; }

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: env.cors.origins, methods: ['GET', 'POST'] },
    path: '/hubs/orders',
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token ?? socket.handshake.query?.access_token as string;
      if (!token) return next(new Error('Token no proporcionado.'));
      const payload = verifyAccessToken(token as string);
      (socket as Socket & { user?: unknown }).user = payload;
      next();
    } catch {
      next(new Error('Token inválido.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as Socket & { user?: { role?: string; sub?: number } }).user;
    logger.info(`Socket conectado: ${socket.id} role=${user?.role}`);

    // Auto-join groups by role
    if (user?.role === 'Cocinero') socket.join('kitchen');
    if (user?.role === 'Cajero')   socket.join('cashier');
    if (user?.role === 'Mesero')   socket.join('waiter');
    socket.join('tables');

    socket.on('join:kitchen', () => socket.join('kitchen'));
    socket.on('join:cashier', () => socket.join('cashier'));

    socket.on('disconnect', () => logger.info(`Socket desconectado: ${socket.id}`));
  });

  return io;
}
